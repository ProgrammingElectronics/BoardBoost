from django.urls import resolve
from django.test import TestCase
from django.http import HttpRequest

from bb_app.views import chat_page


class ChatPageTest(TestCase):
  
  def test_root_url_resolves_to_home_page_view(self):
    found = resolve('/')
    self.assertEqual(found.func, chat_page)

  def test_home_page_returns_correct_html(self):
    request = HttpRequest()
    response = chat_page(request)
    html = response.content.decode('utf8')
    self.assertTrue(html.startswith('<html>'))
    self.assertIn('<title>BoardBoost</title>', html)
    self.assertTrue(html.endswith('</html>'))