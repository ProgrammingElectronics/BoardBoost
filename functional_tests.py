from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
import time
import unittest

class NewVisitorTest(unittest.TestCase):
  
  def setUp(self):
    self.browser = webdriver.Firefox()
    
  def tearDown(self):
    self.browser.quit()
    
  def test_can_start_a_chat_and_retrieve_it_later(self):
    
    # Bill heard about boardboost and wanted to check out the homepage
    self.browser.get('http://localhost:8000')

    # He notices the page title
    self.assertIn('BoardBoost', self.browser.title)
    
    # He clicks Use BoardBoost and is taken to a signup page
    # browser.get('http://localhost:8000/sign-up')

    # He see's several options to sign up
    #1 Username and Password
    #2 Google
    #3 Facebook

    # He clicks the Captcha box on the page and presses submit

    # Bill now sees an app workspace
    # browser.get('http://localhost:8000/app')

    # A chat box says "Welcome Bill, what can I help you with?"
    inputbox = self.browser.find_element(By.ID, 'id_new_chat')
    self.assertEqual(inputbox.get_attribute('place_holder', "Welcome <Bill>, what can I help you with?"))
    
    # Bill see's a folder icon on the left hand side of the screen with the name "projects" and clicks this
    self.fail('Finish the test!')
    
    # A left hand side panel extends out

    # He clicks "New Project" and a new chat window appears

    # He asks the chat bot about an Arduino question and presses enter

    # He gets an answer
    
    # Bill asks another question and gets another answer
    
    # Bill's wife calls down and he has to walk away
    
    # When he comes back 2 days later he has been logged out
    
    # Bill logs in
    
    # He sees the previous chat he was having is loaded and ready
    
    # When he opens the left hand projects side bar, he see's the project has been given a short name that summarizes what the chat was about

if __name__ == '__main__':
  unittest.main(warnings='ignore')
