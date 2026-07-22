# -*- coding: utf-8 -*-
"""Tests for SocialVitalBridge."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage
from src.novelist_brain.module import Module
from src.novelist_brain.social_vital_bridge import (
    TOPIC_SOCIAL_VITAL_UPDATED,
    SocialVitalBridge,
)


def _bridge() -> SocialVitalBridge:
    bridge = SocialVitalBridge(name="social_vital_bridge")
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
    return bridge


def test_conversation_event_nudges_arousal() -> None:
    router = BusRouter()
    bridge = _bridge()
    bridge.register(router)

    router.publish(
        source="oc_town_engine",
        topic="data.oc.town.event",
        channel="data",
        payload={
            "kind": "conversation",
            "summary": "阿青和老周聊天",
            "extra": {"relationship_delta": 0.07},
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    assert bridge.arousal > 0.5
    assert bridge.mood_bias == "愉悦"


def test_reflection_event_is_calming() -> None:
    router = BusRouter()
    bridge = _bridge()
    bridge.register(router)

    router.publish(
        source="oc_town_engine",
        topic="data.oc.town.event",
        channel="data",
        payload={
            "kind": "reflection",
            "summary": "阿青陷入沉思",
            "extra": {},
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    assert bridge.arousal < 0.5
    assert bridge.creative_drive > 0.5


def test_reader_interaction_warms_relationship() -> None:
    router = BusRouter()
    bridge = _bridge()
    bridge.register(router)

    router.publish(
        source="ui",
        topic="event.reader.interaction",
        channel="event",
        payload={"summary": "读者说喜欢你的文字", "content": "读者说喜欢你的文字"},
        priority=5,
        ttl=3,
    )
    router.flush()

    assert bridge.reader_temperature > 0.5
    assert bridge.arousal > 0.5


def test_relationship_update_affects_mood() -> None:
    router = BusRouter()
    bridge = _bridge()
    bridge.register(router)

    router.publish(
        source="relationship_graph",
        topic="data.relationship.updated",
        channel="data",
        payload={
            "source": "reader:default_reader",
            "target": "linyi",
            "kind": "affinity",
            "weight": 0.6,
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    assert bridge.mood_bias == "愉悦"


def test_emits_social_vital_updated_event() -> None:
    router = BusRouter()
    bridge = _bridge()
    bridge.register(router)

    class _Spy(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[BusMessage] = []
            self.subscribe(TOPIC_SOCIAL_VITAL_UPDATED)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: BusMessage) -> None:
            self.messages.append(message)

        def tick(self, delta: Any) -> None:
            return None

    spy = _Spy()
    router.subscribe(spy)

    router.publish(
        source="ui",
        topic="event.reader.interaction",
        channel="event",
        payload={"summary": "读者说喜欢你的文字", "content": "读者说喜欢你的文字"},
        priority=5,
        ttl=3,
    )
    router.flush()
    router.flush()  # Deliver messages emitted by the bridge.

    assert len(spy.messages) == 1
    assert spy.messages[0].payload["reader_temperature"] > 0.5


def test_tick_decays_toward_baseline() -> None:
    router = BusRouter()
    bridge = _bridge()
    bridge.register(router)
    bridge._arousal = 0.9
    bridge._reader_temperature = 0.9
    bridge._creative_drive = 0.9

    from src.novelist_brain.models import TickDelta

    delta = TickDelta(absolute_time=0.0, delta_ms=3600_000.0, phase="social")
    bridge.tick(delta)

    assert bridge.arousal < 0.9
    assert bridge.reader_temperature < 0.9
    assert bridge.creative_drive < 0.9


def test_serialization_roundtrip() -> None:
    bridge = _bridge()
    bridge._arousal = 0.7
    bridge._reader_temperature = 0.8
    bridge._mood_bias = "愉悦"
    snapshot = bridge.to_dict()

    bridge2 = SocialVitalBridge(name="social_vital_bridge")
    bridge2.from_dict(snapshot)
    assert bridge2.arousal == 0.7
    assert bridge2.reader_temperature == 0.8
    assert bridge2.mood_bias == "愉悦"
