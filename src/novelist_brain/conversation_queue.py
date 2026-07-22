"""ConversationQueue: short-term conversational context inspired by a16z companion-app.

The a16z companion-app keeps a vector store for long-term memory and a Redis
list for the most recent chat turns.  This module implements the Redis-list
half of that pattern: a bounded FIFO queue of conversational turns (reader
messages, agent replies, OC events, tool results) that can be merged with
:class:`MemoryStream` retrieval to give the agent both deep relevance and
immediate continuity.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


#: Topic emitted when the conversation queue changes.
TOPIC_CONVERSATION_QUEUE_UPDATE = "data.conversation.queue.update"

#: Topic emitted when older turns are evicted from the bounded queue.
TOPIC_CONVERSATION_QUEUE_EVICTED = "data.conversation.queue.evicted"


@dataclass
class ConversationTurn:
    """A single turn in the recent conversation."""

    turn_id: str
    role: str  # user | agent | oc | system | tool
    content: str
    source: str = ""
    timestamp: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


class ConversationQueue(Module):
    """Bounded FIFO queue of recent conversational turns.

    Configuration via ``context["conversation_queue"]``:

    - ``max_turns`` (int): maximum number of turns to retain (default 20).
    - ``index_roles`` (list[str]): roles that should be converted to searchable
      memory entries by consumers (default all).

    The queue subscribes to:

    - ``event.reader.interaction`` — reader messages.
    - ``data.agent.response`` — agent replies.
    - ``data.oc.town.event`` — OC social events that read like dialogue.
    - ``data.tool.result`` — tool execution results (Agent Zero / MCP layer).

    Other modules can request the latest turns by publishing
    ``control.conversation.queue.get_recent`` or by obtaining the module
    instance from the shared context.
    """

    def __init__(
        self,
        name: str = "conversation_queue",
        *,
        max_turns: int = 20,
    ) -> None:
        super().__init__(name)
        self._max_turns = max(1, int(max_turns))
        self._turns: list[ConversationTurn] = []
        self.subscribe(
            "event.reader.interaction",
            "data.agent.response",
            "data.oc.town.event",
            "data.tool.result",
            "control.conversation.queue.get_recent",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "conversation_queue",
            "version": "0.1.0",
            "description": "Bounded FIFO queue of recent conversational turns",
            "dependencies": [],
            "category": "memory",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={"turn_count": 0},
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add(
        self,
        role: str,
        content: str,
        *,
        source: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> ConversationTurn:
        """Add a turn to the queue, evicting the oldest if over capacity."""
        now = time.time()
        turn = ConversationTurn(
            turn_id=f"turn_{int(now * 1000)}_{uuid.uuid4().hex[:6]}",
            role=role,
            content=content,
            source=source or self.name,
            timestamp=now,
            metadata=dict(metadata or {}),
        )
        self._turns.append(turn)
        self._ensure_capacity()
        self._state.custom["turn_count"] = len(self._turns)
        if self._router is not None:
            self._publish_update("add", turn)
        return turn

    def recent_turns(self, limit: int | None = None) -> list[ConversationTurn]:
        """Return the most recent turns, oldest first."""
        if limit is None or limit <= 0:
            return list(self._turns)
        return list(self._turns[-limit:])

    def latest_turn(self) -> ConversationTurn | None:
        """Return the most recent turn, if any."""
        if not self._turns:
            return None
        return self._turns[-1]

    def clear(self) -> None:
        """Drop all turns."""
        self._turns.clear()
        self._state.custom["turn_count"] = 0
        if self._router is not None:
            self._publish_update("clear", None)

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("conversation_queue", {})
        max_turns = cfg.get("max_turns")
        if isinstance(max_turns, int) and max_turns > 0:
            self._max_turns = max_turns

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        payload = message.payload or {}

        if message.topic == "event.reader.interaction":
            content = payload.get("content") or payload.get("summary") or str(payload)
            self.add(
                role="user",
                content=content,
                source=message.source,
                metadata={"topic": message.topic},
            )
            return

        if message.topic == "data.agent.response":
            content = payload.get("content") or payload.get("summary") or str(payload)
            self.add(
                role="agent",
                content=content,
                source=message.source,
                metadata={"topic": message.topic},
            )
            return

        if message.topic == "data.oc.town.event":
            summary = payload.get("summary", "")
            if summary:
                self.add(
                    role="oc",
                    content=summary,
                    source=message.source,
                    metadata={
                        "kind": payload.get("kind", ""),
                        "extra": payload.get("extra", {}),
                    },
                )
            return

        if message.topic == "data.tool.result":
            tool = payload.get("tool", "")
            output = payload.get("output", {})
            content = f"[{tool}] {output.get('path', '') or output.get('script_path', '')}".strip()
            if content:
                self.add(
                    role="tool",
                    content=content,
                    source=message.source,
                    metadata={"tool_call_id": payload.get("tool_call_id", "")},
                )
            return

        if message.topic == "control.conversation.queue.get_recent":
            limit = int(payload.get("limit", self._max_turns))
            turns = self.recent_turns(limit)
            self.emit(
                topic=TOPIC_CONVERSATION_QUEUE_UPDATE,
                payload={
                    "action": "snapshot",
                    "turns": [self._turn_to_dict(t) for t in turns],
                },
                channel="data",
                priority=5,
                ttl=3,
            )
            return

    def tick(self, delta: TickDelta) -> None:
        self._state.custom["turn_count"] = len(self._turns)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _ensure_capacity(self) -> None:
        evicted: list[ConversationTurn] = []
        while len(self._turns) > self._max_turns:
            evicted.append(self._turns.pop(0))
        if evicted and self._router is not None:
            self.emit(
                topic=TOPIC_CONVERSATION_QUEUE_EVICTED,
                payload={
                    "turns": [self._turn_to_dict(t) for t in evicted],
                    "evicted_count": len(evicted),
                },
                channel="data",
                priority=5,
                ttl=3,
            )

    def _publish_update(self, action: str, turn: ConversationTurn | None) -> None:
        self.emit(
            topic=TOPIC_CONVERSATION_QUEUE_UPDATE,
            payload={
                "action": action,
                "turn": self._turn_to_dict(turn) if turn else None,
                "turn_count": len(self._turns),
            },
            channel="data",
            priority=5,
            ttl=3,
        )

    @staticmethod
    def _turn_to_dict(turn: ConversationTurn) -> dict[str, Any]:
        return {
            "turn_id": turn.turn_id,
            "role": turn.role,
            "content": turn.content,
            "source": turn.source,
            "timestamp": turn.timestamp,
            "metadata": turn.metadata,
        }

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "max_turns": self._max_turns,
                "turns": [self._turn_to_dict(t) for t in self._turns],
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._max_turns = int(data.get("max_turns", 20))
        self._turns = [
            ConversationTurn(
                turn_id=t.get("turn_id", ""),
                role=t.get("role", "system"),
                content=t.get("content", ""),
                source=t.get("source", ""),
                timestamp=float(t.get("timestamp", 0.0)),
                metadata=dict(t.get("metadata", {})),
            )
            for t in data.get("turns", [])
        ]
        self._state.custom["turn_count"] = len(self._turns)


__all__ = [
    "ConversationQueue",
    "ConversationTurn",
    "TOPIC_CONVERSATION_QUEUE_UPDATE",
    "TOPIC_CONVERSATION_QUEUE_EVICTED",
]
