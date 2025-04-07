"""
Library mode handler for focused library learning.
"""

from typing import Dict, List, Any
from .ai_mode_base import BaseModeHandler


class LibraryModeHandler(BaseModeHandler):
    """Handler for library mode - focused on learning a specific Arduino library"""

    def get_system_prompt(self) -> str:
        """
        Get the system prompt for library mode.

        Returns:
            String containing the system prompt
        """
        base_prompt = super().get_system_prompt()

        # Get library-specific information
        library_name = self.session.library_name or "an Arduino library"
        experience_level = self.session.experience_level or "beginner"

        library_specific_instructions = f"""
You are in Library Learning Mode, teaching the user about the {library_name} library.
Their experience level is {experience_level}.

Your goal is to provide structured explanations of library functions, practical examples, and guide them through learning this library step by step.

For this mode:
1. Explain core concepts and functions of the library in an accessible way
2. Provide simple examples that demonstrate key features
3. Gradually build to more complex applications
4. Reference official documentation and community resources when applicable

Use a pedagogical approach that matches their experience level.
"""
        return f"{base_prompt}\n{library_specific_instructions}"

    def process_user_message(self, message_content: str) -> str:
        """Stub implementation"""
        return message_content

    def process_ai_response(self, response_content: str) -> str:
        """Stub implementation"""
        return response_content

    def build_additional_context(self) -> List[Dict[str, str]]:
        """Stub implementation"""
        return []

    @classmethod
    def get_welcome_message(cls) -> str:
        """
        Get a welcome message for library mode.

        Returns:
            Welcome message string
        """
        return "Welcome to Library Learning Mode! What Arduino library would you like to master today?"
