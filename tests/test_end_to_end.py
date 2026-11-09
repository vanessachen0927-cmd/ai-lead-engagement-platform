import os
import unittest
import urllib.error
import urllib.request
import urllib.parse
import json
import http.cookiejar
from datetime import datetime, timedelta, timezone

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8080")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cookies = http.cookiejar.CookieJar()
        cls.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cls.cookies))

    @classmethod
    def request(cls, path, method="GET", payload=None, authenticated=True):
        headers = {}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
        opener = cls.opener if authenticated else urllib.request.build_opener()
        try:
            with opener.open(req, timeout=15) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode()

    def test_01_health_is_public(self):
        status, body = self.request("/health", authenticated=False)
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")

    def test_02_api_requires_login(self):
        status, _ = self.request("/api/leads", authenticated=False)
        self.assertEqual(status, 401)

    def test_03_invalid_password_is_rejected(self):
        status, _ = self.request("/auth/login", "POST", {"password": "incorrect"})
        self.assertEqual(status, 401)

    def test_04_login_and_workflows(self):
        self.assertTrue(PASSWORD)
        status, _ = self.request("/auth/login", "POST", {"password": PASSWORD})
        self.assertEqual(status, 200)
        status, identity = self.request("/auth/me")
        self.assertEqual(status, 200)
        self.assertTrue(identity["authenticated"])
        status, lead = self.request("/api/leads", "POST", {
            "name": "Phase Four Test", "email": "phase4@example.com", "source": "website", "message": "Please arrange a demo"
        })
        self.assertEqual(status, 201)
        lead_id = lead["id"]
        status, leads = self.request("/api/leads")
        self.assertEqual(status, 200)
        self.assertTrue(any(item["id"] == lead_id for item in leads))
        status, updated = self.request(f"/api/leads/{lead_id}/status", "PATCH", {"status": "contacted"})
        self.assertEqual(status, 200)
        self.assertEqual(updated["status"], "contacted")
        status, _ = self.request(f"/api/leads/{lead_id}/messages", "POST", {"direction": "inbound", "body": "Is there a demo?"})
        self.assertEqual(status, 201)
        status, messages = self.request(f"/api/leads/{lead_id}/messages")
        self.assertEqual(status, 200)
        self.assertEqual(len(messages), 1)
        status, suggestion = self.request(f"/api/leads/{lead_id}/suggest", "POST")
        self.assertEqual(status, 200)
        self.assertTrue(suggestion["suggestion"])
        status, _ = self.request(f"/api/leads/{lead_id}/automation/preview", "POST", {"delayHours": 24})
        self.assertEqual(status, 200)
        scheduled = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        status, _ = self.request(f"/api/leads/{lead_id}/followups", "POST", {"scheduledAt": scheduled, "body": "A test follow-up"})
        self.assertEqual(status, 201)
        status, followups = self.request(f"/api/leads/{lead_id}/followups")
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(followups), 1)
        status, _ = self.request("/auth/logout", "POST")
        self.assertEqual(status, 200)
        status, _ = self.request("/api/leads")
        self.assertEqual(status, 401)

if __name__ == "__main__":
    unittest.main()
