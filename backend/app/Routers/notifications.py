from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user_id
from app.database import get_connection

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


@router.get("/")
def get_notifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            # Get unread count
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM notifications
                WHERE user_id = %s AND is_read = FALSE
                """,
                (user_id,),
            )
            unread_count = cursor.fetchone()[0]

            # Build query
            base_query = """
                SELECT
                    id,
                    title,
                    message,
                    is_read,
                    created_at,
                    notification_type,
                    reference_id,
                    reference_type,
                    sender_id,
                    sender_name
                FROM notifications
                WHERE user_id = %s
            """
            params = [user_id]

            if unread_only:
                base_query += " AND is_read = FALSE"

            base_query += " ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

            cursor.execute(base_query, tuple(params))
            rows = cursor.fetchall()

            return {
                "notifications": [
                    {
                        "id": row[0],
                        "title": row[1],
                        "message": row[2],
                        "is_read": row[3],
                        "created_at": row[4].isoformat() if row[4] else None,
                        "notification_type": row[5] or "general",
                        "reference_id": row[6],
                        "reference_type": row[7],
                        "sender_id": row[8],
                        "sender_name": row[9],
                    }
                    for row in rows
                ],
                "unread_count": unread_count,
            }

    finally:
        connection.close()


@router.get("/unread-count")
def get_unread_count(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM notifications
                WHERE user_id = %s AND is_read = FALSE
                """,
                (user_id,),
            )
            count = cursor.fetchone()[0]
            return {"unread_count": count}

    finally:
        connection.close()


@router.put("/read-all")
def mark_all_read(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE notifications
                SET is_read = TRUE
                WHERE user_id = %s
                AND is_read = FALSE
                """,
                (user_id,),
            )
            updated_count = cursor.rowcount
            connection.commit()

            return {
                "message": "All notifications marked as read",
                "updated_count": updated_count,
            }

    finally:
        connection.close()


@router.put("/{notification_id}/read")
def mark_read(
    notification_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE notifications
                SET is_read = TRUE
                WHERE id = %s
                AND user_id = %s
                """,
                (notification_id, user_id),
            )

            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Notification not found",
                )

            connection.commit()

            return {
                "message": "Notification marked as read",
                "id": notification_id,
            }

    finally:
        connection.close()


@router.delete("/clear-all")
def clear_read_notifications(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM notifications
                WHERE user_id = %s
                AND is_read = TRUE
                """,
                (user_id,),
            )
            deleted_count = cursor.rowcount
            connection.commit()

            return {
                "message": "Read notifications cleared",
                "deleted_count": deleted_count,
            }

    finally:
        connection.close()


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM notifications
                WHERE id = %s
                AND user_id = %s
                """,
                (notification_id, user_id),
            )

            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Notification not found",
                )

            connection.commit()

            return {
                "message": "Notification deleted",
                "id": notification_id,
            }

    finally:
        connection.close()
