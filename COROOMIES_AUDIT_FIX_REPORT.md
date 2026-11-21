# CoRoomies Audit Fix Report

**Date:** 20 November 2026  
**Source audit:** `COROOMIES_CODEBASE_AUDIT.md`  
**Safety:** No production data was read or changed. No Alembic migration was executed. No deployment occurred.

## Summary

This change set resolves the confirmed correctness, authorization, validation, token-handling, test-isolation, and local-build issues identified in the audit. Existing uncommitted gender/age matching work was preserved. The new database migration is prepared but deliberately not applied.

## Fixed items

| Audit item | Resolution | Files |
|---|---|---|
| H-03: integration tests can use an operational database | Database-writing tests are now marked `integration`. They run only when `TEST_DATABASE_URL` is set and its database name includes `test`; otherwise they skip before application/database imports. | `backend/tests/conftest.py`, `backend/pytest.ini`, `backend/tests/test_gender_age_matching.py` |
| C-01: a member can receive multiple stable-match partners | Replaced invalid single-population Gale–Shapley usage with deterministic, mutually acceptable one-to-one pairing. Each ID can occur in at most one pair. UI no longer claims Gale–Shapley stability. | `backend/app/matching.py`, `frontend/src/Matches.jsx`, `backend/tests/test_audit_regressions.py` |
| H-01: equal splits lose paise | Equal splits now use integer paise and distribute the remainder deterministically. Custom splits must equal the parent total exactly to two decimal places. | `backend/app/Routers/shared_expenses.py`, `backend/tests/test_audit_regressions.py` |
| H-02: any member can change another person's chore | General chore metadata edits now require the creator or active admin; reassignment remains admin-only; direct `status` updates were removed so completion must use the protected completion endpoint. | `backend/app/Routers/chores.py` |
| M-01: impossible dates accepted | Expense update and recurring-expense schemas now share the strict ISO calendar-date validator. | `backend/app/Routers/expenses.py`, `backend/tests/test_audit_regressions.py` |
| M-02: inverted budget/age ranges accepted | Profile DTO validates ordered ranges and the 18–100 preferred-age envelope. Discover query filters also reject invalid/inverted ranges. A forward-only database migration adds corresponding future-write constraints. | `backend/app/schemas.py`, `backend/app/Routers/matches.py`, `backend/alembic/versions/matching_preference_constraints.py` |
| M-03: JWT in media URLs | Media retrieval now requires the normal Authorization header. The frontend loads protected media as authorized blobs/object URLs; download and lightbox flows use the same approach. Query-token authentication was removed. | `frontend/src/chat.jsx`, `backend/app/Routers/messages.py`, `backend/app/auth.py` |
| M-04: bearer credential in a tracked script | The responsive-audit script now requires a locally supplied `COROOMIES_AUDIT_TOKEN`; it contains no embedded credential. | `scratch/audit_responsive_pages.js` |
| M-05: frontend native dependency/build failure | Reinstalled dependencies from the existing lockfile. The native-helper execution issue was confirmed to be sandbox-related. A production build completed successfully when supplied a temporary valid HTTPS API origin. | ignored `frontend/node_modules/` only |

## Database migration safety

`matching_preference_constraints` follows the pending `gender_age_smart_matching` migration and uses PostgreSQL `NOT VALID` check constraints. This means:

- New writes are protected.
- Existing rows are not scanned, rewritten, or rejected at deployment time.
- Legacy data can be reviewed and corrected later, then constraints can be validated in an explicitly approved maintenance change.

The migration was **not run**. Alembic graph verification reports a single head: `matching_preference_constraints`.

## Verification performed

| Check | Result |
|---|---|
| Backend unit tests | **23 passed** |
| Database-writing integration tests | **3 skipped intentionally**; no `TEST_DATABASE_URL` was supplied |
| Python compilation (`compileall`) | Passed |
| Frontend lint | Passed |
| Frontend production build with temporary `https://api.example.com` origin | Passed |
| Migration graph (`alembic heads`) | One head: `matching_preference_constraints` |
| Diff whitespace check | Passed |

The default local production build still fails if `VITE_API_URL` is missing, local, or a Quick Tunnel URL. That is the intended deployment safety check in `frontend/vite.config.js`, not a compilation failure.

## Regression coverage added

`backend/tests/test_audit_regressions.py` verifies:

- A mutual three-person preference cycle cannot reuse a member in more than one pair.
- A 100.00 three-way equal split records 33.34, 33.33, and 33.33, totaling exactly 100.00.
- Invalid calendar dates are rejected in both personal and recurring expense DTOs.
- Inverted budgets, inverted preferred ages, and under-18 preferred age values are rejected.

## Remaining concerns and intentionally deferred work

- **No isolated PostgreSQL database was provided**, so live API integration, migration-upgrade, account deletion, authorization-matrix, and group/expense end-to-end testing remain unverified. The new guard prevents unsafe execution; provide an isolated `TEST_DATABASE_URL` to run them.
- **Responsive UI/browser checks** were not rerun because they need a running isolated app plus authenticated test data. The code’s responsive patterns were preserved, but real-device verification remains a QA task.
- **Matching scalability** remains a measured-performance task. `/matches/stable` still builds an in-memory all-user candidate graph. Correctness is fixed; pagination/SQL prefiltering should be planned after collecting query plans and product scale targets.
- **Model/raw-SQL duplication** is a maintainability risk, but was intentionally not subjected to a broad architectural refactor. The added constraints reduce one immediate data-integrity gap.
- Dependency audit output reported third-party package advisories after `npm ci`. No automated `npm audit fix` was run because it could alter locked dependency versions and requires separate review.

## Recommended next safe step

Provision an empty PostgreSQL database whose name includes `test`, set only `TEST_DATABASE_URL` for the test process, apply migrations there, and run the marked integration suite plus browser workflows. Review and approve any dependency upgrades separately before changing the lockfile.
