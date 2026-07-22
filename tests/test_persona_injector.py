# -*- coding: utf-8 -*-
"""Tests for PersonaInjector."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.persona_injector import (
    TOPIC_PERSONA_INJECTED,
    PersonaInjector,
)
from src.novelist_brain.reader_profile import ReaderProfile


def test_injector_collects_reader_persona() -> None:
    router = BusRouter()
    reader = ReaderProfile(name="reader_profile")
    injector = PersonaInjector(name="persona_injector")
    reader.register(router)
    injector.register(router)
    injector.init(
        {"reader_profile_instance": reader, "oc_character_system_instance": None}
    )
    router.flush()

    reader.set_fact("喜欢的类型", "悬疑")
    reader.update_persona_summary("小A 喜欢直接、不绕弯子的交流方式。")
    router.flush()
    router.flush()  # absorb emitted profile update

    snippets = injector.collect_personas("你好")
    assert len(snippets) == 1
    assert snippets[0].entity_type == "reader"
    assert "小A" in snippets[0].content or "default_reader" in snippets[0].content
    assert "悬疑" in snippets[0].content


def test_reader_interaction_event_triggers_injection() -> None:
    router = BusRouter()
    reader = ReaderProfile(name="reader_profile")
    injector = PersonaInjector(name="persona_injector")
    reader.register(router)
    injector.register(router)
    injector.init(
        {"reader_profile_instance": reader, "oc_character_system_instance": None}
    )
    router.flush()

    reader.update_persona_summary("说话简洁，不喜欢 emoji。")
    router.flush()
    router.flush()

    router.publish(
        source="ui",
        topic="event.reader.interaction",
        channel="event",
        payload={"content": "在吗？"},
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    updates = [m for m in delivered if m.topic == TOPIC_PERSONA_INJECTED]
    assert len(updates) == 1
    assert updates[0].payload["reader_count"] == 1


def test_oc_mention_extracts_oc_persona() -> None:
    router = BusRouter()
    injector = PersonaInjector(name="persona_injector")
    injector.register(router)
    fake_oc = {
        "character_id": "oc_001",
        "name": "苏晚",
        "archetype": "失忆的刺客",
        "role_in_story": "protagonist",
        "current_goal": "找回记忆",
        "internal_conflict": "杀戮与善良的冲突",
        "immutable_facts": ["左肩有旧伤", "怕打雷"],
    }
    fake_registry = {"苏晚": fake_oc}
    fake_oc_system: Any = type("FakeOCSystem", (), {"_registry": fake_registry})()
    injector.init(
        {
            "reader_profile_instance": None,
            "oc_character_system_instance": fake_oc_system,
        }
    )
    router.flush()

    snippets = injector.collect_personas("苏晚今天怎么样了？")
    assert len(snippets) == 1
    assert snippets[0].entity_type == "oc"
    assert snippets[0].name == "苏晚"
    assert "失忆的刺客" in snippets[0].content
    assert "找回记忆" in snippets[0].content


def test_explicit_inject_control_topic() -> None:
    router = BusRouter()
    injector = PersonaInjector(name="persona_injector")
    injector.register(router)
    fake_oc = {
        "character_id": "oc_002",
        "name": "陆沉",
        "archetype": "精明的商人",
        "role_in_story": "supporting",
    }
    fake_registry = {"陆沉": fake_oc}
    fake_oc_system: Any = type("FakeOCSystem", (), {"_registry": fake_registry})()
    injector.init(
        {
            "reader_profile_instance": None,
            "oc_character_system_instance": fake_oc_system,
        }
    )
    router.flush()

    router.publish(
        source="test",
        topic="control.persona.inject",
        channel="control",
        payload={"text": "", "oc_names": ["陆沉"]},
        priority=8,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    updates = [m for m in delivered if m.topic == TOPIC_PERSONA_INJECTED]
    assert len(updates) == 1
    snippets = updates[0].payload["snippets"]
    assert len(snippets) == 1
    assert snippets[0]["name"] == "陆沉"


def test_auto_inject_filter_respected() -> None:
    router = BusRouter()
    reader = ReaderProfile(name="reader_profile")
    injector = PersonaInjector(name="persona_injector")
    reader.register(router)
    injector.register(router)
    injector.init(
        {
            "reader_profile_instance": reader,
            "oc_character_system_instance": None,
            "persona_injector": {"auto_inject_on": ["data.reader.message"]},
        }
    )
    router.flush()

    reader.update_persona_summary("很健谈。")
    router.flush()
    router.flush()

    router.publish(
        source="ui",
        topic="event.reader.interaction",
        channel="event",
        payload={"content": "你好"},
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    assert len([m for m in delivered if m.topic == TOPIC_PERSONA_INJECTED]) == 0


def test_serialization_roundtrip() -> None:
    injector = PersonaInjector(name="persona_injector")
    injector.init(
        {
            "persona_injector": {
                "max_reader_profiles": 2,
                "max_oc_profiles": 5,
                "oc_name_aliases": {"小晚": "苏晚"},
                "auto_inject_on": ["data.oc.town.event"],
            }
        }
    )
    data = injector.to_dict()
    injector2 = PersonaInjector(name="persona_injector")
    injector2.from_dict(data)

    assert injector2._max_reader_profiles == 2
    assert injector2._max_oc_profiles == 5
    assert injector2._oc_name_aliases == {"小晚": "苏晚"}
    assert injector2._auto_inject_on == {"data.oc.town.event"}
