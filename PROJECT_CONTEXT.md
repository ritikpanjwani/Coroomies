# CoRoomies — Project Context File

> Hand this file to any AI assistant (ChatGPT, Claude, etc.) to bring it fully up to speed on what has been built so far. Last updated: 2026-08-27.

---

## 1. What is CoRoomies?

A **student-focused shared-living platform**. Students find accommodation + compatible roommates, and manage their shared living day-to-day.

Core relationship model (student-first, NOT hostel-owner software):

```text
Student <-> Living Group <-> Other Students
Student <-> Housing Listing <-> Potential Living Group / Roommates
```

What a student can do:

- Register/login, build a profile + lifestyle preferences, get a credibility-minded "living reliability" score.
- Find rooms/beds/PGs/flats via **Listings**, discover compatible roommates via **Discover** (Rooms · People · Requests · Vacancies · Stable Match tabs).
- Join or create a **Living Group** (invite code → admin approval), chat with the group, manage **group expenses** (equal or custom split, balances, settle-up), **chores** (incl. recurring schedules with per-member alarm reminders), **rules & penalties**, a transparent **reliability score**, and an offline **AI conflict assistant**.
- Track **personal daily expenses** separately (categories, budget, recurring auto-logs) — never mixed with group balances.

Source of truth (design spec): `docs/co-roomies-mvp-spec.md`.

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 8 + Tailwind CSS v4 (`@tailwindcss/vite`), axios, ESLint. Custom UI kit in `frontend/src/components/ui/` (no external component lib). |
| Backend | Python FastAPI + Pydantic, psycopg (PostgreSQL), PyJWT, passlib/bcrypt, alembic migrations. |
| DB | PostgreSQL — connection: `postgresql://postgres:<redacted-db-password>@localhost:5432/coroomies` |
| Process manager | PM2 (`ecosystem.config.cjs`) — 4 apps (backend :8000, frontend :5173, 2× cloudflared tunnels). Manual launcher: `start.bat`. |
| Tunnels | Cloudflare quick tunnels (`cloudflared.exe.exe`) for sharing the app externally. |

---

## 3. How to Run / Restart

