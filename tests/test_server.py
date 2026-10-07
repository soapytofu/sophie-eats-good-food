import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from urllib.parse import urlencode
from unittest.mock import patch

from newsletter import Newsletter
from server import BlogHandler, parse_trusted_proxies, signup_client_ip


class ProxyTests(unittest.TestCase):
    def test_forwarded_headers_are_ignored_without_explicit_trust(self):
        trusted = parse_trusted_proxies("127.0.0.1, ::1")
        self.assertEqual(signup_client_ip("198.51.100.20", "203.0.113.10", trusted), "198.51.100.20")
        self.assertEqual(signup_client_ip("127.0.0.1", "203.0.113.10"), "127.0.0.1")

    def test_trusted_chain_ignores_spoofed_leftmost_address(self):
        trusted = parse_trusted_proxies("127.0.0.1, 192.0.2.5")
        self.assertEqual(signup_client_ip("127.0.0.1", "198.51.100.99, 203.0.113.10, 192.0.2.5", trusted), "203.0.113.10")

    def test_invalid_headers_fall_back_to_peer_and_ipv6_is_supported(self):
        trusted = parse_trusted_proxies("127.0.0.1, ::1")
        for value in (None, "", "unknown", "203.0.113.10,", "203.0.113.10:1234"):
            self.assertEqual(signup_client_ip("127.0.0.1", value, trusted), "127.0.0.1")
        self.assertEqual(signup_client_ip("::1", "2001:db8::1234", trusted), "2001:db8::1234")

    def test_invalid_proxy_configuration_is_rejected(self):
        for value in ("*", "localhost", "0.0.0.0/0"):
            with self.assertRaises(ValueError):
                parse_trusted_proxies(value)


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

    def test_proxy_readers_have_independent_signup_limits(self):
        self.server.trusted_proxies = parse_trusted_proxies("127.0.0.1")
        for number in range(1, 12):
            body = json.dumps({"email": f"reader{number}@example.com", "consent": True})
            headers = {"Content-Type": "application/json", "X-Forwarded-For": f"198.51.100.{number}"}
            self.assertEqual(self.request("POST", "/api/subscribe", body, headers)[0], 200)
        # A spoofed prefix must not let one reader evade their own limit.
        for number in range(2, 11):
            body = json.dumps({"email": f"repeat{number}@example.com", "consent": True})
            headers = {"Content-Type": "application/json", "X-Forwarded-For": f"203.0.113.{number}, 198.51.100.1"}
            self.assertEqual(self.request("POST", "/api/subscribe", body, headers)[0], 200)
        self.assertEqual(self.request("POST", "/api/subscribe", body, headers)[0], 429)

    def test_untrusted_forwarded_header_does_not_replace_peer(self):
        body = json.dumps({"email": "reader@example.com", "consent": True})
        with patch.object(self.newsletter, "subscribe", return_value="Preview mode") as subscribe:
            self.request("POST", "/api/subscribe", body, {"Content-Type": "application/json", "X-Forwarded-For": "203.0.113.10"})
            subscribe.assert_called_once_with("reader@example.com", "127.0.0.1")

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
        for path in ["/.git/config", "/.env", "/.newsletter/newsletter.sqlite3", "/.newsletter-preview/outbox/test.eml", "/server.py", "/footer.html", "/status.html", "/images/../newsletter.py", "/images/%2e%2e/server.py"]:
            self.assertEqual(self.request("GET", path)[0], 404, path)
        self.assertEqual(self.request("GET", "/styles.css?v=2")[0], 200)
        self.assertEqual(self.request("GET", "/companion.css")[0], 200)
        self.assertEqual(self.request("GET", "/companion.js")[0], 200)

    def test_direct_article_url_and_refresh_show_full_story(self):
        post = {"id": "specific entry", "title": "Lunch", "caption": "Opening.\n\nThe full story stays right here.", "image": "images/lunch.jpg"}
        with patch.object(self.newsletter, "read_posts", return_value=[post]):
            for _ in range(2):
                status, page = self.request("GET", "/posts/specific%20entry")
                self.assertEqual(status, 200)
                self.assertIn("The full story stays right here.", page)
                self.assertIn('src="/images/lunch.jpg"', page)
            status, body = self.request("HEAD", "/posts/specific%20entry")
            self.assertEqual(status, 200)
            self.assertEqual(body, "")
            status, page = self.request("GET", "/posts/no-such-entry")
            self.assertEqual(status, 404)
            self.assertIn("Entry not found", page)

    def test_real_archive_is_available_on_an_article_page(self):
        post = self.newsletter.read_posts()[0]
        status, page = self.request("GET", f'/posts/{post["id"]}')
        self.assertEqual(status, 200)
        self.assertIn(post["title"], page)

    def test_about_page_has_a_direct_refreshable_route(self):
        for path in ("/about", "/about", "/about/", "/about.html"):
            status, page = self.request("GET", path)
            self.assertEqual(status, 200)
            self.assertIn("About Sophie — Sophie Eats Good Food", page)
            self.assertIn('<footer class="site-footer">', page)
        status, body = self.request("HEAD", "/about")
        self.assertEqual(status, 200)
        self.assertEqual(body, "")

    def test_home_articles_and_missing_pages_have_contact_footers(self):
        post = self.newsletter.read_posts()[0]
        for path, expected in (("/", 200), ("/index.html", 200), (f'/posts/{post["id"]}', 200), ("/missing", 404), ("/posts/missing", 404)):
            status, page = self.request("GET", path)
            self.assertEqual(status, expected)
            footer = page.split('<footer class="site-footer">', 1)[1].split('</footer>', 1)[0]
            self.assertIn('href="https://www.instagram.com/sophieeatsgoodfood/"', footer)
            self.assertIn('href="/about"', footer)
            self.assertNotIn("$footer", page)

    def test_newsletter_confirmation_and_unsubscribe_pages_have_contact(self):
        self.newsletter.subscribe("reader@example.com", "127.0.0.1")
        with self.newsletter.connect() as db:
            token = db.execute("SELECT token FROM subscribers").fetchone()[0]
        for action in ("confirm", "unsubscribe"):
            path = f"/newsletter/{action}"
            for method in ("GET", "POST"):
                body = urlencode({"token": token}) if method == "POST" else None
                status, page = self.request(method, f"{path}?token={token}", body, {"Content-Type": "application/x-www-form-urlencoded"})
                self.assertEqual(status, 200)
                footer = page.split('<footer class="site-footer">', 1)[1].split('</footer>', 1)[0]
                self.assertIn("@sophieeatsgoodfood", footer)


if __name__ == "__main__":
    unittest.main()
