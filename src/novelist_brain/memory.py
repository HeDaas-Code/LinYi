"""Memory system for the novelist brain prototype."""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any

from src.novelist_brain.models import BusMessage, Fragment, ModuleState, TickDelta, Trace
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass


# Half-life for recency decay: 1 day expressed in milliseconds to match
# the Clock's absolute_time_ms unit.
_RECENCY_HALF_LIFE_MS = 86_400_000.0

# Minimum tag overlap for two fragments to belong to the same cluster.
_MIN_TAG_OVERLAP = 2

# Score threshold above which a cluster becomes a Trace.
_CONSOLIDATION_THRESHOLD = 0.35

# Working-memory capacity for recently received fragments.
_WORKING_MEMORY_CAPACITY = 20

# Person names are heuristically detected as capitalized tokens that are not
# common English location words. This is intentionally lightweight.
_COMMON_LOCATION_WORDS = {
    "home", "house", "street", "road", "city", "town", "village", "mountain",
    "river", "forest", "park", "office", "school", "cafe", "restaurant",
    "hotel", "hospital", "station", "airport", "bridge", "square", "beach",
    "desert", "field", "garden", "room", "kitchen", "bedroom", "garden",
}

_CAUSAL_WORDS = {
    "because", "since", "therefore", "thus", "hence", "so", "consequently",
    "as a result", "led to", "lead to", "caused", "causing", "because of",
    "due to", "thanks to", "owing to", "resulted in", "results in",
}


def _is_person_name(token: str) -> bool:
    """Heuristic: capitalized token that is not a common location word."""
    if not token:
        return False
    return token[0].isupper() and token.lower() not in _COMMON_LOCATION_WORDS


def _is_location(token: str) -> bool:
    """Heuristic: common location keyword or capitalized place-like token."""
    if not token:
        return False
    lower = token.lower()
    if lower in _COMMON_LOCATION_WORDS:
        return True
    return lower.endswith(("town", "city", "ville", "burg", "land", "berg"))


def _detect_person_name(text: str) -> bool:
    """Return True if the text likely contains a person name."""
    for token in text.split():
        cleaned = token.strip(",.!?;:\"'()[]")
        if _is_person_name(cleaned):
            return True
    return False


def _detect_location(text: str) -> bool:
    """Return True if the text likely contains a location."""
    for token in text.split():
        cleaned = token.strip(",.!?;:\"'()[]")
        if _is_location(cleaned):
            return True
    return False


def _detect_causal(text: str) -> bool:
    """Return True if the text contains causal language."""
    lower = text.lower()
    return any(word in lower for word in _CAUSAL_WORDS)


def _assign_narrative_role(
    fragments: list[Fragment], emotional_weight: float
) -> Any:
    """Assign a narrative role based on fragment contents and emotions."""
    if emotional_weight > 0.7 and len(fragments) > 3:
        return "mood"

    joined = " ".join(f.content for f in fragments)
    if _detect_person_name(joined):
        return "character"
    if _detect_location(joined):
        return "setting"
    if _detect_causal(joined):
        return "event"
    return "theme"


def _compute_recency_score(fragment: Fragment, current_time_ms: float) -> float:
    """Compute a time-decay recency score in [0, 1]."""
    age_ms = max(0.0, current_time_ms - fragment.timestamp)
    decay = math.exp(-math.log(2.0) * age_ms / _RECENCY_HALF_LIFE_MS)
    return float(decay)