- **Cold boot (PM2):** `pm2 start "D:\CoRoomies project\ecosystem.config.cjs"` (verbose pm2 sidebar restart too).
- **Manual:** double-click `start.bat` (starts uvicorn backend, frontend vite, both tunnels).
- **Backend venv python:** `D:\CoRoomies project\backend\venv\Scripts\python.exe` — ALWAYS use this for the backend (it's the only env with `jwt`, `psycopg`, etc.). Never system python.
- **Frontend:** `npm run dev` in `frontend/` (vite on 5173). Build check: `npm run build`. Lint: `npm run lint`.
- **Uploaded avatars** are served from `backend/app/uploads` at `/uploads/...`.

### Tunnels & the `.env`
- After every backend/frontend restart the tunnel URLs change. Look them up from the tunnel logs (they are printed as `https://<random>.trycloudflare.com`) — PM2 logs: `pm2 logs tunnel-backend` / `tunnel-frontend`.
- Backend tunnel must be written into **`frontend/.env`** as `VITE_API_URL=<backend-tunnel>` and the frontend (and its tunnel) restarted. Last-known values: backend `https://instance-tactics-non-briefing.trycloudflare.com`, frontend `https://keyboard-prepared-accessed-threats.trycloudflare.com`.
- `frontend/vite.config.js` has `server.allowedHosts: [".trycloudflare.com"]` (fixes the 403 "Blocked request" error on tunnel hosts). Backend CORS allows all `*.trycloudflare.com` origins (`main.py`).
- `backend/.env` contains `DATABASE_URL` and `JWT_SECRET_KEY` (never commit/print the secret).

---

## 4. Project Structure

```
D:\CoRoomies project\
├── backend\
│   ├── app\
│   │   ├── main.py                 # FastAPI app, CORS, error handlers, router registration, startup reminder loop
│   │   ├── auth.py                 # JWT logic (decode_current_principal / create_access_token)
│   │   ├── security.py             # password hashing
│   │   ├── emailer.py              # mail helpers
│   │   ├── database.py             # DB pool
│   │   ├── schemas.py              # pydantic schemas (user, profile, expense, etc.)
│   │   ├── models.py               # base models (User, etc.)
│   │   ├── auth/ *profile_models.py *listing_models.py *group_models.py *expense_models.py
│   │   │     *shared_expense_models.py *chore_models.py *notification_models.py
│   │   │     *message_models.py *request_models.py *matching.py
│   │   ├── Routers\                # auth, profile, matches, expenses, requests, listings,
│   │   │                           # shared_expenses, messages, notifications, groups,
│   │   │                           # chores, rules, reliability, vacancies, assistant,
│   │   │                           # team_ups, settings
│   │   └── uploads\                # avatar uploads (static mount)
│   ├── alembic\                    # migrations (head = chores_schedules_reminder_alarm, see §6)
│   └── venv\                       # backend virtualenv
├── frontend\
│   └── src\
│       ├── App.jsx, main.jsx, Dashboard.jsx (icon sidebar shell)
│       ├── api.js (axios client), auth.js
│       ├── home.jsx, login.jsx, Register.jsx, ForgotPassword.jsx
│       ├── Profile.jsx, Listings.jsx (RoomsPanel), Matches.jsx (Discover),
│       │   Groups.jsx, chat.jsx, Notifications.jsx, Messages.jsx(chat page),
│       │   Expenses.jsx, GroupExpenses.jsx, Household.jsx, Assistant.jsx, Settings.jsx
│       ├── components\ui\          # Button, Card, Badge, Modal, ConfirmDialog, Avatar,
│       │                           # Spinner, EmptyState, PageHeader, StatCard,
│       │                           # Field(Input/Select/Textarea), Icons.jsx, Toast.jsx
│       └── index.css               # Tailwind v4
├── docs\co-roomies-mvp-spec.md     # architecture/product spec
├── FEATURE_TRACKING.md             # STALE (2026-08-18 snapshot) — ignore for current state
├── SESSION_SUMMARY.md              # STALE — see SESSION_SUMMARY_2026-08-20.md for real history
├── SESSION_SUMMARY_2026-08-20.md   # best history doc (Phases 1–6 + Discover merge)
├── start.bat                       # manual launcher
└── ecosystem.config.cjs            # PM2 apps
```

---

## 5. Features Built (current, verified)

### Auth & Account
- Register / login / forgot & reset password (email tokens: `email_change_tokens`, `password_reset_tokens`).
- JWT bearer auth on every endpoint; settings page: account edit, avatar upload/delete, email change (request + confirm links), password change, account deletion.

### Profiles & Preferences
- Student profile (bio, lifestyle preferences, education: college/degree/stream/year). `PUT /profile` is an **upsert** so a new user can save education before profile creation.

### Discover (merged "Find Roommate" + "Matches")
- **Rooms tab** (`RoomsPanel` from `Listings.jsx`): listing search with filters (location, min/max rent, room type, college, degree, stream, available_from), education badges, per-owner **compatibility % + reasons**, Message / Request actions.
- **People tab**: roommate suggestions + refresh.
- **Requests tab**: received/sent roommate requests, accept/reject.
- **Vacancies tab**: groups with `open_slots > 0`, fit-score cards, ranked candidates modal, Apply → pending membership.
- **Stable Match tab**: my stable partner hero card, editable preference ranking (up/down/remove), Gale-Shapley stable pairs + blocking-pair detection.

### Living Groups & Chat
- Create/join (8-char invite code), pending approval, member roles (admin/member), transfer admin, remove, leave (sole admin blocked), delete. **One active group at a time** rule.
- Group chat: persisted history, auto-refresh, sender names, unread handling.
- Group avatar upload/delete.

### Expenses
- **Personal**: add/edit/delete, filters (category, month, date range), category totals + grand total, monthly budget (upsert `expense_settings`), recurring expenses auto-logged (`_materialize_recurring()`). Personal expenses NEVER enter group balances.
- **Shared (group-scoped)**:
  - Create with **equal split** OR **custom split** (`amounts: [{user_id, amount}]`, must cover every active member, sum == total).
  - Get/list (auto-splits equally across active members; payer's share `paid`, others `pending`), settle own share (`PUT /{id}/settle`), delete (payer only), **per-share payment reminder** (`POST /{id}/reminder` → notifies pending payers).
  - **Balances / who-owes-whom** (`GET /balances`) — pairwise debts from unpaid shares minus settlements; returns `members[]`, `owes[]`, `my_user_id`.
  - **Settle up** (`POST /settlements`) + settlement history + delete (payer or admin only). Penalties also inject debt from violator → admin into the balances graph.
  - Shared expense reminders loop: `POST /shared-expenses/{id}/reminder`.

### Household — Chores + Recurring Duties (NOT in the old docs — recent rebuild)
- The old separate "Duties" tab was **merged into "Recurring Duties"**: Home page "Household" now has two tabs: **Recurring Duties** and **Activity**.
- **Recurring duty templates** (`chore_schedules` table): title, group, day_of_week (0–6) or day_of_month, assignee, due_date, and a per-member **reminder alarm** (`reminder_time` HH:MM, optional). A background thread (`start_reminder_loop()` from `chores.py`, started on app startup in `main.py`) checks every 60s and sends each assignee **one notification per due date** at their alarm time (tracked via `last_reminder_date`).
- **Permissions** (backend-enforced in `PUT /chores/schedules/{id}`):
  - Admin: full edit (title, dates, assignee, reminder).
  - Assigned member: may change ONLY `reminder_time`; editing dates/title/assignee returns 403.
  - Others: 403.
- **This week's duties** card: auto-generated chore instances (`chores`) for each schedule; members complete them; admin can delete; activity/history logged in `chore_history`.
- Existing `chores` CRUD (/complete, /history, rotation logic) still intact.

### Rules, Penalties & Reliability
- Group rules (admin-only CRUD, optional penalty amount); violations (admin records, notifies violator, penalty default = rule amount, overridable).
- Reliability score 0–100: −10/overdue unpaid share (>7d), −10/overdue chore, −15/violation (90-day window), +5/completed chore (30-day). Returns full breakdown + itemized reasons.

### AI Conflict Assistant
- Rule-based, offline (no API key). `GET /assistant/analysis?group_id=` → health score + severity, conflicts (payment/chore/violation/debt) each with suggested fix + copyable draft message, proactive suggestions, positive highlights, member snapshot.
- Note: spec says real LLM is optional later — currently deliberately NOT using OpenAI.

### Messages & Notifications
- 1:1 messages (friends list, conversation view, read receipts, delete), notifications list + mark-read.

### Settings
- Account details, avatar, email change (token link), password change, danger zone (delete account).

---

## 6. Recent Changes THIS SESSION (NOT in SESSION_SUMMARY_2026-08-20.md)

1. **Split/budget "group id required" bug — FIXED.** Backend group detail returns `group.id`; modals used `group.group_id` (undefined). Root cause was the frontend. Fix: `const groupId = group.group_id ?? group.id;` in both `SplitExpenseInner` and `SettleUpInner` in `frontend/src/GroupExpenses.jsx`. Build passes.
2. **Recurring duties blank-page bug** fixed (missing `expenses` prop passed to `<PersonalExpenses>`).
3. **Duties + Recurring merged** into "Recurring Duties" (household tabs now: Recurring Duties + Activity). Single-duty creation form removed.
4. **Reminder alarm feature** shipped end-to-end:
   - DB: `ALTER TABLE chore_schedules ADD COLUMN IF NOT EXISTS reminder_time VARCHAR(5); ADD COLUMN IF NOT EXISTS last_reminder_date DATE;` (alembic head at time of writing).
   - Schema/`chores.py`: `reminder_time` in create/update/list/dict (+ `HH:MM` regex validation `^(?:[01]\d|2[0-3]):[0-5]\d$|^$`), permission split in `update_schedule`, `_send_due_reminders()` + `_reminder_loop` + `start_reminder_loop()`, wired via `@app.on_event("startup")` in `main.py`.
   - Frontend `Household.jsx`: alarm inline editor for assigned members, admin seesfull editors; "This week's duties" chore list with Complete/delete.
   - API-verified: assignee can set/clear/change only their alarm (200); non-assignee 403; non-admin date/title/assignee change 403; notification fired once per due date (a test schedule was deleted after; a test notification remains in DB).

---

## 7. API Endpoint Inventory (all under `/api` prefix is NOT used — routers mount at root path)

> Routers are included in `main.py` at their natural paths. Auth: bearer token `Authorization: Bearer <jwt>`.

### Auth — `Routers/auth.py`
- POST `/auth/register`, POST `/auth/login`, POST `/auth/forgot-password`, POST `/auth/reset-password`, GET `/auth/me`

### Profile — `Routers/profile.py`
- POST `/profile/` (create), PUT `/profile/` (upsert), GET `/profile/`

### Matches — `Routers/matches.py`
- GET `/matches/` (suggestions + compatibility), GET/PUT `/matches/preferences`, GET `/matches/stable`, GET `/matches/reverse?group_id=`

### Requests — `Routers/requests.py`
- POST `/requests/{receiver_id}`, GET `/requests/received`, GET `/requests/sent`, GET `/requests/`, PUT `/requests/{id}/accept`, PUT `/requests/{id}/reject`

### Listings — `Routers/listings.py`
- POST `/listings/`, PUT/DELETE `/listings/{id}`, GET `/listings/` (filters + `compatibility`), GET `/listings/{id}`

### Shared Expenses — `Routers/shared_expenses.py`
- GET `/shared-expenses/members?group_id=`, POST `/shared-expenses/` (`{group_id, description, amount, amounts?}`), GET `/shared-expenses/?group_id=`, GET `/shared-expenses/{id}`, PUT `/shared-expenses/{id}/settle`, DELETE `/shared-expenses/{id}` (payer only), GET `/shared-expenses/balances?group_id=`, POST `/shared-expenses/settlements`, GET `/shared-expenses/settlements?group_id=`, DELETE `/shared-expenses/settlements/{id}`, POST `/shared-expenses/{id}/reminder`

### Messages — `Routers/messages.py`
- GET `/messages/friends`, POST `/messages/`, GET `/messages/{user_id}`, DELETE `/messages/{id}`, PUT `/messages/{user_id}/read`, GET `/messages/`

### Notifications — `Routers/notifications.py`
- GET `/notifications/`, PUT `/notifications/{id}/read`

### Groups — `Routers/groups.py`
- POST `/groups/` (incl. `open_slots`), GET `/groups/`, GET `/groups/{id}` (detail incl. members + invite code; returns `group.id`), POST `/groups/join`, POST `/groups/{id}/members/{mid}/approve|reject|remove`, POST `/groups/{id}/transfer-admin`, PUT `/groups/{id}`, POST `/groups/{id}/avatar`, DELETE `/groups/{id}/avatar`, POST `/groups/{id}/leave`, DELETE `/groups/{id}`, GET `/groups/{id}/messages`, POST `/groups/{id}/messages`

### Chores — `Routers/chores.py`
- POST `/chores/`, GET `/chores/?group_id=`, GET `/chores/history?group_id=`, POST `/chores/{id}/complete`, PUT `/chores/{id}`, DELETE `/chores/{id}`
- **Schedules (new):** GET `/chores/schedules`, POST `/chores/schedules`, PUT `/chores/schedules/{id}` (permission-split, see §5), DELETE `/chores/schedules/{id}`, POST `/chores/schedules/generate`

### Rules — `Routers/rules.py`
- POST `/rules/`, GET `/rules/?group_id=`, PUT/DELETE `/rules/{id}`, POST `/rules/violations`, GET `/rules/violations?group_id=`, DELETE `/rules/violations/{id}`

### Reliability — `Routers/reliability.py`
- GET `/reliability/?group_id=`

### Vacancies — `Routers/vacancies.py`
- GET `/vacancies/`, GET `/vacancies/{group_id}/candidates`, PUT `/vacancies/{group_id}` (set open_slots, admin), POST `/vacancies/{group_id}/apply`

### Assistant — `Routers/assistant.py`
- GET `/assistant/analysis?group_id=`

### Personal Expenses — `Routers/expenses.py`
- POST `/expenses/`, GET `/expenses/` (filters), GET `/expenses/category-totals?month=`, GET `/expenses/monthly-total`, GET/PUT `/expenses/budget?month=`, POST `/expenses/recurring`, GET `/expenses/recurring`, PUT/DELETE `/expenses/recurring/{id}`, PUT/DELETE `/expenses/{id}`

### Team Ups — `Routers/team_ups.py`
- POST `/team-ups/`, GET `/team-ups/`, GET `/team-ups/mine`, DELETE `/team-ups/{id}`

### Settings — `Routers/settings.py`
- GET `/settings/`, PUT `/settings/account`, POST `/settings/avatar`, DELETE `/settings/avatar`, DELETE `/settings/account`, POST `/settings/email/request-change`, POST `/settings/email/confirm-change`, PUT `/settings/password`

---

## 8. Database Tables (PostgreSQL — 26+ tables)

- `users`, `student_profiles`, `match_preferences`, `blocked_pairs`
- `room_listings` (incl. vacancy-ish `spots`, education, lifestyle_preferences), `team_ups`
- `living_groups` (incl. `open_slots`, `invite_code`), `group_members` (role/status), `group_messages`
- `group_rules`, `rule_violations`
- `chores`, `chore_schedules` (+`reminder_time`, `last_reminder_date`), `chore_history`
- `expenses` (personal), `expense_settings` (budget), `recurring_expenses`
- `shared_expenses` (incl. `group_id`, `created_at`), `expense_shares`, `expense_settlements`
- `notifications`, `messages`
- `email_change_tokens`, `password_reset_tokens`, `alembic_version`

---

## 9. Key Business Rules (enforced in backend)

- **One active/pending group at a time** per user.
- Pending members cannot chat or be removed; only admins can approve/reject/remove/transfer/delete.
- **Sole admin cannot leave** (must transfer or delete).
- Group chat/most group endpoints require **active membership** (403 otherwise).
- Shared expense splits must cover **every active member exactly once** and sum to total.
- Penalties automatically add debt **violator → admin**.
- Reliability starts 100, capped 0–100 (see §5).
- Chore schedule edit: assignee may touch `reminder_time` only.
- Non-payer cannot delete shared expense; member cannot record rules/violations (admin only).
- Listings CRUD owner-only; non-owner PUT/DELETE → 404.

---

## 10. Current Known State / Open Items

- **Payment/expense-splitting question (proposed):** user asked "should we add payments in my split?" — answer given: split payments ALREADY exist (per-share settle + settle-up settlements + balance summary). Open question: what additional "payments" did the user mean (e.g. real payment gateway, deadlines, reminders)? Not resolved — pending user decision.
- Stale docs to avoid trusting: `FEATURE_TRACKING.md`, `SESSION_SUMMARY.md` (old 2026-08-18 state). Trust `SESSION_SUMMARY_2026-08-20.md` + this file.
- Tunnels are ephemeral; after restarts always refresh `frontend/.env` + restart frontend.
- No backend test suite; verification is done by hand (mint JWT via venv python + `create_access_token`, hit endpoints with curl/Invoke-RestMethod; test users/groups cleaned from DB afterward).
- One test notification (id ~154) and possibly small leftovers remain in DB from alarm testing — harmless.

---

## 11. Conventions & Gotchas for Future Work

- **Always use venv python** for backend scripts/imports (`jwt` only exists in `backend/venv`).
- To mint tokens for API tests, run with `$env:JWT_SECRET_KEY` + `$env:DATABASE_URL` set inside the venv, then `from app.auth import create_access_token`.
- `requestValidationError` → 422 with human-readable `detail` (formatted in `main.py`).
- New DB columns are added either via alembic or direct `ALTER TABLE ... IF NOT EXISTS` + model update (recent reminder-alarm columns were added ad-hoc).
- Frontend: all `alert()` replaced by toasts; destructive actions use `ConfirmDialog`; UI kit under `components/ui/`.
- `npm run lint` and `npm run build` must stay clean after frontend changes.
- When adding a new page, register it in the Dashboard sidebar AND `App.jsx`.

---

## 12. Suggested Next Steps (if the user asks)

1. Resolve the "payments in split" intent (gateway vs reminders vs deadlines).
2. Real-time group chat via WebSockets (explicitly deferred, non-MVP).
3. Deployment (Docker / Render / Railway) using env vars instead of tunnel URLs.
4. Swap rule-based assistant for live LLM behind `OPENAI_API_KEY` (optional, per spec).