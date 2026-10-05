import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from urllib.parse import urlencode

from newsletter import Newsletter
from server import BlogHandler


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.newsletter = Newsletter(self.temp.name, preview=True)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), BlogHandler)
        self.server.newsletter = self.newsletter
        self.server.wakeup = threading.Event()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        connection.request(method, path, body, headers or {})
        response = connection.getresponse()
        result = response.status, response.read().decode()
        connection.close()
        return result

    def test_signup_requires_consent_and_rejects_foreign_origin(self):
        body = json.dumps({"email": "reader@example.com", "consent": True})
        status, _ = self.request("POST", "/api/subscribe", body, {"Content-Type": "application/json", "Origin": "https://another-site.example"})
        self.assertEqual(status, 403)
        status, _ = self.request("POST", "/api/subscribe", json.dumps({"email": "reader@example.com"}), {"Content-Type": "application/json"})
        self.assertEqual(status, 400)
        status, response = self.request("POST", "/api/subscribe", body, {"Content-Type": "application/json", "Origin": f"http://localhost:{self.server.server_port}"})
        self.assertEqual(status, 200)
        self.assertIn("Preview mode", response)

    def test_email_links_do_not_change_state_until_form_is_submitted(self):
        self.newsletter.subscribe("reader@example.com", "127.0.0.1")
        with self.newsletter.connect() as db:
            token = db.execute("SELECT token FROM subscribers").fetchone()[0]
        status, _ = self.request("GET", f"/newsletter/confirm?token={token}")
        self.assertEqual(status, 200)
        self.assertIsNone(self.newsletter.subscriber(token)["confirmed"])
        status, page = self.request("POST", "/newsletter/confirm", urlencode({"token": token}), {"Content-Type": "application/x-www-form-urlencoded", "Origin": "null"})
        self.assertEqual(status, 200)
        self.assertIn("You’re on the list", page)
        self.request("GET", f"/newsletter/unsubscribe?token={token}")
        self.assertIsNotNone(self.newsletter.subscriber(token))
        status, _ = self.request("POST", f"/newsletter/unsubscribe?token={token}", "List-Unsubscribe=One-Click", {"Content-Type": "application/x-www-form-urlencoded"})
        self.assertEqual(status, 200)
        self.assertIsNone(self.newsletter.subscriber(token))

    def test_server_never_serves_private_files(self):
        for path in ["/.git/config", "/.env", "/.newsletter/newsletter.sqlite3", "/.newsletter-preview/outbox/test.eml", "/server.py", "/images/../newsletter.py", "/images/%2e%2e/server.py"]:
            self.assertEqual(self.request("GET", path)[0], 404, path)
        self.assertEqual(self.request("GET", "/styles.css?v=2")[0], 200)


if __name__ == "__main__":
    unittest.main()
