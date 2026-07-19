"""LLM service abstraction and mock implementation."""

from __future__ import annotations

import os
import random
import re
from abc import ABC, abstractmethod
from typing import Any


class LLMService(ABC):
    """Pluggable LLM interface for the novelist brain prototype.

    Concrete implementations may call external APIs or run local models.
    The prototype uses :class:`MockLLMService` so it runs without keys.
    """

    @abstractmethod
    def complete(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 256,
    ) -> str:
        """Return a text completion for the given prompt."""
        ...

    @abstractmethod
    def embed(self, text: str) -> list[float]:
        """Return a dense embedding vector for the given text."""
        ...


class MockLLMService(LLMService):
    """Template-based LLM mock with deterministic/random fallback behavior.

    The mock recognizes a small set of topic keywords and produces canned
    prose.  For unknown prompts it returns a generic continuation.  Embeddings
    are simple hash-derived or random vectors.
    """

    def __init__(self, seed: int | None = None, dimensions: int = 64) -> None:
        self._seed = seed
        self._dimensions = dimensions
        self._rng = random.Random(seed)
        self._templates: dict[str, list[str]] = {
            "dream": [
                "A door appeared in the wall of rain. You opened it and found a room where every clock ran backwards.",
                "Someone who looked like your younger self was sitting at the desk, writing in a language you had forgotten.",
            ],
            "morning": [
                "The city woke slowly, unfolding its streets like a letter written in gray ink.",
                "Coffee steam blurred the window; outside, commuters moved like figures in an unfinished sketch.",
            ],
            "scene": [
                "The café was almost empty. Two strangers shared the long counter in a silence that felt borrowed from an old film.",
                "Rain tapped the glass in a rhythm too regular to be accidental.",
            ],
            "character": [
                "She carried her secrets lightly, the way others carry keys.",
                "He measured every word as if language were a currency about to collapse.",
            ],
            "reflection": [
                "Looking back, the pattern only makes sense because it is already finished.",
                "Memory edits more ruthlessly than any novelist.",
            ],
            "paragraph": [
                "That afternoon the light in the stairwell changed, and she understood, without knowing why, that the story had begun.",
                "He wrote the sentence, then deleted it, then wrote it again—because some truths must arrive twice.",
            ],
        }

    def complete(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 256,
    ) -> str:
        """Return a template-driven completion for ``prompt``."""
        prompt_lower = prompt.lower()
        for keyword, templates in self._templates.items():
            if keyword in prompt_lower:
                return self._rng.choice(templates)

        # Fallback: echo the prompt with a gentle continuation.
        cleaned = re.sub(r"\s+", " ", prompt.strip().rstrip(".?!"))
        fallbacks = [
            f"{cleaned}, and the silence that followed was itself a kind of answer.",
            f"{cleaned}, though no one was sure whether it had really happened.",
            f"{cleaned}, while the city held its breath outside the window.",
        ]
        return self._rng.choice(fallbacks)

    def embed(self, text: str) -> list[float]:
        """Return a simple embedding vector for ``text``.

        When a deterministic seed was provided, the vector is derived from the
        text hash so repeated calls are stable.  Otherwise it is random.
        """
        if self._seed is None:
            return [round(self._rng.random(), 6) for _ in range(self._dimensions)]

        base = hash(text) % 10000
        local_rng = random.Random(self._seed ^ base)
        return [round(local_rng.random(), 6) for _ in range(self._dimensions)]


class LLMError(Exception):
    """Base exception for LLM service failures."""


class LLMConfigurationError(LLMError):
    """Raised when the LLM service is missing required configuration."""


class LLMCallError(LLMError):
    """Raised when an LLM API call fails."""


class OpenAILLMService(LLMService):
    """OpenAI-compatible LLM service implementation.

    Supports any provider with an OpenAI-compatible chat completions and
    embeddings endpoint. Configuration is read from the provided constructor
    arguments, falling back to environment variables when omitted.

    The ``openai`` package is imported lazily inside ``__init__`` so the
    module remains importable even when the package is not installed.
    """

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str = "gpt-3.5-turbo",
        embedding_model: str = "text-embedding-3-small",
        temperature: float = 0.7,
        max_tokens: int = 256,
        timeout: float = 30.0,
    ) -> None:
        try:
            import openai
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise LLMConfigurationError(
                "The 'openai' package is required for OpenAILLMService. "
                "Install it with: pip install openai"
            ) from exc

        self._base_url = base_url or os.getenv("OPENAI_BASE_URL")
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        self._model = model
        self._embedding_model = embedding_model
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._timeout = timeout
        self._openai = openai

        if not self._api_key:
            raise LLMConfigurationError(
                "OpenAI API key is required. Set OPENAI_API_KEY or pass api_key."
            )

        client_kwargs: dict[str, Any] = {"api_key": self._api_key}
        if self._base_url:
            client_kwargs["base_url"] = self._base_url
        if timeout is not None:
            client_kwargs["timeout"] = self._timeout

        self._client = openai.OpenAI(**client_kwargs)

    def complete(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 256,
    ) -> str:
        """Request a chat completion from the configured OpenAI endpoint."""
        messages: list[dict[str, str]] = []
        if context and context.get("system"):
            messages.append({"role": "system", "content": str(context["system"])})
        messages.append({"role": "user", "content": prompt})

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except self._openai.APIError as exc:
            raise LLMCallError(f"OpenAI chat completion failed: {exc}") from exc
        except Exception as exc:
            raise LLMCallError(f"Unexpected error during completion: {exc}") from exc

        content = response.choices[0].message.content
        if content is None:
            return ""
        return content

    def embed(self, text: str) -> list[float]:
        """Request an embedding vector from the configured OpenAI endpoint."""
        try:
            response = self._client.embeddings.create(
                input=[text],
                model=self._embedding_model,
            )
        except self._openai.APIError as exc:
            raise LLMCallError(f"OpenAI embedding failed: {exc}") from exc
        except Exception as exc:
            raise LLMCallError(f"Unexpected error during embedding: {exc}") from exc

        return response.data[0].embedding


def create_llm_service(config: dict[str, Any]) -> LLMService:
    """Factory that returns a real LLM service or falls back to the mock.

    When ``config`` explicitly requests the mock, or when no OpenAI API key
    is available, a :class:`MockLLMService` is returned. Otherwise an
    :class:`OpenAILLMService` is constructed from ``config`` and environment
    variables.
    """
    if config.get("use_mock", False):
        return MockLLMService(
            seed=config.get("seed"),
            dimensions=config.get("dimensions", 64),
        )

    api_key = config.get("api_key") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        return MockLLMService(
            seed=config.get("seed"),
            dimensions=config.get("dimensions", 64),
        )

    try:
        return OpenAILLMService(
            base_url=config.get("base_url"),
            api_key=api_key,
            model=config.get("model", "gpt-3.5-turbo"),
            embedding_model=config.get("embedding_model", "text-embedding-3-small"),
            temperature=float(config.get("temperature", 0.7)),
            max_tokens=int(config.get("max_tokens", 256)),
            timeout=float(config.get("timeout", 30.0)),
        )
    except LLMConfigurationError:
        return MockLLMService(
            seed=config.get("seed"),
            dimensions=config.get("dimensions", 64),
        )
