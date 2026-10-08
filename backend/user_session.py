import hashlib
import secrets

from fastapi import APIRouter, HTTPException, Request, Response

router = APIRouter(prefix="/api/user", tags=["User Session"])

USER_COOKIE = "lumut_user_session"
SESSION_DAYS = 365
MAX_AGE = SESSION_DAYS * 24 * 60 * 60


def get_user_id(request: Request) -> str | None:
    token = request.cookies.get(USER_COOKIE)

    if not token:
        return None

    # Token must be a valid 64-character hexadecimal string.
    if len(token) != 64:
        return None

    try:
        bytes.fromhex(token)
    except ValueError:
        return None

    return "USER-" + hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def require_user(request: Request) -> str:
    user_id = get_user_id(request)

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="User session required.",
        )

    return user_id


@router.post("/session")
def create_user_session(
    request: Request,
    response: Response,
):
    user_id = get_user_id(request)

    if user_id:
        return {
            "message": "User session active.",
            "user_id": user_id,
        }

    token = secrets.token_hex(32)

    user_id = "USER-" + hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()

    # HTTPS production uses Secure + SameSite=None.
    # Local HTTP development uses SameSite=Lax.
    is_local = request.url.hostname in {
        "localhost",
        "127.0.0.1",
    }

    response.set_cookie(
        key=USER_COOKIE,
        value=token,
        httponly=True,
        secure=not is_local,
        samesite="lax" if is_local else "none",
        max_age=MAX_AGE,
        path="/",
    )

    return {
        "message": "User session created.",
        "user_id": user_id,
    }


@router.get("/session")
def check_user_session(request: Request):
    return {
        "active": get_user_id(request) is not None,
    }