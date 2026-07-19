"""Daily scheduler for the novelist brain prototype.

The scheduler generates a :class:`DailyPlan` based on the B=MAT model:
``behavior = motivation × ability × trigger``.  It replaces the fixed
phase mapping in :class:`RealTimeClock` with a day plan that can adapt to
energy, social capital, and habit strength.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Phase:
    """A scheduled phase within a daily plan.

    ``planned_start`` and ``planned_end`` are :class:`datetime.time` objects
    describing the intended wall-clock bounds.  ``min_duration_minutes`` and
    ``max_duration_minutes`` bound how much the phase may stretch or shrink
    when the plan is adjusted.
    """

    id: str
    phase_type: str
    planned_start: datetime.time
    planned_end: datetime.time
    min_duration_minutes: int = 60
    max_duration_minutes: int = 240
    energy_budget: float = 0.0
    preferred_network: str = "dmn"

    @property
    def planned_start_minutes(self) -> int:
        """Return the planned start time as minutes from midnight."""
        return self.planned_start.hour * 60 + self.planned_start.minute

    @property
    def planned_end_minutes(self) -> int:
        """Return the planned end time as minutes from midnight."""
        return self.planned_end.hour * 60 + self.planned_end.minute

    @property
    def planned_duration_minutes(self) -> int:
        """Return the planned duration in minutes.

        Wraps past midnight safely: 23:00 -> 00:00 is treated as one hour.
        """
        start = self.planned_start_minutes
        end = self.planned_end_minutes
        if end <= start:
            end += 24 * 60
        return end - start

    def contains_time(self, t: datetime.time) -> bool:
        """Return True if ``t`` falls inside this phase's planned interval."""
        minutes = t.hour * 60 + t.minute
        start = self.planned_start_minutes
        end = self.planned_end_minutes
        if end <= start:
            return minutes >= start or minutes < end
        return start <= minutes < end


@dataclass
class DailyPlan:
    """A full day schedule produced by the scheduler."""

    date: datetime.date
    phases: list[Phase] = field(default_factory=list)
    fallback: bool = False
    interrupts: list[dict[str, Any]] = field(default_factory=list)

    def phase_at(self, dt: datetime.datetime) -> Phase | None:
        """Return the phase that contains the given datetime, if any."""
        for phase in self.phases:
            if phase.contains_time(dt.time()):
                return phase
        return None


