#!/usr/bin/env python3
"""Turn an official Instagram JSON export into this site's posts.js archive."""

import argparse
import hashlib
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def text_value(value):
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return "\n".join(filter(None, (text_value(item) for item in value)))
    if isinstance(value, dict):
        for key in ("title", "text", "value"):
            if key in value:
                return text_value(value[key])
    return ""


def make_title(caption, fallback):
    clean = re.sub(r"https?://\S+|#\w+|@\w+", "", caption).strip()
    first = re.split(r"[.!?\n]", clean)[0].strip(" -–—:✨🍽️")
    words = first.split()
    title = " ".join(words[:12])
    return title.capitalize() if title else fallback


def find_content_files(export_dir):
    """Find feed posts and archived story manifests in current/older export layouts."""
    patterns = ("posts_*.json", "posts.json", "stories.json", "stories_*.json")
    return sorted({path for pattern in patterns for path in export_dir.rglob(pattern)})


def extract_records(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("media", "posts", "ig_posts", "stories", "ig_stories"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="Unzipped Instagram export folder")
    args = parser.parse_args()
    export_dir = args.export.expanduser().resolve()
    files = find_content_files(export_dir)
    if not files:
        raise SystemExit("No posts or stories JSON found. Choose the top-level unzipped Instagram export folder.")

    output_images = ROOT / "images" / "instagram"
    output_images.mkdir(parents=True, exist_ok=True)
    posts = []

    for json_file in files:
        is_story = "stories" in json_file.stem.lower()
        records = extract_records(json.loads(json_file.read_text(encoding="utf-8")))
        for record in records:
            media_items = record.get("media", []) if isinstance(record, dict) else []
            if not media_items and isinstance(record, dict) and record.get("uri"):
                media_items = [record]
            if not media_items:
                continue

            primary = media_items[0]
            caption = text_value(record.get("title")) or text_value(primary.get("title"))
            timestamp = primary.get("creation_timestamp") or record.get("creation_timestamp") or 0
            date = datetime.fromtimestamp(timestamp).strftime("%B %d, %Y") if timestamp else "From Instagram"
            source_uri = primary.get("uri", "")
            source = export_dir / source_uri
            if not source.exists():
                source = json_file.parent / source_uri
            if not source.exists() or source.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue

            # Stable IDs prevent re-imports from generating duplicate newsletter announcements.
            post_id = "ig-" + hashlib.sha256(f"{source_uri}:{timestamp}".encode()).hexdigest()[:20]
            destination = output_images / f"{post_id}{source.suffix.lower()}"
            shutil.copy2(source, destination)

            title = make_title(caption, f"A good food moment #{len(posts)+1}")
            excerpt = re.sub(r"\s+", " ", caption).strip()
            if len(excerpt) > 145:
                excerpt = excerpt[:142].rsplit(" ", 1)[0] + "…"
            posts.append({
                "id": post_id,
                "title": title,
                "date": date,
                "category": "story" if is_story else "restaurant",
                "categoryLabel": "Instagram Story" if is_story else "From Instagram",
                "location": "",
                "image": destination.relative_to(ROOT).as_posix(),
                "alt": title,
                "excerpt": excerpt or "A delicious moment from the feed.",
                "caption": caption or "A delicious moment from the feed.",
                "instagramUrl": "https://www.instagram.com/sophieeatsgoodfood/",
            })

    posts.sort(key=lambda post: datetime.strptime(post["date"], "%B %d, %Y") if post["date"] != "From Instagram" else datetime.min, reverse=True)
    output = "// Generated from Sophie's official Instagram export.\nwindow.POSTS = " + json.dumps(posts, ensure_ascii=False, indent=2) + ";\n"
    (ROOT / "posts.js").write_text(output, encoding="utf-8")
    print(f"Imported {len(posts)} posts/stories and their photos into {ROOT}")


if __name__ == "__main__":
    main()
