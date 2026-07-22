"""SegmentDetailEnhancer: turn macro plan items into micro lived events.

The enhancer listens for phase/network activation events and emits a
``data.schedule.segment.detail`` payload for the current segment.  In this
skeleton implementation the micro events are generated deterministically from
the phase type so the module can be wired and tested without an LLM.

VitalState (mood, arousal, creative drive, reader temperature) from
``data.metabolism.state`` is folded into the generated detail so that the same
phase can produce different micro-events depending on the agent's current
anthropomorphic state.
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

#: Extra sensory/thought modifiers applied when arousal is high or low.
_AROUSAL_MODIFIERS: dict[str, dict[str, str]] = {
    "low": {
        "sensory_prefix": " faintly ",
        "thought_suffix": "——但注意力像浸了水，迟迟聚不拢。",
    },
    "high": {
        "sensory_prefix": " sharply ",
        "thought_suffix": "——念头来得太快，几乎要撞在一起。",
    },
}

#: Mood palette chosen from VitalState mood_bias + arousal.
_MOOD_PALETTE: dict[str, list[str]] = {
    "平静": ["平静", "安静", "舒缓"],
    "愉悦": ["轻松", "轻快", "柔和地愉悦"],
    "忧郁": ["忧郁", "低沉", "淡淡的沮丧"],
    "焦虑": ["紧绷", "不安", "焦躁"],
    "兴奋": ["兴奋", "高昂", "跃跃欲试"],
}

#: Network -> preferred phase_type mapping for events that arrive as network
#: activation rather than schedule phase change.
_NETWORK_PHASE_MAP: dict[str, str] = {
    "dmn": "incubation",
    "cen": "simulation",
    "sn": "social",
}


class SegmentDetailEnhancer(Module):
    """Generate micro-layer, VitalState-aware segment details."""

    def __init__(self, name: str = "segment_detail_enhancer") -> None:
        super().__init__(name)
        self._current_plan: DailyPlan | None = None
        self._last_segment_key: str = ""
        self._vital_state: dict[str, Any] = {
            "mood_bias": "平静",
            "arousal": 0.5,
            "reader_temperature": 0.5,
            "creative_drive": 0.5,
        }
        self.subscribe(
            "control.schedule.daily_plan",
            TOPIC_ENHANCE_SEGMENT,
            "control.network.dmn.active",
            "control.network.cen.active",
            "control.network.sn.active",
            "data.metabolism.state",
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
    # VitalState helpers
    # ------------------------------------------------------------------

    def _current_mood(self, item_mood: str) -> str:
        """Blend schedule mood with live VitalState mood bias."""
        bias = str(self._vital_state.get("mood_bias", "平静")).strip() or "平静"
        arousal = float(self._vital_state.get("arousal", 0.5))
        palette = _MOOD_PALETTE.get(bias, _MOOD_PALETTE["平静"])
        if arousal > 0.7:
            palette = _MOOD_PALETTE.get("兴奋", palette)
        elif arousal < 0.3:
            palette = _MOOD_PALETTE.get("忧郁", palette)
        # Stable per item by combining item mood length with bias.
        idx = (len(item_mood or "") + len(bias)) % len(palette)
        return palette[idx]

    def _apply_arousal(self, events: list[StoryEvent]) -> list[StoryEvent]:
        """Tweak event thoughts/sensory text based on arousal level."""
        arousal = float(self._vital_state.get("arousal", 0.5))
        if 0.35 <= arousal <= 0.65:
            return events
        key = "high" if arousal > 0.65 else "low"
        modifiers = _AROUSAL_MODIFIERS[key]
        out: list[StoryEvent] = []
        for event in events:
            thought = event.thought
            if thought and not thought.endswith(")") and not thought.endswith("。"):
                thought = thought + modifiers["thought_suffix"]
            sensory = event.sensory
            if sensory and arousal > 0.65:
                sensory = f"{sensory}，鲜明得近乎刺痛"
            elif sensory and arousal < 0.35:
                sensory = f"{sensory}，像隔着一层雾"
            out.append(
                StoryEvent(
                    what=event.what,
                    when=event.when,
                    where=event.where,
                    sensory=sensory,
                    body=event.body,
                    thought=thought,
                    source=event.source,
                )
            )
        return out

    def _should_proactively_reach(self, phase_type: str) -> bool:
        """Decide whether the agent feels like initiating contact."""
        if phase_type not in ("creation", "social", "reflection"):
            return False
        reader_temperature = float(self._vital_state.get("reader_temperature", 0.5))
        creative_drive = float(self._vital_state.get("creative_drive", 0.5))
        # Higher reader warmth + creative itch -> more likely to reach out.
        return (reader_temperature + creative_drive) > 1.0

    # ------------------------------------------------------------------
    # Deterministic generation (LLM-free skeleton)
    # ------------------------------------------------------------------

    def _deterministic_detail(self, item: PlanItem) -> SegmentDetail:
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
        today_events = self._apply_arousal(today_events)

        proactive_events: list[ProactiveEvent] = []
        if self._should_proactively_reach(phase_type):
            seed = item.message_seed or self._default_impulse(phase_type)
            if seed:
                proactive_events.append(
                    ProactiveEvent(
                        impulse=seed,
                        decision="pending",
                    )
                )

        mood = self._current_mood(item.mood)
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
            StateVariable(
                name="mood_bias",
                value=mood,
                basis="vital_state",
                confidence=0.7,
            ),
            StateVariable(
                name="arousal",
                value=self._vital_state.get("arousal", 0.5),
                basis="vital_state",
                confidence=0.7,
            ),
        ]

        return SegmentDetail(
            summary=f"{item.activity}，{mood}",
            summary_basis=item.basis or ["schedule", "vital_state", "deterministic_fallback"],
            summary_confidence=item.confidence,
            today_events=[e for e in today_events if e.what],
            proactive_events=proactive_events,
            state_variables=state_variables,
        )

    def _default_impulse(self, phase_type: str) -> str:
        impulses = {
            "creation": "想分享刚写下的一句",
            "social": "想问问你今天过得怎么样",
            "reflection": "想把今天的一件事说给你听",
        }
        return impulses.get(phase_type, "")

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
        """Pick up an existing daily plan and optional VitalState overrides."""
        plan = context.get("daily_plan")
        if isinstance(plan, DailyPlan):
            self.set_plan(plan)
        vital = context.get("vital_state")
        if isinstance(vital, dict):
            self._vital_state.update(vital)

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
        if topic == "data.metabolism.state":
            payload = message.payload or {}
            for key in ("mood_bias", "arousal", "reader_temperature", "creative_drive"):
                if key in payload:
                    self._vital_state[key] = payload[key]
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
