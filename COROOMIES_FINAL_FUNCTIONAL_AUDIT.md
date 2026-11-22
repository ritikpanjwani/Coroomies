# CoRoomies pre-production functional audit

**Release decision: hold deployment.** On a clean PostgreSQL 18 installation upgraded to Alembic head, the request feed and direct-message inbox return HTTP 500 for an ordinary signed-in user. A migration run can therefore finish successfully while two primary dashboard journeys fail. The tests also give misleading assurance about public-profile privacy.

## Evidence and scope

Tests used disposable loopback PostgreSQL clusters, synthetic identities, FastAPI TestClient, and an isolated headless Edge profile. No external payment or email was initiated. API tests used the source checkout. Browser measurements used the existing frontend/dist bundle, whose parity with the checkout was not verified. A shell rendering with blocked API calls establishes navigation or layout evidence only. Historical audit reports were not counted as executions.

## Findings and acceptance checks

|ID / severity|Observed effect and root cause|How to verify and what to change|
|---|---|---|
|F1 High|The combined request feed returns 500, PostgreSQL 42703. The migrated roommate_requests table lacks created_at. The received feed and friend lookup also select this field. backend/app/Routers/requests.py:228,321,343 and backend/app/Routers/messages.py:65.|Migrate an empty audit database, register and log in, then open the requests feed. Even an empty feed fails. Add a forward migration with an explicit policy for historical timestamps. Verify received, sent, combined and friends views with empty and populated histories.|
|F2 High|GET /messages/ returns 500, PostgreSQL 42P01. The catalog lookup for conversation_notification_settings returned NULL. Mute reads returned 500. Text sending, attachment handling and thread loading reference the same table. backend/app/Routers/messages.py:221,388,513,805,852,889.|Open Messages on a fresh migrated install. Supply the missing schema and constraints through a migration. Exercise two connected users through send, retrieve, read, mute and unmute before release.|
|F3 Medium|The registered GET /messages/blocked-users returns 422 for a valid account. The earlier /{user_id} route captures the literal and integer validation fails. Settings uses its own working list endpoint. backend/app/Routers/messages.py:481,997 and frontend/src/Settings.jsx:58.|Read both lists as the same synthetic user. Put the literal route first or constrain the dynamic path to integers. Assert both empty and populated responses.|
|F4 High for the web product|Room listing CRUD/search and vacancy discovery, candidate selection and applications are registered on the server. The React source has no listing or vacancy client calls or corresponding page. The only listing text found was a chat report reason. backend/app/Routers/listings.py:130,281 and vacancies.py:92,157,202,233. frontend/src/Dashboard.jsx:772.|Starting at the dashboard, try to publish a room or apply for a vacancy. Collection API reads returned 200, but the web journeys have no entry point. Expose the intended journeys or explicitly exclude them from the launch feature set.|
|F5 Medium, QA|The public-profile DOB test passes on an empty database without checking a successful profile response. It signs for fixed user 1, fetches fixed user 2 and only asserts inside an HTTP 200 branch. The completion test assumes user 1 exists and failed on a clean database. backend/tests/test_gender_age_matching.py:287,297,308. Completion returned 200 separately for a newly registered user.|Run integration-marked tests on a fresh schema. Create isolated caller and subject fixtures, populate a DOB, require a 200 and assert the response shape. Test rejection separately.|
|F6 Medium, accessibility, source-confirmed|The shared modal locks body scrolling and handles Escape but implements no initial focus, focus containment, background inertness or focus restoration. aria-modal alone does not implement keyboard behavior. frontend/src/components/ui/Modal.jsx:12,19,39.|Open a shared dialog from a keyboard and traverse both tab directions, then close. Implement and test focus entry, containment and return. Screen-reader behavior was not measured.|
|F7 Low, deployment, source-confirmed|Production disables /openapi.json while the custom /docs route still renders Swagger pointing to it, and the root response advertises /docs. backend/app/main.py:92,98,101,114.|With a production-like isolated configuration follow the root docs link. Gate the route and its advertisement consistently with schema availability. No production request was made.|

