"""Memory system for the novelist brain prototype."""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any

from src.novelist_brain.models import (
    BusMessage,
    Fragment,
    ModuleState,
    SocialTrace,
    TickDelta,
    Trace,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass
from src.novelist_brain.anthropomorphic_gate import FragmentQualityGate
from src.novelist_brain.importance_scorer import suggest_salience

# Imported lazily to avoid a hard dependency at import time.
_HybridMemoryStore: Any = None


# Half-life for recency decay: 1 day expressed in milliseconds to match
# the Clock's absolute_time_ms unit.
_RECENCY_HALF_LIFE_MS = 86_400_000.0

# Minimum tag overlap for two fragments to belong to the same cluster.
_MIN_TAG_OVERLAP = 2

# Score threshold above which a cluster becomes a Trace.
_CONSOLIDATION_THRESHOLD = 0.35

# Working-memory capacity for recently received fragments.
_WORKING_MEMORY_CAPACITY = 20

# Long-term memory capacity caps. When the in-memory indexes grow beyond
# these caps a forgetting pass prunes the lowest-importance entries so the
# agent can run 7x24 without unbounded memory growth (Design.md §12).
_FRAGMENT_CAPACITY = 5_000
_TRACE_CAPACITY = 2_000
_SOCIAL_PROVENANCE_CAPACITY = 2_000

# Below this importance score a trace is eligible for forgetting once the
# trace index is over capacity. Recency also factors in: a low-importance
# but recent trace survives longer than a low-importance old one.
_FORGET_IMPORTANCE_THRESHOLD = 0.2

# After how many fragment receptions we run a forgetting sweep. Running on
# every fragment would be wasteful; running rarely would let the indexes
# overshoot the cap between sweeps.
_FORGET_CHECK_INTERVAL = 100

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


def _first_nonempty(values: Any) -> str:
    """Return the first non-empty string from ``values``."""
    for value in values:
        if isinstance(value, str) and value:
            return value
    return ""


def _most_common(values: Any) -> str:
    """Return the most common value, falling back to the first."""
    counts: dict[str, int] = defaultdict(int)
    first = ""
    for value in values:
        if isinstance(value, str):
            counts[value] += 1
            if not first:
                first = value
    if counts:
        return max(counts.items(), key=lambda item: item[1])[0]
    return first


def _merge_relationship_deltas(social_contexts: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge relationship deltas from multiple social contexts.

    Keeps the last non-empty target_id and accumulates delta values when they
    share the same target.
    """
    merged: dict[str, Any] = {}
    total_delta = 0.0
    target_id = ""
    target_name = ""
    for ctx in social_contexts:
        rd = ctx.get("relationship_delta") or {}
        if not isinstance(rd, dict):
            continue
        if rd.get("target_id"):
            target_id = rd["target_id"]
            target_name = rd.get("target_name", target_name)
        delta = rd.get("delta", 0.0)
        if isinstance(delta, (int, float)):
            total_delta += float(delta)
    if target_id:
        merged["target_id"] = target_id
        merged["target_name"] = target_name
        merged["delta"] = total_delta
    return merged


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
        store: Any = None,
        fragment_capacity: int = _FRAGMENT_CAPACITY,
        trace_capacity: int = _TRACE_CAPACITY,
        social_provenance_capacity: int = _SOCIAL_PROVENANCE_CAPACITY,
        forget_importance_threshold: float = _FORGET_IMPORTANCE_THRESHOLD,
        forget_check_interval: int = _FORGET_CHECK_INTERVAL,
        fragment_gate: FragmentQualityGate | None = None,
        enable_fragment_gate: bool = True,
        enable_importance_scorer: bool = True,
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

        # Long-term-memory caps and forgetting policy (Design.md §12).
        self._fragment_capacity = int(fragment_capacity)
        self._trace_capacity = int(trace_capacity)
        self._social_provenance_capacity = int(social_provenance_capacity)
        self._forget_importance_threshold = float(forget_importance_threshold)
        self._forget_check_interval = max(1, int(forget_check_interval))
        self._fragments_since_forget_check = 0
        # Tracks how many fragments/traces we have pruned for observability.
        self._forgotten_fragments = 0
        self._forgotten_traces = 0

        # Maps fragment_id -> social provenance captured from data.social.fragment.
        self._social_provenance: dict[str, dict[str, Any]] = {}

        # Optional local-database hybrid store.  When present, fragments and
        # traces are persisted there in addition to the in-memory indexes.
        self._store: Any = store

        # Anthropomorphic quality gate and importance scorer.
        self._fragment_gate = fragment_gate or FragmentQualityGate()
        self._enable_fragment_gate = enable_fragment_gate
        self._enable_importance_scorer = enable_importance_scorer

        self.subscribe(
            "fragment.personal.new",
            "fragment.social.new",
            "fragment.memory.new",
            "fragment.dream.new",
            "fragment.novel.new",
            "fragment.dmn.new",
            "fragment.cen.new",
            "fragment.sandbox.new",
            "data.social.fragment",
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
        # Forgetting policy can be tuned from configuration; falls back to
        # the constructor defaults when absent.
        self._fragment_capacity = int(memory_context.get(
            "fragment_capacity", self._fragment_capacity
        ))
        self._trace_capacity = int(memory_context.get(
            "trace_capacity", self._trace_capacity
        ))
        self._social_provenance_capacity = int(memory_context.get(
            "social_provenance_capacity", self._social_provenance_capacity
        ))
        self._forget_importance_threshold = float(memory_context.get(
            "forget_importance_threshold", self._forget_importance_threshold
        ))
        self._forget_check_interval = max(1, int(memory_context.get(
            "forget_check_interval", self._forget_check_interval
        )))

        backend = memory_context.get("backend", "memory")
        if backend == "sqlite" and self._store is None:
            global _HybridMemoryStore
            if _HybridMemoryStore is None:
                from src.novelist_brain.memory_store import HybridMemoryStore

                _HybridMemoryStore = HybridMemoryStore
            self._store = _HybridMemoryStore(
                db_path=memory_context.get("db_path", "memory_store.sqlite"),
                embedding_dim=memory_context.get("embedding_dim", 1536),
            )
            self._sync_to_store()

    def _sync_to_store(self) -> None:
        """Persist any fragments/traces restored from snapshot into the store."""
        if self._store is None:
            return
        for fragment in self._fragments.values():
            self._store.save_fragment(fragment)
        for trace in self._traces.values():
            self._store.save_trace(trace)

    def on_bus_message(self, message: BusMessage) -> None:
        """Handle incoming fragments, consolidation commands, and queries."""
        if message.topic.startswith("fragment.") and message.topic.endswith(".new"):
            self._receive_fragment(message.payload)
        elif message.topic == "data.social.fragment":
            self._on_social_fragment(message.payload)
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
        # Periodically prune low-importance memories so the agent can run
        # indefinitely without unbounded growth. The check is cheap (a few
        # len() calls) and only an actual sweep happens when a cap is hit.
        if self._fragments_since_forget_check >= self._forget_check_interval:
            self._fragments_since_forget_check = 0
            self._run_forgetting(current_time_ms=delta.absolute_time)

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
            "forgotten_fragments": self._forgotten_fragments,
            "forgotten_traces": self._forgotten_traces,
            "fragment_capacity": self._fragment_capacity,
            "trace_capacity": self._trace_capacity,
        }

    def export_graph(self) -> dict[str, Any]:
        """Export fragments and traces as a graph for dashboard visualization.

        Nodes are memory items (fragments and traces) labelled by their first
        few tags or a short content preview.  Edges connect items that share
        at least one tag, weighted by the number of shared tags.
        """
        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []
        node_ids: set[str] = set()

        def _label(item: Any) -> str:
            tags = getattr(item, "tags", None) or []
            if tags:
                return "#" + " #".join(list(tags)[:3])
            content = getattr(item, "content", "") or ""
            return content[:40] + "..." if len(content) > 40 else content

        for fid, fragment in self._fragments.items():
            nodes.append({
                "id": fid,
                "label": _label(fragment),
                "type": "fragment",
                "role": getattr(fragment, "narrative_role", "memory"),
            })
            node_ids.add(fid)

        for tid, trace in self._traces.items():
            nodes.append({
                "id": tid,
                "label": _label(trace),
                "type": "trace",
                "role": getattr(trace, "narrative_role", "memory"),
            })
            node_ids.add(tid)

        items: list[tuple[str, Any]] = [
            *[(fid, f) for fid, f in self._fragments.items()],
            *[(tid, t) for tid, t in self._traces.items()],
        ]
        for i, (id_a, item_a) in enumerate(items):
            tags_a = set(getattr(item_a, "tags", None) or [])
            for id_b, item_b in items[i + 1 :]:
                shared = tags_a & set(getattr(item_b, "tags", None) or [])
                if shared:
                    edges.append({
                        "source": id_a,
                        "target": id_b,
                        "weight": len(shared),
                        "shared_tags": sorted(shared),
                    })

        return {"nodes": nodes, "edges": edges}

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
                "social_provenance": dict(self._social_provenance),
                "working_memory_capacity": self._working_memory_capacity,
                "consolidation_threshold": self._consolidation_threshold,
                "min_tag_overlap": self._min_tag_overlap,
                "last_time_ms": self._last_time_ms,
                # Persist forgetting policy + counters so a restored agent
                # keeps the same memory budget and observability state.
                "fragment_capacity": self._fragment_capacity,
                "trace_capacity": self._trace_capacity,
                "social_provenance_capacity": self._social_provenance_capacity,
                "forget_importance_threshold": self._forget_importance_threshold,
                "forget_check_interval": self._forget_check_interval,
                "forgotten_fragments": self._forgotten_fragments,
                "forgotten_traces": self._forgotten_traces,
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
        self._social_provenance = dict(data.get("social_provenance", {}))

        # Restore forgetting policy; fall back to constructor defaults.
        self._fragment_capacity = int(data.get("fragment_capacity", self._fragment_capacity))
        self._trace_capacity = int(data.get("trace_capacity", self._trace_capacity))
        self._social_provenance_capacity = int(
            data.get("social_provenance_capacity", self._social_provenance_capacity)
        )
        self._forget_importance_threshold = float(
            data.get("forget_importance_threshold", self._forget_importance_threshold)
        )
        self._forget_check_interval = max(1, int(
            data.get("forget_check_interval", self._forget_check_interval)
        ))
        self._forgotten_fragments = int(data.get("forgotten_fragments", 0))
        self._forgotten_traces = int(data.get("forgotten_traces", 0))
        self._fragments_since_forget_check = 0

        self._fragments = {
            fid: reconstruct_dataclass(Fragment, f)
            for fid, f in data.get("fragments", {}).items()
        }
        self._traces = {
            tid: self._reconstruct_trace(t)
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

    @staticmethod
    def _reconstruct_trace(t: dict[str, Any]) -> Trace:
        """Restore a Trace, upgrading to SocialTrace when social fields exist."""
        if any(
            key in t
            for key in ("space_id", "dialogue_mode", "gaze_pressure", "relationship_delta")
        ):
            return reconstruct_dataclass(SocialTrace, t)
        return reconstruct_dataclass(Trace, t)

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

        # --- Anthropomorphic quality gate ----------------------------------
        # Filter out empty, overly abstract, or duplicate fragments before
        # they pollute working memory and downstream consolidation.
        if self._enable_fragment_gate and fragment.content:
            recent_texts = [f.content for f in self._working_memory]
            decision = self._fragment_gate.evaluate(
                fragment.content,
                recent_texts=recent_texts,
            )
            if not decision.passed:
                self._state.custom["gated_fragments"] = (
                    int(self._state.custom.get("gated_fragments", 0)) + 1
                )
                return

        # --- Importance scoring --------------------------------------------
        # Use the heuristic scorer to suggest a salience when the fragment
        # does not already carry an explicit value.
        if self._enable_importance_scorer:
            fragment.salience = suggest_salience(fragment)

        self._fragments[fragment.id] = fragment
        self._working_memory.append(fragment)
        self._consolidation_queue.append(fragment)
        self._trim_working_memory()
        self._state.custom["fragment_count"] = len(self._fragments)

        # Bump the forget-check counter; the actual sweep is throttled in
        # ``tick`` so we do not pay the cost on every fragment.
        self._fragments_since_forget_check += 1

        if self._store is not None:
            self._store.save_fragment(fragment)
            self._store.add_edge(
                source_id=fragment.source,
                target_id=fragment.id,
                edge_type="source_to_fragment",
                weight=fragment.salience,
            )

    def _trim_working_memory(self) -> None:
        """Keep working memory within its capacity limit."""
        while len(self._working_memory) > self._working_memory_capacity:
            self._working_memory.pop(0)

    def _on_social_fragment(self, payload: Any) -> None:
        """Capture social provenance for fragments produced by SocialInput.

        The rich ``data.social.fragment`` event carries the encounter context
        (space, role, gaze pressure, dialogue mode) needed to construct a
        :class:`SocialTrace` during consolidation.
        """
        if not isinstance(payload, dict):
            return
        fragment = payload.get("fragment")
        if fragment is None:
            return
        if isinstance(fragment, dict):
            fid = fragment.get("id", "")
        elif isinstance(fragment, Fragment):
            fid = fragment.id
        else:
            return
        if not fid:
            return

        encounter = payload.get("encounter") or {}
        if isinstance(encounter, dict):
            self._social_provenance[fid] = {
                "space_id": encounter.get("space_id", ""),
                "dialogue_mode": encounter.get("dialogue_mode", "surface"),
                "gaze_pressure": float(encounter.get("gaze_pressure", 0.0)),
                "relationship_delta": encounter.get("relationship_delta") or {},
            }
        else:
            self._social_provenance[fid] = {
                "space_id": getattr(encounter, "space_id", ""),
                "dialogue_mode": getattr(encounter, "dialogue_mode", "surface"),
                "gaze_pressure": float(getattr(encounter, "gaze_pressure", 0.0)),
                "relationship_delta": getattr(encounter, "relationship_delta", None) or {},
            }

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
            if self._store is not None:
                self._store.save_trace(trace)
                for fid in trace.fragment_ids:
                    self._store.add_edge(
                        source_id=fid,
                        target_id=trace.id,
                        edge_type="fragment_to_trace",
                        weight=trace.importance,
                    )
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

    # ------------------------------------------------------------------
    # Forgetting (Design.md §12: recency decay + importance threshold)
    # ------------------------------------------------------------------

    def _run_forgetting(self, current_time_ms: float) -> None:
        """Prune low-importance fragments/traces once capacity caps are hit.

        Forgetting only kicks in when an index exceeds its configured cap, so
        normal operation (well below the caps) pays no cost. When a cap is
        exceeded we evict entries with the lowest ``importance * recency``
        score first, never touching entries that are referenced by surviving
        traces (so consolidated memories remain reconstructable).
        """
        forgotten_fragments = 0
        forgotten_traces = 0

        if len(self._fragments) > self._fragment_capacity:
            forgotten_fragments = self._forget_fragments(current_time_ms)

        if len(self._traces) > self._trace_capacity:
            forgotten_traces = self._forget_traces(current_time_ms)

        # Trim social provenance to match the surviving fragment set, plus a
        # hard cap so a long-running agent cannot accumulate stale context.
        if len(self._social_provenance) > self._social_provenance_capacity:
            self._forget_social_provenance()

        if forgotten_fragments or forgotten_traces:
            self._forgotten_fragments += forgotten_fragments
            self._forgotten_traces += forgotten_traces
            self._state.custom["fragment_count"] = len(self._fragments)
            self._state.custom["trace_count"] = len(self._traces)
            self.emit(
                topic="data.memory.forgotten",
                payload={
                    "forgotten_fragments": forgotten_fragments,
                    "forgotten_traces": forgotten_traces,
                    "remaining_fragments": len(self._fragments),
                    "remaining_traces": len(self._traces),
                    "reason": "capacity_pressure",
                },
                channel="data",
                priority=3,
                ttl=2,
            )

    def _forget_fragments(self, current_time_ms: float) -> int:
        """Evict low-importance fragments until the index is back under cap.

        Returns the number of fragments pruned. Fragments that are still
        referenced by a surviving trace are never evicted — the consolidated
        memory must remain reconstructable from its source fragments.
        """
        referenced: set[str] = set()
        for trace in self._traces.values():
            referenced.update(trace.fragment_ids)

        # Score every unreferenced fragment; lower score = evict first.
        scored: list[tuple[float, str]] = []
        for fid, fragment in self._fragments.items():
            if fid in referenced:
                continue
            recency = _compute_recency_score(fragment, current_time_ms)
            importance = float(fragment.salience) * abs(float(fragment.valence))
            score = importance * 0.6 + recency * 0.4
            scored.append((score, fid))

        if not scored:
            return 0

        scored.sort()
        target = len(self._fragments) - self._fragment_capacity
        evicted = 0
        for _, fid in scored:
            if evicted >= target:
                break
            self._fragments.pop(fid, None)
            self._social_provenance.pop(fid, None)
            evicted += 1
        return evicted

    def _forget_traces(self, current_time_ms: float) -> int:
        """Evict low-importance traces until the index is back under cap.

        Returns the number of traces pruned. We never evict a trace whose
        importance is above ``_forget_importance_threshold`` — those are
        considered durable long-term memories.
        """
        scored: list[tuple[float, str]] = []
        for tid, trace in self._traces.items():
            if trace.importance >= self._forget_importance_threshold:
                continue
            # Recency is stored on the trace itself (computed during
            # consolidation), so we use it directly. Lower score = evict first.
            score = float(trace.importance) * 0.6 + float(trace.recency) * 0.4
            scored.append((score, tid))

        if not scored:
            return 0

        scored.sort()
        target = len(self._traces) - self._trace_capacity
        evicted = 0
        for _, tid in scored:
            if evicted >= target:
                break
            self._traces.pop(tid, None)
            evicted += 1
        return evicted

    def _forget_social_provenance(self) -> None:
        """Drop the oldest social-provenance entries to stay under cap."""
        # ``_social_provenance`` is keyed by fragment id and filled in
        # insertion order (Python dicts preserve order), so trimming the
        # front slices off the oldest entries.
        overflow = len(self._social_provenance) - self._social_provenance_capacity
        if overflow <= 0:
            return
        keys = list(self._social_provenance.keys())[:overflow]
        for key in keys:
            self._social_provenance.pop(key, None)

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

        # If any fragment carries social provenance, produce a SocialTrace so
        # downstream mapping to the brain world can use space/role/gaze context.
        social_contexts = [
            self._social_provenance[f.id]
            for f in fragments
            if f.id in self._social_provenance
        ]
        if social_contexts:
            trace: Trace = SocialTrace(
                fragment_ids=[f.id for f in fragments],
                importance=importance,
                recency=recency,
                relevance=score,
                emotional_weight=emotional_weight,
                narrative_role=narrative_role,
                content=content,
                tags=tags,
                space_id=_first_nonempty(c.get("space_id", "") for c in social_contexts),
                dialogue_mode=_most_common(
                    c.get("dialogue_mode", "surface") for c in social_contexts
                ),
                gaze_pressure=max(
                    (c.get("gaze_pressure", 0.0) for c in social_contexts), default=0.0
                ),
                relationship_delta=_merge_relationship_deltas(social_contexts),
            )
        else:
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
