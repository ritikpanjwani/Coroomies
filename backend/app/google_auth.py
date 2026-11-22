from datetime import datetime, timezone

from fastapi import HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import GOOGLE_ALLOWED_ISSUERS, GOOGLE_CLIENT_ID


def verify_google_id_token(credential: str) -> dict:
    """Verify a Google OIDC ID token and return only trusted identity claims."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured.",
        )
    if not credential or len(credential) > 8192:
        raise HTTPException(status_code=401, detail="Invalid Google sign-in credential.")

    try:
        claims = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired Google sign-in credential.",
        ) from exc

    issuer = claims.get("iss")
    subject = claims.get("sub")
    email = claims.get("email")
    expires_at = claims.get("exp")

    if issuer not in GOOGLE_ALLOWED_ISSUERS:
        raise HTTPException(status_code=401, detail="Invalid Google token issuer.")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=401, detail="Google account identifier is missing.")
    if not isinstance(email, str) or not email.strip():
        raise HTTPException(status_code=401, detail="Google account email is missing.")
    if claims.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail="Google email is not verified.")
    if not isinstance(expires_at, (int, float)) or expires_at <= datetime.now(timezone.utc).timestamp():
        raise HTTPException(status_code=401, detail="Google sign-in credential has expired.")

    return {
        "sub": subject,
        "email": email.strip().lower(),
        "name": str(claims.get("name") or email.split("@", 1)[0]).strip()[:100],
        "picture": str(claims.get("picture") or "").strip()[:500] or None,
    }
