import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import import_instagram


class ImportTests(unittest.TestCase):
    def run_import(self, export, site):
        with patch.object(import_instagram, "ROOT", site), patch("sys.argv", ["import_instagram.py", str(export)]):
            import_instagram.main()

    def read_posts(self, site):
        data = (site / "posts.js").read_text().split("window.POSTS = ", 1)[1].rstrip(";\n")
        return json.loads(data)

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

    def test_video_first_carousel_keeps_photos_caption_and_stable_id(self):
        with tempfile.TemporaryDirectory() as temp:
            export, site = Path(temp) / "export", Path(temp) / "site"
            export.mkdir()
            site.mkdir()
            (export / "photo.jpg").write_bytes(b"photo fixture")
            manifest = [{"media": [{"uri": "clip.mp4", "title": "Lunch in full detail.", "creation_timestamp": 1700000000}, {"uri": "photo.jpg"}]}]
            (export / "posts_1.json").write_text(json.dumps(manifest))
            self.run_import(export, site)
            post = self.read_posts(site)[0]
            self.assertEqual(post["caption"], "Lunch in full detail.")
            self.assertEqual(post["image"], post["photos"][0]["image"])
            self.assertEqual((site / post["image"]).read_bytes(), b"photo fixture")
            expected_id = "ig-" + hashlib.sha256(b"clip.mp4:1700000000").hexdigest()[:20]
            self.assertEqual(post["id"], expected_id)
            self.run_import(export, site)
            self.assertEqual(self.read_posts(site)[0]["id"], expected_id)

    def test_empty_or_unsupported_import_keeps_existing_archive(self):
        for media in ([], [{"uri": "missing.jpg"}], [{"uri": "video.mp4"}]):
            with self.subTest(media=media), tempfile.TemporaryDirectory() as temp:
                export, site = Path(temp) / "export", Path(temp) / "site"
                export.mkdir()
                site.mkdir()
                original = "window.POSTS = [{\"id\": \"existing\"}];\n"
                (site / "posts.js").write_text(original)
                (export / "posts_1.json").write_text(json.dumps([{"media": media}]))
                with self.assertRaisesRegex(SystemExit, "left unchanged"):
                    self.run_import(export, site)
                self.assertEqual((site / "posts.js").read_text(), original)

    def test_archive_replacement_backs_up_previous_version(self):
        with tempfile.TemporaryDirectory() as temp:
            site = Path(temp)
            original = "window.POSTS = [{\"id\": \"existing\"}];\n"
            (site / "posts.js").write_text(original)
            with patch.object(import_instagram, "ROOT", site):
                import_instagram.save_archive("window.POSTS = [{\"id\": \"new\"}];\n")
            self.assertEqual((site / "posts.js.bak").read_text(), original)
            self.assertIn('"new"', (site / "posts.js").read_text())
            self.assertEqual({file.name for file in site.iterdir()}, {"posts.js", "posts.js.bak"})

    def test_failed_atomic_replacement_keeps_archive_and_cleans_temp_files(self):
        with tempfile.TemporaryDirectory() as temp:
            site = Path(temp)
            original = "window.POSTS = [{\"id\": \"existing\"}];\n"
            (site / "posts.js").write_text(original)
            with patch.object(import_instagram, "ROOT", site), patch.object(import_instagram.os, "replace", side_effect=OSError("disk failure")):
                with self.assertRaises(OSError):
                    import_instagram.save_archive("replacement")
            self.assertEqual((site / "posts.js").read_text(), original)
            self.assertEqual({file.name for file in site.iterdir()}, {"posts.js"})


if __name__ == "__main__":
    unittest.main()
