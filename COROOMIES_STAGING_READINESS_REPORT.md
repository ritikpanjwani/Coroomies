# CoRoomies Staging Readiness Report

Date: 2026-11-22

## Verdict

**NOT READY for public staging deployment.**

The application is internally staging-ready: fresh migrations, authentication,
request/messaging routes, privacy fixtures, payment confirmation, frontend
build, dependency audits, and isolated browser smoke checks were completed
successfully. Public staging remains blocked because live Supabase PostgreSQL/
Storage, Redis, SMTP, Cloudflare Pages, and Render credentials and policies
were not available for verification.

No production database was modified or destroyed.

## Source of Truth

`COROOMIES_PRODUCTION_FINAL_REPORT.md` was not present in the workspace.
This work used `COROOMIES_FINAL_FUNCTIONAL_AUDIT.md`, the repository source,
and executable checks as the baseline.

## Database and Migration Fixes

Added forward migration:

- `backend/alembic/versions/staging_schema_repair.py`
- Revision: `staging_schema_repair`
- Parent: `matching_preference_constraints`
- Repairs:
  - Adds `roommate_requests.created_at`
  - Adds `conversation_notification_settings`
  - Adds foreign keys, unique constraint, self-peer check, and index

Historical request timestamps remain NULL where the historical value is
unknown; the migration does not fabricate dates. New request records set
`created_at = NOW()`.

Verified with an isolated PostgreSQL 18 database named
`coroomies_test_staging_20261122`:

- Migration completed from empty database to head.
- Alembic current: `staging_schema_repair (head)`
- Alembic heads: `staging_schema_repair (head)`
- Confirmed `roommate_requests.created_at` exists.
- Confirmed `roommate_requests` and
  `conversation_notification_settings` exist in the catalog.

## Issues Fixed

### API and Database

- Added the missing roommate request timestamp used by received, sent,
  combined, and friend-list views.
- Added the missing conversation notification settings table used by inbox,
  mute, unmute, sending, and conversation reads.
- Constrained the dynamic messaging conversation route to integer IDs.
- Preserved the `/messages/blocked-users` endpoint and verified it returns
  `200` with `blocked_users` content.
- Fixed request inserts to include a timestamp explicitly.
- Added public-profile and profile-completion integration fixtures that create
  isolated caller/subject/users instead of assuming fixed user IDs.

### Payment and Settlement Consistency

- Split share payment reporting from verified receipt:
  - Payer: `payment_reported`
  - Recipient/admin: `paid` after confirmation
- Reporting no longer creates a paid settlement or marks the expense settled.
- Recipient/admin confirmation now requires `payment_reported` state and
  creates a reconciled settlement record.
- Rejection/reset restores pending status and removes reconciled records.
- `settle-up-report` now reports balance payment instead of immediately
  clearing it.
- Confirm settlement requires an actual reported share and no longer invents a
  confirmed amount when no reported payment exists.
- Added an outstanding-balance check for settle-up reports.
- Updated frontend copy so users are told recipient verification is required.

### Room Listings and Vacancies

- Added `frontend/src/Rooms.jsx`.
- Added Rooms & Vacancies to desktop and mobile navigation.
- Added room listing search, publishing, and owner deletion.
- Added Living Group vacancy discovery and application.
- Added group-admin open-slot management and ranked candidate display.

### Frontend Reliability and Accessibility

- Implemented modal initial focus, Tab focus containment, Escape handling,
  body-scroll restoration, background inertness, and focus restoration.
- Added session-expired handling that returns the app to login without
  destructive reload behavior or draft loss.
- Removed reload-on-401 behavior from the Axios interceptor.
- Added stale-response protection in the Conflict Assistant.
- Added CSP fallback and updated the dev CSP for test API ports.
- Added Cloudflare `_redirects` and `_headers`.

### Supabase Storage

Prepared private Supabase Storage support while preserving local storage:

