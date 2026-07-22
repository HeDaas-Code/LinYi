# -*- coding: utf-8 -*-
"""Tests for ConversationQueue."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.conversation_queue import (
    TOPIC_CONVERSATION_QUEUE_UPDATE,
    ConversationQueue,
    ConversationTurn,
)


def test_add_turn_and_capacity() -> None:
    queue = ConversationQueue(name="conversation_queue", max_turns=3)
    queue.init({})

    queue.add("user", "你好")
    queue.add("agent", "你好呀")
    queue.add("user", "今天怎么样")
    queue.add("agent", "还不错")

    assert len(queue._turns) == 3
    assert queue._turns[0].content == "你好呀"
    assert queue._turns[-1].content == "还不错"


def test_recent_turns_order() -> None:
    queue = ConversationQueue(name="conversation_queue", max_turns=5)
    queue.init({})

    queue.add("user", "a")
    queue.add("agent", "b")
    queue.add("user", "c")

    recent = queue.recent_turns(2)
    assert len(recent) == 2
    assert recent[0].content == "b"
    assert recent[1].content == "c"


def test_bus_reader_interaction_creates_turn() -> None:
    router = BusRouter()
    queue = ConversationQueue(name="conversation_queue")
    queue.register(router)
    queue.init({})
    router.flush()

    router.publish(
        source="ui",
        topic="event.reader.interaction",
        channel="event",
        payload={"summary": "读者说喜欢你的文字", "content": "读者说喜欢你的文字"},
        priority=5,
        ttl=3,
    )
    router.flush()

    assert len(queue._turns) == 1
    assert queue._turns[0].role == "user"
    assert "喜欢你的文字" in queue._turns[0].content


def test_bus_agent_response_creates_turn() -> None:
    router = BusRouter()
    queue = ConversationQueue(name="conversation_queue")
    queue.register(router)
    queue.init({})
    router.flush()

    router.publish(
        source="agent",
        topic="data.agent.response",
        channel="data",
        payload={"content": "谢谢你的喜欢"},
        priority=5,
        ttl=3,
    )
    router.flush()

    assert len(queue._turns) == 1
    assert queue._turns[0].role == "agent"


def test_get_recent_control_topic() -> None:
    router = BusRouter()
    queue = ConversationQueue(name="conversation_queue")
    queue.register(router)
    queue.init({})
    router.flush()

    queue.add("user", "第一")
    queue.add("agent", "第二")

    router.publish(
        source="test",
        topic="control.conversation.queue.get_recent",
        channel="control",
        payload={"limit": 2},
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    updates = [m for m in delivered if m.topic == TOPIC_CONVERSATION_QUEUE_UPDATE]
    snapshot_msgs = [m for m in updates if m.payload.get("action") == "snapshot"]
    assert len(snapshot_msgs) == 1
    assert len(snapshot_msgs[0].payload["turns"]) == 2


def test_clear_queue() -> None:
    queue = ConversationQueue(name="conversation_queue")
    queue.init({})
    queue.add("user", "hello")
    queue.clear()
    assert len(queue._turns) == 0


def test_serialization_roundtrip() -> None:
    queue = ConversationQueue(name="conversation_queue", max_turns=5)
    queue.init({})
    queue.add("user", "hello")
    queue.add("agent", "hi")

    snapshot = queue.to_dict()
    queue2 = ConversationQueue(name="conversation_queue")
    queue2.from_dict(snapshot)

    assert queue2._max_turns == 5
    assert len(queue2._turns) == 2
    assert queue2._turns[0].role == "user"
    assert queue2._turns[1].content == "hi"
