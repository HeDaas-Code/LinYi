"""PromptSurface: assemble a structured prompt surface from live context.

Inspired by SillyTavern's prompt-injection order (system > character > world
info before > examples > chat history > world info after > instruct footer),
AstrBot's message-segment abstraction, a16z companion-app's LangChain prompt
assembly, and Project AIRI's context-prompt / response categorisation, this
module collects fragments from all over the bus and produces a single
renderer-agnostic prompt surface.

The module does **not** call the LLM.  It only assembles the surface and emits
``data.prompt.surface.updated`` so that an orchestrator or chat runtime can
feed it to the model.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.persona_injector import TOPIC_PERSONA_INJECTED
from src.novelist_brain.self_timeline import SelfTimeline, TOPIC_SELF_TIMELINE_UPDATED

if TYPE_CHECKING:
    from src.novelist_brain.memory_stream import MemoryStream


#: Emitted when the prompt surface has been assembled/updated.
TOPIC_PROMPT_SURFACE_UPDATED = "data.prompt.surface.updated"

#: Request an explicit surface assembly.
TOPIC_CONTROL_PROMPT_SURFACE_REQUEST = "control.prompt.surface.request"


@dataclass
class PromptSlot:
    """A named section of the prompt surface."""

    name: str
    content: str
    priority: int = 5
    source: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "content": self.content,
            "priority": self.priority,
            "source": self.source,
        }


class PromptSurface(Module):
    """Assemble a structured prompt from live bus context.

    The surface is divided into ordered slots that mirror the SillyTavern
    injection order:

        system_rules
        character_definition
        world_info_before
        self_timeline
        memory_snippets
        reader_context
        expression_hint
        recent_conversation
        world_info_after
        instruction_footer

    Each slot is updated independently by listening to the relevant data
