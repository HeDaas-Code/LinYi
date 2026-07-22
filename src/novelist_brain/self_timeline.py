"""SelfTimeline: a cross-module "what have I been up to?" record.

The SelfTimeline collects, indexes and serves short textual records of
what the agent has done recently.  It exists to address a very specific
failure mode described in the v2 spec:

> DMN / CEN cannot answer the question "what have I already done today?",
> so they keep generating the same fragment / paragraph over and over.

The module subscribes to a small set of well-known topics, derives a
*TimelineEntry* from each relevant payload and stores it in an
append-only ring.  Public callers (DMN, CEN, dashboard) can then query
``collect_entries`` with a textual query and receive the most relevant
recent entries scored by (a) keyword overlap, (b) recency and
(c) optional importance/salience carried in the payload.

The module is intentionally **read-only** with respect to the rest of the
system: it never edits other modules' state.  It also never invokes the
LLM, so it can be queried cheaply inside tight loops.
"""

from __future__ import annotations

import math
import re
import time
from dataclasses import dataclass, field
from typing import Any, Iterable

from .models import BusMessage, ModuleState, TickDelta
from .module import Module
from .persistence import dataclass_to_dict, reconstruct_dataclass
from .anthropomorphic_gate import normalize_fragment_text

#: Topics whose payloads are always timeline-worthy.  Anything else is
#: ignored so we do not accidentally double-count control traffic.
DEFAULT_TOPICS: tuple[str, ...] = (
    "fragment.personal.new",
    "fragment.social.new",
    "fragment.memory.new",
    "fragment.dream.new",
    "fragment.novel.new",
    "fragment.dmn.new",
    "fragment.cen.new",
    "data.sandbox.narrative.ready",
    "data.novel.paragraph",
    "event.novel.paragraph.published",
    "data.memory.trace.created",
    "data.oc.town.event",
)

#: Topics emitted by *control.* / *event.* rarely carry content; if they
#: ever need to be tracked, callers can opt in explicitly.
#
# Half-life for the recency decay (in seconds).  Defaults to 12 hours so
# "today" entries stay near the top of the ranking.
RECENCY_HALF_LIFE_SECONDS = 12 * 3600.0

#: Hard cap on stored entries.  Older entries are evicted first; this is
#: the simplest, safest forgetting policy.
DEFAULT_MAX_ENTRIES = 2000

#: Default cap for ``collect_entries`` / ``format_recent`` callers.
DEFAULT_QUERY_LIMIT = 8

#: Maximum length of a normalised text used for keyword extraction.
_MAX_KEYWORD_CHARS = 200

#: Topic emitted when the timeline content changes.
TOPIC_SELF_TIMELINE_UPDATED = "data.self.timeline.updated"

#: Stopwords we drop before building the keyword bag (small but useful
#: in both Chinese and English for this domain).
_STOPWORDS: frozenset[str] = frozenset({
    "的", "了", "是", "在", "我", "你", "他", "她", "它", "们",
    "和", "与", "及", "或", "也", "就", "都", "还", "才", "却",
    "但", "而", "且", "若", "如", "似", "像", "有", "无", "没",
    "the", "a", "an", "is", "are", "was", "were", "of", "to",
    "in", "on", "at", "and", "or", "but", "for", "with", "i",
})


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class TimelineEntry:
    """A single record in the self-timeline.

    The ``source`` field captures which upstream topic produced the entry
    so the dashboard can colour-code / filter the timeline.
    """

    entry_id: str
    source: str
    summary: str
    detail: str = ""
    timestamp: float = 0.0
    importance: float = 0.5
    keywords: list[str] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return dataclass_to_dict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TimelineEntry":
        return reconstruct_dataclass(cls, data)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_TOKEN_RE = re.compile(r"[\u4e00-\u9fff]{2,6}|[A-Za-z0-9_\-]{3,24}")


def _extract_keywords(text: str, *, limit: int = 8) -> list[str]:
    """Return a small bag of representative tokens from ``text``."""
    if not text:
        return []
    cleaned = normalize_fragment_text(text)
    if not cleaned:
        return []
    tokens = _TOKEN_RE.findall(cleaned)
    seen: set[str] = set()
    out: list[str] = []
    for token in tokens:
        token = token.strip().lower()
        if not token or token in _STOPWORDS or token in seen:
            continue
        seen.add(token)
        out.append(token)
        if len(out) >= limit:
            break
    return out


