"""MemoryStream: natural-language memory flow inspired by Generative Agents.

This module complements :class:`MemorySystem` by maintaining a unified stream of
observations, conversations, reflections and plans as natural-language entries.
Each entry is scored by recency, importance and relevance so that downstream
modules can retrieve context that feels human: recent, salient and on-topic.

The design borrows from:
- Stanford Generative Agents (memory stream + retrieval scoring)
- MemGPT (tiered memory and explicit page-in/page-out)
"""

from __future__ import annotations

import math
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from src.novelist_brain.conversation_queue import ConversationQueue
from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass


#: Half-life for recency decay (seconds).
DEFAULT_RECENCY_HALF_LIFE = 24.0 * 3600.0

#: Default weights for retrieval scoring.
DEFAULT_RETRIEVAL_WEIGHTS = {
    "recency": 0.3,
    "importance": 0.4,
    "relevance": 0.3,
}

#: Maximum working-memory entries kept hot.
DEFAULT_WORKING_CAPACITY = 20

#: Maximum entries in the full stream before archival pressure triggers.
DEFAULT_STREAM_CAPACITY = 2_000

#: Topic emitted when working memory content changes.
TOPIC_MEMORY_STREAM_UPDATE = "data.memory_stream.update"

#: Topic used to page-in relevant memories into working context.
TOPIC_PAGE_IN = "control.memory.page_in"

#: Topic used to page-out a summary to archival storage.
TOPIC_PAGE_OUT = "control.memory.page_out"


@dataclass
class MemoryStreamEntry:
    """One natural-language memory in the stream."""

    entry_id: str
    kind: str  # observation | conversation | reflection | plan | external
    content: str
    source: str = ""
    timestamp: float = 0.0
    last_accessed: float = 0.0
    importance: float = 0.5
    embedding: list[float] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def touch(self, now: float) -> None:
        """Update last accessed time."""
        self.last_accessed = now


