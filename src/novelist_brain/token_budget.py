"""TokenBudget: track and throttle LLM token consumption.

The module subscribes to ``llm.call.completed`` events, aggregates input/output
tokens by day and hour, and emits control events when configured thresholds are
approached or exceeded.  Other modules can query ``can_spend`` before issuing an
LLM call to avoid busting the budget.

This is intentionally a coarse guardrail: it counts tokens reported by the LLM
service rather than predicting prompt cost up front.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


#: Topic emitted when the daily budget is close to exhaustion.
TOPIC_BUDGET_WARNING = "control.token_budget.warning"

#: Topic emitted when the daily budget is exhausted.
TOPIC_BUDGET_EXHAUSTED = "control.token_budget.exhausted"

#: Topic emitted when a new budgeting day starts.
TOPIC_BUDGET_RESET = "control.token_budget.reset"


@dataclass
class TokenBudgetLimits:
    """Budget thresholds expressed in tokens.  Zero means unlimited."""

    daily_input: int = 0
    daily_output: int = 0
    daily_total: int = 0
    hourly_input: int = 0
    hourly_output: int = 0
    hourly_total: int = 0


@dataclass
class TokenWindow:
    """Tokens consumed inside a fixed time window."""

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    started_at: float = 0.0

    def add(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self.total_tokens += input_tokens + output_tokens

    def reset(self, started_at: float) -> None:
        self.input_tokens = 0
        self.output_tokens = 0
        self.total_tokens = 0
        self.started_at = started_at


class TokenBudget(Module):
    """Guardrail for daily/hourly LLM token spend."""

    DEFAULT_WARNING_RATIO = 0.80

    def __init__(
        self,
        name: str = "token_budget",
        *,
        limits: TokenBudgetLimits | None = None,
        warning_ratio: float = DEFAULT_WARNING_RATIO,
    ) -> None:
        super().__init__(name)
        self._limits = limits or TokenBudgetLimits()
        self._warning_ratio = max(0.0, min(1.0, float(warning_ratio)))
        now = time.time()
        self._daily = TokenWindow(started_at=self._day_start(now))
        self._hourly = TokenWindow(started_at=self._hour_start(now))
        self._warning_issued_today = False
        self._exhausted_issued_today = False
        self.subscribe("llm.call.completed")

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "token_budget",
            "version": "0.1.0",
            "description": "Track and throttle LLM token consumption",
            "dependencies": [],
            "category": "guardrail",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "daily_input": 0,
                "daily_output": 0,
                "daily_total": 0,
                "hourly_total": 0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def limits(self) -> TokenBudgetLimits:
        return self._limits

    def set_limits(self, limits: TokenBudgetLimits) -> None:
        self._limits = limits

    def can_spend(
        self,
        input_tokens: int = 0,
        output_tokens: int = 0,
        now: float | None = None,
    ) -> bool:
        """Return True if the requested spend stays within all budgets."""
        now = now if now is not None else time.time()
        self._rollover(now)
        total = input_tokens + output_tokens
        if self._limits.daily_total > 0:
            if self._daily.total_tokens + total > self._limits.daily_total:
                return False
        if self._limits.daily_input > 0:
            if self._daily.input_tokens + input_tokens > self._limits.daily_input:
                return False
        if self._limits.daily_output > 0:
            if self._daily.output_tokens + output_tokens > self._limits.daily_output:
                return False
        if self._limits.hourly_total > 0:
            if self._hourly.total_tokens + total > self._limits.hourly_total:
                return False
        if self._limits.hourly_input > 0:
            if self._hourly.input_tokens + input_tokens > self._limits.hourly_input:
                return False
        if self._limits.hourly_output > 0:
            if self._hourly.output_tokens + output_tokens > self._limits.hourly_output:
                return False
        return True

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("token_budget", {})
        limits = cfg.get("limits")
        if isinstance(limits, dict):
            self._limits = TokenBudgetLimits(**limits)
        warning_ratio = cfg.get("warning_ratio")
        if isinstance(warning_ratio, (int, float)):
            self._warning_ratio = max(0.0, min(1.0, float(warning_ratio)))

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        if message.topic != "llm.call.completed":
            return
        payload = message.payload or {}
        input_tokens = int(payload.get("input_tokens", 0) or 0)
        output_tokens = int(payload.get("output_tokens", 0) or 0)
        self._consume(input_tokens, output_tokens)

    def tick(self, delta: TickDelta) -> None:
        now = delta.absolute_time
        self._rollover(now)
        self._update_state_custom()

    # ------------------------------------------------------------------
    # Internal accounting
    # ------------------------------------------------------------------

    def _consume(self, input_tokens: int, output_tokens: int) -> None:
        now = time.time()
        self._rollover(now)
        self._daily.add(input_tokens, output_tokens)
        self._hourly.add(input_tokens, output_tokens)
        self._update_state_custom()
        self._check_thresholds(now)

    def _rollover(self, now: float) -> None:
        day_started_at = self._day_start(now)
        if self._daily.started_at != day_started_at:
            self._daily.reset(day_started_at)
            self._warning_issued_today = False
            self._exhausted_issued_today = False
            self.emit(
                topic=TOPIC_BUDGET_RESET,
                payload={"timestamp": now},
                channel="control",
                priority=5,
                ttl=3,
            )

        hour_started_at = self._hour_start(now)
        if self._hourly.started_at != hour_started_at:
            self._hourly.reset(hour_started_at)

    def _check_thresholds(self, now: float) -> None:
        if self._limits.daily_total <= 0:
            return

        ratio = self._daily.total_tokens / self._limits.daily_total
        if ratio >= 1.0 and not self._exhausted_issued_today:
            self._exhausted_issued_today = True
            self.emit(
                topic=TOPIC_BUDGET_EXHAUSTED,
                payload={
                    "daily_total": self._daily.total_tokens,
                    "limit": self._limits.daily_total,
                    "timestamp": now,
                },
                channel="control",
                priority=8,
                ttl=5,
            )
        elif ratio >= self._warning_ratio and not self._warning_issued_today:
            self._warning_issued_today = True
            self.emit(
                topic=TOPIC_BUDGET_WARNING,
                payload={
                    "daily_total": self._daily.total_tokens,
                    "limit": self._limits.daily_total,
                    "ratio": ratio,
                    "timestamp": now,
                },
                channel="control",
                priority=6,
                ttl=5,
            )

    def _update_state_custom(self) -> None:
        self._state.custom.update(
            {
                "daily_input": self._daily.input_tokens,
                "daily_output": self._daily.output_tokens,
                "daily_total": self._daily.total_tokens,
                "hourly_total": self._hourly.total_tokens,
            }
        )

    @staticmethod
    def _day_start(now: float) -> float:
        # Align to local midnight.  Production deployments that want UTC can
        # adjust the offset before passing ``now``.
        return now - (now % 86400)

    @staticmethod
    def _hour_start(now: float) -> float:
        return now - (now % 3600)

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "limits": {
                    "daily_input": self._limits.daily_input,
                    "daily_output": self._limits.daily_output,
                    "daily_total": self._limits.daily_total,
                    "hourly_input": self._limits.hourly_input,
                    "hourly_output": self._limits.hourly_output,
                    "hourly_total": self._limits.hourly_total,
                },
                "warning_ratio": self._warning_ratio,
                "daily": {
                    "input_tokens": self._daily.input_tokens,
                    "output_tokens": self._daily.output_tokens,
                    "total_tokens": self._daily.total_tokens,
                    "started_at": self._daily.started_at,
                },
                "hourly": {
                    "input_tokens": self._hourly.input_tokens,
                    "output_tokens": self._hourly.output_tokens,
                    "total_tokens": self._hourly.total_tokens,
                    "started_at": self._hourly.started_at,
                },
                "warning_issued_today": self._warning_issued_today,
                "exhausted_issued_today": self._exhausted_issued_today,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        limits_data = data.get("limits")
        if isinstance(limits_data, dict):
            self._limits = TokenBudgetLimits(**limits_data)
        self._warning_ratio = float(
            data.get("warning_ratio", self.DEFAULT_WARNING_RATIO)
        )
        for window_name, window in (("daily", self._daily), ("hourly", self._hourly)):
            wdata = data.get(window_name)
            if isinstance(wdata, dict):
                window.input_tokens = int(wdata.get("input_tokens", 0))
                window.output_tokens = int(wdata.get("output_tokens", 0))
                window.total_tokens = int(wdata.get("total_tokens", 0))
                window.started_at = float(wdata.get("started_at", 0.0))
        self._warning_issued_today = bool(data.get("warning_issued_today", False))
        self._exhausted_issued_today = bool(data.get("exhausted_issued_today", False))
        self._update_state_custom()


__all__ = [
    "TokenBudget",
    "TokenBudgetLimits",
    "TokenWindow",
    "TOPIC_BUDGET_WARNING",
    "TOPIC_BUDGET_EXHAUSTED",
    "TOPIC_BUDGET_RESET",
]
