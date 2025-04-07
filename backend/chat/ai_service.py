"""
Main AI service for handling AI interactions.
"""

from django.conf import settings
from django.utils import timezone
import numpy as np
import logging
from typing import Tuple, List, Dict, Any

from .models import (
    Message,
    Conversation,
    ConversationSummary,
    MessageEmbedding,
    UserProfile,
    Session,
)
from .ai_provider_factory import get_provider
from .ai_mode_factory import get_mode_handler

logger = logging.getLogger(__name__)


def get_model_for_user(user, session_id=None, is_summary=False):
    """
    Determine which model to use based on user preferences and session settings.

    Args:
        user: The user making the request
        session_id: Optional session ID
        is_summary: Whether this is for a summary (True) or query (False)

    Returns:
        Dict with provider name and model name
    """
    # Default fallback model
    default_provider = getattr(settings, "DEFAULT_AI_PROVIDER", "openai")
    default_model = {
        "provider": default_provider,
        "model": (
            "gpt-3.5-turbo"
            if default_provider == "openai"
            else "claude-3-sonnet-20240229"
        ),
    }

    try:
        # Get user's default preferences
        profile = UserProfile.objects.get(user=user)
        user_default_provider = profile.default_provider
        user_default_model = (
            profile.default_summary_model if is_summary else profile.default_query_model
        )

        user_default = (
            {
                "provider": user_default_provider or default_provider,
                "model": user_default_model,
            }
            if user_default_model
            else default_model
        )

        # If no session specified, use user default
        if not session_id:
            return user_default

        # Check for session-specific preference
        try:
            session = Session.objects.get(id=session_id)
            session_provider = session.ai_provider
            session_model = session.summary_model if is_summary else session.query_model

            # If session has specific model set, use it
            if session_model:
                return {
                    "provider": session_provider or user_default["provider"],
                    "model": session_model,
                }

            # Otherwise use user default
            return user_default

        except Session.DoesNotExist:
            return user_default

    except UserProfile.DoesNotExist:
        return default_model


def generate_conversation_summary(conversation_id, user, message_threshold=10):
    """
    Generate or update a summary for a conversation if it has enough new messages.

    Args:
        conversation_id: ID of the conversation
        user: User requesting the summary
        message_threshold: Minimum number of new messages before generating a summary

    Returns:
        ConversationSummary or None
    """
    conversation = Conversation.objects.get(id=conversation_id)
    session_id = conversation.session_id

    # Get the appropriate model based on user and session settings
    model_info = get_model_for_user(user, session_id, is_summary=True)
    provider = get_provider(model_info["provider"])

    # Get the mode handler for this session
    mode_handler = get_mode_handler(conversation.session, conversation, user)

    # Get the latest summary
    latest_summary = (
        ConversationSummary.objects.filter(conversation=conversation)
        .order_by("-created_at")
        .first()
    )

    # Count total messages
    total_messages = Message.objects.filter(conversation=conversation).count()

    # If we have a summary, check if we have enough new messages
    if latest_summary:
        messages_since_summary = total_messages - latest_summary.message_count
        if messages_since_summary < message_threshold:
            return latest_summary

    # Get all messages or messages since last summary
    if latest_summary:
        messages = Message.objects.filter(
            conversation=conversation, timestamp__gt=latest_summary.created_at
        ).order_by("timestamp")
        conversation_text = (
            f"Previous summary: {latest_summary.content}\n\nNew messages:\n"
        )
    else:
        messages = Message.objects.filter(conversation=conversation).order_by(
            "timestamp"
        )
        conversation_text = "Conversation:\n"

    # Format the messages
    for msg in messages:
        conversation_text += f"{msg.sender}: {msg.content}\n"

    # Generate a summary using the appropriate provider
    try:
        # Get mode-specific system prompt
        system_prompt = mode_handler.get_system_prompt()

        # Add a summary instruction to the prompt
        summary_instruction = "Please summarize this conversation, focusing on important technical details, questions asked, and solutions provided. Keep the summary concise but include all important information."

        # Create message format for the provider
        messages = [
            {
                "role": "system",
                "content": f"{system_prompt}\n\n{summary_instruction}\nmodel: {model_info['model']}",
            },
            {"role": "user", "content": conversation_text},
        ]

        # Get completion from the provider
        summary_text, token_count = provider.get_completion(
            messages=messages,
            temperature=0.5,
            max_tokens=300,
        )

        # Create and save the new summary
        summary = ConversationSummary.objects.create(
            conversation=conversation,
            content=summary_text,
            message_count=total_messages,
        )

        return summary

    except Exception as e:
        logger.error(f"Error generating conversation summary: {e}")
        return latest_summary if latest_summary else None


