import base64
import json
import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from google.auth.exceptions import GoogleAuthError, TransportError

from app.config import GOOGLE_ALLOWED_ISSUERS, GOOGLE_CLIENT_ID

logger = logging.getLogger("coroomies.google_auth")
GOOGLE_TOKEN_CLOCK_SKEW_SECONDS = 60


def _safe_token_claims(credential: str) -> dict:
    """Decode only the JWT payload for diagnostic metadata.

    This is not a verification step. Signature, issuer, audience, expiry,
    and email verification are still enforced exclusively by Google's
    verified ID-token verifier.
    """
    try:
        payload = credential.split(".", 2)[1]
        padding = "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding)
        claims = json.loads(decoded.decode("utf-8"))
        if not isinstance(claims, dict):
            return {}
        return {
            "aud": claims.get("aud"),
            "iss": claims.get("iss"),
            "iat": claims.get("iat"),
            "exp": claims.get("exp"),
            "email_verified": claims.get("email_verified"),
        }
    except (IndexError, ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return {}


def _audience_matches(claimed_audience, configured_audience: str) -> bool:
    if isinstance(claimed_audience, str):
        return claimed_audience == configured_audience
    if isinstance(claimed_audience, list):
        return configured_audience in claimed_audience
    return False


def _log_verification_failure(category: str, diagnostic: dict, error: Exception) -> None:
    logger.warning(
        "Google ID token verification failed category=%s issuer_match=%s "
        "audience_match=%s expired=%s email_verified=%s error_type=%s",
        category,
        diagnostic["issuer_match"],
        diagnostic["audience_match"],
        diagnostic["expired"],
        diagnostic["email_verified"],
        type(error).__name__,
    )


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
            clock_skew_in_seconds=GOOGLE_TOKEN_CLOCK_SKEW_SECONDS,
        )
    except (ValueError, GoogleAuthError, TransportError) as exc:
        payload_claims = _safe_token_claims(credential)
        expires_at = payload_claims.get("exp")
        expired = (
            isinstance(expires_at, (int, float))
            and expires_at <= datetime.now(timezone.utc).timestamp()
        )
        issuer_match = payload_claims.get("iss") in GOOGLE_ALLOWED_ISSUERS
        audience_match = _audience_matches(payload_claims.get("aud"), GOOGLE_CLIENT_ID)
        diagnostic = {
            "issuer_match": issuer_match,
            "audience_match": audience_match,
            "expired": expired,
            "email_verified": payload_claims.get("email_verified"),
        }

        if not audience_match and payload_claims.get("aud") is not None:
            _log_verification_failure("audience_mismatch", diagnostic, exc)
            raise HTTPException(
                status_code=401,
                detail="Google sign-in credential is for a different OAuth client.",
            ) from exc
        if expired:
            _log_verification_failure("expired", diagnostic, exc)
            raise HTTPException(
                status_code=401,
                detail="Google sign-in credential has expired.",
            ) from exc
        if not issuer_match and payload_claims.get("iss") is not None:
            _log_verification_failure("issuer_mismatch", diagnostic, exc)
            raise HTTPException(
                status_code=401,
                detail="Google sign-in credential is from an untrusted issuer.",
            ) from exc

        _log_verification_failure("signature_or_public_key", diagnostic, exc)
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
