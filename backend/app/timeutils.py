import os
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_configured_timezone = os.getenv("APP_TIMEZONE", "").strip()
if _configured_timezone:
    try:
        LOCAL_TIMEZONE = ZoneInfo(_configured_timezone)
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError(f"Unknown APP_TIMEZONE: {_configured_timezone}") from exc
else:
    # Preserve the previous server-local behavior unless a deployment pins a
    # timezone explicitly. User-facing date-only fields use this single source.
    LOCAL_TIMEZONE = datetime.now().astimezone().tzinfo


def local_now() -> datetime:
    return datetime.now(LOCAL_TIMEZONE)


def local_today():
    return local_now().date()
