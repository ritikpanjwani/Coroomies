# CoRoomies — Full Project Audit Report

**Author:** Automated audit session (opencode)
**Date:** 2 October 2026
**Scope:** `backend` (FastAPI + psycopg + raw SQL), `frontend` (React + Vite), PostgreSQL database, deployment/tunnels.
**Method:** Source inspection + live API testing against the running stack (PM2-hosted backend on `127.0.0.1:8000`), live database queries (read-mostly). Findings below are **reproduced live** unless explicitly marked "source inspection". No code was modified during this audit. Where live claims appear, they were executed against the running system.
**Reconciliation note:** This report supersedes/complements `SECURITY_AUDIT.md` (4 Sep 2026). IDs from that document (`C1–C3`, `H1/H2`, `M1–M5`, `L1–L6`) are reused; new findings continue from `C4`, `H3`, `M6`, `L7`.

---

## 1. Executive Summary

CoRoomies is a functional roommate-management app (auth/profile/expenses/groups/shared-expenses/chores/rules/reliability/messages/matches/listings/team-ups/assistant/settings). The three critical issues previously fixed (C1–C3: OTP leak, email-change code leak, missing rate limits) were **verified again live and work** — OTPs do not appear in responses, and login/register/reset endpoints now enforce rate limits (register 6/60s/IP, login additionally 6/60s per identifier; all confirmed by burst tests).

The audit found **two new critical-class defects**, both live-confirmed:

- **C4 — Account deletion is broken for every user.** `DELETE /settings/account` returns HTTP 500 for *all* users because it issues `DELETE FROM personal_expenses`, a table that does not exist (the real table is `expenses`). This is a schema/drift failure. Worse: because every user-referencing foreign key in the database is `ON DELETE CASCADE` — including `living_groups.created_by` — a naive fix would cascade-delete entire groups (all members' shared expenses, chores, messages) whenever the creator deletes their account.
- **C5 — Departed group members retain full admin powers, including group deletion.** A membership row with status `'left'` is not rejected by the admin check or the group-detail handler. Reproduced live: a member promoted to admin, who then left the group, could still read the full group detail *and successfully DELETE the group*, destroying the group data for the remaining members.

Four new high-severity issues were confirmed: the global matching table is exposed to any authenticated user (privacy: everyone's pairing assignments, compatibility scores, and blocking reasons), duplicate member IDs in a shared expense silently double-charge a member, completing a *weekly-recurring chore* crashes to HTTP 500 (an index-out-of-range bug), and messaging/collapsed friend lists are accessible before a match is approved (including email leakage on pending connections).

Overall, the web application layer shows good hygiene in several important areas (ownership enforcement on deletions, correct non-member 403s, generic forgot-password responses, no `innerHTML`/`eval` in the frontend, no committed secrets). The principal risks are concentrated in **authorization/status handling on group membership**, **finance data integrity** (amount validation and duplicate shares), **one long-standing schema-drift bug**, and **privacy exposure on the matching/friend features**.

> Scope note on test data: live tests created a number of test accounts, groups, expenses, messages, etc. These were cleaned up directly in the database at the end of testing (account-deletion is broken; see C4). Cleanup was limited to rows belonging to the six test usernames and their audit groups; unrelated user data was verified untouched. This direct data modification is disclosed here because the application provides no working path to remove test accounts.

---

## 2. Critical

### C4 — Account deletion is permanently broken (HTTP 500) and a naive fix would cascade-delete whole groups

| Field | Value |
|---|---|
| ID | C4 |
| Severity | Critical |
| Feature | Settings → Account / `DELETE /settings/account` |
| Problem | Account deletion fails for **every** user with HTTP 500 because the code deletes from a table that does not exist. Additionally, the database foreign-key layout makes wrongful cascade deletion a live hazard. |
| Exact location | `backend/app/Routers/settings.py:244` — `cursor.execute("DELETE FROM personal_expenses WHERE user_id = %s", (user_id,))`. No table named `personal_expenses` exists; the personal-expenses table is `expenses` (see `expense_models.py` / `expenses.py`). Error is unhandled → generic 500 handler (`backend/app/main.py:39-45`). |
| Repro | Call `DELETE /settings/account` with any valid bearer token for any user. → `500 {"detail": "Something went wrong on our side. Please try again."}` (SQL error `relation "personal_expenses" does not exist`). Confirmed for multiple users, including a plain profile-only account. |
| Expected vs Actual | Expected: 200 and the account removed. Actual: 500 for all users; the user row is never deleted. |
| Why it matters | Users cannot delete their accounts at all. Separately, the FK design (verified via `information_schema`): `living_groups.created_by` → `users(id) ON DELETE CASCADE`, and *all* of `group_members`, `chores`, `chore_history`, `chore_schedules`, `group_rules`, `rule_violations`, `group_messages`, `shared_expenses`, `expense_shares`, `expense_settlements` cascade from `living_groups`. So if the table-name bug is fixed and the code proceeds to `DELETE FROM users`, deleting a user who founded a group destroys the entire group — including all other active members' shared-expense balances, chores, rules, messages, and reliability history. |
| Recommended fix | 1) Change `personal_expenses` → `expenses` (or delete `expense_settings`/`recurring_expenses` explicitly; those all `CASCADE` so `expenses` is enough). 2) Before deleting a user, handle groups they created: either block deletion while the user is a founder (requiring group handover), soft-delete the user, or re-assign groups before the `users` delete. 3) Prefer explicit per-row deletes (in a transaction) over relying on `CASCADE` for user-owned groups. |

