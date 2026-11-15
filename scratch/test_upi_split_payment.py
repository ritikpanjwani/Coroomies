import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlencode

backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from psycopg.rows import dict_row

from app.main import app
from app.database import get_connection
from app.security import hash_password
from app.auth import create_access_token
from app.schemas import AccountUpdate
from pydantic import ValidationError


class MiniAsgiClient:
    def __init__(self, app):
        self.app = app

    def request(self, method, path, headers=None, json=None, params=None):
        return asyncio.run(self._arequest(method, path, headers, json, params))

    def get(self, path, headers=None, params=None):
        return self.request("GET", path, headers=headers, params=params)

    def post(self, path, headers=None, json=None, params=None):
        return self.request("POST", path, headers=headers, json=json, params=params)

    def put(self, path, headers=None, json=None, params=None):
        return self.request("PUT", path, headers=headers, json=json, params=params)

    async def _arequest(self, method, path, headers=None, json_body=None, params=None):
        query_string = b""
        if params:
            query_string = urlencode(params).encode("latin1")

        headers_list = []
        if headers:
            for k, v in headers.items():
                headers_list.append((k.lower().encode("latin1"), str(v).encode("latin1")))

        body_bytes = b""
        if json_body is not None:
            body_bytes = json.dumps(json_body).encode("utf-8")
            headers_list.append((b"content-type", b"application/json"))
        headers_list.append((b"content-length", str(len(body_bytes)).encode("latin1")))

        scope = {
            "type": "http",
            "method": method.upper(),
            "path": path,
            "raw_path": path.encode("latin1"),
            "query_string": query_string,
            "headers": headers_list,
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
            "scheme": "http",
            "http_version": "1.1",
        }

        body_sent = False
        async def receive():
            nonlocal body_sent
            if not body_sent:
                body_sent = True
                return {"type": "http.request", "body": body_bytes, "more_body": False}
            return {"type": "http.request", "body": b"", "more_body": False}

        response_status = None
        response_headers = []
        response_body = []

        async def send(message):
            nonlocal response_status, response_headers
            if message["type"] == "http.response.start":
                response_status = message["status"]
                response_headers = message.get("headers", [])
            elif message["type"] == "http.response.body":
                response_body.append(message.get("body", b""))

        await self.app(scope, receive, send)

        full_body = b"".join(response_body)
        parsed_json = None
        try:
            parsed_json = json.loads(full_body.decode("utf-8"))
        except Exception:
            parsed_json = None

        class Response:
            status_code = response_status
            text = full_body.decode("utf-8", errors="replace")
            def json(self):
                if parsed_json is not None:
                    return parsed_json
                raise ValueError(f"Not JSON: {self.text}")

        return Response()


def test_schema_upi_validation():
    print("[1] Testing AccountUpdate UPI ID validation...")
    valid_upis = [
        "john.doe@okaxis",
        "rahul@okhdfcbank",
        "user_123@upi",
        "roommate-99@paytm",
        "priya.sharma@icici",
    ]
    for v in valid_upis:
        update = AccountUpdate(upi_id=v)
        assert update.upi_id == v.lower().strip(), f"Expected cleaned {v}, got {update.upi_id}"

    invalid_upis = [
        "not_an_email_or_vpa",
        "user@",
        "@bank",
        "user@b",
        "u@bank",
        "has space@upi",
        "special!char@bank",
    ]
    for inv in invalid_upis:
        try:
            AccountUpdate(upi_id=inv)
            assert False, f"Expected ValidationError for invalid UPI ID: {inv}"
        except ValidationError:
            pass

    assert AccountUpdate(upi_id="").upi_id is None
    assert AccountUpdate(upi_id=None).upi_id is None
    print("   [OK] UPI ID format validation passed!")


