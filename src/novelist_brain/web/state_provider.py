"""Thread-safe provider of live agent state for the WebUI dashboard.

The :class:`AgentStateProvider` is populated by ``main.py`` after all modules are
instantiated.  It offers read-only snapshots of module states, the bus router, and
assembled context so that the web layer never touches mutable module internals
without acquiring the provider lock.
"""

from __future__ import annotations

import threading
from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.persistence import dataclass_to_dict


class AgentStateProvider:
    """Central holder for live references consumed by the WebUI."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._router: BusRouter | None = None
        self._modules: dict[str, Any] = {}
        self._context: dict[str, Any] = {}
        self._started_at: float | None = None

    def register(
        self,
        router: BusRouter | None = None,
        modules: dict[str, Any] | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        """Register live references; safe to call multiple times."""
        with self._lock:
            if router is not None:
                self._router = router
            if modules is not None:
                self._modules.update(modules)
            if context is not None:
                self._context.update(context)
            if self._started_at is None:
                import time

                self._started_at = time.time()

    @property
    def router(self) -> BusRouter | None:
        with self._lock:
            return self._router

    def module(self, name: str) -> Any | None:
        with self._lock:
            return self._modules.get(name)

    def module_states(self) -> dict[str, dict[str, Any]]:
        """Return a snapshot of every registered module's serializable state."""
        with self._lock:
            result: dict[str, dict[str, Any]] = {}
            for name, module in self._modules.items():
                try:
                    state = module.get_state()
                    if hasattr(state, "to_dict"):
                        result[name] = state.to_dict()
                    elif hasattr(state, "__dataclass_fields__"):
                        result[name] = dataclass_to_dict(state)
                    else:
                        result[name] = dict(state)
                except Exception as exc:  # pragma: no cover - defensive
                    result[name] = {"error": str(exc)}
            return result

    def context_value(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self._context.get(key, default)

    def full_context(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._context)

    def snapshot(self) -> dict[str, Any]:
        """Return a complete dashboard snapshot."""
        with self._lock:
            import time

            return {
                "started_at": self._started_at,
                "uptime_seconds": (
                    time.time() - self._started_at if self._started_at else 0.0
                ),
                "modules": self.module_states(),
                "context": self.full_context(),
            }

    def bus_message_count(self) -> int:
        with self._lock:
            if self._router is None:
                return 0
            return len(self._router._inbox)


# Global singleton populated by the agent runtime.
_provider = AgentStateProvider()


def get_provider() -> AgentStateProvider:
    return _provider
