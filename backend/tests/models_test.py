from django.test import TestCase
import unittest
from django.contrib.auth.models import User
from chat.models import Project, UserProfile


class TestProjectModels(TestCase):

    def setUp(self):
        # Create a test user
        self.user = User.objects.create_user(
            username="testuser", email="test@test.com", password="testpassword"
        )

        self.user_profile = UserProfile.objects.get(user=self.user)

    def test_user_profile_str_method(self):
        expected_str = "testuser's profile"
        self.assertEqual(str(self.user_profile), expected_str)


if __name__ == "__main__":
    unittest.main()
