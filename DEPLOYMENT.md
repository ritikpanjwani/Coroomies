# CoRoomies Production Deployment Runbook

This runbook prepares CoRoomies for a production deployment. It does not
perform a public deployment and contains no real credentials. Replace every
placeholder before going live.

## Values you must provide

| Value | Placeholder | Notes |
|---|---|---|
| Public frontend origin | `https://app.example.com` | Used in `CORS_ORIGINS`; exact origin, no wildcard |
| Public API origin | `https://api.example.com` | Used in `VITE_API_URL`; must be HTTPS |
| JWT secret | `<generate>` | At least 32 random characters; never reuse dev secret |
| Database host/port | `<db-host>:5432` | Prefer a private network / TLS connection |
| Database name | `coroomies` | |
| Database user/password | `<db-user>` / `<db-password>` | Dedicated least-privilege role |
| SMTP host/port | `smtp.example.com:587` | Port 587 uses STARTTLS |
| SMTP user/password | `no-reply@example.com` / `<app-password>` | Provider app password, not a login password |
| DNS/TLS | - | Certificates and DNS for both origins |

Generate a JWT secret locally (do not paste it into source or chat):

```powershell
.\backend\venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

## 1. Production secrets and file permissions

1. Create `backend/.env` from `backend/.env.example` and fill in the production
   values. Keep `ENVIRONMENT=production`, `DEV_MODE=false`,
   `CORS_ALLOW_TUNNELS=false`, and an explicit `HSTS_ENABLED=true` only when
   the deployment is HTTPS-only.
2. Do not put secrets in `ecosystem.production.config.cjs`, the frontend, or
   any file tracked by git. The frontend only receives `VITE_API_URL`, which is
   public by design.
3. Restrict the backend environment file.

Windows (adjust the account if the service runs under another user):

```powershell
icacls "D:\CoRoomies project\backend\.env" /inheritance:r `
  /grant:r "$env:USERNAME:(F)" "SYSTEM:(F)" "BUILTIN\Administrators:(F)"
```

Linux:

```bash
chown <service-user>:<service-group> backend/.env
chmod 600 backend/.env
```

4. Never commit `.env` files. The repository ignores `.env`, `.env.*`,
   `backend/.env*`, and `frontend/.env*`, while keeping `*.example` templates.

Required production settings (see `backend/.env.example` for the full list):

```
ENVIRONMENT=production
DEV_MODE=false
DATABASE_URL=postgresql://<db-user>:<db-password>@<db-host>:5432/coroomies
JWT_SECRET_KEY=<random, at least 32 characters>
OTP_PEPPER_KEY=<random, at least 32 characters>
CORS_ORIGINS=https://app.example.com
CORS_ALLOW_TUNNELS=false
APP_TIMEZONE=Asia/Kolkata
HSTS_ENABLED=true
REDIS_URL=redis://<redis-host>:6379/0
RATE_LIMIT_FAIL_CLOSED=true
TRUSTED_PROXIES=<upstream-reverse-proxy-ip-or-cidr>
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=no-reply@example.com
SMTP_PASS=<app-password>
```

> **Reverse Proxy & Header Spoofing Note**: In production, `TRUSTED_PROXIES` must explicitly match the IP address or CIDR range of your real upstream reverse proxy (e.g. Nginx, Cloudflare tunnel, AWS ALB). The application will reject forwarded headers (`CF-Connecting-IP`, `X-Forwarded-For`) from any direct client whose immediate socket IP does not match `TRUSTED_PROXIES`, completely neutralizing client IP-spoofing attacks.
>
> **Rate Limiting Fail-Closed Note**: `RATE_LIMIT_FAIL_CLOSED=true` ensures that in production, if Redis is down or unreachable, sensitive endpoints (login, register, forgot-password, OTP verification, email change) fail closed with a controlled HTTP 503 instead of silently downgrading to per-process in-memory limits.

Production startup fails when `JWT_SECRET_KEY` is missing or shorter than 32
characters, or when `CORS_ORIGINS` is missing, empty, or contains `*`/`null`.
Quick Tunnel domains are never trusted in production.

## 2. SMTP and email delivery

Password reset and email-change flows send one-time codes by email. The code is
never returned in an API response and is never logged in production.

