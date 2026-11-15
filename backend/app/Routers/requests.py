from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import get_connection
from app.notification_service import create_notification

router = APIRouter(
    prefix="/requests",
    tags=["Roommate Requests"],
)


@router.post("/{receiver_id}")
def send_request(
    receiver_id: int,
    sender_id: int = Depends(get_current_user_id),
):
    if sender_id == receiver_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot send a request to yourself",
        )

    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            # Check receiver exists
            cursor.execute(
                "SELECT id FROM users WHERE id = %s",
                (receiver_id,),
            )

            if not cursor.fetchone():
                raise HTTPException(
                    status_code=404,
                    detail="User not found",
                )

            # Check if either user has blocked the other
            user_a, user_b = min(sender_id, receiver_id), max(sender_id, receiver_id)
            cursor.execute(
                """
                SELECT id FROM blocked_pairs
                WHERE user_a_id = %s AND user_b_id = %s
                """,
                (user_a, user_b),
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=403,
                    detail="Cannot send request to this user",
                )

            # Check existing request (either direction, so mutual requests don't pile up)
            cursor.execute(
                """
                SELECT id, status, sender_id
                FROM roommate_requests
                WHERE (sender_id = %s AND receiver_id = %s)
                   OR (sender_id = %s AND receiver_id = %s)
                """,
                (sender_id, receiver_id, receiver_id, sender_id),
            )

            existing = cursor.fetchone()

            if existing:
                if existing[2] == receiver_id and existing[1] == "pending":
                    raise HTTPException(
                        status_code=400,
                        detail="This user already sent you a request — accept it from your inbox",
                    )
                if existing[1] == "rejected":
                    # A rejected request is a clean slate — remove it so either
                    # person can send a fresh one.
                    cursor.execute(
                        "DELETE FROM roommate_requests WHERE id = %s",
                        (existing[0],),
                    )
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"A request already exists with this user: {existing[1]}",
                    )

            # Create request
            cursor.execute(
                """
                INSERT INTO roommate_requests
                (sender_id, receiver_id, status)
                VALUES (%s, %s, 'pending')
                RETURNING id
                """,
                (sender_id, receiver_id),
            )



            request_id = cursor.fetchone()[0]
            # Fetch sender name and create notification for receiver
            cursor.execute("SELECT name FROM users WHERE id = %s", (sender_id,))
            sender_name_row = cursor.fetchone()
            sender_name = sender_name_row[0] if sender_name_row else "Someone"

            create_notification(
                cursor=cursor,
                user_id=receiver_id,
                title="New Roommate Request",
                message=f"{sender_name} sent you a connection request.",
                notification_type="roommate_request",
                reference_id=str(request_id),
                reference_type="request",
                sender_id=sender_id,
                sender_name=sender_name,
            )

            connection.commit()

            return {
                "message": "Roommate request sent",
                "request_id": request_id,
            }
            

    finally:
        connection.close()


@router.get("/received")
def get_received_requests(
    user_id: int = Depends(get_current_user_id),
):
    """Get all received roommate requests (others requesting you)"""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    r.id,
                    r.sender_id,
                    u.name,
                    r.status,
                    r.created_at,
                    u.avatar_url
                FROM roommate_requests r
                JOIN users u
                    ON u.id = r.sender_id
                WHERE r.receiver_id = %s
                ORDER BY r.id DESC
                """,
                (user_id,),
            )

            rows = cursor.fetchall()

            return {
                "requests": [
                    {
                        "request_id": row[0],
                        "sender_id": row[1],
                        "sender_name": row[2],
                        "status": row[3],
                        "created_at": row[4].isoformat() if row[4] else None,
                        "avatar_url": row[5],
                    }
                    for row in rows
                ]
            }

    finally:
        connection.close()


@router.get("/sent")
def get_sent_requests(
    user_id: int = Depends(get_current_user_id),
):
    """Get all sent roommate requests (your requests to others)"""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    r.id,
                    r.receiver_id,
                    u.name,
                    r.status
                FROM roommate_requests r
                JOIN users u
                    ON u.id = r.receiver_id
                WHERE r.sender_id = %s
                ORDER BY r.id DESC
                """,
                (user_id,),
            )

            rows = cursor.fetchall()

            return {
                "requests": [
                    {
                        "request_id": row[0],
                        "receiver_id": row[1],
                        "receiver_name": row[2],
                        "status": row[3],
                    }
                    for row in rows
                ]
            }

    finally:
        connection.close()


