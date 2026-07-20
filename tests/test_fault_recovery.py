"""Error-injection tests for the fault handling and recovery system.

These tests verify that:
- LLM failures are retried, circuit-broken and published as ``control.fault.error``.
- ``FaultManager`` assesses errors and emits ``control.fault.assessed``.
- ``RecoveryManager`` dispatches recovery actions for transient LLM faults.
"""

from __future__ import annotations

from dataclasses import asdict

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.circuit_breaker import CircuitBreaker, CircuitState
from src.novelist_brain.config import NovelistConfig
from src.novelist_brain.fault import AgentError
from src.novelist_brain.llm import LLMCallError, LLMService, MockLLMService, ResilientLLMService
from src.novelist_brain.recovery import FaultManager, RecoveryManager


class FailingLLMService(LLMService):
    """An LLM service that always raises ``LLMCallError`` with a given message."""

    def __init__(self, message: str = "timeout") -> None:
        self._message = message

    def complete(
        self,
        prompt: str,
        context: dict[str, object] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 256,
    ) -> str:
        raise LLMCallError(self._message)

    def embed(self, text: str) -> list[float]:
        raise LLMCallError(self._message)


def _make_resilient_service(
    router: BusRouter,
    primary: LLMService,
    cfg: NovelistConfig,
) -> ResilientLLMService:
    retry_policy = cfg.fault.retry_policy

    def fault_publisher(error: AgentError) -> None:
        router.publish(
            source="llm_service",
            topic="control.fault.error",
            channel="control",
            payload={"error": error.to_dict()},
            priority=9,
            ttl=5,
        )

    def event_publisher(msg: dict[str, object]) -> None:
        router.publish(
            source=msg["payload"]["source"],
            topic=msg["topic"],
            channel=msg["channel"],
            payload=msg["payload"],
            priority=5,
            ttl=3,
        )

    return ResilientLLMService(
        primary=primary,
        fallback=MockLLMService(seed=1),
        circuit_breaker=CircuitBreaker(
            service="llm",
            failure_threshold=max(1, retry_policy.max_attempts),
            recovery_timeout_ms=30000,
            half_open_max_calls=2,
        ),
        max_retries=max(0, retry_policy.max_attempts - 1),
        base_delay_ms=10,
        fault_publisher=fault_publisher,
        event_publisher=event_publisher,
        source="llm_service",
    )


def test_llm_failure_triggers_fault_and_recovery() -> None:
    router = BusRouter()
    cfg = NovelistConfig()
    cfg.fault.retry_policy.max_attempts = 2
    cfg.fault.retry_policy.base_delay_ms = 10

    primary = FailingLLMService("timeout")
    service = _make_resilient_service(router, primary, cfg)

    fault_manager = FaultManager(name="fault_manager")
    recovery_manager = RecoveryManager(name="recovery_manager", config=cfg.fault)
    modules: list[object] = [fault_manager, recovery_manager]

    for module in modules:
        module.register(router)

    context = {
        "bus": router,
        "fault": asdict(cfg.fault),
        "modules": modules,
        "persistence": None,
    }
    for module in modules:
        module.init(context)

    # First call: primary fails twice, fallback succeeds, circuit opens.
    result = service.complete("write a paragraph")
    assert result  # fallback produced something
    assert service.degraded is True

    # Drain the bus so FaultManager / RecoveryManager see the errors.
    # Some messages (e.g. control.fault.assessed) are emitted while handling
    # earlier messages, so we flush until the inbox is empty.
    for _ in range(5):
        if not router.flush():
            break

    fm_state = fault_manager.get_state()
    rm_state = recovery_manager.get_state()

    assert fm_state["faults_assessed"] >= 1
    assert fm_state["fault_count"] >= 1
    assert rm_state["actions_dispatched"] >= 1
    assert rm_state["actions_succeeded"] >= 1
    assert rm_state["safe_mode"] is False

    # The circuit should now be open because we hit the failure threshold.
    assert service.circuit_state == CircuitState.OPEN

    # Second call: circuit is open, fallback is used directly without new faults.
    previous_fault_count = fm_state["fault_count"]
    result2 = service.complete("write another paragraph")
    assert result2
    for _ in range(5):
        if not router.flush():
            break

    assert service.circuit_state == CircuitState.OPEN
    assert fault_manager.get_state()["fault_count"] == previous_fault_count


