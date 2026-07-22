"""RelationshipGraph: evolving social graph between reader, OCs and the world.

Inspired by Zep's temporal knowledge graph and AI Town's relationship memory,
this module makes reader-OC and OC-OC relationships explicit, queryable and
mutable over time.  Other modules can subscribe to ``data.relationship.updated``
to react to social change (e.g. updating ExpressionState or selecting story
branches).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass


#: Topic emitted when a relationship edge changes.
TOPIC_RELATIONSHIP_UPDATED = "data.relationship.updated"

#: Topic used to update relationships directly from other modules.
TOPIC_RELATIONSHIP_CONTROL = "control.relationship.update"


@dataclass
class RelationshipEdge:
    """A single directed, typed relationship between two entities."""

    source: str
    target: str
    kind: str
    weight: float = 0.0
    timestamp: float = 0.0
    evidence: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.weight = max(-1.0, min(1.0, float(self.weight)))


class RelationshipGraph(Module):
    """Centralized social graph for reader, OCs and world entities."""

    DEFAULT_KINDS: tuple[str, ...] = ("affinity", "trust", "familiarity")

    def __init__(self, name: str = "relationship_graph") -> None:
        super().__init__(name)
        self._edges: dict[tuple[str, str, str], RelationshipEdge] = {}
        self._nodes: dict[str, dict[str, Any]] = {}
        self._reader_id: str = "default_reader"
        self.subscribe(
            "data.oc.town.event",
            "event.reader.interaction",
            "data.reader.profile.updated",
            TOPIC_RELATIONSHIP_CONTROL,
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "relationship_graph",
            "version": "0.1.0",
            "description": "Evolving social graph between reader, OCs and world entities",
            "dependencies": [],
            "category": "social",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "edge_count": 0,
                "node_count": 0,
                "updates_published": 0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def update(
        self,
        source: str,
        target: str,
        kind: str,
        delta: float,
        evidence: str = "",
        timestamp: float | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> RelationshipEdge:
        """Adjust the weight of a relationship edge by ``delta``."""
        now = timestamp if timestamp is not None else time.time()
        key = (source, target, kind)
        edge = self._edges.get(key)
        if edge is None:
            edge = RelationshipEdge(
                source=source,
                target=target,
                kind=kind,
                weight=0.0,
                timestamp=now,
                evidence=evidence,
                metadata=dict(metadata or {}),
            )
            self._edges[key] = edge
        edge.weight = max(-1.0, min(1.0, edge.weight + delta))
        edge.timestamp = now
        if evidence:
            edge.evidence = evidence
        if metadata:
            edge.metadata.update(metadata)
        self._ensure_node(source)
        self._ensure_node(target)
        self._state.custom["edge_count"] = len(self._edges)
        self._state.custom["node_count"] = len(self._nodes)
        self._publish_update(edge)
        return edge

    def set_weight(
        self,
        source: str,
        target: str,
        kind: str,
        weight: float,
        evidence: str = "",
        timestamp: float | None = None,
    ) -> RelationshipEdge:
        """Set an absolute edge weight."""
        now = timestamp if timestamp is not None else time.time()
        key = (source, target, kind)
        edge = self._edges.get(key)
        if edge is None:
            edge = RelationshipEdge(
                source=source,
                target=target,
                kind=kind,
                weight=0.0,
                timestamp=now,
                evidence=evidence,
            )
            self._edges[key] = edge
        edge.weight = max(-1.0, min(1.0, float(weight)))
        edge.timestamp = now
        if evidence:
            edge.evidence = evidence
        self._ensure_node(source)
        self._ensure_node(target)
        self._state.custom["edge_count"] = len(self._edges)
        self._state.custom["node_count"] = len(self._nodes)
        self._publish_update(edge)
        return edge

    def get_edge(
        self, source: str, target: str, kind: str
    ) -> RelationshipEdge | None:
        return self._edges.get((source, target, kind))

    def query(
        self,
        source: str | None = None,
        target: str | None = None,
        kind: str | None = None,
        min_weight: float | None = None,
        limit: int = 50,
    ) -> list[RelationshipEdge]:
        """Return edges matching the given filters, sorted by weight desc."""
        results: list[RelationshipEdge] = []
        for edge in self._edges.values():
            if source is not None and edge.source != source:
                continue
            if target is not None and edge.target != target:
                continue
            if kind is not None and edge.kind != kind:
                continue
            if min_weight is not None and edge.weight < min_weight:
                continue
            results.append(edge)
        results.sort(key=lambda e: e.weight, reverse=True)
        if limit > 0:
            results = results[:limit]
        return results

    def neighbors(
        self,
        source: str,
        kind: str | None = None,
        min_weight: float | None = None,
    ) -> list[tuple[str, float]]:
        """Return (target, weight) tuples for outgoing edges from ``source``."""
        edges = self.query(
            source=source, kind=kind, min_weight=min_weight, limit=100
        )
        return [(e.target, e.weight) for e in edges]

    def summary(self, source: str, target: str) -> dict[str, float]:
        """Return a map of relationship kinds between two entities."""
        return {
            e.kind: e.weight
            for e in self._edges.values()
            if (e.source == source and e.target == target)
        }

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        reader_cfg = context.get("reader_profile", {})
        reader_id = reader_cfg.get("reader_id") if isinstance(reader_cfg, dict) else None
        if isinstance(reader_id, str):
            self._reader_id = reader_id
        self._ensure_node(self._reader_node_id(), {"type": "reader"})

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        payload = message.payload or {}

        if message.topic == "data.oc.town.event":
            self._handle_town_event(payload)
            return

        if message.topic == "event.reader.interaction":
            self._handle_reader_interaction(payload)
            return

        if message.topic == "data.reader.profile.updated":
            self._handle_reader_profile_update(payload)
            return

        if message.topic == TOPIC_RELATIONSHIP_CONTROL:
            self._handle_control_update(payload)
            return

    def tick(self, delta: TickDelta) -> None:
        return None

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    def _handle_town_event(self, payload: dict[str, Any]) -> None:
        kind = payload.get("kind")
        extra = payload.get("extra", {})
        timestamp = payload.get("timestamp") or time.time()

        if kind == "conversation":
            agent_id = extra.get("agent_id")
            partner_id = extra.get("partner_id")
            delta = float(extra.get("relationship_delta", 0.05))
            if agent_id and partner_id:
                summary = payload.get("summary", "")
                self.update(
                    agent_id,
                    partner_id,
                    "affinity",
                    delta,
                    evidence=summary,
                    timestamp=timestamp,
                )
                self.update(
                    partner_id,
                    agent_id,
                    "affinity",
                    delta,
                    evidence=summary,
                    timestamp=timestamp,
                )
                self.update(
                    agent_id,
                    partner_id,
                    "familiarity",
                    delta * 0.5,
                    evidence=summary,
                    timestamp=timestamp,
                )
                self.update(
                    partner_id,
                    agent_id,
                    "familiarity",
                    delta * 0.5,
                    evidence=summary,
                    timestamp=timestamp,
                )
            return

        if kind == "agent_moved":
            # Co-location slightly increases familiarity.
            agent_id = extra.get("agent_id")
            to_location = extra.get("to")
            if agent_id and to_location:
                self._ensure_node(to_location, {"type": "location"})
                self.update(
                    agent_id,
                    to_location,
                    "familiarity",
                    0.01,
                    evidence=payload.get("summary", ""),
                    timestamp=timestamp,
                )

    def _handle_reader_interaction(self, payload: dict[str, Any]) -> None:
        target = payload.get("oc_id") or payload.get("character_id") or "linyi"
        summary = payload.get("summary") or payload.get("content") or "读者互动"
        timestamp = payload.get("timestamp") or time.time()
        reader = self._reader_node_id()
        self.update(
            reader,
            target,
            "affinity",
            0.03,
            evidence=summary,
            timestamp=timestamp,
        )
        self.update(
            reader,
            target,
            "familiarity",
            0.05,
            evidence=summary,
            timestamp=timestamp,
        )

    def _handle_reader_profile_update(self, payload: dict[str, Any]) -> None:
        reader_id = payload.get("reader_id", self._reader_id)
        self._reader_id = reader_id
        self._ensure_node(
            self._reader_node_id(),
            {
                "type": "reader",
                "display_name": payload.get("display_name", ""),
                "relationship_stage": payload.get("relationship_stage", ""),
            },
        )

    def _handle_control_update(self, payload: dict[str, Any]) -> None:
        source = payload.get("source")
        target = payload.get("target")
        kind = payload.get("kind")
        delta = payload.get("delta")
        weight = payload.get("weight")
        if not source or not target or not kind:
            return
        evidence = payload.get("evidence", "")
        timestamp = payload.get("timestamp") or time.time()
        if weight is not None:
            self.set_weight(source, target, kind, float(weight), evidence, timestamp)
        elif delta is not None:
            self.update(source, target, kind, float(delta), evidence, timestamp)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _reader_node_id(self) -> str:
        return f"reader:{self._reader_id}"

    def _ensure_node(self, node_id: str, metadata: dict[str, Any] | None = None) -> None:
        if node_id not in self._nodes:
            self._nodes[node_id] = {"id": node_id}
        if metadata:
            self._nodes[node_id].update(metadata)

    def _publish_update(self, edge: RelationshipEdge) -> None:
        self._state.custom["updates_published"] = (
            int(self._state.custom.get("updates_published", 0)) + 1
        )
        self.emit(
            topic=TOPIC_RELATIONSHIP_UPDATED,
            payload={
                "source": edge.source,
                "target": edge.target,
                "kind": edge.kind,
                "weight": edge.weight,
                "evidence": edge.evidence,
                "timestamp": edge.timestamp,
            },
            channel="data",
            priority=4,
            ttl=3,
        )

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "reader_id": self._reader_id,
                "edges": [dataclass_to_dict(e) for e in self._edges.values()],
                "nodes": dict(self._nodes),
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._reader_id = str(data.get("reader_id", "default_reader"))
        self._edges = {
            (e.source, e.target, e.kind): e
            for e in (
                reconstruct_dataclass(RelationshipEdge, d)
                for d in data.get("edges", [])
            )
        }
        self._nodes = dict(data.get("nodes", {}))
        self._state.custom["edge_count"] = len(self._edges)
        self._state.custom["node_count"] = len(self._nodes)


__all__ = [
    "RelationshipGraph",
    "RelationshipEdge",
    "TOPIC_RELATIONSHIP_UPDATED",
    "TOPIC_RELATIONSHIP_CONTROL",
]
