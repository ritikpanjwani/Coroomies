import os
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from psycopg.errors import UndefinedColumn

from app.auth import create_access_token, get_current_user_id, _verify_token_and_get_user_id
from app.config import DEV_MODE, IS_PRODUCTION
from app.database import get_connection
from app.google_auth import verify_google_id_token
from app.logging_utils import log_exception
from app.emailer import (
    send_otp_email_background,
    send_login_otp_email_background,
    smtp_configured,
)
from app.rate_limit import enforce, get_client_ip
from app.schemas import (
    ForgotPasswordRequest,
    GoogleAuthRequest,
    GoogleLinkRequest,
    ResetPasswordRequest,
    SendOtpRequest,
    UserCreate,
    UserLogin,
    VerifyLoginOtpRequest,
    VerifyOtpRequest,
)
from app.security import hash_password, verify_password, hash_otp, verify_otp_hash

logger = logging.getLogger("coroomies.auth")

router = APIRouter(prefix="/auth", tags=["Authentication"])

OTP_TTL_MINUTES = 10

# Mirrors the generic forgot-password wording: identical for every outcome
# so /reset-password can never be used to enumerate accounts or verify codes.
_RESET_GENERIC_RESPONSE = {
    "message": "If that account exists, the password has been reset. You can now log in."
}


def _find_user_by_identifier(cursor, identifier: str):
    ident = identifier.strip()
    cursor.execute(
        """
        SELECT id, name, email, password_hash, username
        FROM users
        WHERE lower(email) = lower(%s)
           OR username = %s
        LIMIT 1
        """,
        (ident, ident),
    )
    return cursor.fetchone()


def _auth_user_response(row, is_new_user: bool = False):
    return {
        "access_token": create_access_token(row[0], row[6]),
        "token_type": "bearer",
        "profile_complete": bool(row[8]),
        "is_new_user": is_new_user,
        "user": {
            "id": row[0],
            "name": row[1],
            "email": row[2],
            "username": row[4],
            "avatar_url": row[5],
            "upi_id": row[7] or "",
        },
    }


def _google_user_response(row, is_new_user: bool = False):
    return _auth_user_response(row, is_new_user=is_new_user)


def _load_user_full(cursor, user_id: int):
    cursor.execute(
        """
        SELECT u.id, u.name, u.email, u.password_hash, u.username, u.avatar_url,
               u.token_version, u.upi_id,
               EXISTS (SELECT 1 FROM student_profiles p WHERE p.user_id = u.id)
        FROM users u
        WHERE u.id = %s
        """,
        (user_id,),
    )
    return cursor.fetchone()


def _load_google_user(cursor, user_id: int):
    return _load_user_full(cursor, user_id)


def _available_username(cursor, email: str, base_hint: str | None = None) -> str:
    seed = base_hint or email.split("@", 1)[0]
    base = "".join(
        char for char in seed.lower()
        if char.isalnum() or char == "_"
    )
    base = (base or "user")[:24]
    if len(base) < 3:
        base = f"{base}_user"[:24]
    for suffix in range(100):
        username = base if suffix == 0 else f"{base[:20]}_{suffix}"
        cursor.execute("SELECT 1 FROM users WHERE username = %s", (username,))
        if not cursor.fetchone():
            return username
    return f"user_{secrets.token_hex(6)}"


def _available_google_username(cursor, email: str) -> str:
    return _available_username(cursor, email)


def mask_email(email: str) -> str:
    """Mask email for privacy and secure display (e.g. s***h@example.com)."""
    if not email or "@" not in email:
        return "***@***"
    local, domain = email.strip().split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "*"
    else:
        masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
    domain_parts = domain.split(".")
    if len(domain_parts) >= 2:
        domain_name = domain_parts[0]
        masked_domain = (domain_name[0] + "*" * (len(domain_name) - 1)) if len(domain_name) > 1 else domain_name
        return f"{masked_local}@{masked_domain}.{'.'.join(domain_parts[1:])}"
    return f"{masked_local}@{domain}"