## Financial and reliability risks requiring decisions or reproduction

- **High if the ledger is represented as verified receipt.** A member reported their ?6.17 share of a ?12.35 split, the report returned 200, the recipient confirmation returned 400 and the stored share status was paid. The interface explicitly promises immediate clearing. This is confirmed self-attestation behavior. There is no evidence a real transfer occurred. The source also exposes a recipient dispute action. Decide whether self-attestation is acceptable and label its provenance, or require recipient confirmation before reporting money received. backend/app/Routers/shared_expenses.py:1008,1089,1209 and frontend/src/components/UpiPaymentModal.jsx:444.
- **Medium, suspected stale group analysis.** Group switching starts independent requests, each response can set analysis without checking the selected group. Delay group A, select B, and finish A last. Verify that B retains its own results before adding a stale-response guard. frontend/src/Assistant.jsx:155,164,196.
- **Medium, suspected stale signed-in view.** A 401 clears credentials, dispatches a session-expired event and suppresses reload while typing. No listener for that event was found. Recheck with an expired synthetic session while editing a field. Preserve drafts while presenting reauthentication. frontend/src/api.js:75 and frontend/src/App.jsx:13.

## Feature status and coverage

Partially Working means at least one scoped path executed successfully. Broken identifies a confirmed failure in a named journey. Not Tested includes source-only review. A 200-only smoke check does not certify the content or accounting.

|Area|Status|Executed evidence and remaining coverage|
|---|---|---|
|Registration, login and current account|Partially Working|Two synthetic users registered and signed in. Authenticated account read succeeded. Duplicate identity, lockout, logout revocation and full browser submission remain open.|
|OTP, reset and email change|Not Tested|Reset form navigation exercised. Delivery, expiry, replay, reset and address change not completed.|
|Profiles and completion|Partially Working|Created and edited two profiles through HTTP. Completion succeeded for an existing user. Field persistence, public visibility variants and avatar workflows remain open.|
|Matching, discovery and requests|Partially Working|Age, DOB, compatibility, completion and pairing unit checks passed. A three-user integration test verified inclusion, exclusion, compatible request creation and rejection of an incompatible request. Combined request feed is broken. Acceptance, cancellation, filters and stable/reverse ranking quality remain open.|
|Direct messages and media|Broken|Inbox and mute reads failed on clean schema. Attachments, playback, download permissions, read receipts, reporting, deletion and block/unblock journeys remain uncertified.|
|Living Groups and group chat|Partially Working|Created a group, joined by code, approved the second user, sent a group message and verified its text from the other account. Transfer, demotion, rejection, leaving, deleting, notification overrides and concurrent membership changes remain open.|
|Personal expenses|Partially Working|Expense creation and list reads returned 200. Amount/date validators exercised. Budget limits, monthly rollovers, editing and recurring generation remain open.|
|Shared expenses, payments, settlements|Partially Working|Two-person split created, member share checked in PostgreSQL, report and subsequent confirmation attempted. Equal-split unit test passed. Partial settlements, reversals, creditor dispute effects, concurrent reports and reconciliation across views remain open.|
|Chores, recurring tasks and history|Partially Working|Assigned chore created. List, schedules and history read. Completion, repeated completion, schedule generation, reminders and time boundaries remain open.|
|House rules and violations|Partially Working|Rule creation and rule/violation reads exercised. Enforcement, violation recording and penalty reversal remain open.|
|Reliability and conflict assistant|Partially Working|Group-scoped reads returned 200. Score accuracy, explanations and cross-group switching remain open.|
|Room listings and vacancy applications|Broken|Web entry points missing. API collection reads succeeded. Search quality, management and applications remain open.|
|Team-ups|Partially Working|Collection and own-post reads succeeded. Publishing, contact and withdrawal remain open.|
|Notifications|Partially Working|List and unread-count reads succeeded. Cross-device synchronization, mark-read, clear and deep-link outcomes remain open.|
|Settings, privacy and blocked users|Partially Working|Settings and settings-side blocked-list reads returned 200. Message-side equivalent returned 422. Avatar removal, deletion, credentials, privacy changes and block enforcement across features remain open.|
|Dashboard and navigation|Partially Working|Desktop shell opened major modules. Signed-in browser tests blocked API traffic. Count accuracy, notification destinations, populated widgets and stale state remain open.|
|Health, readiness, static files and developer docs|Not Tested|Source inspected. Readiness degradation, production headers, storage permissions and deployment behavior unverified.|
|Fresh migration to head|Working|Completed on isolated PostgreSQL 18. Schema completeness failed independent application checks F1 and F2. Upgrade from historical data remains open.|

