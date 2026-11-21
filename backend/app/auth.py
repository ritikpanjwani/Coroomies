import jwt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_SECRET_KEY
from app.database import get_connection

SECRET_KEY = JWT_SECRET_KEY
ALGORITHM = "HS256"


def create_access_token(user_id: int, token_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": str(user_id),
        "ver": int(token_version),
        "iat": now,
        "exp": expire,
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

security = HTTPBearer()


def _verify_token_and_get_user_id(token_str: str) -> int:
    try:
        payload = jwt.decode(
            token_str,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        user_id = int(payload["sub"])
        token_version = int(payload.get("ver", 0))

        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id, token_version FROM users WHERE id = %s",
                    (user_id,),
                )
                row = cursor.fetchone()
                if not row:
                    raise HTTPException(
                        status_code=401,
                        detail="User no longer exists",
                    )
                if int(row[1] or 0) != token_version:
                    raise HTTPException(
                        status_code=401,
                        detail="Session has been invalidated. Please log in again.",
                    )
        finally:
            connection.close()

        return user_id

    except HTTPException:
        raise
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    return _verify_token_and_get_user_id(credentials.credentials)