def get_message_embedding(message_content, provider_name=None):
    """
    Get an embedding vector for a message using the specified or default provider.

    Args:
        message_content: The text content of the message
        provider_name: Provider to use for embeddings (defaults to settings)

    Returns:
        List of floats representing the embedding vector
    """
    if not provider_name:
        provider_name = getattr(settings, "DEFAULT_EMBEDDINGS_PROVIDER", "openai")

    provider = get_provider(provider_name)

    try:
        return provider.get_embedding(message_content)
    except Exception as e:
        logger.error(f"Error getting message embedding: {e}")

        # If the specified provider fails, try OpenAI as fallback
        if provider_name != "openai":
            try:
                logger.warning(f"Falling back to OpenAI for embeddings")
                fallback_provider = get_provider("openai")
                return fallback_provider.get_embedding(message_content)
            except Exception as fallback_error:
                logger.error(f"Fallback embedding also failed: {fallback_error}")

        return None


def compute_similarity(embedding1, embedding2):
    """
    Compute cosine similarity between two embedding vectors.

    Args:
        embedding1, embedding2: Lists of floats representing embedding vectors

    Returns:
        Float value representing similarity (higher is more similar)
    """
    # Convert to numpy arrays
    vec1 = np.array(embedding1)
    vec2 = np.array(embedding2)

    # Compute cosine similarity
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)

    return dot_product / (norm1 * norm2)


def find_relevant_messages(current_message, conversation_id, limit=3):
    """
    Find messages in the conversation that are most relevant to the current message.

    Args:
        current_message: Text of the current message
        conversation_id: ID of the conversation
        limit: Maximum number of relevant messages to return

    Returns:
        List of Message objects
    """
    # Get embedding for current message
    current_embedding = get_message_embedding(current_message)
    if not current_embedding:
        return []

    # Get previous messages with embeddings
    previous_messages = Message.objects.filter(
        conversation_id=conversation_id,
        sender="assistant",  # Focus on assistant responses as they contain more information
    ).order_by("-timestamp")

    # Compute similarities
    similarities = []
    for msg in previous_messages:
        # Get or create embedding
        try:
            embedding_obj = MessageEmbedding.objects.get(message=msg)
            embedding = embedding_obj.embedding
        except MessageEmbedding.DoesNotExist:
            embedding = get_message_embedding(msg.content)
            if embedding:
                MessageEmbedding.objects.create(message=msg, embedding=embedding)
            else:
                continue

        # Compute similarity
        similarity = compute_similarity(current_embedding, embedding)
        similarities.append((msg, similarity))

    # Sort by similarity and return top results
    similarities.sort(key=lambda x: x[1], reverse=True)
    return [msg for msg, _ in similarities[:limit]]


