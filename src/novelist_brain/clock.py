"""Global clock and daily rhythm for the novelist brain prototype."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Any, Callable

from src.novelist_brain.models import GlobalContext, TickDelta
from src.novelist_brain.scheduler import DailyPlan, DailyScheduler, Phase


def phase_for_datetime(dt: datetime.datetime) -> str:
    """Map a wall-clock datetime to the default daily phase.

    The mapping aligns with :class:`DailyScheduler`'s default plan so that
    the novelist lives through the day and writes in the evening:

    - 00:00-05:59 -> deep_night (sleep / dreams)
    - 06:00-07:59 -> morning (waking routines)
    - 08:00-11:59 -> incubation (daytime observation / wandering)
    - 12:00-13:59 -> social (lunch / encounters)
    - 14:00-17:59 -> simulation (afternoon reasoning / sandbox warm-up)
    - 18:00-18:59 -> reflection (evening review)
    - 19:00-22:59 -> creation (evening writing)
    - 23:00-23:59 -> incubation (night incubation before sleep)
    """
    hour = dt.hour
    if hour < 6:
        return "deep_night"
    if hour < 8:
        return "morning"
    if hour < 12:
        return "incubation"
    if hour < 14:
        return "social"
    if hour < 18:
        return "simulation"
    if hour < 19:
        return "reflection"
    if hour < 23:
        return "creation"
    return "incubation"


@dataclass
class RhythmPhase:
    """A named phase within the daily rhythm."""

    name: str
    start_hour: float
    end_hour: float
    description: str = ""

    def contains(self, hour: float) -> bool:
        """Return True if ``hour`` falls inside this phase.

        The phase spans from ``start_hour`` inclusive to ``end_hour`` exclusive,
        except for the final phase which may wrap to 24.0.
        """
        if self.start_hour <= self.end_hour:
            return self.start_hour <= hour < self.end_hour
        # Wrap-around phase (not used by the default template).
        return hour >= self.start_hour or hour < self.end_hour


class Clock:
    """Global clock that advances ticks and maps time to a daily phase."""

    DEFAULT_RHYTHM: list[RhythmPhase] = [
        RhythmPhase("deep_night", 0.0, 6.0, "Sleep, dreams, low metabolism"),
        RhythmPhase("morning", 6.0, 8.0, "Waking up, routines, low-demand input"),
        RhythmPhase("incubation", 8.0, 12.0, "Daytime observation and idea wandering"),
        RhythmPhase("social", 12.0, 14.0, "Social encounters and meals"),
        RhythmPhase("simulation", 14.0, 18.0, "Afternoon reasoning and sandbox warm-up"),
        RhythmPhase("reflection", 18.0, 19.0, "Evening review and journaling"),
        RhythmPhase("creation", 19.0, 23.0, "Evening writing after living through the day"),
        RhythmPhase("incubation", 23.0, 24.0, "Night incubation before sleep"),
    ]

    def __init__(
        self,
        start_hour: float = 0.0,
        tick_duration_ms: float = 60000.0,
        rhythm: list[RhythmPhase] | None = None,
    ) -> None:
        self._start_hour = start_hour
        self._tick_duration_ms = tick_duration_ms
        self._rhythm = rhythm if rhythm is not None else list(self.DEFAULT_RHYTHM)
        self._tick = 0
        self._absolute_time = start_hour * 3600.0 * 1000.0
        self._phase = self._resolve_phase(start_hour)
        self._handlers: list[Callable[[TickDelta], None]] = []

    @property
    def tick(self) -> int:
        return self._tick

    @property
    def absolute_time_ms(self) -> float:
        return self._absolute_time

    @property
    def hour(self) -> float:
        """Return the current hour of day in the range [0, 24)."""
        return (self._absolute_time / (3600.0 * 1000.0)) % 24.0

    @property
    def phase(self) -> str:
        return self._phase

    @property
    def rhythm(self) -> list[RhythmPhase]:
        return self._rhythm

    def _resolve_phase(self, hour: float) -> str:
        for phase in self._rhythm:
            if phase.contains(hour):
                return phase.name
        # Fallback for numerical edge cases near 24.0.
        return self._rhythm[-1].name

    def on_tick(self, handler: Callable[[TickDelta], None]) -> None:
        """Register a callback invoked on every tick."""
        self._handlers.append(handler)

    def advance(self, steps: int = 1) -> list[TickDelta]:
        """Advance the clock by ``steps`` ticks and return the deltas."""
        deltas: list[TickDelta] = []
        for _ in range(steps):
            self._tick += 1
            self._absolute_time += self._tick_duration_ms
            phase = self._resolve_phase(self.hour)
            self._phase = phase

            context = GlobalContext(
                tick=self._tick,
                absolute_time=self._absolute_time,
                phase=phase,
            )
            delta = TickDelta(
                absolute_time=self._absolute_time,
                delta_ms=self._tick_duration_ms,
                phase=phase,
                global_context=context,
            )
            deltas.append(delta)
            for handler in self._handlers:
                handler(delta)
        return deltas

    def reset(self, start_hour: float = 0.0) -> None:
        """Reset the clock to the given starting hour."""
        self._tick = 0
        self._absolute_time = start_hour * 3600.0 * 1000.0
        self._phase = self._resolve_phase(start_hour)


class RealTimeClock:
    """Clock that advances ticks based on wall-clock time.

    Unlike :class:`Clock`, ``RealTimeClock`` does not artificially speed-run
    the day. Each tick is gated by ``tick_interval_seconds`` of real elapsed
    time, making it suitable for long-running agents that follow the user's
    real-world rhythm.

    When a :class:`DailyScheduler` is provided, the clock uses the scheduler's
    daily plan to resolve phases instead of the fixed ``phase_for_datetime``
    mapping. A new plan is generated at midnight.
    """

    def __init__(
        self,
        tick_interval_seconds: float = 60.0,
        sim_seconds_per_tick: float | None = None,
        start_time: datetime.datetime | None = None,
        fast_forward: bool = False,
        scheduler: DailyScheduler | None = None,
        scheduler_context: dict[str, Any] | None = None,
    ) -> None:
        self._tick_interval_seconds = tick_interval_seconds
        self._sim_seconds_per_tick = (
            sim_seconds_per_tick if sim_seconds_per_tick is not None else tick_interval_seconds
        )
        self._start_time = start_time if start_time is not None else datetime.datetime.now()
        self._sim_time = self._start_time
        self._last_real_time = datetime.datetime.now()
        self._tick = 0
        self._handlers: list[Callable[[TickDelta], None]] = []
        self._fast_forward = fast_forward
        self._scheduler = scheduler
        self._scheduler_context = scheduler_context if scheduler_context is not None else {}
        self._daily_plan: DailyPlan | None = None
        self._plan_date: datetime.date | None = None
        self._phase = self._resolve_phase(self._sim_time)

    @property
    def tick(self) -> int:
        return self._tick

    @property
    def absolute_time_ms(self) -> float:
        return (self._sim_time - self._start_time).total_seconds() * 1000.0

    @property
    def hour(self) -> float:
        """Return the current simulated hour of day in the range [0, 24)."""
        return self._sim_time.hour + self._sim_time.minute / 60.0 + self._sim_time.second / 3600.0

    @property
    def phase(self) -> str:
        return self._phase

    @property
    def tick_interval_seconds(self) -> float:
        return self._tick_interval_seconds

    @property
    def is_fast_forward(self) -> bool:
        """Return True if real-time gating is disabled."""
        return self._fast_forward

    @property
    def daily_plan(self) -> DailyPlan | None:
        """Return the current daily plan, if a scheduler is attached."""
        return self._daily_plan

    @property
    def current_phase_info(self) -> Phase | None:
        """Return the current scheduled :class:`Phase`, if available."""
        if self._daily_plan is None:
            return None
        return self._daily_plan.phase_at(self._sim_time)

    def now(self) -> datetime.datetime:
        """Return the current simulated datetime."""
        return self._sim_time

    def current_phase(self) -> str:
        """Return the current daily phase.

        Uses the scheduler's daily plan when available; otherwise falls back
        to the static ``phase_for_datetime`` mapping.
        """
        return self._resolve_phase(self._sim_time)

    def on_tick(self, handler: Callable[[TickDelta], None]) -> None:
        """Register a callback invoked on every real tick."""
        self._handlers.append(handler)

    def _ensure_plan(self, dt: datetime.datetime) -> None:
        """Generate or refresh the daily plan for ``dt``'s date."""
        if self._scheduler is None:
            return
        current_date = dt.date()
        if self._daily_plan is None or self._plan_date != current_date:
            context = {"clock": self}
            context.update(self._scheduler_context)
            self._daily_plan = self._scheduler.plan_day(context)
            self._plan_date = current_date

    def _resolve_phase(self, dt: datetime.datetime) -> str:
        """Resolve the phase for ``dt`` using the scheduler or static map."""
        self._ensure_plan(dt)
        if self._scheduler is not None and self._daily_plan is not None:
            return self._scheduler.phase_type_at(dt, self._daily_plan)
        return phase_for_datetime(dt)

    def advance(self, ticks: int = 1) -> TickDelta | None:
        """Advance the clock if enough real time has elapsed.

        ``ticks`` is the maximum number of ticks to advance. If fewer ticks
        have elapsed in real time, no tick is produced and ``None`` is
        returned. Multiple elapsed ticks are processed sequentially and the
        last ``TickDelta`` is returned.

        When ``fast_forward`` is enabled, real-time gating is bypassed so
        that ticks are produced immediately on every call. This is useful
        for compressed multi-day tests.
        """
        now = datetime.datetime.now()
        elapsed_seconds = (now - self._last_real_time).total_seconds()
        required_seconds = ticks * self._tick_interval_seconds
        if not self._fast_forward and elapsed_seconds < required_seconds:
            return None

        self._last_real_time += datetime.timedelta(seconds=required_seconds)

        delta_ms = self._sim_seconds_per_tick * 1000.0
        last_delta: TickDelta | None = None
        for _ in range(ticks):
            self._tick += 1
            self._sim_time += datetime.timedelta(seconds=self._sim_seconds_per_tick)
            phase = self._resolve_phase(self._sim_time)
            self._phase = phase
            absolute_time_ms = (self._sim_time - self._start_time).total_seconds() * 1000.0

            active_network: str | None = None
            phase_info = self.current_phase_info
            if phase_info is not None:
                active_network = phase_info.preferred_network

            context = GlobalContext(
                tick=self._tick,
                absolute_time=absolute_time_ms,
                phase=phase,
                active_network=active_network,  # type: ignore[arg-type]
            )
            delta = TickDelta(
                absolute_time=absolute_time_ms,
                delta_ms=delta_ms,
                phase=phase,
                global_context=context,
            )
            last_delta = delta
            for handler in self._handlers:
                handler(delta)

        return last_delta

    def reset(self, start_time: datetime.datetime | None = None) -> None:
        """Reset the clock to the given simulated start time."""
        self._start_time = start_time if start_time is not None else datetime.datetime.now()
        self._sim_time = self._start_time
        self._last_real_time = datetime.datetime.now()
        self._tick = 0
        self._daily_plan = None
        self._plan_date = None
        self._phase = self._resolve_phase(self._sim_time)
