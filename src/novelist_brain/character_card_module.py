"""CharacterCardModule: SillyTavern-compatible character card loader.

On startup this module scans a configured directory for ``.json`` (and, if
Pillow is available, ``.png``) character cards, converts them to
``OCCharacterSheet`` and publishes them on the bus so the rest of the agent
(OCCharacterSystem, OCTownEngine, RelationshipGraph) can use them.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from src.novelist_brain.character_card_adapter import (
    import_tavern_card_v2,
    read_card_json,
    read_card_png,
)
from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


#: Emitted when a character card has been imported into an OC sheet.
TOPIC_CHARACTER_CARD_IMPORTED = "data.oc.character.imported"


class CharacterCardModule(Module):
    """Load SillyTavern-compatible character cards into LinYi.

    Configuration via ``context["character_cards"]``:

    - ``cards_dir`` (str): directory to scan for cards (default
      ``character_cards/``).
    - ``enabled`` (bool): whether to scan on init (default ``True``).
    - ``emit_events`` (bool): whether to publish bus events for each imported
      card (default ``True``).

    The module also listens to ``control.character_card.reload`` to re-scan
    the directory without restarting the agent.
    """

    def __init__(self, name: str = "character_cards") -> None:
        super().__init__(name)
        self._cards_dir = Path("character_cards")
        self._enabled = True
        self._emit_events = True
        self._loaded_sheets: list[Any] = []
        self.subscribe("control.character_card.reload")

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "character_cards",
            "version": "0.1.0",
            "description": "SillyTavern-compatible character card loader",
            "dependencies": [],
            "category": "novel_source",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={"loaded_count": 0},
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def scan_and_load(self) -> list[Any]:
        """Scan the cards directory and import all supported cards."""
        loaded: list[Any] = []
        if not self._enabled or not self._cards_dir.exists():
            self._loaded_sheets = loaded
            self._state.custom["loaded_count"] = 0
            return loaded

        for path in sorted(self._cards_dir.iterdir()):
            sheet = self._load_path(path)
            if sheet is not None:
                loaded.append(sheet)
                if self._emit_events:
                    self.emit(
                        topic=TOPIC_CHARACTER_CARD_IMPORTED,
                        payload={
                            "source_file": str(path),
                            "character_id": sheet.character_id,
                            "name": sheet.name,
                            "sheet": sheet.to_dict(),
                        },
                        channel="data",
                        priority=5,
                        ttl=3,
                    )

        self._loaded_sheets = loaded
        self._state.custom["loaded_count"] = len(loaded)
        return loaded

    def _load_path(self, path: Path) -> Any | None:
        if not path.is_file():
            return None
        try:
            if path.suffix.lower() == ".json":
                data = read_card_json(path)
                return import_tavern_card_v2(data)
            if path.suffix.lower() == ".png":
                data = read_card_png(path)
                if data is not None:
                    return import_tavern_card_v2(data)
        except Exception:
            # Individual card failures should not break the whole scan.
            return None
        return None

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("character_cards", {})
        self._enabled = bool(cfg.get("enabled", True))
        self._emit_events = bool(cfg.get("emit_events", True))
        cards_dir = cfg.get("cards_dir")
        if cards_dir:
            self._cards_dir = Path(str(cards_dir)).expanduser()
        else:
            self._cards_dir = Path(os.getcwd()) / "character_cards"
        self.scan_and_load()

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        if message.topic == "control.character_card.reload":
            self.scan_and_load()

    def tick(self, delta: TickDelta) -> None:
        return None

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "cards_dir": str(self._cards_dir),
                "enabled": self._enabled,
                "emit_events": self._emit_events,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._cards_dir = Path(str(data.get("cards_dir", "character_cards")))
        self._enabled = bool(data.get("enabled", True))
        self._emit_events = bool(data.get("emit_events", True))


__all__ = [
    "CharacterCardModule",
    "TOPIC_CHARACTER_CARD_IMPORTED",
]
