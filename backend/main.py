import os
from datetime import datetime, date
from pathlib import Path
from io import BytesIO
import re
from typing import Optional

from auth import router as admin_router, create_admin_tables, current_admin
from user_session import router as user_router, require_user


import psycopg
from psycopg_pool import ConnectionPool
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from config import ALLOWED_ORIGINS
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/lumut_port"
)

BASE_DIR = Path(__file__).resolve().parent
SIGNATURE_DIR = BASE_DIR / "signatures"
SIGNATURE_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================
# CRITERIA
# ============================================================

MAIN_CRITERIA = [
    "Appearance",
    "Working Experience",
    "Communication Skills",
    "Mental Alertness",
    "Expression of Ideas",
    "Scholastic Achievement",
    "Initiative",
    "Determination",
    "Personality",
    "Confidence"
]

HSE_CRITERIA = [
    "General HSE Knowledge",
    "HSE Experience"
]


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="Lumut Port Interview Evaluation API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],


)

app.include_router(admin_router)
app.include_router(user_router)

def access_identity(request: Request, mode: str) -> str | None:
    """Admin: verified DB session; User: cookie-derived identity."""
    if mode == "admin":
        current_admin(request)
        return None
    return require_user(request)


def require_record_owner(c, evaluation_id: str, owner: str | None):
    """404 for missing or inaccessible records; admins bypass owner check."""
    row = c.execute(
        "SELECT created_by FROM interview_evaluations WHERE evaluation_id=%s",
        (evaluation_id,),
    ).fetchone()
    if row is None or (owner is not None and row[0] != owner):
        raise HTTPException(status_code=404, detail="Record not found.")


# ============================================================
# PYDANTIC MODELS
# ============================================================

class EvaluationIn(BaseModel):
    candidate_name: str = Field(min_length=1)
    applied_position: str = Field(min_length=1)
    date_of_interview: str = Field(min_length=1)

    # Keep for future user ownership feature.
    # Not changing ownership logic yet.
    created_by: str | None = None

    scores: dict[str, int]

    overall_evaluation: str
    overall_comment: str = ""

    relationship_declaration: str = ""

    conflict_of_interest: str = "No"
    fair_process_declaration: str = "No"

    recommendation: str

    interviewer_name: str = Field(min_length=1)
    interviewer_designation: str = Field(min_length=1)

    interviewer_signature: Optional[str] = None


class EvaluationOut(EvaluationIn):
    evaluation_id: str

    main_total: int
    hse_total: int
    grand_total: int

    signature_url: Optional[str] = None

    submitted_at: datetime


# ============================================================
# DATABASE CONNECTION
# ============================================================

# Pool is scoped to each warm Vercel Function instance (not shared globally).
# min_size=0 avoids eagerly creating connections during import.
_db_pool = ConnectionPool(
    conninfo=DATABASE_URL,
    min_size=0,
    max_size=int(os.getenv("DB_POOL_MAX_SIZE", "3")),
    timeout=8,
    max_idle=60,
    kwargs={"connect_timeout": 5},
    open=False,
)


def conn():
    """Borrow a PostgreSQL connection and return it automatically on exit."""
    if _db_pool.closed:
        _db_pool.open()
    return _db_pool.connection()


# ============================================================
# INITIALIZE DATABASE
# ============================================================

