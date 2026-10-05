"""Persistent, confirmed mailing list and new-post delivery queue (standard library only)."""

import hashlib
import html
import json
import os
import re
import secrets
import sqlite3
import subprocess
import time
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
CHECK_INBOX = "Check your inbox for a confirmation link. If you’re already subscribed, you’re all set!"


class Newsletter:
    def __init__(self, directory=None, preview=False):
        self.preview = preview
        self.directory = Path(directory or ROOT / (".newsletter-preview" if preview else ".newsletter"))
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.database = self.directory / "newsletter.sqlite3"
        self.site_url = os.environ.get("SITE_URL", "http://127.0.0.1:4173").rstrip("/")
        self.api_key = os.environ.get("RESEND_API_KEY", "")
        self.sender = os.environ.get("NEWSLETTER_FROM", "")
        self.address = os.environ.get("NEWSLETTER_POSTAL_ADDRESS", "")
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS subscribers (
                    id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL,
                    token TEXT UNIQUE NOT NULL, expires REAL NOT NULL,
                    created REAL NOT NULL, confirmed REAL, last_confirmation REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY, subscriber INTEGER NOT NULL,
                    kind TEXT NOT NULL, payload TEXT NOT NULL,
                    sent REAL, attempts INTEGER NOT NULL DEFAULT 0,
                    retry_at REAL NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS seen_posts (id TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE IF NOT EXISTS signup_requests (ip TEXT, created REAL);
            """)
        self.database.chmod(0o600)

    def connect(self):
        db = sqlite3.connect(self.database, timeout=20)
        db.row_factory = sqlite3.Row
        return db

    @property
    def ready(self):
        return self.preview or bool(self.api_key and self.sender and self.address and urlsplit(self.site_url).scheme == "https")

    def subscribe(self, email, ip):
        if not self.ready:
            raise RuntimeError("The mailing list is opening soon. Please check back a little later.")
        if not isinstance(email, str) or len(email) > 254 or not re.fullmatch(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", email.strip()):
            raise ValueError("Please enter a valid email address.")
        email = email.strip().lower()
        now = time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM signup_requests WHERE created < ?", (now - 3600,))
            count = db.execute("SELECT count(*) FROM signup_requests WHERE ip = ?", (ip,)).fetchone()[0]
            if count >= 10:
                raise OverflowError("Too many signup attempts. Please try again in an hour.")
            db.execute("INSERT INTO signup_requests VALUES (?, ?)", (ip, now))
            existing = db.execute("SELECT * FROM subscribers WHERE email = ?", (email,)).fetchone()
            if existing and (existing["confirmed"] or now - existing["last_confirmation"] < 600):
                return CHECK_INBOX
            token = secrets.token_urlsafe(32)
            if existing:
                subscriber_id = existing["id"]
                db.execute("UPDATE subscribers SET token=?, expires=?, last_confirmation=? WHERE id=?", (token, now + 86400, now, subscriber_id))
                db.execute("DELETE FROM jobs WHERE subscriber=? AND kind='confirmation' AND sent IS NULL", (subscriber_id,))
            else:
                subscriber_id = db.execute("INSERT INTO subscribers(email,token,expires,created,last_confirmation) VALUES (?,?,?,?,?)", (email, token, now + 86400, now, now)).lastrowid
            link = f"{self.site_url}/newsletter/confirm?token={quote(token)}"
            payload = {
                "subject": "One last step: join Sophie’s table",
                "text": f"Confirm your email to get a note whenever Sophie publishes a new post.\n\n{link}\n\nThis link expires in 24 hours. If you didn’t sign up, simply ignore this email.",
                "html": f'<h1>You’re invited to the table.</h1><p>Confirm your email to hear about Sophie’s latest food stories.</p><p><a href="{html.escape(link)}">Confirm my subscription →</a></p><p>This link expires in 24 hours. Didn’t sign up? Ignore this email.</p>',
            }
            db.execute("INSERT INTO jobs(id,subscriber,kind,payload) VALUES (?,?,?,?)", (secrets.token_hex(16), subscriber_id, "confirmation", json.dumps(payload)))
        return "Preview mode: your confirmation email is saved in the local outbox; no email was sent." if self.preview else CHECK_INBOX

    def subscriber(self, token):
        with self.connect() as db:
            return db.execute("SELECT * FROM subscribers WHERE token=?", (token,)).fetchone()

    def confirm(self, token):
        with self.connect() as db:
            row = db.execute("SELECT * FROM subscribers WHERE token=?", (token,)).fetchone()
            if not row or (not row["confirmed"] and row["expires"] < time.time()):
                return False
            db.execute("UPDATE subscribers SET confirmed=COALESCE(confirmed,?) WHERE id=?", (time.time(), row["id"]))
        return True

    def unsubscribe(self, token):
        with self.connect() as db:
            row = db.execute("SELECT id FROM subscribers WHERE token=?", (token,)).fetchone()
            if not row:
                return False
            db.execute("DELETE FROM jobs WHERE subscriber=?", (row["id"],))
            db.execute("DELETE FROM subscribers WHERE id=?", (row["id"],))
        return True

    def read_posts(self):
        # Evaluate only the site's own data file, in a sandbox with no network or file APIs.
        script = "const fs=require('fs'),vm=require('vm');const s={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),s,{timeout:1000});console.log(JSON.stringify(s.window.POSTS));"
        result = subprocess.run(["node", "-e", script, str(ROOT / "posts.js")], capture_output=True, text=True, timeout=5, check=True)
        posts = json.loads(result.stdout)
        if not isinstance(posts, list) or any(not isinstance(p, dict) or not isinstance(p.get("id"), str) or not p["id"] for p in posts):
            raise ValueError("Each post needs a stable, unique string ID.")
        if len({p["id"] for p in posts}) != len(posts):
            raise ValueError("Post IDs must be unique before sending notifications.")
        return posts

    def discover(self, posts):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            first_run = not db.execute("SELECT 1 FROM metadata WHERE key='initialized'").fetchone()
            for post in posts:
                if db.execute("SELECT 1 FROM seen_posts WHERE id=?", (post["id"],)).fetchone():
                    continue
                db.execute("INSERT INTO seen_posts VALUES (?)", (post["id"],))
                if first_run:
                    continue
                # Only the people subscribed at publication time receive this announcement.
                subscribers = db.execute("SELECT * FROM subscribers WHERE confirmed IS NOT NULL").fetchall()
                for subscriber in subscribers:
                    link = f"{self.site_url}/#post={quote(post['id'], safe='')}"
                    unsubscribe = f"{self.site_url}/newsletter/unsubscribe?token={quote(subscriber['token'])}"
                    title, excerpt = str(post.get("title", "A new story")), str(post.get("excerpt", ""))
                    payload = {
                        "subject": f"New on Sophie Eats Good Food: {title}",
                        "text": f"{title}\n\n{excerpt}\n\nRead the story: {link}\n\nUnsubscribe: {unsubscribe}\n{self.address}",
                        "html": f'<p>SOPHIE EATS GOOD FOOD</p><h1>{html.escape(title)}</h1><p>{html.escape(excerpt)}</p><p><a href="{html.escape(link)}">Read the story →</a></p><hr><p>You’re receiving this because you joined Sophie’s mailing list.</p><p><a href="{html.escape(unsubscribe)}">Unsubscribe</a></p><p>{html.escape(self.address)}</p>',
                        "headers": {"List-Unsubscribe": f"<{unsubscribe}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"},
                    }
                    job_id = hashlib.sha256(f"{post['id']}:{subscriber['token']}".encode()).hexdigest()
                    db.execute("INSERT OR IGNORE INTO jobs(id,subscriber,kind,payload) VALUES (?,?,?,?)", (job_id, subscriber["id"], "post", json.dumps(payload)))
            db.execute("INSERT OR IGNORE INTO metadata VALUES ('initialized','1')")

    def send(self, job, subscriber):
        payload = json.loads(job["payload"])
        if self.preview:
            outbox = self.directory / "outbox"
            outbox.mkdir(exist_ok=True, mode=0o700)
            message = EmailMessage()
            message["From"] = "Sophie Eats Good Food <preview@example.com>"
            message["To"] = subscriber["email"]
            message["Subject"] = payload["subject"]
            message.set_content(payload["text"])
            message.add_alternative(payload["html"], subtype="html")
            (outbox / f"{job['id']}.eml").write_bytes(message.as_bytes())
            return
        payload.update({"from": self.sender, "to": [subscriber["email"]]})
        request = Request("https://api.resend.com/emails", data=json.dumps(payload).encode(), headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "User-Agent": "SophieEatsGoodFood/1.0", "Idempotency-Key": job["id"]}, method="POST")
        with urlopen(request, timeout=15) as response:
            json.load(response)

    def deliver(self):
        if not self.ready:
            return
        with self.connect() as db:
            ids = [row[0] for row in db.execute("SELECT id FROM jobs WHERE sent IS NULL AND retry_at <= ? LIMIT 50", (time.time(),))]
        for job_id in ids:
            # Serialize unsubscribe and send, including between multiple server processes.
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                job = db.execute("SELECT * FROM jobs WHERE id=? AND sent IS NULL", (job_id,)).fetchone()
                if not job:
                    continue
                subscriber = db.execute("SELECT * FROM subscribers WHERE id=?", (job["subscriber"],)).fetchone()
                if not subscriber or (job["kind"] == "post" and not subscriber["confirmed"]):
                    db.execute("DELETE FROM jobs WHERE id=?", (job_id,))
                    continue
                if job["kind"] == "confirmation" and (subscriber["confirmed"] or subscriber["expires"] < time.time()):
                    db.execute("DELETE FROM jobs WHERE id=?", (job_id,))
                    continue
                try:
                    self.send(job, subscriber)
                except Exception:
                    attempts = job["attempts"] + 1
                    db.execute("UPDATE jobs SET attempts=?,retry_at=? WHERE id=?", (attempts, time.time() + min(3600, 60 * 2 ** min(attempts, 6)), job_id))
                    print("An email could not be delivered; it remains queued for retry.", flush=True)
                else:
                    db.execute("UPDATE jobs SET sent=? WHERE id=?", (time.time(), job_id))
            time.sleep(0.6)  # Keep API requests below Resend's default sending rate.
