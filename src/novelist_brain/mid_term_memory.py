"""MidTermMemory: compress evicted conversation turns into summaries.

Inspired by MaiBot's ``maisaka.memory.mid_term`` chat recall, this module
watches ``data.conversation.queue.evicted`` events, accumulates the dropped
turns, and periodically compresses them into a natural-language summary that
is stored in the long-term :class:`MemoryStream`.  The recent-conversation
queue therefore stays short and immediate, while older dialogue remains
accessible as condensed memory.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from src.novelist_brain.conversation_queue import (
    TOPIC_CONVERSATION_QUEUE_EVICTED,
    ConversationTurn,
)
from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module

if TYPE_CHECKING:
    from src.novelist_brain.llm import LLMService
    from src.novelist_brain.memory_stream import MemoryStream


#: Emitted when a mid-term summary has been generated and stored.
TOPIC_MID_TERM_SUMMARY = "data.memory.mid_term.summary"


@dataclass
class MidTermSummary:
    """One compressed conversation summary."""

    summary_id: str
    text: str
    turn_count: int
    start_time: float
    end_time: float
    recall_cues: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "summary_id": self.summary_id,
            "text": self.text,
            "turn_count": self.turn_count,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "recall_cues": list(self.recall_cues),
        }


class MidTermMemory(Module):
    """Compress evicted conversation turns into long-term memory summaries.

    Configuration via ``context["mid_term_memory"]``:

    - ``summary_threshold`` (int): number of evicted turns to accumulate
      before auto-summarizing (default 5).
    - ``min_turns_for_summary`` (int): minimum turns required even for an
      explicit request (default 2).
    - ``max_summary_chars`` (int): hard cap on the generated summary text
      (default 1000).
    - ``enable_llm_summary`` (bool): whether to call the LLM service when
      available; when False or the service is a mock, a concatenation fallback
      is used (default True).

    Subscribes to:

    - ``data.conversation.queue.evicted`` — buffered for summarization.
    - ``control.memory.mid_term.summarize`` — explicit flush request.
    """

    def __init__(
        self,
        name: str = "mid_term_memory",
        *,
        summary_threshold: int = 5,
        min_turns_for_summary: int = 2,
        max_summary_chars: int = 1_000,
        enable_llm_summary: bool = True,
    ) -> None:
        super().__init__(name)
        self._summary_threshold = max(1, int(summary_threshold))
        self._min_turns_for_summary = max(1, int(min_turns_for_summary))
        self._max_summary_chars = max(12, int(max_summary_chars))
        self._enable_llm_summary = bool(enable_llm_summary)
        self._buffer: list[ConversationTurn] = []
        self._memory_stream: MemoryStream | None = None
        self._llm_service: LLMService | None = None
        self.subscribe(
            TOPIC_CONVERSATION_QUEUE_EVICTED,
            "control.memory.mid_term.summarize",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "mid_term_memory",
            "version": "0.1.0",
            "description": "Compress evicted conversation turns into summaries",
            "dependencies": [],
            "category": "memory",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.05,
            custom={
                "buffered_turns": 0,
                "summaries_generated": 0,
                "summary_chars_total": 0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def buffer_turns(self, turns: list[ConversationTurn]) -> None:
        """Append evicted turns to the internal buffer."""
        self._buffer.extend(turns)
        self._state.custom["buffered_turns"] = len(self._buffer)

    def flush(self) -> MidTermSummary | None:
        """Generate a summary from the current buffer and clear it."""
        if len(self._buffer) < self._min_turns_for_summary:
            return None
        summary = self._summarize(self._buffer)
        self._store_summary(summary)
        self._buffer.clear()
        self._state.custom["buffered_turns"] = 0
        self._state.custom["summaries_generated"] = (
            int(self._state.custom.get("summaries_generated", 0)) + 1
        )
        self._state.custom["summary_chars_total"] = (
            int(self._state.custom.get("summary_chars_total", 0)) + len(summary.text)
        )
        if self._router is not None:
            self.emit(
                topic=TOPIC_MID_TERM_SUMMARY,
                payload=summary.to_dict(),
                channel="data",
                priority=5,
                ttl=3,
            )
        return summary

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("mid_term_memory", {})

        threshold = cfg.get("summary_threshold")
        if isinstance(threshold, int) and threshold > 0:
            self._summary_threshold = threshold
        min_turns = cfg.get("min_turns_for_summary")
        if isinstance(min_turns, int) and min_turns > 0:
            self._min_turns_for_summary = min_turns
        max_chars = cfg.get("max_summary_chars")
        if isinstance(max_chars, int) and max_chars >= 12:
            self._max_summary_chars = max_chars
        enable_llm = cfg.get("enable_llm_summary")
        if isinstance(enable_llm, bool):
            self._enable_llm_summary = enable_llm

        self._memory_stream = context.get("memory_stream_instance")
        self._llm_service = context.get("llm_service")

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        payload = message.payload or {}

        if message.topic == TOPIC_CONVERSATION_QUEUE_EVICTED:
            turns_data = payload.get("turns", []) or []
            turns = [self._dict_to_turn(t) for t in turns_data if isinstance(t, dict)]
            self.buffer_turns(turns)
            if len(self._buffer) >= self._summary_threshold:
                self.flush()
            return

        if message.topic == "control.memory.mid_term.summarize":
            self.flush()
            return

    def tick(self, delta: TickDelta) -> None:
        self._state.custom["buffered_turns"] = len(self._buffer)

    # ------------------------------------------------------------------
    # Summarization
    # ------------------------------------------------------------------

    def _summarize(self, turns: list[ConversationTurn]) -> MidTermSummary:
        """Build a summary from buffered turns.

        Uses the LLM service when available and enabled; otherwise falls back
        to a structured concatenation so tests and mock runs still produce a
        usable memory entry.
        """
        start_time = min((t.timestamp for t in turns if t.timestamp), default=time.time())
        end_time = max((t.timestamp for t in turns if t.timestamp), default=start_time)

        if self._llm_service is not None and self._enable_llm_summary and not self._llm_service.is_mock:
            text = self._llm_summary(turns)
        else:
            text = self._fallback_summary(turns)

        if len(text) > self._max_summary_chars:
            text = text[: self._max_summary_chars - 12].rstrip() + "\n[truncated]"

        cues = self._extract_recall_cues(turns)
        return MidTermSummary(
            summary_id=f"mts_{int(time.time() * 1000)}",
            text=text,
            turn_count=len(turns),
            start_time=start_time,
            end_time=end_time,
            recall_cues=cues,
        )

    def _llm_summary(self, turns: list[ConversationTurn]) -> str:
        """Ask the LLM to compress the conversation into a narrative summary."""
        lines: list[str] = []
        for turn in turns:
            prefix = turn.role
            if turn.source:
                prefix = f"{turn.role} ({turn.source})"
            lines.append(f"{prefix}: {turn.content}")
        transcript = "\n".join(lines)

        prompt = (
            "Summarize the following conversation in 2-3 sentences. "
            "Keep character names, key decisions, and emotional tone. "
            "Use Chinese if the conversation is in Chinese.\n\n"
            f"{transcript}\n\nSummary:"
        )
        try:
            summary = self._llm_service.complete(  # type: ignore[union-attr]
                prompt,
                temperature=0.4,
                max_tokens=300,
            )
            return str(summary or "").strip() or self._fallback_summary(turns)
        except Exception:
            return self._fallback_summary(turns)

    def _fallback_summary(self, turns: list[ConversationTurn]) -> str:
        """Structured concatenation fallback when no real LLM is available."""
        lines: list[str] = [
            f"Conversation summary ({len(turns)} turns):",
        ]
        for turn in turns:
            prefix = turn.role
            if turn.source:
                prefix = f"{turn.role} ({turn.source})"
            lines.append(f"- {prefix}: {turn.content[:200]}")
        return "\n".join(lines)

    def _extract_recall_cues(self, turns: list[ConversationTurn]) -> list[str]:
        """Return simple recall cues based on role/source occurrences."""
        cues: set[str] = set()
        for turn in turns:
            if turn.source and turn.source != self.name:
                cues.add(turn.source)
            role = turn.role.strip().lower()
            if role in {"user", "agent", "oc"}:
                cues.add(role)
        return sorted(cues)[:5]

    def _store_summary(self, summary: MidTermSummary) -> None:
        if self._memory_stream is None:
            return
        self._memory_stream.add(
            kind="conversation_summary",
            content=summary.text,
            source="mid_term_memory",
            importance=0.65,
            tags=["mid_term"] + summary.recall_cues,
            metadata=summary.to_dict(),
        )

    @staticmethod
    def _dict_to_turn(data: dict[str, Any]) -> ConversationTurn:
        return ConversationTurn(
            turn_id=str(data.get("turn_id", "")),
            role=str(data.get("role", "system")),
            content=str(data.get("content", "")),
            source=str(data.get("source", "")),
            timestamp=float(data.get("timestamp", 0.0)),
            metadata=dict(data.get("metadata", {})),
        )

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "summary_threshold": self._summary_threshold,
                "min_turns_for_summary": self._min_turns_for_summary,
                "max_summary_chars": self._max_summary_chars,
                "enable_llm_summary": self._enable_llm_summary,
                "buffer": [self._turn_to_dict(t) for t in self._buffer],
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._summary_threshold = max(1, int(data.get("summary_threshold", 5)))
        self._min_turns_for_summary = max(1, int(data.get("min_turns_for_summary", 2)))
        self._max_summary_chars = max(12, int(data.get("max_summary_chars", 1_000)))
        self._enable_llm_summary = bool(data.get("enable_llm_summary", True))
        self._buffer = [
            self._dict_to_turn(t)
            for t in data.get("buffer", [])
            if isinstance(t, dict)
        ]

    @staticmethod
    def _turn_to_dict(turn: ConversationTurn) -> dict[str, Any]:
        return {
            "turn_id": turn.turn_id,
            "role": turn.role,
            "content": turn.content,
            "source": turn.source,
            "timestamp": turn.timestamp,
            "metadata": turn.metadata,
        }


__all__ = [
    "MidTermMemory",
    "MidTermSummary",
    "TOPIC_MID_TERM_SUMMARY",
]
