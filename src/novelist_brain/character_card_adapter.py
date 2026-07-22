"""Character card compatibility adapter inspired by SillyTavern.

SillyTavern's ``chara_card_v2`` format is the de-facto standard for AI
role-play character cards.  This module provides lossy but useful
import/export between ``TavernCardV2`` and LinYi's ``OCCharacterSheet``,
so LinYi can consume the vast existing ecosystem of character cards and
export its own OCs in a portable format.

PNG metadata extraction is supported when Pillow is available; otherwise
only JSON cards are handled.
"""

from __future__ import annotations

import base64
import json
import re
import uuid
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Any

try:
    from PIL import Image

    _HAS_PIL = True
except Exception:  # pragma: no cover - optional dependency
    _HAS_PIL = False

from src.novelist_brain.models import OCCharacterSheet


#: SillyTavern v2 spec identifier.
TAVERN_CARD_V2_SPEC = "chara_card_v2"

#: SillyTavern v2 spec version.
TAVERN_CARD_V2_VERSION = "2.0"


@dataclass
class CharacterBookEntry:
    """One entry in a SillyTavern character book (world info)."""

    keys: list[str] = field(default_factory=list)
    content: str = ""
    enabled: bool = True
    insertion_order: int = 0
    name: str = ""
    comment: str = ""
    selective: bool = False
    secondary_keys: list[str] = field(default_factory=list)
    constant: bool = False
    position: str = "before_char"


@dataclass
class CharacterBook:
    """SillyTavern character book (world info / lore book)."""

    name: str = ""
    description: str = ""
    scan_depth: int = 50
    token_budget: int = 500
    recursive_scanning: bool = False
    entries: list[CharacterBookEntry] = field(default_factory=list)


