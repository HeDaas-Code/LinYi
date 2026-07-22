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
