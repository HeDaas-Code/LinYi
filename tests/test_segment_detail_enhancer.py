# -*- coding: utf-8 -*-
"""Tests for SegmentDetailEnhancer."""
from __future__ import annotations

import datetime
from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.daily_plan import DailyPlan, PlanItem
from src.novelist_brain.segment_detail_enhancer import SegmentDetailEnhancer


def test_enhancer_generates_detail_on_network_activation() -> None:
    router = BusRouter()
    enhancer = SegmentDetailEnhancer(name="segment_detail_enhancer")
    enhancer.register(router)
    enhancer.init({})

    plan = DailyPlan(
        date=datetime.date(2026, 7, 22),
        items=[
            PlanItem(
                time=datetime.time(8, 0),
                end=datetime.time(12, 0),
                activity="上午构思",
                mood="安静",
                phase_type="incubation",
                basis=["schedule"],
                confidence=0.8,
            ),
        ],
    )
    enhancer.set_plan(plan)

    now = datetime.datetime(2026, 7, 22, 9, 0)
    item = plan.item_at(now)
    assert item is not None
    detail = enhancer._deterministic_detail(item)
    assert detail.summary
    assert len(detail.today_events) > 0
    assert detail.state_variables[0].name == "phase_type"


def test_enhancer_emits_bus_event() -> None:
    router = BusRouter()
    enhancer = SegmentDetailEnhancer(name="segment_detail_enhancer")
    enhancer.register(router)
    enhancer.init({})

    plan = DailyPlan(
        date=datetime.date(2026, 7, 22),
        items=[
            PlanItem(
                time=datetime.time(14, 0),
                end=datetime.time(18, 0),
                activity="模拟推演",
                phase_type="simulation",
            ),
        ],
    )
    enhancer.set_plan(plan)

    emitted: list[dict[str, Any]] = []
    original_emit = enhancer.emit

    def _capture_emit(**kwargs: Any) -> None:
        emitted.append(kwargs)
        original_emit(**kwargs)

    enhancer.emit = _capture_emit  # type: ignore[method-assign]

    router.publish(
        source="test",
        topic="control.network.cen.active",
        channel="control",
        payload={},
        priority=5,
        ttl=3,
    )
    router.flush()

    assert len(emitted) == 1
    payload = emitted[0]["payload"]
    assert payload["item"]["activity"] == "模拟推演"
    assert len(payload["detail"]["today_events"]) > 0


def test_vital_state_shapes_detail() -> None:
    router = BusRouter()
    enhancer = SegmentDetailEnhancer(name="segment_detail_enhancer")
    enhancer.register(router)
    enhancer.init({})

    router.publish(
        source="metabolism",
        topic="data.metabolism.state",
        channel="data",
        payload={
            "mood_bias": "兴奋",
            "arousal": 0.85,
            "reader_temperature": 0.8,
            "creative_drive": 0.9,
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    # Use a time window that contains the current wall-clock time so the
    # enhancer's _enhance_current_segment finds the active item.
    now = datetime.datetime.now()
    start = now - datetime.timedelta(hours=1)
    end = now + datetime.timedelta(hours=1)
    plan = DailyPlan(
        date=now.date(),
        items=[
            PlanItem(
                time=start.time(),
                end=end.time(),
                activity="晚间创作",
                phase_type="creation",
                message_seed="想写一段关于雨的描写",
            ),
        ],
    )
    enhancer.set_plan(plan)

    emitted: list[dict[str, Any]] = []
    original_emit = enhancer.emit

    def _capture_emit(**kwargs: Any) -> None:
        emitted.append(kwargs)
        original_emit(**kwargs)

    enhancer.emit = _capture_emit  # type: ignore[method-assign]

    router.publish(
        source="test",
        topic="control.network.cen.active",
        channel="control",
        payload={},
        priority=5,
        ttl=3,
    )
    router.flush()

    assert len(emitted) == 1
    detail = emitted[0]["payload"]["detail"]
    # High arousal + excited mood should surface in summary or state variables.
    excited_palettes = {"兴奋", "高昂", "跃跃欲试"}
    summary_mood = detail["summary"].split("，")[-1]
    assert summary_mood in excited_palettes or any(
        sv["name"] == "mood_bias" and str(sv["value"]) in excited_palettes
        for sv in detail["state_variables"]
    )
    # High reader_temperature + creative_drive should produce a proactive event.
    assert len(detail["proactive_events"]) > 0
