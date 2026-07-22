# -*- coding: utf-8 -*-
"""Tests for ExpressionState."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.expression_state import (
    TOPIC_EXPRESSION_CHANGED,
    BodyState,
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


def test_low_arousal_calm_maps_to_relaxed() -> None:
    """Low-arousal '平静' should drift to AIRI-style relaxed, not neutral_calm."""
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({"vital_state": {"mood_bias": "平静", "arousal": 0.2}})
    assert state.expression == "relaxed"
    assert state.emotion == "relaxed"
    assert state.action == "idle"


def test_relaxed_mood_bias_maps_to_relaxed() -> None:
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({"vital_state": {"mood_bias": "放松", "arousal": 0.5}})
    assert state.expression == "relaxed"
    assert state.emotion == "relaxed"


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
    assert isinstance(state2.body_state, BodyState)
    assert state2.body_state.pose == state.body_state.pose


def test_emotion_profile_includes_airi_params() -> None:
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({"vital_state": {"mood_bias": "愉悦", "arousal": 0.7, "reader_temperature": 0.8}})

    assert state.emotion == "happy"
    assert state.blend_duration == 0.4
    assert "happy" in state.expression_targets
    assert state.action == "happy"
    assert state.expression_targets["happy"] <= 0.7


def test_expression_changed_payload_has_airi_fields() -> None:
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
    payload = spy.messages[0].payload
    assert payload["emotion"] == "happy"
    assert payload["blend_duration"] == 0.4
    assert "expression_targets" in payload
    assert payload["action"] == "happy"
    assert "body_state" in payload
    assert "reset_at" in payload


def test_worried_maps_to_think_or_question() -> None:
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({"vital_state": {"mood_bias": "焦虑", "arousal": 0.2}})
    assert state.emotion == "think"

    router2 = BusRouter()
    state2 = ExpressionState(name="expression_state")
    state2.register(router2)
    state2.init({"vital_state": {"mood_bias": "焦虑", "arousal": 0.8}})
    assert state2.emotion == "question"


def test_body_state_reflects_arousal() -> None:
    router = BusRouter()
    calm = ExpressionState(name="expression_state")
    calm.register(router)
    calm.init({"vital_state": {"mood_bias": "平静", "arousal": 0.2}})

    excited = ExpressionState(name="expression_state2")
    excited.register(router)
    excited.init({"vital_state": {"mood_bias": "兴奋", "arousal": 0.9}})

    assert calm.body_state.breath_speed < excited.body_state.breath_speed
    assert calm.body_state.blink_rate < excited.body_state.blink_rate


def test_transient_emotion_has_reset_at() -> None:
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({"vital_state": {"mood_bias": "愉悦", "arousal": 0.7}})

    assert state.reset_at is not None
    assert state.reset_at > 0
    # happy default_duration is 3.0s
    assert state.reset_at <= __import__("time").time() + 4.0


def test_neutral_has_no_reset_at() -> None:
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({})

    assert state.reset_at is None


def test_body_state_pose_by_emotion() -> None:
    router = BusRouter()
    state = ExpressionState(name="expression_state")
    state.register(router)
    state.init({"vital_state": {"mood_bias": "焦虑", "arousal": 0.8}})
    assert state.body_state.pose == "head_tilt"

    router2 = BusRouter()
    state2 = ExpressionState(name="expression_state2")
    state2.register(router2)
    state2.init({"vital_state": {"mood_bias": "愉悦", "arousal": 0.8}})
    assert state2.body_state.pose == "lean_forward"
