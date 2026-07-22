# -*- coding: utf-8 -*-
"""Tests for ReaderProfile."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage
from src.novelist_brain.module import Module
from src.novelist_brain.reader_profile import (
    TOPIC_READER_PROFILE_UPDATED,
    ReaderProfile,
)


def test_init_loads_context() -> None:
    profile = ReaderProfile(name="reader_profile")
    profile.init(
        {
            "reader_profile": {
                "reader_id": "reader_01",
                "display_name": "小雨",
                "relationship_stage": "friend",
                "known_facts": {"job": "插画师"},
            }
        }
    )
    assert profile.profile.reader_id == "reader_01"
    assert profile.profile.display_name == "小雨"
    assert profile.profile.known_facts.get("job") == "插画师"


def test_record_interaction_increases_warmth() -> None:
    profile = ReaderProfile(name="reader_profile")
    profile.init({})
    initial = profile.profile.reader_temperature
    profile.record_interaction(100.0)
    assert profile.profile.total_interactions == 1
    assert profile.profile.reader_temperature > initial


def test_bus_interaction_updates_profile() -> None:
    router = BusRouter()
    profile = ReaderProfile(name="reader_profile")
    profile.register(router)
    profile.init({})

    router.publish(
        source="ui",
        topic="event.reader.interaction",
        channel="event",
        payload={},
        priority=5,
        ttl=3,
    )
    router.flush()

    assert profile.profile.total_interactions == 1


def test_profile_update_emits_event() -> None:
    router = BusRouter()
    profile = ReaderProfile(name="reader_profile")
    profile.register(router)
    profile.init({})

    class _SpyModule(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[BusMessage] = []
            self.subscribe(TOPIC_READER_PROFILE_UPDATED)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: BusMessage) -> None:
            self.messages.append(message)

        def tick(self, delta: Any) -> None:
            return None

    spy = _SpyModule()
    router.subscribe(spy)

    profile.set_fact(" hobby ", "摄影")
    router.flush()

    assert len(spy.messages) == 1
    assert spy.messages[0].payload["known_facts"]["hobby"] == "摄影"


def test_serialization_roundtrip() -> None:
    router = BusRouter()
    profile = ReaderProfile(name="reader_profile")
    profile.register(router)
    profile.init({"reader_profile": {"display_name": "小雨"}})
    profile.set_fact("job", "插画师")
    snapshot = profile.to_dict()

    profile2 = ReaderProfile(name="reader_profile")
    profile2.from_dict(snapshot)
    assert profile2.profile.display_name == "小雨"
    assert profile2.profile.known_facts["job"] == "插画师"