- Chat media: private Supabase bucket or local filesystem.
- Profile avatars: private Supabase bucket or local filesystem.
- Group avatars: private Supabase bucket or local filesystem.
- Server validates content and size before upload.
- Chat and avatar download paths require authenticated authorization.
- Supabase service-role credentials are server-only environment variables.

Live buckets, policies, uploads, and signed/private retrieval were not
executed because no Supabase project credentials were available.

### Security and Dependencies

- Upgraded frontend dependencies with `npm audit fix`.
- Added no-secrets Render environment variable manifest.
- Added staging environment examples for Supabase, Redis, SMTP, CORS, and
  database configuration.
- Added staging docs/OpenAPI 404 behavior.
- Updated root response so it does not advertise `/docs` outside local/dev
  environments.
- Added exact-origin CORS verification.
- Upgraded PyJWT from 2.13.0 to 2.15.0 after dependency audit findings.

## Files Changed

Backend:

- `backend/alembic/versions/staging_schema_repair.py`
- `backend/app/Routers/messages.py`
- `backend/app/Routers/requests.py`
- `backend/app/Routers/shared_expenses.py`
- `backend/app/Routers/settings.py`
- `backend/app/Routers/groups.py`
- `backend/app/storage.py`
- `backend/app/main.py`
- `backend/requirements.txt`
- `backend/.env.example`
- `backend/.env.staging.example`
- `backend/tests/test_audit_regressions.py`
- `backend/tests/test_gender_age_matching.py`

Frontend:

- `frontend/src/Rooms.jsx`
- `frontend/src/Dashboard.jsx`
- `frontend/src/App.jsx`
- `frontend/src/api.js`
- `frontend/src/Assistant.jsx`
- `frontend/src/components/ui/Modal.jsx`
- `frontend/src/components/UpiPaymentModal.jsx`
- `frontend/src/GroupExpenses.jsx`
- `frontend/vite.config.js`
- `frontend/index.html`
- `frontend/package-lock.json`
- `frontend/public/_redirects`
- `frontend/public/_headers`

Deployment:

- `render.yaml`

## Tests Executed

### Backend

Full backend suite:

- **28 passed**
- Includes 23 unit tests and 5 integration tests.
- Integration coverage includes:
  - Public profile DOB privacy
  - Profile completion fixture
  - Mutual gender/matching exclusion
  - Request and messaging HTTP smoke
  - Payment report/recipient confirmation

Additional checks:

- Python syntax compilation passed.
- `pip check`: no broken requirements.
- Alembic migration from empty database passed.
- `staging_schema_repair` is the only migration head.
- Request/combined/friends/inbox/blocked-users endpoints returned `200`.
- Send, thread read, mute, and unmute returned `200`.

### Frontend

- ESLint: passed.
- Staging build with HTTPS API origin: passed.
- npm production audit: **0 vulnerabilities**.

### Dependency Audit

- Frontend: 0 known vulnerabilities.
- Python: 0 known vulnerabilities after PyJWT 2.15.0 upgrade.
- `pip-audit -r requirements.txt`: no known vulnerabilities.

### Staging Runtime

On the isolated PostgreSQL database:

- `/health`: `{"status":"ok"}`
- `/health/ready`: `{"status":"ready"}`
- Production/staging `/docs`: `404`
- Production/staging `/openapi.json`: `404`
- Root response no longer advertises `/docs`.
- Allowed staging CORS origin received the exact origin allow-header.
- Unknown origin received no CORS allow-header.

### Browser Testing

Using an isolated backend and test database:

- Registration: passed.
- Login: passed.
- Mobile 375 px: no document-width overflow.
- Tablet 768 px: no document-width overflow.
- Desktop 1440 px: no document-width overflow.
- Dashboard loaded.
- Mobile More sheet opened.
- Rooms & Vacancies navigation opened.
- Publish-room modal opened and closed with Escape.

Browser testing did not execute external SMTP, real payment apps, live
Supabase uploads, or real cross-device notification delivery.

## Required Environment Variables

### Render/FastAPI

Required:

