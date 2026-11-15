# CoRoomies Security Audit & Fixes

**Date:** 4 September 2026
**Status:** Criticals fully fixed and verified live

---

## Executive Summary

A full security and privacy audit was performed against the CoRoomies backend (FastAPI) and frontend (React). Seven critical-to-low severity issues were identified. All three critical findings (C1–C3) have been implemented, tested live, and verified. High and medium issues remain open and are documented here for future resolution.

---

## Critical — Fixed

### C1 — Forgot-password leaked OTP and victim email in API response

**Severity:** Critical
**Status:** ✅ Fixed and verified

**The problem:** When the app was running without real email (SMTP not configured), the forgot-password endpoint returned the 6-digit reset code directly in the JSON response alongside the victim's email address. Any attacker who triggered the request received the code and email instantly — no email access required.

**Impact:** Full account takeover with zero friction.

**Fix (backend/app/Routers/auth.py):**
- The OTP and email are **never** returned in the response body.
- Both existing and non-existing accounts now return the identical generic 200 message: `"If that account exists, a verification code has been sent to its email."` — this also eliminates account enumeration.
- A `DEV_MODE` flag (`backend/app/config.py`, sourced from env `DEV_MODE`) gates dev-only behavior: when SMTP is not configured and `DEV_MODE=true`, the OTP is written **only** to the server console log (stderr) — never to any user-facing response.
- Dead helper `_find_user_by_email` was removed.

**Fix (frontend/src/ForgotPassword.jsx):**
- Removed the dev-mode amber box that displayed the OTP directly in the UI.
- Removed reliance on `res.data.email` and `res.data.dev_otp`.
- Generic wording used throughout; `sentTo` state removed (always "your account").

**Config (backend/.env):**
- Added `DEV_MODE=true` so local testing via server console is still possible without real SMTP.

**Verified live:**
- Existing user → generic reply, no code/email fields
- Non-existent user → identical generic reply (no enumeration)
- Full reset → login flow works using the dev-mode OTP from server console
- Dev OTP never appears in any API response

---

### C2 — Email-change verification code returned in API response, never emailed

**Severity:** Critical
**Status:** ✅ Fixed and verified

**The problem:** The "change email" feature's `/settings/email/request-change` endpoint generated a 6-digit code using `random` and returned it in the JSON response. The confirmation endpoint then simply checked whether that code matched — making the entire "verification" decorative. No email was ever sent. Any attacker with an active session could change the victim's email to their own instantly.

**Impact:** Silent email takeover → password reset via new email → permanent account lockout; victim never notified.

**Fix (backend/app/Routers/settings.py):**
- Code generated with `secrets.randbelow` (cryptographically unpredictable) instead of `random.choices`.
- Code is **no longer returned** in the response body.
- Code is emailed to the **new** email address via the new `send_email_change_otp()` helper (`backend/app/emailer.py`).
- Confirmation requires `code + new_email` — code is bound to the specific new address.
- SMTP not configured → `DEV_MODE` logs the code to the server console only (same pattern as C1).
- After email is changed, a **notification is sent to the old email address** (`send_email_changed_notice`) so the original owner is not left in the dark.

**Fix (backend/app/emailer.py):**
- Refactored internal helper `_send(to_email, subject, body)`.
- Added `send_email_change_otp(to_email, code, ttl_minutes)`.
- Added `send_email_changed_notice(to_email)`.

**Frontend (frontend/src/Profile.jsx):** No changes needed — the UI already expected the code to arrive by email.

**Verified live:**
- Response contains no `code` field
- Correct code → 200, email updated
- Wrong code → 400
- Dev-mode OTP logged to server console only

---

### C3 — No rate limiting on login, password reset, forgot-password, or email-change endpoints

**Severity:** Critical
**Status:** ✅ Fixed and verified

**The problem:** All sensitive endpoints accepted unlimited attempts per second. An attacker could brute-force weaker passwords via the login endpoint or brute-force the 6-digit reset code (~1M possibilities, completable in hours) with no throttle.

**Impact:** Credentials and reset codes trivially brute-forceable.

**Fix (backend/app/rate_limit.py — new file):**
- Built-in in-memory fixed-window rate limiter (zero new dependencies).
- `get_client_ip()` prefers `cf-connecting-ip` header (set by Cloudflare edge) so each real user is tracked independently even when traffic arrives through a local Cloudflare tunnel.
- Hard memory ceiling prevents unbounded growth.

**Limits applied (IP + account where relevant):**

| Endpoint | IP limit | Account limit |
|---|---|---|
| POST `/auth/register` | 6 / 60 s | — |
| POST `/auth/login` | 20 / 60 s | 6 / 60 s per identifier |
| POST `/auth/forgot-password` | 6 / 60 s | 4 / 300 s per identifier |
| POST `/auth/reset-password` | 10 / 60 s | 5 / 300 s per identifier |
| POST `/settings/email/request-change` | 6 / 60 s | — |
| POST `/settings/email/confirm-change` | 6 / 60 s | — |