- Set `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, and `SMTP_PASS`.
- Use a provider app password. Confirm the provider allows SMTP and that the
  sender domain has SPF/DKIM configured.
- Email delivery is executed asynchronously via FastAPI `BackgroundTasks` with a
  10-second socket timeout and bounded retry (2 attempts with exponential backoff).
  This prevents synchronous SMTP latency or network blips from blocking client HTTP
  request/response cycles or revealing account existence via timing differences.
- **Durability Notice**: In-process `BackgroundTasks` run on the application worker
  thread pool. If the process crashes, the container restarts, or the host is suddenly
  terminated during execution, in-flight background email tasks will not survive.
  For high-scale production deployments with strict delivery guarantees across crashes,
  a durable persistent queue (e.g. Celery / Amazon SQS) or an asynchronous transactional
  email API (Postmark, SendGrid, Amazon SES) should be adopted.
- If SMTP is not configured in production, the app logs a startup warning and
  request-time errors, but password reset will not deliver. Configure real
  credentials before launch.
- Test after configuration: request a reset for a real mailbox and confirm the
  message arrives. The API response is intentionally generic.

## 3. Database

Create a dedicated production role (example, replace placeholders):

```sql
CREATE ROLE coroomies_app LOGIN PASSWORD '<db-password>';
CREATE DATABASE coroomies OWNER coroomies_app;
```

Apply migrations from the backend directory:

```powershell
cd backend
.\venv\Scripts\python.exe -m alembic current   # expect add_otp_failed_attempts (head)
.\venv\Scripts\python.exe -m alembic upgrade head
```

Migrations are the source of truth. `alembic check` may report drift because the
SQLAlchemy models are not fully maintained; this does not affect the raw-SQL
application and is not a deployment blocker.

### Backup and restore

```powershell
# Backup (custom format, encrypted storage recommended)
pg_dump -h <db-host> -U <db-user> -Fc -f coroomies_YYYYMMDD.dump coroomies

# Restore drill into an isolated database
createdb -h <db-host> -U <db-user> coroomies_restoretest
pg_restore -h <db-host> -U <db-user> -d coroomies_restoretest --no-owner --no-privileges coroomies_YYYYMMDD.dump
```

Verify row counts and `alembic_version`, then drop the drill database. Schedule
regular encrypted backups with retention and test restores.

## 4. Backend process (PM2) and TLS

The API binds to `127.0.0.1:8000` and must sit behind a TLS-terminating reverse
proxy. `ecosystem.production.config.cjs` is the production process definition.
When `REDIS_URL` is configured, uvicorn workers can be safely scaled (`--workers 2` or more)
because rate limiting is synchronized atomically across processes via Redis.

```powershell
pm2 start ecosystem.production.config.cjs
pm2 save
pm2 logs coroomies-backend
```

Do not start the production config alongside `ecosystem.config.cjs` (both use
the app name `coroomies-backend`). `start.bat`, the Vite dev server, and the
Cloudflare Quick Tunnels are development-only.

On Linux, change the `script` path in the config to
`backend/venv/bin/python`. If the reverse proxy is not on loopback, set
`--forwarded-allow-ips` to the proxy address instead of `127.0.0.1`.

Example Caddy reverse proxy (replace the domain and certificate handling):

```
api.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

If you use nginx, forward `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`,
and add HSTS plus the same security headers used by the frontend.

Health checks:

- `GET https://api.example.com/health` - liveness
- `GET https://api.example.com/health/ready` - database readiness

`/docs`, `/redoc`, and `/openapi.json` return 404 in production.

## 5. Frontend production build

Set the production API origin in `frontend/.env.production` (ignored by git) or
in the build environment:

```
VITE_API_URL=https://api.example.com
```

Then build and deploy `dist/`:

```powershell
cd frontend
npm ci
npm run build
```

The build fails if `VITE_API_URL` is missing, is not HTTPS, or points at
localhost/loopback/a `*.trycloudflare.com` host. This prevents shipping a
development tunnel URL. Serve `dist/` over HTTPS with the security headers from
`vite.config.js`, and add HSTS at the static host or reverse proxy.

## 6. Verification checklist

- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] `GET /health/ready` returns `{"status":"ready"}` (validates DB and Redis readiness)
- [ ] `/docs`, `/redoc`, `/openapi.json` return 404 in production/staging
- [ ] `alembic current` shows `add_otp_failed_attempts (head)`
- [ ] Login, logout, and token revocation work
- [ ] A real password-reset email arrives; no OTP appears in logs or responses
- [ ] CORS allows only the production/staging frontend origin; tunnel and unknown origins fail
- [ ] Production build contains the production/staging API origin (no tunnel/localhost)
- [ ] Backend security headers present; HSTS enabled at the edge
- [ ] A backup/restore drill succeeds
- [ ] PM2 restarts the process after a crash; logs rotate

## 7. Rollback

- Frontend: redeploy the previous `dist/` build.
- Backend: check out the previous release and restart PM2.
- The `add_otp_failed_attempts` downgrade drops the failed-attempts column, and `widen_tokens_sha256` downgrades to varchar(6)/varchar(10).
- If a data rollback is required, restore the most recent verified backup.

## 8. Known limitations

- In-process `BackgroundTasks` are not durable across process crashes or server restarts. For high-volume transactional scale, a persistent queue (Celery/SQS) is recommended.
- Tokens are stored in `localStorage`; CSP mitigates but does not eliminate XSS risk.
- There is no dedicated frontend health endpoint; use the static host's health check.
- No centralized monitoring/alerting is configured yet.
- `alembic check` model drift is expected until the SQLAlchemy models are brought up to date.

## 9. Staging Deployment Runbook & Checklist

Staging mirrors production security rules (`ENVIRONMENT=staging` activates production-style validations, including minimum 32-character secrets, explicit CORS origins, and `RATE_LIMIT_FAIL_CLOSED=true`).

