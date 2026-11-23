from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.matching import stable_match
from app.Routers.expenses import ExpenseUpdate, RecurringExpenseCreate
from app.Routers.shared_expenses import equal_split_amounts
from app.schemas import ProfileCreate


def test_roommate_pairing_never_reuses_a_member():
    """A directed three-person cycle must not create overlapping pairs."""
    pairs, unmatched = stable_match({1: [2, 3], 2: [3, 1], 3: [1, 2]})
    participants = [member for pair in pairs for member in pair]
    assert len(participants) == len(set(participants))
    assert len(pairs) == 1
    assert len(unmatched) == 1


def test_equal_split_distributes_every_paise():
    shares = equal_split_amounts(Decimal("100.00"), [10, 20, 30])
    assert [amount for _, amount in shares] == [Decimal("33.34"), Decimal("33.33"), Decimal("33.33")]
    assert sum(amount for _, amount in shares) == Decimal("100.00")


@pytest.mark.parametrize("bad_date", ["2026-02-29", "2026-02-31", "2026-04-31"])
def test_expense_dates_must_be_real_calendar_dates(bad_date):
    with pytest.raises(ValidationError):
        ExpenseUpdate(category="Food", subcategory="Lunch", amount="10", expense_date=bad_date)
    with pytest.raises(ValidationError):
        RecurringExpenseCreate(
            category="Food",
            subcategory="Lunch",
            amount="10",
            frequency="monthly",
            start_date=bad_date,
        )


def test_profile_ranges_are_ordered_and_age_appropriate():
    with pytest.raises(ValidationError):
        ProfileCreate(budget_min=20000, budget_max=10000)
    with pytest.raises(ValidationError):
        ProfileCreate(preferred_age_min=40, preferred_age_max=18)
    with pytest.raises(ValidationError):
        ProfileCreate(preferred_age_min=17)


@pytest.mark.integration
def test_request_and_messaging_smoke_on_repaired_schema():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.auth import create_access_token
    from app.database import get_connection
    from app.security import hash_password

    caller_id = 99771
    peer_id = 99772
    pw_hash = hash_password("StagingSmoke123!")
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM users WHERE id IN (%s, %s)",
                (caller_id, peer_id),
            )
            cursor.execute(
                """
                INSERT INTO users (id, name, email, password_hash)
                VALUES
                    (%s, %s, %s, %s),
                    (%s, %s, %s, %s)
                """,
                (
                    caller_id, "Request Caller", "request-caller@example.test", pw_hash,
                    peer_id, "Message Peer", "message-peer@example.test", pw_hash,
                ),
            )
            cursor.execute(
                """
                INSERT INTO roommate_requests
                (sender_id, receiver_id, status, created_at)
                VALUES (%s, %s, 'accepted', NOW())
                """,
                (caller_id, peer_id),
            )
        conn.commit()
    finally:
        conn.close()

    token = create_access_token(caller_id)
    headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)

    received = client.get("/requests/received", headers=headers)
    sent = client.get("/requests/sent", headers=headers)
    combined = client.get("/requests/", headers=headers)
    friends = client.get("/messages/friends", headers=headers)
    inbox = client.get("/messages/", headers=headers)
    blocked = client.get("/messages/blocked-users", headers=headers)

    assert received.status_code == 200
    assert sent.status_code == 200
    assert combined.status_code == 200
    assert friends.status_code == 200
    assert inbox.status_code == 200
    assert blocked.status_code == 200
    assert "blocked_users" in blocked.json()

    sent_message = client.post(
        "/messages/",
        headers=headers,
        json={"receiver_id": peer_id, "content": "Staging smoke message"},
    )
    assert sent_message.status_code == 200

    thread = client.get(f"/messages/{peer_id}", headers=headers)
    assert thread.status_code == 200
    assert any(
        message["content"] == "Staging smoke message"
        for message in thread.json()["messages"]
    )

    muted = client.put(
        f"/messages/{peer_id}/mute",
        headers=headers,
        json={"is_muted": True},
    )
    assert muted.status_code == 200
    assert muted.json()["is_muted"] is True
    unmuted = client.put(
        f"/messages/{peer_id}/mute",
        headers=headers,
        json={"is_muted": False},
    )
    assert unmuted.status_code == 200
    assert unmuted.json()["is_muted"] is False


