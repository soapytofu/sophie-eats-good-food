"""Render complete, shareable journal pages without requiring JavaScript."""

import html
import math
import re
from datetime import datetime
from string import Template
from urllib.parse import quote, urlsplit

from newsletter import ROOT


def escape(value):
    return html.escape(str(value or ""), quote=True)


def image_url(value):
    """Only allow web images or the blog's public local image directory."""
    value = str(value or "")
    parsed = urlsplit(value)
    if parsed.scheme in {"https", "http"} and parsed.netloc:
        return value
    if not parsed.scheme and not parsed.netloc and value.lstrip("/").startswith("images/"):
        return "/" + value.lstrip("/")
    return ""


def render_post(post, posts):
    title = post.get("title") or "A good food moment"
    # Keep every paragraph and line of the original text; don't invent missing details.
    caption = str(post.get("body") or post.get("caption") or post.get("excerpt") or "")
    paragraphs = re.split(r"\n\s*\n", caption.strip())
    body = "".join(f'<p>{escape(paragraph)}</p>' for paragraph in paragraphs if paragraph.strip())
    if not body:
        body = '<p class="article-empty">This entry is a photo journal; no written caption was included.</p>'
    minutes = max(1, math.ceil(len(caption.split()) / 220))
    location = f' <span aria-hidden="true">·</span> {escape(post["location"])}' if post.get("location") else ""
    photos = post.get("photos") or [{"image": post.get("image"), "alt": post.get("alt") or title}]
    figures = []
    for photo in photos:
        if not isinstance(photo, dict):
            continue
        source = image_url(photo.get("image"))
        if source:
            loading = ' loading="lazy"' if figures else ''
            figures.append(f'<figure class="article-photo"><img src="{escape(source)}" alt="{escape(photo.get("alt") or title)}"{loading}></figure>')
    first_photo = figures[0] if figures else ""
    other_photos = "".join(figures[1:])
    source = str(post.get("instagramUrl") or "")
    parsed = urlsplit(source)
    # A profile link is not a source for a specific post. Never use it as a stand-in.
    source_link = ""
    if parsed.scheme == "https" and parsed.hostname in {"instagram.com", "www.instagram.com"} and re.match(r"^/(p|reel|tv)/[^/]+", parsed.path):
        source_link = f'<p class="article-source"><a href="{escape(source)}" target="_blank" rel="noreferrer">Original Instagram post ↗</a></p>'
    def publication_date(item):
        try:
            return datetime.strptime(item.get("date", ""), "%B %d, %Y")
        except ValueError:
            return datetime.min
    ordered = sorted(posts, key=publication_date, reverse=True)
    index = next(i for i, item in enumerate(ordered) if item["id"] == post["id"])
    neighbors = []
    for offset, label in [(-1, "Newer entry"), (1, "Older entry")]:
        if 0 <= index + offset < len(ordered):
            neighbor = ordered[index + offset]
            neighbors.append(f'<a href="/posts/{quote(neighbor["id"], safe="")}"><span>{label}</span>{escape(neighbor.get("title"))}</a>')
    article = f'''<article class="full-entry">
      <header class="article-heading"><p class="entry-date">{escape(post.get("date"))} <span aria-hidden="true">·</span> {escape(post.get("categoryLabel"))}</p>
      <h1>{escape(title)}</h1><p class="entry-meta">By Sophie <span aria-hidden="true">·</span> {minutes} min read{location}</p></header>
      {first_photo}<div class="article-body">{body}<p class="signature">Sophie x</p></div>{other_photos}{source_link}
    </article><nav class="entry-navigation" aria-label="More journal entries">{"".join(neighbors)}</nav>'''
    return Template((ROOT / "post.html").read_text(encoding="utf-8")).substitute(
        title=escape(title), description=escape(post.get("excerpt") or caption[:180]),
        article=article, year=datetime.now().year,
    )
