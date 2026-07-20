"""Transaction boundary and persistence-deepening tests."""

from __future__ import annotations

import os
import tempfile

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.clock import RealTimeClock
from src.novelist_brain.models import BusMessage, GlobalContext, ModuleState, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import PersistenceManager
from src.novelist_brain.transaction import TransactionManager


class CounterModule(Module):
    """A simple module for testing rollback."""

    def __init__(self, name: str = "counter") -> None:
        super().__init__(name)
        self.value = 0
        self.fail_next = False
        self.subscribe("inc", "boom")

    def _initial_state(self) -> ModuleState:
        return ModuleState(active=True, custom={"value": 0})

    def init(self, context: dict[str, object]) -> None:
        pass

    def tick(self, delta: TickDelta) -> None:
        self.value += 1
        self._state.custom["value"] = self.value

    def on_bus_message(self, message: BusMessage) -> None:
        if message.topic == "inc":
            self.value += 1
            self._state.custom["value"] = self.value
        elif message.topic == "boom":
            self.value += 1
            self._state.custom["value"] = self.value
            if self.fail_next:
                raise RuntimeError("planned failure")

    def to_dict(self) -> dict[str, object]:
        data = super().to_dict()
        data["value"] = self.value
        return data

    def from_dict(self, data: dict[str, object], **kwargs: object) -> None:
        super().from_dict(data, **kwargs)
        self.value = data.get("value", 0)


def _make_tick_delta(tick: int = 1) -> TickDelta:
    return TickDelta(
        absolute_time=tick * 1000.0,
        delta_ms=1000.0,
        phase="morning",
        global_context=GlobalContext(
            tick=tick,
            absolute_time=tick * 1000.0,
            phase="morning",
            active_network=None,
            budget_warning=False,
        ),
    )


def test_transaction_rolls_back_on_flush_failure() -> None:
    router = BusRouter()
    counter = CounterModule(name="counter")
    modules = [counter]
    for module in modules:
        module.register(router)

    context: dict[str, object] = {"bus": router, "llm_service": None}
    tx_manager = TransactionManager(modules, context)

    counter.tick(_make_tick_delta(1))
    router.publish(source="test", topic="inc", channel="event", payload={})
    router.publish(source="test", topic="boom", channel="event", payload={})
    counter.fail_next = True

    tx_manager.begin(start_tick=1, eager=True)
    assert tx_manager.in_transaction()
    try:
        router.flush()
    except RuntimeError:
        restored = tx_manager.rollback()
        router.flush()
    else:
        raise AssertionError("Expected flush to fail")
    finally:
        tx_manager.commit() if tx_manager.active else None

    assert "counter" in restored
    assert counter.value == 1  # tick increment only, inc + boom rolled back
    assert counter.state.custom["value"] == 1


def test_transaction_commits_on_success() -> None:
    router = BusRouter()
    counter = CounterModule(name="counter")
    modules = [counter]
    for module in modules:
        module.register(router)

    context: dict[str, object] = {"bus": router, "llm_service": None}
    tx_manager = TransactionManager(modules, context)

    counter.tick(_make_tick_delta(1))
    router.publish(source="test", topic="inc", channel="event", payload={})

    tx_manager.begin(start_tick=1, eager=True)
    router.flush()
    tx_manager.commit()

    assert counter.value == 2
    assert counter.state.custom["value"] == 2


def test_persistence_verify_and_emergency_snapshot() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        save_path = os.path.join(tmpdir, "agent_state.json")
        clock = RealTimeClock(tick_interval_seconds=0)
        state = {
            "version": 1,
            "saved_at": clock.now().isoformat(),
            "clock": {
                "tick": clock.tick,
                "absolute_time_ms": clock.absolute_time_ms,
                "hour": clock.hour,
                "phase": clock.phase,
            },
            "modules": {},
        }

        PersistenceManager.save(state, save_path)
        report = PersistenceManager.verify(save_path)
        assert report["valid"] is True
        assert report["snapshot_count"] == 0
        assert report["delta_count"] == 0

        emergency_path = PersistenceManager.emergency_snapshot(
            state, save_path, reason="test"
        )
        assert os.path.isfile(emergency_path)
        assert "emergency.test." in emergency_path


if __name__ == "__main__":
    test_transaction_rolls_back_on_flush_failure()
    test_transaction_commits_on_success()
    test_persistence_verify_and_emergency_snapshot()
    print("transaction and persistence tests passed")
