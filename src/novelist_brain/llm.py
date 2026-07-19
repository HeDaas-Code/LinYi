"""LLM service abstraction with OpenAI-compatible HTTP implementation.

This module provides:
- ``LLMService``: abstract interface used by all brain modules.
- ``MockLLMService``: template-based fallback that runs without network.
- ``OpenAILLMService``: real LLM client using ``urllib.request`` (no
  external dependencies) that works with any OpenAI-compatible endpoint.
- ``create_llm_service``: factory that picks the right service from config.
"""

from __future__ import annotations

import json
import os
import random
import re
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from typing import Any


class LLMService(ABC):
    """Pluggable LLM interface for the novelist brain prototype."""

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
    """Template-based LLM mock with deterministic/random fallback behavior."""

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
        prompt_lower = prompt.lower()
        for keyword, templates in self._templates.items():
            if keyword in prompt_lower:
                return self._rng.choice(templates)
        cleaned = re.sub(r"\s+", " ", prompt.strip().rstrip(".?!"))
        fallbacks = [
            f"{cleaned}, and the silence that followed was itself a kind of answer.",
            f"{cleaned}, though no one was sure whether it had really happened.",
            f"{cleaned}, while the city held its breath outside the window.",
        ]
        return self._rng.choice(fallbacks)

    def embed(self, text: str) -> list[float]:
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
    """OpenAI-compatible LLM service using ``urllib.request``.

    Works with any provider that exposes the OpenAI chat completions and
    embeddings endpoints. Supports reasoning models (e.g. MiniMax-M3) by
    requesting a generous ``max_tokens`` budget and falling back to
    ``reasoning_content`` when the provider returns it instead of ``content``.
    """

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str = "gpt-3.5-turbo",
        embedding_model: str = "text-embedding-3-small",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        timeout: float = 120.0,
    ) -> None:
        self._base_url = (base_url or os.getenv("OPENAI_BASE_URL") or "").rstrip("/")
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        self._model = model
        self._embedding_model = embedding_model
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._timeout = timeout

        if not self._api_key:
            raise LLMConfigurationError(
                "OpenAI-compatible API key is required. Set OPENAI_API_KEY or pass api_key."
            )
        if not self._base_url:
            raise LLMConfigurationError(
                "base_url is required for OpenAI-compatible service."
            )

    def _chat(
        self,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> dict[str, Any]:
        url = f"{self._base_url}/chat/completions"
        payload = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise LLMCallError(
                f"HTTP {exc.code} from {url}: {detail[:500]}"
            ) from exc
        except urllib.error.URLError as exc:
            raise LLMCallError(f"Network error calling {url}: {exc}") from exc

    def complete(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """Request a chat completion.

        If the provider returns an empty ``content`` (as reasoning models
        sometimes do when ``max_tokens`` is exhausted by reasoning), the
        ``reasoning_content`` field is returned as a fallback so callers
        still get usable text.
        """
        messages: list[dict[str, str]] = []
        if context and context.get("system"):
            messages.append({"role": "system", "content": str(context["system"])})
        messages.append({"role": "user", "content": prompt})

        response = self._chat(
            messages,
            temperature=self._temperature if temperature is None else temperature,
            max_tokens=self._max_tokens if max_tokens is None else max_tokens,
        )
        choices = response.get("choices") or []
        if not choices:
            raise LLMCallError(f"Empty choices in response: {response}")
        message = choices[0].get("message") or {}
        content = message.get("content") or ""
        if content.strip():
            return content.strip()
        # Fallback: reasoning models may put the usable text in reasoning_content.
        reasoning = message.get("reasoning_content") or ""
        if reasoning.strip():
            # Best-effort: strip reasoning meta-commentary if final answer is embedded.
            return self._extract_final_answer(reasoning)
        raise LLMCallError(f"Empty content and reasoning in response: {response}")

    @staticmethod
    def _extract_final_answer(reasoning: str) -> str:
        """Heuristically extract a usable answer from reasoning content.

        Many reasoning models draft the final answer inside their reasoning
        trace. We look for the longest quoted or block-quoted passage and
        return it; otherwise we return the whole reasoning text trimmed.
        """
        # Look for triple-quoted blocks first.
        blocks = re.findall(r"```(?:[a-zA-Z]*)?\n(.*?)```", reasoning, flags=re.DOTALL)
        if blocks:
            return max(blocks, key=len).strip()
        # Look for lines after "Final answer:" or "Answer:".
        match = re.search(
            r"(?:final answer|answer|response|output)\s*[:：]\s*(.+)",
            reasoning,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if match:
            return match.group(1).strip().strip("\"'`")
        return reasoning.strip()

    def embed(self, text: str) -> list[float]:
        url = f"{self._base_url}/embeddings"
        payload = {
            "input": [text],
            "model": self._embedding_model,
        }
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise LLMCallError(f"Embedding HTTP {exc.code}: {exc.read()[:300]!r}") from exc
        except urllib.error.URLError as exc:
            raise LLMCallError(f"Embedding network error: {exc}") from exc
        try:
            return data["data"][0]["embedding"]
        except (KeyError, IndexError) as exc:
            raise LLMCallError(f"Malformed embedding response: {data}") from exc


def create_llm_service(config: dict[str, Any]) -> LLMService:
    """Factory that returns a real LLM service or falls back to the mock.

    Configuration keys:
    - ``use_mock``: if True, always return MockLLMService.
    - ``base_url`` / ``api_key`` / ``model``: OpenAI-compatible endpoint.
    - ``seed`` / ``dimensions``: passed to MockLLMService when fallback.
    """
    if config.get("use_mock", False):
        return MockLLMService(
            seed=config.get("seed"),
            dimensions=config.get("dimensions", 64),
        )

    api_key = config.get("api_key") or os.getenv("OPENAI_API_KEY")
    base_url = config.get("base_url") or os.getenv("OPENAI_BASE_URL")
    if not api_key or not base_url:
        return MockLLMService(
            seed=config.get("seed"),
            dimensions=config.get("dimensions", 64),
        )

    try:
        return OpenAILLMService(
            base_url=base_url,
            api_key=api_key,
            model=config.get("model", "gpt-3.5-turbo"),
            embedding_model=config.get("embedding_model", "text-embedding-3-small"),
            temperature=float(config.get("temperature", 0.7)),
            max_tokens=int(config.get("max_tokens", 2048)),
            timeout=float(config.get("timeout", 120.0)),
        )
    except LLMConfigurationError:
        return MockLLMService(
            seed=config.get("seed"),
            dimensions=config.get("dimensions", 64),
        )
