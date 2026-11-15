import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.auth import get_current_user_id, get_current_user_id_flexible
from app.database import get_connection
from app.media_validation import (
    InvalidMediaError,
    validate_chat_media,
)
from app.notification_service import create_notification
from app.storage import media_storage

router = APIRouter(
    prefix="/messages",
    tags=["Messages"],
)


class MessageCreate(BaseModel):
    receiver_id: int
    content: str = Field(min_length=1, max_length=2000)


class MuteRequest(BaseModel):
    is_muted: Optional[bool] = None


class ReportRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    details: Optional[str] = Field(None, max_length=2000)


def _are_connected(cursor, user_a: int, user_b: int) -> bool:
    """True if the two users have a roommate request between them (accepted)."""
    cursor.execute(
        """
        SELECT id
        FROM roommate_requests
        WHERE status = 'accepted'
          AND (
            (sender_id = %s AND receiver_id = %s)
            OR (sender_id = %s AND receiver_id = %s)
          )
        """,
        (user_a, user_b, user_b, user_a),
    )
    return cursor.fetchone() is not None


@router.get("/friends")
def get_friends(
    current_user_id: int = Depends(get_current_user_id),
):
    """Users you have exchanged a roommate request with (pending or accepted)."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT r.id, r.sender_id, r.receiver_id, r.status, r.created_at
                FROM roommate_requests r
                WHERE (r.sender_id = %s OR r.receiver_id = %s)
                  AND r.status IN ('pending', 'accepted')
                ORDER BY r.id DESC
                """,
                (current_user_id, current_user_id),
            )

            rows = cursor.fetchall()

            friends_map = {}
            for request_id, sender_id, receiver_id, status, created_at in rows:
                other = receiver_id if sender_id == current_user_id else sender_id
                if other == current_user_id:
                    continue
                current = friends_map.get(other)
                if current is None or (current["status"] == "pending" and status == "accepted"):
                    friends_map[other] = {
                        "request_id": request_id,
                        "status": status,
                        "direction": "outgoing" if sender_id == current_user_id else "incoming",
                        "created_at": created_at,
                    }

            if not friends_map:
                return {"friends": []}

            friend_ids = list(friends_map.keys())

            cursor.execute(
                """
                SELECT id, name, email, avatar_url, username
                FROM users
                WHERE id = ANY(%s)
                """,
                (friend_ids,),
            )

            users = {row[0]: {"id": row[0], "name": row[1], "email": row[2], "avatar_url": row[3], "username": row[4] if len(row) > 4 else None}
                     for row in cursor.fetchall()}

            # Check muted peers
            cursor.execute(
                """
                SELECT peer_id FROM conversation_notification_settings
                WHERE user_id = %s AND is_muted = TRUE
                """,
                (current_user_id,),
            )
            muted_peer_ids = {row[0] for row in cursor.fetchall()}

            # Email addresses are only revealed for 'accepted' connections.
            # Pending requests still appear so the request inbox (accept /
            # reject / waiting) keeps working, but the peer's contact email
            # is never handed out before the connection is confirmed.
            friends = []
            for uid in friend_ids:
                user = users.get(uid)
                if not user:
                    continue
                status = friends_map[uid]["status"]
                created_dt = friends_map[uid].get("created_at")
                friends.append({
                    "user_id": uid,
                    "name": user["name"],
                    "email": user["email"] if status == "accepted" else None,
                    "avatar_url": user.get("avatar_url"),
                    "username": user.get("username"),
                    "request_id": friends_map[uid]["request_id"],
                    "status": status,
                    "direction": friends_map[uid]["direction"],
                    "created_at": created_dt.isoformat() if created_dt else None,
                    "is_muted": uid in muted_peer_ids,
                })

            return {"friends": friends}

    finally:
        connection.close()


