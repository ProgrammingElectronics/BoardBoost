from django.test import LiveServerTestCase
from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.common.exceptions import WebDriverException
import time

MAX_WAIT = 10

user_question_1 = "Please respond with an integer -> what is 1 + 1?"
user_question_2 = "Please respond with an integer -> what is you last answer + 40?"
user_question_3 = "Please respond with an integer -> what is 3 + 3"
user_question_4 = "Please respond with an integer -> what is you last answer + 41"


class NewVisitorTest(LiveServerTestCase):

    def setUp(self):
        self.browser = webdriver.Firefox()

    def tearDown(self):
        self.browser.quit()

    def wait_for_message_in_chat(self, message_txt):
        start_time = time.time()
        while True:
            try:
                chat_messages = self.browser.find_elements(
                    By.CLASS_NAME, "chat-message"
                )
                messages = [msg.text for msg in chat_messages]

                self.assertIn(message_txt, messages, f"text not found in chat history")
                return

            except (AssertionError, WebDriverException) as e:
                if time.time() - start_time > MAX_WAIT:
                    raise e
                time.sleep(0.5)

    def test_can_start_a_chat_for_one_user(self):

        # Bill heard about boardboost and wanted to check out the homepage
        self.browser.get(self.live_server_url)

        # He notices the page title
        self.assertIn("BoardBoost", self.browser.title)

        # He see's an AI chat message welcoming him to ask a question
        ai_default_message = self.browser.find_element(By.CLASS_NAME, "welcome-message")
        self.assertEqual(
            ai_default_message.text,
            "Hello! I'm BoardBoost, your microcontroller coding assistant. How can I help you today?",
            f"Can't find welcome message.",
        )

        # Bill see's a text input box at the bottom of the screen
        chat_input_text_area = self.browser.find_element(By.CLASS_NAME, "user-input")
        self.assertEqual(
            chat_input_text_area.get_attribute("placeholder"),
            "Type your message here...",
            f"user-input box not showing up.",
        )

        # He types in an Arduino related question to the text box and presses enter and he see's his question populate a box under the AI message
        chat_input_text_area.send_keys(user_question_1)
        chat_input_text_area.send_keys(Keys.ENTER)
        self.wait_for_message_in_chat(user_question_1)

        # After a brief moment an ai answer appears under his echoed message
        ai_response_1 = self.browser.find_elements(By.CLASS_NAME, "chat-messages")
        self.assertIn("2", ai_response_1[-1].text, f"ai response does not show up")

        # Bill asks another question and gets another answer
        chat_input_text_area = self.browser.find_element(By.CLASS_NAME, "user-input")
        chat_input_text_area.send_keys(user_question_2)
        chat_input_text_area.send_keys(Keys.ENTER)
        self.wait_for_message_in_chat(user_question_2)

        # After a brief moment the ai answer appears under his echoed message
        ai_response_2 = self.browser.find_elements(By.CLASS_NAME, "chat-messages")
        self.assertIn("42", ai_response_2[-1].text, f"ai response not keep context")

    def test_multiple_users_can_start_chats_at_different_urls(self):
        # Bill starts a new chat session
        self.browser.get(self.live_server_url)
        chat_input_text_area = self.browser.find_element(By.CLASS_NAME, "user-input")
        chat_input_text_area.send_keys(user_question_1)
        chat_input_text_area.send_keys(Keys.ENTER)
        self.wait_for_message_in_chat(user_question_1)

        # Bill notices he gets a unique URL for his chat
        bill_chat_url = self.browser.current_url
        self.assertRegex(bill_chat_url, "/chats/.+", f"bill does not have chat URL")

        # Now a new user, Ken come tot he site.
        self.browser.quit()
        self.browser = webdriver.Firefox()

        # Ken visits the chat page - he does not see Bills chat
        self.browser.get(self.live_server_url)
        page_text = self.browser.find_element(By.TAG_NAME, "body").text
        self.assertNotIn(
            user_question_1, page_text, f"Bills chat is showing up on Kens chat"
        )
        self.assertNotIn("2", page_text)

        # Ken starts a new chat
        chat_input_text_area = self.browser.find_element(By.CLASS_NAME, "user_input")
        chat_input_text_area.send_keys(user_question_3)
        chat_input_text_area.send_keys(Keys.ENTER)
        self.wait_for_message_in_chat(user_question_3)

        # Ken gets his own unique URL
        ken_list_url = self.browser.current_url
        self.assertRegex(ken_list_url, "/chats/.+", f"ken does not have chat URL")
        self.assertNotEqual(
            ken_list_url, bill_chat_url, f"bill and ken do not have different chat URLs"
        )

        # There is no trace of Bills chat that Ken can see
        page_text = self.browser.find_element(By.TAG_NAME, "body").text
        self.assertNotIn(
            user_question_1, page_text, f"Bills chat is showing up in ken's chat page"
        )
        self.assertNotIn(
            user_question_2, page_text, f"Bills chat is showing up in ken's chat page"
        )
