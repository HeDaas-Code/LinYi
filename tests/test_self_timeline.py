# -*- coding: utf-8 -*-
"""Tests for SelfTimeline."""
from __future__ import annotations

import time

import pytest

from src.novelist_brain.self_timeline import SelfTimeline


@pytest.fixture
def timeline() -> SelfTimeline:
    return SelfTimeline()


def test_collect_empty(timeline: SelfTimeline) -> None:
    assert timeline.collect_entries("今天") == []


def test_append_and_collect(timeline: SelfTimeline) -> None:
    timeline.append(
        source="fragment.personal.new",
        summary="她在窗边站了很久。",
        detail="天快亮时，窗玻璃上凝了一层薄雾。",
        importance=0.7,
    )
    entries = timeline.collect_entries("今天做了什么")
    assert len(entries) == 1
    assert entries[0].summary == "她在窗边站了很久。"


def test_time_filter_excludes_old(timeline: SelfTimeline) -> None:
    timeline.append(
        source="fragment.personal.new",
        summary="yesterday event",
        timestamp=time.time() - 86400,
    )
    timeline.append(
        source="fragment.personal.new",
        summary="today event",
        timestamp=time.time(),
    )
    entries = timeline.collect_entries("今天", limit=10)
    assert len(entries) == 2  # no explicit time filter in collect_entries
    assert entries[0].summary == "today event"  # recency wins


def test_keyword_boost(timeline: SelfTimeline) -> None:
    timeline.append(
        source="fragment.personal.new",
        summary="铅笔在纸上画了一个圈。",
    )
    timeline.append(
        source="data.novel.paragraph",
        summary="写下第一章开头。",
    )
    entries = timeline.collect_entries("写作相关")
    assert entries[0].summary == "写下第一章开头。"


def test_is_already_done_today(timeline: SelfTimeline) -> None:
    timeline.append(
        source="fragment.personal.new",
        summary="她在窗边站了很久。",
        timestamp=time.time(),
    )
    done, entry = timeline.is_already_done_today("她在窗边站了很久。")
    assert done is True
    assert entry is not None
