"""Module abstract base class for the novelist brain prototype."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

from src.novelist_brain.models import ModuleState
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass

if TYPE_CHECKING:
    from src.novelist_brain.bus import BusRouter
    from src.novelist_brain.models import BusMessage, TickDelta


class Module(ABC):
    """Abstract base class for all novelist brain modules.

    Modules communicate exclusively through the bus; they never call each other
    directly. The global clock drives each module via :meth:`tick`.

    Subclasses may declare metadata through :meth:`metadata` to support dynamic
    discovery and dependency ordering in a :class:`ModuleRegistry`.
    """

    def __init__(self, name: str) -> None:
        self.name = name
        self._router: BusRouter | None = None
        self._subscriptions: set[str] = set()
        self._state = self._initial_state()
        self._checkpoints: dict[str, dict[str, Any]] = {}

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        """Return module metadata used by the registry.

        Keys:
        - ``name``: canonical module name (defaults to lower-camel class name).
        - ``version``: semantic version string.
        - ``description``: short human-readable summary.
        - ``dependencies``: list of canonical names that must be instantiated first.
        - ``category``: optional grouping tag (e.g. ``input``, ``cognitive``, ``output``).
        """
        default_name = "".join(
            ["_" + c.lower() if c.isupper() else c for c in cls.__name__]
        ).lstrip("_")
        return {
            "name": default_name,
            "version": "0.1.0",
            "description": "",
            "dependencies": [],
            "category": "",
        }

    @property
    def state(self) -> ModuleState:
        return self._state

    def _initial_state(self) -> ModuleState:
        return ModuleState(active=True)

    def get_state(self) -> ModuleState:
        """Return the current module state."""
        return self._state

    def checkpoint(self, checkpoint_id: str) -> None:
        """Save a named snapshot of this module for later rollback."""
        self._checkpoints[checkpoint_id] = self.to_dict()

    def rollback(self, checkpoint_id: str | None = None) -> bool:
        """Restore the module from a named checkpoint.

        If ``checkpoint_id`` is omitted, the latest checkpoint is used.
        Returns ``True`` if a rollback was performed.
        """
        if checkpoint_id is None:
            if not self._checkpoints:
                return False
            checkpoint_id = next(reversed(self._checkpoints.keys()))
        snapshot = self._checkpoints.get(checkpoint_id)
        if snapshot is None:
            return False
        self.from_dict(snapshot)
        return True

    def clear_checkpoints(self) -> None:
        """Discard all named checkpoints."""
        self._checkpoints.clear()

    def to_dict(self) -> dict[str, Any]:
        """Return a serializable snapshot of the module's base state."""
        return {
            "name": self.name,
            "state": dataclass_to_dict(self._state),
            "subscriptions": sorted(self._subscriptions),
        }

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore the module's base state from a snapshot.

        Subclasses should call ``super().from_dict(data, **kwargs)`` and then
        restore their own internal fields.
        """
        self.name = data.get("name", self.name)
        self._subscriptions = set(data.get("subscriptions", []))
        self._state = reconstruct_dataclass(
            ModuleState, data.get("state", {})
        )

    def register(self, router: BusRouter) -> None:
        """Attach this module to a bus router."""
        self._router = router
        router.subscribe(self)

    def subscribe(self, *topics: str) -> None:
        """Declare interest in one or more topics."""
        self._subscriptions.update(topics)

    def subscribed_to(self, topic: str) -> bool:
        """Return True if this module subscribed to ``topic``."""
        return topic in self._subscriptions

    @property
    def subscriptions(self) -> frozenset[str]:
        return frozenset(self._subscriptions)

    def emit(
        self,
        topic: str,
        payload: Any,
        channel: str = "event",
        target: str | None = None,
        priority: int = 5,
        ttl: int = 3,
    ) -> None:
        """Publish a message to the attached bus router."""
        if self._router is None:
            raise RuntimeError(f"Module {self.name} is not registered to a router")
        self._router.publish(
            source=self.name,
            topic=topic,
            channel=channel,  # type: ignore[arg-type]
            payload=payload,
            target=target,
            priority=priority,
            ttl=ttl,
        )

    @abstractmethod
    def init(self, context: dict[str, Any]) -> None:
        """Initialize the module with the given agent context."""
        ...

    def init_with_timeout(
        self,
        context: dict[str, Any],
        timeout_seconds: float = 30.0,
    ) -> None:
        """Wrap :meth:`init` with a configurable timeout.

        If ``init`` does not complete within ``timeout_seconds``, raises
        :class:`TimeoutError`. The default timeout is 30s per §3.2.3.

        Implementation uses a daemon thread + ``join(timeout)`` because
        Python's GIL makes it unsafe to hard-cancel a running ``init``.
        When the timeout fires, the worker thread continues running in the
        background (it is a daemon, so it will not block process exit) but
        the caller gets a :class:`TimeoutError` immediately. This is a
        pragmatic trade-off: hard cancellation would require cooperative
        cancellation checks inside every ``init`` implementation, which is
        too invasive.

        ``timeout_seconds <= 0`` skips the timeout wrapper entirely and
        calls :meth:`init` directly, preserving the legacy blocking
        behaviour for callers that explicitly want to wait forever.
        """
        import threading

        if timeout_seconds <= 0:
            self.init(context)
            return

        # Holder for any exception raised inside the worker. ``dict`` is
        # used instead of ``nonlocal`` so the closure works without
        # ``nonlocal`` declarations (which would still work, but the dict
        # form is friendlier for static analysis).
        result: dict[str, Any] = {"error": None}

        def worker() -> None:
            try:
                self.init(context)
            except BaseException as exc:  # noqa: BLE001 - re-raised below
                result["error"] = exc

        thread = threading.Thread(
            target=worker,
            daemon=True,
            name=f"init-{self.name}",
        )
        thread.start()
        thread.join(timeout=timeout_seconds)

        if thread.is_alive():
            raise TimeoutError(
                f"Module {self.name} init timed out after {timeout_seconds}s"
            )
        if result["error"] is not None:
            raise result["error"]

    @abstractmethod
    def on_bus_message(self, message: BusMessage) -> None:
        """Handle a bus message addressed to this module."""
        ...

    @abstractmethod
    def tick(self, delta: TickDelta) -> None:
        """Advance the module by one clock tick."""
        ...

    def pause(self) -> None:
        """Deactivate the module."""
        self._state.active = False

    def resume(self) -> None:
        """Reactivate the module."""
        self._state.active = True