def build_context_for_message(
    current_message, conversation_id, user=None, recent_message_count=5
):
    """
    Build context for the current message using our hybrid approach.

    Args:
        current_message: Text of the current message
        conversation_id: ID of the conversation
        user: User requesting the context
        recent_message_count: Number of recent messages to include

    Returns:
        List of message objects representing the context
    """
    try:
        conversation = Conversation.objects.get(id=conversation_id)
        session = conversation.session

        # If user is not provided, try to get it from the session
        if user is None and session.user:
            user = session.user

        # Get the mode handler for this session
        mode_handler = get_mode_handler(session, conversation, user)

        # Generate summary if we have a user
        summary = None
        if user is not None:
            try:
                summary = generate_conversation_summary(conversation_id, user)
            except Exception as e:
                logger.error(f"Error generating summary: {e}")
                # Continue without a summary if there's an error

        # Get recent messages
        recent_messages = Message.objects.filter(conversation=conversation).order_by(
            "-timestamp"
        )[:recent_message_count]

        # Get semantically relevant messages
        relevant_messages = find_relevant_messages(current_message, conversation_id)

        # Build context
        context_messages = []

        # Add base system prompt using the mode handler
        context_messages.append(
            {
                "role": "system",
                "content": mode_handler.get_system_prompt(),
            }
        )

        # Add conversation summary if available
        if summary:
            context_messages.append(
                {
                    "role": "system",
                    "content": f"Summary of previous conversation: {summary.content}",
                }
            )

        # Add semantically relevant messages
        if relevant_messages:
            relevant_context = "Relevant previous exchanges:\n"
            for msg in relevant_messages:
                role = "user" if msg.sender == "user" else "assistant"
                relevant_context += f"{role}: {msg.content}\n\n"

            context_messages.append({"role": "system", "content": relevant_context})

        # Add mode-specific additional context
        mode_context = mode_handler.build_additional_context()
        context_messages.extend(mode_context)

        # Add recent messages
        for msg in reversed(list(recent_messages)):  # Oldest to newest
            if msg.content != current_message:  # Avoid duplicating current message
                role = "user" if msg.sender == "user" else "assistant"
                content = msg.content
                context_messages.append({"role": role, "content": content})

        return context_messages

    except Exception as e:
        # In case of any errors, return a fallback message
        logger.error(f"Error building context: {e}")
        return [{"role": "system", "content": "You are an Arduino coding assistant."}]


def generate_response(current_message, conversation_id, user):
    """
    Generate a response using the appropriate AI provider and mode handler.

    Returns:
        tuple: (response_text, tokens_used)
    """
    try:
        # Get the conversation to determine the session
        conversation = Conversation.objects.get(id=conversation_id)
        session = conversation.session
        session_id = session.id

        # Get the mode handler for this session
        mode_handler = get_mode_handler(session, conversation, user)

        # Process the user message according to the mode
        processed_message = mode_handler.process_user_message(current_message)

        # Determine which model/provider to use
        model_info = get_model_for_user(user, session_id, is_summary=False)
        provider_name = model_info["provider"]
        model_name = model_info["model"]

        # Get the provider instance
        provider = get_provider(provider_name)

        # Build context using our advanced context manager
        context_messages = build_context_for_message(
            current_message=processed_message,
            conversation_id=conversation_id,
            user=user,
            recent_message_count=5,
        )

        # Add model info to the first system message
        if context_messages and context_messages[0]["role"] == "system":
            context_messages[0]["content"] += f"\nmodel: {model_name}"

        # Add the current user message
        messages = context_messages + [{"role": "user", "content": processed_message}]

        # Call provider API
        completion_text, total_tokens = provider.get_completion(
            messages=messages, temperature=0.7, max_tokens=1000
        )

        # Process the AI response according to the mode
        processed_response = mode_handler.process_ai_response(completion_text)

        return processed_response, total_tokens

    except Exception as e:
        # In case of any errors, return a fallback message
        logger.error(f"Error calling AI provider: {e}")
        return (
            f"I'm sorry, I encountered an error generating a response. Please try again later.",
            0,
        )


def estimate_token_count(text):
    """
    Estimate the number of tokens in a text.
    This is a rough estimation - approximately 4 characters per token for English.
    """
    return len(text) // 4 + 1