@router.post("/")
def send_message(
    message: MessageCreate,
    sender_id: int = Depends(get_current_user_id),
):
    if sender_id == message.receiver_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot message yourself",
        )

    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            # Check receiver exists
            cursor.execute(
                "SELECT id FROM users WHERE id = %s",
                (message.receiver_id,),
            )

            if not cursor.fetchone():
                raise HTTPException(
                    status_code=404,
                    detail="User not found",
                )

            # Check blocked pairs
            cursor.execute(
                """
                SELECT id FROM blocked_pairs
                WHERE (user_a_id = %s AND user_b_id = %s)
                   OR (user_a_id = %s AND user_b_id = %s)
                """,
                (sender_id, message.receiver_id, message.receiver_id, sender_id),
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=403,
                    detail="You cannot message this user.",
                )

            # Only people you've exchanged a request with can chat
            if not _are_connected(cursor, sender_id, message.receiver_id):
                raise HTTPException(
                    status_code=403,
                    detail="You can only message people you've exchanged a roommate request with. Send a roommate request first.",
                )

            cursor.execute(
                """
                INSERT INTO messages
                (sender_id, receiver_id, content, created_at)
                VALUES (%s, %s, %s, NOW())
                RETURNING id
                """,
                (
                    sender_id,
                    message.receiver_id,
                    message.content.strip(),
                ),
            )

            message_id = cursor.fetchone()[0]

            # Fetch sender name and notify receiver unless muted
            cursor.execute("SELECT name FROM users WHERE id = %s", (sender_id,))
            sender_name_row = cursor.fetchone()
            sender_name = sender_name_row[0] if sender_name_row else "Someone"

            # Check if receiver muted sender
            cursor.execute(
                """
                SELECT is_muted FROM conversation_notification_settings
                WHERE user_id = %s AND peer_id = %s
                """,
                (message.receiver_id, sender_id),
            )
            mute_row = cursor.fetchone()
            receiver_muted = mute_row is not None and mute_row[0] is True

            if not receiver_muted:
                preview = message.content.strip()
                if len(preview) > 60:
                    preview = preview[:57] + "..."

                create_notification(
                    cursor=cursor,
                    user_id=message.receiver_id,
                    title=f"New message from {sender_name}",
                    message=preview,
                    notification_type="new_message",
                    reference_id=str(sender_id),
                    reference_type="message",
                    sender_id=sender_id,
                    sender_name=sender_name,
                    dedup=True,
                )

            connection.commit()

            return {
                "message": "Message sent",
                "message_id": message_id,
            }

    finally:
        connection.close()


