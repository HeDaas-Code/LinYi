"""Fault management and recovery execution for the novelist brain.

Implements ``FaultManager`` (error → impact assessment) and ``RecoveryManager``
(fault → recovery action → outcome) as described in Design.md section 20.
"""

from __future__ import annotations

import time
from collections import deque
from typing import Any

from src.novelist_brain.config import FaultConfig
from src.novelist_brain.fault import (
    AgentError,
    ErrorType,
    Fault,
    MetabolicCost,
    RecoveryAction,
    RecoveryStrategy,
    RetryPolicy,
    Severity,
)
from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


FAULT_ERROR_TOPIC = "control.fault.error"
FAULT_ASSESSED_TOPIC = "control.fault.assessed"
RECOVERY_ACTION_TOPIC = "control.recovery.action"
RECOVERY_RESULT_TOPIC = "control.recovery.result"
RECOVERY_RESOLVED_TOPIC = "control.recovery.resolved"
SAFE_MODE_TOPIC = "control.system.safe_mode"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _module_for(modules: list[Any], name: str) -> Any | None:
    for module in modules:
        if getattr(module, "name", None) == name:
            return module
    return None


class FaultManager(Module):
    """Assesses ``AgentError`` events and produces ``Fault`` objects."""

    def __init__(self, name: str = "fault_manager") -> None:
        super().__init__(name)
        self._faults: deque[Fault] = deque(maxlen=100)
        self.subscribe(FAULT_ERROR_TOPIC)

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.05,
            custom={"faults_assessed": 0},
        )

    def init(self, context: dict[str, Any]) -> None:
        """No runtime binding required for fault assessment."""
        pass

    def tick(self, delta: TickDelta) -> None:
        """Fault assessment is event-driven; nothing to do per tick."""
        pass

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        if message.topic != FAULT_ERROR_TOPIC:
            return

        error = self._parse_error(message.payload)
        if error is None:
            return

        fault = self._assess(error)
        self._faults.append(fault)
        self._state.custom["faults_assessed"] += 1

        self.emit(
            topic=FAULT_ASSESSED_TOPIC,
            channel="control",
            payload={"fault": fault.to_dict(), "error": error.to_dict()},
            priority=9,
            ttl=10,
        )

    def _parse_error(self, payload: Any) -> AgentError | None:
        if isinstance(payload, AgentError):
            return payload
        if isinstance(payload, dict):
            raw_error = payload.get("error") or payload
            if isinstance(raw_error, dict):
                try:
                    return AgentError.from_dict(raw_error)
                except Exception:
                    return None
        return None

    def _assess(self, error: AgentError) -> Fault:
        """Map an AgentError to a Fault with impact analysis."""
        affected_modules = [error.source]
        affected_networks: list[str] = []
        scope = "module"
        persistence_risk = False
        identity_risk = False

        error_type = error.type
        source = error.source

        if error_type in (
            ErrorType.LLM_TIMEOUT,
            ErrorType.LLM_MALFORMED_RESPONSE,
            ErrorType.LLM_RATE_LIMIT,
            ErrorType.LLM_CONTENT_FILTERED,
            ErrorType.LLM_UNREACHABLE,
        ):
            affected_modules = [source, "central_executive_network", "mental_sandbox", "creation_executive"]
            affected_networks = ["cen"]
        elif error_type in (ErrorType.MEMORY_CORRUPTION, ErrorType.MEMORY_LOSS):
            affected_modules = ["memory_system", "default_mode_network", "central_executive_network"]
            affected_networks = ["dmn", "cen"]
            persistence_risk = True
        elif error_type == ErrorType.SANDBOX_DIVERGENCE:
            affected_modules = ["mental_sandbox", "central_executive_network", "creation_executive"]
            affected_networks = ["cen"]
            identity_risk = True
        elif error_type == ErrorType.METABOLISM_COLLAPSE:
            affected_modules = ["metabolism"]
            affected_networks = ["sn", "cen"]
            scope = "network"
        elif error_type == ErrorType.BUS_CONGESTION:
            affected_modules = []
            affected_networks = ["sn", "cen", "dmn"]
            scope = "system"
        elif error_type == ErrorType.PERSISTENCE_FAILURE:
            affected_modules = ["persistence"]
            affected_networks = []
            scope = "system"
            persistence_risk = True
        elif error_type == ErrorType.IDENTITY_INCONSISTENCY:
            affected_modules = ["identity_core"]
            affected_networks = ["cen", "dmn"]
            scope = "system"
            identity_risk = True

        if error.severity == Severity.CRITICAL:
            scope = "system"

        propagation_path = [error.source]
        if affected_modules and affected_modules[0] == error.source:
            propagation_path.extend([m for m in affected_modules[1:] if m != error.source])

        return Fault(
            error_id=error.id,
            source=error.source,
            type=error_type,
            severity=error.severity,
            message=error.message,
            affected_modules=affected_modules,
            affected_networks=affected_networks,
            scope=scope,
            propagation_path=propagation_path,
            persistence_risk=persistence_risk,
            identity_risk=identity_risk,
        )

    def latest_faults(self, count: int = 5) -> list[Fault]:
        return list(self._faults)[-count:]

    def get_state(self) -> dict[str, Any]:
        return {
            "active": self._state.active,
            "faults_assessed": self._state.custom.get("faults_assessed", 0),
            "fault_count": len(self._faults),
            "latest_faults": [f.to_dict() for f in list(self._faults)[-5:]],
        }

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base["faults"] = [f.to_dict() for f in self._faults]
        base["faults_assessed"] = self._state.custom.get("faults_assessed", 0)
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._faults = deque(
            [Fault.from_dict(f) for f in data.get("faults", [])],
            maxlen=100,
        )


