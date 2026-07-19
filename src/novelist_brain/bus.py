"""Internal bus system for the novelist brain prototype."""

from __future__ import annotations

from collections import deque
from typing import TYPE_CHECKING, Any

from src.novelist_brain.models import BusMessage

if TYPE_CHECKING:
    from src.novelist_brain.module import Module


class BaseBus:
    """Base class for a logical message bus channel."""

    def __init__(self, channel: str) -> None:
        self.channel = channel

    def filter_message(self, message: BusMessage) -> bool:
        """Return True if the message belongs to this bus channel."""
        return message.channel == self.channel


class EventBus(BaseBus):
    """Event bus for discrete occurrences."""

    def __init__(self) -> None:
        super().__init__("event")


class DataBus(BaseBus):
    """Data bus for structured entities."""

    def __init__(self) -> None:
        super().__init__("data")


class ControlBus(BaseBus):
    """Control bus for high-priority control signals."""

    def __init__(self) -> None:
        super().__init__("control")

    def filter_message(self, message: BusMessage) -> bool:
        """Control bus always participates to enforce override semantics."""
        return True


class BusRouter:
    """Routes messages between modules across three logical buses.

    Messages are dispatched by topic.  Each delivery decays the TTL; expired
    messages are silently dropped.  Higher priority messages are delivered
    before lower priority ones within a tick flush.
    """

    def __init__(self) -> None:
        self._modules: dict[str, Module] = {}
        self._subscriptions: dict[str, set[str]] = {}
        self._inbox: deque[BusMessage] = deque()
        self._event_bus = EventBus()
        self._data_bus = DataBus()
        self._control_bus = ControlBus()
        self._counter: int = 0

    @property
    def event_bus(self) -> EventBus:
        return self._event_bus

    @property
    def data_bus(self) -> DataBus:
        return self._data_bus

    @property
    def control_bus(self) -> ControlBus:
        return self._control_bus

    def subscribe(self, module: Module) -> None:
        """Register a module and its topic subscriptions."""
        self._modules[module.name] = module
        for topic in module.subscriptions:
            self._subscriptions.setdefault(topic, set()).add(module.name)

    def unsubscribe(self, module: Module) -> None:
        """Remove a module from the router."""
        self._modules.pop(module.name, None)
        for topic in list(self._subscriptions):
            subscribers = self._subscriptions[topic]
            subscribers.discard(module.name)
            if not subscribers:
                del self._subscriptions[topic]

    def publish(
        self,
        source: str,
        topic: str,
        channel: str,
        payload: Any,
        target: str | None = None,
        priority: int = 5,
        ttl: int = 3,
        timestamp: float = 0.0,
    ) -> None:
        """Enqueue a message for routing."""
        message = BusMessage(
            source=source,
            topic=topic,
            channel=channel,  # type: ignore[arg-type]
            payload=payload,
            target=target,
            priority=priority,
            ttl=ttl,
            timestamp=timestamp,
        )
        self._inbox.append(message)

    def route(self, message: BusMessage) -> list[BusMessage]:
        """Deliver a single message to subscribers and return responses.

        Control bus messages are delivered with priority override semantics:
        they are processed first and can interrupt or supersede regular traffic.
        """
        responses: list[BusMessage] = []
        if message.is_expired():
            return responses

        candidates: set[str] = set()
        if message.target is not None:
            if message.target in self._modules:
                candidates.add(message.target)
        else:
            candidates.update(self._subscriptions.get(message.topic, set()))

        # Control messages broadcast to every module for override awareness.
        if message.channel == "control":
            candidates.update(self._modules.keys())

        for name in candidates:
            module = self._modules.get(name)
            if module is None:
                continue
            # Control messages can wake up or override inactive modules.
            if message.channel != "control" and not module.state.active:
                continue
            module.on_bus_message(message)

        return responses

    def flush(self) -> list[BusMessage]:
        """Deliver all queued messages in priority order, applying TTL decay.

        Returns a list of messages that were actually delivered (post-decay).
        """
        if not self._inbox:
            return []

        # Snapshot and sort by priority descending, then FIFO order.
        snapshot = list(self._inbox)
        self._inbox.clear()
        snapshot.sort(key=lambda m: (-m.priority, m.timestamp))

        delivered: list[BusMessage] = []
        for message in snapshot:
            if message.is_expired():
                continue
            self.route(message)
            delivered.append(message.decay())
        return delivered

    def tick(self, timestamp: float = 0.0) -> list[BusMessage]:
        """Process one routing cycle and return delivered messages."""
        return self.flush()

    def get_subscribers(self, topic: str) -> list[str]:
        """Return the names of modules subscribed to ``topic``."""
        return sorted(self._subscriptions.get(topic, set()))

    def reset(self) -> None:
        """Clear all modules, subscriptions and queued messages."""
        self._modules.clear()
        self._subscriptions.clear()
        self._inbox.clear()
        self._counter = 0