@router.post("/media")
async def send_media_message(
    receiver_id: int = Form(...),
    content: Optional[str] = Form(""),
    files: List[UploadFile] = File(...),
    sender_id: int = Depends(get_current_user_id),
):
    if sender_id == receiver_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot message yourself",
        )

    if not files:
        raise HTTPException(
            status_code=400,
            detail="At least one media file is required",
        )

    # 1. Read and validate all files BEFORE touching database or storage
    validated_files = []
    for upload in files:
        contents = await upload.read()
        if not contents:
            raise HTTPException(status_code=400, detail="One of the uploaded files is empty")

        try:
            meta = validate_chat_media(contents, upload.filename or "")
        except InvalidMediaError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        orig_name = os.path.basename(upload.filename or f"media{meta['extension']}")
        if len(orig_name) > 100:
            name_base, name_ext = os.path.splitext(orig_name)
            orig_name = name_base[:90] + name_ext

        validated_files.append((contents, meta, orig_name))

    connection = get_connection()
    saved_storage_refs = []
    try:
        with connection.cursor() as cursor:
            # Check receiver exists
            cursor.execute("SELECT id FROM users WHERE id = %s", (receiver_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="User not found")

            # Check blocked pairs
            cursor.execute(
                """
                SELECT id FROM blocked_pairs
                WHERE (user_a_id = %s AND user_b_id = %s)
                   OR (user_a_id = %s AND user_b_id = %s)
                """,
                (sender_id, receiver_id, receiver_id, sender_id),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=403, detail="You cannot message this user.")

            # Check connection
            if not _are_connected(cursor, sender_id, receiver_id):
                raise HTTPException(
                    status_code=403,
                    detail="You can only message people you've exchanged a roommate request with.",
                )

            # Insert message
            text_content = (content or "").strip()
            cursor.execute(
                """
                INSERT INTO messages (sender_id, receiver_id, content, created_at)
                VALUES (%s, %s, %s, NOW())
                RETURNING id, created_at
                """,
                (sender_id, receiver_id, text_content),
            )
            msg_row = cursor.fetchone()
            message_id = msg_row[0]
            msg_created_at = msg_row[1]

            # Save attachments to storage and insert DB records
            created_attachments = []
            for data_bytes, meta, orig_name in validated_files:
                safe_filename = f"{sender_id}_{uuid.uuid4().hex[:16]}{meta['extension']}"
                storage_ref = media_storage.save(safe_filename, data_bytes)
                saved_storage_refs.append(storage_ref)

                cursor.execute(
                    """
                    INSERT INTO message_attachments
                    (message_id, sender_id, receiver_id, media_type, storage_path, original_filename,
                     mime_type, file_size, width, height, duration, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id, created_at
                    """,
                    (
                        message_id,
                        sender_id,
                        receiver_id,
                        meta["media_type"],
                        storage_ref,
                        orig_name,
                        meta["mime_type"],
                        meta["file_size"],
                        meta.get("width"),
                        meta.get("height"),
                        None,
                    ),
                )
                att_row = cursor.fetchone()
                created_attachments.append({
                    "id": att_row[0],
                    "message_id": message_id,
                    "media_type": meta["media_type"],
                    "original_filename": orig_name,
                    "mime_type": meta["mime_type"],
                    "file_size": meta["file_size"],
                    "width": meta.get("width"),
                    "height": meta.get("height"),
                    "duration": None,
                    "created_at": att_row[1].isoformat() if att_row[1] else None,
                })

            # Fetch sender name and notify receiver unless muted
            cursor.execute("SELECT name FROM users WHERE id = %s", (sender_id,))
            sender_name_row = cursor.fetchone()
            sender_name = sender_name_row[0] if sender_name_row else "Someone"

            cursor.execute(
                """
                SELECT is_muted FROM conversation_notification_settings
                WHERE user_id = %s AND peer_id = %s
                """,
                (receiver_id, sender_id),
            )
            mute_row = cursor.fetchone()
            receiver_muted = mute_row is not None and mute_row[0] is True

            if not receiver_muted:
                if text_content:
                    preview = text_content if len(text_content) <= 60 else text_content[:57] + "..."
                else:
                    first_type = created_attachments[0]["media_type"]
                    count = len(created_attachments)
                    if count > 1:
                        preview = f"📷 {count} media attachments"
                    elif first_type == "video":
                        preview = "🎥 Video"
                    else:
                        preview = "📷 Photo"

                create_notification(
                    cursor=cursor,
                    user_id=receiver_id,
                    title=f"New message from {sender_name}",
                    message=preview,
                    notification_type="new_message",
                    reference_id=str(sender_id),
                    reference_type="message",
                    sender_id=sender_id,
                    sender_name=sender_name,
                    dedup=True,
                )

            connection.commit()

            return {
                "message": "Message sent",
                "message_id": message_id,
                "content": text_content,
                "created_at": msg_created_at.isoformat() if msg_created_at else None,
                "attachments": created_attachments,
            }
    except Exception:
        for ref in saved_storage_refs:
            media_storage.delete(ref)
        raise
    finally:
        connection.close()


@router.get("/media/{attachment_id}")
def get_media(
    attachment_id: int,
    current_user_id: int = Depends(get_current_user_id_flexible),
):
    """Retrieve and stream protected media file with participant verification."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, sender_id, receiver_id, storage_path, mime_type, original_filename
                FROM message_attachments
                WHERE id = %s
                """,
                (attachment_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Media not found")

            att_id, sender_id, receiver_id, storage_path, mime_type, orig_filename = row

            if current_user_id not in (sender_id, receiver_id):
                raise HTTPException(
                    status_code=403,
                    detail="You are not authorized to access this media file",
                )

            file_path = media_storage.get_path(storage_path)
            if not file_path or not file_path.is_file():
                raise HTTPException(status_code=404, detail="Media file no longer exists on server")

            return FileResponse(
                path=str(file_path),
                media_type=mime_type,
                filename=orig_filename,
            )
    finally:
        connection.close()


@router.get("/{user_id}")
def get_conversation(
    user_id: int,
    current_user_id: int = Depends(get_current_user_id),
):
    if user_id == current_user_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid conversation",
        )

    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            # Make sure user exists
            cursor.execute(
                "SELECT id, name, email, avatar_url, username FROM users WHERE id = %s",
                (user_id,),
            )

            other_user = cursor.fetchone()

            if not other_user:
                raise HTTPException(
                    status_code=404,
                    detail="User not found",
                )

            # Check if conversation is muted
            cursor.execute(
                "SELECT is_muted FROM conversation_notification_settings WHERE user_id = %s AND peer_id = %s",
                (current_user_id, user_id),
            )
            mute_row = cursor.fetchone()
            is_muted = mute_row is not None and mute_row[0] is True

            # Check if blocked
            cursor.execute(
                """
                SELECT id FROM blocked_pairs
                WHERE (user_a_id = %s AND user_b_id = %s)
                   OR (user_a_id = %s AND user_b_id = %s)
                """,
                (current_user_id, user_id, user_id, current_user_id),
            )
            is_blocked = cursor.fetchone() is not None

            # Only people you've exchanged a request with can read the thread
            if not _are_connected(cursor, current_user_id, user_id):
                raise HTTPException(
                    status_code=403,
                    detail="You can only message people you've exchanged a roommate request with.",
                )

            cursor.execute(
                """
                SELECT
                    m.id,
                    m.sender_id,
                    m.receiver_id,
                    m.content,
                    m.created_at,
                    m.is_read
                FROM messages m
                WHERE
                    (
                        m.sender_id = %s
                        AND m.receiver_id = %s
                    )
                    OR
                    (
                        m.sender_id = %s
                        AND m.receiver_id = %s
                    )
                ORDER BY m.created_at ASC
                """,
                (
                    current_user_id,
                    user_id,
                    user_id,
                    current_user_id,
                ),
            )

            rows = cursor.fetchall()

            # Fetch media attachments for messages in this thread
            attachments_by_msg = {}
            if rows:
                message_ids = [r[0] for r in rows]
                cursor.execute(
                    """
                    SELECT id, message_id, media_type, original_filename, mime_type, file_size, width, height, duration, created_at
                    FROM message_attachments
                    WHERE message_id = ANY(%s)
                    ORDER BY id ASC
                    """,
                    (message_ids,),
                )
                att_rows = cursor.fetchall()
                for a in att_rows:
                    attachments_by_msg.setdefault(a[1], []).append({
                        "id": a[0],
                        "message_id": a[1],
                        "media_type": a[2],
                        "original_filename": a[3],
                        "mime_type": a[4],
                        "file_size": a[5],
                        "width": a[6],
                        "height": a[7],
                        "duration": a[8],
                        "created_at": a[9].isoformat() if a[9] else None,
                    })

            return {
                "user": {
                    "id": other_user[0],
                    "name": other_user[1],
                    "email": other_user[2],
                    "avatar_url": other_user[3],
                    "username": other_user[4] if len(other_user) > 4 else None,
                    "is_muted": is_muted,
                    "is_blocked": is_blocked,
                },
                "messages": [
                    {
                        "id": row[0],
                        "sender_id": row[1],
                        "receiver_id": row[2],
                        "content": row[3] or "",
                        "created_at": row[4].isoformat() if row[4] else None,
                        "is_read": row[5] if len(row) > 5 else False,
                        "attachments": attachments_by_msg.get(row[0], []),
                    }
                    for row in rows
                ],
            }

    finally:
        connection.close()


@router.delete("/{message_id}")
def delete_message(
    message_id: int,
    current_user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            # Verify message exists and user is sender
            cursor.execute(
                "SELECT sender_id FROM messages WHERE id = %s",
                (message_id,),
            )

            result = cursor.fetchone()

            if not result:
                raise HTTPException(
                    status_code=404,
                    detail="Message not found",
                )

            sender_id = result[0]

            if sender_id != current_user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only delete your own messages",
                )

            # Delete physical media files associated with this message
            cursor.execute(
                "SELECT storage_path FROM message_attachments WHERE message_id = %s",
                (message_id,),
            )
            for att_row in cursor.fetchall():
                if att_row[0]:
                    media_storage.delete(att_row[0])

            cursor.execute(
                "DELETE FROM messages WHERE id = %s",
                (message_id,),
            )

            connection.commit()

            return {"message": "Message deleted"}

    finally:
        connection.close()


@router.put("/{user_id}/read")
def mark_conversation_read(
    user_id: int,
    current_user_id: int = Depends(get_current_user_id),
):
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="Invalid conversation")

    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            # A missing conversation partner must surface as 404 rather than a
            # silent success (M10).
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="User not found")

            # Read receipts are only valid between accepted connections, which
            # mirrors the messaging gate.
            if not _are_connected(cursor, current_user_id, user_id):
                raise HTTPException(
                    status_code=403,
                    detail="You can only read messages from accepted connections.",
                )

            # Scoped to messages the caller actually received from this peer;
            # another user's messages can never be modified.
            cursor.execute(
                """
                UPDATE messages
                SET is_read = TRUE
                WHERE sender_id = %s
                AND receiver_id = %s
                AND is_read = FALSE
                """,
                (user_id, current_user_id),
            )
            updated = cursor.rowcount

            # Also mark any message notifications from this user as read
            cursor.execute(
                """
                UPDATE notifications
                SET is_read = TRUE
                WHERE user_id = %s
                AND notification_type = 'new_message'
                AND sender_id = %s
                AND is_read = FALSE
                """,
                (current_user_id, user_id),
            )

            connection.commit()

            return {
                "message": "Messages marked as read",
                "updated": updated,
            }

    finally:
        connection.close()


