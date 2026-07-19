"""Novel output module for the novelist brain prototype."""

from __future__ import annotations

from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


class NovelOutput(Module):
    """Collects novel paragraphs and publishes publication events.

    The output module listens for ``data.novel.paragraph`` messages,
    appends each paragraph to an in-memory manuscript, and broadcasts
    both a discrete publication event (``event.novel.paragraph.published``)
    and the current novel state (``data.novel.state``).  The broadcast
    events close the feedback loop by allowing Memory and DMN modules
    to treat the published prose as new input.
    """

    def __init__(self, name: str = "novel_output") -> None:
        super().__init__(name)
        self.title: str = ""
        self.author_name: str = "林逸"
        self.paragraphs: list[str] = []
        self.world_settings: dict[str, Any] = {}
        self.version: int = 0

        self.subscribe(
            "data.novel.paragraph",
            "control.module.init",
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.05,
            custom={
                "published_count": 0,
                "last_paragraph_index": -1,
            },
        )

    def init(self, context: dict[str, Any]) -> None:
        """Initialize novel output from agent context."""
        novel_context = context.get("novel", {})
        self.title = novel_context.get("title", "")
        self.world_settings = novel_context.get("world_settings", {})

        identity = context.get("identity")
        if isinstance(identity, dict):
            self.author_name = identity.get("name") or identity.get("pen_name") or self.author_name
        elif identity is not None:
            # LinYiProfile or any object with name / pen_name attributes.
            self.author_name = getattr(identity, "name", None) or getattr(identity, "pen_name", None) or self.author_name

    def on_bus_message(self, message: BusMessage) -> None:
        """Handle incoming paragraphs."""
        if not self._state.active:
            return
        if message.topic == "data.novel.paragraph":
            self._handle_paragraph(message.payload)

    def tick(self, delta: TickDelta) -> None:
        """Advance novel output bookkeeping."""
        self._state.last_tick = delta.absolute_time

    def get_state(self) -> dict[str, Any]:
        """Return a serializable snapshot of novel state."""
        return {
            "active": self._state.active,
            "energy_cost": self._state.energy_cost,
            "last_tick": self._state.last_tick,
            "title": self.title,
            "author_name": self.author_name,
            "version": self.version,
            "paragraph_count": len(self.paragraphs),
            "published_count": self._state.custom["published_count"],
            "latest_paragraph": self.paragraphs[-1] if self.paragraphs else "",
            "world_settings": self.world_settings,
        }

    def to_dict(self) -> dict[str, Any]:
        """Serialize novel output state."""
        base = super().to_dict()
        base.update(
            {
                "title": self.title,
                "author_name": self.author_name,
                "paragraphs": list(self.paragraphs),
                "world_settings": dict(self.world_settings),
                "version": self.version,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore novel output state."""
        super().from_dict(data, **kwargs)
        self.title = data.get("title", self.title)
        self.author_name = data.get("author_name", self.author_name)
        self.paragraphs = list(data.get("paragraphs", []))
        self.world_settings = dict(data.get("world_settings", {}))
        self.version = int(data.get("version", self.version))

    # ------------------------------------------------------------------
    # Message handlers
    # ------------------------------------------------------------------

    def _handle_paragraph(self, payload: Any) -> None:
        """Append paragraph and publish events."""
        if payload is None:
            return
        if not isinstance(payload, dict):
            payload = {"paragraph": str(payload)}

        paragraph = payload.get("paragraph", "")
        if not paragraph:
            return

        self.paragraphs.append(paragraph)
        self.version += 1
        index = len(self.paragraphs) - 1
        self._state.custom["published_count"] = self.version
        self._state.custom["last_paragraph_index"] = index

        self.emit(
            topic="event.novel.paragraph.published",
            payload={
                "paragraph": paragraph,
                "index": index,
                "version": self.version,
                "title": self.title,
                "author": self.author_name,
                "narrative_line_id": payload.get("narrative_line_id"),
                "source": payload.get("source", "unknown"),
            },
            channel="event",
            priority=7,
            ttl=5,
        )

        self.emit(
            topic="data.novel.state",
            payload=self.get_state(),
            channel="data",
            priority=5,
            ttl=3,
        )
