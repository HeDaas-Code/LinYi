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
import time
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from typing import Any, Callable

from src.novelist_brain.circuit_breaker import CircuitBreaker, CircuitState
from src.novelist_brain.fault import AgentError, ErrorType, Severity, classify_exception
from src.novelist_brain.models import BusMessage


class LLMService(ABC):
    """Pluggable LLM interface used by all brain modules."""

    @property
    def is_mock(self) -> bool:
        """Return True if this service does not call a real external LLM."""
        return False

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

    @property
    def is_mock(self) -> bool:
        return True

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
        image_urls = _extract_image_urls(context)
        if image_urls:
            return self._rng.choice(
                [
                    "图像中的光线停顿在一个没有主人的角落，像一句被删掉的旁白。",
                    "画面深处有一种未完成的安静，仿佛有人刚刚离开镜头。",
                    "那只空椅子承受着整幅图的目光，它比任何人物都更接近真实。",
                ]
            )
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


def _create_llm_call_completed_message(
    source: str,
    downstream_use: str = "unknown",
    latency_ms: float = 0.0,
    input_tokens: int = 0,
    output_tokens: int = 0,
) -> dict[str, Any]:
    return {
        "topic": "llm.call.completed",
        "channel": "event",
        "payload": {
            "source": source,
            "downstream_use": downstream_use,
            "latency_ms": latency_ms,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        },
    }


def _extract_image_urls(context: dict[str, Any] | None) -> list[str]:
    """Extract image URLs from a completion context.

    Supports both ``image_urls`` (list of strings) and ``image_url`` (single
    string) keys so callers can pass vision inputs without changing the
    ``complete()`` signature.
    """
    if not context:
        return []
    raw = context.get("image_urls")
    if isinstance(raw, list):
        return [str(u) for u in raw if u]
    url = context.get("image_url")
    if isinstance(url, str) and url:
        return [url]
    return []


def _create_llm_call_failed_message(
    source: str,
    error: AgentError,
    downstream_use: str = "unknown",
) -> dict[str, Any]:
    return {
        "topic": "llm.call.failed",
        "channel": "event",
        "payload": {
            "source": source,
            "downstream_use": downstream_use,
            "error": error.to_dict(),
        },
    }