@router.get("/")
def get_conversations(
    current_user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            # Single aggregated query replacing previous 4N+1 query cascade
            cursor.execute(
                """
                WITH peers AS (
                    SELECT DISTINCT
                        CASE WHEN sender_id = %(uid)s THEN receiver_id ELSE sender_id END AS peer_id
                    FROM messages
                    WHERE sender_id = %(uid)s OR receiver_id = %(uid)s
                ),
                latest_messages AS (
                    SELECT DISTINCT ON (
                        CASE WHEN sender_id = %(uid)s THEN receiver_id ELSE sender_id END
                    )
                        m.id AS msg_id,
                        CASE WHEN m.sender_id = %(uid)s THEN m.receiver_id ELSE m.sender_id END AS peer_id,
                        m.content,
                        m.created_at,
                        (
                            SELECT a.media_type
                            FROM message_attachments a
                            WHERE a.message_id = m.id
                            ORDER BY a.id ASC
                            LIMIT 1
                        ) AS attachment_media_type
                    FROM messages m
                    WHERE m.sender_id = %(uid)s OR m.receiver_id = %(uid)s
                    ORDER BY
                        CASE WHEN m.sender_id = %(uid)s THEN m.receiver_id ELSE m.sender_id END,
                        m.created_at DESC,
                        m.id DESC
                ),
                unread_counts AS (
                    SELECT
                        sender_id AS peer_id,
                        COUNT(*) AS unread_count
                    FROM messages
                    WHERE receiver_id = %(uid)s AND is_read = FALSE
                    GROUP BY sender_id
                )
                SELECT
                    u.id AS user_id,
                    u.name,
                    u.avatar_url,
                    u.username,
                    lm.msg_id,
                    lm.content,
                    lm.created_at,
                    lm.attachment_media_type,
                    COALESCE(uc.unread_count, 0) AS unread_count,
                    COALESCE(cns.is_muted, FALSE) AS is_muted
                FROM peers p
                JOIN users u ON u.id = p.peer_id
                LEFT JOIN latest_messages lm ON lm.peer_id = p.peer_id
                LEFT JOIN unread_counts uc ON uc.peer_id = p.peer_id
                LEFT JOIN conversation_notification_settings cns
                    ON cns.user_id = %(uid)s AND cns.peer_id = p.peer_id
                ORDER BY lm.created_at DESC NULLS LAST;
                """,
                {"uid": current_user_id},
            )

            rows = cursor.fetchall()

            conversations = []
            for row in rows:
                user_id, name, avatar_url, username, msg_id, content, created_at, att_type, unread_count, is_muted = row

                last_msg_text = ""
                if content and content.strip():
                    last_msg_text = content.strip()
                elif att_type:
                    last_msg_text = "🎥 Video" if att_type == "video" else "📷 Photo"

                conversations.append(
                    {
                        "user_id": user_id,
                        "name": name or "Unknown",
                        "avatar_url": avatar_url,
                        "username": username,
                        "last_message": last_msg_text,
                        "last_message_at": created_at.isoformat() if created_at else None,
                        "unread_count": int(unread_count or 0),
                        "is_muted": bool(is_muted),
                    }
                )

            return {"conversations": conversations}

    finally:
        connection.close()


@router.get("/{user_id}/mute")
def get_mute_status(
    user_id: int,
    current_user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT is_muted FROM conversation_notification_settings WHERE user_id = %s AND peer_id = %s",
                (current_user_id, user_id),
            )
            row = cursor.fetchone()
            return {"is_muted": row[0] if row else False}
    finally:
        connection.close()


@router.put("/{user_id}/mute")
def toggle_mute(
    user_id: int,
    payload: Optional[MuteRequest] = None,
    current_user_id: int = Depends(get_current_user_id),
):
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot mute yourself")

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="User not found")

            cursor.execute(
                "SELECT is_muted FROM conversation_notification_settings WHERE user_id = %s AND peer_id = %s",
                (current_user_id, user_id),
            )
            row = cursor.fetchone()
            if payload and payload.is_muted is not None:
                new_state = payload.is_muted
            else:
                new_state = not (row[0] if row else False)

            cursor.execute(
                """
                INSERT INTO conversation_notification_settings (user_id, peer_id, is_muted, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (user_id, peer_id)
                DO UPDATE SET is_muted = EXCLUDED.is_muted, updated_at = NOW()
                """,
                (current_user_id, user_id, new_state),
            )
            connection.commit()
            return {
                "message": "Conversation muted" if new_state else "Conversation unmuted",
                "is_muted": new_state,
            }
    finally:
        connection.close()


