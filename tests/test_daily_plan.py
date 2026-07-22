# -*- coding: utf-8 -*-
"""Tests for the two-layer daily plan model."""
from __future__ import annotations

import datetime

from src.novelist_brain.daily_plan import (
    DailyPlan,
    PlanItem,
    SegmentDetail,
    StoryEvent,
    ProactiveEvent,
    StateVariable,
)


def test_plan_item_duration() -> None:
    item = PlanItem(
        time=datetime.time(8, 0),
        end=datetime.time(12, 0),
        activity="写作",
    )
    assert item.duration_minutes == 240
    assert item.contains_time(datetime.time(10, 0))
    assert not item.contains_time(datetime.time(13, 0))


def test_plan_item_wraps_midnight() -> None:
    item = PlanItem(
        time=datetime.time(23, 0),
        end=datetime.time(1, 0),
        activity="深夜阅读",
    )
    assert item.duration_minutes == 120
    assert item.contains_time(datetime.time(0, 0))


def test_daily_plan_item_at() -> None:
    plan = DailyPlan(
        date=datetime.date(2026, 7, 22),
        items=[
            PlanItem(
                time=datetime.time(6, 0),
                end=datetime.time(8, 0),
                activity="晨间",
            ),
            PlanItem(
                time=datetime.time(8, 0),
                end=datetime.time(12, 0),
                activity="写作",
            ),
        ],
    )
    assert plan.item_at(datetime.datetime(2026, 7, 22, 7, 0)).activity == "晨间"
    assert plan.item_at(datetime.datetime(2026, 7, 22, 10, 0)).activity == "写作"
    assert plan.item_at(datetime.datetime(2026, 7, 22, 13, 0)) is None


def test_segment_detail_roundtrip() -> None:
    item = PlanItem(
        time=datetime.time(14, 0),
        end=datetime.time(18, 0),
        activity="模拟推演",
    )
    detail = SegmentDetail(
        summary="在 sandbox 里推演第三章的情节走向。",
        today_events=[
            StoryEvent(
                what="打开了 sandbox 的编辑器",
                when="14:05",
                sensory="屏幕的光映在脸上，有点刺眼",
            ),
        ],
        proactive_events=[
            ProactiveEvent(impulse="想告诉读者今天写得很顺"),
        ],
        state_variables=[
            StateVariable(name="energy", value=0.6, basis="metabolism"),
        ],
    )
    plan = DailyPlan(date=datetime.date(2026, 7, 22))
    plan.set_detail(item, detail)
    retrieved = plan.detail_for(item)
    assert retrieved is not None
    assert retrieved.summary == detail.summary
    assert len(retrieved.today_events) == 1
    assert retrieved.today_events[0].what == "打开了 sandbox 的编辑器"
    assert len(retrieved.proactive_events) == 1
    assert retrieved.state_variables[0].name == "energy"