class MemorySystem(Module):
    """Stores fragments, consolidates them into traces, and answers queries.

    The memory system keeps every fragment it receives, maintains a small
    working-memory window of recent fragments, and periodically runs a
    lightweight consolidation pass that clusters fragments by shared tags and
    promotes high-scoring clusters to durable traces.
    """

    def __init__(
        self,
        name: str = "memory_system",
        working_memory_capacity: int = _WORKING_MEMORY_CAPACITY,
        consolidation_threshold: float = _CONSOLIDATION_THRESHOLD,
        min_tag_overlap: int = _MIN_TAG_OVERLAP,
    ) -> None:
        super().__init__(name)
        self._fragments: dict[str, Fragment] = {}
        self._traces: dict[str, Trace] = {}
        self._working_memory: list[Fragment] = []
        self._consolidation_queue: list[Fragment] = []
        self._working_memory_capacity = working_memory_capacity
        self._consolidation_threshold = consolidation_threshold
        self._min_tag_overlap = min_tag_overlap
        self._last_time_ms = 0.0

        self.subscribe(
            "fragment.personal.new",
            "fragment.social.new",
            "fragment.memory.new",
            "fragment.dream.new",
            "fragment.novel.new",
            "fragment.dmn.new",
            "fragment.cen.new",
            "fragment.sandbox.new",
            "control.memory.consolidate",
            "control.memory.query",
            "control.module.init",
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            last_tick=0.0,
            custom={
                "fragment_count": 0,
                "trace_count": 0,
                "consolidation_runs": 0,
            },
        )

    def init(self, context: dict[str, Any]) -> None:
        """Initialize memory from agent context, if provided."""
        memory_context = context.get("memory", {})
        self._working_memory_capacity = memory_context.get(
            "working_memory_capacity", self._working_memory_capacity
        )
        self._consolidation_threshold = memory_context.get(
            "consolidation_threshold", self._consolidation_threshold
        )
        self._min_tag_overlap = memory_context.get(
            "min_tag_overlap", self._min_tag_overlap
        )

    def on_bus_message(self, message: BusMessage) -> None:
        """Handle incoming fragments, consolidation commands, and queries."""
        if message.topic.startswith("fragment.") and message.topic.endswith(".new"):
            self._receive_fragment(message.payload)
        elif message.topic == "control.memory.consolidate":
            self._run_consolidation(message.payload)
        elif message.topic == "control.memory.query":
            self._handle_query(message.payload)

    def tick(self, delta: TickDelta) -> None:
        """Advance memory; run consolidation opportunistically each tick."""
        self._last_time_ms = delta.absolute_time
        self._state.last_tick = delta.absolute_time
        if self._consolidation_queue:
            self._run_consolidation(
                {"current_time_ms": delta.absolute_time, "reason": "tick"}
            )

    # ------------------------------------------------------------------
    # Public accessors (useful for tests and introspection)
    # ------------------------------------------------------------------

    @property
    def fragments(self) -> dict[str, Fragment]:
        return dict(self._fragments)

    @property
    def traces(self) -> dict[str, Trace]:
        return dict(self._traces)

    @property
    def working_memory(self) -> list[Fragment]:
        return list(self._working_memory)

    @property
    def consolidation_queue(self) -> list[Fragment]:
        return list(self._consolidation_queue)

    def get_state(self) -> dict[str, Any]:
        """Return a serializable snapshot of memory state."""
        return {
            "active": self._state.active,
            "energy_cost": self._state.energy_cost,
            "last_tick": self._state.last_tick,
            "fragment_count": len(self._fragments),
            "trace_count": len(self._traces),
            "working_memory_count": len(self._working_memory),
            "consolidation_queue_count": len(self._consolidation_queue),
            "consolidation_runs": self._state.custom["consolidation_runs"],
        }

    def to_dict(self) -> dict[str, Any]:
        """Serialize the full memory system state."""
        base = super().to_dict()
        base.update(
            {
                "fragments": {
                    fid: dataclass_to_dict(f) for fid, f in self._fragments.items()
                },
                "traces": {
                    tid: dataclass_to_dict(t) for tid, t in self._traces.items()
                },
                "working_memory": [dataclass_to_dict(f) for f in self._working_memory],
                "consolidation_queue": [
                    dataclass_to_dict(f) for f in self._consolidation_queue
                ],
                "working_memory_capacity": self._working_memory_capacity,
                "consolidation_threshold": self._consolidation_threshold,
                "min_tag_overlap": self._min_tag_overlap,
                "last_time_ms": self._last_time_ms,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore the full memory system state."""
        super().from_dict(data, **kwargs)
        self._working_memory_capacity = data.get(
            "working_memory_capacity", self._working_memory_capacity
        )
        self._consolidation_threshold = data.get(
            "consolidation_threshold", self._consolidation_threshold
        )
        self._min_tag_overlap = data.get("min_tag_overlap", self._min_tag_overlap)
        self._last_time_ms = data.get("last_time_ms", self._last_time_ms)

        self._fragments = {
            fid: reconstruct_dataclass(Fragment, f)
            for fid, f in data.get("fragments", {}).items()
        }
        self._traces = {
            tid: reconstruct_dataclass(Trace, t)
            for tid, t in data.get("traces", {}).items()
        }
        self._working_memory = [
            reconstruct_dataclass(Fragment, f)
            for f in data.get("working_memory", [])
        ]
        self._consolidation_queue = [
            reconstruct_dataclass(Fragment, f)
            for f in data.get("consolidation_queue", [])
        ]

        self._state.custom["fragment_count"] = len(self._fragments)
        self._state.custom["trace_count"] = len(self._traces)
        self._state.custom.setdefault(
            "consolidation_runs", 0
        )

    # ------------------------------------------------------------------
    # Fragment handling
    # ------------------------------------------------------------------

    def _receive_fragment(self, payload: Any) -> None:
        """Store a fragment, update working memory, and queue it."""
        if payload is None:
            return

        if isinstance(payload, Fragment):
            fragment = payload
        elif isinstance(payload, dict):
            fragment = Fragment(**payload)
        else:
            return

        if fragment.timestamp <= 0.0:
            fragment.timestamp = self._last_time_ms or 0.0

        self._fragments[fragment.id] = fragment
        self._working_memory.append(fragment)
        self._consolidation_queue.append(fragment)
        self._trim_working_memory()
        self._state.custom["fragment_count"] = len(self._fragments)

    def _trim_working_memory(self) -> None:
        """Keep working memory within its capacity limit."""
        while len(self._working_memory) > self._working_memory_capacity:
            self._working_memory.pop(0)

    # ------------------------------------------------------------------
    # Consolidation
    # ------------------------------------------------------------------

    def _run_consolidation(self, payload: Any) -> None:
        """Cluster queued fragments and promote high-scoring clusters to traces."""
        payload = payload or {}
        current_time_ms = payload.get("current_time_ms", self._last_time_ms)
        if not self._consolidation_queue:
            return

        candidates = list(self._consolidation_queue)
        self._consolidation_queue.clear()
        clusters = self._cluster_fragments(candidates)

        created_traces: list[Trace] = []
        for cluster in clusters:
            trace = self._evaluate_cluster(cluster, current_time_ms)
            if trace is not None:
                self._traces[trace.id] = trace
                created_traces.append(trace)

        self._state.custom["consolidation_runs"] += 1
        self._state.custom["trace_count"] = len(self._traces)

        for trace in created_traces:
            self.emit(
                topic="data.memory.trace.created",
                payload={"trace": trace, "fragment_ids": trace.fragment_ids},
                channel="data",
                priority=5,
                ttl=3,
            )
            self.emit(
                topic="data.memory.replay",
                payload={"trace": trace, "reason": payload.get("reason", "consolidation")},
                channel="data",
                priority=3,
                ttl=2,
            )

    def _cluster_fragments(self, fragments: list[Fragment]) -> list[list[Fragment]]:
        """Group fragments by pairwise tag overlap >= min_tag_overlap.

        Uses a simple union-find over fragment indices.
        """
        if not fragments:
            return []

        n = len(fragments)
        parent = list(range(n))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(x: int, y: int) -> None:
            rx, ry = find(x), find(y)
            if rx != ry:
                parent[rx] = ry

        for i in range(n):
            tags_i = set(fragments[i].tags)
            if not tags_i:
                continue
            for j in range(i + 1, n):
                overlap = len(tags_i & set(fragments[j].tags))
                if overlap >= self._min_tag_overlap:
                    union(i, j)

        groups: dict[int, list[int]] = defaultdict(list)
        for idx in range(n):
            groups[find(idx)].append(idx)

        return [[fragments[idx] for idx in group] for group in groups.values()]

    def _evaluate_cluster(
        self, fragments: list[Fragment], current_time_ms: float
    ) -> Trace | None:
        """Score a fragment cluster and return a Trace if it passes threshold."""
        if not fragments:
            return None

        importance = max(
            (f.salience * abs(f.valence) for f in fragments),
            default=0.0,
        )
        recency_values = [
            _compute_recency_score(f, current_time_ms) for f in fragments
        ]
        recency = sum(recency_values) / len(recency_values)
        emotional_weight = sum(
            f.arousal * abs(f.valence) for f in fragments
        ) / len(fragments)

        score = importance * 0.4 + recency * 0.3 + emotional_weight * 0.3
        if score <= self._consolidation_threshold:
            return None

        narrative_role = _assign_narrative_role(fragments, emotional_weight)
        tags = sorted(set(tag for f in fragments for tag in f.tags))
        content = " ".join(f.content for f in fragments)

        trace = Trace(
            fragment_ids=[f.id for f in fragments],
            importance=importance,
            recency=recency,
            relevance=score,
            emotional_weight=emotional_weight,
            narrative_role=narrative_role,
            content=content,
            tags=tags,
        )
        return trace

    # ------------------------------------------------------------------
    # Query interface
    # ------------------------------------------------------------------

    def _handle_query(self, payload: Any) -> None:
        """Answer a memory query and broadcast the result."""
        if payload is None:
            payload = {}
        elif not isinstance(payload, dict):
            payload = {}

        query_type = payload.get("query_type", "tags")
        limit = payload.get("limit", 10)
        if not isinstance(limit, int) or limit <= 0:
            limit = 10

        results = self.query(query_type, payload)
        results = results[:limit]

        self.emit(
            topic="data.memory.trace.query.result",
            payload={
                "query_type": query_type,
                "criteria": payload,
                "results": results,
                "count": len(results),
            },
            channel="data",
            priority=5,
            ttl=3,
        )

    def query(self, query_type: str, criteria: dict[str, Any]) -> list[Trace]:
        """Return traces matching the requested query type and criteria."""
        traces = list(self._traces.values())

        if query_type == "tags":
            tags = set(criteria.get("tags", []))
            if tags:
                traces = [t for t in traces if tags & set(t.tags)]
        elif query_type == "emotion":
            min_valence = criteria.get("min_valence", -1.0)
            max_valence = criteria.get("max_valence", 1.0)
            min_arousal = criteria.get("min_arousal", 0.0)
            max_arousal = criteria.get("max_arousal", 1.0)

            def _emotion_match(t: Trace) -> bool:
                # Recompute aggregate valence/arousal from source fragments.
                source = [self._fragments.get(fid) for fid in t.fragment_ids]
                source = [f for f in source if f is not None]
                if not source:
                    return False
                avg_valence = sum(f.valence for f in source) / len(source)
                avg_arousal = sum(f.arousal for f in source) / len(source)
                return (
                    min_valence <= avg_valence <= max_valence
                    and min_arousal <= avg_arousal <= max_arousal
                )

            traces = [t for t in traces if _emotion_match(t)]
        elif query_type == "narrative_role":
            role = criteria.get("narrative_role")
            if role:
                traces = [t for t in traces if t.narrative_role == role]
        elif query_type == "mood":
            mood_role = criteria.get("mood", "mood")
            traces = [t for t in traces if t.narrative_role == mood_role]

        sort_key = criteria.get("sort_by", "relevance")
        if sort_key == "importance":
            traces.sort(key=lambda t: t.importance, reverse=True)
        elif sort_key == "recency":
            traces.sort(key=lambda t: t.recency, reverse=True)
        else:
            traces.sort(key=lambda t: t.relevance, reverse=True)
        return traces

    def find_trace(self, trace_id: str) -> Trace | None:
        """Return a trace by id, or None if not found."""
        return self._traces.get(trace_id)

    def find_fragment(self, fragment_id: str) -> Fragment | None:
        """Return a fragment by id, or None if not found."""
        return self._fragments.get(fragment_id)
