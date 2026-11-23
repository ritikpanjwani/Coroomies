import logging
import os
import threading

from pathlib import Path
from dotenv import load_dotenv
from psycopg import Connection
from psycopg.pq import TransactionStatus
from psycopg_pool import ConnectionPool

from app.config import (
    DB_POOL_MAX_SIZE,
    DB_POOL_MIN_SIZE,
    DB_POOL_TIMEOUT_SECONDS,
)

_backend_env = Path(__file__).resolve().parent.parent / ".env"
if _backend_env.exists():
    load_dotenv(_backend_env)
load_dotenv()

logger = logging.getLogger("coroomies.database")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set in environment variables")

# Normalize SQLAlchemy URL schemes to standard PostgreSQL libpq connection strings for psycopg
_pool_conninfo = DATABASE_URL
if _pool_conninfo.startswith("postgresql+psycopg://"):
    _pool_conninfo = "postgresql://" + _pool_conninfo[len("postgresql+psycopg://"):]
elif _pool_conninfo.startswith("postgresql+psycopg2://"):
    _pool_conninfo = "postgresql://" + _pool_conninfo[len("postgresql+psycopg2://"):]


class PooledConnection(Connection):
    """Connection that cleans up read-only transactions before returning.

    Routers close pooled connections in ``finally`` blocks. Read-only
    transactions are still open at that point, which makes psycopg_pool log a
    warning for every request. Rolling back here keeps those harmless
    transactions from flooding the logs while preserving the pool's normal
    close_returns behavior.
    """

    def close(self) -> None:
        if not self.closed and getattr(self, "_pool", None) is not None:
            if self.pgconn.transaction_status in (
                TransactionStatus.INTRANS,
                TransactionStatus.INERROR,
            ):
                logger.debug("Rolling back uncommitted pooled connection")
                try:
                    self.rollback()
                except Exception as exc:
                    logger.warning(
                        "Failed to roll back pooled connection: %s",
                        type(exc).__name__,
                    )
        super().close()


_pool = ConnectionPool(
    _pool_conninfo,
    min_size=DB_POOL_MIN_SIZE,
    max_size=DB_POOL_MAX_SIZE,
    timeout=DB_POOL_TIMEOUT_SECONDS,
    open=False,
    close_returns=True,
    name="coroomies",
    connection_class=PooledConnection,
    kwargs={"application_name": "coroomies"},
)
_pool_lock = threading.Lock()


def _ensure_pool_open() -> None:
    global _pool
    if _pool is None:
        raise RuntimeError("Database pool is closed")
    if not _pool.closed:
        return

    with _pool_lock:
        if _pool is not None and _pool.closed:
            _pool.open(wait=False)


def get_connection():
    """Return a pooled connection.

    psycopg_pool is configured with close_returns=True, so the existing
    connection.close() calls in the routers return the connection to the pool
    instead of tearing down a new TCP session for every request.
    """
    _ensure_pool_open()
    return _pool.getconn()


def close_pool() -> None:
    global _pool
    with _pool_lock:
        if _pool is not None and not _pool.closed:
            _pool.close()
        _pool = None
