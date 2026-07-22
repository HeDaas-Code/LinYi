# -*- coding: utf-8 -*-
"""Tests for MemoryStream + ConversationQueue hybrid retrieval.

Inspired by the a16z companion-app pattern: vector long-term memory plus a
recent conversation queue.
"""
from __future__ import annotations

import time

from src.novelist_brain.conversation_queue import ConversationQueue
from src.novelist_brain.memory_stream import MemoryStream


def test_hybrid_retrieval_includes_recent_turns() -> None:
    queue = ConversationQueue(name="conversation_queue", max_turns=5)
    queue.init({})
    stream = MemoryStream(
        name="memory_stream",
        conversation_queue=queue,
        hybrid_enabled=True,
        hybrid_recent_limit=5,
        hybrid_recent_boost=0.5,
        retrieval_weights={"recency": 0.0, "importance": 0.0, "relevance": 1.0},
    )
    stream.init({})

    # A stream entry that contains the keyword.
    stream.add(kind="observation", content="过去关于雨的记忆", importance=0.5)
    # A recent conversation turn that also contains the keyword.
    queue.add("user", "你记得雨吗？")

    results = stream.retrieve("雨", limit=2)
    contents = [r.content for r in results]
    assert "你记得雨吗？" in contents
    assert "过去关于雨的记忆" in contents


def test_recent_turn_boost_wins_when_relevance_is_equal() -> None:
    queue = ConversationQueue(name="conversation_queue", max_turns=5)
    queue.init({})
    stream = MemoryStream(
        name="memory_stream",
        conversation_queue=queue,
        hybrid_enabled=True,
        hybrid_recent_limit=5,
        hybrid_recent_boost=1.0,
        retrieval_weights={"recency": 0.0, "importance": 0.0, "relevance": 0.0},
    )
    stream.init({})

    stream.add(kind="observation", content="stream entry", importance=0.5)
    queue.add("agent", "recent turn")

    results = stream.retrieve("", limit=2)
    assert results[0].content == "recent turn"
    assert results[0].kind == "conversation_turn"


def test_disabled_hybrid_ignores_queue() -> None:
    queue = ConversationQueue(name="conversation_queue", max_turns=5)
    queue.init({})
    stream = MemoryStream(
        name="memory_stream",
        conversation_queue=queue,
        hybrid_enabled=False,
    )
    stream.init({})

    stream.add(kind="observation", content="stream entry", importance=0.5)
    queue.add("user", "recent turn")

    results = stream.retrieve("", limit=5)
    assert len(results) == 1
    assert results[0].content == "stream entry"


def test_config_from_context_enables_hybrid() -> None:
    queue = ConversationQueue(name="conversation_queue", max_turns=5)
    queue.init({})
    stream = MemoryStream(name="memory_stream")
    stream.init(
        {
            "conversation_queue_instance": queue,
            "memory_stream": {
                "hybrid": {
                    "enabled": True,
                    "recent_limit": 3,
                    "recent_boost": 0.2,
                }
            },
        }
    )

    assert stream._hybrid_enabled is True
    assert stream._conversation_queue is queue


def test_serialization_roundtrip_preserves_hybrid_config() -> None:
    queue = ConversationQueue(name="conversation_queue", max_turns=5)
    queue.init({})
    stream = MemoryStream(
        name="memory_stream",
        conversation_queue=queue,
        hybrid_enabled=True,
        hybrid_recent_limit=7,
        hybrid_recent_boost=0.15,
    )
    stream.init({})
    stream.add(kind="observation", content="x", importance=0.5)

    snapshot = stream.to_dict()
    stream2 = MemoryStream(name="memory_stream")
    stream2.from_dict(snapshot)

    assert stream2._hybrid_enabled is True
    assert stream2._hybrid_recent_limit == 7
    assert stream2._hybrid_recent_boost == 0.15
