"""SegmentDetailEnhancer: turn macro plan items into micro lived events.

The enhancer listens for phase/network activation events and emits a
:data.schedule.segment.detail` payload for the current segment.  In this
skeleton implementation the micro events are generated deterministically
from the phase type so the module can be wired and tested without an LLM.
A future version can replace the deterministic templates with an LLM call
that consults VitalState, SelfTimeline and WorldStateContract.
"""

from __future__ import annotations

import datetime
import time
from typing import Any

from src.novelist_brain.daily_plan import (
    DailyPlan,
    PlanItem,
    ProactiveEvent,
    SegmentDetail,
    StateVariable,
    StoryEvent,
)
from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


#: Topic emitted when the active schedule segment changes.
TOPIC_SEGMENT_DETAIL = "data.schedule.segment.detail"

#: Topic emitted when the agent should enhance the current segment.
#: Other modules can publish this to request a fresh detail (e.g. on phase
#: boundaries or user-driven interrupts).
TOPIC_ENHANCE_SEGMENT = "control.schedule.enhance_segment"

#: Tiny deterministic event bank per phase type.  These are intentionally
#: concrete and low-stakes; they give the SelfTimeline something to record
#: until the LLM-driven generator is wired in.
_EVENT_BANK: dict[str, list[dict[str, str]]] = {
    "deep_night": [
        {"what": "翻了个身，被子滑落了一半", "body": "床垫的凉意贴着脊背"},
        {"what": "窗帘缝隙漏进一点路灯", "sensory": "光在天花板上慢慢移动"},
    ],
    "morning": [
        {"what": "把水杯放到桌上", "sensory": "杯底和木头接触时发出轻响"},
        {"what": "站在窗边看了几分钟", "body": "肩膀还留着被窝里的温度"},
    ],
    "incubation": [
        {"what": "随手在纸上画了一个圈", "thought": "这个意象好像和昨晚的梦有关"},
        {"what": "听见窗外有鸟叫", "sensory": "声音断断续续，像有人在试音"},
    ],
    "social": [
        {"what": "把椅子往桌子方向挪了挪", "body": "后腰抵到椅背的弧度"},
        {"what": "看了一眼屏幕右下角的时间", "thought": "还来得及说点什么"},
    ],
    "simulation": [
        {"what": "打开 sandbox 的草稿", "sensory": "光标在空白处闪了两下"},
        {"what": "把一条时间线拖到另一条旁边", "thought": "这里也许可以制造一个错位"},
    ],
    "reflection": [
        {"what": "合上写了一半的笔记", "body": "指节有点酸"},
        {"what": "望着窗外发呆", "thought": "今天的状态和昨天不太一样"},
    ],
    "creation": [
        {"what": "在键盘上敲下一行", "sensory": "字符一个个排成句子"},
        {"what": "删掉刚写的半段", "thought": "节奏不对，再压一压"},
    ],
}

#: Network -> preferred phase_type mapping for events that arrive as network
#: activation rather than schedule phase change.
_NETWORK_PHASE_MAP: dict[str, str] = {
    "dmn": "incubation",
    "cen": "simulation",
    "sn": "social",
}


