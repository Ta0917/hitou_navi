import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.admin_security import register_admin_routes


# Import actual handlers without main's model download or schema creation.
with patch.dict(os.environ, DATABASE_URL="sqlite:///:memory:"):
    from app.admin_routes import register_handlers, get_db


class AdminSecurityTests(unittest.TestCase):
    def client(self, enabled="false", token="a" * 48):
        app = FastAPI()
        def reject_db_access():
            raise AssertionError("unauthenticated request reached DB")
        app.dependency_overrides[get_db] = reject_db_access
        with patch.dict(os.environ, ENABLE_ADMIN_API=enabled, ADMIN_API_TOKEN=token):
            register_admin_routes(app, register_handlers)
        return TestClient(app)

    def test_disabled_routes_are_absent_even_with_token(self):
        client = self.client()
        for method, path in self.endpoints():
            self.assertEqual(client.request(method, path, json={}).status_code, 404)
        self.assertFalse(any(p.startswith("/admin") for p in client.get("/openapi.json").json()["paths"]))

    def endpoints(self):
        return [("GET", "/admin/tables"), ("GET", "/admin/tables/onsens/columns"),
                ("GET", "/admin/tables/onsens"), ("POST", "/admin/tables/onsens"),
                ("DELETE", "/admin/tables/onsens/1")]

    def test_every_handler_rejects_missing_wrong_and_non_bearer_credentials(self):
        client = self.client("true")
        for authorization in (None, "Bearer wrong", "Basic abc", "Bearer"):
            for method, path in self.endpoints():
                with self.subTest(method=method, path=path, authorization=authorization):
                    headers = {"Authorization": authorization} if authorization else {}
                    response = client.request(method, path, headers=headers, json={})
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.headers["www-authenticate"], "Bearer")

    def test_correct_token_can_list_tables(self):
        response = self.client("true").get("/admin/tables", headers={"Authorization": "Bearer " + "a" * 48})
        self.assertEqual(response.status_code, 200)
        self.assertIn("onsens", response.json())

    def test_enabled_requires_valid_token(self):
        for token in ("", "short", "a" * 31, "あ" * 32, "a" * 32 + " "):
            with self.subTest(token_length=len(token)), self.assertRaises(RuntimeError):
                self.client("true", token)


if __name__ == "__main__":
    unittest.main()
