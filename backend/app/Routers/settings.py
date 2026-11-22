import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import Response

from app.auth import create_access_token, get_current_user_id
from app.config import DEV_MODE
from app.database import get_connection
from app.emailer import (
    send_email_change_otp_background,
    send_email_changed_notice_background,
)
from app.image_validation import (
    ALLOWED_EXTENSIONS,
    InvalidImageError,
    detect_image_extension,
    read_limited,
)
from app.rate_limit import enforce, get_client_ip
from app.schemas import AccountUpdate, EmailChangeRequest, EmailChangeConfirm, PasswordChange
from app.security import hash_password, verify_password, hash_otp, verify_otp_hash
from app.storage import avatar_storage

logger = logging.getLogger("coroomies.settings")

router = APIRouter(prefix="/settings", tags=["Settings"])

AVATAR_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "avatars")
os.makedirs(AVATAR_DIR, exist_ok=True)
USERNAME_COOLDOWN_DAYS = 30


@router.get("/")
def get_settings(user_id: int = Depends(get_current_user_id)):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT name, email, username, avatar_url, username_changed_at, upi_id
                FROM users WHERE id = %s
                """,
                (user_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")

            username_changed_at = row[4]
            can_change_username = True
            days_remaining = 0
            if username_changed_at:
                elapsed = datetime.now(timezone.utc) - username_changed_at
                if elapsed < timedelta(days=USERNAME_COOLDOWN_DAYS):
                    can_change_username = False
                    days_remaining = (timedelta(days=USERNAME_COOLDOWN_DAYS) - elapsed).days + 1

            return {
                "name": row[0],
                "email": row[1],
                "username": row[2],
                "avatar_url": row[3],
                "can_change_username": can_change_username,
                "days_until_username_change": days_remaining,
                "username_changed_at": row[4].isoformat() if row[4] else None,
                "upi_id": row[5] or "",
            }
    finally:
        connection.close()


@router.put("/account")
def update_account(
    data: AccountUpdate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT name, email, username, username_changed_at, upi_id FROM users WHERE id = %s",
                (user_id,),
            )
            current = cursor.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="User not found")

            new_username = data.username.strip() if data.username else None
            old_username = current[2]

            if new_username and new_username != old_username:
                now = datetime.now(timezone.utc)
                if current[3]:
                    elapsed = now - current[3]
                    if elapsed < timedelta(days=USERNAME_COOLDOWN_DAYS):
                        remaining = (timedelta(days=USERNAME_COOLDOWN_DAYS) - elapsed).days + 1
                        raise HTTPException(
                            status_code=400,
                            detail=f"You can change your username again in {remaining} days",
                        )

                cursor.execute(
                    "SELECT id FROM users WHERE username = %s AND id != %s",
                    (new_username, user_id),
                )
                if cursor.fetchone():
                    raise HTTPException(
                        status_code=400,
                        detail="This username is already taken",
                    )

            target_name = data.name.strip() if data.name is not None else current[0]
            clean_upi = data.upi_id.strip().lower() if data.upi_id else None
            target_upi = clean_upi if "upi_id" in data.model_fields_set else current[4]

            if new_username and new_username != old_username:
                cursor.execute(
                    """
                    UPDATE users
                    SET name = %s, username = %s, username_changed_at = %s, upi_id = %s
                    WHERE id = %s
                    """,
                    (target_name, new_username, datetime.now(timezone.utc), target_upi, user_id),
                )
            else:
                cursor.execute(
                    "UPDATE users SET name = %s, upi_id = %s WHERE id = %s",
                    (target_name, target_upi, user_id),
                )

            connection.commit()

            cursor.execute(
                "SELECT name, email, username, upi_id FROM users WHERE id = %s",
                (user_id,),
            )
            updated = cursor.fetchone()

            return {
                "message": "Account updated",
                "name": updated[0],
                "email": updated[1],
                "username": updated[2],
                "upi_id": updated[3] or "",
            }
    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            if "username" in str(e).lower():
                raise HTTPException(status_code=400, detail="This username is already taken")
            raise HTTPException(status_code=400, detail="An account with this email already exists")
        raise HTTPException(status_code=500, detail="Failed to update account")
    finally:
        connection.close()


@router.post("/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG, GIF, and WebP images are allowed",
        )

    try:
        contents = read_limited(file.file)
        detected_ext = detect_image_extension(contents)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # The stored name is generated server-side from the authenticated user id
    # and a random token, so client filenames (and any path traversal attempts)
    # are never used to build a path. The extension comes from the detected
    # content, not from the client.
    filename = f"{user_id}_{uuid.uuid4().hex[:12]}{detected_ext}"
    try:
        avatar_storage.save(filename, contents)
    except RuntimeError as exc:
        logger.error("Avatar storage upload failed: %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Failed to save avatar")
    except OSError:
        raise HTTPException(status_code=500, detail="Failed to save avatar")

    avatar_url = f"/settings/avatar-file/{filename}"

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT avatar_url FROM users WHERE id = %s",
                (user_id,),
            )
            old = cursor.fetchone()
            if old and old[0]:
                old_filename = os.path.basename(old[0])
                avatar_storage.delete(old_filename)

            cursor.execute(
                "UPDATE users SET avatar_url = %s WHERE id = %s",
                (avatar_url, user_id),
            )
            connection.commit()

            return {"avatar_url": avatar_url}
    finally:
        connection.close()


@router.delete("/avatar")
def remove_avatar(user_id: int = Depends(get_current_user_id)):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT avatar_url FROM users WHERE id = %s",
                (user_id,),
            )
            row = cursor.fetchone()
            if not row or not row[0]:
                raise HTTPException(status_code=404, detail="No avatar to remove")

            avatar_storage.delete(os.path.basename(row[0]))

            cursor.execute(
                "UPDATE users SET avatar_url = NULL WHERE id = %s",
                (user_id,),
            )
            connection.commit()

            return {"message": "Avatar removed"}
    finally:
        connection.close()


@router.delete("/account")
def delete_account(user_id: int = Depends(get_current_user_id)):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT avatar_url FROM users WHERE id = %s",
                (user_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")

            # Safety guard: the DB cascades on DELETE (living_groups.created_by
            # is ON DELETE CASCADE, and every group child table cascades from
            # living_groups). Deleting a user who still "owns" a group would
            # therefore destroy the whole group — including all other members'
            # shared expenses, chores, rules and messages. Refuse deletion and
            # require the user to transfer/release ownership first.
            cursor.execute(
                "SELECT id, name FROM living_groups WHERE created_by = %s",
                (user_id,),
            )
            owned_groups = cursor.fetchall()
            if owned_groups:
                names = ", ".join(
                    f'"{group[1] or group[0]}"' for group in owned_groups
                )
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"You cannot delete your account while you are the creator of "
                        f"{len(owned_groups)} living group(s): {names}. "
                        "Transfer ownership or delete those group(s) first."
                    ),
                )

            if row[0]:
                avatar_path = os.path.join(AVATAR_DIR, os.path.basename(row[0]))
                if os.path.exists(avatar_path):
                    os.remove(avatar_path)

            # Duties still assigned to the departing member belong to the group,
            # not to this account. Preserve them by unassigning instead of
            # letting the DB cascade delete the chore row.
            cursor.execute(
                "UPDATE chores SET assigned_to = NULL WHERE assigned_to = %s",
                (user_id,),
            )
            cursor.execute(
                "UPDATE chore_schedules SET assigned_to = NULL WHERE assigned_to = %s",
                (user_id,),
            )

            # The user's own data. Every table below references users with an
            # ON DELETE CASCADE (or SET NULL) foreign key, so any group content
            # they contributed (sent messages, recorded violations, etc.) is
            # removed safely without touching the group itself. The final
            # DELETE FROM users is the single point of truth; the explicit
            # rows above keep the intent visible.
            cursor.execute("DELETE FROM notifications WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM messages WHERE sender_id = %s OR receiver_id = %s", (user_id, user_id))
            cursor.execute("DELETE FROM roommate_requests WHERE sender_id = %s OR receiver_id = %s", (user_id, user_id))
            cursor.execute("DELETE FROM student_profiles WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM expenses WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM recurring_expenses WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM expense_settings WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM match_preferences WHERE user_id = %s", (user_id,))
            cursor.execute(
                "DELETE FROM blocked_pairs WHERE user_a_id = %s OR user_b_id = %s",
                (user_id, user_id),
            )
            cursor.execute("DELETE FROM password_reset_tokens WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM email_change_tokens WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM room_listings WHERE owner_id = %s", (user_id,))
            cursor.execute("DELETE FROM group_members WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM team_ups WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))

            connection.commit()

            return {"message": "Account deleted"}
    except HTTPException:
        connection.rollback()
        raise
    finally:
        connection.close()


EMAIL_TOKEN_TTL_MINUTES = 15


@router.post("/email/request-change")
def request_email_change(
    data: EmailChangeRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    user_id: int = Depends(get_current_user_id),
):
    enforce(f"email-change:ip:{get_client_ip(request)}", limit=6, window=60)
    enforce(f"email-change:user:{user_id}", limit=4, window=300)
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT email FROM users WHERE id = %s", (user_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")

            if data.new_email.strip().lower() == row[0].lower():
                raise HTTPException(
                    status_code=400,
                    detail="New email is the same as your current email",
                )

            cursor.execute(
                "SELECT id FROM users WHERE lower(email) = lower(%s) AND id != %s",
                (data.new_email.strip(), user_id),
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="An account with this email already exists",
                )

            cursor.execute(
                """
                UPDATE email_change_tokens
                SET used = TRUE
                WHERE user_id = %s AND used = FALSE
                """,
                (user_id,),
            )

            code = f"{secrets.randbelow(1000000):06d}"
            code_hash = hash_otp(code)
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=EMAIL_TOKEN_TTL_MINUTES)

            cursor.execute(
                """
                INSERT INTO email_change_tokens (user_id, new_email, code, expires_at, failed_attempts)
                VALUES (%s, %s, %s, %s, 0)
                """,
                (user_id, data.new_email.strip(), code_hash, expires_at),
            )
            connection.commit()

        # Send in background outside the DB transaction to avoid blocking HTTP response.
        background_tasks.add_task(
            send_email_change_otp_background,
            data.new_email.strip(),
            code,
            EMAIL_TOKEN_TTL_MINUTES,
            user_id=user_id,
        )

        return {
            "message": "Verification code sent to your new email.",
            "expires_in_minutes": EMAIL_TOKEN_TTL_MINUTES,
        }
    finally:
        connection.close()


@router.post("/email/confirm-change")
def confirm_email_change(
    data: EmailChangeConfirm,
    request: Request,
    background_tasks: BackgroundTasks,
    user_id: int = Depends(get_current_user_id),
):
    enforce(f"email-confirm:ip:{get_client_ip(request)}", limit=10, window=60)
    enforce(f"email-confirm:user:{user_id}", limit=6, window=300)
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            # Atomic row lock to serialize concurrent confirmation attempts
            cursor.execute(
                """
                SELECT id, expires_at, code, failed_attempts
                FROM email_change_tokens
                WHERE user_id = %s AND new_email = %s AND used = FALSE
                ORDER BY id DESC LIMIT 1
                FOR UPDATE
                """,
                (user_id, data.new_email.strip()),
            )
            row = cursor.fetchone()

            if not row:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid verification code",
                )

            token_id, expires_at, stored_code, failed_attempts = row

            if datetime.now(timezone.utc) > expires_at or failed_attempts >= 5:
                if failed_attempts >= 5:
                    cursor.execute(
                        "UPDATE email_change_tokens SET used = TRUE WHERE id = %s",
                        (token_id,),
                    )
                    connection.commit()
                raise HTTPException(
                    status_code=400,
                    detail="Verification code has expired or been invalidated. Please request a new one.",
                )

            if not verify_otp_hash(data.code, stored_code):
                new_attempts = failed_attempts + 1
                should_invalidate = new_attempts >= 5
                cursor.execute(
                    """
                    UPDATE email_change_tokens
                    SET failed_attempts = %s, used = %s
                    WHERE id = %s
                    """,
                    (new_attempts, should_invalidate, token_id),
                )
                connection.commit()
                if should_invalidate:
                    raise HTTPException(
                        status_code=400,
                        detail="Too many incorrect attempts. This code has been invalidated.",
                    )
                raise HTTPException(
                    status_code=400,
                    detail="Invalid verification code",
                )

            # Atomic single-use consumption: verify rowcount == 1
            cursor.execute(
                """
                UPDATE email_change_tokens
                SET used = TRUE
                WHERE id = %s AND used = FALSE
                """,
                (token_id,),
            )
            if cursor.rowcount == 0:
                connection.rollback()
                raise HTTPException(
                    status_code=400,
                    detail="Verification code has already been used.",
                )

            cursor.execute(
                "SELECT email FROM users WHERE id = %s",
                (user_id,),
            )
            old_email_row = cursor.fetchone()

            cursor.execute(
                "SELECT id FROM users WHERE lower(email) = lower(%s) AND id != %s",
                (data.new_email.strip(), user_id),
            )
            if cursor.fetchone():
                connection.rollback()
                raise HTTPException(
                    status_code=400,
                    detail="An account with this email already exists",
                )

            cursor.execute(
                """
                UPDATE users
                SET email = %s, token_version = token_version + 1
                WHERE id = %s
                RETURNING token_version
                """,
                (data.new_email.strip().lower(), user_id),
            )
            new_token_version = cursor.fetchone()[0]
            connection.commit()

        # Notify previous address in background so an account takeover is not silent.
        if old_email_row and old_email_row[0]:
            background_tasks.add_task(
                send_email_changed_notice_background,
                old_email_row[0],
            )

        return {
            "message": "Email updated successfully",
            "email": data.new_email.strip().lower(),
            "access_token": create_access_token(user_id, new_token_version),
            "token_type": "bearer",
        }
    except HTTPException:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.put("/password")
def change_password(
    data: PasswordChange,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT password_hash FROM users WHERE id = %s",
                (user_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")

            if not verify_password(data.current_password, row[0]):
                raise HTTPException(
                    status_code=400,
                    detail="Current password is incorrect",
                )

            cursor.execute(
                """
                UPDATE users
                SET password_hash = %s, token_version = token_version + 1
                WHERE id = %s
                RETURNING token_version
                """,
                (hash_password(data.new_password), user_id),
            )
            new_token_version = cursor.fetchone()[0]
            connection.commit()

            return {
                "message": "Password updated successfully",
                "access_token": create_access_token(user_id, new_token_version),
                "token_type": "bearer",
            }
    finally:
        connection.close()


@router.get("/avatar-file/{filename}")
def get_avatar_file(
    filename: str,
    user_id: int = Depends(get_current_user_id),
):
    """Serve a profile photo through an authenticated API route."""
    safe_name = os.path.basename(filename)
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM users WHERE avatar_url LIKE %s",
                (f"%{safe_name}",),
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Avatar not found")
        data = avatar_storage.read_bytes(safe_name)
        if data is None:
            raise HTTPException(status_code=404, detail="Avatar not found")
        ext = os.path.splitext(safe_name)[1].lower()
        media_type = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }.get(ext, "application/octet-stream")
        return Response(content=data, media_type=media_type, headers={"Cache-Control": "private, max-age=300"})
    finally:
        connection.close()


@router.get("/blocked-users")
def get_settings_blocked_users(
    user_id: int = Depends(get_current_user_id),
):
    """Retrieve all users blocked by the authenticated user."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    u.id,
                    u.name,
                    u.username,
                    u.avatar_url,
                    sp.college,
                    sp.degree,
                    sp.stream,
                    sp.year,
                    bp.created_at
                FROM blocked_pairs bp
                JOIN users u ON u.id = (CASE WHEN bp.user_a_id = %s THEN bp.user_b_id ELSE bp.user_a_id END)
                LEFT JOIN student_profiles sp ON sp.user_id = u.id
                WHERE bp.created_by = %s
                ORDER BY bp.created_at DESC
                """,
                (user_id, user_id),
            )
            rows = cursor.fetchall()
            return {
                "blocked_users": [
                    {
                        "user_id": row[0],
                        "name": row[1],
                        "username": row[2],
                        "avatar_url": row[3],
                        "college": row[4] or "",
                        "degree": row[5] or "",
                        "stream": row[6] or "",
                        "year": row[7] or "",
                        "blocked_at": row[8].isoformat() if row[8] else None,
                    }
                    for row in rows
                ]
            }
    finally:
        connection.close()
