import os
from datetime import datetime
from pathlib import Path
from typing import Optional

import psycopg
from config import ALLOWED_ORIGINS
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
    allow_headers=["*"]
)


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

def conn():
    """
    Create PostgreSQL connection.

    For Vercel + Neon, keep the connection usage short.
    Every endpoint opens the connection only while it is needed.
    """
    return psycopg.connect(DATABASE_URL)


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
    created_by: str | None = None
):

    """
    Dashboard endpoint.

    IMPORTANT:
    interviewer_signature is intentionally NOT
    downloaded here.

    Signature base64 can be large and was one of
    the main reasons dashboard loading was slow.
    """

    with conn() as c:

        if created_by:

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
                    created_by,
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
    evaluation_id: str
):

    """
    View/Edit endpoint.

    Signature is loaded here because View/Edit
    needs the signature.
    """

    with conn() as c:

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
    data: EvaluationIn
):

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

                data.created_by
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
    data: EvaluationIn
):

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
    evaluation_id: str
):

    """
    Delete directly from PostgreSQL.

    Current signatures are stored as base64
    inside PostgreSQL, therefore no local
    signature file needs to be deleted.
    """

    with conn() as c:

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