@router.post("/{user_id}/block")
def block_user(
    user_id: int,
    current_user_id: int = Depends(get_current_user_id),
):
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, name FROM users WHERE id = %s", (user_id,))
            user_row = cursor.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")

            user_a, user_b = min(current_user_id, user_id), max(current_user_id, user_id)
            cursor.execute(
                """
                SELECT id FROM blocked_pairs
                WHERE (user_a_id = %s AND user_b_id = %s)
                """,
                (user_a, user_b),
            )
            if not cursor.fetchone():
                cursor.execute(
                    """
                    INSERT INTO blocked_pairs (user_a_id, user_b_id, created_by, created_at)
                    VALUES (%s, %s, %s, NOW())
                    """,
                    (user_a, user_b, current_user_id),
                )

            # Clean up any existing connection requests between these users
            cursor.execute(
                """
                DELETE FROM roommate_requests
                WHERE (sender_id = %s AND receiver_id = %s)
                   OR (sender_id = %s AND receiver_id = %s)
                """,
                (current_user_id, user_id, user_id, current_user_id),
            )

            connection.commit()
            return {"message": f"Blocked {user_row[1]}. You will no longer receive messages from this user."}
    finally:
        connection.close()


@router.post("/{user_id}/unblock")
@router.delete("/{user_id}/block")
def unblock_user(
    user_id: int,
    current_user_id: int = Depends(get_current_user_id),
):
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot unblock yourself")

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, name FROM users WHERE id = %s", (user_id,))
            user_row = cursor.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")

            user_a, user_b = min(current_user_id, user_id), max(current_user_id, user_id)
            cursor.execute(
                """
                SELECT id, created_by FROM blocked_pairs
                WHERE user_a_id = %s AND user_b_id = %s
                """,
                (user_a, user_b),
            )
            block_row = cursor.fetchone()
            if not block_row:
                raise HTTPException(status_code=404, detail="User is not blocked")

            block_id, created_by = block_row
            if created_by != current_user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You cannot unblock this user because they blocked you",
                )

            cursor.execute("DELETE FROM blocked_pairs WHERE id = %s", (block_id,))
            connection.commit()
            return {"message": f"Unblocked {user_row[1]}."}
    finally:
        connection.close()