### C5 — Departed members retain admin powers and can delete the group

| Field | Value |
|---|---|
| ID | C5 |
| Severity | Critical |
| Feature | Groups — role/membership authorization |
| Problem | Membership status (`active`/`left`/`pending`) is not enforced. A member who left the group (status `'left'`) keeps whatever role they held and is still treated as a full member with admin rights, including group deletion. |
| Exact location | `backend/app/Routers/groups.py` — the admin helper checks `role` only (the `SELECT id, role, status` at line 61 fetches `status` but the checks use it inconsistently), and the `GET /groups/{group_id}` detail handler (around lines 183-249) only verifies that *some* membership row exists, not that it is `'active'`. Compare `vacancies.py:229` which correctly checks `status='active'`. |
| Repro | (live) 1) Bob joins "Audit Fin" via invite; 2) owner promotes Bob to admin; 3) Bob transfers/leaves (membership now `status='left'`); 4) Bob calls `GET /groups/32` → **200** with full detail incl. member roster; 5) Bob calls `DELETE /groups/32` → **200**, group deleted. |
| Expected vs Actual | Expected: former member → 403/404. Actual: departed (or even *pending* — see M9) members gain persistent read+write access; a departed admin can silently delete the group for everyone. |
| Why it matters | Ex-members can attack/inspect/destroy shared financial and planning data of people who are no longer their roommates. Combined with C4's cascade design, deleting a group via a departed admin erases other members' expense data with no recovery path. |
| Recommended fix | Centralize an `active_member()` helper that requires `status='active' *and* membership row present on every group op (detail GET, update, delete, transfer, roles, all sub-resources). On leave, delete the membership row entirely or force `role='member'` + `status='left'` and block all access based on status. |

---

## 3. High

### H3 — `/matches/stable` exposes the global matching table to any authenticated user

| Field | Value |
|---|---|
| ID | H3 (relates to H2) |
| Severity | High |
| Feature | Matches — stable matching |
| Problem | `GET /matches/stable` returns the complete global pairing table — not just the caller's match — including every other user's pairing assignment, names, compatibility scores, and blocking-pair reasons. |
| Exact location | `backend/app/Routers/matches.py:375-460`. `_fetch_all_profiles(cursor)` pulls every user's profile; `pairs_with_names` (410-419), `blocking_with_names` (421-430), and `unmatched_with_names` (432-438) are returned unconditionally with only the caller's identity derivable. The caller's own match is also embedded (`my_pair`, 440-453). |
| Repro | (live, with pre-existing real users) `GET /matches/stable` returned `pairs` containing other real users' pairings (e.g., Ritik↔vivek) plus compatibility scores, blocking reasons, and unmatched users. |
| Expected vs Actual | Expected: only the caller's match/suggestions. Actual: everyone's private pairing graph is readable by any session. |
| Why it matters | Privacy violation at platform scale — users' compatibility preferences and pairings are confidential; also enables scraping the entire user graph. (H2, already open, covers email/preference exposure on `/matches`, `/matches/reverse`, `/listings`, `/team-ups`.) |
| Recommended fix | Return only `my_match` (and adjacent suggestions) to non-…-callers; do not serialize other users' pairings. Consider admin-only aggregate views. |

### H4 — Duplicate `member_ids` in a shared expense double-charges a member

| Field | Value |
|---|---|
| ID | H4 |
| Severity | High |
| Feature | Group expenses — create shared expense |
| Problem | `member_ids` is not de-duplicated. Submitting the same member twice creates two share rows for that member, charging them twice for one expense. |
| Exact location | `backend/app/Routers/shared_expenses.py` create handler (~lines 150-245). The loop inserts one share per entry without checking for duplicates (inserts both occurrences, line ~227). |
| Repro | (live) Create expense total 100 with `member_ids:[bob,bob], amounts:[50,50]` → HTTP 200; bailout + balances show Bob owes 100 (two £-share rows), i.e. he is double-charged. The front-end multi-select similarly does not prevent re-adding the same member. |
| Expected vs Actual | Expected: 400 on duplicates (or single bill per member). Actual: 200 and duplicated share rows. |
| Why it matters | Financial-correctness bug producing incorrect balances and settlement amounts, eroding trust in group money math; also affects `Σ shares == total` only by accident of the duplicated amounts. |
| Recommended fix | Validate `len(set(member_ids)) == len(member_ids)` → 400 `"Duplicate members"`, and dedupe the amounts path similarly. |

### H5 — Completing a weekly-recurring chore returns HTTP 500

| Field | Value |
|---|---|
| ID | H5 |
| Severity | High |
| Feature | Chores — recurring completion |
| Problem | Completing a chore with recurrence `weekly` crashes with an unhandled exception (500) because the code reads a column index past the end of the `SELECT` list. |
| Exact location | `backend/app/Routers/chores.py:455` — `next_due_day = row[8]`, while the join `SELECT` returns 7 columns (indices 0–6) → `IndexError: tuple index out of range`. |
| Repro | (live) Create chore with `recurrence: "weekly"`, assign to member, `POST /chores/{id}/complete` → **500**. (`recurrence` accepts only `none|weekly|monthly`; `daily` → 400 "Invalid recurrence type" — validation exists.) |
| Expected vs Actual | Expected: 200 and a new due date computed. Actual: 500, chore never scheduled. |
| Why it matters | Core daily-life feature is broken specifically for recurring chores; also indicates column-index fragility across several routers that index `row[...]` positionally (risk of more latent bugs). |
| Recommended fix | Rewrite the completion query to return the needed columns explicitly (or fetch `next_due_day` via a second targeted query). Consider named access for these reads. |

### H6 — Chat and friend-looking lists accessible before a match is approved; emails leaked for pending connections

| Field | Value |
|---|---|
| ID | H6 |
| Severity | High |
| Feature | Messages / roommate requests |
| Problem | `_are_connected` treats a `'pending'` roommate request as a valid connection. So a requester can message a user who has not yet accepted, and `/messages/friends` returns the other user's **full email address** even when the connection is still pending. |
| Exact location | `backend/app/Routers/messages.py` — `_are_connected` (post-create check; the `status` values considered connected include `pending`), `POST /messages` gate, `GET /messages/friends` (the `SELECT id, name, email` at line 76 path feeds pending rows into the friends list). |
| Repro | (live) 1) Carol sends a roommate request to Bob (pending). 2) With only that pending request, Bob: `GET /messages/{carol_id}` → **200**; `POST /messages` to Carol → **200**; `GET /messages/friends` → includes Carol's entry **with her full email** despite the connection not being accepted. Not-connected users still get 403 (good). |
| Expected vs Actual | Expected: no chat until the connection is `'accepted'`; email hidden for pending. Actual: messaging begins immediately and email addresses are handed out pre-approval. |
| Why it matters | Harassment vector (strangers messaging before consent) and privacy leakage of contact emails (spamming/scraping — ties into H2). |
| Recommended fix | Treat only `status='accepted'` as connected for chat; never serialize `email` below the connection-confirmed threshold; redact email from `/messages/friends` responses. |

---

## 4. Medium

### M6 — `PUT /profile/` is full-replace: partial updates wipe unmentioned fields

| Field | Value |
|---|---|
| ID | M6 |
| Severity | Medium |
| Feature | Profile update |
| Problem | The profile endpoint performs a whole-row `UPDATE` with every column, so any omitted field is set to `NULL`/default → silent data loss. It behaves like full `PUT`, not patch semantics. |
| Exact location | `backend/app/Routers/profile.py` — `PUT /profile/` handler (SQL `UPDATE student_profiles SET …` from the request body with no "only provided fields" filtering). |
| Repro | (live) Sending `{"cleanliness": 4}` to update one field nulls out previously set `bio`, amenities, etc. (verified via subsequent `GET /profile`). |
| Expected vs Actual | Expected: only the sent fields change. Actual: all omitted fields are erased. |
| Why it matters | The redesigned front-end relies on patch-style updates; accidental partial submissions (even a single-field net) destroy user profile content. Same pattern risk in documents/lists if clients always send full objects — safer to implement partial update server-side. |
| Recommended fix | Filter the `UPDATE` to the keys present in the payload (`exclude_unset` or explicit whitelist), and validate enum/range per field (validation itself exists — `cleanliness=99` correctly 422s). |

### M7 — Personal-expense `amount` is unconstrained: 0 and negatives accepted; huge values 500

| Field | Value |
|---|---|
| ID | M7 |
| Severity | Medium |
| Feature | Personal expenses |
| Problem | The create model `ExpenseCreate.amount` in `backend/app/schemas.py:106` is a bare `float` (no `gt=0`, no upper bound). Amounts of `0` and `-5.5` are accepted (corrupting monthly totals/budgets), and `1e308` overflows the DB column → HTTP 500. |
| Exact location | `backend/app/schemas.py:106` (`amount: float`), used by `expenses.py` create route (line 10 imports `ExpenseCreate`); DB column is `Numeric(10,2)` (`expense_models.py:18/33`). Meanwhile the router-local `ExpenseUpdate`/`RecurringExpenseCreate` models *do* use `Field(gt=0)` (expenses.py:28/81) — an inconsistency that produced exactly this gap. |
| Repro | (live) `POST /expenses` with `amount:0` → 200; `amount:-5.5` → 200; `amount:1e308` → 500 (DB overflow). Negative+zero entries polluted the monthly-total response (94.5 = 100 − 5.5 + 0). |
| Expected vs Actual | Expected: 422 for amount ≤ 0 (and within Numeric(10,2)); actual: silent corruption and a crash. |
| Why it matters | Financial-data integrity and 500s triggered by user input; mirrors H4's theme that finance paths must constrain money input. |
| Recommended fix | Add `Field(gt=0, le=9999999999)` + money `Decimal`; align all amount models in one place (schemas.py) so router-local duplicates can't drift. |

### M8 — Reset-password confirms account existence (404) while forgot-password is generic

| Field | Value |
|---|---|
| ID | M8 (refinement of M5) |
| Severity | Medium |
| Feature | Auth — password reset |
| Problem | Account enumeration: `POST /auth/forgot-password` correctly returns a generic 200, but `POST /auth/reset-password` on an unknown identifier returns `404 "No account found"` — a direct contradiction that reveals whether an account exists. |
| Exact location | `backend/app/Routers/auth.py` — reset-password handler (`raise HTTPException(404, "No account found")`). |
| Repro | (live) `POST /auth/reset-password` with unknown email + code → **404**. `POST /auth/forgot-password` with unknown email → generic **200**. |
| Expected vs Actual | Expected: identical responses for known/unknown. Actual: distinguishable. |
| Why it matters | Feeds username/email mining (mass-enumeration), weakening the earlier C1 fix. |
| Recommended fix | Return generic 200 for both, deferring errors until the final reset step, and keep rate limits (already present) applied. |

### M9 — Pending group members can read the full group detail + roster before approval

| Field | Value |
|---|---|
| ID | M9 |
| Severity | Medium |
| Feature | Groups — join & detail |
| Problem | A user whose membership is `'pending'` (joined via invite code, awaiting admin approval) can already `GET /groups/{id}` and see the entire member roster (names, roles, statuses) plus group fields, before any approval. |
| Exact location | `backend/app/Routers/groups.py` detail handler — membership check ignores `status`. |
| Repro | (live) Carol joins "Audit Fin" via invite → status `pending` → `GET /groups/32` returns **200** with full `members[]` (all names/roles). Non-members still correctly get 403. |
| Expected vs Actual | Expected: only admin approve/reject flows may reveal group internals pre-approval. Actual: pending outsiders see the roster. |
| Why it matters | Privacy of group membership enumeration; combined with C5 shows status is generally under-enforced in groups. |
| Recommended fix | Require `status='active'` before returning any group detail to that user. |

### M10 — `PUT /messages/{id}/read` succeeds even for nonexistent messages

| Field | Value |
|---|---|
| ID | M10 |
| Severity | Medium (low-verification-weight) |
| Feature | Messages — read receipts |
| Problem | Marking a nonexistent message as read returns HTTP 200 instead of 404, and no ownership check is applied against receiver. |
| Exact location | `backend/app/Routers/messages.py` read handler. |
| Repro | (live) `PUT /messages/999999/read` → **200**. |
| Expected vs Actual | Expected: 404. Actual: 200 (no-op). |
| Why it matters | Minor correctness/consistency; also means read-receipts can't be abused for enumeration (so Low-Medium). |
| Recommended fix | Verify message exists and is owned by the caller; else 404. |

---

## 5. Low

### L7 — Avatar upload validates file extension only, not content

| Field | Value |
|---|---|
| ID | L7 (expansion of M2) |
| Severity | Low (currently constrained) |
| Feature | Settings — avatar upload |
| Problem | Upload accepts any file whose *name* ends in `.jpg/.jpeg/.png/.gif/.webp` and whose client-supplied `type` is an image. Content is not inspected. |
| Exact location | `backend/app/Routers/settings.py` avatar endpoint (extension check around line ~162 incl. size cap < 5 MB); served via `app.mount("/uploads", StaticFiles(...))` (`backend/app/main.py:109`) which guesses content-type from the file extension. |
| Repro | (live) Uploaded a file containing arbitrary text (`<?php … ?>`) named `fake.png` with `type=image/png` → accepted, stored as `/uploads/avatars/144_5b57e4c61232.png`. |
| Expected vs Actual | Expected: reject non-image. Actual: stored. Exploitability is dampened because it is served with `Content-Type: image/png` (not executed); file is removed on user deletion attempt. |
| Why it matters | Defense-in-depth: a stricter same-origin/XSS or polyglot consideration; also allows junk storage abuse. |
| Recommended fix | Verify magic bytes (PNG/JPEG/GIF/WebP signatures) and ideally re-encode; refuse unknown extensions outright. |

### L8 — Single front-end JS chunk exceeds 500 kB (no route code-splitting)

| Field | Value |
|---|---|
| ID | L8 |
| Severity | Low |
| Feature | Front-end build |
| Problem | `npm run build` emits one `index-*.js` at **516 kB** minified (135 kB gzip) with a Vite warning; no `dynamic import()` splitting. |
| Exact location | `frontend/` (Vite config / App routing). |
| Why it matters | First-load cost on the tunneled/LAN setup; marginal on modern connections. |
| Recommended fix | Lazy-load routed views (`React.lazy`) and split vendor bundles. |

### L9 — ESLint: 15 problems (10 errors, 5 warnings) pre-existing

| Field | Value |
|---|---|
| ID | L9 |
| Severity | Low |
| Feature | Front-end code quality |
| Problem | `npx eslint src` → 15 problems: `GroupExpenses.jsx` (2 unused vars), `Household.jsx` (2 unused vars), `Matches.jsx` (5× `react-hooks/set-state-in-effect` with stale eslint-disable comments), `Profile.jsx` (1 same rule). None introduced by the redesign effort. |
| Recommended fix | Remove dead code, resolve effects to callbacks/derived state, delete the now-unused eslint-disable directives. |

### L10 — `/auth/me` returns only `{message, user_id}`; front-end relies on it in 4 pages

| Field | Value |
|---|---|
| ID | L10 |
| Severity | Low (informational) |
| Feature | Auth bootstrap |
| Problem | `GET /auth/me` returns only `{"message": "You are authenticated", "user_id": N}`; consumers (`chat.jsx:48`, `Groups.jsx:110`, `Listings.jsx:598`, `Household.jsx:1142`) must fetch name/email separately. Errors out with 401 for garbage tokens (correct). |
| Recommended fix | Optionally enrich with `name/email/avatar_url` to save a round-trip per page. |

### L11 — Direct `setState` in effect bodies (matches/profile)

| Field | Value |
|---|---|
| ID | L11 |
| Severity | Low |
| Feature | Front-end rendering |
| Problem | Several `useEffect` bodies call `setState` (via `loadX`) synchronously, which React flags as cascading renders (`react-hooks/set-state-in-effect`) — the lint errors in L9. |
| Recommended fix | Move fetches into event handlers or use derived data/`useSyncExternalStore` where possible. |

(Also carried from `SECURITY_AUDIT.md`, unchanged and still open: **H1** long-lived JWT stored in `localStorage`, no revocation on password change; **H2** emails/preferences exposure on matches/listings/team-ups; **M1** `*.trycloudflare.com` CORS regex with credentials; **M2** avatar upload validation (see L7); **M3** incomplete account deletion (resolved-live — superseded by C4, the current blocker is the missing `personal_expenses` table; the cascade concern is new and more severe); **M4** no security headers; **M5** enumeration (refined as M8); **L1** OTPs stored plaintext; **L2** new DB connection per request, no pooling; **L3** reminder loop swallows errors; **L4** verbose traceback logging; **L5** front-end console.error noise; **L6** plain HTTP in dev.)

---

## 6. Security Findings (grouped by category)

**Authentication / session**
- ✅ Rate limiting effective on register/login/forgot/reset (C3) — live burst tests: register 6/60s/IP (8th request 429), login 6/60s per identifier (7th–8th 429).
- ⚠️ H1 — JWT in `localStorage`, non-revocable, 24 h lifetime; survives password change.
- ⚠️ M8 — reset-password leaks account existence (404).
- ✅ C1 — OTP never in response body; generic forgot-password reply.

**Authorization**
- ❌ C5 — departed (status `left`) members keep admin powers incl. group deletion (live).
- ❌ M9 — pending members read full group detail/roster (live).
- ⚠️ H6 — chat enabled for `pending` connections (live).
- ✅ Non-members 403 on groups, shared expenses, group chat; correct ownership 404s on expense/listing deletes; message delete restricted to sender (all live).

**IDOR**
- None found. Deletion of another user's personal expense → 404 "Expense not found"; deleting another's listing → 404 "Listing not found or you are not the owner"; `DELETE /messages/{id}` from non-sender → 403. All verified live.

**Input validation / finance integrity**
- ❌ H4 — duplicate `member_ids` double-charge (live).
- ❌ M7 — personal expense `amount: 0/-5.5/1e308` (live; last → 500).
- ❌ H5 — weekly recurring chore complete → 500 (live).
- ✅ Shared-expense amount ≥ 0 (exclusive gt=0 on total, `ge=0` on share amounts), sum mismatch → 400, settle idempotency (double-settle 404) (all live).

**XSS / file uploads**
- ✅ No `innerHTML`, `document.write`, `eval`, or `dangerouslySetInnerHTML` in `frontend/src` (React default escaping).
- ⚠️ M2/L7 — avatar upload extension-only; stored+served same-origin but content-type is extension-driven (live reproduction: arbitrary text in `fake.png` accepted).

**Secrets / config**
- ✅ No credentials committed; `backend/.env`, `frontend/.env` are git-ignored.
- ⚠️ `DEV_MODE=true` present in `backend/.env` (console OTP logging) — must be `false` in production. SMTP not configured.

**API/transport security**
- ⚠️ M1 — CORS regex allows *any* `*.trycloudflare.com` with `allow_credentials=True`.
- ⚠️ M4 — no CSP/HSTS/X-Content-Type-Options/X-Frame-Options headers.
- ⚠️ L6 — plain HTTP locally; tunnels use HTTPS via Cloudflare.

**Database security**
- ⚠️ Local Postgres uses default superuser `postgres` with a simple password (`<redacted-db-password>`) — acceptable locally, not for production exposure.
- ⚠️ L2 — no connection pooling; fresh `psycopg.connect()` per request.
- ⚠️ C4 — permissive global `ON DELETE CASCADE` across the schema turns user deletion into group data loss.

**Privacy**
- ❌ H3 — `/matches/stable` returns the global pairing table (live).
- ⚠️ H2 — full emails + preference profiles on matches/listings/team-ups (source inspection, corroborated by H3/H6 live evidence).
- ❌ H6 — emails returned in `/messages/friends` for pending connections (live).

---

## 7. Feature Test Results

Live against the running stack (test accounts: Amy/Bob/Carol + staggered-rate burst users; all removed after testing).

| Feature | Result | Notes |
|---|---|---|
| Register | ✅ Pass | Duplicate email → 400; duplicate username → 400; weak password → 422 (min 8); invalid email → 422; rate limit 6/60s/IP confirmed. |
| Login | ✅ Pass | Correct 200; wrong/nonexistent 401 "Invalid credentials"; rate limit (identifier 6/60) confirmed. |
| `/auth/me` | ✅ Pass | 200 with user_id; garbage token → 401. |
| Forgot/reset password | ⚠️ Partial | Flow works + OTP only in server logs; **M8** enumeration on reset (404); OTP single-use (reuse → 400) ✅. |
| Profile | ⚠️ Partial | Validators OK (enum/range); **M6** PUT full-replace data loss. |
| Personal expenses | ❌ Fail | **M7** amount=0/−5.5 accepted; 1e308 → 500; NaN body → 422 (correct); monthly total polluted by invalid entries; DELETE ownership OK. |
| Groups | ❌ Fail | **C5** departed admin can delete group; **M9** pending member reads detail; invalid invite → 404; non-member 403 ✅; transfer-admin is promotion-only (by design, multi-admin). |
| Shared expenses | ❌ Fail | **H4** duplicate member double-charge; sum mismatch 400 ✅; amount=0 → 422 ✅; negative share 422 ✅; non-member 403 ✅; settle = PUT (POST 405) ✅; double-settle 404 ✅; balances accurate. |
| Chores | ❌ Fail | **H5** weekly completion → 500; recurrence validation (none/weekly/monthly) ✅. |
| Rules/violations | ✅ Pass | Admin-only create (403 non-admin); violations tracked; penalties feed balances/reliability. |
| Reliability | ✅ Pass | Score computed from shares/chores/violations; `/reliability/?group_id=` works. |
| Messages | ❌ Fail | **H6** pending-connection chat + email leak; not-connected 403 ✅; DELETE by non-sender 403 ✅; **M10** read on missing id 200. |
| Notifications | ✅ Pass | Send/list/mark-read work. |
| Matches | ❌ Fail | **H3** stable endpoint leaks global pairings; preferences/rankings endpoints otherwise functional. |
| Listings | ✅ Pass | Create/list/read/detail; cross-user delete → 404 (ownership OK); public read by non-owner (by design). |
| Vacancies | ✅ Pass | `GET /vacancies/?group_id=` works; wrong path → 405. |
| Team-ups | ✅ Pass | Create/post OK; compatibility ranking. |
| Assistant | ✅ Pass | `GET /assistant/analysis?group_id=` returns health/conflicts/suggestions (POST → 405). |
| Avatar upload | ⚠️ Partial | Upload works + files served; **M2/L7** extension-only, content unvalidated. |
| Account deletion | ❌ Fail | **C4** 500 for all users. |
| Email change | ✅ Pass | C2 flow functional; OTP gated to new email + console; notification to old address. |
| Rate limiting | ✅ Pass | Re-verified live (all endpoints that have limits). |

---

## 8. API Audit

- **Routers:** 17 (auth, profile, matches, expenses, requests, listings, shared_expenses, messages, notifications, groups, chores, rules, reliability, vacancies, assistant, team_ups, settings). **Endpoints:** 106 per `openapi.json` (live).
- **Auth:** Bearer JWT via `Authorization` header (`allow_credentials` CORS notwithstanding). `get_current_user_id` dependency used broadly; levels of enforcement verified per feature.
- **Error handling:** a global handler (`main.py:39-45`) converts unexpected exceptions to `500 {"detail": "…"}` and logs the traceback — good (no internal info leaked to client), but it *masks* true root causes such as C4/H5; those tracebacks are only visible in server logs.
- **Status-code hygiene:** ownership failures use 404 (not 403) for expenses/listings, i.e. "not found + not yours" collapse — acceptable (prevents enumeration) though occasionally misleading; genuine non-member access uses 403 correctly.
- **Conventions:** several endpoints rely on query parameters that other features expose as paths (e.g. `/vacancies/?group_id=`, `/reliability/?group_id=`, `/assistant/analysis?group_id=`) → wrong-path 405s are a UI-surface consistency smell, not a security issue.
- **Rate limiting** (`backend/app/rate_limit.py`, in-memory fixed window; `cf-connecting-ip` aware) verified live (see §6).

## 9. Database Audit

- **Schema:** 26 tables + `alembic_version`. Managed via Alembic history, but several routers issue hand-written SQL named differently from the models — the `personal_expenses` vs `expenses` mismatch (C4) is evidence of drift. Actual table set includes: `users, student_profiles, match_preferences, matching_rankings, blocked_pairs, roommate_requests, messages, notifications, expenses, recurring_expenses, expense_settings, living_groups, group_members, shared_expenses, expense_shares, expense_settlements, chores, chore_history, chore_schedules, group_rules, rule_violations, group_messages, room_listings, team_ups, password_reset_tokens, email_change_tokens` (+ alembic_version = 26).
- **Constraints:** all 34 user-referencing FKs are `CASCADE` except `chore_schedules.assigned_to` and `chores.completed_by` (`SET NULL`). All FKs are **valid (not violated)** — writes generally respect integrity; the C4 cascade hazard is a design issue, not a data-integrity violation.
- **Types:** `amount` is `numeric(10,2)` — overflow on unvalidated floats (M7); `settled_at`/dates stored as `varchar` (10) rather than `date` in several tables (normalization smell); no CHECK constraints guarding `amount > 0` at DB level (would have caught M7/H4-style inputs).
- **Indexes:** PKs present; secondary indexes limited (e.g. `group_members(group_id)`, `shared_expenses(group_id)`); fine at small scale.

## 10. UI/UX Audit

Static inspection only (no browser automation available; flag as limitation).

- **Structure:** single-page React app (13 `src/*.jsx` views, `api.js` wrapper). Auth-guarded routes redirect to login; `localStorage` token load.
- **Responsive/ordering:** CSS-in-JS via bundled styles (single CSS chunk 82 kB gzip 13 kB); sidebar + tab navigation on wide pages.
- **Bundle:** 516 kB JS (gzip 135 kB) in one chunk — L8.
- **State patterns:** fetch-on-mount via `useEffect`+`setState` (L11); several components re-fetch rather than share context — acceptable but chatty.
- **Feedback:** general loading/error banners present (`api.js` normalizes errors; console.error noise per L5); success toasts in expense/group actions.
- **Forms:** number inputs unclamped (amount 0/negative reachable in some flows — M7 UI-side), multi-select allows duplicate member addition (H4 UI-side).
- **Accessibility:** basic labels present; no obvious headings/log-role audit performed.

## 11. Code Quality

- **Backend:** raw SQL throughout routers; per-request connections (L2); models duplicated between `schemas.py` and per-router `BaseModel` classes → drift (proven by M7's inconsistent `amount` constraints; C4's table-name drift). Several 500+ line routers (`shared_expenses.py` ~1000 lines) — fair for feature size, but the positional `row[i]` indexing (H5) is fragile. Good: `@field_validator` use, centralized JSON-validation formatting (`main.py:13-28`).
- **Tests:** none present in the repo (`backend/tests` absent; no pytest config). No automated coverage — regression risk for C4/C5-style regressions is unmitigated.
- **Frontend:** ESLint 15 problems (L9); build clean; no dangerous DOM APIs; unused-code smell in small spots.
- **Docs:** `SECURITY_AUDIT.md` accurate and useful but now partially outdated by live verification (M3) and by new findings (C4/C5/H3–H6).

## 12. Passed Areas

- Auth rate limits, generic forgot-password, OTP single-use, OTP confined to server logs (C1–C3 live re-verified).
- Ownership enforcement (expenses, listings, messages) — no IDOR reproduced.
- Non-member 403s across groups/shared expenses/chat; join via bogus invite → 404.
- Shared-expense validation (sum matches, gt=0, negative-share rejection, settle idempotency).
- Rules/violations authorization; reliability scoring; notifications read flow; assistant analysis.
- Outward-facing security: no committed secrets, no XSS sinks in the React tree, structured 500s without stack leakage, correct 422 messages for malformed JSON (NaN bodies rejected cleanly).

## 13. Recommended Fix Order

1. **C4** — restore account deletion (table-name fix) AND make user deletion group-safe (reject while founder, or hand-over ownership; never raw `CASCADE` a user's groups).
2. **C5** — enforce `status='active'` in all group authorization paths (incl. detail GET, roles, delete).
3. **H5** — fix chore-completion column indexing (500-blocks core feature).
4. **H4** — reject duplicate `member_ids` (financial double-charge).
5. **H6** — lock chat to accepted connections; redact emails for pending friends.
6. **H3** — scope `/matches/stable` response to the caller.
7. **M7** — constrain `amount` on personal expenses (`gt=0`, bound, `Decimal`) and consolidate models into `schemas.py`.
8. **M9** — require active membership before returning group detail.
9. **M6** — make profile update partial (patch semantics).
10. **M8** — unify enumeration-proof responses for reset-password.
11. **M10** — validate message id/ownership on read.
12. **L-series + M-series cleanup** — avatar magic bytes (L7), code-splitting (L8), ESLint clean-up (L9/L11), `/auth/me` enrichment (L10), plus carried items H1/H2/M1/M2/M4/M5/L1–L6 at a convenient cycle.