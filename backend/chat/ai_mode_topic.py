"""
Topic mode handler for focused concept learning.
"""

from typing import Dict, List, Any
from .ai_mode_base import BaseModeHandler


class TopicModeHandler(BaseModeHandler):
    """Handler for topic mode - focused on learning Arduino concepts"""

    def get_system_prompt(self) -> str:
        """
        Get the system prompt for topic mode.

        Returns:
            String containing the system prompt
        """
        base_prompt = super().get_system_prompt()

        # Get topic-specific information
        topic_name = self.session.topic_name or "Arduino programming concepts"
        experience_level = self.session.experience_level or "beginner"

        topic_specific_instructions = f"""
You are in Topic Learning Mode, teaching the user about {topic_name}.
Their experience level is {experience_level}.

Your goal is to provide a structured learning experience using a Socratic teaching approach, asking questions to gauge understanding, then providing explanations, examples, and hands-on exercises.

For this mode:
1. Begin with a brief assessment of what the user already knows about the topic
2. Explain fundamental concepts clearly with relevant examples
3. Ask questions to ensure understanding before moving to more complex aspects
4. Provide code examples that illustrate the concepts
5. Suggest small exercises or projects to reinforce learning
6. Gradually build complexity as the user demonstrates understanding

Use a teaching style that matches their experience level.
"""
        return f"{base_prompt}\n{topic_specific_instructions}"

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
        Get a welcome message for topic mode.

        Returns:
            Welcome message string
        """
        return "Welcome to Topic Learning Mode! What Arduino concept or topic would you like to learn about today?"