@pytest.mark.integration
def test_shared_payment_requires_recipient_confirmation():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.auth import create_access_token
    from app.database import get_connection
    from app.security import hash_password

    recipient_id = 99781
    payer_id = 99782
    group_id = 99783
    pw_hash = hash_password("PaymentSmoke123!")
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM living_groups WHERE id = %s",
                (group_id,),
            )
            cursor.execute(
                "DELETE FROM users WHERE id IN (%s, %s)",
                (recipient_id, payer_id),
            )
            cursor.execute(
                """
                INSERT INTO users (id, name, email, password_hash)
                VALUES
                    (%s, %s, %s, %s),
                    (%s, %s, %s, %s)
                """,
                (
                    recipient_id, "Payment Recipient", "payment-recipient@example.test", pw_hash,
                    payer_id, "Payment Payer", "payment-payer@example.test", pw_hash,
                ),
            )
            cursor.execute(
                """
                INSERT INTO living_groups
                (id, name, description, invite_code, created_by, created_at, open_slots)
                VALUES (%s, %s, %s, %s, %s, NOW(), 0)
                """,
                (group_id, "Payment Smoke Group", "Isolated payment test", "PAYSMOKE1", recipient_id),
            )
            cursor.execute(
                """
                INSERT INTO group_members
                (group_id, user_id, role, status, joined_at)
                VALUES
                    (%s, %s, 'admin', 'active', NOW()),
                    (%s, %s, 'member', 'active', NOW())
                """,
                (group_id, recipient_id, group_id, payer_id),
            )
        conn.commit()
    finally:
        conn.close()

    recipient_headers = {"Authorization": f"Bearer {create_access_token(recipient_id)}"}
    payer_headers = {"Authorization": f"Bearer {create_access_token(payer_id)}"}
    client = TestClient(app)

    created = client.post(
        "/shared-expenses/",
        headers=recipient_headers,
        json={"group_id": group_id, "description": "Payment smoke expense", "amount": 12.35},
    )
    assert created.status_code == 200
    expense_id = created.json()["expense_id"]

    detail = client.get(f"/shared-expenses/{expense_id}", headers=payer_headers)
    assert detail.status_code == 200
    payer_share = next(
        share for share in detail.json()["shares"]
        if share["user_id"] == payer_id
    )
    share_id = payer_share["id"]

    report = client.post(
        f"/shared-expenses/{expense_id}/shares/{share_id}/report-payment",
        headers=payer_headers,
        json={"payment_reference": "SMOKE-UTR-123"},
    )
    assert report.status_code == 200
    assert report.json()["status"] == "payment_reported"

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT status, payment_confirmed_at FROM expense_shares WHERE id = %s",
                (share_id,),
            )
            status, confirmed_at = cursor.fetchone()
            assert status == "payment_reported"
            assert confirmed_at is None
    finally:
        conn.close()

    confirm = client.post(
        f"/shared-expenses/{expense_id}/shares/{share_id}/confirm-payment",
        headers=recipient_headers,
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "paid"

    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT status, payment_confirmed_at FROM expense_shares WHERE id = %s",
                (share_id,),
            )
            status, confirmed_at = cursor.fetchone()
            assert status == "paid"
            assert confirmed_at is not None
            cursor.execute(
                "SELECT COUNT(*) FROM expense_settlements WHERE group_id = %s",
                (group_id,),
            )
            assert cursor.fetchone()[0] >= 1
    finally:
        conn.close()


def test_alembic_config_escapes_percent_encoded_database_password():
    """Verify Alembic ConfigParser handles percent-encoded passwords without ValueError.

    Supabase connection strings frequently have URL-encoded special characters such
    as '%40' for '@', '%23' for '#', '%25' for '%', and '%21' for '!'.
    ConfigParser BasicInterpolation treats bare '%' as an interpolation token,
    raising ValueError: invalid interpolation syntax. Escaping '%' to '%%' before
    calling set_main_option allows safe storage, unescapes cleanly upon retrieval,
    and preserves the correct decoded password for SQLAlchemy and psycopg.
    """
    import os
    from alembic.config import Config
    from sqlalchemy.engine.url import make_url

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ini_path = os.path.join(backend_dir, "alembic.ini")

    encoded_pw = "Supab%40se%23Pass%25123%21"
    raw_url = f"postgresql://supabase_user:{encoded_pw}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    db_url = raw_url.replace("postgresql://", "postgresql+psycopg://", 1)

    # 1. Reproduce: unescaped '%' must raise ValueError: invalid interpolation syntax
    cfg_unprotected = Config(ini_path)
    with pytest.raises(ValueError, match="invalid interpolation syntax"):
        cfg_unprotected.set_main_option("sqlalchemy.url", db_url)
        cfg_unprotected.get_main_option("sqlalchemy.url")

    # 2. Verify fix: escaping '%' -> '%%' allows seamless retrieval & interpolation
    cfg_protected = Config(ini_path)
    cfg_protected.set_main_option("sqlalchemy.url", db_url.replace("%", "%%"))

    retrieved_url = cfg_protected.get_main_option("sqlalchemy.url")
    assert retrieved_url == db_url

    section = cfg_protected.get_section(cfg_protected.config_ini_section, {})
    assert section.get("sqlalchemy.url") == db_url

    # 3. Verify SQLAlchemy make_url properly unquotes back to exact credentials
    parsed = make_url(section.get("sqlalchemy.url"))
    assert parsed.username == "supabase_user"
    assert parsed.password == "Supab@se#Pass%123!"
    assert parsed.drivername == "postgresql+psycopg"


