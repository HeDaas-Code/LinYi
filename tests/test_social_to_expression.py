# -*- coding: utf-8 -*-
"""End-to-end test: social events flow through SocialVitalBridge to ExpressionState."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.expression_state import ExpressionState
from src.novelist_brain.social_vital_bridge import SocialVitalBridge


def _setup() -> tuple[BusRouter, SocialVitalBridge, ExpressionState]:
    router = BusRouter()
    bridge = SocialVitalBridge(name="social_vital_bridge")
    expression = ExpressionState(name="expression_state")
    bridge.init(
        {
            "vital_state": {
                "mood_bias": "平静",
                "arousal": 0.5,
                "reader_temperature": 0.5,
                "creative_drive": 0.5,
            },
            "social_vital_bridge": {"decay_per_hour": 0.1},
        }
    )
    expression.init(
        {
            "vital_state": {
                "mood_bias": "平静",
                "arousal": 0.5,
                "reader_temperature": 0.5,
            }
        }
    )
    bridge.register(router)
    expression.register(router)
    return router, bridge, expression


def test_positive_reader_interaction_turns_expression_happy() -> None:
    router, _, expression = _setup()
    assert expression.expression == "neutral"

    router.publish(
        source="ui",
        topic="event.reader.interaction",
        channel="event",
        payload={"summary": "读者说喜欢你的文字", "content": "读者说喜欢你的文字"},
        priority=5,
        ttl=3,
    )
    router.flush()
    router.flush()  # Deliver bridge-emitted data.metabolism.state.

    assert expression.mood_bias == "愉悦"
    assert expression.expression.startswith("happy")
    assert expression.intensity > 0.5


def test_oc_conversation_raises_arousal_and_intensity() -> None:
    router, _, expression = _setup()
    initial_intensity = expression.intensity

    router.publish(
        source="oc_town_engine",
        topic="data.oc.town.event",
        channel="data",
        payload={
            "kind": "conversation",
            "summary": "阿青和老周聊得很投机",
            "extra": {"relationship_delta": 0.12},
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    router.flush()

    assert expression.arousal > 0.5
    assert expression.intensity > initial_intensity


def test_relationship_drop_turns_expression_sad() -> None:
    router, _, expression = _setup()

    router.publish(
        source="relationship_graph",
        topic="data.relationship.updated",
        channel="data",
        payload={
            "source": "reader:default_reader",
            "target": "linyi",
            "kind": "affinity",
            "weight": -0.4,
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    router.flush()

    assert expression.mood_bias == "忧郁"
    assert expression.expression.startswith("sad")
