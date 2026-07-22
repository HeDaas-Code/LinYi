"""ReflectionEngine: synthesize higher-level insights from the memory stream.

Inspired by Stanford Generative Agents' reflection mechanism, this module runs
during the reflection phase (or on demand) to read recent memory-stream entries,
detect recurring themes, and emit reflection entries back into the stream.

For this MVP the synthesis is deterministic/heuristic rather than LLM-driven, so
it can run without API cost while still producing believable abstract memories.
"""

from __future__ import annotations

import time
from collections import Counter
from typing import Any

from src.novelist_brain.memory_stream import MemoryStream, MemoryStreamEntry
from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


#: Minimum number of observations before a reflection is triggered.
DEFAULT_REFLECTION_THRESHOLD = 5

#: How far back (seconds) to look when synthesizing a reflection.
DEFAULT_REFLECTION_WINDOW = 24.0 * 3600.0

#: Topic emitted when a new reflection is created.
TOPIC_REFLECTION_CREATED = "data.memory.reflection.created"


class ReflectionEngine(Module):
    """Generate abstract reflections from concrete memory-stream entries."""

    def __init__(
        self,
        name: str = "reflection_engine",
        *,
        reflection_threshold: int = DEFAULT_REFLECTION_THRESHOLD,
        reflection_window: float = DEFAULT_REFLECTION_WINDOW,
    ) -> None:
        super().__init__(name)
        self._reflection_threshold = max(1, int(reflection_threshold))
        self._reflection_window = max(60.0, float(reflection_window))
        self._memory_stream: MemoryStream | None = None
        self._last_reflection_at: float = 0.0
        self.subscribe(
            "control.reflection.trigger",
            "control.network.dmn.active",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "reflection_engine",
            "version": "0.1.0",
            "description": "Synthesize reflections from the memory stream",
            "dependencies": ["memory_stream"],
            "category": "memory",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.2,
            custom={
                "reflections_created": 0,
                "last_reflection_at": 0.0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def reflect(self, now: float | None = None) -> MemoryStreamEntry | None:
        """Run one reflection pass and return the created entry, if any."""
        now = now if now is not None else time.time()
        if self._memory_stream is None:
            return None
        entries = self._memory_stream.retrieve(
            query="",
            limit=self._reflection_threshold * 2,
            kinds={"observation", "conversation", "plan"},
            now=now,
        )
        recent = [
            e
            for e in entries
            if now - e.timestamp <= self._reflection_window
        ]
        if len(recent) < self._reflection_threshold:
            return None
        reflection = self._synthesize(recent, now)
        if reflection is None:
            return None
        self._last_reflection_at = now
        self._state.custom["last_reflection_at"] = now
        self._state.custom["reflections_created"] = (
            int(self._state.custom.get("reflections_created", 0)) + 1
        )
        self.emit(
            topic=TOPIC_REFLECTION_CREATED,
            payload={
                "entry_id": reflection.entry_id,
                "content": reflection.content,
                "source_ids": [e.entry_id for e in recent[:10]],
                "timestamp": now,
            },
            channel="data",
            priority=6,
            ttl=5,
        )
        return reflection

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("reflection_engine", {})
        threshold = cfg.get("reflection_threshold")
        if isinstance(threshold, int) and threshold > 0:
            self._reflection_threshold = threshold
        window = cfg.get("reflection_window")
        if isinstance(window, (int, float)) and window > 0:
            self._reflection_window = float(window)
        stream = context.get("memory_stream_instance")
        if isinstance(stream, MemoryStream):
            self._memory_stream = stream

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        if message.topic == "control.reflection.trigger":
            self.reflect()
        elif message.topic == "control.network.dmn.active":
            # Reflection happens naturally during DMN/incubation phases.
            payload = message.payload or {}
            phase = payload.get("phase", "")
            if phase in ("reflection", "incubation", "deep_night"):
                self.reflect()

    def tick(self, delta: TickDelta) -> None:
        return None

    # ------------------------------------------------------------------
    # Synthesis
    # ------------------------------------------------------------------

    def _synthesize(
        self,
        entries: list[MemoryStreamEntry],
        now: float,
    ) -> MemoryStreamEntry | None:
        if not entries:
            return None
        # Simple theme extraction by tag frequency.
        tag_counter: Counter[str] = Counter()
        for entry in entries:
            for tag in entry.tags:
                tag_counter[tag.lower()] += 1
        top_tags = [tag for tag, _ in tag_counter.most_common(3)]

        # Detect emotional direction from content heuristics.
        positives = {"喜欢", "开心", "愉快", "轻松", "温暖", "期待"}
        negatives = {"讨厌", "难过", "沮丧", "焦虑", "疲惫", "失望"}
        pos_count = sum(1 for e in entries if any(p in e.content for p in positives))
        neg_count = sum(1 for e in entries if any(n in e.content for n in negatives))
        if pos_count > neg_count:
            tone = "整体情绪偏积极"
        elif neg_count > pos_count:
            tone = "整体情绪偏低落"
        else:
            tone = "情绪比较平稳"

        # Build reflection text.
        parts = [
            f"最近{len(entries)}件事让我想起一些共同的东西",
            tone,
        ]
        if top_tags:
            parts.append(" recurring themes: " + ", ".join(top_tags))
        content = "。".join(parts) + "。"

        if self._memory_stream is None:
            return None
        return self._memory_stream.add(
            kind="reflection",
            content=content,
            source="reflection_engine",
            importance=0.75,
            tags=top_tags,
            metadata={
                "source_count": len(entries),
                "tone": tone,
                "synthesized_at": now,
            },
        )

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "reflection_threshold": self._reflection_threshold,
                "reflection_window": self._reflection_window,
                "last_reflection_at": self._last_reflection_at,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._reflection_threshold = int(
            data.get("reflection_threshold", DEFAULT_REFLECTION_THRESHOLD)
        )
        self._reflection_window = float(
            data.get("reflection_window", DEFAULT_REFLECTION_WINDOW)
        )
        self._last_reflection_at = float(data.get("last_reflection_at", 0.0))


__all__ = [
    "ReflectionEngine",
    "TOPIC_REFLECTION_CREATED",
    "DEFAULT_REFLECTION_THRESHOLD",
    "DEFAULT_REFLECTION_WINDOW",
]
