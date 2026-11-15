# CoRoomies - Session Summary (2026-08-20)

## 🎯 THIS SESSION: Frontend Redesign + Phase 1 (Living Groups & Group Chat)

**Session Date:** 2026-08-20
**Focus:** 1) Complete UI redesign to a modern SaaS look, 2) Execute the MVP gap plan — Phases 1–4 done this session (Living Groups+Chat, Personal Expense upgrade, Debt Settlement, Chores+Rules+Reliability).

---

## 🎨 1. FULL FRONTEND REDESIGN

Rebuilt the entire frontend from the old Apple-style blue theme to a modern, premium teal→emerald design system using **Tailwind CSS v4**.

### Key Fix (Critical)
- **Bug found & fixed:** Tailwind was installed but `index.css` was never imported in `main.jsx`, so **no utility CSS was being generated**. Fixed the import — build CSS went from ~0 kB to ~50 kB of generated utilities.

### Component Library (New)
`frontend/src/components/ui/`:
- `Button.jsx` — 7 variants (primary/secondary/ghost/danger/dangerOutline/dark/success), 3 sizes, loading + fullWidth
- `Card.jsx`, `Badge.jsx` — 8 badge variants with dot support
- `Modal.jsx`, `ConfirmDialog.jsx` — reusable dialogs with Escape-to-close
- `Avatar.jsx` — gradient initial avatars (sm/md/lg)
- `Spinner.jsx`, `EmptyState.jsx`, `PageHeader.jsx`, `StatCard.jsx`
- `Field.jsx` — `Input` / `Select` / `Textarea` with labels, errors, hints
- `Icons.jsx` — 35+ inline SVG icons (+ `CopyIcon`, `CrownIcon`, `ShieldIcon` added this session)
- `Toast.jsx` — global toast notifications (`ToastProvider` + `useToast`)

### Pages Rebuilt (all in `frontend/src/`)
- `home.jsx`, `Profile.jsx`, `Matches.jsx`, `Requests.jsx`, `Expenses.jsx`, `Listings.jsx`, `chat.jsx`, `Notifications.jsx`
- `auth` → split-screen Login/Register with branded gradient panel
- `Dashboard.jsx` — icon sidebar + topbar shell, mobile slide-over menu
- All `alert()` calls replaced with toasts; destructive actions use `ConfirmDialog`

### Cleanup
- Removed dead template assets (`src/assets/*`) and unused `useAsync.js` hook

---

## ✅ 2. PHASE 1 — LIVING GROUPS + GROUP CHAT (COMPLETE)

Previously ranked #8 & #9 on the feature tracker ("Not Started"). Now fully implemented and verified.

### Backend (3 new files + edits)

**`backend/app/group_models.py`** — SQLAlchemy models:
- `LivingGroup` — id, name, description, unique invite_code, created_by, created_at
- `GroupMember` — group_id, user_id, role (`admin`/`member`), status (`pending`/`active`/`left`/`removed`), joined_at
- `GroupMessage` — group_id, sender_id, content, created_at (persisted)

**`backend/alembic/versions/create_living_groups.py`** — migration creating all 3 tables (FK cascades on delete)

**`backend/alembic/versions/merge_messages_notifications.py`** — fixed a **pre-existing migration fork**: the DB was on `67f861cb0d2c` but `messages.created_at`/`is_read` migrations were never applied (1:1 chat was broken in the DB). The merge chain now applies them.

