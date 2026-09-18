# Lumut Port Interview Evaluation System — Next.js + FastAPI + PostgreSQL

Migrated from the original Flask + Excel project.

## Stack
- Frontend: Next.js + TypeScript/React
- Backend: FastAPI + Python
- Database: PostgreSQL
- CI/CD: GitHub Actions
- Platform: Vercel (frontend)

## Local setup
### PostgreSQL
Create a database named `lumot_port` (or use the name in `DATABASE_URL`).

### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```
Open http://localhost:3000.

## Environment variables
Backend:
`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lumut_port`
`FRONTEND_ORIGINS=http://localhost:3000`

Frontend:
`NEXT_PUBLIC_API_URL=http://localhost:8000`

## Deployment
Deploy the `frontend` directory to Vercel. Deploy the FastAPI backend and PostgreSQL on services that support Python and PostgreSQL, then set the frontend `NEXT_PUBLIC_API_URL` to the deployed API URL and backend `FRONTEND_ORIGINS` to the Vercel URL.
