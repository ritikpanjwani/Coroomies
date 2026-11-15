"""
Centralized Notification Service for CoRoomies
Provides helper functions for creating, updating, and deduplicating notifications.
"""
from typing import Optional


def create_notification(
    cursor,
    user_id: int,
    title: str,
    message: str,
    notification_type: str = "general",
    reference_id: Optional[str] = None,
    reference_type: Optional[str] = None,
    sender_id: Optional[int] = None,
    sender_name: Optional[str] = None,
    dedup: bool = True,
) -> int:
    """
    Creates a notification or updates an existing unread one to avoid duplicate spam.
    Returns the notification id.
    """
    if dedup:
        # Check if an unread notification matching the criteria already exists
        if notification_type == "new_message" and sender_id is not None:
            # For 1-on-1 chat, keep at most 1 unread notification per sender
            cursor.execute(
                """
                SELECT id FROM notifications
                WHERE user_id = %s
                AND notification_type = 'new_message'
                AND sender_id = %s
                AND is_read = FALSE
                ORDER BY id DESC LIMIT 1
                """,
                (user_id, sender_id),
            )
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    """
                    UPDATE notifications
                    SET title = %s,
                        message = %s,
                        created_at = NOW(),
                        reference_id = %s,
                        reference_type = %s,
                        sender_name = %s
                    WHERE id = %s
                    RETURNING id
                    """,
                    (title, message, reference_id, reference_type, sender_name, existing[0]),
                )
                return cursor.fetchone()[0]

        elif reference_id is not None:
            # For specific items (e.g. roommate_request with request_id, expense with group_id)
            cursor.execute(
                """
                SELECT id FROM notifications
                WHERE user_id = %s
                AND notification_type = %s
                AND reference_id = %s
                AND is_read = FALSE
                ORDER BY id DESC LIMIT 1
                """,
                (user_id, notification_type, str(reference_id)),
            )
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    """
                    UPDATE notifications
                    SET title = %s,
                        message = %s,
                        created_at = NOW(),
                        sender_id = %s,
                        sender_name = %s
                    WHERE id = %s
                    RETURNING id
                    """,
                    (title, message, sender_id, sender_name, existing[0]),
                )
                return cursor.fetchone()[0]

    # Insert fresh notification
    cursor.execute(
        """
        INSERT INTO notifications (
            user_id,
            title,
            message,
            is_read,
            created_at,
            notification_type,
            reference_id,
            reference_type,
            sender_id,
            sender_name
        )
        VALUES (%s, %s, %s, FALSE, NOW(), %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            user_id,
            title,
            message,
            notification_type,
            str(reference_id) if reference_id is not None else None,
            reference_type,
            sender_id,
            sender_name,
        ),
    )
    return cursor.fetchone()[0]