@dataclass
class TavernCardV2:
    """SillyTavern character card v2 representation."""

    spec: str = TAVERN_CARD_V2_SPEC
    spec_version: str = TAVERN_CARD_V2_VERSION
    name: str = ""
    description: str = ""
    personality: str = ""
    scenario: str = ""
    first_mes: str = ""
    mes_example: str = ""
    creator_notes: str = ""
    system_prompt: str = ""
    post_history_instructions: str = ""
    alternate_greetings: list[str] = field(default_factory=list)
    character_book: CharacterBook | None = None
    tags: list[str] = field(default_factory=list)
    creator: str = ""
    character_version: str = ""
    extensions: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "name": self.name,
            "description": self.description,
            "personality": self.personality,
            "scenario": self.scenario,
            "first_mes": self.first_mes,
            "mes_example": self.mes_example,
            "creator_notes": self.creator_notes,
            "system_prompt": self.system_prompt,
            "post_history_instructions": self.post_history_instructions,
            "alternate_greetings": list(self.alternate_greetings),
            "tags": list(self.tags),
            "creator": self.creator,
            "character_version": self.character_version,
            "extensions": dict(self.extensions),
        }
        if self.character_book is not None:
            data["character_book"] = {
                "name": self.character_book.name,
                "description": self.character_book.description,
                "scan_depth": self.character_book.scan_depth,
                "token_budget": self.character_book.token_budget,
                "recursive_scanning": self.character_book.recursive_scanning,
                "entries": [
                    {
                        "keys": list(e.keys),
                        "content": e.content,
                        "enabled": e.enabled,
                        "insertion_order": e.insertion_order,
                        "name": e.name,
                        "comment": e.comment,
                        "selective": e.selective,
                        "secondary_keys": list(e.secondary_keys),
                        "constant": e.constant,
                        "position": e.position,
                    }
                    for e in self.character_book.entries
                ],
            }
        return {
            "spec": self.spec,
            "spec_version": self.spec_version,
            "data": data,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TavernCardV2":
        card_data = data.get("data", data)
        book_data = card_data.get("character_book")
        book: CharacterBook | None = None
        if isinstance(book_data, dict):
            book = CharacterBook(
                name=book_data.get("name", ""),
                description=book_data.get("description", ""),
                scan_depth=int(book_data.get("scan_depth", 50)),
                token_budget=int(book_data.get("token_budget", 500)),
                recursive_scanning=bool(book_data.get("recursive_scanning", False)),
                entries=[
                    CharacterBookEntry(
                        keys=list(e.get("keys", [])),
                        content=str(e.get("content", "")),
                        enabled=bool(e.get("enabled", True)),
                        insertion_order=int(e.get("insertion_order", 0)),
                        name=str(e.get("name", "")),
                        comment=str(e.get("comment", "")),
                        selective=bool(e.get("selective", False)),
                        secondary_keys=list(e.get("secondary_keys", [])),
                        constant=bool(e.get("constant", False)),
                        position=str(e.get("position", "before_char")),
                    )
                    for e in book_data.get("entries", [])
                    if isinstance(e, dict)
                ],
            )
        return cls(
            spec=str(data.get("spec", TAVERN_CARD_V2_SPEC)),
            spec_version=str(data.get("spec_version", TAVERN_CARD_V2_VERSION)),
            name=str(card_data.get("name", "")),
            description=str(card_data.get("description", "")),
            personality=str(card_data.get("personality", "")),
            scenario=str(card_data.get("scenario", "")),
            first_mes=str(card_data.get("first_mes", "")),
            mes_example=str(card_data.get("mes_example", "")),
            creator_notes=str(card_data.get("creator_notes", "")),
            system_prompt=str(card_data.get("system_prompt", "")),
            post_history_instructions=str(
                card_data.get("post_history_instructions", "")
            ),
            alternate_greetings=list(card_data.get("alternate_greetings", [])),
            character_book=book,
            tags=list(card_data.get("tags", [])),
            creator=str(card_data.get("creator", "")),
            character_version=str(card_data.get("character_version", "")),
            extensions=dict(card_data.get("extensions", {})),
        )


def _slugify(name: str) -> str:
    """Create a stable id from a character name."""
    base = re.sub(r"[^\w\s-]", "", name or "unknown").strip().lower()
    base = re.sub(r"[-\s]+", "_", base)
    return base or f"oc_{uuid.uuid4().hex[:6]}"


def import_tavern_card_v2(data: dict[str, Any]) -> OCCharacterSheet:
    """Convert a SillyTavern v2 card dict into an ``OCCharacterSheet``."""
    card = TavernCardV2.from_dict(data)
    facts: list[str] = []
    if card.first_mes:
        facts.append(f"首次登场问候：{card.first_mes}")
    if card.mes_example:
        facts.append(f"对话示例：{card.mes_example}")
    if card.system_prompt:
        facts.append(f"系统提示：{card.system_prompt}")
    if card.post_history_instructions:
        facts.append(f"历史后指令：{card.post_history_instructions}")
    if card.creator_notes:
        facts.append(f"作者备注：{card.creator_notes}")
    for greeting in card.alternate_greetings:
        if greeting:
            facts.append(f"备选问候：{greeting}")
    if card.character_book is not None:
        for entry in card.character_book.entries:
            if entry.content:
                key_hint = "/".join(entry.keys) if entry.keys else "lore"
                facts.append(f"世界书[{key_hint}]：{entry.content}")

    narrative: list[str] = []
    if card.scenario:
        narrative.append(card.scenario)
    if card.description:
        narrative.append(card.description)

    internal = ""
    if card.personality:
        internal = f"性格：{card.personality}"
    if card.scenario:
        internal = f"{internal}\n情境：{card.scenario}".strip()

    character_id = card.extensions.get("linyi_character_id") if card.extensions else None
    if not character_id:
        character_id = _slugify(card.name)

    return OCCharacterSheet(
        character_id=character_id,
        name=card.name or "未命名角色",
        archetype=(card.description or card.personality or "未知").split("\n")[0][:120],
        source_traces=list(card.tags),
        internal_conflict=internal,
        narrative_arc=narrative,
        immutable_facts=facts,
    )


def export_tavern_card_v2(sheet: OCCharacterSheet) -> dict[str, Any]:
    """Convert an ``OCCharacterSheet`` into a SillyTavern v2 card dict."""
    extensions = dict(sheet.__dict__.get("extensions") or {})
    extensions["linyi_character_id"] = sheet.character_id
    card = TavernCardV2(
        name=sheet.name,
        description="\n".join(sheet.narrative_arc) if sheet.narrative_arc else sheet.archetype,
        personality=sheet.internal_conflict or sheet.archetype,
        scenario=sheet.narrative_arc[0] if sheet.narrative_arc else "",
        first_mes=sheet.immutable_facts[0] if sheet.immutable_facts else "",
        mes_example="\n".join(sheet.immutable_facts[1:3]),
        creator_notes="Exported from LinYi OCCharacterSheet",
        tags=list(sheet.source_traces),
        extensions=extensions,
    )
    return card.to_dict()


def read_card_json(path: str | Path) -> dict[str, Any]:
    """Read a JSON character card from disk."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_card_json(path: str | Path, data: dict[str, Any]) -> None:
    """Write a character card dict to disk as JSON."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def extract_png_card_text(
    png_bytes: bytes,
    keyword: str | None = None,
    decode_base64: bool = True,
) -> str | None:
    """Extract SillyTavern card text from a PNG's tEXt chunks.

    If ``keyword`` is provided, only that chunk key is checked.  Otherwise
    looks for ``ccv3`` first, then ``chara``.  When ``decode_base64`` is
    ``True`` (default), the chunk value is base64-decoded before being
    returned; set it to ``False`` to read a plain text chunk unchanged.
    Returns ``None`` if no matching chunk is found.  Requires Pillow.
    """
    if not _HAS_PIL:
        return None
    try:
        from PIL.PngImagePlugin import PngInfo
    except Exception:  # pragma: no cover - defensive
        return None

    try:
        img = Image.open(BytesIO(png_bytes))
    except Exception:
        return None

    info: PngInfo = img.info
    keys = (keyword,) if keyword else ("ccv3", "chara")
    for key in keys:
        value = info.get(key)
        if isinstance(value, bytes):
            value = value.decode("utf-8", errors="ignore")
        if isinstance(value, str):
            if not decode_base64:
                return value
            try:
                return base64.b64decode(value).decode("utf-8", errors="ignore")
            except Exception:
                continue
    return None


