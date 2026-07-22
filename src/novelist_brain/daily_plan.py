"""Two-layer daily plan model for anthropomorphic rhythm.

The two layers are:

* ``DailyPlan`` / ``PlanItem`` -- the macro plan: what 林逸 is roughly doing
  at each time of day (activity, mood, message seed, basis, confidence).
* ``SegmentDetail`` -- the micro layer: the small continuous events that
  happen inside the current segment (``today_events``), plus optional
  proactive impulses (``proactive_events``) and local state variables.

This module is intentionally data-only.  LLM-driven generation lives in
``DailyPlanGenerator`` / ``SegmentDetailEnhancer``; deterministic fallbacks
live in ``DailyScheduler``.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from typing import Any


@dataclass
class StateVariable:
    """A named local state variable emitted by segment detailing."""

    name: str
    value: Any
    basis: str = ""
    confidence: float = 0.5


@dataclass
class StoryEvent:
    """A small, lived event inside a segment.

    ``what`` is a short sentence (action + object + place).  ``sensory`` and
    ``body`` are optional sensory/bodily details that make the event feel
    grounded rather than abstract.
    """

    what: str
    when: str = ""  # e.g. " segment 开头 " or a concrete time
    where: str = ""
    sensory: str = ""  # 视觉 / 听觉 / 触觉 / 嗅觉 / 味觉
    body: str = ""  # 身体感受
    thought: str = ""  # 一闪而过的念头
    source: str = "generated"


@dataclass
class ProactiveEvent:
    """An optional impulse for 林逸 to say/do something toward the reader.

    ``impulse`` is the raw urge.  ``text`` is the rendered message (if any).
    ``decision`` records whether the impulse was acted on, suppressed, or
    postponed -- this lets downstream modules decide whether to surface it.
    """

    impulse: str
    text: str = ""
    decision: str = "pending"  # pending | act | suppress | postpone
    reason: str = ""


@dataclass
class PlanItem:
    """One row of the macro daily plan.

    ``time`` / ``end`` are ``datetime.time`` objects describing the intended
    wall-clock bounds.  ``activity`` is a short human-readable label.
    ``mood`` is a 2-3 word affect label.  ``message_seed`` carries any thought
    林逸 might want to share with the reader.  ``basis`` lists which inputs
    influenced the item (calendar, persona, state, weather, continuity,
    inspiration).  ``confidence`` is the planner's confidence in this item.
    """

    time: datetime.time
    end: datetime.time
    activity: str
    mood: str = ""
    message_seed: str = ""
    basis: list[str] = field(default_factory=list)
    confidence: float = 0.5
    phase_type: str = ""
    preferred_network: str = "dmn"
    energy_budget: float = 0.0

    @property
    def start_minutes(self) -> int:
        return self.time.hour * 60 + self.time.minute

    @property
    def end_minutes(self) -> int:
        return self.end.hour * 60 + self.end.minute

    @property
    def duration_minutes(self) -> int:
        end = self.end_minutes
        start = self.start_minutes
        if end <= start:
            end += 24 * 60
        return end - start

    def contains_time(self, t: datetime.time) -> bool:
        minutes = t.hour * 60 + t.minute
        start = self.start_minutes
        end = self.end_minutes
        wraps = end <= start
        if wraps:
            end += 24 * 60
        if wraps and minutes < start:
            minutes += 24 * 60
        return start <= minutes <= end


@dataclass
class SegmentDetail:
    """Micro-layer detail for a single PlanItem / phase.

    ``summary`` is a one-sentence description of what is happening in this
    segment.  ``today_events`` are the small lived events.  ``proactive_events``
    are optional impulses toward the reader.  ``state_variables`` carry local
    state (energy dip, location change, weather effect, etc.).
    """

    segment_key: str = ""
    summary: str = ""
    summary_basis: list[str] = field(default_factory=list)
    summary_confidence: float = 0.5
    today_events: list[StoryEvent] = field(default_factory=list)
    proactive_events: list[ProactiveEvent] = field(default_factory=list)
    state_variables: list[StateVariable] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not self.summary and not self.today_events


@dataclass
class DailyPlan:
    """A full two-layer day plan."""

    date: datetime.date
    items: list[PlanItem] = field(default_factory=list)
    details: dict[str, SegmentDetail] = field(default_factory=dict)
    fallback: bool = False
    interrupts: list[dict[str, Any]] = field(default_factory=list)

    def item_at(self, dt: datetime.datetime) -> PlanItem | None:
        t = dt.time()
        for item in self.items:
            if item.contains_time(t):
                return item
        return None

    def detail_for(self, item: PlanItem) -> SegmentDetail | None:
        key = self._segment_key(item.time)
        return self.details.get(key)

    def set_detail(self, item: PlanItem, detail: SegmentDetail) -> None:
        key = self._segment_key(item.time)
        detail.segment_key = key
        self.details[key] = detail

    @staticmethod
    def _segment_key(t: datetime.time) -> str:
        return f"{t.hour:02d}:{t.minute:02d}"


__all__ = [
    "DailyPlan",
    "PlanItem",
    "SegmentDetail",
    "StateVariable",
    "StoryEvent",
    "ProactiveEvent",
]
