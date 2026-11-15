import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlencode

backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from psycopg.rows import dict_row

from app.main import app
from app.database import get_connection
from app.security import hash_password
from app.auth import create_access_token


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


def run_tests():
    client = MiniAsgiClient(app)

    print("[1] Setting up clean test roommates in PostgreSQL...")
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # Clean up old test data
            cur.execute("DELETE FROM group_messages WHERE group_id IN (SELECT id FROM living_groups WHERE name = 'Powai Flatmates')")
            cur.execute("DELETE FROM group_members WHERE group_id IN (SELECT id FROM living_groups WHERE name = 'Powai Flatmates')")
            cur.execute("DELETE FROM living_groups WHERE name = 'Powai Flatmates'")
            cur.execute("DELETE FROM messages WHERE content LIKE 'Match Test%'")
            cur.execute("DELETE FROM roommate_requests WHERE sender_id IN (SELECT id FROM users WHERE email IN ('alpha_test@match.com', 'beta_test@match.com')) OR receiver_id IN (SELECT id FROM users WHERE email IN ('alpha_test@match.com', 'beta_test@match.com'))")
            cur.execute("DELETE FROM student_profiles WHERE user_id IN (SELECT id FROM users WHERE email IN ('alpha_test@match.com', 'beta_test@match.com'))")
            cur.execute("DELETE FROM users WHERE email IN ('alpha_test@match.com', 'beta_test@match.com')")
            conn.commit()

            pw_hash = hash_password("Password123!")

            # Create User Alpha
            cur.execute(
                """
                INSERT INTO users (name, email, password_hash)
                VALUES ('Alpha Sharma', 'alpha_test@match.com', %s)
                RETURNING id
                """,
                (pw_hash,)
            )
            alpha_id = cur.fetchone()["id"]

            # Create Profile for Alpha
            cur.execute(
                """
                INSERT INTO student_profiles (
                    user_id, sleep_schedule, cleanliness, noise_tolerance, study_habits,
                    smoking_preference, food_preferences, social_preferences, guest_preferences,
                    work_from_home, pets_preference, college, degree, stream, year
                )
                VALUES (%s, 'early_bird', 5, 2, 'quiet', 'no', 'vegetarian', 'moderate', 'rarely', 'hybrid', 'dog', 'IIT Bombay', 'B.Tech', 'Computer Science', 4)
                """,
                (alpha_id,)
            )

            # Create User Beta
            cur.execute(
                """
                INSERT INTO users (name, email, password_hash)
                VALUES ('Beta Patel', 'beta_test@match.com', %s)
                RETURNING id
                """,
                (pw_hash,)
            )
            beta_id = cur.fetchone()["id"]

            # Create Profile for Beta
            cur.execute(
                """
                INSERT INTO student_profiles (
                    user_id, sleep_schedule, cleanliness, noise_tolerance, study_habits,
                    smoking_preference, food_preferences, social_preferences, guest_preferences,
                    work_from_home, pets_preference, college, degree, stream, year
                )
                VALUES (%s, 'early_bird', 5, 2, 'quiet', 'no', 'vegetarian', 'moderate', 'rarely', 'hybrid', 'dog', 'IIT Bombay', 'B.Tech', 'Computer Science', 4)
                """,
                (beta_id,)
            )
            conn.commit()

    token_alpha = create_access_token(alpha_id)
    headers_alpha = {"Authorization": f"Bearer {token_alpha}"}

    token_beta = create_access_token(beta_id)
    headers_beta = {"Authorization": f"Bearer {token_beta}"}

    print("   [OK] Roommate test records created with academic & lifestyle attributes.")

    print("\n[2] Testing GET /matches/ transparent flatmate compatibility scoring...")
    res = client.get("/matches/", headers=headers_alpha)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    matches = data.get("matches", data if isinstance(data, list) else [])
    assert isinstance(matches, list)

    beta_match = next((m for m in matches if m["user_id"] == beta_id), None)
    assert beta_match is not None, "Beta Patel must be returned in Alpha's matches"
    
    score = beta_match.get("compatibility") or beta_match.get("compatibility_score")
    assert score is not None and score >= 80, f"Expected high compatibility score (>=80), got {score}"
    print(f"   [OK] Compatibility score computed accurately: {score}%")

    # Verify side-by-side transparent explanation
    reasons = beta_match.get("reasons", [])
    assert len(reasons) > 0, "Matches must provide transparent explanation reasons"
    first_reason = reasons[0]
    assert "field" in first_reason or "label" in first_reason, "Reason must have 'field' or 'label'"
    assert "my_value" in first_reason, "Reason must have 'my_value'"
    assert "other_value" in first_reason, "Reason must have 'other_value'"
    assert "match" in first_reason, "Reason must have 'match' boolean"
    print(f"   [OK] Transparent side-by-side preference explanation validated:")
    for r in reasons[:4]:
        name = r.get("label") or r.get("field")
        print(f"        - {name}: You ({r['my_value']}) vs Them ({r['other_value']}) -> match={r['match']}")

    # Verify academic & lifestyle fields exposed
    assert beta_match.get("college") == "IIT Bombay"
    assert beta_match.get("degree") == "B.Tech"
    assert beta_match.get("stream") == "Computer Science"
    assert beta_match.get("work_from_home") == "hybrid"
    print("   [OK] Academic context (college, degree, stream) and work style returned on match object.")

    print("\n[3] Testing Gale-Shapley Stable Roommate Pairing (/matches/stable)...")
    res_stable = client.get("/matches/stable", headers=headers_alpha)
    assert res_stable.status_code == 200, f"Expected 200, got {res_stable.status_code}: {res_stable.text}"
    print("   [OK] Gale-Shapley stable pairing executed and returned successfully.")

    print("\n[4] Testing Roommate Connection Requests (/requests/)...")
    # Alpha sends request to Beta
    res_send = client.post(f"/requests/{beta_id}", headers=headers_alpha)
    assert res_send.status_code == 200, f"Failed sending request: {res_send.text}"
    print("   [OK] Roommate request sent from Alpha to Beta.")

    # Beta views incoming request
    res_inbox = client.get("/requests/", headers=headers_beta)
    assert res_inbox.status_code == 200
    incoming = res_inbox.json().get("received_requests", [])
    req_from_alpha = next((r for r in incoming if r["user_id"] == alpha_id), None)
    assert req_from_alpha is not None, "Beta must see incoming request from Alpha"
    print(f"   [OK] Request received by Beta: status={req_from_alpha['status']}")

    # Beta accepts request
    req_id = req_from_alpha["request_id"]
    res_accept = client.put(f"/requests/{req_id}/accept", headers=headers_beta)
    assert res_accept.status_code == 200, f"Failed accepting request: {res_accept.text}"
    print("   [OK] Roommate request accepted by Beta. Connection established!")

    print("\n[5] Testing Private Chat Messaging between matched roommates (/messages/)...")
    res_msg = client.post("/messages/", headers=headers_alpha, json={
        "receiver_id": beta_id,
        "content": "Match Test: Hi Beta! Our 95% compatibility score looks great. Let's look for a 2BHK together!"
    })
    assert res_msg.status_code == 200, f"Failed sending message: {res_msg.text}"
    print("   [OK] Private message sent successfully.")

    res_convo = client.get(f"/messages/{alpha_id}", headers=headers_beta)
    assert res_convo.status_code == 200
    messages = res_convo.json().get("messages", [])
    assert any("Match Test" in m.get("content", "") for m in messages)
    print("   [OK] Private message delivered and retrieved by roommate.")

    print("\n[6] Testing Living Group Invite Code sharing workflow (/groups/)...")
    # Alpha creates a living group
    res_grp = client.post("/groups/", headers=headers_alpha, json={
        "name": "Powai Flatmates",
        "description": "Flatmates looking to rent together in Powai",
        "open_slots": 1
    })
    assert res_grp.status_code == 200, f"Failed creating group: {res_grp.text}"
    invite_code = res_grp.json().get("invite_code")
    assert invite_code is not None and len(invite_code) > 0
    print(f"   [OK] Living group created with invite code: {invite_code}")

    # Beta joins group with invite code
    res_join = client.post("/groups/join", headers=headers_beta, json={"invite_code": invite_code})
    assert res_join.status_code == 200, f"Failed joining group: {res_join.text}"
    print("   [OK] Beta joined Alpha's living group via invite code!")

    print("\nALL FLATMATE MATCHING & WORKFLOW TESTS PASSED CLEANLY! (6/6)")


if __name__ == "__main__":
    run_tests()