def setup_test_users_and_group():
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("DELETE FROM group_messages WHERE group_id IN (SELECT id FROM living_groups WHERE name = 'UPI Test Group')")
            cur.execute("DELETE FROM expense_shares WHERE expense_id IN (SELECT id FROM shared_expenses WHERE description LIKE 'UPI Test%')")
            cur.execute("DELETE FROM shared_expenses WHERE description LIKE 'UPI Test%'")
            cur.execute("DELETE FROM group_members WHERE group_id IN (SELECT id FROM living_groups WHERE name = 'UPI Test Group')")
            cur.execute("DELETE FROM living_groups WHERE name = 'UPI Test Group'")
            cur.execute("DELETE FROM users WHERE email IN ('upi_alice@test.com', 'upi_bob@test.com', 'upi_charlie@test.com')")
            conn.commit()

            pw_hash = hash_password("Password123!")

            cur.execute(
                """
                INSERT INTO users (name, email, password_hash, upi_id)
                VALUES ('Alice Payer', 'upi_alice@test.com', %s, 'alice@okaxis')
                RETURNING id
                """,
                (pw_hash,)
            )
            alice_id = cur.fetchone()["id"]

            cur.execute(
                """
                INSERT INTO users (name, email, password_hash, upi_id)
                VALUES ('Bob Roommate', 'upi_bob@test.com', %s, 'bob@okhdfcbank')
                RETURNING id
                """,
                (pw_hash,)
            )
            bob_id = cur.fetchone()["id"]

            cur.execute(
                """
                INSERT INTO users (name, email, password_hash)
                VALUES ('Charlie Outsider', 'upi_charlie@test.com', %s)
                RETURNING id
                """,
                (pw_hash,)
            )
            charlie_id = cur.fetchone()["id"]

            cur.execute(
                """
                INSERT INTO living_groups (name, description, invite_code, created_by, created_at)
                VALUES ('UPI Test Group', 'Test group for UPI split verification', 'UPITEST123', %s, %s)
                RETURNING id
                """,
                (alice_id, datetime.now(timezone.utc)),
            )
            group_id = cur.fetchone()["id"]

            now = datetime.now(timezone.utc)
            cur.execute(
                """
                INSERT INTO group_members (group_id, user_id, role, status, joined_at)
                VALUES (%s, %s, 'admin', 'active', %s)
                """,
                (group_id, alice_id, now)
            )

            cur.execute(
                """
                INSERT INTO group_members (group_id, user_id, role, status, joined_at)
                VALUES (%s, %s, 'member', 'active', %s)
                """,
                (group_id, bob_id, now)
            )
            conn.commit()

    alice_token = create_access_token(alice_id, 0)
    bob_token = create_access_token(bob_id, 0)
    charlie_token = create_access_token(charlie_id, 0)

    return {
        "alice": {"id": alice_id, "token": alice_token},
        "bob": {"id": bob_id, "token": bob_token},
        "charlie": {"id": charlie_id, "token": charlie_token},
        "group_id": group_id,
    }


