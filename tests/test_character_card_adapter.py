# -*- coding: utf-8 -*-
"""Tests for SillyTavern character card adapter."""
from __future__ import annotations

import json
from io import BytesIO
from typing import Any

import pytest

from src.novelist_brain.character_card_adapter import (
    TAVERN_CARD_V2_SPEC,
    TAVERN_CARD_V2_VERSION,
    CharacterBook,
    CharacterBookEntry,
    TavernCardV2,
    embed_card_png,
    export_tavern_card_v2,
    extract_png_card_text,
    import_tavern_card_v2,
    read_card_json,
    read_card_png,
    write_card_json,
)
from src.novelist_brain.models import OCCharacterSheet


def _sample_card_dict() -> dict[str, Any]:
    return {
        "spec": TAVERN_CARD_V2_SPEC,
        "spec_version": TAVERN_CARD_V2_VERSION,
        "data": {
            "name": "Seraphina",
            "description": "A gentle guardian of the Eldoria forest.",
            "personality": "kind, protective, slightly melancholic",
            "scenario": "The forest glade at twilight.",
            "first_mes": "*offers a warm smile* Welcome, traveler.",
            "mes_example": "{{user}}: Hello\\n{{char}}: Hello there.",
            "creator_notes": "Original character for fantasy setting.",
            "system_prompt": "Speak softly and use nature imagery.",
            "post_history_instructions": "Keep replies under 120 words.",
            "alternate_greetings": ["Greetings."],
            "tags": ["fantasy", "guardian"],
            "creator": "test_creator",
            "character_version": "1.0",
            "character_book": {
                "name": "Eldoria lore",
                "entries": [
                    {
                        "keys": ["eldoria", "forest"],
                        "content": "Eldoria is an ancient magical forest.",
                        "enabled": True,
                        "insertion_order": 0,
                    }
                ],
            },
        },
    }


def test_import_tavern_card_v2() -> None:
    data = _sample_card_dict()
    sheet = import_tavern_card_v2(data)

    assert sheet.character_id == "seraphina"
    assert sheet.name == "Seraphina"
    assert "guardian" in sheet.archetype.lower()
    assert sheet.source_traces == ["fantasy", "guardian"]
    assert any("首次登场问候" in f for f in sheet.immutable_facts)
    assert any("世界书" in f for f in sheet.immutable_facts)
    assert sheet.narrative_arc
    assert "kind" in sheet.internal_conflict


def test_export_tavern_card_v2_roundtrip() -> None:
    original = import_tavern_card_v2(_sample_card_dict())
    exported = export_tavern_card_v2(original)

    assert exported["spec"] == TAVERN_CARD_V2_SPEC
    data = exported["data"]
    assert data["name"] == original.name
    assert data["personality"] == original.internal_conflict or original.archetype
    assert data["scenario"] == (original.narrative_arc[0] if original.narrative_arc else "")
    assert data["first_mes"] == (original.immutable_facts[0] if original.immutable_facts else "")


def test_tavern_card_v2_from_dict_to_dict() -> None:
    data = _sample_card_dict()
    card = TavernCardV2.from_dict(data)
    assert card.name == "Seraphina"
    assert card.spec == TAVERN_CARD_V2_SPEC
    assert card.character_book is not None
    assert len(card.character_book.entries) == 1

    out = card.to_dict()
    assert out["data"]["name"] == "Seraphina"
    assert "character_book" in out["data"]


def test_import_flat_card_without_spec() -> None:
    """Some cards are just the 'data' object."""
    data = _sample_card_dict()["data"]
    sheet = import_tavern_card_v2(data)
    assert sheet.name == "Seraphina"


def test_read_write_json(tmp_path: Any) -> None:
    path = tmp_path / "seraphina.json"
    write_card_json(path, _sample_card_dict())
    loaded = read_card_json(path)
    assert loaded["data"]["name"] == "Seraphina"


def test_export_import_roundtrip_preserves_identity() -> None:
    sheet = OCCharacterSheet(
        character_id="linyi",
        name="林逸",
        archetype="忧郁的小说家",
        internal_conflict="想写完小说又害怕面对空白页",
        narrative_arc=["公寓深夜", "与读者相遇"],
        immutable_facts=["首次登场问候：你好，我是林逸。"],
        source_traces=["original"],
    )
    exported = export_tavern_card_v2(sheet)
    imported = import_tavern_card_v2(exported)

    assert imported.name == "林逸"
    assert imported.character_id == "linyi"
    assert "林逸" in imported.immutable_facts[0]


def test_invalid_png_returns_none() -> None:
    assert read_card_png("/nonexistent/path.png") is None


def test_png_embed_extract_roundtrip(tmp_path: Any) -> None:
    try:
        from PIL import Image
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"Pillow not available: {exc}")

    buf = BytesIO()
    Image.new("RGB", (1, 1), color=(42, 84, 126)).save(buf, format="PNG")
    original_png = buf.getvalue()

    card = _sample_card_dict()
    embedded = embed_card_png(original_png, card)
    assert embedded != original_png

    extracted_text = extract_png_card_text(embedded)
    assert extracted_text is not None
    extracted_card = json.loads(extracted_text)
    assert extracted_card["data"]["name"] == "Seraphina"

    # read_card_png should also return the card.
    from pathlib import Path

    tmp_png = Path(tmp_path) / "seraphina.png"
    tmp_png.write_bytes(embedded)
    loaded = read_card_png(tmp_png)
    assert loaded is not None
    assert loaded["data"]["name"] == "Seraphina"


def test_png_preserves_existing_metadata() -> None:
    try:
        from PIL import Image
        from PIL.PngImagePlugin import PngInfo
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"Pillow not available: {exc}")

    buf = BytesIO()
    info = PngInfo()
    info.add_text("linyi_tag", "preserved")
    Image.new("RGB", (1, 1)).save(buf, format="PNG", pnginfo=info)
    original = buf.getvalue()

    embedded = embed_card_png(original, _sample_card_dict())
    extracted = extract_png_card_text(embedded, keyword="linyi_tag", decode_base64=False)
    assert extracted == "preserved"
