# -*- coding: utf-8 -*-
"""Tests for CharacterCardModule."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.character_card_adapter import write_card_json
from src.novelist_brain.character_card_module import (
    TOPIC_CHARACTER_CARD_IMPORTED,
    CharacterCardModule,
)


def _make_card(name: str) -> dict[str, Any]:
    return {
        "spec": "chara_card_v2",
        "spec_version": "2.0",
        "data": {
            "name": name,
            "description": f"Description of {name}.",
            "personality": "calm",
            "first_mes": "Hello.",
        },
    }


def test_module_scans_json_cards(tmp_path: Any) -> None:
    router = BusRouter()
    module = CharacterCardModule(name="character_cards")
    module.register(router)
    module.init({"character_cards": {"cards_dir": str(tmp_path)}})

    write_card_json(tmp_path / "alice.json", _make_card("Alice"))
    write_card_json(tmp_path / "bob.json", _make_card("Bob"))

    sheets = module.scan_and_load()
    assert len(sheets) == 2
    names = {s.name for s in sheets}
    assert names == {"Alice", "Bob"}


def test_module_emits_import_events(tmp_path: Any) -> None:
    router = BusRouter()
    module = CharacterCardModule(name="character_cards")
    module.register(router)
    module.init({"character_cards": {"cards_dir": str(tmp_path)}})
    router.flush()

    write_card_json(tmp_path / "eve.json", _make_card("Eve"))

    module.scan_and_load()
    delivered = router.flush()

    events = [m for m in delivered if m.topic == TOPIC_CHARACTER_CARD_IMPORTED]
    assert len(events) == 1
    assert events[0].payload["name"] == "Eve"


def test_module_ignores_non_card_files(tmp_path: Any) -> None:
    router = BusRouter()
    module = CharacterCardModule(name="character_cards")
    module.register(router)
    module.init({"character_cards": {"cards_dir": str(tmp_path)}})

    (tmp_path / "readme.txt").write_text("not a card", encoding="utf-8")
    write_card_json(tmp_path / "carol.json", _make_card("Carol"))

    sheets = module.scan_and_load()
    assert len(sheets) == 1
    assert sheets[0].name == "Carol"


def test_reload_control_topic(tmp_path: Any) -> None:
    router = BusRouter()
    module = CharacterCardModule(name="character_cards")
    module.register(router)
    module.init({"character_cards": {"cards_dir": str(tmp_path)}})
    router.flush()

    write_card_json(tmp_path / "dave.json", _make_card("Dave"))

    router.publish(
        source="test",
        topic="control.character_card.reload",
        channel="control",
        payload={},
        priority=5,
        ttl=3,
    )
    # First flush routes the control message; the module re-emits during
    # routing, so a second flush is needed to deliver those new events.
    router.flush()
    delivered = router.flush()

    events = [m for m in delivered if m.topic == TOPIC_CHARACTER_CARD_IMPORTED]
    assert len(events) == 1
    assert events[0].payload["name"] == "Dave"


def test_module_disabled_skips_scan(tmp_path: Any) -> None:
    module = CharacterCardModule(name="character_cards")
    module.init({"character_cards": {"cards_dir": str(tmp_path), "enabled": False}})

    write_card_json(tmp_path / "ghost.json", _make_card("Ghost"))
    sheets = module.scan_and_load()
    assert sheets == []


def test_module_scans_png_cards(tmp_path: Any) -> None:
    try:
        from PIL import Image
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"Pillow not available: {exc}")

    from io import BytesIO

    from src.novelist_brain.character_card_adapter import embed_card_png

    router = BusRouter()
    module = CharacterCardModule(name="character_cards")
    module.register(router)
    module.init({"character_cards": {"cards_dir": str(tmp_path)}})
    router.flush()

    buf = BytesIO()
    Image.new("RGB", (1, 1)).save(buf, format="PNG")
    png_bytes = embed_card_png(buf.getvalue(), _make_card("PNG-OC"))
    (tmp_path / "npc.png").write_bytes(png_bytes)

    sheets = module.scan_and_load()
    assert len(sheets) == 1
    assert sheets[0].name == "PNG-OC"