def test_system_level_llm_failure_is_recovered() -> None:
    """Run a minimal multi-module assembly with a failing LLM and verify recovery."""
    from src.novelist_brain.cen import CentralExecutiveNetwork
    from src.novelist_brain.clock import Clock
    from src.novelist_brain.config import ConfigRegistry
    from src.novelist_brain.dmn import DefaultModeNetwork
    from src.novelist_brain.eos import EvaluationObservabilitySystem, LLMCollector
    from src.novelist_brain.identity import IdentityCore
    from src.novelist_brain.memory import MemorySystem
    from src.novelist_brain.metabolism import Metabolism
    from src.novelist_brain.models import TickDelta, GlobalContext
    from src.novelist_brain.salience_network import SalienceNetwork
    from src.novelist_brain.sandbox import MentalSandbox

    router = BusRouter()
    cfg = NovelistConfig()
    cfg.fault.retry_policy.max_attempts = 1
    cfg.fault.retry_policy.base_delay_ms = 1
    cfg.fault.auto_recover = True

    failing_llm = FailingLLMService("unreachable")
    resilient_llm = _make_resilient_service(router, failing_llm, cfg)

    identity = IdentityCore(name="identity_core")
    modules: list[object] = [
        identity,
        Metabolism(name="metabolism"),
        MemorySystem(name="memory_system"),
        SalienceNetwork(name="salience_network"),
        DefaultModeNetwork(name="default_mode_network"),
        CentralExecutiveNetwork(name="central_executive_network"),
        MentalSandbox(name="mental_sandbox", llm_service=resilient_llm),
        FaultManager(name="fault_manager"),
        RecoveryManager(name="recovery_manager", config=cfg.fault),
        EvaluationObservabilitySystem(name="eos"),
    ]
    eos = modules[-1]
    eos.add_collector(LLMCollector())

    for module in modules:
        module.register(router)

    context = {
        "bus": router,
        "clock": Clock(),
        "scheduler": None,
        "llm_service": resilient_llm,
        "config": cfg,
        "identity": {"name": "林逸", "traits": {"开放性": 0.8, "内倾性": 0.7, "神经质": 0.5, "尽责性": 0.6, "敏感性": 0.8}},
        "metabolism": {"energy": 80.0, "compute_budget": 80.0, "time_currency": 80.0, "social_capital": 50.0, "max_energy": 100.0},
        "memory": {"working_memory_capacity": 20, "consolidation_threshold": 0.35, "min_tag_overlap": 2},
        "sandbox": {
            "min_rounds": 1,
            "max_rounds": 2,
            "seed": 1,
            "world": {"name": "脑中世界", "ontology": {"genre": "严肃文学", "tone": "忧郁"}, "rules": ["行动有情感后果"]},
        },
        "creation": {"seed": 1, "style_profile": {}},
        "social": {"starting_space": "home", "starting_role": "recluse", "starting_social_energy": 100.0, "fatigue_rate": 1.2},
        "novel": {"title": "脑中世界纪事"},
        "eos": {"enabled": True, "evaluation_interval_ticks": 10, "report_on_phase_change": True, "sampling_rates": {}, "threshold_rules": []},
        "fault": cfg.fault.to_dict(),
        "modules": modules,
        "persistence": None,
    }
    for module in modules:
        module.init(context)

    # Drive a few ticks, including a simulation phase where sandbox calls LLM.
    for tick in range(20):
        phase = "creation" if tick >= 15 else ("simulation" if 5 <= tick < 10 else "morning")
        delta = TickDelta(
            absolute_time=tick * 1000.0,
            delta_ms=1000.0,
            phase=phase,
            global_context=GlobalContext(
                tick=tick,
                absolute_time=tick * 1000.0,
                phase=phase,
                active_network=None,
                budget_warning=False,
            ),
        )
        for module in modules:
            module.tick(delta)
        for _ in range(5):
            if not router.flush():
                break

    fault_manager = modules[-3]
    recovery_manager = modules[-2]
    fm_state = fault_manager.get_state()
    rm_state = recovery_manager.get_state()

    assert fm_state["faults_assessed"] >= 1, "expected at least one assessed fault"
    assert fm_state["fault_count"] >= 1, "expected at least one recorded fault"
    assert rm_state["actions_dispatched"] >= 1, "expected recovery action to be dispatched"
    assert rm_state["actions_succeeded"] >= 1, "expected recovery action to succeed"
    # EOS should still be running after faults.
    assert eos.get_state()["active"] is True


def test_fault_config_roundtrip() -> None:
    """Verify FaultConfig can be serialized and restored."""
    from src.novelist_brain.config import FaultConfig

    original = FaultConfig()
    original.auto_recover = False
    original.max_concurrent_recoveries = 7
    data = original.to_dict()
    restored = FaultConfig.from_dict(data)

    assert restored.auto_recover == original.auto_recover
    assert restored.max_concurrent_recoveries == original.max_concurrent_recoveries
    assert restored.safe_mode_on_critical_identity == original.safe_mode_on_critical_identity
    assert restored.recovery_history_size == original.recovery_history_size
    assert restored.retry_policy.max_attempts == original.retry_policy.max_attempts


if __name__ == "__main__":
    test_llm_failure_triggers_fault_and_recovery()
    test_system_level_llm_failure_is_recovered()
    test_fault_config_roundtrip()
    print("fault/recovery error-injection tests passed")
