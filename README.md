# Sophie Eats Good Food

A responsive editorial food blog built with plain HTML, CSS, and JavaScript.

## Preview locally

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

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