### Architecture & Low-Cost Infrastructure
The recommended staging setup is a single low-cost Linux cloud VPS (e.g. Hetzner €4/mo, DigitalOcean $6/mo, or AWS Lightsail $3.50/mo) or an isolated server running:
1. **PostgreSQL**: dedicated `coroomies_staging` database (never share or reuse the dev database).
2. **Redis**: local instance `redis://127.0.0.1:6379/0` for distributed rate limiting.
3. **Backend**: FastAPI managed by PM2 via `ecosystem.staging.config.cjs` (2 workers on port 8000).
4. **Reverse Proxy (Caddy or Nginx)**: terminates TLS (e.g. `api-staging.example.com` and `staging.example.com`), proxies API requests to `127.0.0.1:8000`, and serves the frontend static `dist/` build.

### Staging Deployment Steps

#### Step 1: External Provisioning & Staging Database Setup
1. On your staging PostgreSQL server, create an isolated user and database:
   ```sql
   CREATE ROLE coroomies_staging LOGIN PASSWORD '<staging-db-password>';
   CREATE DATABASE coroomies_staging OWNER coroomies_staging;
   ```
2. Verify Redis is running on the staging host:
   ```bash
   redis-cli ping   # Must output PONG
   ```

#### Step 2: Configure Staging Backend Environment
1. Copy `backend/.env.staging.example` to `backend/.env`:
   ```bash
   cp backend/.env.staging.example backend/.env
   chmod 600 backend/.env
   ```
2. Fill in:
   - `DATABASE_URL=postgresql://coroomies_staging:<password>@<db-host>:5432/coroomies_staging`
   - `JWT_SECRET_KEY` (generate 48 random chars)
   - `OTP_PEPPER_KEY` (generate 48 random chars)
   - `REDIS_URL=redis://127.0.0.1:6379/0`
   - `CORS_ORIGINS=https://staging.example.com`
   - `TRUSTED_PROXIES=127.0.0.1,::1` (match your reverse proxy IP)
   - `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`

#### Step 3: Apply Migrations to Staging Database
```bash
cd backend
python -m alembic current          # Fresh database will show empty (<base>)
python -m alembic upgrade head     # Migrates all 26 tables to add_otp_failed_attempts
python -m alembic current          # Must show add_otp_failed_attempts (head)
```

#### Step 4: Start Staging Backend via PM2
```bash
pm2 start ecosystem.staging.config.cjs
pm2 save
pm2 logs coroomies-staging-backend
```

#### Step 5: Build and Deploy Staging Frontend
```bash
cd frontend
npm ci
VITE_API_URL=https://api-staging.example.com npm run build
```
Copy `frontend/dist/` to your web server root (e.g. `/var/www/coroomies-staging`).

### Staging Manual Test Checklist

Execute these manual tests on the staging URLs before declaring staging verification complete:

1. **Health Probes**:
   - `curl -i https://api-staging.example.com/health` -> Expect `HTTP 200 {"status":"ok"}`
   - `curl -i https://api-staging.example.com/health/ready` -> Expect `HTTP 200 {"status":"ready"}`
   - `curl -i https://api-staging.example.com/docs` -> Expect `HTTP 404 Not Found`
2. **Registration Flow**:
   - Register a new test account via `POST /auth/register` or frontend.
   - Verify account is created and password hashed with Argon2id.
3. **Login & Session Revocation**:
   - Log in via `POST /auth/login` to obtain access token.
   - Call authenticated endpoint `GET /profile/me`.
   - Call `POST /auth/logout`; verify subsequent request with the old token is rejected (`HTTP 401`).
4. **Password Reset OTP & Gmail SMTP Delivery**:
   - Request reset code via `POST /auth/forgot-password` with your real test email.
   - Check test inbox for the verification email (confirm received within 10-30s).
   - Confirm backend logs NEVER print the OTP code.
   - Verify code via `POST /auth/verify-otp`.
   - Submit new password via `POST /auth/reset-password`; verify login succeeds with new password.
5. **Email-Change Verification**:
   - In Settings, request an email change to a secondary test mailbox.
   - Confirm verification email arrives at the new mailbox.
   - Submit confirmation code; verify email updates and notice is dispatched to old address.
6. **Rate Limiting & Lockout Rules**:
   - Send 5 incorrect codes to `/auth/verify-otp`. Verify 5th attempt returns lockout message. Attempt 6th with the real code; verify token is rejected as invalidated (`used = true`).
   - Rapidly send 7 login attempts with wrong password; verify 7th request returns `HTTP 429 Too Many Requests`.
7. **Redis Fail-Closed Verification**:
   - Temporarily stop Redis (`sudo systemctl stop redis` or `redis-cli shutdown`).
   - Call `GET /health/ready` -> Expect `HTTP 503 {"status":"not ready"}`.
   - Attempt a login request -> Expect `HTTP 503 Service Unavailable`.
   - Restart Redis; verify readiness probe returns 200 and logins succeed.
