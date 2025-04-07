from typing import Dict, Any
from django.conf import settings
import logging

from .ai_provider_interface import AIProvider
from .ai_provider_openai import OpenAIProvider
from .ai_provider_anthropic import AnthropicProvider

logger = logging.getLogger(__name__)

# Map provider names to their implementation classes
PROVIDER_MAP = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
}


def get_provider(provider_name: str = None, **kwargs) -> AIProvider:
    """
    Factory function to get an AI provider instance.

    Args:
        provider_name: Name of the provider to use (e.g., "openai", "anthropic")
        **kwargs: Additional provider-specific arguments

    Returns:
        An instance of AIProvider
    """
    # If no provider specified, use the default from settings
    if not provider_name:
        provider_name = getattr(settings, "DEFAULT_AI_PROVIDER", "openai")

    provider_name = provider_name.lower()

    if provider_name not in PROVIDER_MAP:
        logger.warning(f"Unknown provider '{provider_name}', falling back to OpenAI")
        provider_name = "openai"

    provider_class = PROVIDER_MAP[provider_name]

    try:
        return provider_class(**kwargs)
    except Exception as e:
        logger.error(f"Error creating provider '{provider_name}': {e}")
        # Fall back to OpenAI if there's an error
        if provider_name != "openai":
            logger.warning(f"Falling back to OpenAI provider")
            return OpenAIProvider(**kwargs)
        raise


def get_all_available_models() -> Dict[str, Any]:
    """
    Get all available models from all providers.

    Returns:
        Dict mapping provider names to their available models
    """
    all_models = {}

    for provider_name, provider_class in PROVIDER_MAP.items():
        try:
            all_models[provider_name] = provider_class.get_available_models()
        except Exception as e:
            logger.error(f"Error getting models for provider '{provider_name}': {e}")
            all_models[provider_name] = []

    return all_models
