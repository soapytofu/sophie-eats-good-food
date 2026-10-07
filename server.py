#!/usr/bin/env python3
"""Serve the blog and its newsletter. Run with --preview to test without sending email."""

import argparse
import html
import ipaddress
import json
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit, unquote

from newsletter import Newsletter, ROOT
from blog import render_post, render_page, render_life


def parse_trusted_proxies(value):
    """Trust only explicitly configured proxy IPs, never all incoming headers."""
    return frozenset(ipaddress.ip_address(item.strip()) for item in value.split(",") if item.strip())


def signup_client_ip(peer, forwarded_for, trusted_proxies=()):
    """Walk a proxy-appended chain from the trusted end, ignoring spoofed prefixes."""
    address = ipaddress.ip_address(peer)
    if address not in trusted_proxies or not forwarded_for:
        return str(address)
    try:
        chain = [ipaddress.ip_address(item.strip()) for item in forwarded_for.split(",")]
    except ValueError:
        return str(address)
    for hop in reversed(chain):
        address = hop
        if address not in trusted_proxies:
            break
    return str(address)


class BlogHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        # Confirmation/unsubscribe URLs contain private tokens; don't log request URLs.
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def respond(self, code, body, content_type="application/json"):
        payload = json.dumps(body).encode() if content_type == "application/json" else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def page(self, title, message, action=None, token="", code=200):
        form = f'<form method="post" action="{html.escape(action)}"><input type="hidden" name="token" value="{html.escape(token)}"><button type="submit">{html.escape(title)}</button></form>' if action else ''
        self.respond(code, render_page("status.html", title=html.escape(title), message=html.escape(message), form=form), "text/html")

    def send_error(self, code, message=None, explain=None):
        title = "Page not found" if code == 404 else "Something went wrong"
        self.page(title, "You can find the latest entries in the journal, or get in touch below.", code=code)

    def request_data(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 4096:
            raise ValueError("Please submit the signup form again.")
        self.connection.settimeout(10)
        data = self.rfile.read(length).decode()
        if self.headers.get_content_type() == "application/json":
            parsed = json.loads(data)
            if not isinstance(parsed, dict):
                raise ValueError("Please submit the signup form again.")
            return parsed
        if self.headers.get_content_type() == "application/x-www-form-urlencoded":
            return {key: values[0] for key, values in parse_qs(data).items()}
        raise ValueError("Please submit the signup form again.")

    def same_origin(self):
        origin = self.headers.get("Origin")
        allowed = {self.server.newsletter.site_url}
        if self.server.newsletter.preview:
            allowed.update({f"http://localhost:{self.server.server_port}", f"http://127.0.0.1:{self.server.server_port}"})
        return not origin or origin.rstrip("/") in allowed

    def do_POST(self):
        path = urlsplit(self.path).path
        try:
            data = self.request_data()
            if path == "/api/subscribe":
                if not self.same_origin():
                    return self.respond(403, {"message": "Please sign up through the website."})
                if data.get("website"):
                    return self.respond(200, {"message": "Check your inbox for a confirmation link."})
                if data.get("consent") is not True:
                    raise ValueError("Please check the box to receive new-post emails.")
                client_ip = signup_client_ip(self.client_address[0], self.headers.get("X-Forwarded-For"), getattr(self.server, "trusted_proxies", ()))
                message = self.server.newsletter.subscribe(data.get("email"), client_ip)
                self.server.wakeup.set()
                return self.respond(200, {"message": message})
            if path in ("/newsletter/confirm", "/newsletter/unsubscribe"):
                token = parse_qs(urlsplit(self.path).query).get("token", [data.get("token", "")])[0]
                if path.endswith("confirm"):
                    # The unguessable email token authorizes this action; email browsers
                    # may submit a null Origin because these pages disable referrers.
                    if not self.server.newsletter.confirm(token):
                        return self.page("That link has expired", "Sign up again to receive a fresh confirmation link.", code=400)
                    return self.page("You’re on the list!", "You’ll get a note when Sophie’s next post goes up. Pull up a chair.")
                if not self.server.newsletter.unsubscribe(token):
                    return self.page("You’re off the list", "You won’t receive any more new-post emails.")
                return self.page("You’re off the list", "You won’t receive any more new-post emails. You’re always welcome back.")
            self.respond(404, {"message": "Not found."})
        except (ValueError, UnicodeError):
            self.respond(400, {"message": "Please enter a valid email and agree to receive new-post emails."})
        except OverflowError as error:
            self.respond(429, {"message": str(error)})
        except RuntimeError as error:
            self.respond(503, {"message": str(error)})
        except Exception:
            self.respond(503, {"message": "Signups are temporarily unavailable. Please try again later."})

    def do_GET(self):
        route = urlsplit(self.path)
        if route.path in ("/newsletter/confirm", "/newsletter/unsubscribe"):
            token = parse_qs(route.query).get("token", [""])[0]
            row = self.server.newsletter.subscriber(token)
            if not row:
                return self.page("That link is no longer valid", "Please return to the journal and sign up again.", code=400)
            if route.path.endswith("confirm"):
                return self.page("Confirm my subscription", "One click to join Sophie’s table and receive new-post emails.", route.path, token)
            return self.page("Unsubscribe", "Would you like to stop receiving new-post emails?", route.path, token)
        super().do_GET()

    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        if path in {"/life", "/life/", "/life.html"}:
            try:
                self.respond(200, render_life(), "text/html")
            except (ValueError, OSError):
                self.page("The album is taking a moment", "Please try again shortly.", code=503)
            return None
        if path in {"/", "/index.html", "/about", "/about/", "/about.html"}:
            template = "about.html" if path.startswith("/about") else "index.html"
            self.respond(200, render_page(template), "text/html")
            return None
        if path.startswith("/posts/"):
            try:
                posts = self.server.newsletter.read_posts()
                post = next((item for item in posts if item["id"] == path[len("/posts/"):]), None)
                if not post:
                    self.page("Entry not found", "This page may have moved. You can find the latest entries in the journal.", code=404)
                else:
                    self.respond(200, render_post(post, posts), "text/html")
            except Exception:
                self.page("The journal is taking a moment", "Please try again shortly.", code=503)
            return None
        relative = "index.html" if path == "/" else path.lstrip("/")
        target = (ROOT / relative).resolve()
        public = {"index.html", "styles.css", "app.js", "newsletter.js", "posts.js", "gallery.css", "gallery.js", "journal-filters.js"}
        image = relative.startswith("images/") and target.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
        if not target.is_relative_to(ROOT) or (relative not in public and not image) or not target.is_file():
            self.send_error(404)
            return None
        return super().send_head()


def work(server):
    while not server.stopping.is_set():
        try:
            server.newsletter.discover(server.newsletter.read_posts())
            server.newsletter.deliver()
        except Exception:
            print("Newsletter scan failed; check posts.js and the newsletter configuration.", flush=True)
        server.wakeup.wait(30)
        server.wakeup.clear()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--preview", action="store_true", help="Save emails to a separate local outbox; never send them")
    args = parser.parse_args()
    try:
        trusted_proxies = parse_trusted_proxies(os.environ.get("TRUSTED_PROXY_IPS", ""))
    except ValueError:
        parser.error("TRUSTED_PROXY_IPS must contain comma-separated proxy IP addresses (no hostnames or CIDRs).")
    newsletter = Newsletter(preview=args.preview)
    if args.preview and args.bind not in {"127.0.0.1", "localhost", "::1"}:
        parser.error("Preview mode must only be served on localhost.")
    if args.preview:
        newsletter.site_url = f"http://127.0.0.1:{args.port}"
    if not args.preview and not newsletter.ready:
        print("Emails are disabled: set RESEND_API_KEY, NEWSLETTER_FROM, NEWSLETTER_POSTAL_ADDRESS, and an HTTPS SITE_URL.", flush=True)
    # Seed the existing archive before accepting subscriptions; it won't generate old-post emails.
    newsletter.discover(newsletter.read_posts())
    server = ThreadingHTTPServer((args.bind, args.port), BlogHandler)
    server.newsletter = newsletter
    server.trusted_proxies = trusted_proxies
    server.wakeup, server.stopping = threading.Event(), threading.Event()
    worker = threading.Thread(target=work, args=(server,), daemon=True)
    worker.start()
    print(f"Blog preview: http://{args.bind}:{args.port} · {'local email outbox' if args.preview else 'newsletter server'}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.stopping.set()
        server.wakeup.set()
        server.server_close()


if __name__ == "__main__":
    main()
