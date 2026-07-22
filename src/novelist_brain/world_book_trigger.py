"""WorldBookTrigger: SillyTavern-style world book / character book injection.

SillyTavern's Character Book (also called World Info / Lorebook) is a collection
of entries that are dynamically injected into the prompt when their keywords
appear in the recent context.  This module implements that triggering logic:

- Registers entries from imported character cards
  (``data.oc.character.imported``).
- Listens to reader messages and conversation updates.
- Matches primary keys (and secondary keys for selective entries).
- Emits ``data.world_book.triggered`` with the entries that should be injected
  at ``before_char`` or ``after_char`` positions.

The module is intentionally read-only with respect to prompts: it does not
rewrite prompts itself; it just broadcasts the triggered lore so that a
``PromptSurface`` or response generator can assemble the final context.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.novelist_brain.character_card_adapter import CharacterBookEntry
from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


#: Emitted when one or more world-book entries have been triggered.
TOPIC_WORLD_BOOK_TRIGGERED = "data.world_book.triggered"

#: Request the currently triggered entries for a given context.
TOPIC_CONTROL_WORLD_BOOK_GET_TRIGGERED = "control.world_book.get_triggered"

#: Register a single world-book entry manually.
TOPIC_CONTROL_WORLD_BOOK_REGISTER = "control.world_book.register"


@dataclass
class TriggeredEntry:
    """A world-book entry that matched the current context."""

    name: str = ""
    content: str = ""
    position: str = "before_char"
    insertion_order: int = 0
    source_character: str = ""
    matched_keys: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "content": self.content,
            "position": self.position,
            "insertion_order": self.insertion_order,
            "source_character": self.source_character,
            "matched_keys": list(self.matched_keys),
        }


class WorldBookTrigger(Module):
    """Keyword-triggered world book / lore injection.

    Configuration via ``context["world_book_trigger"]``:

    - ``enabled`` (bool): whether matching is active (default ``True``).
    - ``case_sensitive`` (bool): default keyword case sensitivity
      (default ``False``).
    - ``max_entries_per_trigger`` (int): cap on emitted entries per event
      (default ``10``).

    The module listens to:

    - ``data.oc.character.imported`` — extracts ``character_book`` entries.
    - ``control.world_book.register`` — manually register an entry.
    - ``event.reader.interaction`` / ``data.reader.message`` — trigger on
      new reader input.
    - ``data.conversation.queue.update`` — trigger on conversation changes.
    - ``control.world_book.get_triggered`` — request a snapshot of currently
      triggered entries for a provided ``context`` string.
    """

    def __init__(self, name: str = "world_book_trigger") -> None:
        super().__init__(name)
        self._enabled = True
        self._case_sensitive = False
        self._max_entries_per_trigger = 10
        self._entries: list[CharacterBookEntry] = []
        self._entry_sources: dict[int, str] = {}
        self.subscribe(
            "data.oc.character.imported",
            TOPIC_CONTROL_WORLD_BOOK_REGISTER,
            "event.reader.interaction",
            "data.reader.message",
            "data.conversation.queue.update",
            TOPIC_CONTROL_WORLD_BOOK_GET_TRIGGERED,
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "world_book_trigger",
            "version": "0.1.0",
            "description": (
                "Keyword-triggered world book / character book injection"
            ),
            "dependencies": [],
            "category": "memory",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "entry_count": 0,
                "last_trigger_count": 0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def register_entry(
        self,
        entry: CharacterBookEntry,
        source_character: str = "",
    ) -> None:
        """Register a world-book entry for keyword matching."""
        if not entry.enabled:
            return
        self._entries.append(entry)
        self._entry_sources[id(entry)] = source_character
        self._state.custom["entry_count"] = len(self._entries)

    def clear_entries(self) -> None:
        """Drop all registered entries."""
        self._entries.clear()
        self._entry_sources.clear()
        self._state.custom["entry_count"] = 0

    def triggered_entries(self, context: str) -> list[TriggeredEntry]:
        """Return world-book entries triggered by ``context``."""
        if not self._enabled or not context:
            return []

        text = context if self._case_sensitive else context.lower()
        results: list[TriggeredEntry] = []
        seen: set[str] = set()

        for entry in self._entries:
            if not entry.enabled:
                continue

            triggered, matched = self._match_entry(entry, text)
            if not triggered:
                continue

            # Dedup by content so the same lore is not injected twice even if
            # it comes from different source entries.
            if entry.content in seen:
                continue
            seen.add(entry.content)

            results.append(
                TriggeredEntry(
                    name=entry.name,
                    content=entry.content,
                    position=entry.position,
                    insertion_order=entry.insertion_order,
                    source_character=self._entry_sources.get(id(entry), ""),
                    matched_keys=matched,
                )
            )

        results.sort(key=lambda e: e.insertion_order)
        if self._max_entries_per_trigger > 0:
            results = results[: self._max_entries_per_trigger]

        self._state.custom["last_trigger_count"] = len(results)
        return results

    # ------------------------------------------------------------------
    # Matching logic
    # ------------------------------------------------------------------

    def _match_entry(
        self,
        entry: CharacterBookEntry,
        text: str,
    ) -> tuple[bool, list[str]]:
        """Return (triggered, matched_keys) for an entry against text."""
        matched: list[str] = []

        # Constant entries are always injected.
        if entry.constant:
            return True, ["*constant*"]

        primary = self._any_key_present(entry.keys, text)
        if not primary:
            return False, []
        matched.append(primary)

        if entry.selective:
            secondary = self._any_key_present(entry.secondary_keys, text)
            if not secondary:
                return False, []
            matched.append(secondary)

        return True, matched

    def _any_key_present(self, keys: list[str], text: str) -> str:
        """Return the first matching key, or empty string if none match."""
        for key in keys:
            if not key:
                continue
            probe = key if self._case_sensitive else key.lower()
            if probe in text:
                return key
        return ""

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("world_book_trigger", {})
        self._enabled = bool(cfg.get("enabled", True))
        self._case_sensitive = bool(cfg.get("case_sensitive", False))
        max_entries = cfg.get("max_entries_per_trigger")
        if isinstance(max_entries, int) and max_entries > 0:
            self._max_entries_per_trigger = max_entries

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active or not self._enabled:
            return

        topic = message.topic
        payload = message.payload or {}

        if topic == "data.oc.character.imported":
            self._handle_character_imported(payload)
            return

        if topic == TOPIC_CONTROL_WORLD_BOOK_REGISTER:
            self._handle_register(payload)
            return

        if topic == TOPIC_CONTROL_WORLD_BOOK_GET_TRIGGERED:
            context = payload.get("context", "")
            self._emit_triggered(context)
            return

        context = self._extract_context(topic, payload)
        if context:
            self._emit_triggered(context)

    def tick(self, delta: TickDelta) -> None:
        return None

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    def _handle_character_imported(self, payload: dict[str, Any]) -> None:
        sheet = payload.get("sheet") or {}
        source_character = sheet.get("name", "")
        character_book = sheet.get("character_book")
        if not isinstance(character_book, dict):
            return

        for raw in character_book.get("entries", []):
            if not isinstance(raw, dict):
                continue
            entry = CharacterBookEntry(
                keys=list(raw.get("keys", [])),
                content=str(raw.get("content", "")),
                enabled=bool(raw.get("enabled", True)),
                insertion_order=int(raw.get("insertion_order", 0)),
                name=str(raw.get("name", "")),
                comment=str(raw.get("comment", "")),
                selective=bool(raw.get("selective", False)),
                secondary_keys=list(raw.get("secondary_keys", [])),
                constant=bool(raw.get("constant", False)),
                position=str(raw.get("position", "before_char")),
            )
            self.register_entry(entry, source_character=source_character)

    def _handle_register(self, payload: dict[str, Any]) -> None:
        raw = payload.get("entry")
        if not isinstance(raw, dict):
            return
        entry = CharacterBookEntry(
            keys=list(raw.get("keys", [])),
            content=str(raw.get("content", "")),
            enabled=bool(raw.get("enabled", True)),
            insertion_order=int(raw.get("insertion_order", 0)),
            name=str(raw.get("name", "")),
            comment=str(raw.get("comment", "")),
            selective=bool(raw.get("selective", False)),
            secondary_keys=list(raw.get("secondary_keys", [])),
            constant=bool(raw.get("constant", False)),
            position=str(raw.get("position", "before_char")),
        )
        self.register_entry(entry, source_character=str(raw.get("source", "")))

    def _extract_context(self, topic: str, payload: dict[str, Any]) -> str:
        """Build a searchable text from a bus message."""
        if topic in ("event.reader.interaction", "data.reader.message"):
            return str(payload.get("content", ""))

        if topic == "data.conversation.queue.update":
            action = payload.get("action", "")
            if action == "add":
                turn = payload.get("turn") or {}
                return str(turn.get("content", ""))
            if action == "snapshot":
                turns = payload.get("turns", []) or []
                return "\n".join(
                    str(t.get("content", "")) for t in turns[-5:]
                )

        return ""

    def _emit_triggered(self, context: str) -> None:
        entries = self.triggered_entries(context)
        if not entries:
            return
        self.emit(
            topic=TOPIC_WORLD_BOOK_TRIGGERED,
            payload={
                "context": context,
                "entries": [e.to_dict() for e in entries],
                "entry_count": len(entries),
            },
            channel="data",
            priority=5,
            ttl=3,
        )

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "enabled": self._enabled,
                "case_sensitive": self._case_sensitive,
                "max_entries_per_trigger": self._max_entries_per_trigger,
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
                        "source": self._entry_sources.get(id(e), ""),
                    }
                    for e in self._entries
                ],
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._enabled = bool(data.get("enabled", True))
        self._case_sensitive = bool(data.get("case_sensitive", False))
        self._max_entries_per_trigger = int(
            data.get("max_entries_per_trigger", 10)
        )
        self._entries = []
        self._entry_sources = {}
        for raw in data.get("entries", []):
            if not isinstance(raw, dict):
                continue
            entry = CharacterBookEntry(
                keys=list(raw.get("keys", [])),
                content=str(raw.get("content", "")),
                enabled=bool(raw.get("enabled", True)),
                insertion_order=int(raw.get("insertion_order", 0)),
                name=str(raw.get("name", "")),
                comment=str(raw.get("comment", "")),
                selective=bool(raw.get("selective", False)),
                secondary_keys=list(raw.get("secondary_keys", [])),
                constant=bool(raw.get("constant", False)),
                position=str(raw.get("position", "before_char")),
            )
            self._entries.append(entry)
            self._entry_sources[id(entry)] = str(raw.get("source", ""))
        self._state.custom["entry_count"] = len(self._entries)


__all__ = [
    "TriggeredEntry",
    "WorldBookTrigger",
    "TOPIC_WORLD_BOOK_TRIGGERED",
    "TOPIC_CONTROL_WORLD_BOOK_GET_TRIGGERED",
    "TOPIC_CONTROL_WORLD_BOOK_REGISTER",
]
