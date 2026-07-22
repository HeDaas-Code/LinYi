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

#: Topic emitted when a relationship crosses a stage threshold.
TOPIC_RELATIONSHIP_STAGE_CHANGED = "data.relationship.stage.changed"

#: Topic used to update relationships directly from other modules.
TOPIC_RELATIONSHIP_CONTROL = "control.relationship.update"


@dataclass
class RelationshipHistoryEntry:
    """One snapshot in the evolution of a relationship edge."""

    timestamp: float = 0.0
    weight: float = 0.0
    stage: str = ""
    evidence: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RelationshipEdge:
    """A single directed, typed relationship between two entities.

    The edge keeps a lightweight history of weight/stage changes so that
    callers can narrate how the relationship evolved over time.
    """

    source: str
    target: str
    kind: str
    weight: float = 0.0
    timestamp: float = 0.0
    evidence: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: float = 0.0
    stage: str = ""
    history: list[RelationshipHistoryEntry] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.weight = max(-1.0, min(1.0, float(self.weight)))


#: Default stage thresholds.  For each kind, list ordered pairs of
#: ``(minimum_weight, stage_label)``.  The highest threshold that is still
#: <= the current weight determines the stage.
DEFAULT_STAGE_THRESHOLDS: dict[str, list[tuple[float, str]]] = {
    "affinity": [
        (-1.0, "hostile"),
        (-0.6, "cold"),
        (-0.2, "neutral"),
        (0.2, "warm"),
        (0.6, "close"),
    ],
    "trust": [
        (-1.0, "distrust"),
        (-0.6, "cautious"),
        (-0.2, "neutral"),
        (0.2, "reliable"),
        (0.6, "intimate"),
    ],
    "familiarity": [
        (-1.0, "unknown"),
        (-0.2, "unfamiliar"),
        (0.2, "recognized"),
        (0.5, "familiar"),
        (0.8, "well_known"),
    ],
}


