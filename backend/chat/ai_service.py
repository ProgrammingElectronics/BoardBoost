from openai import OpenAI
from django.conf import settings
from django.utils import timezone
import numpy as np
from .models import Message, Conversation, ConversationSummary, MessageEmbedding

client = OpenAI(api_key=settings.OPENAI_API_KEY)

from openai import OpenAI
from django.conf import settings
from django.utils import timezone
import numpy as np
from .models import Message, Conversation, ConversationSummary, MessageEmbedding, UserProfile, Project

client = OpenAI(api_key=settings.OPENAI_API_KEY)

def get_model_for_user(user, project_id=None, is_summary=False):
    """
    Determine which model to use based on user preferences and project settings.
    
    Args:
        user: The user making the request
        project_id: Optional project ID
        is_summary: Whether this is for a summary (True) or query (False)
        
    Returns:
        String representing the model name to use
    """
    # Default fallback model
    default_model = "gpt-3.5-turbo"
    
    try:
        # Get user's default preferences
        profile = UserProfile.objects.get(user=user)
        user_default = profile.default_summary_model if is_summary else profile.default_query_model
        
        # If no project specified, use user default
        if not project_id:
            return user_default or default_model
        
        # Check for project-specific preference
        try:
            project = Project.objects.get(id=project_id)
            project_model = project.summary_model if is_summary else project.query_model
            
            # If project has a specific model set, use it
            if project_model:
                return project_model
            
            # Otherwise use user default
            return user_default or default_model
            
        except Project.DoesNotExist:
            return user_default or default_model
            
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
    project_id = conversation.project_id

    # Get the appropriate model based on user and project settings
    model = get_model_for_user(user, project_id, is_summary=True)

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

    # Generate a summary using OpenAI
    try:
        summary_prompt = "You are an Arduino coding assistant. Summarize this conversation about Arduino programming and related topics, focusing on technical details, questions asked, and solutions provided. Keep the summary concise but include all important technical information."

        response = client.chat.completions.create(
            model=model,  # Use the model determined by user/project settings
            messages=[
                {"role": "system", "content": summary_prompt},
                {"role": "user", "content": conversation_text},
            ],
            temperature=0.5,  # TODO Expose this to end user
            max_tokens=300,  # TODO Expose this to end user
        )

        summary_text = response.choices[0].message.content

        # Create and save the new summary
        summary = ConversationSummary.objects.create(
            conversation=conversation,
            content=summary_text,
            message_count=total_messages,
        )

        return summary

    except Exception as e:
        print(f"Error generating conversation summary: {e}")
        return latest_summary if latest_summary else None


def get_message_embedding(message_content):
    """
    Get an embedding vector for a message.

    Args:
        message_content: The text content of the message

    Returns:
        List of floats representing the embedding vector
    """
    try:
        response = client.embeddings.create(
            input=message_content,
            model="text-embedding-ada-002",  # TODO Expose this to end user
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Error getting message embedding: {e}")
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


def build_context_for_message(current_message, conversation_id, user=None, recent_message_count=5):
    """
    Build context for the current message using our hybrid approach.

    Args:
        current_message: Text of the current message
        conversation_id: ID of the conversation
        recent_message_count: Number of recent messages to include

    Returns:
        List of OpenAI message objects representing the context
    """
    try:
        conversation = Conversation.objects.get(id=conversation_id)
        
        # If user is not provided, try to get it from the project
        if user is None and hasattr(conversation.project, 'user') and conversation.project.user:
            user = conversation.project.user
            
        # Generate summary if we have a user
        summary = None
        if user is not None:
            try:
                summary = generate_conversation_summary(conversation_id, user)
            except Exception as e:
                print(f"Error generating summary: {e}")
                # Continue without a summary if there's an error
        
        # Get conversation summary
        summary = generate_conversation_summary(conversation_id, user) if user else None
        # Get recent messages
        recent_messages = Message.objects.filter(conversation=conversation).order_by(
            "-timestamp"
        )[:recent_message_count]

        # Get semantically relevant messages
        relevant_messages = find_relevant_messages(current_message, conversation_id)

        # Build context
        context_messages = []

        # Add project information
        project = conversation.project
        project_context = f"Project Name: {project.name}\n"

        if project.board_type:
            project_context += f"Arduino Board: {project.board_type}\n"

        if project.libraries_text:
            project_context += f"Libraries: {project.libraries_text}\n"

        if project.components_text:
            project_context += f"Components: {project.components_text}\n"

        if project.description:
            project_context += f"Project Description: {project.description}\n"

        context_messages.append(
            {
                "role": "system",
                "content": f"You are an Arduino coding assistant. The user is working on the following project:\n{project_context}",
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

        # Add recent messages
        for msg in reversed(list(recent_messages)):  # Oldest to newest
            if msg.content != current_message:  # Avoid duplicating current message
                role = "user" if msg.sender == "user" else "assistant"
                context_messages.append({"role": role, "content": msg.content})

        return context_messages

    except Exception as e:
        # In case of any errors, return a fallback message
        print(f"Error calling OpenAI API: {e}")
        return f"I'm sorry, I encountered an error generating a summary. Please try again later.", 0


## Generate response with enhanced context management
def generate_response(current_message, conversation_id, user):
    """
    Generate a response using OpenAI's API with enhanced context management.
    
    Returns:
        tuple: (response_text, tokens_used)
    """
    try:
        # Get the conversation to determine the project
        conversation = Conversation.objects.get(id=conversation_id)
        project_id = conversation.project_id
        
        # Determine which model to use
        model = get_model_for_user(user, project_id, is_summary=False)
        
        # Build context using our advanced context manager - pass the user
        context_messages = build_context_for_message(
            current_message=current_message, 
            conversation_id=conversation_id, 
            user=user,
            recent_message_count=5
        )
        
        # Add the current user message
        messages = context_messages + [
            {"role": "user", "content": current_message}
        ]
        
        # Call OpenAI API with the determined model
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=1000
        )
        
        # Extract token usage
        prompt_tokens = completion.usage.prompt_tokens
        completion_tokens = completion.usage.completion_tokens
        total_tokens = prompt_tokens + completion_tokens
        
        return completion.choices[0].message.content, total_tokens
    
    except Exception as e:
        # In case of any errors, return a fallback message
        print(f"Error calling OpenAI API: {e}")
        return f"I'm sorry, I encountered an error generating a response. Please try again later.", 0


def estimate_token_count(text):
    """
    Estimate the number of tokens in a text.
    This is a rough estimation - approximately 4 characters per token for English.
    """
    return len(text) // 4 + 1