def _authenticate_google(
    body,
    request: Request,
    link_password: str | None = None,
    link_otp: str | None = None,
):
    enforce(f"google-login:ip:{get_client_ip(request)}", limit=10, window=60)
    identity = verify_google_id_token(body.credential)
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id
                FROM users
                WHERE google_sub = %s
                LIMIT 1
                """,
                (identity["sub"],),
            )
            google_user = cursor.fetchone()
            if google_user:
                row = _load_google_user(cursor, google_user[0])
                connection.commit()
                return _google_user_response(row, is_new_user=False)

            cursor.execute(
                """
                SELECT id, password_hash
                FROM users
                WHERE lower(email) = lower(%s)
                LIMIT 1
                """,
                (identity["email"],),
            )
            email_user = cursor.fetchone()
            if email_user:
                if link_password is None and link_otp is None:
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "account_link_required",
                            "email": identity["email"],
                            "masked_email": mask_email(identity["email"]),
                            "message": (
                                f"An account already uses this email ({mask_email(identity['email'])}). "
                                "Enter its password or a verification code to securely link Google."
                            ),
                        },
                    )
                if link_password is not None:
                    if not verify_password(link_password, email_user[1]):
                        raise HTTPException(
                            status_code=401,
                            detail="The existing account password is incorrect.",
                        )
                elif link_otp is not None:
                    cursor.execute(
                        """
                        SELECT id, expires_at, otp_hash, failed_attempts
                        FROM auth_otps
                        WHERE lower(email) = %s AND used = FALSE AND purpose IN ('login', 'google_link')
                        ORDER BY id DESC LIMIT 1
                        FOR UPDATE
                        """,
                        (identity["email"].lower(),),
                    )
                    otp_row = cursor.fetchone()
                    if (
                        not otp_row
                        or datetime.now(timezone.utc) > otp_row[1]
                        or otp_row[3] >= 5
                        or not verify_otp_hash(link_otp, otp_row[2])
                    ):
                        if otp_row:
                            new_attempts = otp_row[3] + 1
                            should_invalidate = new_attempts >= 5
                            cursor.execute(
                                """
                                UPDATE auth_otps
                                SET failed_attempts = %s, used = %s
                                WHERE id = %s
                                """,
                                (new_attempts, should_invalidate, otp_row[0]),
                            )
                            connection.commit()
                            if should_invalidate:
                                raise HTTPException(
                                    status_code=401,
                                    detail="Too many incorrect attempts. Please request a new verification code.",
                                )
                        raise HTTPException(
                            status_code=401,
                            detail="Invalid or expired verification code.",
                        )
                    cursor.execute("UPDATE auth_otps SET used = TRUE WHERE id = %s", (otp_row[0],))

                cursor.execute(
                    """
                    UPDATE users
                    SET google_sub = %s, avatar_url = COALESCE(avatar_url, %s)
                    WHERE id = %s AND google_sub IS NULL
                    """,
                    (identity["sub"], identity["picture"], email_user[0]),
                )
                if cursor.rowcount != 1:
                    raise HTTPException(
                        status_code=409,
                        detail="This Google account is already linked.",
                    )
                row = _load_google_user(cursor, email_user[0])
                connection.commit()
                return _google_user_response(row, is_new_user=False)

            username = _available_username(cursor, identity["email"])
            cursor.execute(
                """
                INSERT INTO users
                    (name, email, password_hash, username, username_changed_at,
                     google_sub, avatar_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    identity["name"],
                    identity["email"],
                    hash_password(secrets.token_urlsafe(32)),
                    username,
                    datetime.now(timezone.utc),
                    identity["sub"],
                    identity["picture"],
                ),
            )
            new_user_id = cursor.fetchone()[0]
            row = _load_google_user(cursor, new_user_id)
            connection.commit()
            return _google_user_response(row, is_new_user=True)
    except HTTPException:
        connection.rollback()
        raise
    except Exception as exc:
        connection.rollback()
        if isinstance(exc, UndefinedColumn):
            raise HTTPException(
                status_code=503,
                detail="Google sign-in is temporarily unavailable until the database migration is applied.",
            ) from exc
        log_exception(logger, "Google authentication failed", exc)
        raise HTTPException(
            status_code=400,
            detail="Google sign-in failed. Please try again.",
        )
    finally:
        connection.close()


