# -*- coding: utf-8 -*-
"""Tests for ExpressionState."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.expression_state import (
    TOPIC_EXPRESSION_CHANGED,
    ExpressionState,
)
from src.novelist_brain.models import BusMessage
from src.novelist_brain.module import Module


def test_default_expression_is_neutral() -> None:
    state = ExpressionState(name="expression_state")
    state.init({})
    assert state.expression == "neutral"


def test_mood_bias_changes_expression() -> None:
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({"vital_state": {"mood_bias": "兴奋", "arousal": 0.8}})
    assert "excited" in state.expression


def test_low_arousal_adds_calm_suffix() -> None:
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({"vital_state": {"mood_bias": "平静", "arousal": 0.2}})
    assert state.expression == "neutral_calm"


def test_expression_change_emits_event() -> None:
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({})

    class _SpyModule(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[BusMessage] = []
            self.subscribe(TOPIC_EXPRESSION_CHANGED)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: BusMessage) -> None:
            self.messages.append(message)

        def tick(self, delta: Any) -> None:
            return None

    spy = _SpyModule()
    router.subscribe(spy)

    state.on_bus_message(
        BusMessage(
            source="metabolism",
            topic="data.metabolism.state",
            channel="data",
            payload={"mood_bias": "愉悦", "arousal": 0.7, "reader_temperature": 0.8},
        )
    )
    router.flush()

    assert len(spy.messages) == 1
    assert "happy" in spy.messages[0].payload["expression"]


def test_serialization_roundtrip() -> None:
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({"vital_state": {"mood_bias": "忧郁", "arousal": 0.3}})
    snapshot = state.to_dict()

    state2 = ExpressionState(name="expression_state")
    state2.from_dict(snapshot)
    assert state2.expression == "sad_calm"
    assert state2.intensity == state.intensity
