from django.urls import resolve
from django.test import TestCase
from django.http import HttpRequest

from bb_app.views import chat_page


class ChatPageTest(TestCase):
  
  def test_chat_page_returns_correct_html(self):
    
    response = self.client.get('/')  
    self.assertTemplateUsed(response, 'chat.html')
    
  def test_can_save_a_POST_request(self):
    
    response = self.client.post('/', data={'user_input': 'can you help? YES or NO'})
    self.assertIn('can you help? YES or NO', response.content.decode())
    self.assertTemplateUsed(response, 'chat.html')