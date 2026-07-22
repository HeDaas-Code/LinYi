"""PersonaInjector: inject relevant character/reader personas into the prompt surface.

Inspired by MaiBot's ``maisaka.memory.person_profile`` auto-injection service and
mem0's entity-scoped memory, this module watches the active conversation / social
context, figures out which people (reader or OC) are currently involved, and
emits ``data.persona.injected`` with compact persona snippets so that
:class:`PromptSurface` can include them in the LLM prompt.

This makes LinYi feel like a virtual being who actually remembers who she is
talking to, instead of treating every message as an anonymous prompt stream.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.reader_profile import ReaderProfile

if TYPE_CHECKING:
    from src.novelist_brain.oc_character_system import OCCharacterSystem


#: Emitted when personas for the current conversational context are collected.
TOPIC_PERSONA_INJECTED = "data.persona.injected"


@dataclass
class PersonaSnippet:
    """A compact persona snippet ready for prompt injection."""

    entity_id: str
    entity_type: str  # reader | oc
    name: str
    content: str
    source: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "entity_id": self.entity_id,
            "entity_type": self.entity_type,
            "name": self.name,
            "content": self.content,
            "source": self.source,
        }


class PersonaInjector(Module):
    """Collect and emit persona snippets for people involved in the current turn.

    Configuration via ``context["persona_injector"]``:

    - ``max_reader_profiles`` (int): max reader snippets per turn (default 1).
    - ``max_oc_profiles`` (int): max OC snippets per turn (default 3).
    - ``oc_name_aliases`` (dict[str, str]): alias -> canonical OC name map.
    - ``auto_inject_on`` (list[str]): topics that trigger injection.

    Subscribes to:

    - ``event.reader.interaction``
    - ``data.reader.message``
    - ``data.conversation.queue.update``
    - ``data.oc.town.event``
    - ``control.persona.inject`` (explicit injection request)
    """

    def __init__(self, name: str = "persona_injector") -> None:
        super().__init__(name)
        self._max_reader_profiles = 1
        self._max_oc_profiles = 3
        self._oc_name_aliases: dict[str, str] = {}
        self._auto_inject_on: set[str] = set()
        self._reader_profile: ReaderProfile | None = None
        self._oc_system: OCCharacterSystem | None = None
        self.subscribe(
            "event.reader.interaction",
            "data.reader.message",
            "data.conversation.queue.update",
            "data.oc.town.event",
            "control.persona.inject",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "persona_injector",
            "version": "0.1.0",
            "description": "Inject reader/OC personas into the prompt context",
            "dependencies": [],
            "category": "prompt",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "inject_count": 0,
                "last_reader_count": 0,
                "last_oc_count": 0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def collect_personas(
        self,
        text: str,
        *,
        explicit_reader_ids: list[str] | None = None,
        explicit_oc_names: list[str] | None = None,
    ) -> list[PersonaSnippet]:
        """Return persona snippets for everyone mentioned or explicitly requested."""
        reader_ids = set(explicit_reader_ids or [])
        oc_names = set(explicit_oc_names or [])

        # Try to detect OC names by scanning known aliases.
        normalized = text.lower()
        for alias, canonical in self._oc_name_aliases.items():
            if alias.lower() in normalized:
                oc_names.add(canonical)

        # Also scan for any registered OC name as a substring.
        oc_registry = self._oc_registry()
        if oc_registry:
            for name in oc_registry.keys():
                if name and name.lower() in normalized:
                    oc_names.add(name)

        snippets: list[PersonaSnippet] = []
        reader_snippet = self._reader_snippet()
        if reader_snippet is not None and (not text or reader_ids or self._reader_mentioned(text)):
            snippets.append(reader_snippet)

        for name in sorted(oc_names)[: self._max_oc_profiles]:
            snippet = self._oc_snippet(name)
            if snippet is not None:
                snippets.append(snippet)

        self._state.custom["last_reader_count"] = sum(
            1 for s in snippets if s.entity_type == "reader"
        )
        self._state.custom["last_oc_count"] = sum(
            1 for s in snippets if s.entity_type == "oc"
        )
        return snippets

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("persona_injector", {})

        max_reader = cfg.get("max_reader_profiles")
        if isinstance(max_reader, int) and max_reader > 0:
            self._max_reader_profiles = max_reader

        max_oc = cfg.get("max_oc_profiles")
        if isinstance(max_oc, int) and max_oc > 0:
            self._max_oc_profiles = max_oc

        aliases = cfg.get("oc_name_aliases")
        if isinstance(aliases, dict):
            self._oc_name_aliases = {str(k): str(v) for k, v in aliases.items()}

        auto_topics = cfg.get("auto_inject_on")
        if isinstance(auto_topics, (list, tuple)):
            self._auto_inject_on = set(str(t) for t in auto_topics)

        self._reader_profile = context.get("reader_profile_instance")
        self._oc_system = context.get("oc_character_system_instance")

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        payload = message.payload or {}

        if topic == "control.persona.inject":
            text = str(payload.get("text", ""))
            reader_ids = payload.get("reader_ids") or []
            oc_names = payload.get("oc_names") or []
            self._emit_personas(
                text,
                explicit_reader_ids=[str(r) for r in reader_ids],
                explicit_oc_names=[str(n) for n in oc_names],
            )
            return

        if self._auto_inject_on and topic not in self._auto_inject_on:
            return

        text = self._extract_text(topic, payload)
        if text:
            self._emit_personas(text)

    def tick(self, delta: TickDelta) -> None:
        return None

    # ------------------------------------------------------------------
    # Snippet builders
    # ------------------------------------------------------------------

    def _reader_snippet(self) -> PersonaSnippet | None:
        if self._reader_profile is None:
            return None
        profile = self._reader_profile.profile
        if not profile.display_name and not profile.persona_summary and not profile.known_facts:
            return None

        lines: list[str] = []
        name = profile.display_name or profile.reader_id
        lines.append(f"Reader: {name}")
        if profile.relationship_stage:
            lines.append(f"Relationship: {profile.relationship_stage}")
        if profile.preferred_tone:
            lines.append(f"Preferred tone: {profile.preferred_tone}")
        if profile.persona_summary:
            lines.append(f"Impression: {profile.persona_summary}")
        if profile.known_facts:
            lines.append("Known facts:")
            for key, value in profile.known_facts.items():
                lines.append(f"  - {key}: {value}")

        return PersonaSnippet(
            entity_id=profile.reader_id,
            entity_type="reader",
            name=name,
            content="\n".join(lines),
            source="reader_profile",
        )

    def _oc_snippet(self, name: str) -> PersonaSnippet | None:
        sheet = self._lookup_oc_sheet(name)
        if sheet is None:
            return None

        lines: list[str] = []
        display_name = sheet.get("name") or name
        lines.append(f"OC: {display_name}")
        archetype = sheet.get("archetype")
        if archetype:
            lines.append(f"Archetype: {archetype}")
        role = sheet.get("role_in_story")
        if role:
            lines.append(f"Role: {role}")
        current_goal = sheet.get("current_goal")
        if current_goal:
            lines.append(f"Current goal: {current_goal}")
        internal_conflict = sheet.get("internal_conflict")
        if internal_conflict:
            lines.append(f"Conflict: {internal_conflict}")
        immutable_facts = sheet.get("immutable_facts") or []
        if immutable_facts:
            lines.append("Important facts:")
            for fact in immutable_facts[:3]:
                lines.append(f"  - {fact}")

        known_facts = sheet.get("known_facts") or {}
        if known_facts:
            lines.append("Known facts:")
            for k, v in list(known_facts.items())[:3]:
                lines.append(f"  - {k}: {v}")

        return PersonaSnippet(
            entity_id=sheet.get("character_id", name),
            entity_type="oc",
            name=display_name,
            content="\n".join(lines),
            source="oc_character_system",
        )

    # ------------------------------------------------------------------
    # OC lookup helpers
    # ------------------------------------------------------------------

    def _oc_registry(self) -> dict[str, Any]:
        """Return a name -> sheet mapping from the OC system if available."""
        if self._oc_system is None:
            return {}
        registry = getattr(self._oc_system, "_registry", None)
        if isinstance(registry, dict):
            return registry
        registry = getattr(self._oc_system, "registry", None)
        if isinstance(registry, dict):
            return registry
        return {}

    def _lookup_oc_sheet(self, name: str) -> dict[str, Any] | None:
        registry = self._oc_registry()
        # Try exact match first.
        sheet = registry.get(name)
        if sheet is not None:
            return self._coerce_sheet(sheet)
        # Try case-insensitive match.
        for key, value in registry.items():
            if key.lower() == name.lower():
                return self._coerce_sheet(value)
        # Try alias resolution.
        canonical = self._oc_name_aliases.get(name)
        if canonical:
            sheet = registry.get(canonical)
            if sheet is not None:
                return self._coerce_sheet(sheet)
        return None

    @staticmethod
    def _coerce_sheet(value: Any) -> dict[str, Any] | None:
        if isinstance(value, dict):
            return value
        if hasattr(value, "to_dict"):
            result = value.to_dict()
            if isinstance(result, dict):
                return result
        return None

    # ------------------------------------------------------------------
    # Text extraction
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_text(topic: str, payload: dict[str, Any]) -> str:
        if topic in ("event.reader.interaction", "data.reader.message"):
            return str(
                payload.get("content") or payload.get("summary") or payload.get("text", "")
            )

        if topic == "data.conversation.queue.update":
            turn = payload.get("turn") or {}
            return str(turn.get("content") or "")

        if topic == "data.oc.town.event":
            return str(payload.get("summary") or "")

        return ""

    def _reader_mentioned(self, text: str) -> bool:
        """Heuristic: reader is always relevant in reader-facing topics."""
        if self._reader_profile is None:
            return False
        profile = self._reader_profile.profile
        if not profile.display_name:
            return True  # Default reader is implicitly involved.
        lowered = text.lower()
        for token in (profile.display_name, profile.reader_id):
            if token and token.lower() in lowered:
                return True
        return False

    # ------------------------------------------------------------------
    # Emission
    # ------------------------------------------------------------------

    def _emit_personas(
        self,
        text: str,
        *,
        explicit_reader_ids: list[str] | None = None,
        explicit_oc_names: list[str] | None = None,
    ) -> None:
        snippets = self.collect_personas(
            text,
            explicit_reader_ids=explicit_reader_ids,
            explicit_oc_names=explicit_oc_names,
        )
        if not snippets:
            return
        self._state.custom["inject_count"] = (
            int(self._state.custom.get("inject_count", 0)) + 1
        )
        self.emit(
            topic=TOPIC_PERSONA_INJECTED,
            payload={
                "snippets": [s.to_dict() for s in snippets],
                "reader_count": self._state.custom["last_reader_count"],
                "oc_count": self._state.custom["last_oc_count"],
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
                "max_reader_profiles": self._max_reader_profiles,
                "max_oc_profiles": self._max_oc_profiles,
                "oc_name_aliases": dict(self._oc_name_aliases),
                "auto_inject_on": sorted(self._auto_inject_on),
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._max_reader_profiles = int(data.get("max_reader_profiles", 1))
        self._max_oc_profiles = int(data.get("max_oc_profiles", 3))
        aliases = data.get("oc_name_aliases", {})
        self._oc_name_aliases = {str(k): str(v) for k, v in aliases.items()}
        auto = data.get("auto_inject_on", [])
        self._auto_inject_on = set(str(t) for t in auto)


__all__ = [
    "PersonaInjector",
    "PersonaSnippet",
    "TOPIC_PERSONA_INJECTED",
]
