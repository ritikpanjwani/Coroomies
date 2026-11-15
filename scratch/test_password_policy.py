import os
import sys

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from pydantic import ValidationError
from app.schemas import UserCreate, ResetPasswordRequest, PasswordChange, validate_strong_password


def test_password_policy_direct():
    print("Testing validate_strong_password directly...")

    # Valid passwords
    valid_passwords = [
        "Pass1234!",
        "Secure@2026",
        "A#b1c2d3",
        "LongStrongPassw0rd#WithManyCharacters!",
    ]
    for p in valid_passwords:
        assert validate_strong_password(p) == p, f"Failed for valid password: {p}"
    print(" [OK] Valid passwords accepted")

    # Invalid passwords and expected error messages
    invalid_cases = [
        ("Short1!", "Password must be at least 8 characters long"),
        ("a" * 129 + "A1!", "Password must be 128 characters or fewer"),
        ("nouppercase123!", "Password must contain at least one uppercase letter"),
        ("NOLOWERCASE123!", "Password must contain at least one lowercase letter"),
        ("NoNumbersHere!", "Password must contain at least one number"),
        ("NoSpecialChar123", "Password must contain at least one special character"),
    ]
    for p, expected_err in invalid_cases:
        try:
            validate_strong_password(p)
            assert False, f"Expected validation failure for: {p}"
        except ValueError as e:
            assert expected_err in str(e), f"Expected '{expected_err}' in '{str(e)}'"
    print(" [OK] Invalid passwords correctly rejected with descriptive errors")


def test_user_create_schema():
    print("Testing UserCreate schema validation...")
    # Valid
    u = UserCreate(
        name="Test User",
        email="testuser@example.com",
        username="testuser",
        password="MyStrongPassword123!",
    )
    assert u.password == "MyStrongPassword123!"

    # Invalid (missing special character)
    try:
        UserCreate(
            name="Test User",
            email="testuser@example.com",
            username="testuser",
            password="WeakPassword123",
        )
        assert False, "UserCreate should have failed"
    except ValidationError as e:
        assert "special character" in str(e)
    print(" [OK] UserCreate schema validation verified")


def test_reset_password_schema():
    print("Testing ResetPasswordRequest schema validation...")
    r = ResetPasswordRequest(
        identifier="testuser@example.com",
        otp="123456",
        new_password="NewStrongPassword123!",
    )
    assert r.new_password == "NewStrongPassword123!"

    try:
        ResetPasswordRequest(
            identifier="testuser@example.com",
            otp="123456",
            new_password="password123",
        )
        assert False, "ResetPasswordRequest should have failed"
    except ValidationError as e:
        assert "uppercase" in str(e) or "special character" in str(e)
    print(" [OK] ResetPasswordRequest schema validation verified")


def test_password_change_schema():
    print("Testing PasswordChange schema validation...")
    pc = PasswordChange(
        current_password="OldPassword123!",
        new_password="BrandNewPassword456@",
    )
    assert pc.new_password == "BrandNewPassword456@"

    try:
        PasswordChange(
            current_password="OldPassword123!",
            new_password="alllowercase123!",
        )
        assert False, "PasswordChange should have failed"
    except ValidationError as e:
        assert "uppercase" in str(e)
    print(" [OK] PasswordChange schema validation verified")


import asyncio
import json
from urllib.parse import urlencode


class MiniAsgiClient:
    def __init__(self, app):
        self.app = app

    def post(self, path, headers=None, json=None, params=None):
        return asyncio.run(self._arequest("POST", path, headers=headers, json_body=json, params=params))

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
                return parsed_json

        return Response()


def test_api_routes():
    print("Testing FastAPI route rejection for weak passwords...")
    from app.main import app

    client = MiniAsgiClient(app)

    # Test registration with weak password
    res = client.post(
        "/auth/register",
        json={
            "name": "Weak User",
            "email": "weak@example.com",
            "username": "weakuser",
            "password": "simplepassword",
        },
    )
    assert res.status_code == 422, f"Expected 422, got {res.status_code}: {res.text}"
    detail = str(res.json()["detail"])
    assert "uppercase" in detail or "number" in detail or "special character" in detail
    print(" [OK] /auth/register rejects weak password with 422")

    # Test reset password with weak password
    res = client.post(
        "/auth/reset-password",
        json={
            "identifier": "someone@example.com",
            "otp": "123456",
            "new_password": "weak",
        },
    )
    assert res.status_code == 422, f"Expected 422, got {res.status_code}: {res.text}"
    print(" [OK] /auth/reset-password rejects weak password with 422")


if __name__ == "__main__":
    test_password_policy_direct()
    test_user_create_schema()
    test_reset_password_schema()
    test_password_change_schema()
    test_api_routes()
    print("\nALL PASSWORD POLICY TESTS PASSED!")
