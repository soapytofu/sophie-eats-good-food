# Sophie Eats Good Food

A responsive editorial food blog built with plain HTML, CSS, and JavaScript.

## Preview locally

```bash
python3 server.py --preview
```

Then open `http://localhost:4173`.

Use Python 3.10+ and Node.js. No packages need installing. Preview mode saves test emails into `.newsletter-preview/outbox/`; it never sends real email. Open the saved `.eml` file, follow its confirmation link, and confirm to test the full signup flow. Preview subscribers are separate from the real mailing list.

## Mailing list and new-post notifications

The subscription form sends a confirmation email. Only confirmed subscribers receive new-post notifications. Every announcement includes an unsubscribe link, and notification URLs open the specific article.

To activate real delivery:

1. Create a Resend account, verify a sending domain, and create a sending API key.
2. Configure the server environment variables listed in `.env.example`: `RESEND_API_KEY`, `NEWSLETTER_FROM`, `SITE_URL` (your public HTTPS website URL), and `NEWSLETTER_POSTAL_ADDRESS` (the mailing address to include in the email footer). The server does not automatically load `.env` files.
3. Run `python3 server.py --bind 0.0.0.0 --port 4173` on a server with persistent storage and HTTPS in front of it. This Python backend is required; GitHub Pages alone cannot run the signup API or email worker.

The server checks `posts.js` every 30 seconds and queues an announcement when a new, unique post ID appears. Existing posts are recorded on the first launch without sending a backlog. Editing a post keeps its ID and does not send another announcement. The Instagram importer generates stable IDs, so importing the same archive again does not repeat notifications. New subscribers receive only future announcements.

The subscriber database and delivery queue live in `.newsletter/` and are excluded from Git. Back up that folder and retain it between deployments; use one running server instance per database. Pending deliveries survive restarts and retry automatically after temporary delivery failures. The API uses Resend idempotency keys plus a persistent delivery log to prevent ordinary duplicate sends.

API keys, subscriber data, and preview email files are never served by the blog's HTTP server. Without the required delivery configuration, the real signup endpoint returns an unavailable message rather than reporting a successful subscription.

Provider reference: [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email).

## Verification

```bash
python3 -m unittest discover -s tests -v
node --check app.js
node --check newsletter.js
```

## Import every Instagram post (recommended)

1. In Instagram, request **Download your information** in JSON format.
2. Unzip the download.
3. Run:

```bash
python3 import_instagram.py /path/to/unzipped-instagram-export
```

The importer finds feed posts and archived Stories, copies each photo into `images/instagram`, preserves the available text and date, and regenerates the complete site archive. Stories only appear in an export when Instagram retained them in your Story Archive.

## Add a post manually

Each post is an object in `posts.js`. Add the original Instagram photo to an `images/` directory, copy the full caption, date, location, and original post URL into a new object, and it will automatically become a searchable/filterable blog article.

Instagram blocked unattended access to the public profile during this build, so the included six entries are clearly structured demo content rather than claims about the real account. Run the importer above to replace them with the exact archive.