def _now() -> float:
    return time.time()


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _extract_summary(payload: Any) -> str:
    """Best-effort summary extraction from an arbitrary payload."""
    if payload is None:
        return ""
    if isinstance(payload, str):
        return payload.strip()[:_MAX_KEYWORD_CHARS]
    if isinstance(payload, dict):
        for key in ("summary", "text", "preview", "content"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:_MAX_KEYWORD_CHARS]
        # Fall back to the fragment payload stored by memory.py
        fragment = payload.get("fragment")
        if isinstance(fragment, dict):
            value = fragment.get("content") or fragment.get("text")
            if isinstance(value, str) and value.strip():
                return value.strip()[:_MAX_KEYWORD_CHARS]
        if isinstance(fragment, str) and fragment.strip():
            return fragment.strip()[:_MAX_KEYWORD_CHARS]
        # Trace payloads
        trace = payload.get("trace")
        if isinstance(trace, dict):
            value = trace.get("content") or trace.get("summary")
            if isinstance(value, str) and value.strip():
                return value.strip()[:_MAX_KEYWORD_CHARS]
    return ""


def _extract_detail(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("detail", "description", "body", "reason"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:300]
    return ""


def _extract_importance(payload: Any) -> float:
    if isinstance(payload, dict):
        for key in ("importance", "salience", "weight"):
            value = payload.get(key)
            if isinstance(value, (int, float)):
                return max(0.0, min(1.0, float(value)))
        fragment = payload.get("fragment")
        if isinstance(fragment, dict):
            value = fragment.get("salience") or fragment.get("importance")
            if isinstance(value, (int, float)):
                return max(0.0, min(1.0, float(value)))
        trace = payload.get("trace")
        if isinstance(trace, dict):
            value = trace.get("importance")
            if isinstance(value, (int, float)):
                return max(0.0, min(1.0, float(value)))
    return 0.5


# ---------------------------------------------------------------------------
# Module
# ---------------------------------------------------------------------------


class SelfTimeline(Module):
    """Collect and serve recent agent activity as a searchable timeline."""

    def __init__(
        self,
        name: str = "self_timeline",
        *,
        max_entries: int = DEFAULT_MAX_ENTRIES,
        topics: Iterable[str] = DEFAULT_TOPICS,
        half_life_seconds: float = RECENCY_HALF_LIFE_SECONDS,
    ) -> None:
        super().__init__(name)
        self._entries: list[TimelineEntry] = []
        self._max_entries = max(1, int(max_entries))
        self._half_life = max(60.0, float(half_life_seconds))
        for topic in topics:
            self.subscribe(topic)
        # Manual writes use a dedicated channel so other modules can append
        # without having to fake a bus event.
        self.subscribe("control.timeline.append")

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            last_tick=0.0,
            custom={
                "entry_count": 0,
                "append_calls": 0,
                "query_calls": 0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def entries(self) -> list[TimelineEntry]:
        """Return a copy of the timeline in chronological order."""
        return list(self._entries)

    def append(
        self,
        source: str,
        summary: str,
        *,
        detail: str = "",
        importance: float = 0.5,
        timestamp: float | None = None,
        extra: dict[str, Any] | None = None,
    ) -> TimelineEntry:
        """Manually append a timeline entry (e.g. for tests or scripts)."""
        entry = TimelineEntry(
            entry_id=f"tl_{int(_now() * 1000)}_{len(self._entries)}",
            source=source,
            summary=_safe_text(summary),
            detail=_safe_text(detail),
            timestamp=float(timestamp) if timestamp is not None else _now(),
            importance=max(0.0, min(1.0, float(importance))),
            keywords=_extract_keywords(summary + " " + detail),
            extra=dict(extra or {}),
        )
        self._entries.append(entry)
        self._trim()
        self._state.custom["entry_count"] = len(self._entries)
        self._state.custom["append_calls"] = int(self._state.custom.get("append_calls", 0)) + 1
        if self._router is not None:
            self._publish_update(entry)
        return entry

    def collect_entries(
        self,
        query: str = "",
        *,
        limit: int = DEFAULT_QUERY_LIMIT,
        now: float | None = None,
        min_score: float = 0.0,
    ) -> list[TimelineEntry]:
        """Return at most ``limit`` entries scored by relevance + recency.

        The score is computed as:

            alpha * keyword_overlap
          + beta  * recency_decay
          + gamma * importance

        with sensible default weights (alpha=0.5, beta=0.3, gamma=0.2).
        """
        if not self._entries:
            return []
        limit = max(1, int(limit))
        now = now if now is not None else _now()
        query_keywords = set(_extract_keywords(query, limit=12))
        scored: list[tuple[float, float, TimelineEntry]] = []
        for entry in self._entries:
            if query_keywords:
                overlap = len(query_keywords & set(entry.keywords))
                relevance = overlap / max(1, len(query_keywords))
            else:
                relevance = 0.0
            age = max(0.0, now - entry.timestamp)
            recency = math.exp(-math.log(2.0) * age / self._half_life)
            score = 0.5 * relevance + 0.3 * recency + 0.2 * entry.importance
            if score < min_score:
                continue
            scored.append((score, recency, entry))
        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        return [entry for _, _, entry in scored[:limit]]

    def format_recent(
        self,
        limit: int = DEFAULT_QUERY_LIMIT,
        *,
        now: float | None = None,
    ) -> str:
        """Return a short human-readable summary of recent activity."""
        entries = self.collect_entries("", limit=limit, now=now)
        if not entries:
            return ""
        lines = ["[SelfTimeline recent]"]
        for entry in entries:
            when = time.strftime("%H:%M", time.localtime(entry.timestamp))
            text = entry.summary or entry.detail
            lines.append(f"- {when} | {entry.source} | {text}")
        return "\n".join(lines)

    def is_already_done_today(
        self,
        text: str,
        *,
        window_seconds: float = 12 * 3600,
        threshold: float = 0.45,
        now: float | None = None,
    ) -> tuple[bool, TimelineEntry | None]:
        """Return ``(already_done, matching_entry)`` if ``text`` is too close
        to a recent entry.
        """
        if not text:
            return False, None
        text_keywords = set(_extract_keywords(text, limit=12))
        if not text_keywords:
            return False, None
        now = now if now is not None else _now()
        best: tuple[float, TimelineEntry] | None = None
        for entry in self._entries:
            age = now - entry.timestamp
            if age < 0 or age > window_seconds:
                continue
            entry_keywords = set(entry.keywords)
            if not entry_keywords:
                continue
            overlap = len(text_keywords & entry_keywords)
            if overlap == 0:
                continue
            score = overlap / max(1, len(text_keywords | entry_keywords))
            if best is None or score > best[0]:
                best = (score, entry)
        if best and best[0] >= threshold:
            return True, best[1]
        return False, None

    def clear(self) -> None:
        """Remove every entry.  Mostly useful for tests."""
        self._entries.clear()
        self._state.custom["entry_count"] = 0

    # ------------------------------------------------------------------
    # Bus integration
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:  # noqa: D401 - inherited
        """The SelfTimeline does not require any external dependencies."""
        return None

    def on_bus_message(self, message: BusMessage) -> None:
        """Translate incoming bus events into timeline entries."""
        if not self._state.active:
            return
        topic = message.topic
        if topic == "control.timeline.append":
            payload = message.payload or {}
            if not isinstance(payload, dict):
                return
            self.append(
                source=_safe_text(payload.get("source", "control")) or "control",
                summary=_safe_text(payload.get("summary", "")),
                detail=_safe_text(payload.get("detail", "")),
                importance=payload.get("importance", 0.5),
                extra=payload.get("extra"),
            )
            return
        summary = _extract_summary(message.payload)
        if not summary:
            return
        detail = _extract_detail(message.payload)
        importance = _extract_importance(message.payload)
        self.append(
            source=topic,
            summary=summary,
            detail=detail,
            importance=importance,
            timestamp=_now(),
            extra={"channel": message.channel, "priority": message.priority},
        )

    def tick(self, delta: TickDelta) -> None:
        """No-op: the timeline is event-driven.  We only update bookkeeping."""
        self._state.last_tick = delta.absolute_time
        self._trim()
        self._state.custom["entry_count"] = len(self._entries)

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "entries": [entry.to_dict() for entry in self._entries],
                "max_entries": self._max_entries,
                "half_life_seconds": self._half_life,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._max_entries = int(data.get("max_entries", self._max_entries))
        self._half_life = float(data.get("half_life_seconds", self._half_life))
        self._entries = [
            TimelineEntry.from_dict(entry)
            for entry in data.get("entries", [])
        ]
        self._state.custom["entry_count"] = len(self._entries)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _trim(self) -> None:
        if len(self._entries) <= self._max_entries:
            return
        # Drop the oldest entries.  We keep chronological order so the
        # operation is a simple slice.
        overflow = len(self._entries) - self._max_entries
        del self._entries[:overflow]

    def _publish_update(self, entry: TimelineEntry) -> None:
        self.emit(
            topic=TOPIC_SELF_TIMELINE_UPDATED,
            payload={
                "action": "append",
                "events": [entry.to_dict()],
                "entry_count": len(self._entries),
            },
            channel="data",
            priority=5,
            ttl=3,
        )


__all__ = [
    "SelfTimeline",
    "TimelineEntry",
    "DEFAULT_TOPICS",
    "RECENCY_HALF_LIFE_SECONDS",
    "DEFAULT_MAX_ENTRIES",
    "DEFAULT_QUERY_LIMIT",
    "TOPIC_SELF_TIMELINE_UPDATED",
]