class DailyScheduler:
    """Generate and adjust daily phase plans using B=MAT scoring.

    The default template aligns 林逸's rhythm with real wall-clock time:

    - 00:00-05:59: deep_night (sleep/dreams)
    - 06:00-07:59: morning (routines)
    - 08:00-11:59: incubation (daytime observation)
    - 12:00-13:59: social (lunch social)
    - 14:00-17:59: simulation (afternoon reasoning)
    - 18:00-18:59: reflection (evening review)
    - 19:00-22:59: creation (evening writing)
    - 23:00-23:59: incubation (night incubation)

    When energy or social capital is low, ``adjust_plan`` can produce a
    fallback plan that reduces creation/social and increases recovery/sleep.
    """

    DEFAULT_PHASES: list[dict[str, Any]] = [
        {
            "id": "deep_night",
            "phase_type": "deep_night",
            "planned_start": datetime.time(0, 0),
            "planned_end": datetime.time(6, 0),
            "min_duration_minutes": 300,
            "max_duration_minutes": 420,
            "energy_budget": -2.0,
            "preferred_network": "dmn",
        },
        {
            "id": "morning",
            "phase_type": "morning",
            "planned_start": datetime.time(6, 0),
            "planned_end": datetime.time(8, 0),
            "min_duration_minutes": 60,
            "max_duration_minutes": 180,
            "energy_budget": 0.5,
            "preferred_network": "dmn",
        },
        {
            "id": "incubation_morning",
            "phase_type": "incubation",
            "planned_start": datetime.time(8, 0),
            "planned_end": datetime.time(12, 0),
            "min_duration_minutes": 120,
            "max_duration_minutes": 360,
            "energy_budget": 0.0,
            "preferred_network": "dmn",
        },
        {
            "id": "social",
            "phase_type": "social",
            "planned_start": datetime.time(12, 0),
            "planned_end": datetime.time(14, 0),
            "min_duration_minutes": 60,
            "max_duration_minutes": 180,
            "energy_budget": -0.5,
            "preferred_network": "sn",
        },
        {
            "id": "simulation",
            "phase_type": "simulation",
            "planned_start": datetime.time(14, 0),
            "planned_end": datetime.time(18, 0),
            "min_duration_minutes": 120,
            "max_duration_minutes": 300,
            "energy_budget": -1.0,
            "preferred_network": "cen",
        },
        {
            "id": "reflection",
            "phase_type": "reflection",
            "planned_start": datetime.time(18, 0),
            "planned_end": datetime.time(19, 0),
            "min_duration_minutes": 30,
            "max_duration_minutes": 120,
            "energy_budget": -0.2,
            "preferred_network": "dmn",
        },
        {
            "id": "creation",
            "phase_type": "creation",
            "planned_start": datetime.time(19, 0),
            "planned_end": datetime.time(23, 0),
            "min_duration_minutes": 120,
            "max_duration_minutes": 300,
            "energy_budget": -2.0,
            "preferred_network": "cen",
        },
        {
            "id": "incubation_night",
            "phase_type": "incubation",
            "planned_start": datetime.time(23, 0),
            "planned_end": datetime.time(0, 0),
            "min_duration_minutes": 30,
            "max_duration_minutes": 120,
            "energy_budget": -0.3,
            "preferred_network": "dmn",
        },
    ]

    FALLBACK_PHASES: list[dict[str, Any]] = [
        {
            "id": "deep_night",
            "phase_type": "deep_night",
            "planned_start": datetime.time(0, 0),
            "planned_end": datetime.time(7, 0),
            "min_duration_minutes": 360,
            "max_duration_minutes": 480,
            "energy_budget": -2.0,
            "preferred_network": "dmn",
        },
        {
            "id": "morning",
            "phase_type": "morning",
            "planned_start": datetime.time(7, 0),
            "planned_end": datetime.time(9, 0),
            "min_duration_minutes": 60,
            "max_duration_minutes": 180,
            "energy_budget": 0.5,
            "preferred_network": "dmn",
        },
        {
            "id": "incubation_morning",
            "phase_type": "incubation",
            "planned_start": datetime.time(9, 0),
            "planned_end": datetime.time(13, 0),
            "min_duration_minutes": 120,
            "max_duration_minutes": 300,
            "energy_budget": 0.0,
            "preferred_network": "dmn",
        },
        {
            "id": "simulation",
            "phase_type": "simulation",
            "planned_start": datetime.time(13, 0),
            "planned_end": datetime.time(17, 0),
            "min_duration_minutes": 120,
            "max_duration_minutes": 300,
            "energy_budget": -0.8,
            "preferred_network": "cen",
        },
        {
            "id": "reflection",
            "phase_type": "reflection",
            "planned_start": datetime.time(17, 0),
            "planned_end": datetime.time(18, 0),
            "min_duration_minutes": 30,
            "max_duration_minutes": 120,
            "energy_budget": -0.2,
            "preferred_network": "dmn",
        },
        {
            "id": "creation",
            "phase_type": "creation",
            "planned_start": datetime.time(18, 0),
            "planned_end": datetime.time(21, 0),
            "min_duration_minutes": 90,
            "max_duration_minutes": 240,
            "energy_budget": -1.5,
            "preferred_network": "cen",
        },
        {
            "id": "incubation_night",
            "phase_type": "incubation",
            "planned_start": datetime.time(21, 0),
            "planned_end": datetime.time(0, 0),
            "min_duration_minutes": 120,
            "max_duration_minutes": 240,
            "energy_budget": -0.3,
            "preferred_network": "dmn",
        },
    ]

    def __init__(self) -> None:
        self._last_plan: DailyPlan | None = None

    def plan_day(self, context: dict[str, Any] | None = None) -> DailyPlan:
        """Generate a fresh daily plan from context.

        If energy or social capital is low, produce the fallback plan.
        """
        context = context or {}
        date = self._resolve_date(context)
        if self._should_fallback(context):
            phases = [Phase(**p) for p in self.FALLBACK_PHASES]
            plan = DailyPlan(
                date=date,
                phases=phases,
                fallback=True,
                interrupts=[],
            )
        else:
            phases = [Phase(**p) for p in self.DEFAULT_PHASES]
            plan = DailyPlan(
                date=date,
                phases=phases,
                fallback=False,
                interrupts=[],
            )
        self._last_plan = plan
        return plan

    def adjust_plan(
        self, context: dict[str, Any], current_plan: DailyPlan
    ) -> DailyPlan:
        """Adjust an existing plan based on runtime context.

        If the agent becomes exhausted, shorten creation/social phases and
        extend recovery phases.  Otherwise the plan is returned unchanged.
        """
        if not self._should_fallback(context):
            return current_plan

        energy = float(context.get("metabolism", {}).get("energy", 80.0))
        social_capital = float(
            context.get("metabolism", {}).get("social_capital", 50.0)
        )

        adjusted_phases: list[Phase] = []
        for phase in current_plan.phases:
            if phase.phase_type in ("creation", "social"):
                # Reduce high-cost phases when tired or socially depleted.
                new_duration = max(
                    phase.min_duration_minutes,
                    int(phase.planned_duration_minutes * 0.7),
                )
                adjusted_phases.append(
                    Phase(
                        id=phase.id,
                        phase_type=phase.phase_type,
                        planned_start=phase.planned_start,
                        planned_end=self._shift_time(
                            phase.planned_start, new_duration
                        ),
                        min_duration_minutes=phase.min_duration_minutes,
                        max_duration_minutes=phase.max_duration_minutes,
                        energy_budget=phase.energy_budget * 0.8,
                        preferred_network=phase.preferred_network,
                    )
                )
            elif phase.phase_type in ("deep_night", "incubation"):
                # Extend recovery phases slightly.
                new_duration = min(
                    phase.max_duration_minutes,
                    phase.planned_duration_minutes + 30,
                )
                adjusted_phases.append(
                    Phase(
                        id=phase.id,
                        phase_type=phase.phase_type,
                        planned_start=phase.planned_start,
                        planned_end=self._shift_time(
                            phase.planned_start, new_duration
                        ),
                        min_duration_minutes=phase.min_duration_minutes,
                        max_duration_minutes=phase.max_duration_minutes,
                        energy_budget=phase.energy_budget,
                        preferred_network=phase.preferred_network,
                    )
                )
            else:
                adjusted_phases.append(phase)

        plan = DailyPlan(
            date=current_plan.date,
            phases=adjusted_phases,
            fallback=True,
            interrupts=list(current_plan.interrupts),
        )
        self._last_plan = plan
        return plan

    def score_phase(self, phase: Phase, context: dict[str, Any]) -> float:
        """Compute a B=MAT score for a candidate phase.

        ``score = motivation × ability × trigger`` where:

        * motivation depends on phase type, identity rhythm preferences,
          inspiration pressure and social capital.
        * ability is energy / 100 × network compatibility.
        * trigger is habit strength (from Dynamics) plus temporal proximity.
        """
        context = context or {}
        metabolism = context.get("metabolism", {})
        energy = float(metabolism.get("energy", 80.0))
        social_capital = float(metabolism.get("social_capital", 50.0))

        dynamics = context.get("dynamics", {})
        habit_strengths: dict[str, float] = {}
        if isinstance(dynamics, dict):
            habit_strengths = dynamics.get("habit_strengths", {})

        identity = context.get("identity", {})
        rhythm_preferences = identity.get("rhythm_preferences", {}) if isinstance(
            identity, dict
        ) else {}
        preferred_writing_hours = rhythm_preferences.get(
            "preferred_writing_hours", [19, 23]
        )

        motivation = self._compute_motivation(
            phase,
            social_capital,
            preferred_writing_hours,
        )
        ability = self._compute_ability(phase, energy)
        trigger = self._compute_trigger(phase, habit_strengths)
        return float(motivation * ability * trigger)

    def phase_type_at(self, dt: datetime.datetime, plan: DailyPlan) -> str:
        """Return the phase type for ``dt`` according to ``plan``.

        Falls back to the first phase if no match is found.
        """
        phase = plan.phase_at(dt)
        if phase is not None:
            return phase.phase_type
        # Edge case near midnight: wrap to deep_night.
        return "deep_night"

    @staticmethod
    def _resolve_date(context: dict[str, Any]) -> datetime.date:
        """Extract a date from context or use today."""
        clock = context.get("clock")
        if clock is not None and hasattr(clock, "now"):
            try:
                return clock.now().date()
            except Exception:
                pass
        return datetime.date.today()

    @staticmethod
    def _should_fallback(context: dict[str, Any]) -> bool:
        """Return True if the agent should use the low-energy fallback plan."""
        metabolism = context.get("metabolism", {})
        energy = float(metabolism.get("energy", 80.0))
        social_capital = float(metabolism.get("social_capital", 50.0))
        return energy < 25.0 or social_capital < 15.0

    @staticmethod
    def _shift_time(start: datetime.time, minutes: int) -> datetime.time:
        """Return ``start`` advanced by ``minutes`` minutes, wrapping at 24h."""
        dt = datetime.datetime.combine(datetime.date(1, 1, 1), start)
        dt += datetime.timedelta(minutes=minutes)
        return dt.time()

    def _compute_motivation(
        self,
        phase: Phase,
        social_capital: float,
        preferred_writing_hours: list[int],
    ) -> float:
        """Return motivation in [0, 1] for ``phase``."""
        motivation = 0.5

        if phase.phase_type == "creation":
            start_hour = phase.planned_start.hour
            if preferred_writing_hours and start_hour in preferred_writing_hours:
                motivation = 0.9
            else:
                motivation = 0.75
        elif phase.phase_type == "social":
            motivation = 0.4 + 0.4 * (social_capital / 100.0)
        elif phase.phase_type == "simulation":
            motivation = 0.65
        elif phase.phase_type == "reflection":
            motivation = 0.55
        elif phase.phase_type == "incubation":
            motivation = 0.6
        elif phase.phase_type == "morning":
            motivation = 0.5
        elif phase.phase_type == "deep_night":
            motivation = 0.35

        return float(min(1.0, max(0.0, motivation)))

    def _compute_ability(self, phase: Phase, energy: float) -> float:
        """Return ability in [0, 1] from energy and network compatibility."""
        energy_factor = min(1.0, max(0.0, energy / 100.0))
        network_bonus = 1.0
        if energy < 20.0 and phase.preferred_network == "cen":
            network_bonus = 0.7
        elif energy > 70.0 and phase.preferred_network == "cen":
            network_bonus = 1.1
        return float(min(1.0, energy_factor * network_bonus))

    def _compute_trigger(
        self, phase: Phase, habit_strengths: dict[str, float]
    ) -> float:
        """Return trigger strength from habit strength and temporal proximity."""
        habit = habit_strengths.get(phase.phase_type, 0.5)
        now = datetime.datetime.now()
        minutes_to_start = self._minutes_until(now.time(), phase.planned_start)
        proximity = max(0.0, 1.0 - minutes_to_start / 120.0)
        trigger = 0.5 * habit + 0.5 * proximity
        return float(min(1.0, max(0.0, trigger)))

    @staticmethod
    def _minutes_until(current: datetime.time, target: datetime.time) -> float:
        """Return the positive minutes from ``current`` to ``target``."""
        cur = current.hour * 60 + current.minute
        tgt = target.hour * 60 + target.minute
        if tgt < cur:
            tgt += 24 * 60
        return float(tgt - cur)
