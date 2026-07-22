# -*- coding: utf-8 -*-
"""Tests for ImportanceScorer."""
from __future__ import annotations

from dataclasses import dataclass

import pytest

from src.novelist_brain.importance_scorer import ImportanceScorer


@dataclass
class _DummyFragment:
    source: str = "personal"
    modality: str = "event"
    valence: float = 0.0
    arousal: float = 0.0
    tags: list[str] | None = None
    content: str = ""


@pytest.fixture
def scorer() -> ImportanceScorer:
    return ImportanceScorer()


def test_score_range(scorer: ImportanceScorer) -> None:
    fragment = _DummyFragment(content="A")
    score = scorer.score(fragment)
    assert 0.0 <= score <= 1.0


def test_source_weights(scorer: ImportanceScorer) -> None:
    dream = _DummyFragment(source="dream", content="普通梦境")
    novel = _DummyFragment(source="novel", content="关键情节")
    assert scorer.score(novel) > scorer.score(dream)


def test_memorability_hint_boosts(scorer: ImportanceScorer) -> None:
    routine = _DummyFragment(content="今天一如既往。")
    turning = _DummyFragment(content="他终于做出了一个改变命运的决定。")
    assert scorer.score(turning) > scorer.score(routine)


def test_tag_specificity(scorer: ImportanceScorer) -> None:
    one_tag = _DummyFragment(tags=["雨"])
    three_tags = _DummyFragment(tags=["雨", "窗", "凌晨"])
    assert scorer.score(three_tags) > scorer.score(one_tag)
