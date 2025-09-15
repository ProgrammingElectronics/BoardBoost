from django.urls import resolve
from django.test import TestCase
from django.http import HttpRequest
from bb_app.views import chat_page, get_ai_response
from bb_app.models import Message


class ChatPageTest(TestCase):

    def test_chat_page_returns_correct_html(self):

        response = self.client.get("/")

        self.assertTemplateUsed(response, "chat.html")

    def test_only_saves_messages_when_necessary(self):
        self.client.get("/")
        self.assertEqual(Message.objects.count(), 0)

    def test_can_save_a_POST_request(self):

        response = self.client.post("/", data={"user_input": "can you help? YES or NO"})

        self.assertEqual(Message.objects.count(), 1)
        new_message = Message.objects.first()
        self.assertEqual(new_message.text, "can you help? YES or NO")

    def test_user_messages_have_role_field_set_to_user(self):

        response = self.client.post("/", data={"user_input": "can you help? YES or NO"})

        user_message = Message.objects.first()
        self.assertEqual(user_message.role, "user")

    def test_redirects_after_POST(self):
        response = self.client.post("/", data={"user_input": "can you help? YES or NO"})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["location"], "/")

    def test_displays_all_chat_messages(self):
        Message.objects.create(text="message 1")
        Message.objects.create(text="message 2")

        response = self.client.get("/")

        self.assertIn("message 1", response.content.decode())
        self.assertIn("message 2", response.content.decode())


class MessageModelTest(TestCase):

    def test_saving_and_retrieving_messages(self):
        first_message = Message()
        first_message.text = "The first (ever) message"
        first_message.save()

        second_message = Message()
        second_message.text = "The 2nd message"
        second_message.save()

        saved_messages = Message.objects.all()
        self.assertEqual(saved_messages.count(), 2)

        first_saved_message = saved_messages[0]
        second_saved_message = saved_messages[1]
        self.assertEqual(first_saved_message.text, "The first (ever) message")
        self.assertEqual(second_saved_message.text, "The 2nd message")

    def test_roles_field_for_messages(self):
        user_message_1 = Message.objects.create(role="user")
        user_message_1.save()

        user_message_2 = Message.objects.create(role="developer")
        user_message_2.save()

        user_message_3 = Message.objects.create(role="assistant")
        user_message_3.save()

        self.assertEqual(user_message_1.role, "user")
        self.assertEqual(user_message_2.role, "developer")
        self.assertEqual(user_message_3.role, "assistant")

    def test_AI_messages_have_role_field_set_to_user(self):
        data = "can you help? yes or no"
        ai_response = get_ai_response(data)

        self.assertEqual(ai_response.role, "assistant")

    def test_AI_response_returns_answer(self):
        data = "can you help? yes or no"
        ai_response = get_ai_response(data)

        self.assertEqual(ai_response.text, "yes")
