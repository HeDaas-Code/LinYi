"""Metabolism module for the novelist brain prototype."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass


@dataclass
class MetabolismState:
    """Snapshot of the novelist agent's metabolic resources."""

    energy: float = 80.0
    compute_budget: float = 80.0
    time_currency: float = 80.0
    social_capital: float = 50.0
    exhausted: bool = False
    max_energy: float = 100.0

    def __post_init__(self) -> None:
        self.max_energy = self._clamp(self.max_energy, 1.0, 1000.0)
        self.energy = self._clamp(self.energy, 0.0, self.max_energy)
        self.compute_budget = self._clamp(self.compute_budget, 0.0, self.max_energy)
        self.time_currency = self._clamp(self.time_currency, 0.0, self.max_energy)
        self.social_capital = self._clamp(self.social_capital, 0.0, 100.0)

    @staticmethod
    def _clamp(value: float, low: float, high: float) -> float:
        return max(low, min(high, value))


class Metabolism(Module):
    """Tracks and manages the agent's metabolic resources.

    The metabolism module enforces the "life cost" principle: every cognitive
    action consumes energy and compute budget.  It restores resources during
    rest phases and warns the system when budgets are exhausted.
    """

    ENERGY_LOW_THRESHOLD: float = 20.0
    COMPUTE_LOW_THRESHOLD: float = 20.0

    PHASE_RECOVERY: dict[str, float] = {
        "deep_night": 2.0,
        "incubation": 1.0,
        "reflection": 0.5,
        "morning": 0.5,
        "social": -0.2,
        "simulation": -0.8,
        "creation": -1.5,
    }

    PHASE_COMPUTE_RECOVERY: dict[str, float] = {
        "deep_night": 1.5,
        "incubation": 1.0,
        "reflection": 0.5,
        "morning": 0.5,
        "social": -0.2,
        "simulation": -1.0,
        "creation": -1.2,
    }

    COST_TABLE: dict[str, dict[str, float]] = {
        "cen": {"energy": 1.5, "compute": 2.0, "time": 0.8},
        "sandbox": {"energy": 2.0, "compute": 2.5, "time": 1.0},
        "dmn": {"energy": 0.2, "compute": 0.3, "time": 0.2},
        "sn": {"energy": 0.5, "compute": 0.5, "time": 0.2},
        "creation": {"energy": 1.8, "compute": 1.5, "time": 1.2},
        "social": {"energy": 0.8, "compute": 0.6, "time": 0.8},
        "memory": {"energy": 1.0, "compute": 1.5, "time": 0.5},
        "identity": {"energy": 0.1, "compute": 0.1, "time": 0.1},
        "default": {"energy": 1.0, "compute": 1.0, "time": 0.5},
    }

    def __init__(self, name: str = "metabolism") -> None:
        super().__init__(name)
        self._metabolism = MetabolismState()
        self.subscribe(
            "control.metabolism.allocate",
            "event.module.consume",
            "control.module.init",
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={"warning_issued": False, "tick_count": 0},
        )

    @property
    def resources(self) -> MetabolismState:
        return self._metabolism

    def get_state(self) -> ModuleState:
        """Return the current module state including metabolic snapshot."""
        state = super().get_state()
        state.custom["metabolism"] = {
            "energy": self._metabolism.energy,
            "compute_budget": self._metabolism.compute_budget,
            "time_currency": self._metabolism.time_currency,
            "social_capital": self._metabolism.social_capital,
            "exhausted": self._metabolism.exhausted,
        }
        return state

    def to_dict(self) -> dict[str, Any]:
        """Serialize metabolism state."""
        base = super().to_dict()
        base["resources"] = dataclass_to_dict(self._metabolism)
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore metabolism state."""
        super().from_dict(data, **kwargs)
        resources = data.get("resources")
        if resources:
            self._metabolism = reconstruct_dataclass(MetabolismState, resources)

    def init(self, context: dict[str, Any]) -> None:
        """Initialize resources from context overrides."""
        metabolism_data = context.get("metabolism", {})
        self._metabolism = MetabolismState(**metabolism_data)
        self._state.custom.setdefault("warning_issued", False)
        self._state.custom.setdefault("tick_count", 0)

    def on_bus_message(self, message: BusMessage) -> None:
        """Handle allocation requests and consumption reports."""
        if message.topic == "control.metabolism.allocate":
            self._handle_allocate(message.payload or {})
        elif message.topic == "event.module.consume":
            self._handle_consume(message.payload or {})

    def _handle_allocate(self, payload: dict[str, Any]) -> None:
        """Apply a budget allocation request."""
        allocations = payload.get("allocate", payload)
        if isinstance(allocations, dict):
            self._apply_change(
                energy=allocations.get("energy", 0.0),
                compute=allocations.get("compute", 0.0),
                time=allocations.get("time", 0.0),
                social=allocations.get("social", 0.0),
            )

    def _handle_consume(self, payload: dict[str, Any]) -> None:
        """Process a module consumption report."""
        module = str(payload.get("module", "default")).lower()
        cost_type = str(payload.get("cost_type", "energy")).lower()
        amount = float(payload.get("amount", 1.0))

        table = self.COST_TABLE.get(module, self.COST_TABLE["default"])
        cost = table.get(cost_type, table.get("energy", 1.0)) * amount

        energy_cost = cost if cost_type == "energy" else table.get("energy", 1.0) * amount
        compute_cost = cost if cost_type == "compute" else table.get("compute", 1.0) * amount
        time_cost = cost if cost_type == "time" else table.get("time", 0.5) * amount
        social_cost = cost if cost_type == "social" else 0.0

        self._apply_change(
            energy=-abs(energy_cost),
            compute=-abs(compute_cost),
            time=-abs(time_cost),
            social=-abs(social_cost),
        )

    def tick(self, delta: TickDelta) -> None:
        """Advance metabolism by one tick and broadcast state."""
        phase = delta.phase
        self._state.custom["tick_count"] += 1
        self._state.custom["last_phase"] = phase

        energy_recovery = self.PHASE_RECOVERY.get(phase, 0.0)
        compute_recovery = self.PHASE_COMPUTE_RECOVERY.get(phase, 0.0)

        self._apply_change(
            energy=energy_recovery,
            compute=compute_recovery,
            time=-0.1,
        )

        self._metabolism.exhausted = (
            self._metabolism.energy < self.ENERGY_LOW_THRESHOLD
            or self._metabolism.compute_budget < self.COMPUTE_LOW_THRESHOLD
        )

        self._broadcast_state()

        if self._metabolism.exhausted and not self._state.custom["warning_issued"]:
            self._broadcast_exhausted()
            self._state.custom["warning_issued"] = True
        elif not self._metabolism.exhausted:
            self._state.custom["warning_issued"] = False

    def _apply_change(
        self,
        energy: float = 0.0,
        compute: float = 0.0,
        time: float = 0.0,
        social: float = 0.0,
    ) -> None:
        """Apply a signed change to resources and clamp to valid ranges."""
        self._metabolism.energy = self._clamp(
            self._metabolism.energy + energy, 0.0, 100.0
        )
        self._metabolism.compute_budget = self._clamp(
            self._metabolism.compute_budget + compute, 0.0, 100.0
        )
        self._metabolism.time_currency = self._clamp(
            self._metabolism.time_currency + time, 0.0, 100.0
        )
        self._metabolism.social_capital = self._clamp(
            self._metabolism.social_capital + social, 0.0, 100.0
        )

    @staticmethod
    def _clamp(value: float, low: float, high: float) -> float:
        return max(low, min(high, value))

    def _broadcast_state(self) -> None:
        self.emit(
            topic="data.metabolism.state",
            payload={
                "energy": self._metabolism.energy,
                "compute_budget": self._metabolism.compute_budget,
                "time_currency": self._metabolism.time_currency,
                "social_capital": self._metabolism.social_capital,
                "exhausted": self._metabolism.exhausted,
            },
            channel="data",
            priority=5,
            ttl=3,
        )

    def _broadcast_exhausted(self) -> None:
        self.emit(
            topic="control.metabolism.budget.exhausted",
            payload={
                "energy": self._metabolism.energy,
                "compute_budget": self._metabolism.compute_budget,
                "threshold": self.ENERGY_LOW_THRESHOLD,
                "phase": self._state.custom.get("last_phase"),
            },
            channel="control",
            priority=8,
            ttl=5,
        )