class RelationshipGraph(Module):
    """Centralized social graph for reader, OCs and world entities."""

    DEFAULT_KINDS: tuple[str, ...] = ("affinity", "trust", "familiarity")

    def __init__(self, name: str = "relationship_graph") -> None:
        super().__init__(name)
        self._edges: dict[tuple[str, str, str], RelationshipEdge] = {}
        self._nodes: dict[str, dict[str, Any]] = {}
        self._reader_id: str = "default_reader"
        self._stage_thresholds: dict[str, list[tuple[float, str]]] = dict(
            DEFAULT_STAGE_THRESHOLDS
        )
        self._decay_enabled: bool = False
        self._decay_rate_per_hour: float = 0.02
        self._decay_min_weight: float = 0.0
        self._last_decay_time: float = 0.0
        self.subscribe(
            "data.oc.town.event",
            "data.oc.town.reflection",
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
                created_at=now,
                stage=self._stage_for(kind, 0.0),
            )
            self._edges[key] = edge
        new_weight = max(-1.0, min(1.0, edge.weight + delta))
        edge.weight = new_weight
        edge.timestamp = now
        if evidence:
            edge.evidence = evidence
        if metadata:
            edge.metadata.update(metadata)
        self._record_history(edge, now)
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
                created_at=now,
                stage=self._stage_for(kind, 0.0),
            )
            self._edges[key] = edge
        edge.weight = max(-1.0, min(1.0, float(weight)))
        edge.timestamp = now
        if evidence:
            edge.evidence = evidence
        self._record_history(edge, now)
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

    def relationship_summary(
        self, source: str, target: str
    ) -> dict[str, Any]:
        """Return a narrative-ready summary of the relationship over time.

        Includes current weights, stages, trend direction, peak/low values,
        and the most recent evidence.
        """
        edges = [
            e for e in self._edges.values()
            if e.source == source and e.target == target
        ]
        if not edges:
            return {}

        kinds: dict[str, Any] = {}
        for edge in edges:
            history = sorted(edge.history, key=lambda h: h.timestamp)
            weights = [h.weight for h in history] or [edge.weight]
            kinds[edge.kind] = {
                "weight": edge.weight,
                "stage": edge.stage,
                "peak": max(weights),
                "low": min(weights),
                "history_count": len(history),
                "created_at": edge.created_at,
                "last_updated": edge.timestamp,
                "recent_evidence": edge.evidence,
            }

        return {
            "source": source,
            "target": target,
            "kinds": kinds,
        }

    def trend(
        self,
        source: str,
        target: str,
        kind: str,
        window_seconds: float = 24 * 3600,
    ) -> dict[str, Any]:
        """Return the recent trend for a specific edge.

        ``delta`` is the weight change within ``window_seconds``;
        ``direction`` is one of "rising", "falling", or "stable".
        """
        edge = self.get_edge(source, target, kind)
        if edge is None:
            return {"delta": 0.0, "direction": "stable", "window_seconds": window_seconds}

        now = time.time()
        cutoff = now - window_seconds
        recent = [h for h in edge.history if h.timestamp >= cutoff]
        if len(recent) < 2:
            return {"delta": 0.0, "direction": "stable", "window_seconds": window_seconds}

        delta = recent[-1].weight - recent[0].weight
        if delta > 0.1:
            direction = "rising"
        elif delta < -0.1:
            direction = "falling"
        else:
            direction = "stable"
        return {
            "delta": round(delta, 4),
            "direction": direction,
            "window_seconds": window_seconds,
            "samples": len(recent),
        }

    def decay(
        self,
        now: float | None = None,
        rate_per_hour: float | None = None,
        min_weight: float | None = None,
    ) -> int:
        """Apply time-based decay to all edges.

        Positive weights drift toward ``min_weight`` and negative weights drift
        toward ``-min_weight`` so that inactive relationships gradually cool.
        Returns the number of edges that changed.
        """
        now = now if now is not None else time.time()
        rate = rate_per_hour if rate_per_hour is not None else self._decay_rate_per_hour
        floor = min_weight if min_weight is not None else self._decay_min_weight
        changed = 0
        for edge in list(self._edges.values()):
            hours = max(0.0, (now - edge.timestamp) / 3600.0)
            if hours <= 0 or edge.weight == 0.0:
                continue
            sign = 1.0 if edge.weight > 0 else -1.0
            decay_amount = rate * hours
            new_weight = edge.weight - sign * decay_amount
            # Stop at the floor (or at zero if below it).
            if sign > 0 and new_weight < floor:
                new_weight = floor
            if sign < 0 and new_weight > -floor:
                new_weight = -floor
            if abs(new_weight) < 0.001:
                new_weight = 0.0
            if new_weight != edge.weight:
                edge.weight = max(-1.0, min(1.0, new_weight))
                edge.timestamp = now
                self._record_history(edge, now)
                self._publish_update(edge)
                changed += 1
        return changed

    # ------------------------------------------------------------------
    # Stage / history helpers
    # ------------------------------------------------------------------

    def _stage_for(self, kind: str, weight: float) -> str:
        """Map a weight to a relationship stage for ``kind``."""
        thresholds = self._stage_thresholds.get(kind)
        if not thresholds:
            thresholds = DEFAULT_STAGE_THRESHOLDS.get(kind) or [(-1.0, "neutral")]
        stage = thresholds[0][1]
        for threshold, label in thresholds:
            if weight >= threshold:
                stage = label
        return stage

    def _record_history(self, edge: RelationshipEdge, timestamp: float) -> None:
        """Append a history snapshot when weight or stage changes."""
        previous_stage = edge.stage
        new_stage = self._stage_for(edge.kind, edge.weight)
        edge.stage = new_stage

        # Always record a snapshot on update so the trajectory is available.
        entry = RelationshipHistoryEntry(
            timestamp=timestamp,
            weight=edge.weight,
            stage=new_stage,
            evidence=edge.evidence,
            metadata=dict(edge.metadata),
        )
        edge.history.append(entry)
        # Keep history bounded to avoid unbounded growth.
        max_history = int(edge.metadata.get("max_history", 100))
        if len(edge.history) > max_history:
            edge.history = edge.history[-max_history:]

        if new_stage != previous_stage and previous_stage:
            self._publish_stage_change(edge, previous_stage, new_stage, timestamp)

    def _publish_stage_change(
        self,
        edge: RelationshipEdge,
        previous_stage: str,
        new_stage: str,
        timestamp: float,
    ) -> None:
        if self._router is None:
            return
        self.emit(
            topic=TOPIC_RELATIONSHIP_STAGE_CHANGED,
            payload={
                "source": edge.source,
                "target": edge.target,
                "kind": edge.kind,
                "previous_stage": previous_stage,
                "new_stage": new_stage,
                "weight": edge.weight,
                "evidence": edge.evidence,
                "timestamp": timestamp,
            },
            channel="data",
            priority=5,
            ttl=3,
        )

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        reader_cfg = context.get("reader_profile", {})
        reader_id = reader_cfg.get("reader_id") if isinstance(reader_cfg, dict) else None
        if isinstance(reader_id, str):
            self._reader_id = reader_id

        cfg = context.get("relationship_graph", {})
        if isinstance(cfg, dict):
            thresholds = cfg.get("stage_thresholds")
            if isinstance(thresholds, dict):
                self._stage_thresholds = {
                    str(k): [(float(w), str(s)) for w, s in v]
                    for k, v in thresholds.items()
                    if isinstance(v, list)
                }
            if isinstance(cfg.get("decay_enabled"), bool):
                self._decay_enabled = cfg["decay_enabled"]
            if isinstance(cfg.get("decay_rate_per_hour"), (int, float)):
                self._decay_rate_per_hour = float(cfg["decay_rate_per_hour"])
            if isinstance(cfg.get("decay_min_weight"), (int, float)):
                self._decay_min_weight = float(cfg["decay_min_weight"])

        self._ensure_node(self._reader_node_id(), {"type": "reader"})
        self._last_decay_time = time.time()

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
        if not self._decay_enabled:
            return
        now = delta.absolute_time
        if now - self._last_decay_time >= 3600.0:
            self.decay(now, self._decay_rate_per_hour, self._decay_min_weight)
            self._last_decay_time = now

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
            return

        if kind == "reflection":
            # Reflections that mention other agents deepen the thinker's
            # relationship with those agents.
            agent_id = extra.get("agent_id")
            mentioned = extra.get("mentioned_targets", [])
            if agent_id and mentioned:
                for target_id in mentioned:
                    self.update(
                        agent_id,
                        target_id,
                        "familiarity",
                        0.02,
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
    "RelationshipHistoryEntry",
    "TOPIC_RELATIONSHIP_UPDATED",
    "TOPIC_RELATIONSHIP_STAGE_CHANGED",
    "TOPIC_RELATIONSHIP_CONTROL",
    "DEFAULT_STAGE_THRESHOLDS",
]