## Test execution and responsive review

- Backend unit run: 23 passed, three integration tests deselected. Frontend ESLint completed with exit code zero and no diagnostics.
- Backend integration run on clean head: two passed, one failed. Only one passing integration test actually exercised a populated multi-user scenario. The public-profile result is inconclusive.
- Additional TestClient checks used real PostgreSQL. Catalog checks confirmed both missing schema objects. The two-user group-chat read verified content across accounts. The payment check read persisted state after the HTTP calls. Other successful reads were smoke checks.
- Edge tested login, Create an account and Forgot password navigation at 375, 768 and 1440 CSS pixels. No document-wide horizontal overflow was observed on those auth screens. Desktop signed-in navigation reached Dashboard, My Profile, Find Flatmates, Messages, Expenses, Living Groups, Household, Conflict Assistant and Settings. The notification click did not independently verify the full notifications destination.
- Signed-in phone/tablet samples often captured loading states with no heading. Find Flatmates was not verified by the tablet selector. These observations do not establish broken navigation or prove responsive correctness. No full visual, screen-reader, touch-target, contrast, populated-dialog or attachment preview sign-off.
- External SMTP, Redis interruption, payment apps, real uploads, prolonged polling, concurrent writes, live role revocation, browser-to-live-API journeys and production-like reverse proxy behavior were not exhaustively exercised. TestClient used in-process dispatch. Existing operational accounts and data were outside the audit.

## Release priorities

1. Repair fresh-install schema parity. Gate deployment on authenticated requests and messaging journeys against a newly migrated database and a representative upgraded copy.
2. Repair the false-green privacy fixture and the blocked-list route. Verify privacy and membership enforcement using owner, active member, pending member, unrelated user and blocked peer fixtures.
3. Resolve the payment evidence policy and the web scope of listings and vacancies. Reconcile balances after duplicate, disputed and concurrent payments.
4. Finish live browser journeys on all three viewport classes, including populated and failed states. Verify keyboard dialogs, auth expiry, notification destinations, group switching and attachment access.

## Registered API inventory

Paths below are extracted from the checkout's route decorators. Source locations identify the handler declaration for each operation. Listing a route records implementation surface only.

### backend/app/Routers/assistant.py

- GET `/assistant/analysis` (line 180)

### backend/app/Routers/auth.py

- POST `/auth/register` (line 49)
- POST `/auth/login` (line 120)
- POST `/auth/logout` (line 182)
- POST `/auth/forgot-password` (line 197)
- POST `/auth/verify-otp` (line 263)
- POST `/auth/reset-password` (line 346)
- GET `/auth/me` (line 428)

### backend/app/Routers/chores.py

