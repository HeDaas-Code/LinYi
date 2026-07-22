# -*- coding: utf-8 -*-
"""Tests for TokenBudget."""
from __future__ import annotations

from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.token_budget import (
    TOPIC_BUDGET_EXHAUSTED,
    TOPIC_BUDGET_RESET,
    TOPIC_BUDGET_WARNING,
    TokenBudget,
    TokenBudgetLimits,
)


def _tick(now: float, phase: str = "incubation") -> TickDelta:
    return TickDelta(
        absolute_time=now,
        delta_ms=1000.0,
        phase=phase,
    )


def test_tracks_llm_call_tokens() -> None:
    router = BusRouter()
    budget = TokenBudget(name="token_budget")
    budget.register(router)
    budget.init({})
    msg = BusMessage(
        source="llm",
        topic="llm.call.completed",
        channel="event",
        payload={"input_tokens": 100, "output_tokens": 50},
    )
    budget.on_bus_message(msg)
    assert budget._state.custom["daily_total"] == 150


def test_can_spend_respects_limits() -> None:
    limits = TokenBudgetLimits(daily_total=200)
    budget = TokenBudget(name="token_budget", limits=limits)
    budget.init({})
    assert budget.can_spend(input_tokens=50, output_tokens=50) is True
    assert budget.can_spend(input_tokens=150, output_tokens=100) is False


def test_warning_and_exhausted_events() -> None:
    router = BusRouter()
    limits = TokenBudgetLimits(daily_total=100)
    budget = TokenBudget(name="token_budget", limits=limits)
    budget.register(router)
    budget.init({})

    class _SpyModule(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[BusMessage] = []
            self.subscribe(TOPIC_BUDGET_WARNING)
            self.subscribe(TOPIC_BUDGET_EXHAUSTED)
            self.subscribe(TOPIC_BUDGET_RESET)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: BusMessage) -> None:
            self.messages.append(message)

        def tick(self, delta: TickDelta) -> None:
            return None

    spy = _SpyModule()
    router.subscribe(spy)

    budget.on_bus_message(
        BusMessage(
            source="llm",
            topic="llm.call.completed",
            channel="event",
            payload={"input_tokens": 85, "output_tokens": 0},
        )
    )
    budget.on_bus_message(
        BusMessage(
            source="llm",
            topic="llm.call.completed",
            channel="event",
            payload={"input_tokens": 20, "output_tokens": 0},
        )
    )
    router.flush()

    topics = [m.topic for m in spy.messages]
    assert TOPIC_BUDGET_WARNING in topics
    assert TOPIC_BUDGET_EXHAUSTED in topics


def test_daily_rollover_emits_reset() -> None:
    router = BusRouter()
    limits = TokenBudgetLimits(daily_total=100)
    budget = TokenBudget(name="token_budget", limits=limits)
    budget.register(router)
    budget.init({})

    class _SpyModule(Module):
        def __init__(self) -> None:
            super().__init__("spy")
            self.messages: list[BusMessage] = []
            self.subscribe(TOPIC_BUDGET_RESET)

        def init(self, context: dict[str, Any]) -> None:
            return None

        def on_bus_message(self, message: BusMessage) -> None:
            self.messages.append(message)

        def tick(self, delta: TickDelta) -> None:
            return None

    spy = _SpyModule()
    router.subscribe(spy)

    # Start at the beginning of an arbitrary day.
    day_start = 86400.0
    budget._consume(50, 0)
    budget._daily.started_at = day_start
    budget.tick(_tick(day_start + 86400))
    router.flush()

    assert any(m.topic == TOPIC_BUDGET_RESET for m in spy.messages)
    assert budget._state.custom["daily_total"] == 0


def test_serialization_roundtrip() -> None:
    limits = TokenBudgetLimits(daily_total=1000, hourly_total=100)
    budget = TokenBudget(name="token_budget", limits=limits)
    budget.register(BusRouter())
    budget._consume(123, 45)
    snapshot = budget.to_dict()

    budget2 = TokenBudget(name="token_budget")
    budget2.from_dict(snapshot)
    assert budget2._limits.daily_total == 1000
    assert budget2._daily.total_tokens == 168