def cleanup_test_data(data):
    group_id = data["group_id"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM group_messages WHERE group_id = %s", (group_id,))
            cur.execute("DELETE FROM expense_shares WHERE expense_id IN (SELECT id FROM shared_expenses WHERE group_id = %s)", (group_id,))
            cur.execute("DELETE FROM shared_expenses WHERE group_id = %s", (group_id,))
            cur.execute("DELETE FROM group_members WHERE group_id = %s", (group_id,))
            cur.execute("DELETE FROM living_groups WHERE id = %s", (group_id,))
            cur.execute("DELETE FROM users WHERE email IN ('upi_alice@test.com', 'upi_bob@test.com', 'upi_charlie@test.com')")
            conn.commit()


def main():
    test_schema_upi_validation()

    client = MiniAsgiClient(app)
    data = setup_test_users_and_group()
    try:
        alice = data["alice"]
        bob = data["bob"]
        charlie = data["charlie"]
        group_id = data["group_id"]

        alice_headers = {"Authorization": f"Bearer {alice['token']}"}
        bob_headers = {"Authorization": f"Bearer {bob['token']}"}
        charlie_headers = {"Authorization": f"Bearer {charlie['token']}"}

        # --- Test 1: Account UPI ID update and retrieval ---
        print("[2] Testing UPI ID update via PUT /settings/account and GET /settings/...")
        res = client.put(
            "/settings/account",
            json={"upi_id": "bob.roommate@icici"},
            headers=bob_headers,
        )
        assert res.status_code == 200, res.text
        assert res.json()["upi_id"] == "bob.roommate@icici"

        res = client.get("/settings/", headers=bob_headers)
        assert res.status_code == 200
        assert res.json()["upi_id"] == "bob.roommate@icici"

        res = client.put(
            "/settings/account",
            json={"upi_id": "invalid@@upi"},
            headers=bob_headers,
        )
        assert res.status_code == 422, f"Expected 422, got {res.status_code}"
        print("   [OK] User UPI settings updated & validated successfully!")

        # --- Test 2: Create shared expense and verify payer UPI ID ---
        print("[3] Testing Shared Expense creation and payer UPI ID exposure...")
        create_res = client.post(
            "/shared-expenses/",
            json={
                "group_id": group_id,
                "description": "UPI Test Groceries",
                "amount": 1000.0,
                "member_ids": [alice["id"], bob["id"]],
            },
            headers=alice_headers,
        )
        assert create_res.status_code == 200, create_res.text
        create_json = create_res.json()
        expense_id = create_json["expense_id"]

        get_res = client.get(f"/shared-expenses/{expense_id}", headers=alice_headers)
        assert get_res.status_code == 200, get_res.text
        expense_data = get_res.json()

        assert expense_data["payer_upi_id"] == "alice@okaxis", f"Expected alice@okaxis, got {expense_data.get('payer_upi_id')}"
        assert len(expense_data["shares"]) == 2

        bob_share = next(s for s in expense_data["shares"] if s["user_id"] == bob["id"])
        alice_share = next(s for s in expense_data["shares"] if s["user_id"] == alice["id"])

        assert alice_share["status"] == "paid"
        assert bob_share["status"] == "pending"
        assert float(bob_share["amount"]) == 500.0
        bob_share_id = bob_share["id"]
        print("   [OK] Expense created with payer_upi_id and pending split share!")

        # --- Test 3: Check GET /shared-expenses/balances includes to_upi_id ---
        print("[4] Testing GET /shared-expenses/balances includes to_upi_id...")
        bal_res = client.get("/shared-expenses/balances", params={"group_id": group_id}, headers=bob_headers)
        assert bal_res.status_code == 200, bal_res.text
        owes_list = bal_res.json()["owes"]
        bob_debt = next(o for o in owes_list if o["from_user_id"] == bob["id"] and o["to_user_id"] == alice["id"])
        assert bob_debt["to_upi_id"] == "alice@okaxis"
        assert float(bob_debt["amount"]) == 500.0
        print("   [OK] Balances summary includes recipient to_upi_id for payment!")

        # --- Test 4: Report Payment Authorization & State Change ---
        print("[5] Testing POST /report-payment...")
        rep_fail = client.post(
            f"/shared-expenses/{expense_id}/shares/{bob_share_id}/report-payment",
            json={"payment_reference": "UTR99998888"},
            headers=charlie_headers,
        )
        assert rep_fail.status_code == 403, f"Expected 403, got {rep_fail.status_code}"

        rep_alice = client.post(
            f"/shared-expenses/{expense_id}/shares/{bob_share_id}/report-payment",
            json={"payment_reference": "UTR99998888"},
            headers=alice_headers,
        )
        assert rep_alice.status_code == 403, "Alice should not be allowed to report Bob's payment"

        rep_bob = client.post(
            f"/shared-expenses/{expense_id}/shares/{bob_share_id}/report-payment",
            json={"payment_reference": "UPI-REF-123456"},
            headers=bob_headers,
        )
        assert rep_bob.status_code == 200, rep_bob.text
        assert rep_bob.json()["status"] == "payment_reported"
        assert rep_bob.json()["payment_reference"] == "UPI-REF-123456"

        exp_check = client.get(f"/shared-expenses/{expense_id}", headers=alice_headers).json()
        b_share = next(s for s in exp_check["shares"] if s["id"] == bob_share_id)
        assert b_share["status"] == "payment_reported"
        assert b_share["payment_reference"] == "UPI-REF-123456"
        assert b_share["payment_reported_at"] is not None
        assert b_share["payment_confirmed_at"] is None
        print("   [OK] Payment report strictly authorized and recorded state!")

        # --- Test 5: Rejection / Cancellation of reported payment ---
        print("[6] Testing POST /reject-payment (cancel / dispute)...")
        rej_res = client.post(
            f"/shared-expenses/{expense_id}/shares/{bob_share_id}/reject-payment",
            headers=bob_headers,
        )
        assert rej_res.status_code == 200
        assert rej_res.json()["status"] == "pending"
        assert rej_res.json()["payment_reference"] is None

        rep_bob2 = client.post(
            f"/shared-expenses/{expense_id}/shares/{bob_share_id}/report-payment",
            json={"payment_reference": "UPI-REF-FINAL"},
            headers=bob_headers,
        )
        assert rep_bob2.status_code == 200
        print("   [OK] Payment rejection / cancellation resets back to pending!")

        # --- Test 6: Payment Confirmation Security & Settlement ---
        print("[7] Testing POST /confirm-payment authorization and settlement...")
        bob_confirm_fail = client.post(
            f"/shared-expenses/{expense_id}/shares/{bob_share_id}/confirm-payment",
            headers=bob_headers,
        )
        assert bob_confirm_fail.status_code == 403, "CRITICAL: Payer must NOT be allowed to confirm their own payment!"

        charlie_confirm_fail = client.post(
            f"/shared-expenses/{expense_id}/shares/{bob_share_id}/confirm-payment",
            headers=charlie_headers,
        )
        assert charlie_confirm_fail.status_code == 403, "Non-recipient must not be allowed to confirm"

        confirm_res = client.post(
            f"/shared-expenses/{expense_id}/shares/{bob_share_id}/confirm-payment",
            headers=alice_headers,
        )
        assert confirm_res.status_code == 200, confirm_res.text
        assert confirm_res.json()["status"] == "paid"
        assert confirm_res.json()["expense_settled"] is True

        exp_final = client.get(f"/shared-expenses/{expense_id}", headers=alice_headers).json()
        assert exp_final["status"] == "settled"
        b_final_share = next(s for s in exp_final["shares"] if s["id"] == bob_share_id)
        assert b_final_share["status"] == "paid"
        assert b_final_share["payment_confirmed_at"] is not None
        print("   [OK] Recipient confirmation securely verified and settled expense!")

        print("\nALL UPI SPLIT PAYMENT BACKEND TESTS PASSED CLEANLY! (6/6)")

    finally:
        cleanup_test_data(data)


if __name__ == "__main__":
    main()
