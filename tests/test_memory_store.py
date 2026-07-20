"""Tests for the local SQLite-backed hybrid memory store (Design.md §8 / §14)."""

from __future__ import annotations

import os
import tempfile

import pytest

from src.novelist_brain.memory_store import HybridMemoryStore, _cosine_similarity
from src.novelist_brain.models import Fragment, SocialTrace, Trace


def test_fragment_roundtrip() -> None:
    store = HybridMemoryStore(":memory:")
    fragment = Fragment(
        content="雨夜的咖啡馆",
        source="social",
        modality="scene",
        valence=-0.2,
        arousal=0.4,
        salience=0.6,
        timestamp=1_000_000.0,
        tags=["雨", "咖啡馆", "夜晚"],
        embedding=[0.1, 0.2, 0.3],
    )
    store.save_fragment(fragment)

    loaded = store.get_fragment(fragment.id)
    assert loaded is not None
    assert loaded.content == fragment.content
    assert loaded.tags == fragment.tags
    assert loaded.embedding == fragment.embedding


def test_trace_roundtrip() -> None:
    store = HybridMemoryStore(":memory:")
    trace = Trace(
        fragment_ids=["f1", "f2"],
        importance=0.7,
        recency=0.5,
        relevance=0.6,
        emotional_weight=0.4,
        narrative_role="mood",
        content="雨夜的记忆",
        tags=["雨", "记忆"],
    )
    store.save_trace(trace)

    loaded = store.get_trace(trace.id)
    assert loaded is not None
    assert loaded.content == trace.content
    assert loaded.narrative_role == "mood"
    assert loaded.fragment_ids == ["f1", "f2"]


def test_social_trace_roundtrip() -> None:
    store = HybridMemoryStore(":memory:")
    trace = SocialTrace(
        fragment_ids=["f1"],
        importance=0.5,
        recency=0.5,
        relevance=0.5,
        emotional_weight=0.3,
        narrative_role="event",
        content="与房东的冲突",
        tags=["社交", "冲突"],
        space_id="home",
        dialogue_mode="intimate",
        gaze_pressure=0.4,
        relationship_delta={"target_id": "landlord", "delta": -0.1},
    )
    store.save_trace(trace)

    loaded = store.get_trace(trace.id)
    assert isinstance(loaded, SocialTrace)
    assert loaded.space_id == "home"
    assert loaded.dialogue_mode == "intimate"


def test_list_fragments_by_source_and_time() -> None:
    store = HybridMemoryStore(":memory:")
    f1 = Fragment(content="a", source="personal", timestamp=100.0, tags=["x"])
    f2 = Fragment(content="b", source="social", timestamp=200.0, tags=["x"])
    f3 = Fragment(content="c", source="social", timestamp=300.0, tags=["x"])
    for f in (f1, f2, f3):
        store.save_fragment(f)

    social = store.list_fragments(source="social")
    assert len(social) == 2
    assert social[0].timestamp == 300.0

    recent = store.list_fragments(since=150.0)
    assert len(recent) == 2


def test_vector_similarity() -> None:
    store = HybridMemoryStore(":memory:")
    f1 = Fragment(
        content="猫", source="personal", tags=["动物"], embedding=[1.0, 0.0, 0.0]
    )
    f2 = Fragment(
        content="狗", source="personal", tags=["动物"], embedding=[0.9, 0.1, 0.0]
    )
    f3 = Fragment(
        content="汽车", source="personal", tags=["物品"], embedding=[0.0, 1.0, 0.0]
    )
    for f in (f1, f2, f3):
        store.save_fragment(f)

    results = store.find_similar_fragments([1.0, 0.0, 0.0], top_k=2)
    assert len(results) == 2
    assert results[0][0].content == "猫"
    assert results[1][0].content == "狗"


def test_graph_edges_and_neighbors() -> None:
    store = HybridMemoryStore(":memory:")
    store.add_edge("f1", "f2", "related", weight=0.8)
    store.add_edge("f2", "f1", "related", weight=0.6)
    store.add_edge("f1", "t1", "fragment_to_trace", weight=0.9)

    outgoing = store.get_neighbors("f1", direction="outgoing")
    assert len(outgoing) == 2

    incoming = store.get_neighbors("f2", direction="incoming")
    assert len(incoming) == 1

    both = store.get_neighbors("f1", direction="both")
    assert len(both) == 3


def test_graph_rank() -> None:
    store = HybridMemoryStore(":memory:")
    store.add_edge("a", "b", "related", weight=1.0)
    store.add_edge("b", "c", "related", weight=1.0)
    store.add_edge("c", "a", "related", weight=1.0)

    ranks = store.graph_rank(["a", "b", "c"], iterations=20)
    assert set(ranks) == {"a", "b", "c"}
    # Symmetric cycle should yield roughly uniform scores.
    for score in ranks.values():
        assert score > 0.0


def test_events_logged() -> None:
    store = HybridMemoryStore(":memory:")
    f = Fragment(content="x", source="personal", tags=["x"])
    store.save_fragment(f)

    events = store.query_events(event_type="fragment.stored", entity_id=f.id)
    assert len(events) == 1
    assert events[0]["payload"]["source"] == "personal"


def test_file_persistence() -> None:
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as tmp:
        path = tmp.name
    try:
        store = HybridMemoryStore(path)
        f = Fragment(content="持久化", source="personal", tags=["x"])
        store.save_fragment(f)
        store.close()

        store2 = HybridMemoryStore(path)
        loaded = store2.get_fragment(f.id)
        assert loaded is not None
        assert loaded.content == "持久化"
        store2.close()
    finally:
        os.unlink(path)


def test_cosine_similarity_identical_and_orthogonal() -> None:
    assert _cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert _cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)
    assert _cosine_similarity([1.0, 0.0], [0.0, 0.0]) == pytest.approx(0.0)