@router.post("/google")
def google_login(body: GoogleAuthRequest, request: Request):
    return _authenticate_google(body, request)


@router.post("/google/link")
def google_link(body: GoogleLinkRequest, request: Request):
    return _authenticate_google(body, request, link_password=body.password, link_otp=body.otp)


@router.post("/google/link-otp/send")
def send_google_link_otp(
    body: GoogleAuthRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Generate and dispatch an OTP for account linking, strictly deriving destination email from the server-verified Google identity."""
    if IS_PRODUCTION and not smtp_configured():
        raise HTTPException(
            status_code=503,
            detail="Email delivery service is currently unavailable. Please link your account using your password.",
        )
    enforce(f"google-link-otp:ip:{get_client_ip(request)}", limit=8, window=60)
    identity = verify_google_id_token(body.credential)
    email_lower = identity["email"].strip().lower()
    enforce(f"google-link-otp:email:{email_lower}", limit=4, window=300)

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE lower(email) = %s LIMIT 1", (email_lower,))
            user_row = cursor.fetchone()
            if not user_row:
                raise HTTPException(
                    status_code=404,
                    detail="No existing account found for this Google email.",
                )

            user_id = user_row[0]

            # Invalidate any prior unconsumed link or login OTPs for this email
            cursor.execute(
                """
                UPDATE auth_otps
                SET used = TRUE
                WHERE lower(email) = %s AND used = FALSE AND purpose IN ('login', 'google_link')
                """,
                (email_lower,),
            )

            otp = f"{secrets.randbelow(1000000):06d}"
            otp_hash_val = hash_otp(otp)
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)

            cursor.execute(
                """
                INSERT INTO auth_otps (email, otp_hash, purpose, user_id, expires_at, failed_attempts)
                VALUES (%s, %s, 'google_link', %s, %s, 0)
                """,
                (email_lower, otp_hash_val, user_id, expires_at),
            )
            connection.commit()

        background_tasks.add_task(
            send_login_otp_email_background,
            email_lower,
            otp,
            OTP_TTL_MINUTES,
            user_id=user_id,
        )

        response_data = {
            "message": f"Verification code sent to {mask_email(email_lower)}.",
            "email": email_lower,
            "masked_email": mask_email(email_lower),
            "expires_in_minutes": OTP_TTL_MINUTES,
        }

        return response_data
    except HTTPException:
        connection.rollback()
        raise
    except Exception as exc:
        connection.rollback()
        log_exception(logger, "Failed to send Google link OTP", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to send verification code. Please try again.",
        )
    finally:
        connection.close()


@router.get("/email/status", include_in_schema=not IS_PRODUCTION)
def email_status(request: Request):
    """Diagnostic check for SMTP connectivity and authentication status.

    Restricted to local development or authorized administrators.
    """
    if IS_PRODUCTION:
        auth_header = request.headers.get("Authorization")
        is_admin = False
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            try:
                user_id = _verify_token_and_get_user_id(token)
                admin_emails = {
                    e.strip().lower()
                    for e in (os.getenv("ADMIN_EMAILS") or os.getenv("ADMIN_EMAIL") or "").split(",")
                    if e.strip()
                }
                smtp_user = (os.getenv("SMTP_USER") or "").strip().lower()
                if smtp_user:
                    admin_emails.add(smtp_user)
                connection = get_connection()
                try:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT lower(email) FROM users WHERE id = %s", (user_id,))
                        row = cursor.fetchone()
                        if row and row[0] in admin_emails:
                            is_admin = True
                finally:
                    connection.close()
            except Exception:
                is_admin = False
        if not is_admin:
            raise HTTPException(status_code=404, detail="Not Found")

    from app.emailer import audit_smtp_connection
    res = audit_smtp_connection()
    if IS_PRODUCTION:
        return {
            "configured": res.get("configured", False),
            "connected": res.get("connected", False),
            "authenticated": res.get("authenticated", False),
            "error": res.get("error") if not res.get("authenticated") else None,
        }
    return res



@router.post("/otp/send")
def send_login_otp(
    body: SendOtpRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    if IS_PRODUCTION and not smtp_configured():
        raise HTTPException(
            status_code=503,
            detail="Email delivery service is currently unavailable. Please sign in with Google or your password.",
        )
    enforce(f"otp-send:ip:{get_client_ip(request)}", limit=8, window=60)
    email_lower = body.email.strip().lower()
    enforce(f"otp-send:email:{email_lower}", limit=4, window=300)

    connection = get_connection()
    user_id = None
    try:
        with connection.cursor() as cursor:
            # Invalidate previous unconsumed login/link OTPs for this email
            cursor.execute(
                """
                UPDATE auth_otps
                SET used = TRUE
                WHERE lower(email) = %s AND used = FALSE AND purpose IN ('login', 'google_link')
                """,
                (email_lower,),
            )

            otp = f"{secrets.randbelow(1000000):06d}"
            otp_hash_val = hash_otp(otp)
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)

            # Check if an account already exists for this email
            cursor.execute(
                "SELECT id FROM users WHERE lower(email) = %s LIMIT 1",
                (email_lower,),
            )
            user_row = cursor.fetchone()
            user_id = user_row[0] if user_row else None

            cursor.execute(
                """
                INSERT INTO auth_otps (email, otp_hash, purpose, user_id, expires_at, failed_attempts)
                VALUES (%s, %s, 'login', %s, %s, 0)
                """,
                (email_lower, otp_hash_val, user_id, expires_at),
            )
            connection.commit()

        # Dispatch email asynchronously in background
        background_tasks.add_task(
            send_login_otp_email_background,
            email_lower,
            otp,
            OTP_TTL_MINUTES,
            user_id=user_id,
        )

        response_data = {
            "message": f"Verification code sent to {email_lower}.",
            "expires_in_minutes": OTP_TTL_MINUTES,
        }

        return response_data
    except HTTPException:
        connection.rollback()
        raise
    except Exception as exc:
        connection.rollback()
        log_exception(logger, "Failed to send login OTP", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to send verification code. Please try again.",
        )
    finally:
        connection.close()


@router.post("/otp/verify")
def verify_login_otp(body: VerifyLoginOtpRequest, request: Request):
    enforce(f"otp-verify:ip:{get_client_ip(request)}", limit=15, window=60)
    email_lower = body.email.strip().lower()
    enforce(f"otp-verify:email:{email_lower}", limit=5, window=300)

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            # Atomic row lock to serialize concurrent verification attempts on this email's active OTP
            cursor.execute(
                """
                SELECT id, expires_at, otp_hash, failed_attempts, user_id
                FROM auth_otps
                WHERE lower(email) = %s AND used = FALSE AND purpose IN ('login', 'google_link')
                ORDER BY id DESC LIMIT 1
                FOR UPDATE
                """,
                (email_lower,),
            )
            token_row = cursor.fetchone()

            if not token_row:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid or expired verification code.",
                )

            token_id, expires_at, stored_otp_hash, failed_attempts, _ = token_row

            if datetime.now(timezone.utc) > expires_at or failed_attempts >= 5:
                if failed_attempts >= 5:
                    cursor.execute(
                        "UPDATE auth_otps SET used = TRUE WHERE id = %s",
                        (token_id,),
                    )
                    connection.commit()
                raise HTTPException(
                    status_code=400,
                    detail="Verification code has expired or been invalidated. Please request a new one.",
                )

            if not verify_otp_hash(body.otp, stored_otp_hash):
                new_attempts = failed_attempts + 1
                should_invalidate = new_attempts >= 5
                cursor.execute(
                    """
                    UPDATE auth_otps
                    SET failed_attempts = %s, used = %s
                    WHERE id = %s
                    """,
                    (new_attempts, should_invalidate, token_id),
                )
                connection.commit()
                if should_invalidate:
                    raise HTTPException(
                        status_code=400,
                        detail="Too many incorrect attempts. This code has been invalidated. Please request a new one.",
                    )
                raise HTTPException(
                    status_code=400,
                    detail="Invalid or expired verification code.",
                )

            # Mark token used
            cursor.execute(
                "UPDATE auth_otps SET used = TRUE WHERE id = %s AND used = FALSE",
                (token_id,),
            )
            if cursor.rowcount == 0:
                connection.rollback()
                raise HTTPException(
                    status_code=400,
                    detail="Verification code has already been used.",
                )

            # Find existing user by lower(email)
            cursor.execute(
                """
                SELECT u.id, u.name, u.email, u.password_hash, u.username, u.avatar_url,
                       u.token_version, u.upi_id,
                       EXISTS (SELECT 1 FROM student_profiles p WHERE p.user_id = u.id)
                FROM users u
                WHERE lower(u.email) = %s
                LIMIT 1
                """,
                (email_lower,),
            )
            user_row = cursor.fetchone()

            if user_row:
                # Existing user! All profiles, matches, chats, groups, and expenses preserved
                connection.commit()
                return _auth_user_response(user_row, is_new_user=False)

            # New user: Auto-provision account
            generated_username = _available_username(cursor, email_lower)
            name_seed = email_lower.split("@", 1)[0].replace(".", " ").replace("_", " ").replace("-", " ").title().strip()
            display_name = (name_seed or "CoRoomies User")[:100]
            placeholder_pw_hash = hash_password(secrets.token_urlsafe(32))
            now = datetime.now(timezone.utc)

            cursor.execute(
                """
                INSERT INTO users (name, email, password_hash, username, username_changed_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    display_name,
                    email_lower,
                    placeholder_pw_hash,
                    generated_username,
                    now,
                ),
            )
            new_user_id = cursor.fetchone()[0]
            new_row = _load_user_full(cursor, new_user_id)
            connection.commit()
            return _auth_user_response(new_row, is_new_user=True)

    except HTTPException:
        connection.rollback()
        raise
    except Exception as exc:
        connection.rollback()
        log_exception(logger, "OTP verification failed", exc)
        raise HTTPException(
            status_code=400,
            detail="Failed to verify code. Please try again.",
        )
    finally:
        connection.close()



