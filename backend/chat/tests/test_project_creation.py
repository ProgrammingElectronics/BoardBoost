from django.urls import resolve, reverse
from django.test import TestCase
from chat.views import index
from django.contrib.auth.models import User

from selenium import webdriver
import unittest
from django.contrib.auth.models import User
from django.test import LiveServerTestCase


from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from chat.models import Project, UserProfile


class ProjectCreationTestCase(TestCase):
    """Test case for project creation functionality"""

    def setUp(self):
        """Set up test client and create a test user"""
        self.client = APIClient()

        # Create a test user
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpassword123"
        )

        # UserProfile should be created automatically via signal
        self.user_profile = self.user.userprofile

        # Authenticate the client
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        """Clean up after tests"""
        self.client.force_authenticate(user=None)

    def test_create_project_success(self):
        """Test that an authenticated user can create a new project"""
        # Project data
        project_data = {
            "name": "Test Arduino Project",
            "board_type": "Arduino Uno",
            "components_text": "LED, Resistor, Breadboard",
            "libraries_text": "FastLED, Servo",
            "description": "A test project for unit testing",
        }

        # Send POST request to create project
        response = self.client.post("/api/projects/", project_data, format="json")

        # Assert successful creation
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify response data
        self.assertEqual(response.data["name"], project_data["name"])
        self.assertEqual(response.data["board_type"], project_data["board_type"])
        self.assertEqual(
            response.data["components_text"], project_data["components_text"]
        )
        self.assertEqual(
            response.data["libraries_text"], project_data["libraries_text"]
        )

        # Verify project was created in database
        project = Project.objects.get(id=response.data["id"])
        self.assertEqual(project.name, project_data["name"])
        self.assertEqual(project.user, self.user)
        self.assertEqual(project.board_type, project_data["board_type"])

    def test_create_project_minimal_data(self):
        """Test creating a project with only required fields"""
        project_data = {"name": "Minimal Project"}

        response = self.client.post("/api/projects/", project_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], project_data["name"])

        # Verify optional fields are empty/default
        project = Project.objects.get(id=response.data["id"])
        self.assertEqual(project.board_type, "")
        self.assertEqual(project.components_text, "")
        self.assertEqual(project.libraries_text, "")

    def test_create_project_with_model_preferences(self):
        """Test creating a project with specific model preferences"""
        project_data = {
            "name": "AI Model Test Project",
            "query_model": "gpt-4",
            "summary_model": "gpt-3.5-turbo",
            "history_window_size": 20,
        }

        response = self.client.post("/api/projects/", project_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        project = Project.objects.get(id=response.data["id"])
        self.assertEqual(project.query_model, "gpt-4")
        self.assertEqual(project.summary_model, "gpt-3.5-turbo")
        self.assertEqual(project.history_window_size, 20)

    def test_create_project_without_authentication(self):
        """Test that unauthenticated users cannot create projects"""
        # Remove authentication
        self.client.force_authenticate(user=None)

        project_data = {"name": "Unauthorized Project"}

        response = self.client.post("/api/projects/", project_data, format="json")

        # Should return 401 Unauthorized or 403 Forbidden
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_create_project_empty_name(self):
        """Test that project creation fails without a name"""
        project_data = {"name": ""}

        response = self.client.post("/api/projects/", project_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    def test_create_project_duplicate_name_allowed(self):
        """Test that users can create multiple projects with the same name"""
        project_data = {"name": "Duplicate Name Project"}

        # Create first project
        response1 = self.client.post("/api/projects/", project_data, format="json")
        self.assertEqual(response1.status_code, status.HTTP_201_CREATED)

        # Create second project with same name
        response2 = self.client.post("/api/projects/", project_data, format="json")
        self.assertEqual(response2.status_code, status.HTTP_201_CREATED)

        # Verify both projects exist
        projects = Project.objects.filter(name="Duplicate Name Project", user=self.user)
        self.assertEqual(projects.count(), 2)

    def test_create_project_long_description(self):
        """Test creating a project with a long description"""
        long_description = ("This is a very detailed Arduino project. " * 50).rstrip()

        project_data = {
            "name": "Long Description Project",
            "description": long_description,
        }

        response = self.client.post("/api/projects/", project_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        project = Project.objects.get(id=response.data["id"])
        self.assertEqual(project.description, long_description)

    def test_project_user_association(self):
        """Test that created projects are properly associated with the user"""
        project_data = {"name": "User Association Test"}

        response = self.client.post("/api/projects/", project_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify the project is associated with the correct user
        project = Project.objects.get(id=response.data["id"])
        self.assertEqual(project.user, self.user)

        # Verify the project appears in user's projects
        user_projects = Project.objects.filter(user=self.user)
        self.assertIn(project, user_projects)

    def test_create_project_invalid_model_choice(self):
        """Test that invalid model choices are handled"""
        project_data = {"name": "Invalid Model Project", "query_model": "invalid-model"}

        response = self.client.post("/api/projects/", project_data, format="json")

        # Should return 400 Bad Request for invalid choice
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("query_model", response.data)


class IndexPageTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")

    def test_root_URL_resolves_to_main_chat_view(self):
        found = resolve("/")
        self.assertEqual(found.func, index)

    def test_chat_returns_correct_html(self):

        self.client.login(username="testuser", password="testpass")

        response = self.client.get("/")

        html = response.content.decode("utf8")
        self.assertIn("<title>BoardBoost - Let's build!</title>", html)
