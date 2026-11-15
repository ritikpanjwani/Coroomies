# CoRoomies

CoRoomies is a roommate/household management web app: accounts and profiles,
roommate matching, groups, messaging, shared expenses, chores and recurring
schedules, notifications, and listings.

- Backend: FastAPI + psycopg 3 + PostgreSQL, migrations via Alembic
- Frontend: React 19 + Vite + Tailwind CSS
- Local process management: PM2 (development only)

## Repository layout

```
backend/                  FastAPI application, Alembic migrations, tests scripts
frontend/                 React/Vite application
ecosystem.config.cjs      Development PM2 config (Vite dev server + tunnels)
ecosystem.production.config.cjs  Production backend PM2 config
DEPLOYMENT.md             Production deployment runbook
```

## Local development (Windows)

1. Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env for local development:
#   ENVIRONMENT=development
#   DEV_MODE=true                 (logs reset codes to the server console)
#   DATABASE_URL=postgresql://postgres:<password>@localhost:5432/coroomies
#   JWT_SECRET_KEY=<at least 32 random characters>
#   CORS_ORIGINS=http://localhost:5173
#   CORS_ALLOW_TUNNELS=true       (only if using a Cloudflare Quick Tunnel)
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

2. Frontend

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
# Set VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

Alternatively, start the development stack with `start.bat` or
`pm2 start ecosystem.config.cjs`. Those files are development-only: they start
Vite's dev server and Cloudflare Quick Tunnels. Do not use them in production.

## Health checks

- `GET /health` - liveness, returns `{"status":"ok"}`
- `GET /health/ready` - readiness, checks the database with `SELECT 1`

## Useful commands

```powershell
# Backend syntax check
cd backend
.\venv\Scripts\python.exe -m compileall -q app

# Migration state
.\venv\Scripts\python.exe -m alembic current
.\venv\Scripts\python.exe -m alembic heads

# Frontend lint/build
cd frontend
npm run lint
npm run build
```

## Security notes

- Never commit `.env` files. They are ignored by git; `.env.example` files are
  templates only.
- On Windows, restrict `.env` ACLs to the service account and administrators.
  See `DEPLOYMENT.md` for the exact command. Linux: `chmod 600` and `chown`.
- Production builds require `VITE_API_URL` to be an absolute `https://` origin.
  The build fails for localhost, loopback, or Cloudflare Quick Tunnel URLs.
- Production requires an explicit `CORS_ORIGINS` list and a JWT secret of at
  least 32 characters. Quick Tunnel origins are never trusted in production.
- Reset/email-change codes are never returned by the API. In development they
  may be written to the server log when `DEV_MODE=true`; in production they are
  never logged.

## Production

Read `DEPLOYMENT.md`. It covers secrets, SMTP, CORS/TLS, migrations, PM2,
backups/restore, verification, and rollback.
