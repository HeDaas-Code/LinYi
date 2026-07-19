"""Global clock and daily rhythm for the novelist brain prototype."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from src.novelist_brain.models import GlobalContext, TickDelta


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
        RhythmPhase("creation", 8.0, 12.0, "Focused writing and world-building"),
        RhythmPhase("social", 12.0, 14.0, "Social encounters and meals"),
        RhythmPhase("simulation", 14.0, 17.0, "Mental sandbox simulation"),
        RhythmPhase("reflection", 17.0, 19.0, "Review, reflection, journaling"),
        RhythmPhase("incubation", 19.0, 24.0, "DMN wandering and idea incubation"),
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
