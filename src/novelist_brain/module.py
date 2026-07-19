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
    """

    def __init__(self, name: str) -> None:
        self.name = name
        self._router: BusRouter | None = None
        self._subscriptions: set[str] = set()
        self._state = self._initial_state()

    @property
    def state(self) -> ModuleState:
        return self._state

    def _initial_state(self) -> ModuleState:
        return ModuleState(active=True)

    def get_state(self) -> ModuleState:
        """Return the current module state."""
        return self._state

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
