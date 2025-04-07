from openai import OpenAI
from django.conf import settings
from typing import Tuple, List, Dict, Any
from .ai_provider_interface import AIProvider
import logging

logger = logging.getLogger(__name__)


class OpenAIProvider(AIProvider):
    """Implementation of AIProvider for OpenAI API"""

    MODEL_CHOICES = [
        ("gpt-3.5-turbo", "GPT-3.5 Turbo"),
        ("gpt-4", "GPT-4"),
        ("gpt-4o", "GPT-4o"),
        ("gpt-4o-mini", "GPT-4o Mini"),
    ]

    EMBEDDING_MODEL = "text-embedding-ada-002"

    def __init__(self, api_key=None):
        """
        Initialize the OpenAI provider with an API key.
        Falls back to settings.OPENAI_API_KEY if none provided.
        """
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key)

    def get_completion(
        self, messages: List[Dict], temperature: float = 0.7, max_tokens: int = 1000
    ) -> Tuple[str, int]:
        """
        Get a completion from the OpenAI API.

        Args:
            messages: List of message objects with role and content
            temperature: Controls randomness (0 to 1)
            max_tokens: Maximum number of tokens to generate

        Returns:
            Tuple of (completion_text, tokens_used)
        """
        try:
            # Extract model name from the first system message, if available
            model = "gpt-3.5-turbo"  # Default
            for message in messages:
                if message.get("role") == "system" and "model:" in message.get(
                    "content", ""
                ):
                    content = message["content"]
                    model_line = [
                        line for line in content.split("\n") if "model:" in line.lower()
                    ]
                    if model_line:
                        model = model_line[0].split("model:")[1].strip()
                        # Remove this line from the message
                        message["content"] = content.replace(model_line[0], "").strip()
                    break

            completion = self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            # Calculate token usage
            prompt_tokens = completion.usage.prompt_tokens
            completion_tokens = completion.usage.completion_tokens
            total_tokens = prompt_tokens + completion_tokens

            return completion.choices[0].message.content, total_tokens

        except Exception as e:
            logger.error(f"Error in OpenAI completion: {e}")
            raise

    def get_embedding(self, text: str) -> List[float]:
        """
        Get an embedding vector from OpenAI.

        Args:
            text: The text to embed

        Returns:
            List of floats representing the embedding vector
        """
        try:
            response = self.client.embeddings.create(
                input=text, model=self.EMBEDDING_MODEL
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Error getting embedding: {e}")
            raise

    @classmethod
    def get_available_models(cls) -> List[Tuple[str, str]]:
        """
        Get available models from OpenAI.

        Returns:
            List of tuples (model_id, model_name)
        """
        return cls.MODEL_CHOICES
