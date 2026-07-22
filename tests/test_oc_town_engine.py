# -*- coding: utf-8 -*-
"""Tests for OCTownEngine."""
from __future__ import annotations

import datetime
import time
from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import OCCharacterSheet, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.oc_town_engine import (
    OCTownAgent,
    OCTownEngine,
    TOPIC_TOWN_EVENT,
)


def _sheet(character_id: str, name: str) -> OCCharacterSheet:
    return OCCharacterSheet(character_id=character_id, name=name)


def _tick(now: float, phase: str = "incubation") -> TickDelta:
    return TickDelta(
        absolute_time=now,
        delta_ms=1000.0,
        phase=phase,
    )


def test_register_and_retrieve_agent() -> None:
    engine = OCTownEngine(name="oc_town_engine")
    engine.init({})
    sheet = _sheet("oc_001", "阿青")
    agent = engine.register_agent(sheet)
    assert agent.runtime.character_id == "oc_001"
    assert agent.runtime.name == "阿青"
    assert engine.get_agent("oc_001") is agent


def test_agents_are_scattered_across_spaces() -> None:
    engine = OCTownEngine(name="oc_town_engine")
    engine.init({})
    engine.register_agent(_sheet("oc_001", "阿青"))
    engine.register_agent(_sheet("oc_002", "老周"))
    locations = {a.runtime.location for a in engine.list_agents()}
    assert locations
    assert all(locations)


def test_tick_generates_town_event() -> None:
    router = BusRouter()
    engine = OCTownEngine(name="oc_town_engine")
    engine.register(router)
    engine.init({"oc_town": {"tick_interval_seconds": 0, "seed": 1}})
    engine.register_agent(_sheet("oc_001", "阿青"))
    engine.register_agent(_sheet("oc_002", "老周"))

    captured: list[dict[str, Any]] = []
    original_emit = engine.emit

    def _capture_emit(**kwargs: Any) -> None:
        captured.append(kwargs)
        original_emit(**kwargs)

    engine.emit = _capture_emit  # type: ignore[method-assign]

    now = time.time()
    # Force many ticks to overcome randomness.
    for _ in range(500):
        engine.tick(_tick(now))
        now += 1.0

    assert len(captured) > 0
    kinds = {msg["payload"]["kind"] for msg in captured}
    assert "agent_moved" in kinds or "conversation" in kinds or "reflection" in kinds


def test_conversation_updates_relationship() -> None:
    router = BusRouter()
    engine = OCTownEngine(name="oc_town_engine")
    engine.register(router)
    engine.init({"oc_town": {"tick_interval_seconds": 0, "seed": 2}})
    a = engine.register_agent(_sheet("oc_001", "阿青"))
    b = engine.register_agent(_sheet("oc_002", "老周"))
    a.runtime.location = "咖啡馆"
    b.runtime.location = "咖啡馆"
    a.runtime.energy = 100.0
    b.runtime.energy = 100.0

    engine._run_conversation(a, b, time.time())

    rel_a = a.sheet.relationships.get("oc_002")
    rel_b = b.sheet.relationships.get("oc_001")
    assert rel_a is not None
    assert rel_b is not None
    assert rel_a.intensity > 0.0
    assert rel_b.intensity == rel_a.intensity


def test_external_event_is_published() -> None:
    router = BusRouter()
    engine = OCTownEngine(name="oc_town_engine")
    engine.register(router)
    engine.init({})

    class _SpyModule(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[Any] = []
            self.subscribe(TOPIC_TOWN_EVENT)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: Any) -> None:
            self.messages.append(message)

        def tick(self, delta: TickDelta) -> None:
            return None

    spy = _SpyModule()
    router.subscribe(spy)

    engine.inject_event("一阵雨打湿了街道", {"weather": "rain"})
    router.flush()

    assert len(spy.messages) == 1
    assert spy.messages[0].topic == TOPIC_TOWN_EVENT
    assert "雨打湿了街道" in spy.messages[0].payload["summary"]


def test_serialization_roundtrip() -> None:
    engine = OCTownEngine(name="oc_town_engine")
    engine.init({"oc_town": {"seed": 3}})
    engine.register_agent(_sheet("oc_001", "阿青"))
    snapshot = engine.to_dict()

    engine2 = OCTownEngine(name="oc_town_engine")
    engine2.from_dict(snapshot)
    assert len(engine2.list_agents()) == 1
    assert engine2.list_agents()[0].runtime.name == "阿青"
