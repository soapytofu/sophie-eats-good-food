import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from newsletter import Newsletter


class NewsletterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.list = Newsletter(self.temp.name, preview=True)
        self.list.discover([{"id": "old-post", "title": "Already published"}])
        self.sent = []

    def capture(self, job, subscriber):
        self.sent.append((dict(job), dict(subscriber)))

    def signup(self, email="reader@example.com"):
        self.list.subscribe(email, "127.0.0.1")
        with self.list.connect() as db:
            return db.execute("SELECT * FROM subscribers WHERE email=?", (email,)).fetchone()

    def jobs(self, kind="post"):
        with self.list.connect() as db:
            return db.execute("SELECT * FROM jobs WHERE kind=?", (kind,)).fetchall()

    def test_existing_archive_does_not_send_backlog(self):
        row = self.signup()
        self.list.confirm(row["token"])
        self.list.discover([{"id": "old-post", "title": "Updated existing post"}])
        self.assertEqual(self.jobs(), [])

    def test_confirmation_required_and_double_submit_deduplicated(self):
        row = self.signup()
        self.list.subscribe("READER@example.com", "127.0.0.1")
        self.assertEqual(len(self.jobs("confirmation")), 1)
        self.list.discover([{"id": "before-confirmation"}])
        self.assertEqual(self.jobs(), [])
        self.assertTrue(self.list.confirm(row["token"]))
        self.list.discover([{"id": "after-confirmation", "title": "New meal"}])
        self.assertEqual(len(self.jobs()), 1)

    def test_notification_survives_restart_and_sends_only_once(self):
        row = self.signup()
        self.list.confirm(row["token"])
        post = {"id": "new-post", "title": "Pasta", "excerpt": "So good"}
        self.list.discover([post])
        restarted = Newsletter(self.temp.name, preview=True)
        restarted.discover([post])
        with patch.object(restarted, "send", self.capture), patch("newsletter.time.sleep"):
            restarted.deliver()
            restarted.deliver()
        self.assertEqual(len(self.sent), 1)
        self.assertIn("/posts/new-post", json.loads(self.sent[0][0]["payload"])["text"])

    def test_unsubscribe_cancels_queued_email(self):
        row = self.signup()
        self.list.confirm(row["token"])
        self.list.discover([{"id": "new-post"}])
        self.assertTrue(self.list.unsubscribe(row["token"]))
        with patch.object(self.list, "send", self.capture), patch("newsletter.time.sleep"):
            self.list.deliver()
        self.assertEqual(self.sent, [])
        self.assertIsNone(self.list.subscriber(row["token"]))

    def test_expired_confirmation_rejected(self):
        row = self.signup()
        with self.list.connect() as db:
            db.execute("UPDATE subscribers SET expires=?", (time.time() - 1,))
        self.assertFalse(self.list.confirm(row["token"]))

    def test_delivery_failure_remains_queued_and_retries(self):
        self.signup()
        with patch.object(self.list, "send", side_effect=OSError("Temporary delivery failure")), patch("newsletter.time.sleep"):
            self.list.deliver()
        job = self.jobs("confirmation")[0]
        self.assertIsNone(job["sent"])
        self.assertEqual(job["attempts"], 1)
        with self.list.connect() as db:
            db.execute("UPDATE jobs SET retry_at=0")
        with patch.object(self.list, "send", self.capture), patch("newsletter.time.sleep"):
            self.list.deliver()
        self.assertEqual(len(self.sent), 1)
        self.assertIsNotNone(self.jobs("confirmation")[0]["sent"])

    def test_unconfigured_real_delivery_rejects_signup(self):
        self.list.preview = False
        self.list.api_key = ""
        with self.assertRaises(RuntimeError):
            self.list.subscribe("reader@example.com", "127.0.0.1")
        self.assertEqual(self.jobs("confirmation"), [])

    def test_preview_email_is_local_only(self):
        self.signup()
        with patch("newsletter.urlopen", side_effect=AssertionError("No external mail in preview")), patch("newsletter.time.sleep"):
            self.list.deliver()
        emails = list((Path(self.temp.name) / "outbox").glob("*.eml"))
        self.assertEqual(len(emails), 1)
        self.assertIn("/newsletter/confirm?token=", emails[0].read_text())

    def test_email_validation_rate_limit_and_duplicate_ids(self):
        for invalid in [None, "bad", "name@example.com\nBcc: other@example.com", "x" * 255]:
            with self.assertRaises(ValueError):
                self.list.subscribe(invalid, "127.0.0.1")
        for _ in range(10):
            self.list.subscribe("reader@example.com", "127.0.0.1")
        with self.assertRaises(OverflowError):
            self.list.subscribe("reader@example.com", "127.0.0.1")
        fake_result = type("Result", (), {"stdout": '[{"id":"same"},{"id":"same"}]'})()
        with patch("newsletter.subprocess.run", return_value=fake_result), self.assertRaises(ValueError):
            self.list.read_posts()


if __name__ == "__main__":
    unittest.main()
