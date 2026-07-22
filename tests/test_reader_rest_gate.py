# -*- coding: utf-8 -*-
"""Tests for ReaderRestGate."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.reader_rest_gate import (
    ReaderRestGate,
    TOPIC_READER_REST,
    TOPIC_READER_RETURN,
)


def _tick(now: float, phase: str = "incubation") -> TickDelta:
    return TickDelta(
        absolute_time=now,
        delta_ms=1000.0,
        phase=phase,
    )


def test_interaction_keeps_reader_present() -> None:
    gate = ReaderRestGate(
        name="reader_rest_gate", rest_threshold_seconds=10
    )
    gate.mark_interaction(100.0)
    assert gate.is_resting(105.0) is False


def test_silence_triggers_rest_event() -> None:
    router = BusRouter()
    gate = ReaderRestGate(
        name="reader_rest_gate", rest_threshold_seconds=10
    )
    gate.register(router)
    gate.init({})

    class _SpyModule(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[BusMessage] = []
            self.subscribe(TOPIC_READER_REST)
            self.subscribe(TOPIC_READER_RETURN)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: BusMessage) -> None:
            self.messages.append(message)

        def tick(self, delta: TickDelta) -> None:
            return None

    spy = _SpyModule()
    router.subscribe(spy)

    gate.mark_interaction(100.0)
    gate.tick(_tick(115.0))
    router.flush()

    assert len(spy.messages) == 1
    assert spy.messages[0].topic == TOPIC_READER_REST
    assert spy.messages[0].payload["silence_seconds"] == 15.0


def test_return_event_after_rest() -> None:
    router = BusRouter()
    gate = ReaderRestGate(
        name="reader_rest_gate",
        rest_threshold_seconds=10,
        cooldown_seconds=0,
    )
    gate.register(router)
    gate.init({})

    class _SpyModule(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[BusMessage] = []
            self.subscribe(TOPIC_READER_REST)
            self.subscribe(TOPIC_READER_RETURN)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: BusMessage) -> None:
            self.messages.append(message)

        def tick(self, delta: TickDelta) -> None:
            return None

    spy = _SpyModule()
    router.subscribe(spy)

    gate.mark_interaction(100.0)
    gate.tick(_tick(115.0))  # rest detected
    gate.mark_interaction(120.0)  # return
    router.flush()

    topics = [m.topic for m in spy.messages]
    assert TOPIC_READER_REST in topics
    assert TOPIC_READER_RETURN in topics


def test_bus_message_refreshes_interaction() -> None:
    gate = ReaderRestGate(
        name="reader_rest_gate", rest_threshold_seconds=10
    )
    gate.register(BusRouter())
    gate.init({})

    msg = BusMessage(
        source="test",
        topic="event.reader.interaction",
        channel="event",
        payload={},
    )
    gate.on_bus_message(msg)
    assert gate.is_resting(5.0) is False


def test_cooldown_prevents_spam() -> None:
    router = BusRouter()
    gate = ReaderRestGate(
        name="reader_rest_gate",
        rest_threshold_seconds=5,
        cooldown_seconds=0,
    )
    gate.register(router)
    gate.mark_interaction(0.0)
    gate.tick(_tick(10.0))
    assert gate._last_broadcast_at == 10.0

    # Now enforce a long cooldown and tick again while still resting.
    gate._cooldown_seconds = 100
    gate.tick(_tick(20.0))
    assert gate._last_broadcast_at == 10.0


def test_serialization_roundtrip() -> None:
    router = BusRouter()
    gate = ReaderRestGate(
        name="reader_rest_gate",
        rest_threshold_seconds=10,
        cooldown_seconds=5,
    )
    gate.register(router)
    gate.mark_interaction(100.0)
    gate.tick(_tick(120.0))
    snapshot = gate.to_dict()

    gate2 = ReaderRestGate(name="reader_rest_gate")
    gate2.from_dict(snapshot)
    assert gate2._last_interaction_at == 100.0
    assert gate2._last_state == "resting"
