"""
Base module for session type handling.
This provides common functionality for all session types.
"""

from typing import Dict, List, Any, Tuple
import logging

logger = logging.getLogger(__name__)


class BaseModeHandler:
    """Base class for all mode handlers"""

    def __init__(self, session, conversation, user):
        """
        Initialize the mode handler.

        Args:
            session: The Session object
            conversation: The Conversation object
            user: The User object
        """
        self.session = session
        self.conversation = conversation
        self.user = user

    def get_system_prompt(self) -> str:
        """
        Get the system prompt for this mode.

        Returns:
            String containing the system prompt
        """
        # Get basic session info for the prompt
        project_context = f"Project Name: {self.session.name}\n"

        if self.session.board_type:
            project_context += f"Arduino Board: {self.session.board_type}\n"

        if self.session.libraries_text:
            project_context += f"Libraries: {self.session.libraries_text}\n"

        if self.session.components_text:
            project_context += f"Components: {self.session.components_text}\n"

        if self.session.description:
            project_context += f"Project Description: {self.session.description}\n"

        # Base system prompt
        base_prompt = f"You are an Arduino coding assistant. The user is working on the following project:\n{project_context}"
        return base_prompt

    def process_user_message(self, message_content: str) -> str:
        """
        Process a user message before sending it to the AI.
        This allows each mode to add custom instructions or context.

        Args:
            message_content: The raw user message

        Returns:
            Processed message content
        """
        # Base implementation just returns the original content
        return message_content

    def process_ai_response(self, response_content: str) -> str:
        """
        Process an AI response before sending it to the user.
        This allows each mode to add custom formatting or additional information.

        Args:
            response_content: The raw AI response

        Returns:
            Processed response content
        """
        # Base implementation just returns the original content
        return response_content

    def build_additional_context(self) -> List[Dict[str, str]]:
        """
        Build additional context messages for the conversation.

        Returns:
            List of message objects with role and content
        """
        # Base implementation returns an empty list
        return []

    @classmethod
    def get_welcome_message(cls) -> str:
        """
        Get a welcome message for this mode.

        Returns:
            Welcome message string
        """
        return "Welcome! How can I help with your Arduino project today?"