class ResilientLLMService(LLMService):
    """Wraps a primary LLM service with retry, circuit breaker, fallback and fault publishing.

    This wrapper keeps the ``LLMService`` interface, so modules do not need to
    change how they call the LLM.  On failures it emits ``llm.call.failed`` and
    ``control.fault.error`` events and falls back to a secondary service (by
    default ``MockLLMService``) when the circuit is open or retries are exhausted.
    """

    @property
    def is_mock(self) -> bool:
        return self._primary.is_mock and self._fallback.is_mock

    def __init__(
        self,
        primary: LLMService,
        fallback: LLMService | None = None,
        circuit_breaker: CircuitBreaker | None = None,
        max_retries: int = 2,
        base_delay_ms: int = 500,
        fault_publisher: Callable[[AgentError], None] | None = None,
        event_publisher: Callable[[dict[str, Any]], None] | None = None,
        source: str = "llm_service",
    ) -> None:
        self._primary = primary
        self._fallback = fallback if fallback is not None else MockLLMService()
        self._circuit = circuit_breaker or CircuitBreaker(service="llm")
        self._max_retries = max(0, max_retries)
        self._base_delay_ms = base_delay_ms
        self._fault_publisher = fault_publisher
        self._event_publisher = event_publisher
        self._source = source
        self._degraded: bool = False

    @property
    def degraded(self) -> bool:
        return self._degraded

    @property
    def circuit_state(self) -> CircuitState:
        return self._circuit.state

    def complete(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 256,
    ) -> str:
        start = time.time()
        downstream_use = (context or {}).get("downstream_use", "unknown")

        if not self._circuit.can_execute():
            self._degraded = True
            result = self._fallback.complete(prompt, context, temperature, max_tokens)
            self._publish_completed(start, downstream_use)
            return result

        last_error: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                result = self._primary.complete(prompt, context, temperature, max_tokens)
                self._circuit.record_success()
                self._degraded = False
                self._publish_completed(start, downstream_use)
                return result
            except Exception as exc:
                last_error = exc
                self._circuit.record_failure()
                error = self._make_agent_error(exc, downstream_use)
                self._publish_fault(error)
                if attempt < self._max_retries and self._should_retry(exc):
                    delay = self._base_delay_ms * (2 ** attempt) / 1000.0
                    time.sleep(delay)
                    continue
                break

        # All retries exhausted or non-retryable: fall back.
        self._degraded = True
        try:
            result = self._fallback.complete(prompt, context, temperature, max_tokens)
            self._publish_completed(start, downstream_use, failed=True)
            return result
        except Exception as fallback_exc:
            raise LLMCallError(
                f"Primary and fallback LLM both failed: {fallback_exc}"
            ) from fallback_exc

    def embed(self, text: str) -> list[float]:
        # Embeddings are less critical; on failure fall back silently.
        if self._circuit.can_execute():
            try:
                return self._primary.embed(text)
            except Exception:
                self._circuit.record_failure()
        return self._fallback.embed(text)

    def _should_retry(self, exc: Exception) -> bool:
        error_type, _ = classify_exception(exc)
        return error_type in (
            ErrorType.LLM_TIMEOUT,
            ErrorType.LLM_RATE_LIMIT,
            ErrorType.LLM_UNREACHABLE,
        )

    def _make_agent_error(
        self, exc: Exception, downstream_use: str
    ) -> AgentError:
        error_type, severity = classify_exception(exc)
        return AgentError(
            source=self._source,
            topic="llm.call.failed",
            type=error_type,
            severity=severity,
            message=str(exc),
            payload={
                "downstream_use": downstream_use,
                "circuit_state": self._circuit.state.value,
            },
            recoverable=error_type != ErrorType.IDENTITY_INCONSISTENCY,
        )

    def _publish_fault(self, error: AgentError) -> None:
        if self._event_publisher is not None:
            self._event_publisher(
                {
                    "topic": "llm.call.failed",
                    "channel": "event",
                    "payload": {
                        "source": self._source,
                        "error": error.to_dict(),
                    },
                }
            )
        if self._fault_publisher is not None:
            self._fault_publisher(error)

    def _publish_completed(
        self, start: float, downstream_use: str, failed: bool = False
    ) -> None:
        if self._event_publisher is None:
            return
        latency_ms = (time.time() - start) * 1000
        if failed:
            self._event_publisher(
                _create_llm_call_failed_message(
                    self._source,
                    AgentError(
                        source=self._source,
                        topic="llm.call.failed",
                        type=ErrorType.LLM_UNREACHABLE,
                        severity=Severity.HIGH,
                        message="Primary failed, fallback used",
                    ),
                    downstream_use,
                )
            )
        else:
            self._event_publisher(
                _create_llm_call_completed_message(
                    self._source,
                    downstream_use,
                    latency_ms=latency_ms,
                )
            )


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
        messages: list[dict[str, Any]],
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

        Supports text-only and vision (image_url) inputs via the ``image_url``
        / ``image_urls`` keys in ``context``.  Reasoning models (e.g.
        MiniMax-M3) may return their full chain of thought.  We first try to
        obtain a clean Chinese answer from ``content``; if that is empty, we
        mine the same clean answer from ``reasoning_content``.  In both cases
        the answer is passed through ``_strip_reasoning_prefix`` so that
        English meta-text is removed.
        """
        messages: list[dict[str, Any]] = []
        if context and context.get("system"):
            system_prompt = str(context["system"])
            # Always enforce Chinese output, even when caller provides system.
            if "简体中文" not in system_prompt and "中文" not in system_prompt:
                system_prompt += (
                    "\n重要：你必须始终用简体中文回答，严禁输出英文散文或推理过程。"
                )
            messages.append({"role": "system", "content": system_prompt})
        else:
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "你是一位严肃文学小说家。所有回答必须使用简体中文。"
                        "不要输出英文，不要输出推理过程，不要解释你的写作思路。"
                        "直接给出最终的中文文本。"
                    ),
                }
            )

        image_urls = _extract_image_urls(context)
        if image_urls:
            content: list[dict[str, Any]] = [
                {"type": "text", "text": prompt},
            ]
            for url in image_urls:
                content.append({"type": "image_url", "image_url": {"url": url}})
            messages.append({"role": "user", "content": content})
        else:
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
        reasoning = message.get("reasoning_content") or ""

        candidates: list[str] = []
        if content.strip():
            candidates.append(content.strip())
        if reasoning.strip():
            candidates.append(reasoning.strip())

        for raw in candidates:
            cleaned = self._strip_reasoning_prefix(raw)
            if cleaned.strip():
                return cleaned.strip()

        # Last resort: try to extract a quoted block from reasoning.
        if reasoning.strip():
            extracted = self._extract_final_answer(reasoning)
            if extracted.strip():
                return extracted.strip()

        if content.strip():
            return content.strip()

        raise LLMCallError(f"Empty content and reasoning in response: {response}")

    @staticmethod
    def _strip_reasoning_prefix(text: str) -> str:
        """Remove reasoning traces that some models prepend or append.

        Reasoning models like MiniMax-M3 sometimes leak their internal
        reasoning into ``content``, interleaved with the actual prose.
        Common patterns:
        - Pre-rationalization: "Let me think..." / "The user wants..."
        - Post-rationalization: "Let me count..." / "Hmm, let me check..."
          / "Wait, let me reconsider..."
        - Embedded counting: "(57) text (20) text"

        Strategy
        --------
        1. Find the FIRST contiguous prose block — defined as a run of
           **at least 20 Chinese characters** (no longer matching pure
           whitespace, which was the previous bug) optionally interleaved
           with Chinese punctuation.
        2. Cut it off at the first reasoning marker that appears AFTER
           the start of the prose block. Markers are matched on a word
           boundary so common prose words like ``good`` or ``actually``
           inside a Chinese sentence are not flagged.
        3. If the prose block ends with an incomplete sentence (no
           Chinese sentence-ending punctuation), look ahead for the next
           sentence ending.

        Limitations
        -----------
        The long-term fix is to use structured outputs / tool calling so
        reasoning models return clean prose directly. This regex-based
        stripper is a best-effort patch and may still misfire on edge
        cases; it errs on the side of preserving text rather than
        discarding legitimate prose.
        """
        if not text:
            return text
        import re as _re

        # Reasoning markers (case-insensitive English). Each alternative is
        # anchored at a word boundary on both sides so that common prose
        # substrings (e.g. "good" inside "goodbye", "actually" inside a
        # quoted English snippet) are not false positives. The previous
        # version matched bare substrings and swallowed legitimate prose.
        reasoning_markers_en = _re.compile(
            r"\b(?:"
            r"let me|i need to|i should|i think|i want to|the user|user wants|"
            r"let me count|let me think|let me draft|let me revise|"
            r"wait|however,? i|now let me|i'll|i will|i should write|"
            r"let me reconsider|let me refine|let me check|i should make|"
            r"i can|so the|i think the|let me write|"
            r"approximately|that fits|let me count more|"
            r"draft \d|draft:|i should be|i'll write|"
            r"let me polish|i want to make|previous text|"
            r"i should avoid|i should not|i'll use|"
            r"check for|forbidden|reuse|refine|"
            r"character count|count: roughly|count: approximately|"
            r"let me read|let me consider|i interpret|"
            r"the instruction|instructions say|context mentions|"
            r"so i should|i also|within range|on ties"
            r")\b",
            _re.IGNORECASE,
        )
        # Chinese reasoning markers. These are distinctive enough to be
        # safe as plain substring matches.
        reasoning_markers_zh = _re.compile(
            r"(我需要|让我想|让我数|让我重新|让我考虑|我应该|我来写|"
            r"我重新|用户想要|让我修改|让我检查|让我再|我先|"
            r"让我来|让我写|让我草拟|我打算|让我精炼|"
            r"让我仔细|让我看|让我阅读|让我确认|"
            r"接下来我来|让我先)"
        )

        # Find the first substantial Chinese run. The previous regex
        # ``[\u4e00-\u9fff...]{20,}`` allowed a run of pure whitespace
        # (because ``\s`` was included) to satisfy the length requirement,
        # which meant a 20-space indent could be mis-detected as prose.
        # The new pattern requires at least 20 ACTUAL Chinese characters,
        # optionally interleaved with Chinese punctuation or whitespace.
        chinese_char_re = _re.compile(r"[\u4e00-\u9fff]")
        chinese_run_re = _re.compile(
            r"[\u4e00-\u9fff，。、；：！？\u201c\u201d\u2018\u2019（）…—\s]+"
        )
        # Scan candidate runs and accept the first one that has >= 20
        # Chinese characters (counted explicitly, ignoring whitespace).
        match = None
        for candidate in chinese_run_re.finditer(text):
            segment = candidate.group(0)
            chinese_count = len(chinese_char_re.findall(segment))
            if chinese_count >= 20:
                match = candidate
                break
        if match is None:
            # No Chinese prose found — fall back to original.
            return text

        prose_start = match.start()

        # If there's a non-trivial prefix before the prose, it's reasoning.
        # Now scan forward from prose_start and look for the first reasoning
        # marker (English or Chinese) that appears after the prose has begun.
        # We cut the prose at that point.
        remaining = text[prose_start:]

        # Find the earliest occurrence of any reasoning marker.
        cut_positions: list[int] = []
        for m in reasoning_markers_en.finditer(remaining):
            cut_positions.append(m.start())
        for m in reasoning_markers_zh.finditer(remaining):
            cut_positions.append(m.start())

        if cut_positions:
            earliest_cut = min(cut_positions)
            # Allow some buffer: the prose must be at least 30 chars.
            if earliest_cut >= 30:
                prose = remaining[:earliest_cut].rstrip()
                # Also strip trailing incomplete sentences: cut at the
                # last Chinese sentence-ending punctuation.
                # Find the last 。！？
                last_end = -1
                for i, ch in enumerate(prose):
                    if ch in "。！？…":
                        last_end = i
                if last_end != -1 and last_end < len(prose) - 1:
                    # If there's trailing text after the last sentence
                    # ender, truncate it.
                    prose = prose[: last_end + 1]
                return prose.strip()

        # No reasoning markers found after the prose start. Return the
        # text from prose_start, but also strip any trailing English
        # reasoning after the last Chinese character.
        last_chinese = -1
        for i, ch in enumerate(remaining):
            if "\u4e00" <= ch <= "\u9fff" or ch in "。！？；…":
                last_chinese = i
        if last_chinese != -1 and last_chinese < len(remaining) - 1:
            tail = remaining[last_chinese + 1 :].strip()
            # If the tail has any English letters, it's reasoning.
            if tail and _re.search(r"[a-zA-Z]{3,}", tail):
                remaining = remaining[: last_chinese + 1]

        return remaining.strip()

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
