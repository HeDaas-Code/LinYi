"""Salience network module for the novelist brain prototype."""

from __future__ import annotations

from typing import Any

from src.novelist_brain.models import BusMessage, Fragment, ModuleState, TickDelta
from src.novelist_brain.module import Module


class SalienceNetwork(Module):
    """Scores incoming fragments and switches between DMN and CEN.

    Uses the B=MAT model: ``score = motivation × ability × trigger``.

    * **motivation** is derived from the fragment source and emotional valence.
    * **ability** is the current metabolic energy normalized to [0, 1].
    * **trigger** is the fragment's own salience.

    The network emits ``control.network.switch`` to select the active network
    and broadcasts evaluation snapshots on ``data.sn.evaluation``.  Triggers
    that fail to pass a minimum threshold are reported as rejected.
    """

    SALIENCE_HIGH_THRESHOLD: float = 0.6
    ENERGY_FORCE_DMN: float = 20.0
    MIN_ACCEPTANCE_SCORE: float = 0.05
    CEN_HOLD_TICKS: int = 10

    SOURCE_MOTIVATION: dict[str, float] = {
        "personal": 0.7,
        "social": 0.8,
        "memory": 0.75,
        "dream": 0.9,
        "novel": 0.85,
        "dmn": 0.85,
        "cen": 0.95,
        "sandbox": 0.9,
    }

    CEN_PHASES: set[str] = {"creation", "simulation"}
    DMN_PHASES: set[str] = {"deep_night", "reflection", "incubation"}

    def __init__(self, name: str = "salience_network") -> None:
        self._energy: float = 80.0
        self._phase: str = "deep_night"
        self._personal_state: dict[str, Any] = {}
        self._social_state: dict[str, Any] = {}
        self._last_network: str = "dmn"
        self._evaluation_count: int = 0
        self._cen_hold_ticks: int = 0
        super().__init__(name)
        self.subscribe(
            "fragment.personal.new",
            "fragment.social.new",
            "fragment.memory.new",
            "fragment.dream.new",
            "fragment.reflection.new",
            "fragment.insight.new",
            "fragment.novel.new",
            "fragment.dmn.new",
            "fragment.cen.new",
            "fragment.sandbox.new",
            "data.metabolism.state",
            "data.personal.state",
            "data.social.state",
            "control.module.init",
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "evaluation_count": 0,
                "switch_count": 0,
                "rejected_count": 0,
                "last_network": self._last_network,
                "cen_hold_ticks": self._cen_hold_ticks,
            },
        )

    def init(self, context: dict[str, Any]) -> None:
        """Initialize from context overrides."""
        sn_context = context.get("salience_network", {})
        self._energy = float(sn_context.get("energy", self._energy))
        self._last_network = str(sn_context.get("last_network", self._last_network))

    def on_bus_message(self, message: BusMessage) -> None:
        """Handle fragments, metabolic updates, and input state broadcasts."""
        if message.topic.startswith("fragment.") and message.topic.endswith(".new"):
            self._evaluate_fragment(message.payload, phase=self._phase)
        elif message.topic == "data.metabolism.state":
            payload = message.payload or {}
            self._energy = float(payload.get("energy", self._energy))
        elif message.topic == "data.personal.state":
            self._personal_state = message.payload or {}
        elif message.topic == "data.social.state":
            self._social_state = message.payload or {}

    def tick(self, delta: TickDelta) -> None:
        """Update internal phase tracking and broadcast current evaluation."""
        self._phase = delta.phase
        if self._cen_hold_ticks > 0:
            self._cen_hold_ticks -= 1
        self._state.custom["cen_hold_ticks"] = self._cen_hold_ticks

    def _evaluate_fragment(self, payload: Any, phase: str) -> None:
        """Score a fragment and decide whether to switch networks."""
        fragment = self._to_fragment(payload)
        if fragment is None:
            return

        self._evaluation_count += 1
        self._state.custom["evaluation_count"] = self._evaluation_count

        motivation = self._compute_motivation(fragment)
        ability = self._compute_ability()
        trigger = self._compute_trigger(fragment)
        score = motivation * ability * trigger

        decision = self._decide_network(fragment, score, phase)
        evaluation = {
            "fragment": fragment,
            "motivation": round(motivation, 4),
            "ability": round(ability, 4),
            "trigger": round(trigger, 4),
            "score": round(score, 4),
            "selected_network": decision,
            "phase": phase,
            "energy": self._energy,
        }

        self.emit(
            topic="data.sn.evaluation",
            payload=evaluation,
            channel="data",
            priority=5,
            ttl=3,
        )

        if score < self.MIN_ACCEPTANCE_SCORE:
            self._state.custom["rejected_count"] += 1
            self.emit(
                topic="event.sn.trigger.rejected",
                payload={
                    "fragment": fragment,
                    "score": round(score, 4),
                    "reason": "score below acceptance threshold",
                },
                channel="event",
                priority=4,
                ttl=2,
            )
            return

        if decision != self._last_network:
            if decision == "cen":
                self._cen_hold_ticks = self.CEN_HOLD_TICKS
                self._state.custom["cen_hold_ticks"] = self._cen_hold_ticks
            self._last_network = decision
            self._state.custom["switch_count"] += 1
            self._state.custom["last_network"] = decision
            self.emit(
                topic="control.network.switch",
                payload={
                    "target_network": decision,
                    "reason": "sn_evaluation",
                    "fragment": fragment,
                    "score": round(score, 4),
                    "phase": phase,
                },
                channel="control",
                priority=8,
                ttl=5,
            )

    def _to_fragment(self, payload: Any) -> Fragment | None:
        """Normalize a payload to a Fragment instance."""
        if payload is None:
            return None
        if isinstance(payload, Fragment):
            return payload
        if isinstance(payload, dict):
            return Fragment(**payload)
        return None

    def _compute_motivation(self, fragment: Fragment) -> float:
        """Return motivation in [0, 1] based on source and emotional valence."""
        base = self.SOURCE_MOTIVATION.get(fragment.source, 0.6)
        # Strong valence, regardless of sign, increases motivational pull.
        emotional_pull = 0.2 * abs(fragment.valence)
        arousal_boost = 0.1 * fragment.arousal
        motivation = base + emotional_pull + arousal_boost
        return float(min(1.0, max(0.0, motivation)))

    def _compute_ability(self) -> float:
        """Return ability in [0, 1] from current metabolic energy."""
        return float(min(1.0, max(0.0, self._energy / 100.0)))

    def _compute_trigger(self, fragment: Fragment) -> float:
        """Return the trigger strength from the fragment's salience."""
        return float(min(1.0, max(0.0, fragment.salience)))

    def _decide_network(self, fragment: Fragment, score: float, phase: str) -> str:
        """Choose the active network given a fragment, score, and phase."""
        if self._energy < self.ENERGY_FORCE_DMN:
            return "dmn"

        decision: str
        if fragment.salience > self.SALIENCE_HIGH_THRESHOLD:
            decision = "cen"
        elif phase in self.CEN_PHASES:
            decision = "cen"
        elif phase in self.DMN_PHASES:
            decision = "dmn"
        else:
            # Default bias based on overall score: high score favors CEN.
            decision = "cen" if score >= 0.3 else "dmn"

        # Once CEN is activated, keep it active for a short hold so that
        # low-salience distractors cannot immediately interrupt sandbox work.
        if self._last_network == "cen" and self._cen_hold_ticks > 0:
            if decision != "cen" and fragment.salience <= self.SALIENCE_HIGH_THRESHOLD:
                return "cen"
        return decision

    def get_state(self) -> ModuleState:
        """Return module state enriched with salience network snapshots."""
        state = super().get_state()
        state.custom["energy"] = self._energy
        state.custom["phase"] = self._phase
        state.custom["last_network"] = self._last_network
        state.custom["evaluation_count"] = self._evaluation_count
        return state
