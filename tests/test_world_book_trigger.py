# -*- coding: utf-8 -*-
"""Tests for WorldBookTrigger."""
from __future__ import annotations

from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.character_card_adapter import CharacterBookEntry
from src.novelist_brain.world_book_trigger import (
    TOPIC_CONTROL_WORLD_BOOK_GET_TRIGGERED,
    TOPIC_CONTROL_WORLD_BOOK_REGISTER,
    TOPIC_WORLD_BOOK_TRIGGERED,
    TriggeredEntry,
    WorldBookTrigger,
)


def _make_entry(
    keys: list[str],
    content: str,
    **kwargs: Any,
) -> CharacterBookEntry:
    defaults = {
        "enabled": True,
        "insertion_order": 0,
        "name": "",
        "comment": "",
        "selective": False,
        "secondary_keys": [],
        "constant": False,
        "position": "before_char",
    }
    defaults.update(kwargs)
    return CharacterBookEntry(keys=keys, content=content, **defaults)


def test_basic_keyword_match() -> None:
    module = WorldBookTrigger(name="world_book_trigger")
    module.register_entry(_make_entry(["forest", "woods"], "The forest is ancient."))

    entries = module.triggered_entries("I walked into the forest today.")
    assert len(entries) == 1
    assert entries[0].content == "The forest is ancient."
    assert entries[0].matched_keys == ["forest"]


def test_case_insensitive_by_default() -> None:
    module = WorldBookTrigger(name="world_book_trigger")
    module.register_entry(_make_entry(["Dragon"], "Dragons are rare."))

    entries = module.triggered_entries("We saw a DRAGON.")
    assert len(entries) == 1


def test_case_sensitive_when_configured() -> None:
    module = WorldBookTrigger(name="world_book_trigger")
    module._case_sensitive = True
    module.register_entry(_make_entry(["Dragon"], "Dragons are rare."))

    assert len(module.triggered_entries("We saw a DRAGON.")) == 0
    assert len(module.triggered_entries("We saw a Dragon.")) == 1


def test_selective_entry_requires_secondary_key() -> None:
    module = WorldBookTrigger(name="world_book_trigger")
    module.register_entry(
        _make_entry(
            ["spell"],
            "A fire spell was cast.",
            selective=True,
            secondary_keys=["fire", "flame"],
        )
    )

    assert len(module.triggered_entries("I learned a spell.")) == 0
    entries = module.triggered_entries("I learned a fire spell.")
    assert len(entries) == 1
    assert set(entries[0].matched_keys) == {"spell", "fire"}


def test_constant_entry_always_triggers() -> None:
    module = WorldBookTrigger(name="world_book_trigger")
    module.register_entry(_make_entry(["unused"], "Always here.", constant=True))

    entries = module.triggered_entries("Nothing relevant here.")
    assert len(entries) == 1
    assert entries[0].matched_keys == ["*constant*"]


def test_disabled_entry_is_ignored() -> None:
    module = WorldBookTrigger(name="world_book_trigger")
    module.register_entry(
        _make_entry(["magic"], "Magic is real.", enabled=False)
    )

    assert len(module.triggered_entries("Magic everywhere.")) == 0


def test_insertion_order_sorting() -> None:
    module = WorldBookTrigger(name="world_book_trigger")
    module.register_entry(
        _make_entry(["a"], "second", insertion_order=2)
    )
    module.register_entry(
        _make_entry(["b"], "first", insertion_order=1)
    )

    entries = module.triggered_entries("a and b")
    assert [e.content for e in entries] == ["first", "second"]


def test_max_entries_per_trigger() -> None:
    module = WorldBookTrigger(name="world_book_trigger")
    module._max_entries_per_trigger = 2
    for i in range(5):
        module.register_entry(_make_entry([f"key{i}"], f"lore {i}"))

    entries = module.triggered_entries("key0 key1 key2 key3 key4")
    assert len(entries) == 2


