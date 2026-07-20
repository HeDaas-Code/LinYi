"""Lightweight bus spy that records recent messages for the WebUI.

The spy is attached to a :class:`BusRouter` by monkey-patching its ``publish``
method so that every published message is captured without requiring every
module to subscribe to every topic.
"""

from __future__ import annotations

from collections import deque
from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage


class BusSpy:
    """Records recent bus messages and exposes them to the dashboard API."""

    def __init__(self, capacity: int = 200) -> None:
        self._messages: deque[dict[str, Any]] = deque(maxlen=capacity)
        self._original_publish: Any | None = None

    def attach(self, router: BusRouter) -> None:
        """Attach the spy to a router, preserving the original publish method."""
        if hasattr(router, "_web_ui_spy"):
            return
        self._original_publish = router.publish
        router._web_ui_spy = self

        def _patched_publish(
            source: str,
            topic: str,
            channel: str,
            payload: Any,
            target: str | None = None,
            priority: int = 5,
            ttl: int = 3,
            timestamp: float = 0.0,
        ) -> None:
            self._messages.append(
                {
                    "source": source,
                    "topic": topic,
                    "channel": channel,
                    "payload": payload,
                    "target": target,
                    "priority": priority,
                    "ttl": ttl,
                    "timestamp": timestamp,
                }
            )
            if self._original_publish is not None:
                self._original_publish(
                    source=source,
                    topic=topic,
                    channel=channel,
                    payload=payload,
                    target=target,
                    priority=priority,
                    ttl=ttl,
                    timestamp=timestamp,
                )

        router.publish = _patched_publish

    def recent(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return the most recent ``limit`` messages, newest last."""
        return list(self._messages)[-limit:]

    def clear(self) -> None:
        self._messages.clear()
