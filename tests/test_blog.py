import unittest

from blog import render_post, render_page, render_footer


class BlogTests(unittest.TestCase):
    def setUp(self):
        self.post = {
            "id": "food-moment", "title": "A very good lunch", "date": "October 07, 2026",
            "categoryLabel": "Out & about", "location": "New York",
            "caption": "First paragraph.\n\nSecond paragraph.\nA little detail.\n\nLast paragraph, in full.",
            "photos": [{"image": "images/first.jpg", "alt": "First photo"}, {"image": "images/second.jpg", "alt": "Second photo"}],
            "instagramUrl": "https://www.instagram.com/sophieeatsgoodfood/",
        }

    def test_complete_story_and_all_photos_are_rendered(self):
        page = render_post(self.post, [self.post])
        self.assertIn("Last paragraph, in full.", page)
        self.assertIn("Second paragraph.\nA little detail.", page)
        self.assertIn('src="/images/first.jpg"', page)
        self.assertIn('src="/images/second.jpg"', page)
        self.assertIn("New York", page)
        self.assertIn("A very good lunch — Sophie Eats Good Food", page)
        self.assertNotIn("Original Instagram post ↗", page)
        # The article text is server-rendered; scripts only power the optional companion.
        self.assertIn('<div class="article-body"><p>First paragraph.', page)

    def test_expanded_body_takes_precedence_over_caption(self):
        self.post["body"] = "A complete blog story.\n\nMore than the original caption."
        page = render_post(self.post, [self.post])
        self.assertIn("More than the original caption.", page)
        self.assertNotIn("First paragraph.", page)

    def test_text_and_urls_are_safe(self):
        self.post.update(title='<script>alert("x")</script>', caption='<img src=x onerror=alert(1)>', instagramUrl="javascript:alert(1)")
        self.post["photos"] = [{"image": "javascript:alert(1)"}, {"image": "/.env"}]
        page = render_post(self.post, [self.post])
        self.assertNotIn("<script>", page)
        self.assertNotIn("<img src=x", page)
        self.assertNotIn("javascript:", page)
        self.assertIn("&lt;img", page)

    def test_specific_source_and_neighbor_links(self):
        self.post["instagramUrl"] = "https://www.instagram.com/p/actual-post/"
        older = dict(self.post, id="older entry", title="Older story", date="October 01, 2026")
        page = render_post(self.post, [older, self.post])
        self.assertIn('href="/posts/older%20entry"', page)
        self.assertIn('href="https://www.instagram.com/p/actual-post/"', page)
        self.assertIn("Last paragraph, in full.", page)

    def test_pages_share_the_same_contact_footer(self):
        footer = render_footer()
        self.assertIn('href="https://www.instagram.com/sophieeatsgoodfood/"', footer)
        self.assertIn('href="/about"', footer)
        self.assertNotIn("$year", footer)
        for page in (render_page("index.html"), render_page("about.html"), render_post(self.post, [self.post])):
            self.assertIn(footer, page)
            self.assertEqual(page.count('<footer class="site-footer">'), 1)
            self.assertNotIn("$footer", page)
            self.assertNotIn('href="#about"', page)
            self.assertNotIn('href="/#about"', page)

    def test_about_page_contains_own_content_and_current_navigation(self):
        page = render_page("about.html")
        self.assertIn("About Sophie — Sophie Eats Good Food", page)
        self.assertIn('href="/about" aria-current="page"', page)
        self.assertIn("Think of this blog as the longer conversation", page)
        self.assertIn('href="/#journal"', page)
        self.assertIn('href="/#subscribe"', page)

    def test_journal_keeps_search_without_category_buttons(self):
        page = render_page("index.html")
        self.assertIn('id="search" type="search"', page)
        self.assertNotIn('data-filter=', page)
        self.assertNotIn('aria-label="Filter posts"', page)


if __name__ == "__main__":
    unittest.main()
