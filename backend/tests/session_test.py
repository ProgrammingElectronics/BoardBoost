from django.test import TestCase
from django.contrib.auth.models import User
from chat.models import (
    Session,
    ChatSession,
    WidgetSession,
    LibrarySession,
    TopicSession,
    Conversation,
)
from django.utils import timezone
from django.db import IntegrityError


class SessionModelTest(TestCase):
    def setUp(self):
        # Create a test user
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpassword123"
        )

        # Create a base session
        self.base_session = Session.objects.create(
            name="Test Session",
            user=self.user,
            session_type="chat",
            board_type="Arduino Uno",
            components_text="LED, Resistor 220Ω",
            libraries_text="Servo.h",
            description="Test session description",
            history_window_size=15,
        )

    def test_session_creation(self):
        """Test that a basic session can be created"""
        self.assertEqual(self.base_session.name, "Test Session")
        self.assertEqual(self.base_session.user, self.user)
        self.assertEqual(self.base_session.session_type, "chat")
        self.assertEqual(self.base_session.board_type, "Arduino Uno")
        self.assertEqual(self.base_session.components_text, "LED, Resistor 220Ω")
        self.assertEqual(self.base_session.libraries_text, "Servo.h")
        self.assertEqual(self.base_session.description, "Test session description")
        self.assertEqual(self.base_session.history_window_size, 15)

        # Test that the timestamps are created
        self.assertIsNotNone(self.base_session.created_at)
        self.assertIsNotNone(self.base_session.updated_at)

    def test_session_string_representation(self):
        """Test the string representation of a session"""
        expected_string = f"Test Session (Chat Mode)"
        self.assertEqual(str(self.base_session), expected_string)

    def test_chat_session_creation(self):
        """Test creating a chat session"""
        chat_session = ChatSession.objects.create(session=self.base_session)

        # Test that the session was created
        self.assertIsNotNone(chat_session)
        self.assertEqual(chat_session.session, self.base_session)

        # Test string representation
        self.assertEqual(str(chat_session), "Chat: Test Session")

        # Test that get_specific_session method returns the chat session
        specific_session = self.base_session.get_specific_session()
        self.assertEqual(specific_session, chat_session)

    def test_widget_session_creation(self):
        """Test creating a widget session"""
        # First, update the base session type
        self.base_session.session_type = "widget"
        self.base_session.save()

        widget_session = WidgetSession.objects.create(
            session=self.base_session,
            target_platform="ESP32",
            complexity_level="intermediate",
        )

        # Test that the session was created
        self.assertIsNotNone(widget_session)
        self.assertEqual(widget_session.session, self.base_session)
        self.assertEqual(widget_session.target_platform, "ESP32")
        self.assertEqual(widget_session.complexity_level, "intermediate")

        # Test string representation
        self.assertEqual(str(widget_session), "Widget: Test Session")

        # Test that get_specific_session method returns the widget session
        specific_session = self.base_session.get_specific_session()
        self.assertEqual(specific_session, widget_session)

    def test_library_session_creation(self):
        """Test creating a library session"""
        # First, update the base session type
        self.base_session.session_type = "library"
        self.base_session.save()

        library_session = LibrarySession.objects.create(
            session=self.base_session,
            library_name="FastLED",
            experience_level="beginner",
        )

        # Test that the session was created
        self.assertIsNotNone(library_session)
        self.assertEqual(library_session.session, self.base_session)
        self.assertEqual(library_session.library_name, "FastLED")
        self.assertEqual(library_session.experience_level, "beginner")

        # Test string representation
        self.assertEqual(str(library_session), "Library: Test Session - FastLED")

        # Test that get_specific_session method returns the library session
        specific_session = self.base_session.get_specific_session()
        self.assertEqual(specific_session, library_session)

    def test_topic_session_creation(self):
        """Test creating a topic session"""
        # First, update the base session type
        self.base_session.session_type = "topic"
        self.base_session.save()

        topic_session = TopicSession.objects.create(
            session=self.base_session,
            topic_name="PWM and Motor Control",
            experience_level="intermediate",
        )

        # Test that the session was created
        self.assertIsNotNone(topic_session)
        self.assertEqual(topic_session.session, self.base_session)
        self.assertEqual(topic_session.topic_name, "PWM and Motor Control")
        self.assertEqual(topic_session.experience_level, "intermediate")

        # Test string representation
        self.assertEqual(
            str(topic_session), "Topic: Test Session - PWM and Motor Control"
        )

        # Test that get_specific_session method returns the topic session
        specific_session = self.base_session.get_specific_session()
        self.assertEqual(specific_session, topic_session)

    def test_duplicate_session_prevention(self):
        """Test that we can't create two different session types for the same base session"""
        # Create a chat session
        chat_session = ChatSession.objects.create(session=self.base_session)

        # Try to create a widget session for the same base session
        with self.assertRaises(IntegrityError):
            widget_session = WidgetSession.objects.create(
                session=self.base_session, target_platform="ESP32"
            )

    def test_conversation_relationship(self):
        """Test creating a conversation linked to a session"""
        conversation = Conversation.objects.create(session=self.base_session)

        # Test that the conversation was created and linked to the session
        self.assertIsNotNone(conversation)
        self.assertEqual(conversation.session, self.base_session)

        # Test string representation
        self.assertIn("Conversation for Test Session at", str(conversation))

    def test_user_session_relationship(self):
        """Test the relationship between user and sessions"""
        # Create additional sessions for the same user
        Session.objects.create(
            name="Another Session", user=self.user, session_type="widget"
        )

        Session.objects.create(
            name="Third Session", user=self.user, session_type="library"
        )

        # Get all sessions for the user
        user_sessions = self.user.sessions.all()

        # Test that the user has 3 sessions
        self.assertEqual(user_sessions.count(), 3)

        # Test that the first session is the one we created in setUp
        self.assertEqual(user_sessions.first(), self.base_session)

    def test_session_filtering_by_type(self):
        """Test filtering sessions by type"""
        # Create sessions of different types
        widget_base = Session.objects.create(
            name="Widget Session", user=self.user, session_type="widget"
        )
        WidgetSession.objects.create(
            session=widget_base, target_platform="Arduino Mega"
        )

        library_base = Session.objects.create(
            name="Library Session", user=self.user, session_type="library"
        )
        LibrarySession.objects.create(
            session=library_base, library_name="Adafruit NeoPixel"
        )

        # Filter sessions by type
        chat_sessions = Session.objects.filter(session_type="chat")
        widget_sessions = Session.objects.filter(session_type="widget")
        library_sessions = Session.objects.filter(session_type="library")

        # Test the counts
        self.assertEqual(chat_sessions.count(), 1)
        self.assertEqual(widget_sessions.count(), 1)
        self.assertEqual(library_sessions.count(), 1)

        # Test that we can access the specific session types
        self.assertEqual(
            chat_sessions[0].chatsession,
            ChatSession.objects.get(session=self.base_session),
        )
        self.assertEqual(
            widget_sessions[0].widgetsession,
            WidgetSession.objects.get(session=widget_base),
        )
        self.assertEqual(
            library_sessions[0].librarysession,
            LibrarySession.objects.get(session=library_base),
        )
