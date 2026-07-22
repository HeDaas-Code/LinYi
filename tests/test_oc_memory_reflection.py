# -*- coding: utf-8 -*-
"""Tests for OCMemory reflection triggered by OCTownEngine."""
from __future__ import annotations

import time
from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage, OCCharacterSheet
from src.novelist_brain.module import Module
from src.novelist_brain.oc_town_engine import (
    OCTownEngine,
    TOPIC_TOWN_REFLECTION,
)
from src.novelist_brain.relationship_graph import RelationshipGraph


def _sheet(character_id: str, name: str) -> OCCharacterSheet:
    return OCCharacterSheet(character_id=character_id, name=name)


class _ReflectionSpy(Module):
    def __init__(self) -> None:
        super().__init__("reflection_spy")
        self.messages: list[BusMessage] = []
        self.subscribe(TOPIC_TOWN_REFLECTION)

    def init(self, context: dict[str, Any]) -> None:
        return None

    def on_bus_message(self, message: BusMessage) -> None:
        self.messages.append(message)

    def tick(self, delta: Any) -> None:
        return None


def _engine_with_agents(
    reflection_threshold: float = 1.5,
) -> tuple[BusRouter, OCTownEngine, Any, Any]:
    router = BusRouter()
    engine = OCTownEngine(name="oc_town_engine")
    engine.register(router)
    engine.init(
        {
            "oc_town": {
                "tick_interval_seconds": 0,
                "seed": 7,
                "reflection_threshold": reflection_threshold,
                "reflection_window": 24 * 3600,
            }
        }
    )
    a = engine.register_agent(_sheet("oc_001", "阿青"))
    b = engine.register_agent(_sheet("oc_002", "老周"))
    a.runtime.location = "咖啡馆"
    b.runtime.location = "咖啡馆"
    a.runtime.energy = 100.0
    b.runtime.energy = 100.0
    return router, engine, a, b


def test_no_reflection_when_below_threshold() -> None:
    router, engine, a, b = _engine_with_agents()
    spy = _ReflectionSpy()
    router.subscribe(spy)

    engine._run_conversation(a, b, time.time())
    router.flush()

    assert len(spy.messages) == 0
    assert all(not m.reflected for m in a.social_memory)
    assert all(not m.reflected for m in b.social_memory)


def test_reflection_triggered_after_threshold() -> None:
    router, engine, a, b = _engine_with_agents()
    spy = _ReflectionSpy()
    router.subscribe(spy)

    now = time.time()
    for _ in range(3):
        engine._run_conversation(a, b, now)
        now += 1.0

    router.flush()

    assert len(spy.messages) == 2
    agent_ids = {m.payload["extra"]["agent_id"] for m in spy.messages}
    assert agent_ids == {"oc_001", "oc_002"}

    # Source conversation entries should now be marked as reflected.
    conversation_entries_a = [m for m in a.social_memory if m.kind == "conversation"]
    assert len(conversation_entries_a) == 3
    assert all(m.reflected for m in conversation_entries_a)

    reflection_entries_a = [m for m in a.social_memory if m.kind == "reflection"]
    assert len(reflection_entries_a) == 1
    assert reflection_entries_a[0].source_entry_ids
    assert reflection_entries_a[0].reflected


def test_reflection_content_mentions_top_target() -> None:
    router, engine, a, b = _engine_with_agents()
    spy = _ReflectionSpy()
    router.subscribe(spy)

    now = time.time()
    for _ in range(3):
        engine._run_conversation(a, b, now)
        now += 1.0

    router.flush()

    for msg in spy.messages:
        insights = msg.payload["extra"]["insights"]
        assert any("老周" in insight or "阿青" in insight for insight in insights)


def test_reflection_updates_relationship_graph() -> None:
    router = BusRouter()
    engine = OCTownEngine(name="oc_town_engine")
    graph = RelationshipGraph(name="relationship_graph")
    engine.register(router)
    graph.register(router)
    engine.init(
        {
            "oc_town": {
                "tick_interval_seconds": 0,
                "seed": 8,
                "reflection_threshold": 1.5,
                "reflection_window": 24 * 3600,
            }
        }
    )
    graph.init({})

    a = engine.register_agent(_sheet("oc_001", "阿青"))
    b = engine.register_agent(_sheet("oc_002", "老周"))
    a.runtime.location = "咖啡馆"
    b.runtime.location = "咖啡馆"
    a.runtime.energy = 100.0
    b.runtime.energy = 100.0

    now = time.time()
    for _ in range(3):
        engine._run_conversation(a, b, now)
        now += 1.0

    router.flush()
    router.flush()

    edge = graph.get_edge("oc_001", "oc_002", "familiarity")
    assert edge is not None
    assert edge.weight > 0.03  # conversation + reflection bumps


def test_serialization_preserves_reflected_state() -> None:
    router, engine, a, b = _engine_with_agents()
    spy = _ReflectionSpy()
    router.subscribe(spy)

    now = time.time()
    for _ in range(3):
        engine._run_conversation(a, b, now)
        now += 1.0

    router.flush()
    snapshot = engine.to_dict()

    engine2 = OCTownEngine(name="oc_town_engine")
    engine2.from_dict(snapshot)
    restored_a = engine2.get_agent("oc_001")
    assert restored_a is not None
    conversation_entries = [m for m in restored_a.social_memory if m.kind == "conversation"]
    assert len(conversation_entries) == 3
    assert all(m.reflected for m in conversation_entries)
    reflection_entries = [m for m in restored_a.social_memory if m.kind == "reflection"]
    assert len(reflection_entries) == 1
    assert reflection_entries[0].source_entry_ids
