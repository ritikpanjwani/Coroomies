# CoRoomies Codebase Technical Audit

**Date:** 20 November 2026  
**Scope:** Read-only review of the React/Vite frontend, FastAPI backend, database models and Alembic migrations, API integration, matching, groups, messaging, expenses, notifications, authentication, authorization, tests, and deployment configuration.  
**Repository state:** The worktree already contained uncommitted gender/age matching changes and a new migration/test directory. Those changes were reviewed but not changed.

## Executive summary

CoRoomies is a capable student shared-living application: discovery and roommate requests lead into living groups with chat, personal/shared expenses, settlements, chores, rules, reliability scores, notifications, listings, and an offline conflict assistant. The architecture is a React 19/Vite SPA with a FastAPI/PostgreSQL API, raw SQL through psycopg, Alembic migrations, and pooled database connections.

The codebase has solid foundations: bearer-token validation checks `token_version`, group authorization is centralized around active membership, shared-expense duplicate participant checking is present, media content is validated, and error responses do not expose stack traces. However, three confirmed application defects deserve immediate attention:

1. The stable-roommate algorithm can give a user more than one partner.
2. Equal shared-expense splits can make recorded shares not add up to the parent amount.
3. Any active group member can alter or mark another member's chore complete through the API.

There is also a high operational risk: the committed integration test writes to the configured database directly, with no test-database guard. Do not run it against a shared or production environment.

## Method and limitations

Performed without changing app code, configuration, dependencies, database state, or migrations:

- Repository/configuration/source and migration review.
- Static frontend-to-backend API comparison.
- `git diff --check` (no whitespace errors in the pre-existing pending changes).
- Previously available local checks: ESLint passed; Python compilation passed; Alembic reported one head; 20 existing tests passed. The test suite was **not rerun for this audit**, because one test directly creates/deletes database records.
- Isolated Python model/function checks only: stable matching returned overlapping pairs; profile range and expense-date schemas accepted invalid inputs.

Not performed: browser/mobile runtime testing, live API testing, database introspection, dependency installation, production deployment verification, or migrations. The frontend production build is currently not runnable in this workspace because the installed Tailwind native binary cannot be loaded and Vite receives a Windows `EPERM` spawn error.

Severity uses impact and likelihood: **Critical**, **High**, **Medium**, **Low**. “Confirmed” means demonstrated by code flow or an isolated local call. “Suspected” means a material risk requiring environment/runtime confirmation.

## Confirmed bugs

### C-01 — Stable matching can assign users multiple partners

