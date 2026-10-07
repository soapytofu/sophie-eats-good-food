import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import import_instagram


class ImportTests(unittest.TestCase):
    def test_all_carousel_photos_and_full_caption_are_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            export, site = root / "export", root / "site"
            export.mkdir()
            site.mkdir()
            (export / "first.jpg").write_bytes(b"first photo fixture")
            (export / "second.jpg").write_bytes(b"second photo fixture")
            caption = "An original caption.\n\nEvery last detail stays."
            manifest = [{"title": caption, "media": [{"uri": "first.jpg", "creation_timestamp": 1700000000}, {"uri": "second.jpg", "creation_timestamp": 1700000000}]}]
            (export / "posts_1.json").write_text(json.dumps(manifest))
            with patch.object(import_instagram, "ROOT", site), patch("sys.argv", ["import_instagram.py", str(export)]):
                import_instagram.main()
            data = (site / "posts.js").read_text().split("window.POSTS = ", 1)[1].rstrip(";\n")
            post = json.loads(data)[0]
            self.assertEqual(post["caption"], caption)
            self.assertEqual(len(post["photos"]), 2)
            self.assertEqual(post["image"], post["photos"][0]["image"])
            self.assertEqual((site / post["photos"][1]["image"]).read_bytes(), b"second photo fixture")
            expected_id = "ig-" + hashlib.sha256(b"first.jpg:1700000000").hexdigest()[:20]
            self.assertEqual(post["id"], expected_id)


if __name__ == "__main__":
    unittest.main()