topics.  When a ``control.prompt.surface.request`` arrives, or when a
    high-priority slot changes, the module assembles and emits the full
    surface.

    Configuration via ``context["prompt_surface"]``:

    - ``system_rules`` (str): static system instructions.
    - ``instruction_footer`` (str): final instruction block.
    - ``character_sheet`` (dict): OC character sheet used to build the
      character definition.
    - ``max_surface_chars`` (int): hard cap on ``flat_text`` length.
    - ``auto_assemble_on`` (list[str]): topics that trigger auto-assembly.
    """

    # Default slot order; this ordering matches SillyTavern's prompt blocks.
    SLOT_ORDER: tuple[str, ...] = (
        "system_rules",
        "character_definition",
        "world_info_before",
        "self_timeline",
        "memory_snippets",
        "reader_context",
        "expression_hint",
        "recent_conversation",
        "world_info_after",
        "instruction_footer",
    )

    def __init__(self, name: str = "prompt_surface") -> None:
        super().__init__(name)
        self._max_surface_chars = 8_000
        self._auto_assemble_on: set[str] = set()
        self._self_timeline: SelfTimeline | None = None
        self._memory_stream: MemoryStream | None = None
        self._slots: dict[str, PromptSlot] = {
            name: PromptSlot(name=name, content="", priority=5)
            for name in self.SLOT_ORDER
        }
        self.subscribe(
            "data.oc.character.imported",
            "control.character_card.reload",
            "data.world_book.triggered",
            TOPIC_SELF_TIMELINE_UPDATED,
            "data.memory_stream.update",
            "data.reader.profile.updated",
            "data.expression.changed",
            "data.conversation.queue.update",
            TOPIC_PERSONA_INJECTED,
            TOPIC_CONTROL_PROMPT_SURFACE_REQUEST,
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "prompt_surface",
            "version": "0.1.0",
            "description": "Assemble a structured prompt surface from live bus context",
            "dependencies": [],
            "category": "prompt",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "slot_count": len(self.SLOT_ORDER),
                "last_assemble_at": 0.0,
                "last_surface_chars": 0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def set_slot(self, name: str, content: str, *, source: str = "") -> None:
        """Directly set a slot's content."""
        if name not in self._slots:
            return
        self._slots[name] = PromptSlot(
            name=name,
            content=content.strip(),
            priority=self._slots[name].priority,
            source=source,
        )

    def get_slot(self, name: str) -> str:
        """Return the current content of a slot."""
        return self._slots.get(name, PromptSlot(name=name, content="")).content

    def assemble(self) -> dict[str, Any]:
        """Build the prompt surface dict and a flattened text."""
        ordered: list[dict[str, Any]] = []
        flat_parts: list[str] = []

        for slot_name in self.SLOT_ORDER:
            slot = self._slots[slot_name]
            if not slot.content:
                continue
            ordered.append(slot.to_dict())
            flat_parts.append(f"[{slot.name}]\n{slot.content}")

        flat_text = "\n\n".join(flat_parts)
        if self._max_surface_chars > 0 and len(flat_text) > self._max_surface_chars:
            flat_text = self._truncate(flat_text, self._max_surface_chars)

        self._state.custom["last_surface_chars"] = len(flat_text)
        return {
            "slots": ordered,
            "flat_text": flat_text,
            "slot_names": [s["name"] for s in ordered],
        }

    # ------------------------------------------------------------------
    # Truncation policy
    # ------------------------------------------------------------------

    def _truncate(self, text: str, limit: int) -> str:
        """Truncate from the right while preserving the opening sections.

        The most disposable content is usually the middle (working memory and
        conversation), so we keep the head (system/character/world info) and
        drop the rest when over limit.
        """
        if len(text) <= limit:
            return text

        suffix = "\n\n[truncated]"
        max_head = max(0, limit - len(suffix))
        head = text[:max_head]
        # Walk back to a section boundary if possible.
        boundary = head.rfind("\n\n[")
        if boundary > max_head * 0.5:
            head = text[:boundary]
        return f"{head}{suffix}"

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("prompt_surface", {})

        # Grab upstream module instances so we can query live state rather than
        # relying solely on event payload shapes.
        self._self_timeline = context.get("self_timeline_instance")
        self._memory_stream = context.get("memory_stream_instance")

        system_rules = cfg.get("system_rules", "")
        if isinstance(system_rules, str):
            self.set_slot("system_rules", system_rules, source="config")

        instruction_footer = cfg.get("instruction_footer", "")
        if isinstance(instruction_footer, str):
            self.set_slot("instruction_footer", instruction_footer, source="config")

        character_sheet = cfg.get("character_sheet")
        if isinstance(character_sheet, dict):
            self._set_character_definition(character_sheet)

        max_chars = cfg.get("max_surface_chars")
        if isinstance(max_chars, int) and max_chars > 0:
            self._max_surface_chars = max_chars

        auto_topics = cfg.get("auto_assemble_on")
        if isinstance(auto_topics, (list, tuple)):
            self._auto_assemble_on = set(str(t) for t in auto_topics)

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        payload = message.payload or {}

        if topic == TOPIC_CONTROL_PROMPT_SURFACE_REQUEST:
            self._update_from_request(payload)
            self._emit_surface()
            return

        updated = self._update_slot_from_message(topic, payload)
        if updated and (not self._auto_assemble_on or topic in self._auto_assemble_on):
            self._emit_surface()

    def tick(self, delta: TickDelta) -> None:
        self._state.last_tick = delta.absolute_time

    # ------------------------------------------------------------------
    # Slot updaters
    # ------------------------------------------------------------------

    def _update_from_request(self, payload: dict[str, Any]) -> None:
        """Apply explicit slot overrides from a request message."""
        for slot_name in self.SLOT_ORDER:
            value = payload.get(slot_name)
            if isinstance(value, str):
                self.set_slot(slot_name, value, source="request")
        context = payload.get("context")
        if isinstance(context, str):
            # Optional ad-hoc context appended to the instruction footer.
            footer = self.get_slot("instruction_footer")
            if context not in footer:
                footer = f"{footer}\n\nContext: {context}".strip()
                self.set_slot("instruction_footer", footer, source="request")

    def _update_slot_from_message(self, topic: str, payload: dict[str, Any]) -> bool:
        """Update one or more slots based on a bus message.  Return True if any
        slot changed.
        """
        if topic in ("data.oc.character.imported", "control.character_card.reload"):
            sheet = payload.get("sheet") or {}
            if isinstance(sheet, dict):
                self._set_character_definition(sheet)
                return True
            return False

        if topic == "data.world_book.triggered":
            entries = payload.get("entries", []) or []
            before: list[str] = []
            after: list[str] = []
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                name = entry.get("name", "")
                content = entry.get("content", "")
                position = entry.get("position", "before_char")
                text = f"- {name}: {content}" if name else f"- {content}"
                if position == "after_char":
                    after.append(text)
                else:
                    before.append(text)
            if before:
                self.set_slot(
                    "world_info_before",
                    "World info:\n" + "\n".join(before),
                    source="world_book_trigger",
                )
            if after:
                self.set_slot(
                    "world_info_after",
                    "Additional world info:\n" + "\n".join(after),
                    source="world_book_trigger",
                )
            return bool(before or after)

        if topic == TOPIC_SELF_TIMELINE_UPDATED:
            if self._self_timeline is not None:
                entries = self._self_timeline.collect_entries("", limit=8)
                if entries:
                    lines = ["Recent activity:"]
                    for entry in entries:
                        summary = getattr(entry, "summary", "")
                        if summary:
                            lines.append(f"- {summary}")
                    self.set_slot("self_timeline", "\n".join(lines), source="self_timeline")
                    return True
            return False

        if topic == "data.memory_stream.update":
            if self._memory_stream is not None:
                entries = self._memory_stream.working_entries()
                if not entries:
                    entries = self._memory_stream.retrieve("", limit=5)
                if entries:
                    lines = ["Relevant memories:"]
                    for entry in entries:
                        content = getattr(entry, "content", "")
                        if content:
                            lines.append(f"- {content}")
                    self.set_slot("memory_snippets", "\n".join(lines), source="memory_stream")
                    return True
            return False

        if topic == "data.reader.profile.updated":
            profile = payload.get("profile") or payload or {}
            lines = ["Reader context:"]
            name = profile.get("display_name") or profile.get("reader_id", "")
            if name:
                lines.append(f"Name: {name}")
            stage = profile.get("relationship_stage", "")
            if stage:
                lines.append(f"Relationship: {stage}")
            tone = profile.get("preferred_tone", "")
            if tone:
                lines.append(f"Preferred tone: {tone}")
            facts = profile.get("known_facts", {})
            if isinstance(facts, dict) and facts:
                lines.append("Known facts:")
                for key, value in facts.items():
                    lines.append(f"  - {key}: {value}")
            self.set_slot("reader_context", "\n".join(lines), source="reader_profile")
            return True

        if topic == "data.expression.changed":
            emotion = payload.get("emotion", "neutral")
            intensity = payload.get("intensity", 0.5)
            action = payload.get("action", "idle")
            text = (
                f"Current expression: {emotion} (intensity {intensity:.2f}, "
                f"action: {action})"
            )
            self.set_slot("expression_hint", text, source="expression_state")
            return True

        if topic == "data.conversation.queue.update":
            action = payload.get("action", "")
            turn = payload.get("turn") or {}
            turns = payload.get("turns", []) or []
            if action == "add" and isinstance(turn, dict) and turn.get("content"):
                self._append_conversation_turn(turn)
                return True
            if action == "snapshot" and turns:
                self._set_conversation_snapshot(turns)
                return True
            return False

        if topic == TOPIC_PERSONA_INJECTED:
            snippets = payload.get("snippets", []) or []
            reader_parts: list[str] = []
            oc_parts: list[str] = []
            for snippet in snippets:
                if not isinstance(snippet, dict):
                    continue
                entity_type = snippet.get("entity_type", "")
                content = snippet.get("content", "")
                if entity_type == "reader" and content:
                    reader_parts.append(content)
                elif entity_type == "oc" and content:
                    oc_parts.append(content)
            if reader_parts:
                self.set_slot("reader_context", "\n\n".join(reader_parts), source="persona_injector")
            if oc_parts:
                self.set_slot(
                    "world_info_before",
                    "Active personas:\n\n" + "\n\n".join(oc_parts),
                    source="persona_injector",
                )
            return bool(reader_parts or oc_parts)

        return False

    def _set_character_definition(self, sheet: dict[str, Any]) -> None:
        lines = ["Character definition:"]
        name = sheet.get("name", "")
        if name:
            lines.append(f"Name: {name}")
        archetype = sheet.get("archetype", "")
        if archetype:
            lines.append(f"Archetype: {archetype}")
        internal_conflict = sheet.get("internal_conflict", "")
        if internal_conflict:
            lines.append(f"Internal conflict: {internal_conflict}")
        narrative_arc = sheet.get("narrative_arc", [])
        if narrative_arc:
            lines.append("Narrative arc:")
            for item in narrative_arc:
                lines.append(f"  - {item}")
        facts = sheet.get("immutable_facts", [])
        if facts:
            lines.append("Important facts:")
            for fact in facts:
                lines.append(f"  - {fact}")
        self.set_slot("character_definition", "\n".join(lines), source="character_sheet")

    def _append_conversation_turn(self, turn: dict[str, Any]) -> None:
        role = turn.get("role", "")
        content = turn.get("content", "")
        if not role or not content:
            return
        current = self.get_slot("recent_conversation")
        line = f"{role}: {content}"
        if current:
            current = f"{current}\n{line}"
        else:
            current = f"Recent conversation:\n{line}"
        self.set_slot("recent_conversation", current, source="conversation_queue")

    def _set_conversation_snapshot(self, turns: list[Any]) -> None:
        lines = ["Recent conversation:"]
        for turn in turns:
            if isinstance(turn, dict):
                role = turn.get("role", "")
                content = turn.get("content", "")
                if role and content:
                    lines.append(f"{role}: {content}")
        self.set_slot("recent_conversation", "\n".join(lines), source="conversation_queue")

    # ------------------------------------------------------------------
    # Emission
    # ------------------------------------------------------------------

    def _emit_surface(self) -> None:
        surface = self.assemble()
        self._state.custom["last_assemble_at"] = self._state.last_tick
        self.emit(
            topic=TOPIC_PROMPT_SURFACE_UPDATED,
            payload=surface,
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
                "max_surface_chars": self._max_surface_chars,
                "auto_assemble_on": sorted(self._auto_assemble_on),
                "slots": {name: slot.to_dict() for name, slot in self._slots.items()},
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._max_surface_chars = int(data.get("max_surface_chars", 8_000))
        auto = data.get("auto_assemble_on", [])
        self._auto_assemble_on = set(str(t) for t in auto)
        for name, slot_data in data.get("slots", {}).items():
            if name in self._slots and isinstance(slot_data, dict):
                self._slots[name] = PromptSlot(
                    name=name,
                    content=str(slot_data.get("content", "")),
                    priority=int(slot_data.get("priority", 5)),
                    source=str(slot_data.get("source", "")),
                )


__all__ = [
    "PromptSurface",
    "PromptSlot",
    "TOPIC_PROMPT_SURFACE_UPDATED",
    "TOPIC_CONTROL_PROMPT_SURFACE_REQUEST",
]
