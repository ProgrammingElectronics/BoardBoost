"""
Widget mode handler for guiding users through project creation.
"""

from typing import Dict, List, Any
from .ai_mode_base import BaseModeHandler


class WidgetModeHandler(BaseModeHandler):
    """Handler for widget mode - focused project creation"""

    def get_system_prompt(self) -> str:
        """
        Get the system prompt for widget mode.

        Returns:
            String containing the system prompt
        """
        base_prompt = super().get_system_prompt()

        # Get widget-specific information
        target_platform = (
            self.session.target_platform or self.session.board_type or "Arduino"
        )
        complexity_level = self.session.complexity_level or "intermediate"

        widget_specific_instructions = f"""
You are in Widget Mode, helping the user create a complete Arduino project.

Target platform: {target_platform}
Complexity level: {complexity_level}

Your goal is to guide the user through the process of defining requirements, selecting components, and implementing a fully functional project. Be proactive and structured in your approach.

For this mode:
1. If the user hasn't defined a clear project goal, help them narrow down what they want to build 
2. Break down the project into manageable steps
3. Provide complete code examples with detailed comments
4. Include circuit diagrams described in text (e.g., "Connect pin 13 to the positive leg of the LED, then connect...")
5. Suggest testing procedures for each component
6. Anticipate common issues and provide troubleshooting tips

Always provide complete, working code that the user can directly upload to their board.
Use a step-by-step approach, making sure the user understands each part before moving on.
"""
        return f"{base_prompt}\n{widget_specific_instructions}"

    def process_user_message(self, message_content: str) -> str:
        """
        Process a user message for widget mode.

        Args:
            message_content: The raw user message

        Returns:
            Processed message content
        """
        # For first message, if it's very short, add some context
        from .models import Message

        message_count = Message.objects.filter(conversation=self.conversation).count()

        if message_count == 0 and len(message_content.split()) < 10:
            # This appears to be the first message and it's short
            return f"{message_content}\n\nPlease help me create a complete project. I'd like you to guide me through the entire process step by step."

        return message_content

    def process_ai_response(self, response_content: str) -> str:
        """
        Process an AI response for widget mode.

        Args:
            response_content: The raw AI response

        Returns:
            Processed response content
        """
        # Check if this is the first response
        from .models import Message

        assistant_message_count = Message.objects.filter(
            conversation=self.conversation, sender="assistant"
        ).count()

        if assistant_message_count == 0:
            # This is the first response, add a helpful footer
            footer = "\n\n---\n*We're in Widget Mode, focused on creating a complete project. I'll guide you step-by-step through the entire process, from requirements to testing. Let me know if you want to adjust the complexity level or focus on specific aspects.*"
            return response_content + footer

        return response_content

    def build_additional_context(self) -> List[Dict[str, str]]:
        """
        Build additional context for widget mode.

        Returns:
            List of message objects with role and content
        """
        # For widget mode, we include a sample project creation flow
        return [
            {
                "role": "system",
                "content": """
Example of a good project creation flow:
1. Define project requirements and goals
2. Identify necessary components and libraries
3. Plan the code structure and functionality
4. Implement the circuit design
5. Write the core code
6. Test and debug
7. Add advanced features
8. Final testing and documentation

Provide this level of structured guidance to the user. Be conversational but focused on completing a full working project.
""",
            }
        ]

    @classmethod
    def get_welcome_message(cls) -> str:
        """
        Get a welcome message for widget mode.

        Returns:
            Welcome message string
        """
        return "Welcome to Widget Mode! I'll help you create a complete Arduino project from start to finish. What would you like to build today?"
