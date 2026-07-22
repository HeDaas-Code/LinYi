# -*- coding: utf-8 -*-
"""Tests for RelationshipGraph."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage
from src.novelist_brain.module import Module
from src.novelist_brain.relationship_graph import (
    TOPIC_RELATIONSHIP_CONTROL,
    TOPIC_RELATIONSHIP_UPDATED,
    RelationshipGraph,
)


def test_update_creates_edge() -> None:
    router = BusRouter()
    graph = RelationshipGraph(name="relationship_graph")
    graph.register(router)
    graph.init({})
    edge = graph.update("oc_a", "oc_b", "affinity", 0.2, evidence="初次见面")
    assert edge.weight == 0.2
    assert graph.get_edge("oc_a", "oc_b", "affinity") is not None


def test_update_clamps_weight() -> None:
    router = BusRouter()
    graph = RelationshipGraph(name="relationship_graph")
    graph.register(router)
    graph.init({})
    edge = graph.update("oc_a", "oc_b", "affinity", 2.0)
    assert edge.weight == 1.0
    edge = graph.update("oc_a", "oc_b", "affinity", -3.0)
    assert edge.weight == -1.0


def test_query_filters_by_source_and_kind() -> None:
    router = BusRouter()
    graph = RelationshipGraph(name="relationship_graph")
    graph.register(router)
    graph.init({})
    graph.update("oc_a", "oc_b", "affinity", 0.5)
    graph.update("oc_a", "oc_b", "trust", 0.3)
    graph.update("oc_b", "oc_a", "affinity", 0.4)

    affinity_edges = graph.query(source="oc_a", kind="affinity")
    assert len(affinity_edges) == 1
    assert affinity_edges[0].target == "oc_b"


def test_neighbors_returns_sorted_targets() -> None:
    router = BusRouter()
    graph = RelationshipGraph(name="relationship_graph")
    graph.register(router)
    graph.init({})
    graph.update("oc_a", "oc_b", "affinity", 0.3)
    graph.update("oc_a", "oc_c", "affinity", 0.7)

    neighbors = graph.neighbors("oc_a", kind="affinity")
    assert [n[0] for n in neighbors] == ["oc_c", "oc_b"]


def test_town_conversation_updates_relationships() -> None:
    router = BusRouter()
    graph = RelationshipGraph(name="relationship_graph")
    graph.register(router)
    graph.init({})

    router.publish(
        source="oc_town_engine",
        topic="data.oc.town.event",
        channel="data",
        payload={
            "kind": "conversation",
            "summary": "阿青和老周聊起了天气",
            "timestamp": 1000.0,
            "extra": {
                "agent_id": "aqing",
                "partner_id": "laozhou",
                "relationship_delta": 0.06,
            },
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    router.flush()

    assert graph.get_edge("aqing", "laozhou", "affinity") is not None
    assert graph.get_edge("aqing", "laozhou", "affinity").weight == 0.06
    assert graph.get_edge("laozhou", "aqing", "familiarity") is not None


def test_reader_interaction_updates_affinity() -> None:
    router = BusRouter()
    graph = RelationshipGraph(name="relationship_graph")
    graph.register(router)
    graph.init({})

    router.publish(
        source="ui",
        topic="event.reader.interaction",
        channel="event",
        payload={
            "oc_id": "aqing",
            "summary": "读者称赞了阿青",
            "timestamp": 1000.0,
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    router.flush()

    edge = graph.get_edge("reader:default_reader", "aqing", "affinity")
    assert edge is not None
    assert edge.weight > 0


def test_control_update_sets_weight() -> None:
    router = BusRouter()
    graph = RelationshipGraph(name="relationship_graph")
    graph.register(router)
    graph.init({})

    router.publish(
        source="test",
        topic=TOPIC_RELATIONSHIP_CONTROL,
        channel="control",
        payload={
            "source": "reader:default_reader",
            "target": "aqing",
            "kind": "trust",
            "weight": 0.8,
            "evidence": "直接设定",
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    router.flush()

    assert graph.get_edge("reader:default_reader", "aqing", "trust").weight == 0.8


def test_update_emits_event() -> None:
    router = BusRouter()
    graph = RelationshipGraph(name="relationship_graph")
    graph.register(router)
    graph.init({})

    class _SpyModule(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[BusMessage] = []
            self.subscribe(TOPIC_RELATIONSHIP_UPDATED)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: BusMessage) -> None:
            self.messages.append(message)

        def tick(self, delta: Any) -> None:
            return None

    spy = _SpyModule()
    router.subscribe(spy)

    graph.update("oc_a", "oc_b", "affinity", 0.2)
    router.flush()

    assert len(spy.messages) == 1
    assert spy.messages[0].payload["source"] == "oc_a"
    assert spy.messages[0].payload["target"] == "oc_b"


def test_serialization_roundtrip() -> None:
    router = BusRouter()
    graph = RelationshipGraph(name="relationship_graph")
    graph.register(router)
    graph.init({})
    graph.update("oc_a", "oc_b", "affinity", 0.5, evidence="测试")
    snapshot = graph.to_dict()

    graph2 = RelationshipGraph(name="relationship_graph")
    graph2.from_dict(snapshot)
    edge = graph2.get_edge("oc_a", "oc_b", "affinity")
    assert edge is not None
    assert edge.weight == 0.5
    assert edge.evidence == "测试"
