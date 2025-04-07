from abc import ABC, abstractmethod
from typing import Tuple, List, Dict, Any


class AIProvider(ABC):
    """
    Abstract base class for AI providers.
    All AI providers must implement these methods.
    """

    @abstractmethod
    def get_completion(
        self, messages: List[Dict], temperature: float = 0.7, max_tokens: int = 1000
    ) -> Tuple[str, int]:
        """
        Get a completion from the AI model.

        Args:
            messages: List of message objects with role and content
            temperature: Controls randomness (0 to 1)
            max_tokens: Maximum number of tokens to generate

        Returns:
            Tuple of (completion_text, tokens_used)
        """
        pass

    @abstractmethod
    def get_embedding(self, text: str) -> List[float]:
        """
        Get an embedding vector for a text.

        Args:
            text: The text to embed

        Returns:
            List of floats representing the embedding vector
        """
        pass

    @classmethod
    @abstractmethod
    def get_available_models(cls) -> List[Tuple[str, str]]:
        """
        Get available models from this provider.

        Returns:
            List of tuples (model_id, model_name)
        """
        pass
