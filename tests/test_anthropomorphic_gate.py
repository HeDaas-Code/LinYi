# -*- coding: utf-8 -*-
"""Tests for FragmentQualityGate."""
from __future__ import annotations

import pytest

from src.novelist_brain.anthropomorphic_gate import (
    FragmentQualityGate,
    signature_fragment,
)


@pytest.fixture
def gate() -> FragmentQualityGate:
    return FragmentQualityGate(dedup_window=3)


def test_allow_concrete_fragment(gate: FragmentQualityGate) -> None:
    text = "傍晚的街灯把石板路照成一条暗红的河。"
    decision = gate.evaluate(text)
    assert decision.passed


def test_reject_empty(gate: FragmentQualityGate) -> None:
    assert not gate.evaluate("").passed
    assert not gate.evaluate("   ").passed
    assert gate.evaluate("").reason == "empty"


def test_reject_too_long(gate: FragmentQualityGate) -> None:
    assert not gate.evaluate("a" * 300).passed


def test_reject_abstract_without_concrete(gate: FragmentQualityGate) -> None:
    decision = gate.evaluate("我感觉今天状态很奇怪，心情有点复杂。")
    assert not decision.passed
    assert decision.reason in ("abstract", "abstract_heavy")


def test_signature_deduplication(gate: FragmentQualityGate) -> None:
    text = "她把铅笔在指间转了三圈，没有落下一个字。"
    sig = signature_fragment(text)
    assert gate.evaluate(text, recent_signatures=[]).passed
    assert not gate.evaluate(text, recent_signatures=[sig]).passed


def test_similarity_deduplication(gate: FragmentQualityGate) -> None:
    a = "窗外的雨声变轻了，像有人悄悄关小了音量。"
    b = "窗外的雨渐渐变小，仿佛有人调低了音量。"
    assert gate.evaluate(a, recent_texts=[]).passed
    decision = gate.evaluate(b, recent_texts=[a])
    assert not decision.passed
    assert decision.reason == "too_similar"
