"""Fault and recovery data models for the novelist brain.

This module defines the universal error vocabulary used by all modules when
reporting failures to the control bus.  It follows Design.md section 20.
"""

from __future__ import annotations

import enum
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


class ErrorType(str, enum.Enum):
    """Canonical error types used in ``AgentError``."""

    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_MALFORMED_RESPONSE = "LLM_MALFORMED_RESPONSE"
    LLM_RATE_LIMIT = "LLM_RATE_LIMIT"
    LLM_CONTENT_FILTERED = "LLM_CONTENT_FILTERED"
    LLM_UNREACHABLE = "LLM_UNREACHABLE"
    MEMORY_CORRUPTION = "MEMORY_CORRUPTION"
    MEMORY_LOSS = "MEMORY_LOSS"
    SANDBOX_DIVERGENCE = "SANDBOX_DIVERGENCE"
    METABOLISM_COLLAPSE = "METABOLISM_COLLAPSE"
    BUS_CONGESTION = "BUS_CONGESTION"
    PERSISTENCE_FAILURE = "PERSISTENCE_FAILURE"
    IDENTITY_INCONSISTENCY = "IDENTITY_INCONSISTENCY"
    MODULE_EXCEPTION = "MODULE_EXCEPTION"
    UNKNOWN = "UNKNOWN"


class RecoveryStrategy(str, enum.Enum):
    """Self-healing and degradation strategies."""

    RETRY = "retry"
    ROLLBACK = "rollback"
    RESTART_MODULE = "restart_module"
    SWITCH_NETWORK = "switch_network"
    SNAPSHOT_RESTORE = "snapshot_restore"
    MEMORY_RECONSTRUCT = "memory_reconstruct"
    DEGRADE = "degrade"
    SAFE_MODE = "safe_mode"