Exceeded limits return HTTP 429: `"Too many attempts. Please wait a moment and try again."`

**Verified live:**
- Login: 7th attempt with same identifier → 429
- Forgot-password: 5th call with same identifier → 429 (hits the tighter 4/5min account limit)
- Reset-password: single normal call passes without interference
- Resets counters on server restart (acceptable for this app's scale)

---

## High — Open (not yet fixed)

### H1 — Long-lived JWT, no revocation, survives password changes

**Severity:** High

JWT access tokens are valid for 24 hours. There is no revocation mechanism — changing a password does not invalidate existing tokens. Tokens are stored in `localStorage`.

**Impact:** Compromised tokens remain valid for up to 24h with no way to invalidate them server-side.

**Recommended fix:** Add a `token_version` column to `users`; include it in the JWT payload; bump it on password change. Validate version in the auth middleware. Store tokens in `httpOnly` cookies instead of `localStorage`.

---

### H2 — Lifestyle preferences and emails exposed to all authenticated users

**Severity:** High

Endpoints `GET /matches`, `GET /matches/stable`, `GET /matches/reverse`, `GET /listings`, and `GET /team-ups` return full lifestyle preferences and email addresses to any authenticated user. Friends list API also leaks email addresses.

**Impact:** Any user can scrape the full preference profiles and email addresses of every other user.

**Recommended fix:** Redact emails and sensitive preference fields from public-facing listings. Expose full profiles only to friends or the profile owner.

---

## Medium — Open (not yet fixed)

### M1 — CORS allows any `*.trycloudflare.com` origin with credentials

The `allow_origin_regex` in `backend/app/main.py` permits any Cloudflare quick tunnel URL with `allow_credentials=True`, letting any temporary tunnel user make credentialed cross-origin requests.

**Recommended fix:** Maintain an explicit allowlist of known frontend origins.

---

### M2 — Avatar uploads checked only by file extension

`PUT /settings/avatar` verifies `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` extensions but does not inspect file content. Avatars are served publicly.

**Recommended fix:** Verify MIME type/content signature on upload; serve avatars through an authenticated or signed-URL endpoint.

---

### M3 — Incomplete account deletion; FK violations on `expense_shares`

`expense_shares.user_id` references `users.id` with no `ondelete` clause. The `delete_account` endpoint does not clean up `expense_shares`, `password_reset_tokens`, or `email_change_tokens` — leading to FK constraint errors (HTTP 500).

**Recommended fix:** Add `ON DELETE CASCADE` to `expense_shares.user_id`, or explicitly clean up all dependent rows in the transaction before deleting the user.

---

### M4 — No security headers

No CSP, `X-Content-Type-Options`, `X-Frame-Options`, or HSTS headers are set.

**Recommended fix:** Add a middleware that sets standard security headers on all responses.

---

### M5 — User enumeration via distinct error messages

Different error messages on registration, login, and password reset reveal whether a username, email, or reset token exists. (The forgot-password endpoint was fixed as part of C1; others remain.)

**Recommended fix:** Use uniform error messages across all auth endpoints.

---

## Low — Open (not yet fixed)

### L1 — OTPs stored plaintext; email-change code uses `random`

OTP codes were stored in plaintext in the database and generated with `random` (predictable). Email-change code has been upgraded to `secrets` as part of C2; password reset OTP storage should follow.

**Recommended fix:** Store OTPs as hashes (same as passwords); generate all OTPs with `secrets`.

---

### L2 — New DB connection per request (no pooling)

`database.py` opens a fresh `psycopg.connect()` on every API call with no connection pooling.

**Recommended fix:** Use `psycopg_pool.ConnectionPool` or switch to `asyncpg`/SQLAlchemy async with a pool.

---

### L3 — Reminder loop swallows errors

In `backend/app/Routers/expenses.py`, the auto-dunning notification loop catches all exceptions per user and continues silently.

**Recommended fix:** Log failed notification attempts instead of swallowing them.

---

### L4 — Verbose `logger.exception` calls

Multiple endpoints call `logger.exception(...)` on non-critical failures, which writes full Python tracebacks including internal paths to log files.

**Recommended fix:** Use `logger.warning` or `logger.error` with redacted messages for non-critical failures.

---

### L5 — Frontend `console.error(error.response?.data)` noise

Several frontend files log full error response bodies to the browser console.

**Recommended fix:** Remove or gate behind a debug mode.

---

### L6 — Plain HTTP in local development

Both backend (`--host 127.0.0.1`) and frontend Vite dev server run over plain HTTP.

**Recommended fix:** Use locally-trusted TLS certificates for development, or document this as a known limitation.

---

## Infrastructure Notes

- **PM2** runs 4 processes: `coroomies-backend`, `coroomies-frontend`, `tunnel-backend`, `tunnel-frontend`. Tunnels reset URLs on every restart.
- **`DEV_MODE=true`** is set in `backend/.env` for development OTP console logging. **Never set this in production.**
- **No real SMTP configured.** To enable actual email delivery, add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (16-char Gmail app password) to `backend/.env`.