def read_card_png(path: str | Path) -> dict[str, Any] | None:
    """Read a character card embedded in a PNG image.

    Returns the parsed card dict or ``None`` if Pillow is unavailable, the file
    does not exist, or no card metadata is present.
    """
    try:
        png_bytes = Path(path).read_bytes()
    except FileNotFoundError:
        return None
    text = extract_png_card_text(png_bytes)
    if text is None:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def embed_card_png(
    png_bytes: bytes,
    card: dict[str, Any],
    keyword: str = "chara",
) -> bytes:
    """Embed a character card into a PNG image's tEXt chunk.

    SillyTavern stores the base64-encoded JSON in a ``chara`` tEXt chunk.
    This implementation preserves any existing PNG text metadata and only
    replaces the card chunk identified by ``keyword``. Requires Pillow.
    """
    if not _HAS_PIL:
        raise RuntimeError("Pillow is required to embed PNG character cards")

    from PIL import Image
    from PIL.PngImagePlugin import PngInfo

    img = Image.open(BytesIO(png_bytes))
    info = PngInfo()

    # Preserve existing text chunks so we do not wipe unrelated metadata.
    for key, value in img.info.items():
        if key == keyword:
            continue
        if isinstance(value, bytes):
            try:
                info.add_text(key, value.decode("utf-8", errors="ignore"))
            except Exception:
                continue
        elif isinstance(value, str):
            try:
                info.add_text(key, value)
            except Exception:
                continue

    payload = base64.b64encode(
        json.dumps(card, ensure_ascii=False).encode("utf-8")
    ).decode("ascii")
    info.add_text(keyword, payload)
    out = BytesIO()
    img.save(out, format="PNG", pnginfo=info)
    return out.getvalue()


__all__ = [
    "CharacterBook",
    "CharacterBookEntry",
    "TavernCardV2",
    "TAVERN_CARD_V2_SPEC",
    "TAVERN_CARD_V2_VERSION",
    "import_tavern_card_v2",
    "export_tavern_card_v2",
    "read_card_json",
    "write_card_json",
    "read_card_png",
    "embed_card_png",
    "extract_png_card_text",
]
