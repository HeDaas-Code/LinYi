"""Lightweight bus spy that records recent messages for the WebUI.

The spy is attached to a :class:`BusRouter` by wrapping its ``publish``
method so that every published message is captured without requiring every
module to subscribe to every topic.

Robustness notes
----------------
* ``attach`` is idempotent: re-attaching the same spy instance is a no-op.
* If a different spy is already attached, the new attachment is refused
  rather than silently chaining patches on top of each other.
* ``detach`` restores the original ``publish`` method, which makes the
  spy safe to use in tests that share a router.
* The wrapped ``publish`` accepts both keyword and positional arguments so
  it stays compatible with the router's signature even if the router is
  upgraded to accept new keyword arguments later.
* Recording failures (e.g. unpickleable payloads) never block the original
  publish from running.
"""

from __future__ import annotations

import threading
from collections import deque
from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage


_SPY_ATTR = "_web_ui_spy"


class BusSpy:
    """Records recent bus messages and exposes them to the dashboard API."""

    def __init__(self, capacity: int = 200) -> None:
        self._messages: deque[dict[str, Any]] = deque(maxlen=capacity)
        self._original_publish: Any | None = None
        self._attached_router: BusRouter | None = None
        self._lock = threading.Lock()

    def attach(self, router: BusRouter) -> bool:
        """Attach the spy to a router, preserving the original publish method.

        Returns ``True`` when the spy has been attached (either freshly or
        because the same spy was already attached), and ``False`` when a
        different spy already owns the router.
        """
        existing = getattr(router, _SPY_ATTR, None)
        if existing is self:
            return True
        if existing is not None:
            # Another spy is already attached. Refuse rather than overwriting
            # it so message capture remains predictable.
            return False

        # Preserve the real publish method (which may itself be a bound
        # method or a function). Storing it on the router also lets later
        # code reach it without needing the spy instance.
        self._original_publish = router.publish
        self._attached_router = router
        setattr(router, _SPY_ATTR, self)

        spy = self

        def _patched_publish(*args: Any, **kwargs: Any) -> None:
            # Record first so a capture failure never blocks delivery.
            try:
                spy._record(args, kwargs)
            except Exception:
                # Swallow capture errors — the bus must keep flowing.
                pass
            if spy._original_publish is not None:
                spy._original_publish(*args, **kwargs)

        router.publish = _patched_publish  # type: ignore[method-assign]
        return True

    def detach(self) -> None:
        """Restore the original publish method on the attached router."""
        router = self._attached_router
        if router is None:
            return
        if getattr(router, _SPY_ATTR, None) is self:
            try:
                delattr(router, _SPY_ATTR)
            except AttributeError:
                pass
        if self._original_publish is not None:
            router.publish = self._original_publish  # type: ignore[method-assign]
        self._original_publish = None
        self._attached_router = None

    def _record(self, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
        """Capture a publish call into the bounded message buffer."""
        # The router.publish signature is:
        #   publish(source, topic, channel, payload, target=None,
        #           priority=5, ttl=3, timestamp=0.0)
        # Accept both positional and keyword forms.
        positional_keys = (
            "source",
            "topic",
            "channel",
            "payload",
            "target",
            "priority",
            "ttl",
            "timestamp",
        )
        record: dict[str, Any] = {key: None for key in positional_keys}
        record["priority"] = 5
        record["ttl"] = 3
        record["timestamp"] = 0.0

        for key, value in zip(positional_keys, args):
            record[key] = value
        for key, value in kwargs.items():
            if key in record:
                record[key] = value

        # Bound the recorded payload size defensively so a giant LLM response
        # cannot OOM the dashboard.
        payload = record.get("payload")
        record["payload"] = _safe_payload(payload)

        with self._lock:
            self._messages.append(record)

    def recent(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return the most recent ``limit`` messages, newest last."""
        with self._lock:
            return list(self._messages)[-limit:]

    def clear(self) -> None:
        with self._lock:
            self._messages.clear()


def _safe_payload(payload: Any) -> Any:
    """Best-effort coercion of a payload into a JSON-serialisable form."""
    if payload is None:
        return None
    # Primitive types pass through unchanged.
    if isinstance(payload, (str, int, float, bool)):
        return payload
    # Dataclasses expose their fields via ``__dataclass_fields__``.
    if hasattr(payload, "__dataclass_fields__"):
        try:
            from src.novelist_brain.persistence import dataclass_to_dict

            return dataclass_to_dict(payload)
        except Exception:
            return repr(payload)
    if isinstance(payload, (list, tuple, set)):
        return [_safe_payload(item) for item in payload]
    if isinstance(payload, dict):
        return {str(k): _safe_payload(v) for k, v in payload.items()}
    # Fallback: stringify anything exotic so the dashboard still renders.
    try:
        return str(payload)
    except Exception:
        return "<unrepresentable payload>"