@router.get("/")
def get_requests(
    user_id: int = Depends(get_current_user_id),
):
    """Get both received and sent requests"""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            # Received requests
            cursor.execute(
                """
                SELECT
                    r.id,
                    r.sender_id,
                    u.name,
                    r.status,
                    r.created_at,
                    u.avatar_url,
                    'received' as type
                FROM roommate_requests r
                JOIN users u
                    ON u.id = r.sender_id
                WHERE r.receiver_id = %s
                ORDER BY r.id DESC
                """,
                (user_id,),
            )

            received = cursor.fetchall()

            # Sent requests
            cursor.execute(
                """
                SELECT
                    r.id,
                    r.receiver_id,
                    u.name,
                    r.status,
                    r.created_at,
                    u.avatar_url,
                    'sent' as type
                FROM roommate_requests r
                JOIN users u
                    ON u.id = r.receiver_id
                WHERE r.sender_id = %s
                ORDER BY r.id DESC
                """,
                (user_id,),
            )

            sent = cursor.fetchall()

            return {
                "received_requests": [
                    {
                        "request_id": row[0],
                        "user_id": row[1],
                        "user_name": row[2],
                        "status": row[3],
                        "created_at": row[4].isoformat() if row[4] else None,
                        "avatar_url": row[5],
                    }
                    for row in received
                ],
                "sent_requests": [
                    {
                        "request_id": row[0],
                        "user_id": row[1],
                        "user_name": row[2],
                        "status": row[3],
                        "created_at": row[4].isoformat() if row[4] else None,
                        "avatar_url": row[5],
                    }
                    for row in sent
                ],
                "pending_count": sum(
                    1 for row in received if row[3] == "pending"
                ),
            }

    finally:
        connection.close()


@router.put("/{request_id}/accept")
def accept_request(
    request_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT id, sender_id
                FROM roommate_requests
                WHERE id = %s
                """,
                (request_id,),
            )
            row = cursor.fetchone()

            if not row:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found or already processed",
                )

            request_sender_id = row[1]

            # Check if either user has blocked the other
            user_a, user_b = min(user_id, request_sender_id), max(user_id, request_sender_id)
            cursor.execute(
                """
                SELECT id FROM blocked_pairs
                WHERE user_a_id = %s AND user_b_id = %s
                """,
                (user_a, user_b),
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=403,
                    detail="Cannot accept request from a blocked user",
                )

            cursor.execute(
                """
                UPDATE roommate_requests
                SET status = 'accepted'
                WHERE id = %s
                AND receiver_id = %s
                AND status = 'pending'
                RETURNING id
                """,
                (request_id, user_id),
            )

            updated = cursor.fetchone()

            if not updated:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found or already processed",
                )

            cursor.execute(
                "SELECT name FROM users WHERE id = %s",
                (user_id,),
            )
            acceptor_name = cursor.fetchone()[0]

            create_notification(
                cursor=cursor,
                user_id=request_sender_id,
                title="Roommate Request Accepted",
                message=f"{acceptor_name} accepted your roommate request! You can now start chatting.",
                notification_type="request_accepted",
                reference_id=str(request_id),
                reference_type="request",
                sender_id=user_id,
                sender_name=acceptor_name,
            )

            connection.commit()

            return {
                "message": "Roommate request accepted",
                "request_id": request_id,
            }

    finally:
        connection.close()


@router.put("/{request_id}/reject")
def reject_request(
    request_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, sender_id FROM roommate_requests
                WHERE id = %s AND receiver_id = %s AND status = 'pending'
                """,
                (request_id, user_id),
            )
            req_row = cursor.fetchone()
            if not req_row:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found or already processed",
                )
            request_sender_id = req_row[1]

            cursor.execute(
                """
                UPDATE roommate_requests
                SET status = 'rejected'
                WHERE id = %s
                AND receiver_id = %s
                AND status = 'pending'
                RETURNING id
                """,
                (request_id, user_id),
            )

            updated = cursor.fetchone()

            if not updated:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found or already processed",
                )

            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            rejector_name = cursor.fetchone()[0]

            create_notification(
                cursor=cursor,
                user_id=request_sender_id,
                title="Roommate Request Declined",
                message=f"{rejector_name} declined your roommate request.",
                notification_type="request_rejected",
                reference_id=str(request_id),
                reference_type="request",
                sender_id=user_id,
                sender_name=rejector_name,
            )

            connection.commit()

            return {
                "message": "Roommate request rejected",
                "request_id": request_id,
            }
            
    finally:
        connection.close()


@router.delete("/{request_id}")
def cancel_request(
    request_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Cancel / withdraw a pending sent roommate request."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM roommate_requests
                WHERE id = %s AND sender_id = %s AND status = 'pending'
                RETURNING id
                """,
                (request_id, user_id),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found, already processed, or cannot be cancelled",
                )
            connection.commit()
            return {"message": "Roommate request withdrawn successfully", "request_id": request_id}
    finally:
        connection.close()