@router.get("/blocked-users")
def get_blocked_users(
    current_user_id: int = Depends(get_current_user_id),
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
                (current_user_id, current_user_id),
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


@router.post("/{user_id}/report")
def report_user(
    user_id: int,
    report: ReportRequest,
    current_user_id: int = Depends(get_current_user_id),
):
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot report yourself")

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, name FROM users WHERE id = %s", (user_id,))
            user_row = cursor.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")

            create_notification(
                cursor=cursor,
                user_id=current_user_id,
                title="Report Submitted",
                message=f"Thank you for reporting {user_row[1]}. Our team has received your report: '{report.reason}'.",
                notification_type="general",
                dedup=False,
            )
            connection.commit()
            return {"message": "Report submitted successfully. Thank you for keeping our community safe."}
    finally:
        connection.close()


@router.delete("/conversation/{user_id}")
def clear_conversation(
    user_id: int,
    current_user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            # Delete physical media files associated with this conversation
            cursor.execute(
                """
                SELECT ma.storage_path
                FROM message_attachments ma
                JOIN messages m ON m.id = ma.message_id
                WHERE (m.sender_id = %s AND m.receiver_id = %s)
                   OR (m.sender_id = %s AND m.receiver_id = %s)
                """,
                (current_user_id, user_id, user_id, current_user_id),
            )
            for att_row in cursor.fetchall():
                if att_row[0]:
                    media_storage.delete(att_row[0])

            cursor.execute(
                """
                DELETE FROM messages
                WHERE (sender_id = %s AND receiver_id = %s)
                   OR (sender_id = %s AND receiver_id = %s)
                """,
                (current_user_id, user_id, user_id, current_user_id),
            )
            deleted = cursor.rowcount
            connection.commit()
            return {"message": "Conversation cleared", "deleted_count": deleted}
    finally:
        connection.close()