- **Severity:** Critical
- **Files:** `backend/app/matching.py:65-128`; consumed by `backend/app/Routers/matches.py:537-641`
- **Evidence / reproduction:** Calling `stable_match({1: [2], 2: [3], 3: [1]})` returns `[(1, 2), (2, 3), (1, 3)]`. Every user is therefore in two pairs.
- **Technical explanation:** Gale–Shapley requires two distinct sides of a bipartite market. The implementation places every user in both the proposer and acceptor sets. Its later undirected-pair de-duplication removes only identical edges, not edges that share a participant. `get_stable_matching` then selects the first pair involving the current user, while `find_blocking_pairs` overwrites partner mappings.
- **Root cause:** A stable-marriage algorithm is being used as a stable-roommates algorithm without a valid reduction or a one-partner invariant.
- **Recommended fix:** Decide the intended product model. For arbitrary roommate pairing, use a stable-roommates algorithm (e.g. Irving's) or a deterministic maximum-weight matching with explicit product semantics. Enforce that each ID appears in at most one output pair, add cycle/odd-cardinality tests, and validate `my_match` against that invariant.

### H-01 — Equal expense splits can leave a monetary remainder unallocated

- **Severity:** High
- **Files:** `backend/app/Routers/shared_expenses.py:197-201, 278`
- **Evidence / reproduction:** An equal split of `100.00` among 3 members produces three shares of `33.33`, totaling `99.99`, while the parent expense remains `100.00`.
- **Technical explanation:** The code rounds each share independently and inserts every rounded amount. Balances and settlement calculations operate on those shares, so the system can retain or lose one or more paise relative to the expense amount.
- **Root cause:** No deterministic remainder-distribution policy.
- **Recommended fix:** Work in integer paise, divide with quotient/remainder, and distribute the remaining paise deterministically (for example, first N non-payer members). Assert that inserted share amounts equal the parent amount exactly; add 3-, 6-, and 7-way split tests.

### H-02 — Active members can edit or complete chores they do not own

- **Severity:** High
- **Files:** `backend/app/Routers/chores.py:452-530`
- **Evidence / reproduction:** `PUT /chores/{id}` first checks only active membership. It restricts `assigned_to` changes to admins, but permits any member to set `title`, `description`, `due_date`, `due_day`, `recurring`, or `status='completed'` for any chore.
- **Technical explanation:** The normal completion endpoint protects assigned chores (`/chores/{id}/complete`), but the update endpoint bypasses that rule by allowing a raw status update.
- **Root cause:** Authorization is field-specific only for reassignment, not for other mutable chore fields.
- **Recommended fix:** Define a policy and enforce it server-side: typically admin/creator may edit chore metadata; only assignee (or admin) may complete; regular members cannot update another member’s duty. Prefer routing completion solely through the completion endpoint and remove `status` from the general update DTO.

### H-03 — Tests can modify the configured operational database

- **Severity:** High
- **Files:** `backend/tests/test_gender_age_matching.py:198-316`
- **Evidence / reproduction:** The integration test calls `get_connection()`, inserts fixed user IDs, and deletes rows from `users`, `student_profiles`, and `roommate_requests`. Configuration loads `backend/.env`; there is no test database URL, transaction rollback fixture, or environment refusal.
- **Technical explanation:** Invoking `pytest` uses the same connection selection as the app. If `DATABASE_URL` points to a development, staging, or production database, the test writes to it. Fixed IDs make collision/deletion risk worse.
- **Root cause:** Integration tests are not isolated from application configuration or wrapped in a rollback transaction.
- **Recommended fix:** Require `TEST_DATABASE_URL` and fail closed unless its database name has a test-only suffix; create data through fixtures with generated IDs; wrap each test in a transaction that rolls back; separate unit tests from integration tests with pytest markers.

### M-01 — Expense and recurring-expense update schemas accept impossible calendar dates

- **Severity:** Medium
- **Files:** `backend/app/Routers/expenses.py:45-59, 87-102, 127-142`
- **Evidence / reproduction:** Isolated schema construction accepts `ExpenseUpdate(..., expense_date='2026-02-31')` and `RecurringExpenseCreate(..., start_date='2026-02-31')`.
- **Technical explanation:** These validators check only `1 <= day <= 31`; they do not construct a calendar date. In contrast, the shared `validate_iso_date` utility correctly uses `date.fromisoformat`.
- **Impact:** Invalid text dates can be stored, sort incorrectly, and later fail recurring-expense parsing/materialization.
- **Recommended fix:** Reuse `validate_iso_date` for every expense date field and use actual `DATE` database columns where practical. Add leap-day and month-length tests.

### M-02 — Matching profile accepts inverted budget and age ranges

- **Severity:** Medium
- **Files:** `backend/app/schemas.py:248-253, 307-322`; filter use at `backend/app/Routers/matches.py:278-286`
- **Evidence / reproduction:** `ProfileCreate(budget_min=20000, budget_max=10000, preferred_age_min=40, preferred_age_max=18)` validates successfully.
- **Technical explanation:** Field validators ensure non-negative integers but there is no model-level comparison of lower/upper bounds. Query filters likewise accept inverted `min_age`/`max_age`.
- **Impact:** Users can save preferences that guarantee empty or misleading matching results.
- **Recommended fix:** Add a Pydantic model validator requiring `min <= max` when both values exist; constrain age preferences to a product-approved range; validate query ranges in the matches endpoint; add boundary tests.

### M-03 — Authentication token is transmitted in media URLs

- **Severity:** Medium
- **Files:** `frontend/src/chat.jsx:288-297, 748-752, 1943`; `backend/app/auth.py:79-92`; `backend/app/Routers/messages.py:439-468`
- **Evidence / reproduction:** Attachment image/download URLs append `?token=<JWT>`, and the API explicitly permits a token query parameter.
- **Technical explanation:** Query strings are commonly retained in browser history, proxy/access logs, monitoring tools, screenshots, and sometimes referrer metadata. Anyone with the unexpired URL can replay the bearer token, subject to token version/expiry.
- **Recommended fix:** Do not accept bearer tokens in query parameters. Fetch media with an `Authorization` header, create an object URL in the client, or issue short-lived single-use signed media URLs that are not general session tokens.

### M-04 — A committed responsive-audit script contains a hard-coded bearer token

- **Severity:** Medium
- **Files:** `scratch/audit_responsive_pages.js:7`
- **Evidence:** The script embeds a JWT literal for a user ID. Its expiry may have passed, but a credential-like value is tracked in the repository.
- **Impact:** This normalizes secret handling in source control and can expose a valid credential if a similar script is reused or its expiry changes.
- **Recommended fix:** Revoke the referenced session if it could still be valid, remove tracked credentials, read test auth from a local ignored environment variable, and add secret scanning/pre-commit protection. Do not place the token value in tickets, logs, or this report.

### M-05 — Frontend production build is blocked in the current workspace

- **Severity:** Medium (release-blocking locally; application-code cause unconfirmed)
- **Files:** `frontend/package-lock.json`; local installed dependency tree used by `frontend/vite.config.js`
- **Evidence:** `npm --prefix frontend run lint` passed. `npm --prefix frontend run build` failed while loading `@tailwindcss/oxide-win32-x64-msvc`, reporting invalid UTF-8, followed by Vite `spawn EPERM`.
- **Root cause:** Most likely a corrupt/incompatible installed native dependency or Windows execution policy; source-level cause is not established.
- **Recommended fix:** In an approved maintenance task, reproduce from a clean, isolated dependency directory/CI runner and use the lockfile’s supported Node version. Do not treat a local build as release-ready until it passes in a clean environment.

## Confirmed consistency, quality, and performance risks

### M-06 — ORM models, raw SQL, and migrations are materially duplicated and drifting

- **Severity:** Medium
- **Files:** `backend/app/models.py:8-18`; `backend/app/profile_models.py:20-65`; `backend/app/group_models.py:12-250`; `backend/app/expense_models.py:7-50`; `backend/alembic/versions/phase6_fresh_install_schema_repair.py:17-125`
- **Evidence:** The `User` ORM model omits fields used throughout raw SQL (`username`, `avatar_url`); the project includes a migration explicitly named “fresh install schema repair”; application routes predominantly maintain their own positional SQL row schemas.
- **Technical explanation:** Models are not a complete executable representation of the live schema, while endpoint SQL independently names tables/columns. This has previously created schema-drift failures documented in repository audit history.
- **Recommended fix:** Choose a source of truth (SQLAlchemy metadata plus generated migrations, or tightly managed SQL migrations/schema definitions). Add migration smoke tests against a blank database and typed repository/query helpers for high-risk data.

### M-07 — Match calculation has unbounded O(n²) work per request

- **Severity:** Medium
- **Files:** `backend/app/Routers/matches.py:217-348, 537-604`
- **Evidence:** `/matches/` fetches every eligible profile and evaluates each candidate in Python. `/matches/stable` fetches every profile, then compares every user with every other user before matching.
- **Impact:** Response time and database/memory load grow sharply as users increase; the stable endpoint grows quadratically before the algorithm itself runs.
- **Recommended fix:** Filter in SQL first (location, gender, age, availability), paginate discovery, add suitable compound indexes after measuring queries, cap/queue global matching, and avoid recomputing a global graph on every caller request.

### M-08 — API/UI source is highly duplicated, increasing regression risk

- **Severity:** Medium
- **Files:** `frontend/src/Groups.jsx:1003-1081`; `frontend/src/GroupExpenses.jsx:1-1800+`; `frontend/src/Dashboard.jsx:208-416`; `frontend/src/Notifications.jsx:76-187`
- **Evidence:** Multiple components independently fetch the same group/expense/notification data and duplicate navigation state through `localStorage`; group-expense flows are implemented across both `Groups.jsx` and `GroupExpenses.jsx`.
- **Impact:** Feature changes can produce stale state, inconsistent error handling, or one UI path calling an old API shape. The pre-existing project context already records a prior `group.id` vs `group.group_id` integration bug.
- **Recommended fix:** Introduce a scoped data layer (query hooks/context) and one canonical group-expense feature module; centralize navigation state and endpoint DTOs. This is a refactor recommendation, not a current functional failure.

### L-01 — Long-lived session tokens in localStorage remain an XSS blast-radius risk

- **Severity:** Low / hardening recommendation
- **Files:** `frontend/src/auth.js:1-18`; `frontend/src/App.jsx:11-13`; `backend/app/config.py:47-50`
- **Evidence:** The JWT is persisted in `localStorage` and defaults to a 1,440-minute lifetime. CSP and token-version invalidation mitigate but do not eliminate token theft if an XSS issue is introduced.
- **Recommended fix:** Consider short-lived access tokens with refresh rotation in secure, `HttpOnly`, `Secure`, `SameSite` cookies. This is not a confirmed XSS vulnerability.

### L-02 — Development tunnel CORS permits any Cloudflare Quick Tunnel origin with credentials

- **Severity:** Low in its stated development-only scope
- **Files:** `backend/app/config.py:82-84`; `backend/app/main.py:173-182`
- **Evidence:** With `CORS_ALLOW_TUNNELS=true`, the API permits `https://*.trycloudflare.com` while allowing credentials. The configuration correctly disables this in production.
- **Recommended fix:** Keep disabled outside isolated development and prefer explicit ephemeral frontend-origin allowlisting even in development.

### L-03 — Responsive quality cannot currently be certified from the active workspace

- **Severity:** Low / verification gap
- **Files:** `scratch/audit_responsive_pages.js:1-185`; `scratch/verify_mobile_viewports.js:1-130`; UI components across `frontend/src/`
- **Evidence:** There are useful viewport-audit scripts and many mobile-oriented Tailwind breakpoints/overflow controls, but the scripts require a running app and browser automation. The current build failure blocks a clean static-production verification.
- **Recommended fix:** In an approved test task, run authenticated and unauthenticated viewport checks at 320/360/390/768px against isolated data; verify keyboard focus, modal scroll-lock, touch-target size, long names, and large expense tables.

## Frontend/backend integration assessment

The reviewed endpoint calls generally align with router paths, including newer payment-report and settlement-confirmation endpoints. Positive controls observed:

- Auth endpoints issue token versions and logout/password/email changes invalidate prior sessions (`backend/app/auth.py:13-60, 183-193`; `backend/app/Routers/settings.py:517-582`).
- Direct messaging requires an accepted roommate request and checks blocks (`backend/app/Routers/messages.py:147-191, 481-540`).
- Group-scoped routes rely on `require_active_member` / `require_admin` (`backend/app/group_auth.py:22-58`).
- Shared-expense participant and duplicate-share validation exists (`backend/app/Routers/shared_expenses.py:137-194`).

The principal API-contract risks are hand-maintained positional SQL row mapping, duplicate frontend fetch/state paths, and untested branch-heavy workflows (payments, scheduled chores, group ownership transfer, media upload/download, and account deletion).

## Database and migration assessment

- Alembic currently reports one head: `gender_age_smart_matching`.
- The pending gender/age migration is additive and idempotent, but it adds no database `CHECK` constraints for gender, age range ordering, budget range ordering, or valid amount/split invariants (`backend/alembic/versions/gender_age_smart_matching.py:18-60`). Application-only validation is therefore vulnerable to future bypasses.
- Many date fields are stored as `VARCHAR(10)` rather than PostgreSQL `DATE` (`backend/app/expense_models.py:18-42`), which directly enables M-01.
- Migrations have accumulated “repair” and `IF NOT EXISTS` patterns. These are useful for recovery but signal that a clean-install migration test is mandatory.

## Tests and regression coverage

The new test file provides useful coverage for DOB validation, gender compatibility, age filters, and profile privacy. It does **not** cover the confirmed stable-pair overlap, equal-split remainder, chore-update authorization, invalid calendar dates, or token-in-URL behavior.

Priority tests to add after the test-isolation guard:

1. Stable matching: every output user occurs no more than once; odd groups/unmatched cycles are handled deterministically.
2. Split integrity: sum of `expense_shares` equals `shared_expenses.amount` for every participant count.
3. Chore authorization matrix: admin, creator, assignee, unrelated active member, departed member, and pending member.
4. Date validation: invalid month/day combinations and leap years across create/update/recurring paths.
5. Media access: bearer auth works without a token query string and rejects authorization leakage paths.
6. Full migration upgrade on a blank PostgreSQL database, followed by a minimal API smoke suite.

## Prioritized remediation roadmap

### Phase 0 — Safety first (before additional test or release work)

1. Isolate database tests and make them fail closed without `TEST_DATABASE_URL` (H-03).
2. Remove/revoke committed credential material and introduce repository secret scanning (M-04).
3. Establish a clean CI build that runs lint, production build, compile, isolated tests, and migration smoke tests (M-05, M-06).

### Phase 1 — Correctness and authorization

1. Replace or redesign stable roommate matching; enforce exactly one partner per user (C-01).
2. Fix split remainder allocation and assert exact monetary conservation (H-01).
3. Lock chore mutation/completion permissions to the intended actors (H-02).
4. Enforce valid real dates and ordered profile ranges (M-01, M-02).

### Phase 2 — Security and data contracts

1. Remove JWTs from media URLs and use header-authenticated blobs or scoped signed URLs (M-03).
2. Consolidate schema ownership and add database constraints where business invariants are critical (M-06).
3. Keep broad tunnel CORS strictly development-only and document safe test/development environments (L-02).

### Phase 3 — Scale and UX confidence

1. Measure and optimize matching queries; add pagination/candidate limits and background computation where appropriate (M-07).
2. Consolidate frontend server state and group-expense code paths (M-08).
3. Perform browser-based accessibility and responsive validation once clean builds are available (L-03).

## Items intentionally not classified as current defects

- No source evidence of SQL injection was found in the reviewed routes; SQL values are generally parameterized.
- No source evidence of a current group-membership status bypass was found; current group authorization helpers require `status='active'`.
- No current credential value is reproduced in this report.
- The frontend build failure is confirmed locally, but its root cause is not attributed to application source without a clean-environment reproduction.

## Conclusion

CoRoomies is feature-rich and has improved security controls relative to its historical audit documents. Its most urgent remaining work is correctness and safety rather than broad feature creation: isolate tests, repair stable matching and financial rounding, close the chore authorization bypass, and establish a reproducible clean build/migration test pipeline. No application or configuration changes were made as part of this audit; this Markdown report is the sole requested artifact.
