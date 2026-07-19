"""Minimal verification for RealTimeClock.

This test intentionally uses real ``time.sleep`` to verify that
RealTimeClock advances ticks based on wall-clock time and maps hours to
phases correctly.
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime

# Allow ``python tests/test_realtime_clock.py`` to find the src package.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.novelist_brain.clock import RealTimeClock, phase_for_datetime


def test_phase_for_datetime() -> None:
    # Daily rhythm aligned with the scheduler: live during the day, write at night.
    assert phase_for_datetime(datetime(2026, 7, 19, 0, 0)) == "deep_night"
    assert phase_for_datetime(datetime(2026, 7, 19, 5, 59)) == "deep_night"
    assert phase_for_datetime(datetime(2026, 7, 19, 6, 0)) == "morning"
    assert phase_for_datetime(datetime(2026, 7, 19, 8, 0)) == "incubation"
    assert phase_for_datetime(datetime(2026, 7, 19, 12, 0)) == "social"
    assert phase_for_datetime(datetime(2026, 7, 19, 14, 0)) == "simulation"
    assert phase_for_datetime(datetime(2026, 7, 19, 18, 0)) == "reflection"
    assert phase_for_datetime(datetime(2026, 7, 19, 19, 0)) == "creation"
    assert phase_for_datetime(datetime(2026, 7, 19, 23, 0)) == "incubation"
    assert phase_for_datetime(datetime(2026, 7, 19, 23, 59)) == "incubation"


def test_realtime_clock_phase_transition() -> None:
    """Start just before 08:00 and verify a tick crosses into daytime incubation."""
    start = datetime.now().replace(hour=7, minute=59, second=59, microsecond=0)
    clock = RealTimeClock(tick_interval_seconds=1.0, start_time=start)

    print(f"Start: now={clock.now()}, phase={clock.current_phase()}, tick={clock.tick}")
    assert clock.current_phase() == "morning"

    # Not enough real time has elapsed yet.
    delta = clock.advance(1)
    assert delta is None
    assert clock.tick == 0

    # Wait for one real second, which should advance one tick into incubation.
    time.sleep(1.1)
    delta = clock.advance(1)
    print(f"After 1s: now={clock.now()}, phase={clock.current_phase()}, tick={clock.tick}, delta={delta}")
    assert delta is not None
    assert clock.tick == 1
    assert clock.current_phase() == "incubation"
    assert delta.phase == "incubation"

    # Advance a few more ticks to ensure the clock keeps running.
    for i in range(3):
        time.sleep(1.1)
        delta = clock.advance(1)
        print(f"Loop {i}: now={clock.now()}, phase={clock.current_phase()}, tick={clock.tick}")
        assert delta is not None
        assert clock.tick == i + 2


def test_realtime_clock_no_advance_without_elapsed_time() -> None:
    start = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
    clock = RealTimeClock(tick_interval_seconds=60.0, start_time=start)
    assert clock.advance(1) is None
    assert clock.tick == 0


def test_realtime_clock_handler_invoked() -> None:
    start = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
    clock = RealTimeClock(tick_interval_seconds=1.0, start_time=start)
    called_with: list[int] = []

    def handler(delta) -> None:
        called_with.append(delta.global_context.tick)

    clock.on_tick(handler)

    time.sleep(1.1)
    clock.advance(1)
    assert called_with == [1]


if __name__ == "__main__":
    test_phase_for_datetime()
    test_realtime_clock_no_advance_without_elapsed_time()
    test_realtime_clock_handler_invoked()
    test_realtime_clock_phase_transition()
    print("\nAll RealTimeClock tests passed.")
