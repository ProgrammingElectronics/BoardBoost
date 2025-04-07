from typing import Tuple, List, Dict, Any
from .ai_provider_interface import AIProvider
import logging
import anthropic
from django.conf import settings

logger = logging.getLogger(__name__)


class AnthropicProvider(AIProvider):
    """Implementation of AIProvider for Anthropic (Claude) API"""

    MODEL_CHOICES = [
        ("claude-3-opus-20240229", "Claude 3 Opus"),
        ("claude-3-sonnet-20240229", "Claude 3 Sonnet"),
        ("claude-3-haiku-20240307", "Claude 3 Haiku"),
        ("claude-3-5-sonnet-20240620", "Claude 3.5 Sonnet"),
        ("claude-3-7-sonnet-20250219", "Claude 3.7 Sonnet"),
    ]

    def __init__(self, api_key=None):
        """
        Initialize the Anthropic provider with an API key.
        Falls back to settings.ANTHROPIC_API_KEY if none provided.
        """
        self.api_key = api_key or settings.ANTHROPIC_API_KEY
        self.client = anthropic.Anthropic(api_key=self.api_key)

    def get_completion(
        self, messages: List[Dict], temperature: float = 0.7, max_tokens: int = 1000
    ) -> Tuple[str, int]:
        """
        Get a completion from the Anthropic API.

        Args:
            messages: List of message objects with role and content
            temperature: Controls randomness (0 to 1)
            max_tokens: Maximum number of tokens to generate

        Returns:
            Tuple of (completion_text, tokens_used)
        """
        try:
            # Extract model name from the first system message, if available
            model = "claude-3-sonnet-20240229"  # Default
            system_message = ""

            # Convert OpenAI message format to Anthropic format
            anthropic_messages = []

            for message in messages:
                role = message.get("role", "")
                content = message.get("content", "")

                if role == "system":
                    # Anthropic handles system messages differently
                    if "model:" in content:
                        model_line = [
                            line
                            for line in content.split("\n")
                            if "model:" in line.lower()
                        ]
                        if model_line:
                            model = model_line[0].split("model:")[1].strip()
                            # Remove this line from the message
                            content = content.replace(model_line[0], "").strip()
                    system_message = content
                elif role == "user":
                    anthropic_messages.append({"role": "user", "content": content})
                elif role == "assistant":
                    anthropic_messages.append({"role": "assistant", "content": content})

            # Make the API call
            response = self.client.messages.create(
                model=model,
                system=system_message,
                messages=anthropic_messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            # Calculate token usage
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            total_tokens = input_tokens + output_tokens

            return response.content[0].text, total_tokens

        except Exception as e:
            logger.error(f"Error in Anthropic completion: {e}")
            raise

    def get_embedding(self, text: str) -> List[float]:
        """
        Get an embedding vector.

        Note: Anthropic didn't have a native embeddings API at the time of writing,
        so this implementation could use a third-party embeddings API or a placeholder.

        Args:
            text: The text to embed

        Returns:
            List of floats representing the embedding vector
        """
        # Since Anthropic doesn't have embeddings API at the time of writing,
        # we'll need to either use a third-party embeddings API or implement a fallback
        try:
            # For now, we'll raise an exception to indicate this is not implemented
            # In a real implementation, you might use OpenAI's embeddings API as a fallback
            raise NotImplementedError(
                "Embedding functionality not available for Anthropic provider"
            )
        except Exception as e:
            logger.error(f"Error getting embedding: {e}")
            raise

    @classmethod
    def get_available_models(cls) -> List[Tuple[str, str]]:
        """
        Get available models from Anthropic.

        Returns:
            List of tuples (model_id, model_name)
        """
        return cls.MODEL_CHOICES
