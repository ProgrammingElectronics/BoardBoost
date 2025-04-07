"""
Chat mode handler for default Arduino coding assistance.
"""

from typing import Dict, List, Any
from .ai_mode_base import BaseModeHandler


class ChatModeHandler(BaseModeHandler):
    """Handler for standard chat mode - general Arduino assistance"""

    def get_system_prompt(self) -> str:
        """
        Get the system prompt for chat mode.

        Returns:
            String containing the system prompt
        """
        base_prompt = super().get_system_prompt()

        chat_specific_instructions = """
Respond to the user's Arduino programming questions with clear explanations and helpful code examples when appropriate. 
Be conversational but focused on providing technical accuracy and educational value.
When providing code examples:
1. Ensure the code is complete, well-commented, and follows best practices
2. Explain key concepts and functions used in the code
3. Consider the specified board and components when applicable

Feel free to ask clarifying questions if the user's request is ambiguous.
"""
        return f"{base_prompt}\n{chat_specific_instructions}"

    def process_user_message(self, message_content: str) -> str:
        """
        Process a user message for chat mode.

        Args:
            message_content: The raw user message

        Returns:
            Processed message content
        """
        # In chat mode, we don't modify the user's message
        return message_content

    def process_ai_response(self, response_content: str) -> str:
        """
        Process an AI response for chat mode.

        Args:
            response_content: The raw AI response

        Returns:
            Processed response content
        """
        # In chat mode, we don't modify the AI's response
        return response_content

    def build_additional_context(self) -> List[Dict[str, str]]:
        """
        Build additional context for chat mode.

        Returns:
            List of message objects with role and content
        """
        # No additional context needed for chat mode
        return []

    @classmethod
    def get_welcome_message(cls) -> str:
        """
        Get a welcome message for chat mode.

        Returns:
            Welcome message string
        """
        return "Welcome to Chat Mode! Ask me anything about Arduino programming and I'll help you out."
