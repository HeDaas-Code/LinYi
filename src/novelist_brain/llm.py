"""LLM service abstraction and mock implementation."""

from __future__ import annotations

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
