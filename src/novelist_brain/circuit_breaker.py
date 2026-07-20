"""Circuit breaker for LLM and other external service calls.

Follows Design.md section 20.7.1: closed → open → half_open state machine.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreaker:
    """A simple circuit breaker for transient service failures."""

    service: str = "llm"
    state: CircuitState = CircuitState.CLOSED
    failure_threshold: int = 3
    recovery_timeout_ms: int = 30000
    half_open_max_calls: int = 2

    _failure_count: int = field(default=0, repr=False)
    _success_count: int = field(default=0, repr=False)
    _half_open_calls: int = field(default=0, repr=False)
    _opened_at_ms: int = field(default=0, repr=False)
    _history: list[bool] = field(default_factory=list, repr=False)

    def can_execute(self) -> bool:
        """Return True if a new call is allowed through the breaker."""
        now = self._now_ms()
        if self.state == CircuitState.OPEN:
            if now - self._opened_at_ms >= self.recovery_timeout_ms:
                self.state = CircuitState.HALF_OPEN
                self._half_open_calls = 0
                self._success_count = 0
                self._failure_count = 0
                return True
            return False
        if self.state == CircuitState.HALF_OPEN:
            return self._half_open_calls < self.half_open_max_calls
        return True

    def record_success(self) -> None:
        """Record a successful call."""
        self._history.append(True)
        if self.state == CircuitState.HALF_OPEN:
            self._success_count += 1
            self._half_open_calls += 1
            if self._success_count >= self.half_open_max_calls:
                self._close()
        else:
            self._failure_count = 0

    def record_failure(self) -> None:
        """Record a failed call."""
        self._history.append(False)
        if self.state == CircuitState.HALF_OPEN:
            self._failure_count += 1
            self._half_open_calls += 1
            self._open()
            return

        self._failure_count += 1
        if self._failure_count >= self.failure_threshold:
            self._open()

    def _open(self) -> None:
        self.state = CircuitState.OPEN
        self._opened_at_ms = self._now_ms()
        self._half_open_calls = 0
        self._success_count = 0

    def _close(self) -> None:
        self.state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0
        self._opened_at_ms = 0

    @staticmethod
    def _now_ms() -> int:
        return int(time.time() * 1000)

    def recent_failure_rate(self, window: int = 10) -> float:
        """Return the failure rate over the last ``window`` results."""
        recent = self._history[-window:]
        if not recent:
            return 0.0
        return sum(1 for r in recent if not r) / len(recent)

    def to_dict(self) -> dict[str, Any]:
        return {
            "service": self.service,
            "state": self.state.value,
            "failure_threshold": self.failure_threshold,
            "recovery_timeout_ms": self.recovery_timeout_ms,
            "half_open_max_calls": self.half_open_max_calls,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "half_open_calls": self._half_open_calls,
            "opened_at_ms": self._opened_at_ms,
            "recent_failure_rate": self.recent_failure_rate(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CircuitBreaker:
        cb = cls(
            service=data.get("service", "llm"),
            state=CircuitState(data.get("state", CircuitState.CLOSED.value)),
            failure_threshold=data.get("failure_threshold", 3),
            recovery_timeout_ms=data.get("recovery_timeout_ms", 30000),
            half_open_max_calls=data.get("half_open_max_calls", 2),
        )
        cb._failure_count = data.get("failure_count", 0)
        cb._success_count = data.get("success_count", 0)
        cb._half_open_calls = data.get("half_open_calls", 0)
        cb._opened_at_ms = data.get("opened_at_ms", 0)
        return cb