def test_duplicate_content_deduped() -> None:
    module = WorldBookTrigger(name="world_book_trigger")
    module.register_entry(_make_entry(["x"], "shared lore", name="one"))
    module.register_entry(_make_entry(["y"], "shared lore", name="two"))

    entries = module.triggered_entries("x and y")
    assert len(entries) == 1


def test_register_via_bus_event() -> None:
    router = BusRouter()
    module = WorldBookTrigger(name="world_book_trigger")
    module.register(router)

    router.publish(
        source="test",
        topic=TOPIC_CONTROL_WORLD_BOOK_REGISTER,
        channel="control",
        payload={
            "entry": {
                "keys": ["robot"],
                "content": "Robots must obey.",
                "enabled": True,
                "selective": False,
                "constant": False,
                "position": "after_char",
            }
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    entries = module.triggered_entries("The robot moved.")
    assert len(entries) == 1
    assert entries[0].position == "after_char"


def test_reader_message_triggers_event() -> None:
    router = BusRouter()
    module = WorldBookTrigger(name="world_book_trigger")
    module.register(router)
    module.register_entry(_make_entry(["tavern"], "The tavern is loud."))

    router.publish(
        source="reader",
        topic="event.reader.interaction",
        channel="event",
        payload={"content": "Let's meet at the tavern."},
        priority=5,
        ttl=3,
    )
    # First flush routes the reader message; the module emits the triggered
    # lore event during routing, so a second flush captures it.
    router.flush()
    delivered2 = router.flush()

    triggered = [m for m in delivered2 if m.topic == TOPIC_WORLD_BOOK_TRIGGERED]
    assert len(triggered) == 1
    assert triggered[0].payload["entry_count"] == 1
    assert triggered[0].payload["entries"][0]["content"] == "The tavern is loud."


def test_character_imported_registers_entries() -> None:
    router = BusRouter()
    module = WorldBookTrigger(name="world_book_trigger")
    module.register(router)

    router.publish(
        source="character_cards",
        topic="data.oc.character.imported",
        channel="data",
        payload={
            "source_file": "seraphina.json",
            "character_id": "seraphina",
            "name": "Seraphina",
            "sheet": {
                "character_id": "seraphina",
                "name": "Seraphina",
                "character_book": {
                    "entries": [
                        {
                            "keys": ["eldoria", "forest"],
                            "content": "Eldoria is an ancient magical forest.",
                            "enabled": True,
                            "insertion_order": 0,
                            "selective": False,
                            "constant": False,
                            "position": "before_char",
                        }
                    ]
                },
            },
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    entries = module.triggered_entries("Tell me about Eldoria.")
    assert len(entries) == 1
    assert entries[0].source_character == "Seraphina"
    assert "Eldoria" in entries[0].content


def test_get_triggered_control_topic() -> None:
    router = BusRouter()
    module = WorldBookTrigger(name="world_book_trigger")
    module.register(router)
    module.register_entry(_make_entry(["dungeon"], "Dark and damp."))

    router.publish(
        source="test",
        topic=TOPIC_CONTROL_WORLD_BOOK_GET_TRIGGERED,
        channel="control",
        payload={"context": "We entered the dungeon."},
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered2 = router.flush()

    triggered = [m for m in delivered2 if m.topic == TOPIC_WORLD_BOOK_TRIGGERED]
    assert len(triggered) == 1
    assert triggered[0].payload["entries"][0]["content"] == "Dark and damp."


def test_serialization_roundtrip() -> None:
    module = WorldBookTrigger(name="world_book_trigger")
    module._enabled = False
    module._case_sensitive = True
    module._max_entries_per_trigger = 3
    module.register_entry(_make_entry(["key"], "value"), source_character="LinYi")

    data = module.to_dict()
    restored = WorldBookTrigger(name="world_book_trigger")
    restored.from_dict(data)

    assert restored._enabled is False
    assert restored._case_sensitive is True
    assert restored._max_entries_per_trigger == 3
    assert len(restored._entries) == 1
    assert restored._entry_sources[id(restored._entries[0])] == "LinYi"