class MemoryStream(Module):
    """A natural-language memory stream with three-factor retrieval.

    The stream holds observations, conversations, reflections and plans as
    text entries.  Retrieval combines recency, importance and relevance so
    the agent can recall the right thing at the right moment.
    """

    def __init__(
        self,
        name: str = "memory_stream",
        *,
        recency_half_life: float = DEFAULT_RECENCY_HALF_LIFE,
        retrieval_weights: dict[str, float] | None = None,
        working_capacity: int = DEFAULT_WORKING_CAPACITY,
        stream_capacity: int = DEFAULT_STREAM_CAPACITY,
        conversation_queue: ConversationQueue | None = None,
        hybrid_enabled: bool = False,
        hybrid_recent_limit: int = 10,
        hybrid_recent_boost: float = 0.2,
    ) -> None:
        super().__init__(name)
        self._recency_half_life = max(1.0, float(recency_half_life))
        self._weights = dict(DEFAULT_RETRIEVAL_WEIGHTS)
        if retrieval_weights:
            self._weights.update(retrieval_weights)
            total = sum(self._weights.values())
            if total > 0:
                self._weights = {k: v / total for k, v in self._weights.items()}
        self._working_capacity = max(1, int(working_capacity))
        self._stream_capacity = max(1, int(stream_capacity))
        self._entries: dict[str, MemoryStreamEntry] = {}
        self._working_ids: list[str] = []
        self._conversation_queue = conversation_queue
        self._hybrid_enabled = bool(hybrid_enabled)
        self._hybrid_recent_limit = max(1, int(hybrid_recent_limit))
        self._hybrid_recent_boost = max(0.0, float(hybrid_recent_boost))
        self.subscribe(
            "data.memory.trace.created",
            "data.oc.town.event",
            "data.schedule.segment.detail",
            TOPIC_PAGE_IN,
            TOPIC_PAGE_OUT,
            "event.reader.interaction",
            "fragment.personal.new",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "memory_stream",
            "version": "0.1.0",
            "description": "Natural-language memory flow with three-factor retrieval",
            "dependencies": [],
            "category": "memory",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.1,
            custom={
                "entries_count": 0,
                "working_count": 0,
                "page_ins": 0,
                "page_outs": 0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add(
        self,
        kind: str,
        content: str,
        *,
        source: str = "",
        importance: float = 0.5,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        embedding: list[float] | None = None,
    ) -> MemoryStreamEntry:
        """Add a new entry to the memory stream."""
        now = time.time()
        entry = MemoryStreamEntry(
            entry_id=f"mem_{int(now * 1000)}_{uuid.uuid4().hex[:6]}",
            kind=kind,
            content=content,
            source=source or self.name,
            timestamp=now,
            last_accessed=now,
            importance=max(0.0, min(1.0, float(importance))),
            tags=list(tags or []),
            metadata=dict(metadata or {}),
            embedding=list(embedding or []),
        )
        self._entries[entry.entry_id] = entry
        self._ensure_stream_capacity()
        self._state.custom["entries_count"] = len(self._entries)
        return entry

    def get(self, entry_id: str) -> MemoryStreamEntry | None:
        entry = self._entries.get(entry_id)
        if entry is not None:
            entry.touch(time.time())
        return entry

    def retrieve(
        self,
        query: str = "",
        *,
        query_embedding: list[float] | None = None,
        limit: int = 10,
        kinds: set[str] | None = None,
        now: float | None = None,
    ) -> list[MemoryStreamEntry]:
        """Retrieve the most relevant entries using recency + importance + relevance.

        When hybrid retrieval is enabled and a :class:`ConversationQueue` is
        available, recent conversational turns are folded into the candidate
        set so the agent keeps immediate continuity alongside deep memory.
        """
        now = now if now is not None else time.time()
        candidates = list(self._entries.values())

        if self._hybrid_enabled and self._conversation_queue is not None:
            candidates.extend(
                self._turn_to_entry(t)
                for t in self._conversation_queue.recent_turns(
                    self._hybrid_recent_limit
                )
            )

        scored: list[tuple[float, MemoryStreamEntry]] = []
        for entry in candidates:
            if kinds and entry.kind not in kinds:
                continue
            score = self._score(entry, query, query_embedding, now)
            if entry.kind == "conversation_turn":
                score += self._hybrid_recent_boost
            scored.append((score, entry))
        scored.sort(key=lambda item: item[0], reverse=True)
        for _, entry in scored[:limit]:
            entry.touch(now)
        return [entry for _, entry in scored[:limit]]

    @staticmethod
    def _turn_to_entry(turn: Any) -> MemoryStreamEntry:
        """Convert a ConversationTurn into a MemoryStreamEntry for scoring."""
        return MemoryStreamEntry(
            entry_id=getattr(turn, "turn_id", ""),
            kind="conversation_turn",
            content=getattr(turn, "content", ""),
            source=getattr(turn, "source", ""),
            timestamp=float(getattr(turn, "timestamp", 0.0)),
            last_accessed=float(getattr(turn, "timestamp", 0.0)),
            importance=0.5,
            tags=[getattr(turn, "role", "unknown")],
            metadata=getattr(turn, "metadata", {}) or {},
        )

    def page_in(self, query: str, limit: int = 5) -> list[MemoryStreamEntry]:
        """Move relevant entries into working memory and return them."""
        entries = self.retrieve(query, limit=limit)
        for entry in entries:
            if entry.entry_id not in self._working_ids:
                self._working_ids.append(entry.entry_id)
        self._ensure_working_capacity()
        self._state.custom["page_ins"] = (
            int(self._state.custom.get("page_ins", 0)) + 1
        )
        self._publish_update("page_in", query, entries)
        return entries

    def page_out(self, summary: str) -> MemoryStreamEntry:
        """Write a compressed summary into the stream as a reflection/archival entry."""
        entry = self.add(
            kind="reflection",
            content=summary,
            source="page_out",
            importance=0.7,
        )
        self._state.custom["page_outs"] = (
            int(self._state.custom.get("page_outs", 0)) + 1
        )
        self._publish_update("page_out", summary, [entry])
        return entry

    def working_entries(self) -> list[MemoryStreamEntry]:
        """Return entries currently held in working memory."""
        return [
            self._entries[eid]
            for eid in self._working_ids
            if eid in self._entries
        ]

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("memory_stream", {})
        half_life = cfg.get("recency_half_life")
        if isinstance(half_life, (int, float)) and half_life > 0:
            self._recency_half_life = float(half_life)
        weights = cfg.get("retrieval_weights")
        if isinstance(weights, dict):
            self._weights = dict(DEFAULT_RETRIEVAL_WEIGHTS)
            self._weights.update(weights)
            total = sum(self._weights.values())
            if total > 0:
                self._weights = {k: v / total for k, v in self._weights.items()}
        working_capacity = cfg.get("working_capacity")
        if isinstance(working_capacity, int) and working_capacity > 0:
            self._working_capacity = working_capacity
        stream_capacity = cfg.get("stream_capacity")
        if isinstance(stream_capacity, int) and stream_capacity > 0:
            self._stream_capacity = stream_capacity

        # a16z companion-app inspired hybrid retrieval: combine deep stream
        # retrieval with a bounded recent conversation queue.
        if self._conversation_queue is None:
            self._conversation_queue = context.get("conversation_queue_instance")
        hybrid = cfg.get("hybrid", {}) if isinstance(cfg.get("hybrid"), dict) else {}
        if hybrid.get("enabled", self._hybrid_enabled):
            self._hybrid_enabled = True
        self._hybrid_recent_limit = int(
            hybrid.get("recent_limit", self._hybrid_recent_limit)
        )
        self._hybrid_recent_boost = float(
            hybrid.get("recent_boost", self._hybrid_recent_boost)
        )

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        payload = message.payload or {}

        if topic == "data.memory.trace.created":
            trace = payload.get("trace")
            if trace is not None:
                content = getattr(trace, "summary", "") or str(trace)
                self.add(
                    kind="observation",
                    content=content,
                    source="memory_system",
                    importance=float(getattr(trace, "importance", 0.5) or 0.5),
                    tags=list(getattr(trace, "tags", []) or []),
                )
            return

        if topic == "data.oc.town.event":
            summary = payload.get("summary", "")
            if summary:
                self.add(
                    kind="conversation" if payload.get("kind") == "conversation" else "observation",
                    content=summary,
                    source="oc_town_engine",
                    importance=0.6,
                    metadata=payload.get("extra", {}),
                )
            return

        if topic == "data.schedule.segment.detail":
            detail = payload.get("detail", {})
            summary = detail.get("summary", "")
            if summary:
                self.add(
                    kind="plan",
                    content=summary,
                    source="segment_detail_enhancer",
                    importance=0.5,
                )
            return

        if topic in ("event.reader.interaction", "fragment.personal.new"):
            content = payload.get("content") or payload.get("summary") or str(payload)
            self.add(
                kind="observation",
                content=content,
                source="reader",
                importance=0.7,
            )
            return

        if topic == TOPIC_PAGE_IN:
            query = payload.get("query", "")
            limit = int(payload.get("limit", 5))
            self.page_in(query, limit=limit)
            return

        if topic == TOPIC_PAGE_OUT:
            summary = payload.get("summary", "")
            if summary:
                self.page_out(summary)
            return

    def tick(self, delta: TickDelta) -> None:
        self._state.custom["working_count"] = len(self._working_ids)

    # ------------------------------------------------------------------
    # Scoring and capacity
    # ------------------------------------------------------------------

    def _score(
        self,
        entry: MemoryStreamEntry,
        query: str,
        query_embedding: list[float] | None,
        now: float,
    ) -> float:
        age = max(0.0, now - entry.timestamp)
        recency = math.exp(-math.log(2.0) * age / self._recency_half_life)
        importance = entry.importance
        relevance = self._relevance(entry, query, query_embedding)
        w = self._weights
        return (
            w.get("recency", 0.0) * recency
            + w.get("importance", 0.0) * importance
            + w.get("relevance", 0.0) * relevance
        )

    def _relevance(
        self,
        entry: MemoryStreamEntry,
        query: str,
        query_embedding: list[float] | None,
    ) -> float:
        if not query and not query_embedding:
            return 0.5
        # Lightweight keyword overlap fallback when embeddings are absent.
        entry_text = f"{entry.content} {' '.join(entry.tags)}".lower()
        query_text = query.lower()
        query_tokens = set(query_text.split())
        if not query_tokens:
            return 0.5
        entry_tokens = set(entry_text.split())
        overlap = len(query_tokens & entry_tokens)
        return min(1.0, overlap / max(1, len(query_tokens)))

    def _ensure_stream_capacity(self) -> None:
        if len(self._entries) <= self._stream_capacity:
            return
        # Evict the lowest-scoring entries by a simple importance/recency blend.
        now = time.time()
        scored = [
            (
                self._score(e, "", None, now),
                e.entry_id,
            )
            for e in self._entries.values()
        ]
        scored.sort(key=lambda item: item[0])
        evict_count = max(1, len(self._entries) - self._stream_capacity)
        for _, entry_id in scored[:evict_count]:
            self._entries.pop(entry_id, None)
            if entry_id in self._working_ids:
                self._working_ids.remove(entry_id)

    def _ensure_working_capacity(self) -> None:
        while len(self._working_ids) > self._working_capacity:
            oldest = self._working_ids.pop(0)
            # Keep the entry in the full stream; just drop from working set.
            _ = oldest

    def _publish_update(
        self,
        action: str,
        query_or_summary: str,
        entries: list[MemoryStreamEntry],
    ) -> None:
        self.emit(
            topic=TOPIC_MEMORY_STREAM_UPDATE,
            payload={
                "action": action,
                "query_or_summary": query_or_summary,
                "entry_ids": [e.entry_id for e in entries],
                "working_count": len(self._working_ids),
                "stream_count": len(self._entries),
            },
            channel="data",
            priority=5,
            ttl=3,
        )

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "recency_half_life": self._recency_half_life,
                "retrieval_weights": self._weights,
                "working_capacity": self._working_capacity,
                "stream_capacity": self._stream_capacity,
                "hybrid_enabled": self._hybrid_enabled,
                "hybrid_recent_limit": self._hybrid_recent_limit,
                "hybrid_recent_boost": self._hybrid_recent_boost,
                "entries": [
                    dataclass_to_dict(e) for e in self._entries.values()
                ],
                "working_ids": list(self._working_ids),
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._recency_half_life = float(
            data.get("recency_half_life", DEFAULT_RECENCY_HALF_LIFE)
        )
        weights = data.get("retrieval_weights")
        if isinstance(weights, dict):
            self._weights = weights
        self._working_capacity = int(
            data.get("working_capacity", DEFAULT_WORKING_CAPACITY)
        )
        self._stream_capacity = int(
            data.get("stream_capacity", DEFAULT_STREAM_CAPACITY)
        )
        self._hybrid_enabled = bool(data.get("hybrid_enabled", False))
        self._hybrid_recent_limit = int(
            data.get("hybrid_recent_limit", 10)
        )
        self._hybrid_recent_boost = float(
            data.get("hybrid_recent_boost", 0.2)
        )
        self._entries = {
            e.entry_id: e
            for e in (
                reconstruct_dataclass(MemoryStreamEntry, d)
                for d in data.get("entries", [])
            )
        }
        self._working_ids = list(data.get("working_ids", []))
        self._state.custom["entries_count"] = len(self._entries)


__all__ = [
    "MemoryStream",
    "MemoryStreamEntry",
    "TOPIC_MEMORY_STREAM_UPDATE",
    "TOPIC_PAGE_IN",
    "TOPIC_PAGE_OUT",
]