@router.get("/google/config")
def google_config():
    from app.config import GOOGLE_CLIENT_ID

    if not GOOGLE_CLIENT_ID:
        return {"configured": False, "client_id": None}
    return {"configured": True, "client_id": GOOGLE_CLIENT_ID}


@router.post("/register")
def register(user: UserCreate, request: Request):
    enforce(f"register:ip:{get_client_ip(request)}", limit=6, window=60)
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM users WHERE username = %s",
                (user.username.strip(),),
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="This username is already taken",
                )

            if user.email:
                cursor.execute("SELECT id FROM users WHERE lower(email) = lower(%s)", (user.email,))
                if cursor.fetchone():
                    raise HTTPException(
                        status_code=400,
                        detail="An account with this email already exists",
                    )

            now = datetime.now(timezone.utc)
            cursor.execute(
                """
                INSERT INTO users (name, email, password_hash, username, username_changed_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, name, email, username
                """,
                (
                    user.name,
                    user.email,
                    hash_password(user.password),
                    user.username.strip(),
                    now,
                ),
            )

            new_user = cursor.fetchone()
            connection.commit()

            return {
                "id": new_user[0],
                "name": new_user[1],
                "email": new_user[2],
                "username": new_user[3],
            }

    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        log_exception(logger, "Registration failed", e)
        err = str(e).lower()
        if "unique" in err or "duplicate" in err or "users_email_key" in err:
            if "username" in err:
                raise HTTPException(status_code=400, detail="This username is already taken")
            raise HTTPException(status_code=400, detail="An account with this email already exists")
        raise HTTPException(
            status_code=400,
            detail="Registration failed. Please try again.",
        )

    finally:
        connection.close()


