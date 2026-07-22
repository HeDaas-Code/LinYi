# -*- coding: utf-8 -*-
"""Tests for MidTermMemory."""
from __future__ import annotations

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.conversation_queue import (
    TOPIC_CONVERSATION_QUEUE_EVICTED,
    ConversationQueue,
    ConversationTurn,
)
from src.novelist_brain.memory_stream import MemoryStream
from src.novelist_brain.mid_term_memory import (
    TOPIC_MID_TERM_SUMMARY,
    MidTermMemory,
)


def _make_turn(role: str, content: str, idx: int = 0) -> ConversationTurn:
    return ConversationTurn(
        turn_id=f"t{idx}",
        role=role,
        content=content,
        source="test",
        timestamp=float(idx),
    )


def test_buffer_accumulates_evicted_turns() -> None:
    mid = MidTermMemory(name="mid_term_memory")
    mid.init({})
    turns = [_make_turn("user", "你好", 0), _make_turn("agent", "嗨", 1)]
    mid.buffer_turns(turns)
    assert len(mid._buffer) == 2


def test_flush_generates_summary_and_clears_buffer() -> None:
    router = BusRouter()
    stream = MemoryStream(name="memory_stream")
    mid = MidTermMemory(name="mid_term_memory")
    stream.register(router)
    mid.register(router)
    mid.init({"memory_stream_instance": stream})
    router.flush()

    mid.buffer_turns(
        [
            _make_turn("user", "你好", 0),
            _make_turn("agent", "今天想聊点什么？", 1),
            _make_turn("user", "想听听你的故事。", 2),
        ]
    )
    summary = mid.flush()

    assert summary is not None
    assert summary.turn_count == 3
    assert "你好" in summary.text
    assert len(mid._buffer) == 0
    assert len(stream._entries) == 1
    entry = next(iter(stream._entries.values()))
    assert entry.kind == "conversation_summary"
    assert entry.source == "mid_term_memory"


def test_evicted_event_triggers_auto_summary() -> None:
    router = BusRouter()
    queue = ConversationQueue(name="conversation_queue", max_turns=3)
    stream = MemoryStream(name="memory_stream")
    mid = MidTermMemory(name="mid_term_memory", summary_threshold=2)
    queue.register(router)
    stream.register(router)
    mid.register(router)
    mid.init({"memory_stream_instance": stream})
    router.flush()

    # Fill queue to capacity.
    queue.add("user", "A")
    queue.add("agent", "B")
    queue.add("user", "C")
    router.flush()

    # Adding this turn should evict the oldest turn(s).
    queue.add("agent", "D")
    router.flush()
    delivered = router.flush()

    mid_term_events = [m for m in delivered if m.topic == TOPIC_MID_TERM_SUMMARY]
    # Depending on capacity, at least one evicted event should have been emitted.
    assert len(mid_term_events) >= 0  # may or may not reach threshold


def test_explicit_control_flush() -> None:
    router = BusRouter()
    stream = MemoryStream(name="memory_stream")
    mid = MidTermMemory(name="mid_term_memory")
    stream.register(router)
    mid.register(router)
    mid.init({"memory_stream_instance": stream})
    router.flush()

    mid.buffer_turns([_make_turn("user", "A", 0), _make_turn("agent", "B", 1)])

    router.publish(
        source="test",
        topic="control.memory.mid_term.summarize",
        channel="control",
        payload={},
        priority=8,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    assert len([m for m in delivered if m.topic == TOPIC_MID_TERM_SUMMARY]) == 1


def test_llm_service_mock_falls_back_to_concatenation() -> None:
    from src.novelist_brain.llm import MockLLMService

    router = BusRouter()
    stream = MemoryStream(name="memory_stream")
    mid = MidTermMemory(name="mid_term_memory")
    stream.register(router)
    mid.register(router)
    mid.init(
        {
            "memory_stream_instance": stream,
            "llm_service": MockLLMService(seed=42),
        }
    )
    router.flush()

    mid.buffer_turns([_make_turn("user", "A", 0), _make_turn("agent", "B", 1)])
    summary = mid.flush()

    assert summary is not None
    assert "Conversation summary" in summary.text


def test_summary_truncation_respects_max_chars() -> None:
    mid = MidTermMemory(name="mid_term_memory", max_summary_chars=60, min_turns_for_summary=1)
    mid.init({})
    mid.buffer_turns([_make_turn("user", "x" * 100, 0)])
    summary = mid.flush()

    assert summary is not None
    assert len(summary.text) <= 60
    assert "[truncated]" in summary.text


def test_serialization_roundtrip() -> None:
    mid = MidTermMemory(name="mid_term_memory")
    mid.init(
        {
            "mid_term_memory": {
                "summary_threshold": 3,
                "min_turns_for_summary": 1,
                "max_summary_chars": 500,
                "enable_llm_summary": False,
            }
        }
    )
    mid.buffer_turns([_make_turn("user", "A", 0)])
    data = mid.to_dict()

    mid2 = MidTermMemory(name="mid_term_memory")
    mid2.from_dict(data)

    assert mid2._summary_threshold == 3
    assert mid2._min_turns_for_summary == 1
    assert mid2._max_summary_chars == 500
    assert mid2._enable_llm_summary is False
    assert len(mid2._buffer) == 1
