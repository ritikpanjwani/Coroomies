# Google OAuth/OIDC Implementation Report

## Implemented

- Added Google Identity Services buttons to the existing Login and Register pages.
- Added `POST /auth/google` for Google sign-in and first-time account creation.
- Added `POST /auth/google/link` for securely linking an existing email/password account after password verification.
- Backend verification uses Google's official verifier, which validates the token signature and audience; the implementation additionally checks issuer, expiry, subject, and `email_verified`.
- Google accounts are mapped by Google's immutable `sub` identifier. Matching email addresses never merge automatically.
- New Google users receive a generated username, a random unusable password hash, the verified Google email, and the optional Google avatar.
- Existing JWT session credentials are issued through CoRoomies' current `create_access_token` path.
- New users remain subject to the existing profile-completion and matching gates. They must complete the mandatory profile fields before matching features can be used.
- Added the forward-only `google_identity_mapping` migration with a nullable unique `users.google_sub` column. Existing users and rows are preserved.

## Configuration

Backend environment:

```env
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

Frontend environment:

```env
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

The client ID is public configuration. No Google client secret is needed or accepted by the frontend. Do not put client secrets, Google credentials, or CoRoomies access tokens in URLs or logs.

## Google Cloud Console setup

Create a Google OAuth 2.0 **Web application** client and configure these authorized JavaScript origins:

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- Your Cloudflare Pages production origin, for example `https://app.example.com`
- Your Cloudflare Pages staging origin, if used

This implementation uses the Google Identity Services credential/popup flow, so no application callback URL is required. If the deployment later changes to a server-side redirect flow, register only the exact HTTPS callback URL and add state/nonce handling for that flow.

Apply the migration before enabling Google sign-in:

```powershell
cd backend
alembic upgrade head
```

## Verification

- Backend: `31 passed, 3 skipped` (the three existing PostgreSQL integration tests were skipped because no safe `TEST_DATABASE_URL` was configured).
- Google token and account-linking security regression tests: `8 passed`.
- Frontend ESLint: passed.
- Frontend production build: passed with an HTTPS API origin.
- `git diff --check`: passed.

## Remaining deployment steps

1. Configure the same Google web client ID in the backend and the matching frontend build environment.
2. Add the exact production/staging origins in Google Cloud Console.
3. Run the migration against an isolated staging database, then execute live Google sign-in, account-linking, logout/session invalidation, and profile-completion checks.
4. Confirm Cloudflare Pages CSP and Render CORS settings use the deployed origins.