- POST `/chores/` (line 169)
- GET `/chores/` (line 239)
- GET `/chores/history` (line 287)
- POST `/chores/{chore_id}/complete` (line 358)
- PUT `/chores/{chore_id}` (line 451)
- DELETE `/chores/{chore_id}` (line 543)
- GET `/chores/schedules` (line 584)
- POST `/chores/schedules` (line 611)
- PUT `/chores/schedules/{schedule_id}` (line 668)
- DELETE `/chores/schedules/{schedule_id}` (line 740)
- POST `/chores/schedules/generate` (line 791)

### backend/app/Routers/expenses.py

- POST `/expenses/` (line 209)
- GET `/expenses/` (line 305)
- GET `/expenses/category-totals` (line 374)
- GET `/expenses/monthly-total` (line 425)
- GET `/expenses/budget` (line 465)
- PUT `/expenses/budget` (line 521)
- POST `/expenses/recurring` (line 560)
- GET `/expenses/recurring` (line 614)
- PUT `/expenses/recurring/{recurring_id}` (line 656)
- DELETE `/expenses/recurring/{recurring_id}` (line 730)
- PUT `/expenses/{expense_id}` (line 771)
- DELETE `/expenses/{expense_id}` (line 821)

### backend/app/Routers/groups.py

- POST `/groups/` (line 151)
- GET `/groups/` (line 214)
- GET `/groups/preview/{invite_code}` (line 272)
- GET `/groups/{group_id}` (line 338)
- POST `/groups/join` (line 445)
- GET `/groups/{group_id}/invite-candidates` (line 566)
- POST `/groups/{group_id}/invite` (line 613)
- POST `/groups/{group_id}/members/{member_id}/approve` (line 709)
- POST `/groups/{group_id}/members/{member_id}/reject` (line 783)
- POST `/groups/{group_id}/members/{member_id}/remove` (line 845)
- POST `/groups/{group_id}/members/{member_id}/demote-admin` (line 928)
- POST `/groups/{group_id}/transfer-admin` (line 1008)
- GET `/groups/{group_id}/members/{member_id}/profile` (line 1073)
- GET `/groups/{group_id}/notifications` (line 1136)
- PUT `/groups/{group_id}/notifications` (line 1177)
- PUT `/groups/{group_id}` (line 1227)
- POST `/groups/{group_id}/avatar` (line 1269)
- DELETE `/groups/{group_id}/avatar` (line 1327)
- POST `/groups/{group_id}/leave` (line 1363)
- DELETE `/groups/{group_id}` (line 1419)
- GET `/groups/{group_id}/messages` (line 1443)
- POST `/groups/{group_id}/messages` (line 1491)

### backend/app/Routers/listings.py

- POST `/listings/` (line 130)
- PUT `/listings/{listing_id}` (line 201)
- GET `/listings/` (line 281)
- GET `/listings/{listing_id}` (line 355)
- DELETE `/listings/{listing_id}` (line 389)

### backend/app/Routers/matches.py

- GET `/matches/` (line 116)
- GET `/matches/preferences` (line 467)
- PUT `/matches/preferences` (line 500)
- GET `/matches/stable` (line 549)
- GET `/matches/reverse` (line 663)

### backend/app/Routers/messages.py

- GET `/messages/friends` (line 54)
- POST `/messages/` (line 147)
- POST `/messages/media` (line 258)
- GET `/messages/media/{attachment_id}` (line 439)
- GET `/messages/{user_id}` (line 481)
- DELETE `/messages/{message_id}` (line 625)
- PUT `/messages/{user_id}/read` (line 679)
- GET `/messages/` (line 743)
- GET `/messages/{user_id}/mute` (line 843)
- PUT `/messages/{user_id}/mute` (line 861)
- POST `/messages/{user_id}/block` (line 905)
- POST `/messages/{user_id}/unblock` (line 954)
- DELETE `/messages/{user_id}/block` (line 955)
- GET `/messages/blocked-users` (line 997)
- POST `/messages/{user_id}/report` (line 1046)
- DELETE `/messages/conversation/{user_id}` (line 1077)

### backend/app/Routers/notifications.py

