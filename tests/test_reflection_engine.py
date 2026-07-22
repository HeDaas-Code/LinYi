# -*- coding: utf-8 -*-
"""Tests for ReflectionEngine."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.memory_stream import MemoryStream
from src.novelist_brain.models import BusMessage, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.reflection_engine import (
    TOPIC_REFLECTION_CREATED,
    ReflectionEngine,
)


def _tick(now: float = 0.0, phase: str = "reflection") -> TickDelta:
    return TickDelta(
        absolute_time=now,
        delta_ms=1000.0,
        phase=phase,
    )


def test_reflect_creates_entry_when_enough_memories() -> None:
    router = BusRouter()
    stream = MemoryStream(name="memory_stream")
    stream.init({})
    for i in range(5):
        stream.add(kind="observation", content=f"事件 {i}", importance=0.5, tags=["工作"])

    engine = ReflectionEngine(name="reflection_engine", reflection_threshold=5)
    engine.register(router)
    engine._memory_stream = stream
    entry = engine.reflect(now=time_after(stream))

    assert entry is not None
    assert entry.kind == "reflection"
    assert entry.entry_id in stream._entries


def test_reflect_emits_bus_event() -> None:
    router = BusRouter()
    stream = MemoryStream(name="memory_stream")
    stream.init({})
    for i in range(5):
        stream.add(kind="observation", content=f"事件 {i}", importance=0.5)

    engine = ReflectionEngine(name="reflection_engine", reflection_threshold=5)
    engine.register(router)
    engine._memory_stream = stream

    class _SpyModule(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[BusMessage] = []
            self.subscribe(TOPIC_REFLECTION_CREATED)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: BusMessage) -> None:
            self.messages.append(message)

        def tick(self, delta: TickDelta) -> None:
            return None

    spy = _SpyModule()
    router.subscribe(spy)

    engine.reflect(now=time_after(stream))
    router.flush()

    assert len(spy.messages) == 1
    assert spy.messages[0].topic == TOPIC_REFLECTION_CREATED


def test_reflect_returns_none_below_threshold() -> None:
    stream = MemoryStream(name="memory_stream")
    stream.init({})
    stream.add(kind="observation", content=" lonely event", importance=0.5)

    engine = ReflectionEngine(name="reflection_engine", reflection_threshold=5)
    engine._memory_stream = stream
    assert engine.reflect(now=time_after(stream)) is None


def test_dmn_active_triggers_reflection_in_reflection_phase() -> None:
    router = BusRouter()
    stream = MemoryStream(name="memory_stream")
    stream.init({})
    for i in range(5):
        stream.add(kind="observation", content=f"事件 {i}", importance=0.5)

    engine = ReflectionEngine(name="reflection_engine", reflection_threshold=5)
    engine.register(router)
    engine._memory_stream = stream
    engine.on_bus_message(
        BusMessage(
            source="clock",
            topic="control.network.dmn.active",
            channel="control",
            payload={"phase": "reflection"},
        )
    )

    assert engine._state.custom["reflections_created"] == 1


def time_after(stream: MemoryStream) -> float:
    if not stream._entries:
        return 0.0
    return max(e.timestamp for e in stream._entries.values()) + 1.0
