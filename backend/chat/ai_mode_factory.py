"""
Factory for creating session mode handlers.
"""

import logging
from .models import Session, Conversation
from django.contrib.auth.models import User

# Import mode handlers
from .ai_mode_base import BaseModeHandler
from .ai_mode_chat import ChatModeHandler
from .ai_mode_widget import WidgetModeHandler
from .ai_mode_library import LibraryModeHandler
from .ai_mode_topic import TopicModeHandler

logger = logging.getLogger(__name__)

# Map session types to their handler classes
MODE_HANDLERS = {
    "chat": ChatModeHandler,
    "widget": WidgetModeHandler,
    "library": LibraryModeHandler,
    "topic": TopicModeHandler,
}


def get_mode_handler(session, conversation, user) -> BaseModeHandler:
    """
    Factory function to get the appropriate mode handler.

    Args:
        session: The Session object
        conversation: The Conversation object
        user: The User object

    Returns:
        A mode handler instance
    """
    session_type = session.session_type

    if session_type not in MODE_HANDLERS:
        logger.warning(
            f"Unknown session type '{session_type}', falling back to chat mode"
        )
        session_type = "chat"

    handler_class = MODE_HANDLERS[session_type]

    try:
        return handler_class(session, conversation, user)
    except Exception as e:
        logger.error(f"Error creating handler for session type '{session_type}': {e}")
        # Fall back to the base handler if there's an error
        return BaseModeHandler(session, conversation, user)


def get_welcome_message(session_type: str) -> str:
    """
    Get the welcome message for a session type.

    Args:
        session_type: The type of session

    Returns:
        Welcome message string
    """
    if session_type not in MODE_HANDLERS:
        return BaseModeHandler.get_welcome_message()

    return MODE_HANDLERS[session_type].get_welcome_message()