@router.post("/login")
def login(user: UserLogin, request: Request):
    enforce(f"login:ip:{get_client_ip(request)}", limit=20, window=60)
    identifier = (user.identifier or "").strip().lower()
    if identifier:
        enforce(f"login:ident:{identifier}", limit=6, window=60)
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name, email, password_hash, username, avatar_url, token_version, upi_id
                FROM users
                WHERE lower(email) = lower(%s)
                   OR username = %s
                LIMIT 1
                """,
                (user.identifier.strip(), user.identifier.strip()),
            )

            db_user = cursor.fetchone()

            if not db_user:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid username/email or password",
                )

            if not verify_password(user.password, db_user[3]):
                raise HTTPException(
                    status_code=401,
                    detail="Invalid username/email or password",
                )

            token = create_access_token(db_user[0], db_user[6])

            return {
                "access_token": token,
                "token_type": "bearer",
                "user": {
                    "id": db_user[0],
                    "name": db_user[1],
                    "email": db_user[2],
                    "username": db_user[4],
                    "avatar_url": db_user[5],
                    "upi_id": db_user[7] or "",
                },
            }

    except HTTPException:
        raise
    except Exception as exc:
        log_exception(logger, "Login failed", exc)
        raise HTTPException(
            status_code=400,
            detail="Login failed. Please try again.",
        )
    finally:
        connection.close()


@router.post("/logout")
def logout(user_id: int = Depends(get_current_user_id)):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE users SET token_version = token_version + 1 WHERE id = %s",
                (user_id,),
            )
        connection.commit()
        return {"message": "Logged out"}
    finally:
        connection.close()


@router.post("/forgot-password")
def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    if IS_PRODUCTION and not smtp_configured():
        raise HTTPException(
            status_code=503,
            detail="Password recovery via email is currently unavailable. Please sign in using Google.",
        )
    enforce(f"forgot:ip:{get_client_ip(request)}", limit=6, window=60)
    identifier = (body.identifier or "").strip().lower()
    if identifier:
        enforce(f"forgot:ident:{identifier}", limit=4, window=300)
    connection = get_connection()
    otp = None
    target_email = None
    user_id = None

    try:
        with connection.cursor() as cursor:
            db_user = _find_user_by_identifier(cursor, body.identifier)

            if db_user:
                cursor.execute(
                    "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = %s AND used = FALSE",
                    (db_user[0],),
                )

                import secrets

                otp = f"{secrets.randbelow(1000000):06d}"
                otp_hash = hash_otp(otp)
                user_id = db_user[0]
                target_email = db_user[2]
                expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)

                cursor.execute(
                    """
                    INSERT INTO password_reset_tokens (user_id, otp, expires_at, failed_attempts)
                    VALUES (%s, %s, %s, 0)
                    """,
                    (user_id, otp_hash, expires_at),
                )
                connection.commit()

        # Send in background outside the DB transaction to avoid blocking HTTP response.
        if target_email and otp:
            background_tasks.add_task(
                send_otp_email_background,
                target_email,
                otp,
                OTP_TTL_MINUTES,
                user_id=user_id,
            )

    except HTTPException:
        connection.rollback()
        raise
    finally:
        connection.close()

    # Generic response regardless of whether the account exists, so the API
    # cannot be used to enumerate accounts or harvest emails.
    return {
        "message": "If that account exists, a verification code has been sent to its email.",
        "expires_in_minutes": OTP_TTL_MINUTES,
    }


@router.post("/verify-otp")
def verify_otp(body: VerifyOtpRequest, request: Request):
    enforce(f"verify-otp:ip:{get_client_ip(request)}", limit=10, window=60)
    identifier = (body.identifier or "").strip().lower()
    if identifier:
        enforce(f"verify-otp:ident:{identifier}", limit=5, window=300)
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            db_user = _find_user_by_identifier(cursor, body.identifier)

            if not db_user:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid or expired verification code.",
                )

            # Atomic row lock to serialize concurrent verification attempts on this user's active token
            cursor.execute(
                """
                SELECT id, expires_at, otp, failed_attempts
                FROM password_reset_tokens
                WHERE user_id = %s AND used = FALSE
                ORDER BY id DESC LIMIT 1
                FOR UPDATE
                """,
                (db_user[0],),
            )
            token_row = cursor.fetchone()

            if not token_row:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid or expired verification code.",
                )

            token_id, expires_at, stored_otp, failed_attempts = token_row

            # Invalidate if expired or max attempts reached
            if datetime.now(timezone.utc) > expires_at or failed_attempts >= 5:
                if failed_attempts >= 5:
                    cursor.execute(
                        "UPDATE password_reset_tokens SET used = TRUE WHERE id = %s",
                        (token_id,),
                    )
                    connection.commit()
                raise HTTPException(
                    status_code=400,
                    detail="Verification code has expired or been invalidated. Please request a new one.",
                )

            # Verify against stored hash (HMAC-SHA256, plain SHA-256 fallback, or legacy plaintext)
            if not verify_otp_hash(body.otp, stored_otp):
                new_attempts = failed_attempts + 1
                should_invalidate = new_attempts >= 5
                cursor.execute(
                    """
                    UPDATE password_reset_tokens
                    SET failed_attempts = %s, used = %s
                    WHERE id = %s
                    """,
                    (new_attempts, should_invalidate, token_id),
                )
                connection.commit()
                if should_invalidate:
                    raise HTTPException(
                        status_code=400,
                        detail="Too many incorrect attempts. This code has been invalidated. Please request a new one.",
                    )
                raise HTTPException(
                    status_code=400,
                    detail="Invalid or expired verification code.",
                )

            return {
                "message": "Verification code is valid.",
                "valid": True,
            }
    finally:
        connection.close()


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, request: Request):
    enforce(f"reset:ip:{get_client_ip(request)}", limit=10, window=60)
    identifier = (body.identifier or "").strip().lower()
    if identifier:
        enforce(f"reset:ident:{identifier}", limit=5, window=300)
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            db_user = _find_user_by_identifier(cursor, body.identifier)

            if not db_user:
                return _RESET_GENERIC_RESPONSE

            # Lock the active token row for atomic consumption
            cursor.execute(
                """
                SELECT id, expires_at, otp, failed_attempts
                FROM password_reset_tokens
                WHERE user_id = %s AND used = FALSE
                ORDER BY id DESC LIMIT 1
                FOR UPDATE
                """,
                (db_user[0],),
            )
            token_row = cursor.fetchone()

            if not token_row:
                return _RESET_GENERIC_RESPONSE

            token_id, expires_at, stored_otp, failed_attempts = token_row

            if datetime.now(timezone.utc) > expires_at or failed_attempts >= 5:
                if failed_attempts >= 5:
                    cursor.execute(
                        "UPDATE password_reset_tokens SET used = TRUE WHERE id = %s",
                        (token_id,),
                    )
                    connection.commit()
                return _RESET_GENERIC_RESPONSE

            # Verify OTP
            if not verify_otp_hash(body.otp, stored_otp):
                new_attempts = failed_attempts + 1
                should_invalidate = new_attempts >= 5
                cursor.execute(
                    """
                    UPDATE password_reset_tokens
                    SET failed_attempts = %s, used = %s
                    WHERE id = %s
                    """,
                    (new_attempts, should_invalidate, token_id),
                )
                connection.commit()
                return _RESET_GENERIC_RESPONSE

            # ATOMIC CONSUMPTION: mark token used, guaranteeing rowcount == 1
            cursor.execute(
                """
                UPDATE password_reset_tokens
                SET used = TRUE
                WHERE id = %s AND used = FALSE
                """,
                (token_id,),
            )
            if cursor.rowcount == 0:
                connection.rollback()
                return _RESET_GENERIC_RESPONSE

            cursor.execute(
                "UPDATE users SET password_hash = %s, token_version = token_version + 1 WHERE id = %s",
                (hash_password(body.new_password), db_user[0]),
            )
            connection.commit()

    finally:
        connection.close()

    return _RESET_GENERIC_RESPONSE


@router.get("/me")
def get_me(user_id: int = Depends(get_current_user_id)):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, name, email, username, avatar_url FROM users WHERE id = %s",
                (user_id,),
            )
            row = cursor.fetchone()
    finally:
        connection.close()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    # Keep `user_id` for backward compatibility while also returning the basic
    # identity fields pages need, avoiding an extra round-trip (L10).
    return {
        "message": "You are authenticated",
        "user_id": row[0],
        "id": row[0],
        "name": row[1],
        "email": row[2],
        "username": row[3],
        "avatar_url": row[4],
    }
