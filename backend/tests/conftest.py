"""Pytest safety rails for CoRoomies.

Database-writing tests are opt-in.  A developer must explicitly provide
TEST_DATABASE_URL, and it must point at a database whose name includes
``test``.  This prevents pytest from silently using backend/.env's operational
DATABASE_URL.
"""

import os
from urllib.parse import urlparse

import pytest


def _is_test_database(url: str) -> bool:
    try:
        database_name = urlparse(url).path.rsplit("/", 1)[-1].lower()
    except Exception:
        return False
    return "test" in database_name


TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "").strip()
HAS_SAFE_TEST_DATABASE = bool(TEST_DATABASE_URL) and _is_test_database(TEST_DATABASE_URL)

# This runs before test modules import FastAPI/database configuration. dotenv
# does not override an already-set environment variable, so the application
# pool will use the explicitly supplied isolated target.
if HAS_SAFE_TEST_DATABASE:
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL


def pytest_collection_modifyitems(config, items):
    if HAS_SAFE_TEST_DATABASE:
        return
    skip_integration = pytest.mark.skip(
        reason=(
            "integration test skipped: set TEST_DATABASE_URL to an isolated "
            "database whose name includes 'test'"
        )
    )
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_integration)
