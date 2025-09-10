from django.test import LiveServerTestCase
from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.common.exceptions import WebDriverException
import time

MAX_WAIT = 10


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
                message_text = [msg.text for msg in chat_messages]

                self.assertIn(message_txt, message_text)
                return
            except (AssertionError, WebDriverException) as e:
                if time.time() - start_time > MAX_WAIT:
                    raise e
                time.sleep(0.5)

    def test_can_start_a_chat_and_retrieve_it_later(self):

        # Bill heard about boardboost and wanted to check out the homepage
        self.browser.get(self.live_server_url)

        # He notices the page title
        self.assertIn("BoardBoost", self.browser.title)

        # He clicks Use BoardBoost and is taken to a signup page

        # He see's several options to sign up
        # 1 Username and Password
        # 2 Google
        # 3 Facebook

        # He clicks the Captcha box on the page and presses submit

        # Bill now sees an app workspace

        # A chat box says 'Welcome Bill, what can I help you with?'
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
        user_question_1 = (
            "Respond with *only* YES or NO -> can you help me with Arduino code?"
        )
        chat_input_text_area.send_keys(user_question_1)
        chat_input_text_area.send_keys(Keys.ENTER)
        self.wait_for_message_in_chat(user_question_1)

        # After a brief moment an ai answer appears under his echoed message
        ai_response = self.browser.find_elements(By.CLASS_NAME, "chat-messages")
        self.assertIn(ai_response[-1].text, "YES", f"ai response does not show up")

        # Bill asks another question and gets another answer
        self.fail("Finish the test!")

        # Bill's wife calls down and he has to walk away

        # When he comes back 2 days later he has been logged out

        # Bill logs in

        # He sees the previous chat he was having is loaded and ready

        # When he opens the left hand projects side bar, he see's the project has been given a short name that summarizes what the chat was about
