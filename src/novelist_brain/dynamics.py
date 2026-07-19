"""Dynamics module for the novelist brain prototype."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


@dataclass
class DynamicsState:
    """Snapshot of reward prediction and habit dynamics."""

    reward_prediction_error: float = 0.0
    punishment_prediction_error: float = 0.0
    habit_strengths: dict[str, float] = field(default_factory=dict)
    value_function: dict[str, float] = field(default_factory=dict)
    last_outcome: dict[str, Any] = field(default_factory=dict)


class Dynamics(Module):
    """Computes reward/punishment prediction errors and updates habits.

    The dynamics module translates external outcomes and internal creations
    into prediction-error signals.  Positive outcomes strengthen the habits
    that produced them; negative outcomes weaken them.
    """

    HABIT_NAMES: set[str] = {"creation", "social", "simulation", "reflection", "memory"}
    LEARNING_RATE: float = 0.1
    DECAY: float = 0.005
    POSITIVE_OUTCOME_WORDS: set[str] = {
        "success",
        "win",
        "gain",
        "growth",
        "breakthrough",
        "resolved",
        "harmony",
        "joy",
        "triumph",
        "peace",
        "accomplished",
        "completed",
    }
    NEGATIVE_OUTCOME_WORDS: set[str] = {
        "failure",
        "loss",
        "defeat",
        "conflict",
        "unresolved",
        "disaster",
        "despair",
        "regret",
        "frustration",
        "stagnation",
        "blocked",
        "abandoned",
    }

    def __init__(self, name: str = "dynamics") -> None:
        super().__init__(name)
        self._dynamics = DynamicsState()
        self._initialize_habits()
        self.subscribe(
            "data.sandbox.event.resolved",
            "data.novel.paragraph",
            "control.module.init",
        )

    def _initialize_habits(self) -> None:
        for habit in self.HABIT_NAMES:
            self._dynamics.habit_strengths.setdefault(habit, 0.5)

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={"event_count": 0, "paragraph_count": 0},
        )

    @property
    def dynamics(self) -> DynamicsState:
        return self._dynamics

    def get_state(self) -> ModuleState:
        """Return the current module state including dynamics snapshot."""
        state = super().get_state()
        state.custom["dynamics"] = {
            "reward_prediction_error": self._dynamics.reward_prediction_error,
            "punishment_prediction_error": self._dynamics.punishment_prediction_error,
            "habit_strengths": dict(self._dynamics.habit_strengths),
            "value_function": dict(self._dynamics.value_function),
        }
        return state

    def init(self, context: dict[str, Any]) -> None:
        """Initialize dynamics state from context overrides."""
        dynamics_data = context.get("dynamics", {})
        self._dynamics = DynamicsState(**dynamics_data)
        self._initialize_habits()
        self._state.custom["event_count"] = 0
        self._state.custom["paragraph_count"] = 0

    def on_bus_message(self, message: BusMessage) -> None:
        """Handle resolved sandbox events and published novel paragraphs."""
        if message.topic == "data.sandbox.event.resolved":
            self._handle_sandbox_event(message.payload or {})
        elif message.topic == "data.novel.paragraph":
            self._handle_novel_paragraph(message.payload or {})

    def _handle_sandbox_event(self, payload: dict[str, Any]) -> None:
        """Compute RPE from a sandbox event outcome."""
        outcome = str(payload.get("outcome", "")).lower()
        emotional_shift = float(payload.get("emotional_shift", 0.0))
        behavior = str(payload.get("behavior", "simulation")).lower()

        rpe = self._compute_rpe(outcome, emotional_shift)
        self._update_dynamics(rpe, behavior, source="sandbox")
        self._state.custom["event_count"] += 1
        self._broadcast_rpe(rpe, behavior, "sandbox")

    def _handle_novel_paragraph(self, payload: dict[str, Any]) -> None:
        """Compute RPE from a published novel paragraph."""
        text = str(payload.get("text", payload.get("paragraph", ""))).lower()
        emotional_shift = float(payload.get("emotional_shift", 0.0))

        rpe = self._compute_rpe(text, emotional_shift)
        self._update_dynamics(rpe, "creation", source="novel")
        self._state.custom["paragraph_count"] += 1
        self._broadcast_rpe(rpe, "creation", "novel")

    def _compute_rpe(self, outcome_text: str, emotional_shift: float) -> float:
        """Return a scalar reward prediction error for an outcome."""
        text = outcome_text.lower()
        positive_hits = sum(1 for word in self.POSITIVE_OUTCOME_WORDS if word in text)
        negative_hits = sum(1 for word in self.NEGATIVE_OUTCOME_WORDS if word in text)

        base_signal = 0.0
        if positive_hits or negative_hits:
            base_signal = (positive_hits - negative_hits) / max(
                positive_hits + negative_hits, 1
            )
        else:
            base_signal = 0.1 if emotional_shift > 0 else -0.1 if emotional_shift < 0 else 0.0

        # Blend explicit emotional shift with lexical signal.
        emotional_shift = max(-1.0, min(1.0, emotional_shift))
        rpe = 0.6 * base_signal + 0.4 * emotional_shift
        return float(round(max(-1.0, min(1.0, rpe)), 4))

    def _update_dynamics(self, rpe: float, behavior: str, source: str) -> None:
        """Update value function and habit strengths using the RPE."""
        if rpe >= 0:
            self._dynamics.reward_prediction_error = rpe
            self._dynamics.punishment_prediction_error = max(
                0.0, self._dynamics.punishment_prediction_error - abs(rpe) * 0.5
            )
        else:
            self._dynamics.punishment_prediction_error = abs(rpe)
            self._dynamics.reward_prediction_error = max(
                0.0, self._dynamics.reward_prediction_error - abs(rpe) * 0.5
            )

        self._dynamics.value_function[source] = self._moving_average(
            self._dynamics.value_function.get(source, 0.0), rpe
        )

        if behavior in self.HABIT_NAMES:
            current = self._dynamics.habit_strengths.get(behavior, 0.5)
            delta = self.LEARNING_RATE * rpe
            self._dynamics.habit_strengths[behavior] = float(
                round(max(0.0, min(1.0, current + delta)), 4)
            )
            self._broadcast_habit_update(behavior, self._dynamics.habit_strengths[behavior], rpe)

    def _moving_average(self, current: float, new_value: float) -> float:
        """Update an expected value estimate with a new sample."""
        return float(round(current + self.LEARNING_RATE * (new_value - current), 4))

    def tick(self, delta: TickDelta) -> None:
        """Apply gentle habit decay on each tick."""
        for habit in list(self._dynamics.habit_strengths):
            current = self._dynamics.habit_strengths[habit]
            # Decay toward neutral 0.5.
            if current > 0.5:
                new_value = max(0.5, current - self.DECAY)
            elif current < 0.5:
                new_value = min(0.5, current + self.DECAY)
            else:
                new_value = current
            self._dynamics.habit_strengths[habit] = float(round(new_value, 4))

    def _broadcast_rpe(self, rpe: float, behavior: str, source: str) -> None:
        self.emit(
            topic="data.dynamics.rpe",
            payload={
                "rpe": rpe,
                "behavior": behavior,
                "source": source,
                "reward_prediction_error": self._dynamics.reward_prediction_error,
                "punishment_prediction_error": self._dynamics.punishment_prediction_error,
            },
            channel="data",
            priority=5,
            ttl=3,
        )

    def _broadcast_habit_update(
        self, behavior: str, strength: float, rpe: float
    ) -> None:
        self.emit(
            topic="data.dynamics.habit.updated",
            payload={
                "behavior": behavior,
                "strength": strength,
                "rpe": rpe,
                "habit_strengths": dict(self._dynamics.habit_strengths),
            },
            channel="data",
            priority=5,
            ttl=3,
        )