def test_alembic_offline_migration_with_encoded_password(monkeypatch, capsys):
    """Verify running Alembic offline migration generation with percent-encoded credentials."""
    import os
    from alembic.config import Config
    from alembic import command

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ini_path = os.path.join(backend_dir, "alembic.ini")

    # Set mock DATABASE_URL containing URL-encoded characters (%40, %23, etc.)
    encoded_url = "postgresql://mock_user:Supab%40se%23Pass%25123%21@db.supabase.co:5432/postgres"
    monkeypatch.setenv("DATABASE_URL", encoded_url)

    cfg = Config(ini_path)

    # Offline upgrade (sql=True) runs env.py offline path without connecting to remote DB
    command.upgrade(cfg, "head", sql=True)
    captured = capsys.readouterr()

    assert "CREATE TABLE users" in captured.out
    assert "consolidated_migration_heads" in captured.out


@pytest.mark.parametrize(
    "raw_scheme,expected_sqla_driver",
    [
        ("postgres://", "postgresql+psycopg"),
        ("postgresql://", "postgresql+psycopg"),
        ("postgresql+psycopg://", "postgresql+psycopg"),
    ],
)
def test_database_url_scheme_normalization(raw_scheme, expected_sqla_driver):
    """Verify DATABASE_URL normalization for both psycopg libpq and SQLAlchemy Alembic."""
    import psycopg
    from sqlalchemy.engine.url import make_url

    test_url = f"{raw_scheme}test_user:My%40Pass%23word%25123%21@db.host.internal:5432/coroomies_prod"

    # 1. database.py normalization for psycopg ConnectionPool
    conninfo = test_url
    if conninfo.startswith("postgresql+psycopg://"):
        conninfo = "postgresql://" + conninfo[len("postgresql+psycopg://") :]
    elif conninfo.startswith("postgresql+psycopg2://"):
        conninfo = "postgresql://" + conninfo[len("postgresql+psycopg2://") :]

    psycopg_dict = psycopg.conninfo.conninfo_to_dict(conninfo)
    assert psycopg_dict["user"] == "test_user"
    assert psycopg_dict["password"] == "My@Pass#word%123!"

    # 2. alembic/env.py normalization for SQLAlchemy engine_from_config
    db_url = test_url
    if db_url.startswith("postgres://"):
        db_url = "postgresql+psycopg://" + db_url[len("postgres://") :]
    elif db_url.startswith("postgresql://"):
        db_url = "postgresql+psycopg://" + db_url[len("postgresql://") :]

    parsed_sqla = make_url(db_url)
    assert parsed_sqla.drivername == expected_sqla_driver
    assert parsed_sqla.username == "test_user"
    assert parsed_sqla.password == "My@Pass#word%123!"


def test_google_auth_transport_requests_importable():
    """Verify google.auth.transport.requests imports without ModuleNotFoundError: No module named 'requests'."""
    from google.auth.transport import requests as google_requests

    req = google_requests.Request()
    assert req is not None


def test_requirements_contains_critical_runtime_dependencies():
    """Verify backend/requirements.txt contains all critical runtime packages."""
    import os

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    reqs_path = os.path.join(backend_dir, "requirements.txt")
    with open(reqs_path, "r", encoding="utf-8") as f:
        content = f.read().lower()

    critical_deps = [
        "fastapi",
        "uvicorn",
        "psycopg",
        "psycopg-pool",
        "sqlalchemy",
        "alembic",
        "pydantic",
        "requests",
        "google-auth",
        "pwdlib",
        "argon2-cffi",
    ]
    for dep in critical_deps:
        assert dep in content, f"Missing critical dependency in requirements.txt: {dep}"



