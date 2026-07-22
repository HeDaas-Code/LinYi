# -*- coding: utf-8 -*-
"""Tests for MemoryStream."""
from __future__ import annotations

import time
from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.memory_stream import (
    TOPIC_MEMORY_STREAM_UPDATE,
    TOPIC_PAGE_IN,
    TOPIC_PAGE_OUT,
    MemoryStream,
)
from src.novelist_brain.models import BusMessage
from src.novelist_brain.module import Module


def test_add_and_retrieve() -> None:
    stream = MemoryStream(name="memory_stream")
    stream.init({})
    entry = stream.add(kind="observation", content="早上喝了一杯咖啡", importance=0.6)
    assert entry.entry_id in stream._entries
    assert stream.get(entry.entry_id) is not None


def test_retrieval_weights_recency_importance_relevance() -> None:
    stream = MemoryStream(
        name="memory_stream",
        retrieval_weights={"recency": 0.0, "importance": 1.0, "relevance": 0.0},
    )
    stream.init({})
    stream.add(kind="observation", content="低重要性事件", importance=0.1)
    important = stream.add(kind="observation", content="高重要性事件", importance=0.9)
    results = stream.retrieve(limit=1)
    assert len(results) == 1
    assert results[0].entry_id == important.entry_id


def test_page_in_moves_to_working_memory() -> None:
    router = BusRouter()
    stream = MemoryStream(name="memory_stream", working_capacity=5)
    stream.register(router)
    stream.init({})
    entry = stream.add(kind="observation", content="关于雨的记忆", importance=0.5)
    stream.page_in("雨", limit=5)
    assert entry.entry_id in stream._working_ids
    assert len(stream.working_entries()) == 1


def test_page_out_creates_reflection() -> None:
    router = BusRouter()
    stream = MemoryStream(name="memory_stream")
    stream.register(router)
    stream.init({})
    reflection = stream.page_out("最近总在深夜工作")
    assert reflection.kind == "reflection"
    assert "深夜工作" in reflection.content


def test_bus_events_populate_stream() -> None:
    router = BusRouter()
    stream = MemoryStream(name="memory_stream")
    stream.register(router)
    stream.init({})

    router.publish(
        source="oc_town_engine",
        topic="data.oc.town.event",
        channel="data",
        payload={"kind": "conversation", "summary": "阿青和老周聊起了天气"},
        priority=5,
        ttl=3,
    )
    router.flush()

    assert len(stream._entries) == 1
    assert "阿青" in list(stream._entries.values())[0].content


def test_page_in_control_topic() -> None:
    router = BusRouter()
    stream = MemoryStream(name="memory_stream")
    stream.register(router)
    stream.init({})

    class _SpyModule(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[BusMessage] = []
            self.subscribe(TOPIC_MEMORY_STREAM_UPDATE)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: BusMessage) -> None:
            self.messages.append(message)

        def tick(self, delta: Any) -> None:
            return None

    spy = _SpyModule()
    router.subscribe(spy)

    stream.add(kind="observation", content="读者喜欢科幻题材", importance=0.7)
    router.publish(
        source="test",
        topic=TOPIC_PAGE_IN,
        channel="control",
        payload={"query": "读者喜欢", "limit": 5},
        priority=5,
        ttl=3,
    )
    router.flush()
    # Messages emitted while handling the control message are queued for the
    # next flush cycle, so drain the inbox a second time.
    router.flush()

    updates = [m for m in spy.messages if m.topic == TOPIC_MEMORY_STREAM_UPDATE]
    assert len(updates) == 1
    assert updates[0].payload["action"] == "page_in"


def test_capacity_eviction() -> None:
    stream = MemoryStream(name="memory_stream", stream_capacity=3)
    stream.init({})
    stream.add(kind="observation", content="第一条", importance=0.1)
    time.sleep(0.01)
    stream.add(kind="observation", content="第二条", importance=0.1)
    time.sleep(0.01)
    stream.add(kind="observation", content="第三条", importance=0.1)
    time.sleep(0.01)
    stream.add(kind="observation", content="第四条", importance=0.9)
    assert len(stream._entries) == 3
    assert "第一条" not in {e.content for e in stream._entries.values()}


def test_serialization_roundtrip() -> None:
    stream = MemoryStream(name="memory_stream")
    stream.init({})
    stream.add(kind="observation", content="可序列化的记忆", importance=0.6)
    snapshot = stream.to_dict()

    stream2 = MemoryStream(name="memory_stream")
    stream2.from_dict(snapshot)
    assert len(stream2._entries) == 1
    assert list(stream2._entries.values())[0].content == "可序列化的记忆"
