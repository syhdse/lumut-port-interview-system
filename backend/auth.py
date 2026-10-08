import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

router = APIRouter(prefix="/api/admin", tags=["Admin Authentication"])

SESSION_COOKIE = "lumut_admin_session"
SESSION_DAYS = 7


def cookie_options(request: Request):
    # Secure cookies for HTTPS deployment; localhost HTTP for local development.
    secure = request.url.scheme == "https" or os.getenv("COOKIE_SECURE", "").lower() == "true"
    return {"secure": secure, "samesite": "none" if secure else "lax"}



def get_connection():
    # Import here to avoid circular imports.
    from main import conn
    return conn()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    iterations = 600_000

    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )

    return f"pbkdf2_sha256${iterations}${salt.hex()}${key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_hex, hash_hex = stored.split("$")

        if algorithm != "pbkdf2_sha256":
            return False

        calculated = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )

        return hmac.compare_digest(calculated, bytes.fromhex(hash_hex))
    except (ValueError, TypeError):
        return False


def session_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AdminSignup(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    invitation_code: str = Field(min_length=1)


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


def create_admin_tables():
    with get_connection() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS admin_accounts (
                id BIGSERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)

        c.execute("""
            CREATE TABLE IF NOT EXISTS admin_sessions (
                token_hash VARCHAR(64) PRIMARY KEY,
                admin_id BIGINT NOT NULL
                    REFERENCES admin_accounts(id) ON DELETE CASCADE,
                expires_at TIMESTAMPTZ NOT NULL
            )
        """)


def current_admin(request: Request):
    token = request.cookies.get(SESSION_COOKIE)

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Admin login required.",
        )

    with get_connection() as c:
        row = c.execute("""
            SELECT a.id, a.name, a.email
            FROM admin_sessions s
            JOIN admin_accounts a ON a.id = s.admin_id
            WHERE s.token_hash = %s
              AND s.expires_at > NOW()
        """, (session_hash(token),)).fetchone()

    if not row:
        raise HTTPException(
            status_code=401,
            detail="Admin session expired or invalid.",
        )

    return {
        "id": row[0],
        "name": row[1],
        "email": row[2],
    }


@router.post("/signup", status_code=201)
def signup(data: AdminSignup):
    invitation_code = os.getenv("ADMIN_INVITATION_CODE", "")

    if not invitation_code:
        raise HTTPException(
            status_code=503,
            detail="Admin registration is not configured.",
        )

    if not hmac.compare_digest(
        data.invitation_code.encode("utf-8"),
        invitation_code.encode("utf-8"),
    ):
        raise HTTPException(
            status_code=403,
            detail="Invalid invitation code.",
        )

    email = str(data.email).strip().lower()
    name = data.name.strip()

    if len(name) < 2:
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid name.",
        )

    password_hash = hash_password(data.password)

    with get_connection() as c:
        existing = c.execute(
            "SELECT id FROM admin_accounts WHERE email = %s",
            (email,),
        ).fetchone()

        if existing:
            raise HTTPException(
                status_code=409,
                detail="Email already registered.",
            )

        c.execute("""
            INSERT INTO admin_accounts (name, email, password_hash)
            VALUES (%s, %s, %s)
        """, (name, email, password_hash))

    return {"message": "Admin account created successfully."}


@router.post("/login")
def login(data: AdminLogin, response: Response, request: Request):
    email = str(data.email).strip().lower()

    # Keep password verification and session insertion on one DB connection.
    with get_connection() as c:
        row = c.execute("""
            SELECT id, name, email, password_hash
            FROM admin_accounts
            WHERE email = %s
        """, (email,)).fetchone()

        if not row or not verify_password(data.password, row[3]):
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password.",
            )

        token = secrets.token_urlsafe(48)
        expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
        c.execute("""
            INSERT INTO admin_sessions (token_hash, admin_id, expires_at)
            VALUES (%s, %s, %s)
        """, (session_hash(token), row[0], expires_at))

    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        **cookie_options(request),
        max_age=SESSION_DAYS * 24 * 60 * 60,
        path="/",
    )

    return {
        "message": "Login successful.",
        "admin": {
            "id": row[0],
            "name": row[1],
            "email": row[2],
        },
    }


@router.get("/me")
def me(request: Request):
    return current_admin(request)


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)

    if token:
        with get_connection() as c:
            c.execute(
                "DELETE FROM admin_sessions WHERE token_hash = %s",
                (session_hash(token),),
            )

    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        **cookie_options(request),
        httponly=True,
    )

    return {"message": "Logged out successfully."}