class RecoveryManager(Module):
    """Selects and executes recovery actions for assessed faults."""

    def __init__(
        self,
        name: str = "recovery_manager",
        config: FaultConfig | None = None,
    ) -> None:
        super().__init__(name)
        self._config = config or FaultConfig()
        self._actions: dict[str, RecoveryAction] = {}
        self._history: deque[RecoveryAction] = deque(maxlen=self._config.recovery_history_size)
        self._pending: dict[str, RecoveryAction] = {}
        self._modules: list[Any] = []
        self._router: Any = None
        self._persistence: Any = None
        self._safe_mode: bool = False

        self.subscribe(
            FAULT_ASSESSED_TOPIC,
            RECOVERY_RESULT_TOPIC,
            RECOVERY_ACTION_TOPIC,
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.05,
            custom={
                "actions_dispatched": 0,
                "actions_succeeded": 0,
                "actions_failed": 0,
                "safe_mode_activations": 0,
            },
        )

    def init(self, context: dict[str, Any]) -> None:
        """Bind runtime references needed to execute recovery actions."""
        self._modules = context.get("modules", [])
        self._router = context.get("bus")
        self._persistence = context.get("persistence")
        fault_cfg = context.get("fault", {})
        if fault_cfg:
            retry = fault_cfg.get("retry_policy", {})
            self._config = FaultConfig(
                retry_policy=RetryPolicy.from_dict(retry) if retry else RetryPolicy(),
                auto_recover=fault_cfg.get("auto_recover", True),
                safe_mode_on_critical_identity=fault_cfg.get(
                    "safe_mode_on_critical_identity", True
                ),
                safe_mode_on_persistence_failure=fault_cfg.get(
                    "safe_mode_on_persistence_failure", True
                ),
                max_concurrent_recoveries=fault_cfg.get("max_concurrent_recoveries", 3),
                recovery_history_size=fault_cfg.get("recovery_history_size", 50),
            )

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return

        if message.topic == FAULT_ASSESSED_TOPIC:
            self._handle_fault_assessed(message.payload)
        elif message.topic == RECOVERY_RESULT_TOPIC:
            self._handle_recovery_result(message.payload)
        elif message.topic == RECOVERY_ACTION_TOPIC:
            self._handle_recovery_action(message.payload)

    def tick(self, delta: TickDelta) -> None:
        """Expire overdue actions and re-evaluate pending recoveries."""
        expired: list[str] = []
        for action_id, action in self._pending.items():
            if action.is_expired():
                expired.append(action_id)
                action.status = "failed"
                action.result_message = "恢复动作超时"
                self._emit_result(action)
        for action_id in expired:
            del self._pending[action_id]

    def _handle_fault_assessed(self, payload: Any) -> None:
        if not self._config.auto_recover:
            return

        fault_data = payload.get("fault") if isinstance(payload, dict) else None
        if fault_data is None:
            return
        fault = Fault.from_dict(fault_data)

        if len(self._pending) >= self._config.max_concurrent_recoveries:
            self._emit_safe_mode(
                reason="并发恢复数量超限",
                fault=fault,
            )
            return

        if fault.identity_risk and self._config.safe_mode_on_critical_identity and fault.severity == Severity.CRITICAL:
            self._emit_safe_mode(
                reason="人格一致性面临严重风险",
                fault=fault,
            )
            return

        if fault.persistence_risk and self._config.safe_mode_on_persistence_failure and fault.severity == Severity.CRITICAL:
            self._emit_safe_mode(
                reason="持久化数据面临严重风险",
                fault=fault,
            )
            return

        action = self._choose_action(fault)
        if action is None:
            return

        self._dispatch(action)

    def _choose_action(self, fault: Fault) -> RecoveryAction | None:
        """Map a fault to the first recovery action (with fallback chain)."""
        error_type = fault.type
        severity = fault.severity

        # Critical identity / persistence faults go straight to safe mode.
        if fault.identity_risk and severity == Severity.CRITICAL:
            return None
        if fault.persistence_risk and severity == Severity.CRITICAL:
            return None

        if error_type in (
            ErrorType.LLM_TIMEOUT,
            ErrorType.LLM_RATE_LIMIT,
            ErrorType.LLM_UNREACHABLE,
        ):
            primary = RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.RETRY,
                target=fault.source,
                parameters={
                    "retry_policy": self._config.retry_policy.to_dict(),
                    "fault_type": error_type.value,
                },
                cost=MetabolicCost(energy=2.0, compute_budget=1.0),
                max_attempts=self._config.retry_policy.max_attempts,
            )
            fallback = RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.DEGRADE,
                target=fault.source,
                parameters={"mode": "fallback_model"},
                cost=MetabolicCost(energy=1.0, compute_budget=0.5),
            )
            primary.fallback = fallback
            return primary

        if error_type == ErrorType.LLM_MALFORMED_RESPONSE:
            return RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.DEGRADE,
                target=fault.source,
                parameters={"mode": "template_fill"},
                cost=MetabolicCost(energy=1.0, compute_budget=0.5),
            )

        if error_type == ErrorType.SANDBOX_DIVERGENCE:
            primary = RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.ROLLBACK,
                target="mental_sandbox",
                parameters={"to_checkpoint": "last_stable_scene"},
                cost=MetabolicCost(energy=3.0, compute_budget=2.0),
            )
            fallback = RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.SWITCH_NETWORK,
                target="salience_network",
                parameters={"target_network": "dmn", "reason": "sandbox divergence"},
                cost=MetabolicCost(energy=1.0, compute_budget=0.5),
            )
            primary.fallback = fallback
            return primary

        if error_type in (ErrorType.MEMORY_CORRUPTION, ErrorType.MEMORY_LOSS):
            primary = RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.MEMORY_RECONSTRUCT,
                target="memory_system",
                parameters={"preserve_high_importance": True},
                cost=MetabolicCost(energy=4.0, compute_budget=3.0),
            )
            fallback = RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.SNAPSHOT_RESTORE,
                target="persistence",
                parameters={"verify_identity": True},
                cost=MetabolicCost(energy=2.0, compute_budget=1.0),
            )
            primary.fallback = fallback
            return primary

        if error_type == ErrorType.METABOLISM_COLLAPSE:
            return RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.SWITCH_NETWORK,
                target="salience_network",
                parameters={"target_network": "dmn", "reason": "metabolism collapse"},
                cost=MetabolicCost(energy=0.5, compute_budget=0.5),
            )

        if error_type == ErrorType.BUS_CONGESTION:
            return RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.DEGRADE,
                target="bus",
                parameters={"mode": "throttle"},
                cost=MetabolicCost(energy=1.0, compute_budget=1.0),
            )

        if error_type == ErrorType.PERSISTENCE_FAILURE:
            return RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.DEGRADE,
                target="persistence",
                parameters={"mode": "memory_only"},
                cost=MetabolicCost(energy=1.0, compute_budget=0.5),
            )

        if error_type == ErrorType.IDENTITY_INCONSISTENCY:
            return RecoveryAction(
                fault_id=fault.id,
                strategy=RecoveryStrategy.SAFE_MODE,
                target="system",
                parameters={"reason": "identity inconsistency"},
                cost=MetabolicCost(energy=0.0, compute_budget=0.0),
            )

        # Generic module exceptions: restart module, then degrade.
        primary = RecoveryAction(
            fault_id=fault.id,
            strategy=RecoveryStrategy.RESTART_MODULE,
            target=fault.source,
            parameters={"preserve_memory": True},
            cost=MetabolicCost(energy=2.0, compute_budget=1.0),
        )
        fallback = RecoveryAction(
            fault_id=fault.id,
            strategy=RecoveryStrategy.DEGRADE,
            target=fault.source,
            parameters={"mode": "paused"},
            cost=MetabolicCost(energy=0.5, compute_budget=0.5),
        )
        primary.fallback = fallback
        return primary

    def _dispatch(self, action: RecoveryAction) -> None:
        action.status = "running"
        action.attempt += 1
        self._pending[action.id] = action
        self._actions[action.id] = action
        self._state.custom["actions_dispatched"] += 1

        # Broadcast the action so that Metabolism / EOS / target modules observe it.
        self.emit(
            topic=RECOVERY_ACTION_TOPIC,
            channel="control",
            payload={"action": action.to_dict()},
            priority=9,
            ttl=10,
        )

        # Attempt to execute immediately.
        success, message = self._execute(action)
        if success:
            action.status = "succeeded"
            action.result_message = message
            self._state.custom["actions_succeeded"] += 1
            del self._pending[action.id]
            self._emit_result(action)
        else:
            action.status = "failed"
            action.result_message = message
            self._state.custom["actions_failed"] += 1
            del self._pending[action.id]
            self._emit_result(action)
            if action.fallback is not None:
                fallback = action.fallback
                fallback.id = f"{action.id}-fb"
                fallback.fault_id = action.fault_id
                self._dispatch(fallback)
            elif action.strategy == RecoveryStrategy.SAFE_MODE:
                self._emit_safe_mode(
                    reason=f"安全模式动作失败: {message}",
                    fault=None,
                )

    def _execute(self, action: RecoveryAction) -> tuple[bool, str]:
        """Execute a recovery action and return (success, message)."""
        strategy = action.strategy
        target = action.target
        params = action.parameters

        if strategy == RecoveryStrategy.RETRY:
            # Retry is executed by the caller; RecoveryManager just emits a
            # request and waits for the caller to report the result.
            self._emit(
                "control.recovery.retry",
                {
                    "action_id": action.id,
                    "fault_id": action.fault_id,
                    "target": target,
                    "retry_policy": params.get("retry_policy"),
                },
            )
            return True, "重试请求已发出"

        if strategy == RecoveryStrategy.SWITCH_NETWORK:
            network = params.get("target_network", "dmn")
            reason = params.get("reason", "recovery")
            self._emit(
                "control.network.switch",
                {
                    "target_network": network,
                    "reason": reason,
                    "source": self.name,
                    "recovery_action_id": action.id,
                },
            )
            return True, f"已切换网络到 {network}"

        if strategy == RecoveryStrategy.RESTART_MODULE:
            module = _module_for(self._modules, target)
            if module is None:
                return False, f"未找到模块 {target}"
            try:
                # Re-initialize the module from the current agent context.
                context = getattr(module, "_context", {}) or {}
                module.init(context)
                return True, f"模块 {target} 已重启"
            except Exception as exc:
                return False, f"模块 {target} 重启失败: {exc}"

        if strategy == RecoveryStrategy.DEGRADE:
            mode = params.get("mode", "paused")
            module = _module_for(self._modules, target)
            if module is not None and hasattr(module, "_state"):
                if mode == "paused":
                    module._state.active = False
                elif mode == "fallback_model":
                    module._state.custom["degraded"] = True
                    module._state.custom["degrade_mode"] = "fallback_model"
                elif mode == "template_fill":
                    module._state.custom["degraded"] = True
                    module._state.custom["degrade_mode"] = "template_fill"
                else:
                    module._state.custom["degraded"] = True
                    module._state.custom["degrade_mode"] = mode
            self._emit(
                "control.module.degrade",
                {
                    "target": target,
                    "mode": mode,
                    "recovery_action_id": action.id,
                },
            )
            return True, f"模块 {target} 已降级为 {mode}"

        if strategy == RecoveryStrategy.ROLLBACK:
            module = _module_for(self._modules, target)
            if module is None:
                return False, f"未找到模块 {target}"
            checkpoint = params.get("to_checkpoint")
            if hasattr(module, "rollback") and callable(getattr(module, "rollback")):
                try:
                    module.rollback(checkpoint)
                    return True, f"模块 {target} 已回滚到 {checkpoint}"
                except Exception as exc:
                    return False, f"回滚失败: {exc}"
            # Best-effort: reset to last known module state dict if available.
            if checkpoint and hasattr(module, "from_dict"):
                try:
                    module.from_dict({})
                    return True, f"模块 {target} 已重置"
                except Exception as exc:
                    return False, f"重置失败: {exc}"
            return False, f"模块 {target} 不支持回滚"

        if strategy == RecoveryStrategy.MEMORY_RECONSTRUCT:
            module = _module_for(self._modules, target)
            if module is None:
                return False, f"未找到模块 {target}"
            if hasattr(module, "reconstruct") and callable(getattr(module, "reconstruct")):
                try:
                    preserve = params.get("preserve_high_importance", True)
                    module.reconstruct(preserve_high_importance=preserve)
                    return True, "记忆重构完成"
                except Exception as exc:
                    return False, f"记忆重构失败: {exc}"
            return False, f"模块 {target} 不支持重构"

        if strategy == RecoveryStrategy.SNAPSHOT_RESTORE:
            if self._persistence is None:
                return False, "持久化管理器未绑定"
            snapshot_id = params.get("snapshot_id")
            try:
                self._persistence.restore_snapshot(snapshot_id)
                return True, f"快照 {snapshot_id} 恢复完成"
            except Exception as exc:
                return False, f"快照恢复失败: {exc}"

        if strategy == RecoveryStrategy.SAFE_MODE:
            self._emit_safe_mode(
                reason=params.get("reason", "recovery requested safe mode"),
                fault=None,
            )
            return True, "已进入安全模式"

        return False, f"未支持的恢复策略 {strategy.value}"

    def _handle_recovery_action(self, payload: Any) -> None:
        """Allow external dispatch of recovery actions via the bus."""
        action_data = payload.get("action") if isinstance(payload, dict) else None
        if not isinstance(action_data, dict):
            return
        action = RecoveryAction.from_dict(action_data)
        if action.id not in self._actions:
            self._dispatch(action)

    def _handle_recovery_result(self, payload: Any) -> None:
        """Handle an externally reported outcome for a recovery action.

        Results broadcast by :meth:`_emit_result` for already-finalized
        synchronous actions are ignored to avoid double-counting.  Only actions
        that are still pending and have not been finalized yet are processed.
        """
        action_id = payload.get("action_id") if isinstance(payload, dict) else None
        if action_id is None:
            return
        action = self._pending.get(action_id)
        if action is None or action.status != "running":
            return

        success = bool(payload.get("success", False))
        message = str(payload.get("message", ""))
        if success:
            action.status = "succeeded"
            self._state.custom["actions_succeeded"] += 1
        else:
            action.status = "failed"
            self._state.custom["actions_failed"] += 1
            if action.fallback is not None:
                fallback = action.fallback
                fallback.id = f"{action_id}-fb"
                fallback.fault_id = action.fault_id
                self._dispatch(fallback)
                return
        action.result_message = message
        del self._pending[action_id]
        self._emit_result(action)

    def _emit_result(self, action: RecoveryAction) -> None:
        self._history.append(action)
        self.emit(
            topic=RECOVERY_RESULT_TOPIC,
            channel="control",
            payload={
                "action_id": action.id,
                "fault_id": action.fault_id,
                "strategy": action.strategy.value,
                "target": action.target,
                "status": action.status,
                "message": action.result_message,
                "success": action.status == "succeeded",
            },
            priority=8,
            ttl=5,
        )
        if action.status == "succeeded":
            self.emit(
                topic=RECOVERY_RESOLVED_TOPIC,
                channel="control",
                payload={
                    "action_id": action.id,
                    "fault_id": action.fault_id,
                    "message": action.result_message,
                },
                priority=8,
                ttl=5,
            )

    def _emit_safe_mode(self, reason: str, fault: Fault | None) -> None:
        if self._safe_mode:
            return
        self._safe_mode = True
        self._state.custom["safe_mode_activations"] += 1
        self.emit(
            topic=SAFE_MODE_TOPIC,
            channel="control",
            payload={
                "reason": reason,
                "fault": fault.to_dict() if fault else None,
                "timestamp": _now_ms(),
            },
            priority=10,
            ttl=10,
        )

    def _emit(self, topic: str, payload: dict[str, Any]) -> None:
        """Emit a control message through the module's bound router."""
        self.emit(topic=topic, channel="control", payload=payload, priority=8, ttl=5)

    @property
    def safe_mode(self) -> bool:
        return self._safe_mode

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "safe_mode": self._safe_mode,
                "pending_actions": {aid: a.to_dict() for aid, a in self._pending.items()},
                "actions_dispatched": self._state.custom.get("actions_dispatched", 0),
                "actions_succeeded": self._state.custom.get("actions_succeeded", 0),
                "actions_failed": self._state.custom.get("actions_failed", 0),
                "safe_mode_activations": self._state.custom.get("safe_mode_activations", 0),
            }
        )
        return base

    def get_state(self) -> dict[str, Any]:
        return {
            "active": self._state.active,
            "safe_mode": self._safe_mode,
            "pending_count": len(self._pending),
            "actions_dispatched": self._state.custom.get("actions_dispatched", 0),
            "actions_succeeded": self._state.custom.get("actions_succeeded", 0),
            "actions_failed": self._state.custom.get("actions_failed", 0),
            "safe_mode_activations": self._state.custom.get("safe_mode_activations", 0),
            "latest_faults": [f.to_dict() for f in list(self._history)[-5:]],
        }
