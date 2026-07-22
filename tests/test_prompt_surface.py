# -*- coding: utf-8 -*-
"""Tests for PromptSurface."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.conversation_queue import ConversationQueue
from src.novelist_brain.memory_stream import MemoryStream, MemoryStreamEntry
from src.novelist_brain.prompt_surface import (
    TOPIC_CONTROL_PROMPT_SURFACE_REQUEST,
    TOPIC_PROMPT_SURFACE_UPDATED,
    PromptSurface,
)
from src.novelist_brain.self_timeline import SelfTimeline


def test_default_slot_order() -> None:
    surface = PromptSurface(name="prompt_surface")
    assert surface.SLOT_ORDER[0] == "system_rules"
    assert surface.SLOT_ORDER[-1] == "instruction_footer"
    assert "character_definition" in surface.SLOT_ORDER


def test_init_from_context_sets_static_slots() -> None:
    surface = PromptSurface(name="prompt_surface")
    surface.init(
        {
            "prompt_surface": {
                "system_rules": "System rule.",
                "instruction_footer": "Footer.",
                "max_surface_chars": 4_000,
            }
        }
    )

    assert surface.get_slot("system_rules") == "System rule."
    assert surface.get_slot("instruction_footer") == "Footer."
    assert surface._max_surface_chars == 4_000


def test_character_imported_updates_slot() -> None:
    router = BusRouter()
    surface = PromptSurface(name="prompt_surface")
    surface.register(router)
    surface.init({})
    router.flush()

    router.publish(
        source="character_cards",
        topic="data.oc.character.imported",
        channel="data",
        payload={
            "sheet": {
                "name": "林逸",
                "archetype": "边缘观察者",
                "internal_conflict": "渴望连接又害怕被看穿",
                "narrative_arc": ["觉醒", "坠落", "和解"],
                "immutable_facts": ["住在安静的公寓", "习惯深夜写作"],
            }
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    assert "林逸" in surface.get_slot("character_definition")
    assert "边缘观察者" in surface.get_slot("character_definition")
    surface_updates = [m for m in delivered if m.topic == TOPIC_PROMPT_SURFACE_UPDATED]
    assert len(surface_updates) == 1


def test_world_book_triggered_updates_slots() -> None:
    router = BusRouter()
    surface = PromptSurface(name="prompt_surface")
    surface.register(router)
    surface.init({})
    router.flush()

    router.publish(
        source="world_book_trigger",
        topic="data.world_book.triggered",
        channel="data",
        payload={
            "entries": [
                {"name": "森林", "content": "古老的森林会记住每个进入者。", "position": "before_char"},
                {"name": "城市", "content": "城市在黎明前最安静。", "position": "after_char"},
            ]
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    assert "古老的森林" in surface.get_slot("world_info_before")
    assert "黎明前最安静" in surface.get_slot("world_info_after")
    assert len([m for m in delivered if m.topic == TOPIC_PROMPT_SURFACE_UPDATED]) == 1


def test_self_timeline_update_populates_slot() -> None:
    router = BusRouter()
    timeline = SelfTimeline(name="self_timeline")
    surface = PromptSurface(name="prompt_surface")
    timeline.register(router)
    surface.register(router)
    surface.init({"self_timeline_instance": timeline})
    router.flush()

    timeline.append(
        source="fragment.personal.new",
        summary="她在窗边站了很久。",
        detail="天快亮时，窗玻璃上凝了一层薄雾。",
    )
    router.flush()
    delivered = router.flush()

    assert "她在窗边站了很久" in surface.get_slot("self_timeline")
    assert len([m for m in delivered if m.topic == TOPIC_PROMPT_SURFACE_UPDATED]) >= 1


def test_memory_stream_update_populates_slot() -> None:
    router = BusRouter()
    stream = MemoryStream(name="memory_stream")
    surface = PromptSurface(name="prompt_surface")
    stream.register(router)
    surface.register(router)
    surface.init({"memory_stream_instance": stream})
    router.flush()

    stream.add(
        kind="observation",
        content="读者提到喜欢忧郁的开场。",
        importance=0.7,
    )
    stream.page_in("忧郁")
    router.flush()
    delivered = router.flush()

    slot = surface.get_slot("memory_snippets")
    assert "读者提到喜欢忧郁的开场" in slot
    assert len([m for m in delivered if m.topic == TOPIC_PROMPT_SURFACE_UPDATED]) >= 1


def test_reader_profile_update_populates_slot() -> None:
    router = BusRouter()
    surface = PromptSurface(name="prompt_surface")
    surface.register(router)
    surface.init({})
    router.flush()

    router.publish(
        source="reader_profile",
        topic="data.reader.profile.updated",
        channel="data",
        payload={
            "reader_id": "reader_01",
            "display_name": "小A",
            "relationship_stage": "friend",
            "preferred_tone": "gentle",
            "known_facts": {"喜欢的类型": "悬疑"},
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    slot = surface.get_slot("reader_context")
    assert "小A" in slot
    assert "friend" in slot
    assert "悬疑" in slot
    assert len([m for m in delivered if m.topic == TOPIC_PROMPT_SURFACE_UPDATED]) == 1


def test_expression_changed_populates_slot() -> None:
    router = BusRouter()
    surface = PromptSurface(name="prompt_surface")
    surface.register(router)
    surface.init({})
    router.flush()

    router.publish(
        source="expression_state",
        topic="data.expression.changed",
        channel="data",
        payload={
            "emotion": "happy",
            "intensity": 0.8,
            "action": "happy",
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    slot = surface.get_slot("expression_hint")
    assert "happy" in slot
    assert "0.80" in slot
    assert len([m for m in delivered if m.topic == TOPIC_PROMPT_SURFACE_UPDATED]) == 1


def test_conversation_queue_update_appends_turn() -> None:
    router = BusRouter()
    surface = PromptSurface(name="prompt_surface")
    surface.register(router)
    surface.init({})
    router.flush()

    router.publish(
        source="conversation_queue",
        topic="data.conversation.queue.update",
        channel="data",
        payload={
            "action": "add",
            "turn": {"role": "user", "content": "你好", "source": "ui"},
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    slot = surface.get_slot("recent_conversation")
    assert "user: 你好" in slot
    assert len([m for m in delivered if m.topic == TOPIC_PROMPT_SURFACE_UPDATED]) == 1


def test_control_request_triggers_assembly() -> None:
    router = BusRouter()
    surface = PromptSurface(name="prompt_surface")
    surface.register(router)
    surface.init(
        {
            "prompt_surface": {
                "system_rules": "System.",
                "instruction_footer": "Footer.",
            }
        }
    )
    router.flush()

    router.publish(
        source="test",
        topic=TOPIC_CONTROL_PROMPT_SURFACE_REQUEST,
        channel="control",
        payload={"context": "Extra context."},
        priority=8,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    updates = [m for m in delivered if m.topic == TOPIC_PROMPT_SURFACE_UPDATED]
    assert len(updates) == 1
    payload = updates[0].payload
    assert "System." in payload["flat_text"]
    assert "Footer." in payload["flat_text"]
    assert "Extra context." in payload["flat_text"]
    assert "instruction_footer" in payload["slot_names"]


def test_assemble_truncates_long_surface() -> None:
    surface = PromptSurface(name="prompt_surface")
    surface.init({"prompt_surface": {"max_surface_chars": 50}})
    surface.set_slot("system_rules", "A" * 30)
    surface.set_slot("recent_conversation", "B" * 40)
    surface.set_slot("instruction_footer", "C" * 30)

    result = surface.assemble()
    assert len(result["flat_text"]) <= 50
    assert "[truncated]" in result["flat_text"]


def test_serialization_roundtrip() -> None:
    surface = PromptSurface(name="prompt_surface")
    surface.init(
        {
            "prompt_surface": {
                "system_rules": "Rule.",
                "max_surface_chars": 3_000,
                "auto_assemble_on": ["data.expression.changed"],
            }
        }
    )
    surface.set_slot("character_definition", "Name: 林逸")

    data = surface.to_dict()
    surface2 = PromptSurface(name="prompt_surface")
    surface2.from_dict(data)

    assert surface2._max_surface_chars == 3_000
    assert surface2._auto_assemble_on == {"data.expression.changed"}
    assert surface2.get_slot("system_rules") == "Rule."
    assert surface2.get_slot("character_definition") == "Name: 林逸"


def test_auto_assemble_respects_filter() -> None:
    router = BusRouter()
    surface = PromptSurface(name="prompt_surface")
    surface.register(router)
    # Only auto-assemble on reader profile updates; expression changes should
    # update the slot but not emit the surface event.
    surface.init(
        {
            "prompt_surface": {
                "auto_assemble_on": ["data.reader.profile.updated"],
            }
        }
    )
    router.flush()

    router.publish(
        source="expression_state",
        topic="data.expression.changed",
        channel="data",
        payload={"emotion": "sad", "intensity": 0.5, "action": "sad"},
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()

    assert "sad" in surface.get_slot("expression_hint")
    assert len([m for m in delivered if m.topic == TOPIC_PROMPT_SURFACE_UPDATED]) == 0
