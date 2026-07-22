"""ReaderRestGate: detect when the reader has gone quiet.

The gate listens for reader-interaction events and the global clock.  When the
reader has been silent longer than a configurable threshold it emits
``control.reader.rest.detected`` exactly once.  When the next interaction
arrives it emits ``control.reader.return.detected``.

This lets rhythm modules (scheduler, segment detail enhancer, creation
executive) switch into a "slow time" mode: fewer proactive messages, deeper
incubation, and lower metabolic spend.
"""

from __future__ import annotations

import time
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


#: Topic emitted when the reader has been silent long enough.
TOPIC_READER_REST = "control.reader.rest.detected"

#: Topic emitted when the reader returns after a rest period.
TOPIC_READER_RETURN = "control.reader.return.detected"

#: Default threshold after which the reader is considered "at rest".
DEFAULT_REST_THRESHOLD_SECONDS = 10 * 60.0

#: Minimum seconds between consecutive rest/return broadcasts to avoid spam.
DEFAULT_COOLDOWN_SECONDS = 60.0


class ReaderRestGate(Module):
    """Track reader silence and broadcast rest/return control events."""

    def __init__(
        self,
        name: str = "reader_rest_gate",
        *,
        rest_threshold_seconds: float = DEFAULT_REST_THRESHOLD_SECONDS,
        cooldown_seconds: float = DEFAULT_COOLDOWN_SECONDS,
    ) -> None:
        super().__init__(name)
        self._rest_threshold_seconds = max(1.0, float(rest_threshold_seconds))
        self._cooldown_seconds = max(0.0, float(cooldown_seconds))
        self._last_interaction_at: float = 0.0
        self._last_state: str = "present"  # present | resting
        self._last_broadcast_at: float = 0.0
        self.subscribe(
            "event.reader.interaction",
            "fragment.personal.new",
            "data.reader.message",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "reader_rest_gate",
            "version": "0.1.0",
            "description": "Detect reader silence and emit rest/return events",
            "dependencies": [],
            "category": "input",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "last_interaction_at": 0.0,
                "last_state": "present",
                "rest_count": 0,
                "return_count": 0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def mark_interaction(self, timestamp: float | None = None) -> None:
        """Record an explicit reader interaction."""
        now = timestamp if timestamp is not None else time.time()
        self._last_interaction_at = now
        self._state.custom["last_interaction_at"] = now
        if self._last_state == "resting":
            self._last_state = "present"
            self._state.custom["last_state"] = "present"
            if now - self._last_broadcast_at >= self._cooldown_seconds:
                self._publish_return(now)

    def is_resting(self, now: float | None = None) -> bool:
        """Return True if the reader is currently considered at rest."""
        now = now if now is not None else time.time()
        silence = now - self._last_interaction_at
        return silence >= self._rest_threshold_seconds

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("reader_rest_gate", {})
        threshold = cfg.get("rest_threshold_seconds")
        if isinstance(threshold, (int, float)) and threshold > 0:
            self._rest_threshold_seconds = float(threshold)
        cooldown = cfg.get("cooldown_seconds")
        if isinstance(cooldown, (int, float)) and cooldown >= 0:
            self._cooldown_seconds = float(cooldown)

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        if topic in (
            "event.reader.interaction",
            "fragment.personal.new",
            "data.reader.message",
        ):
            self.mark_interaction()

    def tick(self, delta: TickDelta) -> None:
        now = delta.absolute_time
        silence = now - self._last_interaction_at
        was_resting = self._last_state == "resting"
        is_resting_now = silence >= self._rest_threshold_seconds

        if is_resting_now and not was_resting:
            self._last_state = "resting"
            self._state.custom["last_state"] = "resting"
            if now - self._last_broadcast_at >= self._cooldown_seconds:
                self._publish_rest(now, silence)
        elif not is_resting_now and was_resting:
            # This branch is normally handled by mark_interaction, but tick can
            # catch edge cases where interaction happened just before threshold.
            self._last_state = "present"
            self._state.custom["last_state"] = "present"

    # ------------------------------------------------------------------
    # Event publishing
    # ------------------------------------------------------------------

    def _publish_rest(self, now: float, silence_seconds: float) -> None:
        self._last_broadcast_at = now
        self._state.custom["rest_count"] = (
            int(self._state.custom.get("rest_count", 0)) + 1
        )
        self.emit(
            topic=TOPIC_READER_REST,
            payload={
                "silence_seconds": silence_seconds,
                "threshold_seconds": self._rest_threshold_seconds,
                "timestamp": now,
            },
            channel="control",
            priority=6,
            ttl=5,
        )

    def _publish_return(self, now: float) -> None:
        self._last_broadcast_at = now
        self._state.custom["return_count"] = (
            int(self._state.custom.get("return_count", 0)) + 1
        )
        self.emit(
            topic=TOPIC_READER_RETURN,
            payload={"timestamp": now},
            channel="control",
            priority=6,
            ttl=5,
        )

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "rest_threshold_seconds": self._rest_threshold_seconds,
                "cooldown_seconds": self._cooldown_seconds,
                "last_interaction_at": self._last_interaction_at,
                "last_state": self._last_state,
                "last_broadcast_at": self._last_broadcast_at,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._rest_threshold_seconds = float(
            data.get("rest_threshold_seconds", DEFAULT_REST_THRESHOLD_SECONDS)
        )
        self._cooldown_seconds = float(
            data.get("cooldown_seconds", DEFAULT_COOLDOWN_SECONDS)
        )
        self._last_interaction_at = float(data.get("last_interaction_at", 0.0))
        self._last_state = str(data.get("last_state", "present"))
        self._last_broadcast_at = float(data.get("last_broadcast_at", 0.0))
        self._state.custom["last_state"] = self._last_state


__all__ = [
    "ReaderRestGate",
    "TOPIC_READER_REST",
    "TOPIC_READER_RETURN",
    "DEFAULT_REST_THRESHOLD_SECONDS",
]