class SegmentDetailEnhancer(Module):
    """Generate micro-layer segment details from macro plan items."""

    def __init__(self, name: str = "segment_detail_enhancer") -> None:
        super().__init__(name)
        self._current_plan: DailyPlan | None = None
        self._last_segment_key: str = ""
        self.subscribe(
            "control.schedule.daily_plan",
            "control.schedule.enhance_segment",
            "control.network.dmn.active",
            "control.network.cen.active",
            "control.network.sn.active",
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            last_tick=0.0,
            custom={
                "details_generated": 0,
                "current_segment_key": "",
            },
        )

    def set_plan(self, plan: DailyPlan) -> None:
        """Set or refresh the macro plan used for segment detailing."""
        self._current_plan = plan

    # ------------------------------------------------------------------
    # Deterministic generation (LLM-free skeleton)
    # ------------------------------------------------------------------

    @staticmethod
    def _deterministic_detail(item: PlanItem) -> SegmentDetail:
        phase_type = item.phase_type or "incubation"
        bank = _EVENT_BANK.get(phase_type, _EVENT_BANK["incubation"])
        # Use the item start time as a stable seed for deterministic selection.
        index = (item.start_minutes // 30) % max(1, len(bank))
        event_templates = [bank[index]]
        if len(bank) > 1:
            second_index = (index + 1) % len(bank)
            event_templates.append(bank[second_index])

        today_events = [
            StoryEvent(
                what=t.get("what", ""),
                when=f"{item.time.strftime('%H:%M')} 前后",
                where=t.get("where", ""),
                sensory=t.get("sensory", ""),
                body=t.get("body", ""),
                thought=t.get("thought", ""),
                source="deterministic",
            )
            for t in event_templates
        ]

        proactive_events: list[ProactiveEvent] = []
        if phase_type == "creation" and item.message_seed:
            proactive_events.append(
                ProactiveEvent(
                    impulse=item.message_seed,
                    decision="pending",
                )
            )

        state_variables = [
            StateVariable(
                name="phase_type",
                value=phase_type,
                basis="schedule",
                confidence=1.0,
            ),
            StateVariable(
                name="energy_budget",
                value=item.energy_budget,
                basis="schedule",
                confidence=0.8,
            ),
        ]

        return SegmentDetail(
            summary=f"{item.activity}，{item.mood or '状态如常'}",
            summary_basis=item.basis or ["schedule", "deterministic_fallback"],
            summary_confidence=item.confidence,
            today_events=[e for e in today_events if e.what],
            proactive_events=proactive_events,
            state_variables=state_variables,
        )

    def _enhance_current_segment(self, phase_type: str) -> None:
        if self._current_plan is None:
            return
        now = datetime.datetime.now()
        item = self._current_plan.item_at(now)
        if item is None:
            return
        key = DailyPlan._segment_key(item.time)
        # Only regenerate if we have moved to a new segment.
        if key == self._last_segment_key:
            return
        self._last_segment_key = key

        # Allow phase_type hint to override if the schedule item has no type.
        if not item.phase_type and phase_type:
            item.phase_type = phase_type

        detail = self._deterministic_detail(item)
        self._current_plan.set_detail(item, detail)

        self._state.custom["details_generated"] = (
            int(self._state.custom.get("details_generated", 0)) + 1
        )
        self._state.custom["current_segment_key"] = key

        self.emit(
            topic=TOPIC_SEGMENT_DETAIL,
            payload={
                "segment_key": key,
                "item": {
                    "time": item.time.isoformat(),
                    "end": item.end.isoformat(),
                    "activity": item.activity,
                    "mood": item.mood,
                    "phase_type": item.phase_type,
                },
                "detail": {
                    "summary": detail.summary,
                    "today_events": [
                        {
                            "what": e.what,
                            "when": e.when,
                            "where": e.where,
                            "sensory": e.sensory,
                            "body": e.body,
                            "thought": e.thought,
                        }
                        for e in detail.today_events
                    ],
                    "proactive_events": [
                        {"impulse": e.impulse, "text": e.text, "decision": e.decision}
                        for e in detail.proactive_events
                    ],
                    "state_variables": [
                        {"name": sv.name, "value": sv.value, "basis": sv.basis}
                        for sv in detail.state_variables
                    ],
                },
            },
            channel="data",
            priority=5,
            ttl=3,
        )

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:  # noqa: D401 - inherited
        """Pick up an existing daily plan from context if present."""
        plan = context.get("daily_plan")
        if isinstance(plan, DailyPlan):
            self.set_plan(plan)

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        if topic == "control.schedule.daily_plan":
            payload = message.payload or {}
            plan = payload.get("plan")
            if isinstance(plan, DailyPlan):
                self.set_plan(plan)
            return
        if topic == TOPIC_ENHANCE_SEGMENT:
            payload = message.payload or {}
            self._enhance_current_segment(payload.get("phase_type", ""))
            return
        if topic.startswith("control.network.") and topic.endswith(".active"):
            phase_type = _NETWORK_PHASE_MAP.get(
                topic.split(".")[-2], "incubation"
            )
            self._enhance_current_segment(phase_type)

    def tick(self, delta: TickDelta) -> None:
        self._state.last_tick = delta.absolute_time