class Severity(str, enum.Enum):
    """Error severity levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class RetryPolicy:
    """Retry policy for transient errors."""

    max_attempts: int = 3
    base_delay_ms: int = 500
    max_delay_ms: int = 8000
    backoff_strategy: str = "exponential"  # fixed | linear | exponential
    retryable_errors: list[ErrorType] = field(default_factory=list)
    on_exhausted: str = "degrade"  # escalate | degrade | snapshot

    def __post_init__(self) -> None:
        if not self.retryable_errors:
            self.retryable_errors = [
                ErrorType.LLM_TIMEOUT,
                ErrorType.LLM_RATE_LIMIT,
                ErrorType.LLM_UNREACHABLE,
                ErrorType.PERSISTENCE_FAILURE,
            ]

    def delay_ms(self, attempt: int) -> int:
        """Return the delay before attempt ``attempt`` (1-based)."""
        if self.backoff_strategy == "fixed":
            return self.base_delay_ms
        if self.backoff_strategy == "linear":
            return min(self.base_delay_ms * attempt, self.max_delay_ms)
        # exponential
        return min(self.base_delay_ms * (2 ** (attempt - 1)), self.max_delay_ms)

    def should_retry(self, error_type: ErrorType, attempt: int) -> bool:
        """Return True if the error is retryable and attempts remain."""
        if error_type == ErrorType.IDENTITY_INCONSISTENCY:
            return False
        if error_type not in self.retryable_errors:
            return False
        return attempt < self.max_attempts

    def to_dict(self) -> dict[str, Any]:
        return {
            "max_attempts": self.max_attempts,
            "base_delay_ms": self.base_delay_ms,
            "max_delay_ms": self.max_delay_ms,
            "backoff_strategy": self.backoff_strategy,
            "retryable_errors": [e.value for e in self.retryable_errors],
            "on_exhausted": self.on_exhausted,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RetryPolicy:
        retryable = data.get("retryable_errors", [])
        return cls(
            max_attempts=data.get("max_attempts", 3),
            base_delay_ms=data.get("base_delay_ms", 500),
            max_delay_ms=data.get("max_delay_ms", 8000),
            backoff_strategy=data.get("backoff_strategy", "exponential"),
            retryable_errors=[ErrorType(e) for e in retryable] if retryable else [],
            on_exhausted=data.get("on_exhausted", "degrade"),
        )


@dataclass
class MetabolicCost:
    """Estimated metabolic cost of a recovery action."""

    energy: float = 0.0
    compute_budget: float = 0.0
    time_currency: float = 0.0
    social_capital: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return {
            "energy": self.energy,
            "compute_budget": self.compute_budget,
            "time_currency": self.time_currency,
            "social_capital": self.social_capital,
        }


@dataclass
class AgentError:
    """A single error event published on the control bus."""

    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: int = field(default_factory=lambda: int(time.time() * 1000))
    source: str = ""
    channel: str = "control"
    topic: str = ""
    type: ErrorType = ErrorType.UNKNOWN
    severity: Severity = Severity.MEDIUM
    message: str = ""
    payload: Any = None
    recoverable: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "source": self.source,
            "channel": self.channel,
            "topic": self.topic,
            "type": self.type.value,
            "severity": self.severity.value,
            "message": self.message,
            "payload": self.payload,
            "recoverable": self.recoverable,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AgentError:
        return cls(
            id=data.get("id", str(uuid.uuid4())[:8]),
            timestamp=data.get("timestamp", int(time.time() * 1000)),
            source=data.get("source", ""),
            channel=data.get("channel", "control"),
            topic=data.get("topic", ""),
            type=ErrorType(data.get("type", ErrorType.UNKNOWN.value)),
            severity=Severity(data.get("severity", Severity.MEDIUM.value)),
            message=data.get("message", ""),
            payload=data.get("payload"),
            recoverable=data.get("recoverable", True),
        )


def classify_exception(exc: Exception) -> tuple[ErrorType, Severity]:
    """Map a Python exception to an ErrorType and Severity."""
    message = str(exc).lower()
    if "timeout" in message:
        return ErrorType.LLM_TIMEOUT, Severity.HIGH
    if "rate" in message or "429" in message:
        return ErrorType.LLM_RATE_LIMIT, Severity.HIGH
    if "content filter" in message or "filtered" in message:
        return ErrorType.LLM_CONTENT_FILTERED, Severity.MEDIUM
    if "connection" in message or "unreachable" in message:
        return ErrorType.LLM_UNREACHABLE, Severity.HIGH
    if "json" in message or "malformed" in message or "parse" in message:
        return ErrorType.LLM_MALFORMED_RESPONSE, Severity.MEDIUM
    if "memory" in message or "corrupt" in message:
        return ErrorType.MEMORY_CORRUPTION, Severity.HIGH
    if "persist" in message or "snapshot" in message or "disk" in message:
        return ErrorType.PERSISTENCE_FAILURE, Severity.CRITICAL
    if "identity" in message:
        return ErrorType.IDENTITY_INCONSISTENCY, Severity.CRITICAL
    return ErrorType.MODULE_EXCEPTION, Severity.HIGH


@dataclass
class Fault:
    """An assessed fault with impact analysis."""

    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    error_id: str = ""
    source: str = ""
    type: ErrorType = ErrorType.UNKNOWN
    severity: Severity = Severity.MEDIUM
    message: str = ""
    affected_modules: list[str] = field(default_factory=list)
    affected_networks: list[str] = field(default_factory=list)
    scope: str = "module"  # module | network | system
    propagation_path: list[str] = field(default_factory=list)
    persistence_risk: bool = False
    identity_risk: bool = False
    timestamp: int = field(default_factory=lambda: int(time.time() * 1000))

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "error_id": self.error_id,
            "source": self.source,
            "type": self.type.value,
            "severity": self.severity.value,
            "message": self.message,
            "affected_modules": self.affected_modules,
            "affected_networks": self.affected_networks,
            "scope": self.scope,
            "propagation_path": self.propagation_path,
            "persistence_risk": self.persistence_risk,
            "identity_risk": self.identity_risk,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Fault:
        return cls(
            id=data.get("id", str(uuid.uuid4())[:8]),
            error_id=data.get("error_id", ""),
            source=data.get("source", ""),
            type=ErrorType(data.get("type", ErrorType.UNKNOWN.value)),
            severity=Severity(data.get("severity", Severity.MEDIUM.value)),
            message=data.get("message", ""),
            affected_modules=list(data.get("affected_modules", [])),
            affected_networks=list(data.get("affected_networks", [])),
            scope=data.get("scope", "module"),
            propagation_path=list(data.get("propagation_path", [])),
            persistence_risk=bool(data.get("persistence_risk", False)),
            identity_risk=bool(data.get("identity_risk", False)),
            timestamp=data.get("timestamp", int(time.time() * 1000)),
        )


@dataclass
class RecoveryAction:
    """A concrete recovery or degradation action."""

    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    fault_id: str = ""
    strategy: RecoveryStrategy = RecoveryStrategy.RETRY
    target: str = ""  # module name, network name, "system", etc.
    parameters: dict[str, Any] = field(default_factory=dict)
    cost: MetabolicCost = field(default_factory=MetabolicCost)
    fallback: RecoveryAction | None = None
    max_attempts: int = 1
    deadline: int = 0  # timestamp ms; 0 means no deadline
    attempt: int = 0
    status: str = "pending"  # pending | running | succeeded | failed
    result_message: str = ""

    def __post_init__(self) -> None:
        if self.deadline == 0:
            # Default deadline: 30 seconds from creation.
            self.deadline = int(time.time() * 1000) + 30000

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "fault_id": self.fault_id,
            "strategy": self.strategy.value,
            "target": self.target,
            "parameters": self.parameters,
            "cost": self.cost.to_dict(),
            "fallback": self.fallback.to_dict() if self.fallback else None,
            "max_attempts": self.max_attempts,
            "deadline": self.deadline,
            "attempt": self.attempt,
            "status": self.status,
            "result_message": self.result_message,
        }

    def is_expired(self) -> bool:
        if self.deadline <= 0:
            return False
        return int(time.time() * 1000) > self.deadline

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RecoveryAction:
        cost_data = data.get("cost") or {}
        cost = MetabolicCost(**cost_data) if isinstance(cost_data, dict) else MetabolicCost()
        fallback_data = data.get("fallback")
        fallback = cls.from_dict(fallback_data) if isinstance(fallback_data, dict) else None
        return cls(
            id=data.get("id", str(uuid.uuid4())[:8]),
            fault_id=data.get("fault_id", ""),
            strategy=RecoveryStrategy(data.get("strategy", RecoveryStrategy.RETRY.value)),
            target=data.get("target", ""),
            parameters=dict(data.get("parameters", {})),
            cost=cost,
            fallback=fallback,
            max_attempts=data.get("max_attempts", 1),
            deadline=data.get("deadline", 0),
            attempt=data.get("attempt", 0),
            status=data.get("status", "pending"),
            result_message=data.get("result_message", ""),
        )