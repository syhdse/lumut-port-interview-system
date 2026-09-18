import base64
import binascii
import os
from dotenv import load_dotenv
from datetime import datetime
from pathlib import Path
from typing import Optional

import psycopg
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


# Load environment variables from .env
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
    allow_origins=[
        o.strip()
        for o in os.getenv(
            "FRONTEND_ORIGINS",
            "http://localhost:3000"
        ).split(",")
        if o.strip()
    ],
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
            n = int(row[0].split("-")[1])
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
            detail="Please select a score from 1 to 5 for all criteria."
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

        if old_name:
            p = SIGNATURE_DIR / old_name

            if p.exists():
                p.unlink()

        return None

    # Only accept PNG data URLs
    if not data.startswith(
        "data:image/png;base64,"
    ):
        return old_name

    try:
        raw = base64.b64decode(
            data.split(",", 1)[1],
            validate=True
        )

    except (ValueError, binascii.Error):
        return old_name

    filename = f"{evaluation_id}.png"

    (
        SIGNATURE_DIR / filename
    ).write_bytes(raw)

    # Delete old signature if different
    if old_name and old_name != filename:

        p = SIGNATURE_DIR / old_name

        if p.exists():
            p.unlink()

    return filename


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
        c.execute("SELECT 1")

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
def list_evaluations():

    with conn() as c:

        # IMPORTANT:
        # c.execute() returns a Cursor.
        # description belongs to the Cursor, not Connection.
        cur = c.execute(
            """
            SELECT *
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
            dict(zip(cols, r))
        )
        for r in rows
    ]


# ============================================================
# GET ONE EVALUATION
# ============================================================

@app.get(
    "/api/evaluations/{evaluation_id}",
    response_model=EvaluationOut
)
def get_evaluation(evaluation_id: str):

    with conn() as c:

        cur = c.execute(
            """
            SELECT *
            FROM interview_evaluations
            WHERE evaluation_id=%s
            """,
            (evaluation_id,)
        )

        r = cur.fetchone()

        cols = [
            d.name
            for d in cur.description
        ]

    if not r:
        raise HTTPException(
            status_code=404,
            detail="Record not found."
        )

    return serialize(
        dict(zip(cols, r))
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

    with conn() as c:

        evaluation_id = next_id(c)

        sig = save_signature(
            evaluation_id,
            data.interviewer_signature
        )

        main_total = sum(main)

        hse_total = sum(hse)

        grand_total = (
            main_total + hse_total
        )

        c.execute(
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
                interviewer_designation
            )
            VALUES
            (
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s
            )
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
                data.interviewer_designation
            )
        )

    return get_evaluation(
        evaluation_id
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

    with conn() as c:

        old = c.execute(
            """
            SELECT interviewer_signature
            FROM interview_evaluations
            WHERE evaluation_id=%s
            """,
            (evaluation_id,)
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

        main_total = sum(main)

        hse_total = sum(hse)

        grand_total = (
            main_total + hse_total
        )

        c.execute(
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

    return get_evaluation(
        evaluation_id
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

    with conn() as c:

        old = c.execute(
            """
            DELETE FROM interview_evaluations
            WHERE evaluation_id=%s
            RETURNING interviewer_signature
            """,
            (evaluation_id,)
        ).fetchone()

    if not old:
        raise HTTPException(
            status_code=404,
            detail="Record not found."
        )

    # Delete signature file
    if old[0]:

        p = SIGNATURE_DIR / old[0]

        if p.exists():
            p.unlink()

    return {
        "message":
        f"Record {evaluation_id} deleted successfully."
    }


# ============================================================
# SERIALIZE DATABASE RECORD
# ============================================================

def serialize(d):

    return {
        "evaluation_id":
            d["evaluation_id"],

        "candidate_name":
            d["candidate_name"],

        "applied_position":
            d["applied_position"],

        "date_of_interview":
            str(d["date_of_interview"]),

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

        # Do not return the base64 signature
        "interviewer_signature":
            None,

        "interviewer_designation":
            d["interviewer_designation"],

        "submitted_at":
            d["submitted_at"],

        "signature_url":
            (
                f"/api/signatures/"
                f"{d['interviewer_signature']}"
                if d["interviewer_signature"]
                else None
            )
    }


# ============================================================
# SERVE DIGITAL SIGNATURE
# ============================================================

@app.get(
    "/api/signatures/{filename}"
)
def signature(filename: str):

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