def init_db():

    with conn() as c:

        c.execute(
            """
            CREATE TABLE IF NOT EXISTS interview_evaluations (
                evaluation_id VARCHAR(20) PRIMARY KEY,
                candidate_name TEXT NOT NULL,
                applied_position TEXT NOT NULL,
                date_of_interview DATE NOT NULL,
                scores JSONB NOT NULL,
                main_total INTEGER NOT NULL,
                hse_total INTEGER NOT NULL,
                grand_total INTEGER NOT NULL,
                overall_evaluation TEXT NOT NULL,
                overall_comment TEXT DEFAULT '',
                relationship_declaration TEXT DEFAULT '',
                conflict_of_interest TEXT DEFAULT 'No',
                fair_process_declaration TEXT DEFAULT 'No',
                recommendation TEXT NOT NULL,
                interviewer_name TEXT NOT NULL,
                interviewer_signature TEXT,
                interviewer_designation TEXT NOT NULL,
                submitted_at TIMESTAMP NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        c.execute(
            """
            ALTER TABLE interview_evaluations
            ADD COLUMN IF NOT EXISTS created_by TEXT;
            """
        )

# ============================================================
# GENERATE NEXT EVALUATION ID
# ============================================================

def next_id(c):

    row = c.execute(
        """
        SELECT evaluation_id
        FROM interview_evaluations
        ORDER BY evaluation_id DESC
        LIMIT 1
        """
    ).fetchone()

    n = 0

    if row and row[0].startswith("INT-"):

        try:
            n = int(
                row[0].split("-")[1]
            )

        except ValueError:
            pass

    return f"INT-{n + 1:04d}"


# ============================================================
# VALIDATE SCORES
# ============================================================

def validate_scores(scores):

    required = MAIN_CRITERIA + HSE_CRITERIA

    missing = [
        x
        for x in required
        if x not in scores
    ]

    invalid = [
        x
        for x in required
        if x in scores
        and not 1 <= int(scores[x]) <= 5
    ]

    if missing or invalid:

        raise HTTPException(
            status_code=400,
            detail=(
                "Please select a score from "
                "1 to 5 for all criteria."
            )
        )

    main_scores = [
        int(scores[x])
        for x in MAIN_CRITERIA
    ]

    hse_scores = [
        int(scores[x])
        for x in HSE_CRITERIA
    ]

    return main_scores, hse_scores


# ============================================================
# SAVE DIGITAL SIGNATURE
# ============================================================

def save_signature(
    evaluation_id,
    data,
    old_name=None
):

    # No new signature submitted
    if not data:
        return old_name

    # Clear existing signature
    if data == "CLEAR":
        return None

    # Only accept PNG data URL
    if not data.startswith(
        "data:image/png;base64,"
    ):
        return old_name

    # Signature is currently stored directly
    # inside PostgreSQL / Neon.
    return data


# ============================================================
# SERIALIZE DATABASE RECORD
# ============================================================

def serialize(
    d,
    include_signature=False
):

    signature_data = None

    signature = d.get(
        "interviewer_signature"
    )

    if include_signature and signature:

        if signature.startswith(
            "data:image/png;base64,"
        ):
            signature_data = signature

        else:
            signature_data = (
                f"/api/signatures/{signature}"
            )

    return {
        "evaluation_id":
            d["evaluation_id"],

        "candidate_name":
            d["candidate_name"],

        "applied_position":
            d["applied_position"],

        "date_of_interview":
            str(d["date_of_interview"]),

        "created_by":
            d.get("created_by"),

        "scores":
            d["scores"],

        "main_total":
            d["main_total"],

        "hse_total":
            d["hse_total"],

        "grand_total":
            d["grand_total"],

        "overall_evaluation":
            d["overall_evaluation"],

        "overall_comment":
            d["overall_comment"] or "",

        "relationship_declaration":
            d["relationship_declaration"] or "",

        "conflict_of_interest":
            d["conflict_of_interest"],

        "fair_process_declaration":
            d["fair_process_declaration"],

        "recommendation":
            d["recommendation"],

        "interviewer_name":
            d["interviewer_name"],

        # Do not send raw base64 separately.
        "interviewer_signature":
            None,

        "interviewer_designation":
            d["interviewer_designation"],

        "submitted_at":
            d["submitted_at"],

        "signature_url":
            signature_data,
    }


# ============================================================
# CONVERT DATABASE CURSOR ROW TO DICT
# ============================================================

def row_to_dict(cur, row):

    if not row:
        return None

    cols = [
        d.name
        for d in cur.description
    ]

    return dict(
        zip(cols, row)
    )


# ============================================================
# STARTUP
# ============================================================


@app.on_event("startup")
def startup():
    init_db()
    create_admin_tables()



# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/api/health")
def health():

    with conn() as c:

        c.execute(
            "SELECT 1"
        )

    return {
        "status": "ok"
    }


# ============================================================
# GET ALL EVALUATIONS
# ============================================================

@app.get(
    "/api/evaluations",
    response_model=list[EvaluationOut]
)
def list_evaluations(
    request: Request,
    mode: str = Query(..., pattern="^(user|admin)$"),
):

    """
    Dashboard endpoint.

    IMPORTANT:
    interviewer_signature is intentionally NOT
    downloaded here.

    Signature base64 can be large and was one of
    the main reasons dashboard loading was slow.
    """

    owner = access_identity(request, mode)
    with conn() as c:

        if owner is not None:

            cur = c.execute(
                """
                SELECT
                    evaluation_id,
                    candidate_name,
                    applied_position,
                    date_of_interview,
                    created_by,
                    scores,
                    main_total,
                    hse_total,
                    grand_total,
                    overall_evaluation,
                    overall_comment,
                    relationship_declaration,
                    conflict_of_interest,
                    fair_process_declaration,
                    recommendation,
                    interviewer_name,
                    interviewer_designation,
                    submitted_at,

                    NULL::TEXT
                        AS interviewer_signature

                FROM interview_evaluations

                WHERE created_by=%s

                ORDER BY submitted_at DESC
                """,
                (
                    owner,
                )
            )

        else:

            cur = c.execute(
                """
                SELECT
                    evaluation_id,
                    candidate_name,
                    applied_position,
                    date_of_interview,
                    created_by,
                    scores,
                    main_total,
                    hse_total,
                    grand_total,
                    overall_evaluation,
                    overall_comment,
                    relationship_declaration,
                    conflict_of_interest,
                    fair_process_declaration,
                    recommendation,
                    interviewer_name,
                    interviewer_designation,
                    submitted_at,

                    NULL::TEXT
                        AS interviewer_signature

                FROM interview_evaluations

                ORDER BY submitted_at DESC
                """
            )

        rows = cur.fetchall()

        cols = [
            d.name
            for d in cur.description
        ]

    return [
        serialize(
            dict(
                zip(cols, row)
            ),
            include_signature=False
        )
        for row in rows
    ]


# ============================================================
# GET ONE EVALUATION
# ============================================================

@app.get(
    "/api/evaluations/{evaluation_id}",
    response_model=EvaluationOut
)
def get_evaluation(
    evaluation_id: str,
    request: Request,
    mode: str = Query(..., pattern="^(user|admin)$"),
):

    """
    View/Edit endpoint.

    Signature is loaded here because View/Edit
    needs the signature.
    """

    owner = access_identity(request, mode)
    with conn() as c:
        require_record_owner(c, evaluation_id, owner)
        cur = c.execute(
            """
            SELECT *
            FROM interview_evaluations
            WHERE evaluation_id=%s
            """,
            (
                evaluation_id,
            )
        )

        row = cur.fetchone()

        record = row_to_dict(
            cur,
            row
        )

    if not record:

        raise HTTPException(
            status_code=404,
            detail="Record not found."
        )

    return serialize(
        record,
        include_signature=True
    )


# ============================================================
# CREATE EVALUATION
# ============================================================

@app.post(
    "/api/evaluations",
    response_model=EvaluationOut,
    status_code=201
)
def create_evaluation(
    data: EvaluationIn,
    request: Request,
    mode: str = Query(..., pattern="^(user|admin)$"),
):

    owner = access_identity(request, mode)
    main, hse = validate_scores(
        data.scores
    )

    main_total = sum(main)

    hse_total = sum(hse)

    grand_total = (
        main_total +
        hse_total
    )

    with conn() as c:

        evaluation_id = next_id(c)

        sig = save_signature(
            evaluation_id,
            data.interviewer_signature
        )

        cur = c.execute(
            """
            INSERT INTO interview_evaluations
            (
                evaluation_id,
                candidate_name,
                applied_position,
                date_of_interview,
                scores,
                main_total,
                hse_total,
                grand_total,
                overall_evaluation,
                overall_comment,
                relationship_declaration,
                conflict_of_interest,
                fair_process_declaration,
                recommendation,
                interviewer_name,
                interviewer_signature,
                interviewer_designation,
                created_by
            )

            VALUES
            (
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s
            )

            RETURNING *
            """,
            (
                evaluation_id,

                data.candidate_name,

                data.applied_position,

                data.date_of_interview,

                psycopg.types.json.Json(
                    data.scores
                ),

                main_total,

                hse_total,

                grand_total,

                data.overall_evaluation,

                data.overall_comment,

                data.relationship_declaration,

                data.conflict_of_interest,

                data.fair_process_declaration,

                data.recommendation,

                data.interviewer_name,

                sig,

                data.interviewer_designation,

                owner
            )
        )

        row = cur.fetchone()

        record = row_to_dict(
            cur,
            row
        )

    if not record:

        raise HTTPException(
            status_code=500,
            detail=(
                "Evaluation was created but "
                "could not be returned."
            )
        )

    # No second database connection needed.
    return serialize(
        record,
        include_signature=True
    )


# ============================================================
# UPDATE EVALUATION
# ============================================================

@app.put(
    "/api/evaluations/{evaluation_id}",
    response_model=EvaluationOut
)
def update_evaluation(
    evaluation_id: str,
    data: EvaluationIn,
    request: Request,
    mode: str = Query(..., pattern="^(user|admin)$"),
):

    owner = access_identity(request, mode)
    main, hse = validate_scores(
        data.scores
    )

    main_total = sum(main)

    hse_total = sum(hse)

    grand_total = (
        main_total +
        hse_total
    )

    with conn() as c:
        require_record_owner(c, evaluation_id, owner)
        old = c.execute(
            """
            SELECT interviewer_signature
            FROM interview_evaluations
            WHERE evaluation_id=%s
            """,
            (
                evaluation_id,
            )
        ).fetchone()

        if not old:

            raise HTTPException(
                status_code=404,
                detail="Record not found."
            )

        sig = save_signature(
            evaluation_id,
            data.interviewer_signature,
            old[0]
        )

        cur = c.execute(
            """
            UPDATE interview_evaluations

            SET
                candidate_name=%s,
                applied_position=%s,
                date_of_interview=%s,
                scores=%s,
                main_total=%s,
                hse_total=%s,
                grand_total=%s,
                overall_evaluation=%s,
                overall_comment=%s,
                relationship_declaration=%s,
                conflict_of_interest=%s,
                fair_process_declaration=%s,
                recommendation=%s,
                interviewer_name=%s,
                interviewer_signature=%s,
                interviewer_designation=%s

            WHERE evaluation_id=%s

            RETURNING *
            """,
            (
                data.candidate_name,

                data.applied_position,

                data.date_of_interview,

                psycopg.types.json.Json(
                    data.scores
                ),

                main_total,

                hse_total,

                grand_total,

                data.overall_evaluation,

                data.overall_comment,

                data.relationship_declaration,

                data.conflict_of_interest,

                data.fair_process_declaration,

                data.recommendation,

                data.interviewer_name,

                sig,

                data.interviewer_designation,

                evaluation_id
            )
        )

        row = cur.fetchone()

        record = row_to_dict(
            cur,
            row
        )

    if not record:

        raise HTTPException(
            status_code=404,
            detail="Record not found."
        )

    # No second get_evaluation() database call.
    return serialize(
        record,
        include_signature=True
    )


# ============================================================
# DELETE EVALUATION
# ============================================================

@app.delete(
    "/api/evaluations/{evaluation_id}"
)
def delete_evaluation(
    evaluation_id: str,
    request: Request,
    mode: str = Query(..., pattern="^(user|admin)$"),
):

    """
    Delete directly from PostgreSQL.

    Current signatures are stored as base64
    inside PostgreSQL, therefore no local
    signature file needs to be deleted.
    """

    owner = access_identity(request, mode)
    with conn() as c:
        require_record_owner(c, evaluation_id, owner)
        deleted = c.execute(
            """
            DELETE FROM interview_evaluations
            WHERE evaluation_id=%s
            RETURNING evaluation_id
            """,
            (
                evaluation_id,
            )
        ).fetchone()

    if not deleted:

        raise HTTPException(
            status_code=404,
            detail="Record not found."
        )

    return {
        "message":
            f"Record {evaluation_id} "
            "deleted successfully."
    }


# ============================================================
# SERVE LEGACY DIGITAL SIGNATURE FILE
# ============================================================

@app.get(
    "/api/signatures/{filename}"
)
def signature(
    filename: str
):

    """
    Kept for compatibility with older records
    that may still reference signature files.
    """

    p = SIGNATURE_DIR / filename

    if not p.exists():

        raise HTTPException(
            status_code=404,
            detail="Signature not found."
        )

    return FileResponse(
        p,
        media_type="image/png"
    )

# ============================================================
# ADMIN-ONLY EXCEL IMPORT / EXPORT
# ============================================================

EXCEL_FIELDS = [
    "Evaluation ID", "Candidate Name", "Applied Position", "Date of Interview",
    *MAIN_CRITERIA, *HSE_CRITERIA,
    "Main Total", "HSE Total", "Grand Total", "Overall Evaluation",
    "Overall Comment", "Relationship Declaration", "Conflict of Interest",
    "Fair Process Declaration", "Recommendation", "Interviewer Name",
    "Interviewer Designation", "Created By", "Submitted At",
]


def excel_cell(value):
    """Avoid Excel formula execution when exporting user-entered text."""
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


@app.get("/api/admin/evaluations/export")
def export_evaluations_excel(request: Request):
    current_admin(request)
    with conn() as c:
        cur = c.execute("SELECT * FROM interview_evaluations ORDER BY evaluation_id")
        rows = [row_to_dict(cur, row) for row in cur.fetchall()]

    wb = Workbook()
    ws = wb.active
    ws.title = "Interview Evaluations"
    ws.append(EXCEL_FIELDS)
    for record in rows:
        scores = record.get("scores") or {}
        values = [
            record["evaluation_id"], record["candidate_name"],
            record["applied_position"], record["date_of_interview"],
            *(scores.get(k) for k in MAIN_CRITERIA + HSE_CRITERIA),
            record["main_total"], record["hse_total"], record["grand_total"],
            record["overall_evaluation"], record.get("overall_comment"),
            record.get("relationship_declaration"), record.get("conflict_of_interest"),
            record.get("fair_process_declaration"), record["recommendation"],
            record["interviewer_name"], record["interviewer_designation"],
            record.get("created_by"), record.get("submitted_at"),
        ]
        ws.append([excel_cell(v) for v in values])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="203047")
        cell.alignment = Alignment(wrap_text=True)
    ws.freeze_panes = "D2"
    ws.auto_filter.ref = ws.dimensions
    for index, heading in enumerate(EXCEL_FIELDS, 1):
        ws.column_dimensions[get_column_letter(index)].width = min(max(len(heading) + 3, 14), 34)
    date_col = EXCEL_FIELDS.index("Date of Interview") + 1
    for row in ws.iter_rows(min_row=2):
        row[date_col - 1].number_format = "yyyy-mm-dd"

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"lumut_interview_evaluations_{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"',
                 "Cache-Control": "no-store"},
    )


@app.post("/api/admin/evaluations/import")
async def import_evaluations_excel(request: Request, file: UploadFile = File(...)):
    current_admin(request)
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(400, "Please upload an .xlsx file.")
    contents = await file.read(5 * 1024 * 1024 + 1)
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(413, "Excel file exceeds the 5 MB limit.")
    try:
        wb = load_workbook(BytesIO(contents), read_only=True, data_only=False)
        ws = wb.active
        iterator = ws.iter_rows(values_only=True)
        header_row = next(iterator, None)
        if not header_row:
            raise ValueError("Excel sheet is empty.")
        headings = [str(x).strip() if x is not None else "" for x in header_row]
        if len(headings) != len(set(headings)):
            raise ValueError("Duplicate column headers found.")
        required = ["Candidate Name", "Applied Position", "Date of Interview",
                    *MAIN_CRITERIA, *HSE_CRITERIA, "Overall Evaluation",
                    "Recommendation", "Interviewer Name", "Interviewer Designation"]
        missing = [name for name in required if name not in headings]
        if missing:
            raise ValueError("Missing columns: " + ", ".join(missing))
        positions = {name: i for i, name in enumerate(headings)}
    except Exception as exc:
        raise HTTPException(400, f"Invalid Excel workbook: {exc}") from exc

    imported, skipped, errors = 0, 0, []
    try:
        with conn() as c:
            # Serialize ID generation against other imports and normal creates.
            c.execute("SELECT pg_advisory_xact_lock(67389231)")
            for row_number, cells in enumerate(iterator, 2):
                if not any(value is not None and str(value).strip() for value in cells):
                    continue
                if imported + skipped + len(errors) >= 1000:
                    errors.append("Limit of 1,000 rows per import reached.")
                    break
                def value(name, default=""):
                    idx = positions.get(name)
                    result = cells[idx] if idx is not None and idx < len(cells) else None
                    if isinstance(result, str) and result.startswith("'") and result[1:2] in ("=", "+", "-", "@"):
                        result = result[1:]
                    if isinstance(result, str) and result.startswith("="):
                        raise ValueError(f"Formula not allowed in {name}")
                    return default if result is None else result

                try:
                    candidate = str(value("Candidate Name")).strip()
                    position = str(value("Applied Position")).strip()
                    interviewer = str(value("Interviewer Name")).strip()
                    designation = str(value("Interviewer Designation")).strip()
                    overall = str(value("Overall Evaluation")).strip()
                    recommendation = str(value("Recommendation")).strip()
                    if not all((candidate, position, interviewer, designation, overall, recommendation)):
                        raise ValueError("Required text fields cannot be blank")
                    raw_date = value("Date of Interview")
                    if isinstance(raw_date, datetime):
                        interview_date = raw_date.date()
                    elif isinstance(raw_date, date):
                        interview_date = raw_date
                    else:
                        interview_date = date.fromisoformat(str(raw_date).strip()[:10])
                    scores = {}
                    for criterion in MAIN_CRITERIA + HSE_CRITERIA:
                        raw = value(criterion)
                        if isinstance(raw, bool) or str(raw).strip() not in ("1", "2", "3", "4", "5"):
                            raise ValueError(f"{criterion} must be an integer from 1 to 5")
                        scores[criterion] = int(raw)
                    main_total = sum(scores[k] for k in MAIN_CRITERIA)
                    hse_total = sum(scores[k] for k in HSE_CRITERIA)
                    raw_id = str(value("Evaluation ID")).strip()
                    if raw_id and not re.fullmatch(r"INT-\d{4,}", raw_id):
                        raise ValueError("Evaluation ID must be like INT-0001, or blank")
                    if raw_id and c.execute(
                        "SELECT 1 FROM interview_evaluations WHERE evaluation_id=%s", (raw_id,)
                    ).fetchone():
                        skipped += 1
                        continue
                    evaluation_id = raw_id or next_id(c)
                    # An import is an Admin action; retain original ownership only when supplied.
                    created_by = str(value("Created By")).strip() or None
                    c.execute("SAVEPOINT import_row")
                    try:
                        c.execute("""
                            INSERT INTO interview_evaluations (
                                evaluation_id, candidate_name, applied_position, date_of_interview,
                                scores, main_total, hse_total, grand_total, overall_evaluation,
                                overall_comment, relationship_declaration, conflict_of_interest,
                                fair_process_declaration, recommendation, interviewer_name,
                                interviewer_designation, created_by
                            ) VALUES (
                                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
                            )
                        """, (
                            evaluation_id, candidate, position, interview_date,
                            psycopg.types.json.Json(scores), main_total, hse_total,
                            main_total + hse_total, overall,
                            str(value("Overall Comment")), str(value("Relationship Declaration")),
                            str(value("Conflict of Interest", "No")),
                            str(value("Fair Process Declaration", "No")), recommendation,
                            interviewer, designation, created_by,
                        ))
                        c.execute("RELEASE SAVEPOINT import_row")
                        imported += 1
                    except Exception:
                        c.execute("ROLLBACK TO SAVEPOINT import_row")
                        c.execute("RELEASE SAVEPOINT import_row")
                        raise
                except Exception as exc:
                    skipped += 1
                    if len(errors) < 30:
                        errors.append(f"Row {row_number}: {str(exc)[:180]}")
    finally:
        wb.close()
    return {"imported": imported, "skipped": skipped, "errors": errors}
