from django.urls import resolve
from django.test import TestCase
from django.http import HttpRequest

from bb_app.views import chat_page


class ChatPageTest(TestCase):
  
  def test_chat_page_returns_correct_html(self):
    
    response = self.client.get('/')  
    self.assertTemplateUsed(response, 'chat.html')