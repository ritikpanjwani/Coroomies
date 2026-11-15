import logging
import traceback


def _database_details(exc: Exception) -> dict:
    """Return non-sensitive database error metadata for diagnostics."""
    details = {}
    sqlstate = getattr(exc, "sqlstate", None)
    if sqlstate:
        details["sqlstate"] = sqlstate

    diag = getattr(exc, "diag", None)
    if diag is not None:
        for name in ("constraint_name", "table_name", "column_name"):
            value = getattr(diag, name, None)
            if value:
                details[name] = value

    return details


def safe_exception_fields(exc: Exception) -> dict:
    fields = {"error_type": type(exc).__name__}
    fields.update(_database_details(exc))
    return fields


def log_exception(logger: logging.Logger, message: str, exc: Exception) -> None:
    """Log useful diagnostics without exception text, SQL values, or secrets.

    Exception messages from database drivers can include row values (emails,
    password hashes, OTPs) or user input. Only the exception type, SQLSTATE and
    constraint/table names are logged. Source locations are logged at DEBUG.
    """
    logger.error("%s %s", message, safe_exception_fields(exc))

    frames = traceback.format_tb(exc.__traceback__)
    if frames:
        logger.debug("%s traceback:\n%s", type(exc).__name__, "".join(frames))
