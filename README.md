# Sophie Eats Good Food

A responsive editorial food blog built with plain HTML, CSS, and JavaScript.

Every entry has its own shareable `/posts/<id>` page with the full text, date, location (when provided), photos, and links to neighboring entries. These pages work on direct visits and refreshes, even without JavaScript. Old `/#post=<id>` bookmarks still redirect to the matching page. Run the Python server for these routes; they are not static files for GitHub Pages.

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
node --test tests/companion.test.js
```

## Little Sophie

An optional illustrated companion visits reserved spots beside the hero, journal, mailing list, and article pages. Click her to wave/hop, take a little stroll, discover a random entry, or find the mailing list. Her jointed cartoon rig has knee bends, opposing arm swings, subtle breathing and blinking, and a hop with anticipation and a soft landing. Short walks stay grounded at a relaxed pace; moving between distant sections uses a soft fade instead of flying across article text. Pause and hide controls persist for the browser session; a small “Show little Sophie” button restores her. Pausing roaming still allows deliberate hop/stroll interactions. System reduced-motion preferences disable automatic movement and animated gestures. The character uses a small inline SVG, has no chat backend, and sends no user data anywhere.

## Import every Instagram post (recommended)

1. In Instagram, request **Download your information** in JSON format.
2. Unzip the download.
3. Run:

```bash
python3 import_instagram.py /path/to/unzipped-instagram-export
```

The importer finds feed posts and archived Stories, copies all supported photos (including carousel photos) into `images/instagram`, preserves the available text and date, and regenerates the complete site archive. Stories only appear in an export when Instagram retained them in your Story Archive. Videos and text embedded inside images are not converted to written blog text.

Mixed video/photo carousels use their first supported photo as the cover. Imports with no usable photos stop without replacing the current archive. Successful imports replace `posts.js` atomically and save its previous version as `posts.js.bak`; keep that backup until you have checked the imported entries.

## Add a post manually

Each post is an object in `posts.js`. Add the original Instagram photo to an `images/` directory, copy the full caption, date, location, and original post URL into a new object, and it will automatically become a searchable/filterable blog article.

Use `body` for an expanded blog story, or `caption` for the original complete text. For multiple photos, add `photos: [{image: "images/first.jpg", alt: "Description"}, {image: "images/second.jpg", alt: "Description"}]`. A specific Instagram post URL is shown only as optional attribution; the full available story is displayed on the blog itself. Generic profile links are not shown as article sources.

Instagram blocked unattended access to the public profile during this build, so the included six entries are clearly structured demo content rather than claims about the real account. Run the importer above to replace them with the exact archive.
