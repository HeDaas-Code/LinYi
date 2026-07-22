# -*- coding: utf-8 -*-
"""Tests for OC social memory retrieval and memory-aware conversation."""
from __future__ import annotations

import time
from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import OCCharacterSheet
from src.novelist_brain.oc_town_engine import OCTownEngine


def _sheet(character_id: str, name: str) -> OCCharacterSheet:
    return OCCharacterSheet(character_id=character_id, name=name)


def _engine_with_two_agents() -> tuple[BusRouter, OCTownEngine, Any, Any]:
    router = BusRouter()
    engine = OCTownEngine(name="oc_town_engine")
    engine.register(router)
    engine.init({"oc_town": {"tick_interval_seconds": 0, "seed": 9}})
    a = engine.register_agent(_sheet("oc_001", "阿青"))
    b = engine.register_agent(_sheet("oc_002", "老周"))
    a.runtime.location = "咖啡馆"
    b.runtime.location = "咖啡馆"
    a.runtime.energy = 100.0
    b.runtime.energy = 100.0
    return router, engine, a, b


def test_memories_about_filters_by_target() -> None:
    router, engine, a, b = _engine_with_two_agents()
    now = time.time()
    a.remember("oc_002", "conversation", "与 老周 聊到 天气", timestamp=now)
    a.remember("oc_003", "conversation", "与 小李 聊到 书", timestamp=now)

    about_b = a.memories_about("oc_002")
    assert len(about_b) == 1
    assert "老周" in about_b[0].content


def test_memories_about_sorts_by_importance_and_recency() -> None:
    router, engine, a, b = _engine_with_two_agents()
    now = time.time()
    # Important memory from one hour ago.
    a.remember(
        "oc_002",
        "conversation",
        "过去的重大秘密",
        importance=0.9,
        timestamp=now - 3600,
    )
    # Recent but less important memory.
    a.remember(
        "oc_002",
        "conversation",
        "刚打招呼",
        importance=0.3,
        timestamp=now,
    )

    result = a.memories_about("oc_002", limit=1, now=now)
    assert len(result) == 1
    # With a 6-hour half-life, a 1-hour-old high-importance memory still
    # outranks a fresh low-importance memory.
    assert result[0].content == "过去的重大秘密"


def test_conversation_uses_memory_about_partner() -> None:
    router, engine, a, b = _engine_with_two_agents()
    now = time.time()

    # Seed a prior memory so the next conversation is clearly memory-aware.
    a.remember(
        "oc_002",
        "conversation",
        "与 老周 聊到 天气",
        importance=0.6,
        timestamp=now - 60,
    )

    captured: list[dict[str, Any]] = []
    original_emit = engine.emit

    def _capture_emit(**kwargs: Any) -> None:
        captured.append(kwargs)
        original_emit(**kwargs)

    engine.emit = _capture_emit  # type: ignore[method-assign]

    engine._run_conversation(a, b, now)

    assert len(captured) == 1
    event = captured[0]
    assert event["payload"]["kind"] == "conversation"
    assert event["payload"]["extra"]["topic"] == "天气"
    assert "想起" in event["payload"]["summary"]


def test_match_topic_maps_memory_content() -> None:
    engine = OCTownEngine(name="oc_town_engine")
    engine.init({})
    assert engine._match_topic("昨晚梦见了海") == "昨晚的梦"
    assert engine._match_topic("最近很烦恼") == "各自的烦恼"
    assert engine._match_topic("未来的计划") == "未来的计划"
    assert engine._match_topic("刚读到的一句话") == "刚读到的一句话"
    assert engine._match_topic("今天天气不错") == "天气"
    assert engine._match_topic("一个共同的回忆") == "一个共同的回忆"
    assert engine._match_topic("街角新开的店") == "街角新开的店"
    assert engine._match_topic("无关内容") is None
