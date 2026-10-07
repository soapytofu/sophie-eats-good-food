# Sophie Eats Good Food

A responsive editorial food blog built with plain HTML, CSS, and JavaScript.

Every entry has its own shareable `/posts/<id>` page with the full text, date, location (when provided), photos, and links to neighboring entries. These pages work on direct visits and refreshes, even without JavaScript. Old `/#post=<id>` bookmarks still redirect to the matching page. Run the Python server for these routes; they are not static files for GitHub Pages.

About Sophie lives at `/about`; old `/#about` bookmarks redirect there. The homepage, About page, Life's snippets gallery, entries, newsletter confirmation/unsubscribe screens, and error pages all use `footer.html`, with Sophie's Instagram contact link. Update that single template to change the contact details everywhere. These pages are rendered by the Python server, not served as raw templates.

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

If HTTPS is provided by a reverse proxy, set `TRUSTED_PROXY_IPS` to that proxy's exact connecting IP(s), separated by commas (for a local proxy, `127.0.0.1,::1`). Configure the proxy to overwrite `X-Forwarded-For` with the actual client IP, or append the actual client IP to the chain. The server reads that header only from configured proxies and walks the chain from the trusted end, so visitors retain separate signup limits without trusting forged headers. Leave this setting empty for direct access. Keep the backend private behind the proxy; never trust arbitrary visitor IPs or a proxy that forwards the header unchanged.

Provider reference: [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email).

## Verification

```bash
python3 -m unittest discover -s tests -v
node --check app.js
node --check newsletter.js
node --check gallery.js
node --test tests/*.test.js
```

## Little Sophie

An optional line-drawn stick-figure companion visits reserved spots beside the hero, journal, mailing list, About page, and article pages. Click her to wave/hop, take a little stroll, discover a random entry, or find the mailing list. Her jointed rig has knee bends, opposing arm swings, subtle breathing and blinking, and a hop with anticipation and a soft landing. Short walks stay grounded at a relaxed pace; moving between distant sections uses a soft fade instead of flying across article text. Pause and hide controls persist for the browser session; a small “Show little Sophie” button restores her. Pausing roaming still allows deliberate hop/stroll interactions. System reduced-motion preferences disable automatic movement and animated gestures. The character uses a small inline SVG, has no chat backend, and sends no user data anywhere.

Sophie hides while the page scrolls or resizes and returns only after a safe perch is located. Her note's controls follow her button in keyboard Tab order; Escape closes the note and returns focus without scrolling the page.

## Design direction

The blog keeps a story-first, dated journal rather than a recipe-card grid. The separate About page, legible supporting text, and clear shared contact footer take inspiration from [Orangette](https://orangette.net/) and [Cup of Jo](https://cupofjo.com/about/), while retaining Sophie's cream/sage palette and handwritten accents. No other blogger's photos or biography are used.

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

Each post is an object in `posts.js`. Add the original Instagram photo to an `images/` directory, copy the full caption, date, location, and original post URL into a new object, and it will automatically become a searchable blog article.

Use `body` for an expanded blog story, or `caption` for the original complete text. For multiple photos, add `photos: [{image: "images/first.jpg", alt: "Description"}, {image: "images/second.jpg", alt: "Description"}]`. A specific Instagram post URL is shown only as optional attribution; the full available story is displayed on the blog itself. Generic profile links are not shown as article sources.

Instagram blocked unattended access to the public profile during this build, so the included six entries are clearly structured demo content rather than claims about the real account. Run the importer above to replace them with the exact archive.

### Browse by food or topic

The journal's “Find an entry” controls let readers choose **All entries**, **Food featured**, or **Topic**, then select a tag. Search works alongside that selection; clearing filters restores the full archive. Entries remain newest-first. Available choices and counts come from the posts themselves, not a fixed category list.

Add optional arrays to each entry in `posts.js`, for example:

```js
foods: ["Pasta", "Seafood"],
topics: ["Travel", "Restaurant discoveries"],
```

Use `foods` for what is actually pictured and `topics` for what the story is about. An entry can have multiple tags in each group. Tags are assigned editorially while preparing each post; the site does not automatically analyze images or infer pictured foods from captions. Untagged posts remain visible under All entries and all-food/all-topic selections. The demo archive has example tags you can replace freely. Instagram exports do not include these custom tags: after importing, add them to the generated entries. Re-importing replaces `posts.js`, so preserve any custom edits from its backup.

## Life's snippets

The separate `/life` album is for non-food photos. It starts empty: no stock images or food entries are presented as Sophie's life photos.

Put your photos in `images/life/`, then add them to `life.json` in the order you want them displayed:

```json
[
  {
    "image": "images/life/your-photo.jpg",
    "alt": "A description of the photo",
    "caption": "An optional little note",
    "date": "October 2026"
  }
]
```

Only `image` is required; provide descriptive `alt` text for accessibility. Captions and dates are optional. Images keep their original proportions in a quiet two-column gallery (one column on small screens). Click a photo to enlarge it, use the arrow keys or buttons to browse, and Escape to close. Photos and captions are still available without JavaScript. This collection is independent of `posts.js`; adding life photos does not send food-blog newsletter notifications. There is no browser-based upload editor yet.
