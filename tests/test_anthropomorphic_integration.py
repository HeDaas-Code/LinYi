# -*- coding: utf-8 -*-
"""Integration tests for anthropomorphic modules wired into MemorySystem."""
from __future__ import annotations

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.memory import MemorySystem
from src.novelist_brain.models import Fragment
from src.novelist_brain.self_timeline import SelfTimeline


def test_memory_system_filters_abstract_fragment() -> None:
    router = BusRouter()
    memory = MemorySystem(name="memory_system")
    memory.register(router)
    memory.init({})

    memory._receive_fragment(
        Fragment(content="今天状态有点复杂，心情不太好。", source="personal")
    )
    assert len(memory.fragments) == 0
    assert int(memory._state.custom.get("gated_fragments", 0)) >= 1


def test_memory_system_accepts_concrete_fragment_and_scores() -> None:
    router = BusRouter()
    memory = MemorySystem(name="memory_system")
    memory.register(router)
    memory.init({})

    fragment = Fragment(
        content="她把铅笔在指间转了三圈，没有落下一个字。",
        source="personal",
        modality="event",
        tags=["写作", "犹豫"],
    )
    memory._receive_fragment(fragment)
    assert len(memory.fragments) == 1
    assert fragment.salience > 0.0


def test_self_timeline_collects_bus_fragment() -> None:
    router = BusRouter()
    memory = MemorySystem(name="memory_system")
    timeline = SelfTimeline(name="self_timeline")
    memory.register(router)
    timeline.register(router)
    memory.init({})
    timeline.init({})

    router.publish(
        source="test",
        topic="fragment.personal.new",
        channel="data",
        payload={
            "content": "窗外的雨声变轻了。",
            "source": "personal",
            "modality": "observation",
            "tags": ["雨", "窗"],
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    assert len(timeline.entries) == 1
    entries = timeline.collect_entries("窗外")
    assert len(entries) == 1
    assert "雨声" in entries[0].summary
