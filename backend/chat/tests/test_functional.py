from selenium import webdriver
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import unittest
from django.contrib.auth.models import User
from django.test import LiveServerTestCase
from django.urls import reverse
import time
import os


class NewVisitorTest(LiveServerTestCase):

    def setUp(self):
        firefox_options = FirefoxOptions()
        if os.environ.get("CI") or os.environ.get("HEADLESS"):
            firefox_options.add_argument("--headless")

        self.browser = webdriver.Firefox(options=firefox_options)
        self.browser.implicitly_wait(10)  # Wait up to 10 seconds for elements
        self.user = User.objects.create_user(
            username="bill", password="testpass", email="bill@example.com"
        )

    def tearDown(self):
        self.browser.quit()

    def wait_for_element(self, by, value, timeout=10):
        """Helper method to wait for an element to be present"""
        try:
            element = WebDriverWait(self.browser, timeout).until(
                EC.presence_of_element_located((by, value))
            )
            return element
        except TimeoutException:
            self.fail(f"Could not find element {value} after {timeout} seconds")

    def test_existing_user_can_login(self):
        # Existing user (Bill) goes to board boost website
        self.browser.get(self.live_server_url)

        # Bill notices the catchy tab title
        self.assertIn("BoardBoost", self.browser.title)

        # Bill sees he's redirected to the login page (since he's not authenticated)
        # Or he clicks on a login link if one exists
        current_url = self.browser.current_url

        # Check if we're already on the login page or need to navigate there
        if "/login/" not in current_url and "/accounts/login/" not in current_url:
            # Look for a login link/button and click it
            try:
                login_link = self.browser.find_element(By.LINK_TEXT, "Login")
                login_link.click()
            except:
                # If no login link, try to access a protected page which should redirect to login
                self.browser.get(self.live_server_url + "/")

        # Bill sees the login form
        username_input = self.wait_for_element(By.NAME, "username")
        password_input = self.wait_for_element(By.NAME, "password")

        # Bill enters his username
        username_input.send_keys("bill")

        # Bill enters his password
        password_input.send_keys("testpass")

        # Bill submits the form by clicking the login button
        login_button = self.browser.find_element(
            By.XPATH, "//button[@type='submit'] | //input[@type='submit']"
        )
        login_button.click()

        # Bill is redirected to the main chat interface
        # Wait for the page to load and check for elements that indicate successful login

        # Check that Bill is now on the main page
        self.wait_for_element(By.ID, "chat-messages")

        # Bill sees his username displayed somewhere (like in the user dropdown)
        user_info = self.wait_for_element(By.CLASS_NAME, "user-info")
        self.assertIn("bill", user_info.text.lower())

        # Bill sees the chat interface elements
        self.assertTrue(
            self.browser.find_element(By.ID, "user-input"),
            "Should find the message input field",
        )
        self.assertTrue(
            self.browser.find_element(By.ID, "send-button"),
            "Should find the send button",
        )

        # Bill sees the project sidebar
        self.assertTrue(
            self.browser.find_element(By.ID, "sidebar"), "Should find the sidebar"
        )

        # Bill sees he has tokens available
        tokens_element = self.browser.find_element(By.ID, "tokens-remaining")
        self.assertIn("tokens", tokens_element.text.lower())

    def test_new_user_cannot_access_chat_without_login(self):
        """Test that unauthenticated users are redirected to login"""
        # Anonymous user tries to access the main page
        self.browser.get(self.live_server_url)

        # They should be redirected to the login page
        # Wait a moment for any redirects
        time.sleep(1)

        current_url = self.browser.current_url
        self.assertTrue(
            "/login/" in current_url or "/accounts/login/" in current_url,
            f"Should be redirected to login page, but URL is {current_url}",
        )

        # They should see a login form
        self.assertTrue(
            self.browser.find_element(By.NAME, "username"),
            "Should find username input on login page",
        )
        self.assertTrue(
            self.browser.find_element(By.NAME, "password"),
            "Should find password input on login page",
        )

    def test_user_can_login_and_create_project(self):
        """Test the full flow of login and creating a project"""
        # Bill logs in (reuse login steps)
        self.browser.get(self.live_server_url)

        # Login
        username_input = self.wait_for_element(By.NAME, "username")
        password_input = self.wait_for_element(By.NAME, "password")
        username_input.send_keys("bill")
        password_input.send_keys("testpass")

        login_button = self.browser.find_element(
            By.XPATH, "//button[@type='submit'] | //input[@type='submit']"
        )
        login_button.click()

        # Wait for main interface to load
        self.wait_for_element(By.ID, "chat-messages")

        # Bill decides to create a new project
        # He hovers over the sidebar to expand it (if needed)
        sidebar = self.browser.find_element(By.ID, "sidebar")
        webdriver.ActionChains(self.browser).move_to_element(sidebar).perform()
        time.sleep(0.5)  # Wait for animation

        # Bill enters a project name
        project_name_input = self.wait_for_element(By.ID, "project-name")
        project_name_input.clear()
        project_name_input.send_keys("Bill's LED Blinker")

        # Bill selects a board type
        board_type_input = self.browser.find_element(By.ID, "board-type")
        board_type_input.send_keys("Arduino Uno")

        # Bill adds some components
        components_input = self.browser.find_element(By.ID, "components-text")
        components_input.send_keys("LED, 220Ω Resistor")

        # Bill saves the project
        save_button = self.browser.find_element(By.ID, "save-project")
        save_button.click()

        # Bill sees a success message (might be an alert)
        time.sleep(1)  # Wait for alert
        try:
            alert = self.browser.switch_to.alert
            alert_text = alert.text
            self.assertIn("saved successfully", alert_text.lower())
            alert.accept()
        except:
            # If not an alert, look for a success message in the page
            pass

        # Bill sees his project appears in the projects list
        time.sleep(1)  # Wait for projects list to update
        projects_list = self.browser.find_element(By.ID, "projects-list")
        self.assertIn("Bill's LED Blinker", projects_list.text)

    def test_user_can_logout(self):
        """Test that users can logout successfully"""
        # Bill logs in first
        self.browser.get(self.live_server_url)
        username_input = self.wait_for_element(By.NAME, "username")
        password_input = self.wait_for_element(By.NAME, "password")
        username_input.send_keys("bill")
        password_input.send_keys("testpass")
        login_button = self.browser.find_element(
            By.XPATH, "//button[@type='submit'] | //input[@type='submit']"
        )
        login_button.click()

        # Wait for main interface
        self.wait_for_element(By.ID, "chat-messages")

        # Bill clicks on his user avatar/info to open dropdown
        user_avatar = self.wait_for_element(By.CLASS_NAME, "user-avatar")
        user_avatar.click()

        # Bill clicks the logout link
        logout_link = self.wait_for_element(By.LINK_TEXT, "Logout")
        logout_link.click()

        # Bill is redirected to the login page
        time.sleep(1)  # Wait for redirect
        current_url = self.browser.current_url
        self.assertTrue(
            "/login/" in current_url or "/accounts/login/" in current_url,
            "Should be redirected to login page after logout",
        )


if __name__ == "__main__":
    unittest.main(warnings="ignore")