**`backend/app/Routers/groups.py`** — 12 endpoints, registered in `main.py`:
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/groups/` | Create group (creator = admin) |
| GET | `/groups/` | My groups (role, status, member count) |
| GET | `/groups/{id}` | Detail incl. members + invite code (admin-only) |
| POST | `/groups/join` | Join by invite code → *pending* request + admin notification |
| POST | `/groups/{id}/members/{mid}/approve` | Admin approves pending join |
| POST | `/groups/{id}/members/{mid}/reject` | Admin declines pending join |
| POST | `/groups/{id}/members/{mid}/remove` | Admin removes active member |
| POST | `/groups/{id}/transfer-admin` | Admin hands over role |
| POST | `/groups/{id}/leave` | Leave (blocked for sole admin) |
| DELETE | `/groups/{id}` | Admin deletes group (cascades members + messages) |
| GET | `/groups/{id}/messages` | Group chat history (active members only) |
| POST | `/groups/{id}/messages` | Send group message |

### Business Rules Enforced
- **One active group at a time** — a user with a `pending` or `active` membership cannot create/join another until it's resolved
- Pending members cannot chat or be removed
- Only admins can approve/reject/remove/transfer/delete
- Sole admin cannot leave (must transfer or delete)
- 8-char invite codes generated via `secrets` (collision-safe)

### Frontend — `frontend/src/Groups.jsx` (new)
- Two-panel layout (group list ↔ detail) with mobile toggle
- Create-group modal + join-by-code modal (auto-uppercase code input)
- Members panel: role badges, pending-request approve/decline cards (admin), active members with join date, admin actions (make admin / remove)
- Invite code display with copy-to-clipboard button (admin only)
- Group chat: persisted history, 3s auto-refresh, auto-scroll, sender-name on others' messages, gradient bubbles for own messages
- Confirm dialogs for leave / delete / remove / transfer
- New **"Living Groups"** nav item added to the Dashboard sidebar

---

## 🐛 BUGS FIXED THIS SESSION

1. **Tailwind never generating CSS** — missing `import "./index.css"` in `main.jsx`
2. **Migration fork** — `messages.created_at`/`is_read` never migrated (merged branches; chat DB columns now present)
3. **psycopg3 `IN %s` syntax error** — tuple params not expanded; replaced with `status = ANY(%s)` + list
4. **`notifications.is_read` NOT NULL violation** — `_notify()` now inserts `is_read = FALSE`

---

## ✅ VERIFICATION PERFORMED

- `alembic upgrade head` — applied cleanly (incl. merge + new tables)
- Backend imports OK; all 12 group routes registered
- **Full e2e API test passed**: create → join by bad code (rejected 404) → join by code (pending) → blocked from creating while pending → approve → send/read messages → transfer admin → remove old admin → removed user blocked from chat → sole-admin leave blocked (400) → delete group → empty state
- `npm run lint` — clean (0 errors)
- `npm run build` — passes (~344 kB JS / 50.8 kB CSS)
- Test users cleaned up from DB afterward

---

## 🛠️ FILES CREATED / MODIFIED

**New — Backend:**
- `backend/app/group_models.py`
- `backend/app/Routers/groups.py`
- `backend/alembic/versions/create_living_groups.py`
- `backend/alembic/versions/merge_messages_notifications.py`

**Modified — Backend:**
- `backend/app/main.py` (register groups router)
- `backend/alembic/env.py` (import group models)

**New — Frontend:**
- `frontend/src/Groups.jsx`

**Modified — Frontend:**
- `frontend/src/Dashboard.jsx` (Groups nav item + page)
- `frontend/src/components/Icons.jsx` (+CopyIcon, CrownIcon, ShieldIcon)
- `frontend/src/index.css`, `frontend/src/main.jsx`, `frontend/src/App.css`
- All page components rebuilt with Tailwind + component library
- `frontend/src/components/ui/*` (component library, new)

---

## 📊 PROJECT STATUS

```
MVP Gap Plan:
├── Phase 1: Living Groups + Group Chat  ✅ COMPLETE (this session)
├── Phase 2: Personal Expense upgrade     ⬜ next
├── Phase 3: Shared Expenses + Debt Settlement
├── Phase 4: Chores + Rules/Penalties + Reliability
├── Phase 5: Vacancies + Matching
└── Phase 6: AI Conflict Assistant + Polish/Deployment
```

**Frontend:** Fully redesigned, lint-clean, production build passing
**Backend:** Living Groups fully implemented, e2e verified

---

**Generated:** 2026-08-20
**Next Priority:** Phase 5 — Vacancies + Matching (stable matching, reverse matching, blocking-pair detection, vacancies from living groups)

---

# ADDENDUM — REDESIGN: Rooms → "Find a Roommate" (Roommate Listings + Group Expenses)

**Same session, second task:** Redesign the Rooms + Living Groups flow around **student-to-student roommate finding** — no landlord/owner role, education displayed + filterable, and Shared Expenses moved to belong to a Living Group with automatic equal split.

## Backend Changes

### `backend/alembic/versions/roommate_listings_and_group_expenses.py` (new, revision `roommate_listings` — head)
Adds to existing tables (no table rewrites):
- `room_listings`: `deposit`, `spots`, `amenities`, `college`, `degree`, `stream`, `year`, `lifestyle_preferences`
- `student_profiles`: `college`, `degree`, `stream`, `year`
- `shared_expenses`: adds `group_id` → `living_groups.id` (ondelete CASCADE, NOT NULL after cleaning 1 legacy orphan row)

### `backend/app/listing_models.py`
RoomListing now has all new fields; `owner_id` FK `ondelete="CASCADE"`.

### `backend/app/schemas.py` / `profile_models.py`
`ProfileCreate` + `StudentProfile` now carry education fields (validators: strip, ≤150, year 1950–2100).

### `backend/app/Routers/listings.py` (rewritten)
- `ListingCreate` schema with all fields (deposit, spots, amenities, education, lifestyle_preferences)
- POST `/listings/` (owner-only), PUT `/listings/{id}` (owner-only, 404 otherwise), DELETE `/listings/{id}` (owner-only)
- GET `/listings/` with filters: `location`, `min_rent`, `max_rent`, `room_type`, `college`, `degree`, `stream`, `available_from`
- GET `/listings/{id}` detail; `_row_to_dict` mapper returns full listing incl. owner name

### `backend/app/Routers/profile.py`
PUT `/profile/` is now an **upsert** (`INSERT ... ON CONFLICT (user_id) DO UPDATE`) so a brand-new user can save education before creating a profile; GET returns education fields.

### `backend/app/Routers/shared_expenses.py` (rewritten — group-scoped, no manual participants)
- POST `/shared-expenses/` body `{group_id, description, amount}` — requires active membership; **auto-splits equally** across all active members; payer's share `paid`, others `pending`; returns `participants` + `each_person_pays`
- GET `/shared-expenses/members?group_id=` — active member list (members only)
- GET `/shared-expenses/?group_id=` — group's expenses with per-user shares (or all user's active groups when omitted)
- GET `/shared-expenses/{id}`, PUT `/shared-expenses/{id}/settle` (marks own share paid; auto-marks expense `settled` when no pending shares), DELETE `/shared-expenses/{id}` (payer only)
- All endpoints enforce active membership (403 for non-members) via `_require_active_member` / `_get_active_members` helpers

## Frontend Changes

### `frontend/src/Listings.jsx` (rewritten — "Find a Roommate")
- Listing form: headline, location, description, rent, deposit, room type, spots, amenities, available-from, **college, degree, stream, year**, lifestyle preferences
- Filter bar: location, min/max rent, college, degree, stream, room type, available date
- Listing detail modal; owner edit/delete; **"Message this student"** → 1:1 chat (connect flow)
- Cards show education badges + amenities

### `frontend/src/Expenses.jsx` (rewritten)
- **My expenses** tab unchanged (personal daily expenses)
- **Group expenses** tab: pick an active Living Group → auto-split preview, per-member share statuses (paid/pending badges), settle own share, delete own expense, refresh; group picker w/ empty state prompting group creation

### `frontend/src/Profile.jsx`
New **Education** section (college, degree, stream, year) rendered via Inputs; submits `year` as number/null.

### Misc
- `Dashboard.jsx` nav label "Rooms" → **"Find Roommate"**
- `Icons.jsx`: added `GraduationIcon` (+`SparklesIcon` already present)

## Bugs Fixed
- Listing create failed 500: `room_listings.status` is NOT NULL with no DB default — INSERT now supplies `'available'`
- `listings.py` unused-icon lint errors cleaned

## Verification
- Migration applied to head (`roommate_listings`); schema verified via `information_schema`
- Backend imports OK (venv python)
- **Full e2e passed**: profile education save (upsert) → listing create/filter by college+budget/update → non-owner update & delete blocked (404) → group create → 2 joins by invite code → admin approve → 3 active members → shared expense auto-split 900/3=300 each, payer paid + 2 pending → non-member create blocked (403) → member settles share → non-payer delete blocked (403) → payer delete OK → listing delete
- `npm run lint` clean, `npm run build` passes
- Test users + groups cleaned from DB (0 rows in listings/groups/members/expenses/shares)

---

# ADDENDUM 2 — PHASE 2: PERSONAL EXPENSE UPGRADE (COMPLETE)

**Third task this session:** Personal expense upgrade — edit expenses, filters, category totals/breakdown, monthly budget, and recurring (auto-logged) expenses.

## Backend

### Migration `personal_expense_upgrade` (new, head)
- `expense_settings` table — per-user `monthly_budget` (user_id PK, FK users.id ondelete CASCADE)
- `recurring_expenses` table — category, subcategory, amount, frequency (weekly/monthly/yearly), start/end date, `next_run_date`, `active` (default TRUE)

### `backend/app/expense_models.py`
Added `RecurringExpense` + `ExpenseSetting` models (Expense.user_id now ondelete CASCADE). Alembic env imports them.

### `backend/app/Routers/expenses.py` (rewritten — Phase 2)
| Endpoint | Purpose |
|---|---|
| POST `/expenses/` | Add expense (unchanged) |
| GET `/expenses/` | **Filters:** `category`, `month` (YYYY-MM), `start`/`end` date range |
| GET `/expenses/category-totals?month=` | Per-category totals + counts + grand total for a month |
| GET `/expenses/monthly-total` | Current-month total (unchanged) |
| GET/PUT `/expenses/budget?month=` | Budget get/set (upsert into `expense_settings`); returns spent/remaining/percent |
| POST `/expenses/recurring` | Create recurring expense (backfills due dates immediately) |
| GET `/expenses/recurring` | List user's recurring |
| PUT/DELETE `/expenses/recurring/{id}` | Update (incl. pause/resume via `active`) / delete |
| PUT `/expenses/{id}` | **Edit expense** (owner-only, 404 otherwise) |
| DELETE `/expenses/{id}` | Delete (owner-only, unchanged) |

Key logic — `_materialize_recurring()`: on every read (list/totals/budget), any active recurring expense whose `next_run_date <= today` is inserted into `expenses` as a normal entry, then `next_run_date` advances (weekly +7d / monthly clamped / yearly) or the rule auto-pauses (`active=False`) once past `end_date`. Date helpers handle month clamping via `calendar.monthrange`.

## Frontend — `frontend/src/Expenses.jsx` (rewritten)
- **Budget card**: set/edit monthly budget, progress bar (green <80%, amber ≥80%, rose over budget), "X left / over budget" line
- **Filters**: month picker + category select; both drive the expense list, category breakdown, and budget view
- **Category breakdown**: bar chart per category with entry counts + month total
- **Add/Edit expense**: same form swaps into edit mode (prefilled, "Save changes"), cancel button; each history row has edit + delete buttons
- **Recurring expenses card**: add form (category, description, amount, frequency, start/end dates), list with next-run date, pause/resume toggle, delete
- Stats now reflect the selected month; group expenses tab untouched

## Verification
- Migration applied to head (`personal_expense_upgrade`); backend imports OK
- **Full e2e passed**: add 4 expenses → month filter (excludes July entry) → category filter → combined filter → edit expense (owner-only; non-owner 404) → category totals (Food 230 / Bills 700 / total 930) → budget set (1000 → spent 930, remaining 70, 93%) → recurring create auto-logs Netflix for current month → list/pause/delete recurring → owner-only delete (non-owner 404)
- `npm run lint` clean, `npm run build` passes
- Test users + data cleaned from DB (expense_settings 0, recurring 0; only pre-existing real-user expenses remain)

---

# ADDENDUM 3 — UX: REQUESTS MERGED INTO MATCHES

**Fourth task this session:** Requests is the action step of matching, so the standalone **Requests page + nav item were removed** and the feature now lives inside the **Matches** page as a sub-tab.

- `frontend/src/Matches.jsx` — top-level tabs **Suggestions** (existing matching UI, incl. refresh button moved into the controls card) and **Requests** (Received/Sent with pending-count badge, accept/reject confirm dialogs). `RequestsPanel` reuses the old Requests page logic; "Send request" toast now points to the Requests tab.
- `frontend/src/Dashboard.jsx` — removed the `requests` nav item, its import, and page render (nav is now 8 items).
- `frontend/src/home.jsx` — the dashboard "Pending requests" stat card and "Review requests" button now navigate to `matches` instead of the removed `requests` page.
- Deleted `frontend/src/Requests.jsx` (functionality fully preserved inside Matches).
- Backend `/requests` API unchanged.
- Verified: `npm run lint` clean, `npm run build` passes.

---

# ADDENDUM 4 — PHASE 3: DEBT SETTLEMENT (COMPLETE)

**Fifth task this session:** Shared Expenses + Debt Settlement — who owes whom, settle-up records, and custom/uneven splits.

## Backend

### Migration `debt_settlement` (new, head)
- `expense_settlements` table — id, group_id, payer_id, receiver_id, amount, note (nullable), settled_at (FKs → living_groups/users, ondelete CASCADE).

### `backend/app/shared_expense_models.py`
- Added `ExpenseSettlement` model; `alembic/env.py` imports it.

### `backend/app/Routers/shared_expenses.py` (extended — Phase 3)
| Endpoint | Purpose |
|---|---|
| POST `/shared-expenses/` | **Custom split support** — optional `amounts: [{user_id, amount}]`; must cover every active member exactly once, all amounts ≥ 0, and sum == total (else 400). Omit for equal split. |
| GET `/shared-expenses/balances?group_id=` | **Who owes whom** — pairwise debts from unpaid shares minus settlements → `members[]` (net_balance per member) + `owes[]` (from→to amount) + `my_user_id` |
| POST `/shared-expenses/settlements` | Record settlement `{group_id, receiver_id, amount, note?}` (payer = caller; self-settle 400; receiver must be active member) |
| GET `/shared-expenses/settlements?group_id=` | Settlement history (desc by settled_at) |
| DELETE `/shared-expenses/settlements/{id}` | Delete (payer or group admin only, else 403; 404 if missing) |

## Frontend — `frontend/src/Expenses.jsx`
- **Group expenses view now has sub-tabs: Expenses | Balances**
- **Custom split** — split toggle in the new-expense form: *Equally* (auto pre-fills preview) or *Custom amounts* (per-member input rows; live sum validation that shares must add up to the total before submit)
- **Balances tab** (`BalancesPanel`) — net-balance cards per member (owed/owes/even), my-debts helper line, "Settle up" form (receiver select excludes self, amount, optional note), settlement history list with per-row delete
- Wired `loadBalances` / `loadSettlements` / `recordSettlement` / `deleteSettlement` into the `Expenses` component; balances refresh after create/delete expense and after settlements.

## Verification
- Migration applied to head (`debt_settlement`); backend imports OK
- **Full e2e passed**: 3-member group → equal split (300/3 → balances +200/-100/-100) → custom split (90/150/60 → +110/+50/-160; sum-mismatch 400; non-member 400) → settlement (t3→t1 100 → balances update) → self-settle blocked (400) → settlement list shape → delete settlement blocked for non-payer/non-admin (403) → payer deletes (200) → balances restored → get single expense → group cleanup
- `npm run lint` clean, `npm run build` passes
- Test users + group data cleaned from DB (groups/shares/settlements 0 rows; only pre-existing real users remain)

---

## 📊 PROJECT STATUS (updated)

```
MVP Gap Plan:
├── Phase 1: Living Groups + Group Chat  ✅ COMPLETE (this session)
├── Phase 2: Personal Expense upgrade     ✅ COMPLETE (this session)
├── Phase 3: Shared Expenses + Debt Settlement ✅ COMPLETE (this session)
├── Phase 4: Chores + Rules/Penalties + Reliability ✅ COMPLETE (this session)
├── Phase 5: Vacancies + Matching  ⬜ next
└── Phase 6: AI Conflict Assistant + Polish/Deployment
```

**Next Priority:** Phase 5 — Vacancies + Matching

---

# ADDENDUM 5 — PHASE 4: CHORES + RULES/PENALTIES + RELIABILITY (COMPLETE)

**Sixth task this session:** Household management — chores with rotation & history, group rules with penalties, and a transparent living-reliability score.

## Backend

### Migrations (new)
- `chores_rules_reliability` (head after debt_settlement): `chores`, `chore_history`, `group_rules`, `rule_violations` — all group-scoped with FK cascade; `chores.assigned_to` ondelete CASCADE, `completed_by` SET NULL; `chore_history` logs every action.
- `shared_expense_created_at` (new head): added `created_at TIMESTAMPTZ NOT NULL` to `shared_expenses` (backfilled) so payment-timeliness can be scored; INSERT now supplies `NOW()`.

### `backend/app/chore_models.py` (new)
`Chore`, `ChoreHistory`, `GroupRule`, `RuleViolation` models; imported in `alembic/env.py`.

### `backend/app/Routers/chores.py` (new)
| Endpoint | Purpose |
|---|---|
| POST `/chores/` | Create chore (any active member; assigned_to must be active member; recurring ∈ none/weekly/monthly) |
| GET `/chores/?group_id=` | Chore list (pending first, due-date sorted) |
| GET `/chores/history?group_id=` | Last 100 activity entries |
| POST `/chores/{id}/complete` | Complete — one-off → done; **recurring → logs completion + reassigns to next member + advances due date** (weekly +7d / monthly clamped) |
| PUT `/chores/{id}` | Edit (any active member) |
| DELETE `/chores/{id}` | Creator or group admin only |

### `backend/app/Routers/rules.py` (new)
| Endpoint | Purpose |
|---|---|
| POST `/rules/` | Create rule (admin only; optional penalty_amount) |
| GET `/rules/?group_id=` | List rules with creator name |
| PUT/DELETE `/rules/{id}` | Update / delete (admin only) |
| POST `/rules/violations` | Record violation (admin only; penalty defaults to rule's amount, overridable; notifies violator) |
| GET `/rules/violations?group_id=` | Violations with violator/recorder names |
| DELETE `/rules/violations/{id}` | Admin only |

### `backend/app/Routers/reliability.py` (new)
- GET `/reliability/?group_id=` — per-member **0–100 score** starting at 100: −10/overdue unpaid share (shares older than 7 days), −10/overdue chore, −15/violation (90-day window), +5/completed chore (30-day window); capped 0–100. Returns breakdown (overdue_shares/amount, settlements_paid, chores_completed, overdue_chores, violations) + itemized deduction strings + `my_user_id`.

### Penalties → balances (`shared_expenses.py`)
Rule-violation penalties (>0) now inject debt from **violator → group admin** into the balances graph, so penalties settle through the existing who-owes-whom UI.

## Frontend — `frontend/src/Household.jsx` (new page)
- Dashboard nav **"Household"** added (after Living Groups); page has a group picker + three tabs:
- **Chores**: stat cards (pending/completed/recurring/assigned-to-you), create/edit form (title, assignee, due date, recurrence), complete button (highlights "you"), overdue styling, activity history, delete with confirm.
- **Rules & penalties**: rule cards with penalty badge + creator; admin-only create/edit/delete, "Violation" modal (member, penalty override, note); violations list with penalty + recorder; delete violation.
- **Reliability**: per-member score cards with color-coded bar + label, overdue-share/overdue-chore/violation metrics, itemized deduction reasons.
- Reuses `Field/Input/Select/Textarea`, `Card`, `Badge`, `Modal`, `ConfirmDialog`, `EmptyState`, `PageHeader`, `Avatar`, Toast.

## Verification
- Migrations applied to head (`shared_expense_created_at`); backend imports OK
- **Full e2e passed**: group (2 members) → chore create/list → non-assigned complete blocked (403) → assigned completes → recurring weekly rotation (admin→member, due +7d) → history → update → delete perms (non-creator/non-admin 403, creator 200) → rule create (member 403) → violation record (member 403, admin 200; penalty override 100) → **penalties appear in balances (member owes admin 150)** → violation delete (admin 200, member 403) restores balances → reliability (member 85 with 1 violation, admin 100) → non-member blocked on all three (403) → group cleanup
- `npm run lint` clean, `npm run build` passes
- Test users + data cleaned (chores/history/rules/violations 0 rows)

---

# ADDENDUM 6 — PHASE 5: VACANCIES + MATCHING (COMPLETE)

**Seventh task this session:** Group vacancies and algorithmic matching — open slots, apply-to-vacancy, reverse (group→student) matching, ranking-based preferences, Gale-Shapley stable matching, and blocking-pair detection.

## Backend

### Migration `vacancies_matching` (new, head after `shared_expense_created_at`)
- `living_groups.open_slots` — int NOT NULL default 0 (group's advertised open spots)
- `match_preferences` — per-user explicit ranking of preferred roommates (user_id, preferred_user_id, rank, unique(user_id, preferred_user_id))
- `blocked_pairs` — reserved for future manual blocking (user_a_id, user_b_id, created_by)

### `backend/app/group_models.py`
- `LivingGroup` + `open_slots`; new `MatchPreference` + `BlockedPair` models (rewritten file cleanly after a corruption hiccup). `alembic/env.py` imports them.

### `backend/app/matching.py` (rewritten)
- `stable_match(preferences)` — **Gale-Shapley** deferred-acceptance over the same user set; **dedupes mutual engagements** into undirected pairs (each user appears exactly once) and returns unmatched users.
- `find_blocking_pairs(preferences, pairs)` — two users who each prefer each other over their current partners.

### `backend/app/Routers/matches.py` (extended)
| Endpoint | Purpose |
|---|---|
| GET/PUT `/matches/preferences` | View / save my explicit roommate ranking (`preferred_user_ids`); rejects self-rank, duplicates, unknown users (400) |
| GET `/matches/stable` | Global stable pairs + unmatched + blocking pairs + my_match (partner_id/name/compatibility) |
| GET `/matches/reverse?group_id=` | **Reverse matching**: rank every student by fit vs the group's aggregate profile (members only; excludes all members incl. pending) |

### `backend/app/Routers/vacancies.py` (new)
| Endpoint | Purpose |
|---|---|
| GET `/vacancies/` | Groups with `open_slots > 0` the user isn't a member of, each with aggregate **fit score** + itemized reasons |
| GET `/vacancies/{group_id}/candidates` | Admin/member view: ranked candidate list for a group (reverse matching) |
| PUT `/vacancies/{group_id}` | Set `open_slots` (admin only, 0–50) |
| POST `/vacancies/{group_id}/apply` | Apply to a vacancy → **pending** membership + admin notification; blocks already-in-a-group users and no-slot groups |

### `backend/app/Routers/groups.py` (extended)
- `GroupCreate.open_slots` (0–50); create + my-groups + detail responses now include `open_slots`.

## Frontend — `frontend/src/Matches.jsx` (extended)
- New top-level tabs **Vacancies** and **Stable Match** alongside Suggestions/Requests.
- **Vacancies tab** (`VacanciesPanel`): group cards (open-slot badge, member count, fit ScoreRing + label), *View group* → ranked candidates modal with "Send request" action, *Apply* button (toast on success, pending status prevents re-apply).
- **Stable Match tab** (`StableMatchPanel`): my stable partner hero card, editable preference ranking (reorder ↑/↓, remove), save ranking; stable pairs list; blocking pairs list (amber cards).
- Added `UsersIcon`, `BuildingIcon`, `TrendUpIcon` imports.

## Bugs Found & Fixed
- **Mutual-engagement duplicates** in `stable_match` — same-set Gale-Shapley produced both `(a,b)` and `(b,a)`; deduped into undirected pairs so every user appears exactly once.
- **Pending applicants leaked into reverse candidates** — `/matches/reverse` (and vacancy candidates) now exclude all memberships regardless of status, matching the vacancies-list behavior.

## Verification
- Migration applied to head (`vacancies_matching`); backend imports OK
- **Full e2e passed**: group create w/ open_slots=2 (returned in list + detail) → member excluded from own group's vacancy → applicant sees vacancy with fit score + reasons → set open_slots perms (member 403, admin 200) → reverse candidates ranked desc (members excluded) → non-member blocked (403) → apply → pending membership + admin notification → re-apply / admin-apply / no-slots blocked (400) → preferences validation (self-rank, duplicate, unknown → 400; valid save + ordered GET) → stable matching (consistent pairs, each user once, my_match present) → reverse endpoint (member 200, outsider 403) → group cleanup
- `npm run lint` clean, `npm run build` passes
- Test users + groups + prefs cleaned from DB

---

# ADDENDUM 7 — PHASE 6: AI CONFLICT ASSISTANT (COMPLETE)

**Eighth task this session:** Rule-based conflict assistant — a transparent, offline "AI" layer that reads each living group's data (expenses, chores, rules, reliability) and flags friction with suggested fixes, draft messages, and proactive recommendations. (Chosen over a live LLM — no API key needed, works fully offline. Real-time/WebSockets chat intentionally skipped per recommendation.)

## Backend

### `backend/app/Routers/assistant.py` (new)
GET `/assistant/analysis?group_id=` (active members only; reuses `_require_active_member` + `_get_member_score` from reliability):
- **Overall health**: 100-based score (−15/overdue-payment member, −10/overdue chore, −15/violation, −5/high-debt member), `severity` (low/medium/high) + a plain-language summary + counts.
- **Conflicts[]** — each with type (`payment`/`chore`/`violation`/`debt`), severity, affected member(s), title/detail pulled from live data, a suggested fix, and a ready-to-send neutral **draft message**; sorted high-severity first.
  - payment: unpaid shares >7 days (count + ₹ amount)
  - chore: overdue chores (title + due date)
  - violation: rule violations in 90 days (count + total penalty)
  - debt: net balance ≤ −₹1000 owed
- **Suggestions[]** — pattern-based proactive advice (e.g. "agree a 7-day payment deadline" when shares pile up; "re-confirm penalties" after multiple violations; otherwise a positive keep-it-up note).
- **Highlights[]** — positive signals: money settled in 60 days, members completing chores in 30 days, members with reliability ≥ 85.
- **Members[]** — name, reliability score, net balance for a snapshot list.

### Bugs Fixed
- `due_date` on chores is stored as `varchar` (not DATE) — the assistant's `.isoformat()` call crashed; now returned as-is.

## Frontend — `frontend/src/Assistant.jsx` (new page)
- Dashboard nav item **"Conflict Assistant"** (`SparklesIcon`, placed after Household).
- Group picker (reuses Household pattern) + Re-analyze button.
- **Health ring** (SVG progress ring, color-coded) + severity label + summary + 4 stat tiles (overdue payments/chores, violations, large balances).
- **Flags** list: severity badge, type tag, detail, teal "Suggested fix" callout, draft message block with **Copy message** button (clipboard + toast).
- **Proactive suggestions** + **What's going well** two-column section.
- **Member snapshot**: reliability bar + owed/owes balance + score badge.

## Verification
- Backend imports OK; **full e2e passed**: healthy group → health 100, no conflicts, suggestions present → added overdue chore + violation → health ≤85, counts correct, chore+violation conflict types detected, severity ordering correct, every conflict has suggestion + message → member view works → outsider blocked (403) → nonexistent group blocked (403) → cleanup
- `npm run lint` clean, `npm run build` passes (100 modules)
- Test users + groups cleaned from DB

---

## 📊 PROJECT STATUS (updated — MVP COMPLETE)

```
MVP Gap Plan:
├── Phase 1: Living Groups + Group Chat  ✅ COMPLETE
├── Phase 2: Personal Expense upgrade     ✅ COMPLETE
├── Phase 3: Shared Expenses + Debt Settlement ✅ COMPLETE
├── Phase 4: Chores + Rules/Penalties + Reliability ✅ COMPLETE
├── Phase 5: Vacancies + Matching         ✅ COMPLETE
└── Phase 6: AI Conflict Assistant + Polish ✅ COMPLETE
```

All six MVP phases are now complete. Remaining optional polish ideas (not MVP-blocking): real-time chat via WebSockets, read receipts, deployment (Docker/render/railway), and swapping the rule-based assistant for a live LLM when an OPENAI_API_KEY is available.

---

# ADDENDUM 8 — UX: DISCOVER (MERGE "FIND ROOMMATE" + "MATCHES")

**Ninth task this session:** The two "roommate finding" pages were nearly identical in intent — Find Roommate was *find a room*, Matches was *find a person*. Merged them into a single **Discover** hub so a listing card is now a room **+** potential roommate with a fit score.

## Backend — `backend/app/Routers/listings.py`
- GET `/listings/` and GET `/listings/{id}` now include **`compatibility`** (0–100) + **`reasons`** — fit between the viewer's profile and the listing owner's profile, reusing `compare_preferences` from `matches.py`. `None` when either profile is missing.

## Frontend — `frontend/src/Listings.jsx` → embeddable `RoomsPanel`
- Default export renamed `Listings` → `RoomsPanel`; removed its `PageHeader` + outer page wrapper so it embeds as a tab (keeps a small in-panel toolbar with "Post an opening").
- Listing cards now show a **compatibility pill** vs the owner ("Excellent fit with {owner} — based on your lifestyle profiles").
- Non-owners get two actions: **Message** (→ chat) and **Request** (sends a roommate request to the owner via `/requests/{id}`).

## Frontend — `frontend/src/Matches.jsx` → Discover
- Page title/subtitle renamed to **Discover**; tab order now **Rooms · People · Requests · Vacancies · Stable Match** ("Suggestions" tab relabeled "People").
- `Matches` accepts a `setPage` prop to pass into `RoomsPanel` for the message→chat navigation.

## Frontend — `frontend/src/Dashboard.jsx` + `home.jsx`
- Nav item **"Find Roommate" removed**; "Matches" relabeled **Discover** (sidebar now 9 items: Dashboard, My Profile, Discover, Expenses, Living Groups, Household, Conflict Assistant, Messages, Notifications).
- Dashboard renders `<Matches setPage={navigate} />`; removed the `Listings` import/render and unused `BuildingIcon`.
- `home.jsx` "Browse rooms" button now navigates to `matches` (Discover).

## Verification
- Backend imports OK; manual e2e: 2 users w/ identical profiles → listing create → list/detail return `compatibility: 100` + 8 reasons for both viewer and owner views.
- `npm run lint` clean, `npm run build` passes (100 modules).
- Test users + listing cleaned from DB.

---

## 📊 PROJECT STATUS (updated)

```
MVP Gap Plan:
├── Phase 1: Living Groups + Group Chat  ✅ COMPLETE
├── Phase 2: Personal Expense upgrade     ✅ COMPLETE
├── Phase 3: Shared Expenses + Debt Settlement ✅ COMPLETE
├── Phase 4: Chores + Rules/Penalties + Reliability ✅ COMPLETE
├── Phase 5: Vacancies + Matching         ✅ COMPLETE
└── Phase 6: AI Conflict Assistant + Polish/Deployment  ⬜ next
```

**Next Priority:** Phase 6 — AI Conflict Assistant + Polish/Deployment