- GET `/notifications/` (line 13)
- GET `/notifications/unread-count` (line 85)
- PUT `/notifications/read-all` (line 108)
- PUT `/notifications/{notification_id}/read` (line 137)
- DELETE `/notifications/clear-all` (line 173)
- DELETE `/notifications/{notification_id}` (line 201)

### backend/app/Routers/profile.py

- POST `/profile/` (line 39)
- PUT `/profile/` (line 105)
- GET `/profile/completion-status` (line 161)
- GET `/profile/` (line 217)
- GET `/profile/{target_user_id}` (line 344)

### backend/app/Routers/reliability.py

- GET `/reliability/` (line 144)

### backend/app/Routers/requests.py

- POST `/requests/{receiver_id}` (line 16)
- GET `/requests/received` (line 211)
- GET `/requests/sent` (line 259)
- GET `/requests/` (line 303)
- PUT `/requests/{request_id}/accept` (line 389)
- PUT `/requests/{request_id}/reject` (line 481)
- DELETE `/requests/{request_id}` (line 551)

### backend/app/Routers/rules.py

- POST `/rules/` (line 61)
- GET `/rules/` (line 102)
- PUT `/rules/{rule_id}` (line 141)
- DELETE `/rules/{rule_id}` (line 195)
- POST `/rules/violations` (line 233)
- GET `/rules/violations` (line 321)
- DELETE `/rules/violations/{violation_id}` (line 378)

### backend/app/Routers/settings.py

- GET `/settings/` (line 35)
- PUT `/settings/account` (line 74)
- POST `/settings/avatar` (line 162)
- DELETE `/settings/avatar` (line 222)
- DELETE `/settings/account` (line 250)
- POST `/settings/email/request-change` (line 342)
- POST `/settings/email/confirm-change` (line 414)
- PUT `/settings/password` (line 546)
- GET `/settings/blocked-users` (line 589)

### backend/app/Routers/shared_expenses.py

- GET `/shared-expenses/members` (line 105)
- POST `/shared-expenses/` (line 134)
- GET `/shared-expenses/` (line 320)
- GET `/shared-expenses/balances` (line 441)
- POST `/shared-expenses/settlements` (line 546)
- GET `/shared-expenses/settlements` (line 619)
- POST `/shared-expenses/settlements/{settlement_id}/undo` (line 678)
- DELETE `/shared-expenses/settlements/{settlement_id}` (line 763)
- GET `/shared-expenses/{expense_id}` (line 852)
- POST `/shared-expenses/{expense_id}/shares/{share_id}/report-payment` (line 949)
- POST `/shared-expenses/{expense_id}/shares/{share_id}/confirm-payment` (line 1089)
- POST `/shared-expenses/{expense_id}/shares/{share_id}/reject-payment` (line 1209)
- PUT `/shared-expenses/{expense_id}/settle` (line 1316)
- POST `/shared-expenses/{expense_id}/reminder` (line 1418)
- DELETE `/shared-expenses/{expense_id}` (line 1503)
- POST `/shared-expenses/settle-up-report` (line 1583)
- POST `/shared-expenses/confirm-settlement-receipt` (line 1742)
- POST `/shared-expenses/reject-settlement-receipt` (line 1874)

### backend/app/Routers/team_ups.py

- POST `/team-ups/` (line 68)
- GET `/team-ups/` (line 130)
- GET `/team-ups/mine` (line 183)
- DELETE `/team-ups/{team_up_id}` (line 218)

### backend/app/Routers/vacancies.py

- GET `/vacancies/` (line 92)
- GET `/vacancies/{group_id}/candidates` (line 157)
- PUT `/vacancies/{group_id}` (line 202)
- POST `/vacancies/{group_id}/apply` (line 233)

### backend/app/main.py

- GET `/docs` (line 98)
- GET `/` (line 109)
- GET `/health` (line 120)
- GET `/health/ready` (line 125)