- `ENVIRONMENT=staging`
- `DEV_MODE=false`
- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `OTP_PEPPER_KEY`
- `CORS_ORIGINS`
- `REDIS_URL`
- `RATE_LIMIT_FAIL_CLOSED=true`
- `TRUSTED_PROXIES`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`

Media/storage:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_CHAT_BUCKET`
- `SUPABASE_AVATAR_BUCKET`
- `SUPABASE_GROUP_AVATAR_BUCKET`

Do not put `SUPABASE_SERVICE_ROLE_KEY` in Cloudflare or frontend variables.

### Cloudflare Pages

Required build environment:

- `VITE_API_URL=https://<your-staging-api-origin>`
- `VITE_HSTS_ENABLED=false` or `true` only behind HTTPS

The build rejects localhost, loopback, and Cloudflare Quick Tunnel API origins.

## Supabase Setup

Before staging launch:

1. Create private buckets:
   - `chat-media`
   - `profile-avatars`
   - `group-avatars`
2. Leave buckets private.
3. Configure a server-only service-role key in Render.
4. Do not expose the service-role key in frontend environment variables.
5. Test upload/download with synthetic users.
6. Test delete and replacement behavior.
7. Verify a different authenticated user cannot download a private chat
   attachment or group photo.

## Staging Deployment Instructions

### 1. Supabase PostgreSQL

1. Create an isolated staging database and dedicated least-privilege role.
2. Set the Render `DATABASE_URL` to the staging connection string.
3. Back up or snapshot the staging database before migration.
4. Run:
   ```powershell
   cd backend
   .\venv\Scripts\python.exe -m alembic upgrade head
   .\venv\Scripts\python.exe -m alembic current
   ```
5. Confirm current is `staging_schema_repair (head)`.

### 2. Render

1. Import `render.yaml` or create a Python web service.
2. Set every `sync: false` secret in the Render dashboard.
3. Set `TRUSTED_PROXIES` to Render's real proxy or network range.
4. Configure a Redis instance and set `REDIS_URL`.
5. Configure SMTP and verify a real reset/email-change flow.
6. Deploy and verify:
   - `GET /health`
   - `GET /health/ready`
   - `/docs` returns `404`
   - `/openapi.json` returns `404`

### 3. Cloudflare Pages

1. Set project root to `frontend`.
2. Build command: `npm ci && npm run build`
3. Build output: `dist`
4. Set `VITE_API_URL` to the public staging Render HTTPS origin.
5. Confirm `_redirects` routes SPA paths to `index.html`.
6. Confirm `_headers` is published.

## Remaining Manual Setup and Blockers

- Live Supabase PostgreSQL staging database credentials.
- Live Supabase Storage buckets and private RLS/policy validation.
- Live Redis instance for distributed fail-closed rate limiting.
- Live SMTP credentials and mailbox delivery test.
- Render staging URL and trusted proxy configuration.
- Cloudflare Pages staging origin and DNS/TLS.
- Real password reset, OTP expiry/replay, and email-change flows.
- Real browser-to-live-API registration/login and cross-device journeys.
- External payment app confirmation is not possible without merchant/payment
  credentials and was not initiated.
- External notification delivery and prolonged network polling.
- Screen-reader, full keyboard, touch-target, contrast, and attachment preview
  sign-off across all populated states.

## Deployment Go/No-Go Checklist

Do not deploy publicly until all of the following are complete:

- [ ] Staging Supabase database created and isolated.
- [ ] Migration backup and forward upgrade completed.
- [ ] Staging Supabase Storage private buckets created.
- [ ] Redis reachable and fail-closed behavior tested.
- [ ] SMTP reset and email-change messages delivered.
- [ ] Cloudflare Pages build deployed.
- [ ] Render API deployed with exact CORS origin.
- [ ] `/docs` and `/openapi.json` return `404`.
- [ ] `/health/ready` returns `ready`.
- [ ] Live browser registration/login/messaging/payment smoke passed.
- [ ] Private media authorization tested.
- [ ] Staging rollback snapshot recorded.
