"""Central executive network module for the novelist brain prototype."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from src.novelist_brain.llm import LLMService, MockLLMService
from src.novelist_brain.models import BusMessage, Fragment, ModuleState, TickDelta, Trace
from src.novelist_brain.module import Module


@dataclass
class Goal:
    """A goal on the CEN goal stack."""

    name: str
    goal_type: Literal["life", "daily", "task"] = "task"
    priority: float = 0.5
    status: Literal["active", "completed", "pending"] = "active"
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "goal_type": self.goal_type,
            "priority": self.priority,
            "status": self.status,
        }


class CentralExecutiveNetwork(Module):
    """Foreground central executive network: goal stack, planning, execution.

    CEN maintains a hierarchical goal stack (life_goal -> daily_goal ->
    current_task), buffers insight fragments from DMN, queries memory, and
    drives the mental sandbox through build/simulate control commands.
    """

    _WORKING_MEMORY_CAPACITY = 10

    def __init__(self, name: str = "central_executive_network") -> None:
        # Initialize the goal stack before the base class calls _initial_state().
        self._goal_stack: list[Goal] = []
        self._current_goal: Goal | None = None
        self._setup_default_goals()

        super().__init__(name)
        self._working_memory: list[Fragment] = []
        self._executive_load = 0.0
        self._current_task = "等待系统启动"
        self._llm: LLMService | None = None
        self._identity_constraints: dict[str, Any] = {}
        self._sandbox_built = False
        self._awaiting_ready = False
        self._narrative_ready = False
        self._latest_traces: list[Trace] = []

        self.subscribe(
            "control.network.cen.active",
            "control.network.dmn.active",
            "control.network.switch",
            "fragment.insight.new",
            "data.sandbox.narrative.ready",
            "data.memory.trace.query.result",
            "identity.constraints",
            "identity.initialized",
            "control.module.init",
        )

    def _setup_default_goals(self) -> None:
        life = Goal("持续探索人性与城市记忆的小说创作", "life", 1.0)
        daily = Goal("完成今日的脑中世界推演与叙事生成", "daily", 0.8)
        task = Goal("等待灵感触发", "task", 0.5)
        self._goal_stack = [life, daily, task]
        self._current_goal = task
        self._current_task = task.name

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            last_tick=0.0,
            custom={
                "goal_stack": [g.to_dict() for g in self._goal_stack],
                "current_goal": self._current_goal.to_dict() if self._current_goal else None,
                "current_task": self._current_task,
                "executive_load": 0.0,
                "working_memory_count": 0,
                "sandbox_built": False,
                "awaiting_ready": False,
                "narrative_ready": False,
            },
        )

    def get_state(self) -> ModuleState:
        """Return the current CEN state, including the goal stack."""
        self._state.custom.update(
            {
                "goal_stack": [g.to_dict() for g in self._goal_stack],
                "current_goal": self._current_goal.to_dict() if self._current_goal else None,
                "current_task": self._current_task,
                "executive_load": self._executive_load,
                "working_memory_count": len(self._working_memory),
                "sandbox_built": self._sandbox_built,
                "awaiting_ready": self._awaiting_ready,
                "narrative_ready": self._narrative_ready,
            }
        )
        return self._state

    def init(self, context: dict[str, Any]) -> None:
        """Initialize CEN from agent context."""
        self._llm = context.get("llm_service")
        if self._llm is None:
            self._llm = MockLLMService()

        identity = context.get("identity", {})
        if identity:
            self._identity_constraints = dict(identity)

        goals = context.get("goals", [])
        if goals:
            self._goal_stack = [Goal(**g) for g in goals]
            self._current_goal = self._goal_stack[-1] if self._goal_stack else None
            self._current_task = self._current_goal.name if self._current_goal else ""

    def on_bus_message(self, message: BusMessage) -> None:
        """Handle network switches, insight fragments, memory and sandbox events."""
        topic = message.topic

        if topic == "control.network.cen.active":
            self._activate()
        elif topic == "control.network.dmn.active":
            self._deactivate()
        elif topic == "control.network.switch":
            target = (message.payload or {}).get("target_network")
            if target == "cen":
                self._activate()
            elif target == "dmn":
                self._deactivate()
        elif topic == "fragment.insight.new":
            self._handle_insight(message.payload)
        elif topic == "data.memory.trace.query.result":
            self._handle_query_result(message.payload or {})
        elif topic == "data.sandbox.narrative.ready":
            self._handle_narrative_ready(message.payload or {})
        elif topic in ("identity.constraints", "identity.initialized"):
            payload = message.payload or {}
            constraints = payload.get("constraints")
            if isinstance(constraints, dict):
                self._identity_constraints = constraints

    def tick(self, delta: TickDelta) -> None:
        """Advance CEN: drive sandbox simulation until the narrative is ready."""
        self._state.last_tick = delta.absolute_time
        if not self._state.active:
            return

        self._executive_load = self._compute_executive_load()

        if self._sandbox_built and self._awaiting_ready and not self._narrative_ready:
            self._current_task = "运行脑中世界推演"
            self.emit(
                topic="control.sandbox.simulate",
                payload={
                    "current_goal": self._current_goal.to_dict() if self._current_goal else None,
                    "current_task": self._current_task,
                    "round_hint": len(self._working_memory),
                },
                channel="control",
                priority=7,
                ttl=3,
            )

        self._broadcast_plan()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _activate(self) -> None:
        self.resume()
        self._current_task = "建构脑中世界"
        task = Goal("建构脑中世界", "task", 0.7)
        self._push_task(task)
        self._broadcast_plan()

    def _deactivate(self) -> None:
        self.pause()
        self._current_task = "后台待机"
        self._broadcast_plan()

    def _push_task(self, task: Goal) -> None:
        # Keep the stack ordered life -> daily -> task.
        self._goal_stack = [g for g in self._goal_stack if g.goal_type != "task"]
        self._goal_stack.append(task)
        self._current_goal = task

    def _handle_insight(self, payload: Any) -> None:
        fragment = self._coerce_fragment(payload)
        if fragment is None:
            return

        self._working_memory.append(fragment)
        self._trim_working_memory()

        task = Goal("基于灵感检索记忆痕迹", "task", 0.75)
        self._push_task(task)
        self._current_task = task.name
        self._narrative_ready = False

        self.emit(
            topic="control.memory.query",
            payload={
                "query_type": "tags",
                "tags": list(fragment.tags) if fragment.tags else ["insight"],
                "limit": 5,
                "sort_by": "relevance",
                "requester": self.name,
            },
            channel="control",
            priority=6,
            ttl=3,
        )
        self._broadcast_plan()

    def _handle_query_result(self, payload: dict[str, Any]) -> None:
        criteria = payload.get("criteria", {})
        if criteria.get("requester") != self.name:
            return

        results = payload.get("results", [])
        traces: list[Trace] = []
        for item in results:
            if isinstance(item, Trace):
                traces.append(item)
            elif isinstance(item, dict):
                traces.append(Trace(**item))
        self._latest_traces = traces

        if not self._state.active:
            return

        if not self._sandbox_built:
            self._build_sandbox()

    def _build_sandbox(self) -> None:
        task = Goal("建构脑中世界", "task", 0.8)
        self._push_task(task)
        self._current_task = task.name
        self._sandbox_built = True
        self._awaiting_ready = True
        self._narrative_ready = False

        trace_ids = [t.id for t in self._latest_traces]
        payload = {
            "trace_ids": trace_ids,
            "traces": [
                {
                    "id": t.id,
                    "content": t.content,
                    "tags": t.tags,
                    "narrative_role": t.narrative_role,
                }
                for t in self._latest_traces
            ],
            "current_goal": self._current_goal.to_dict() if self._current_goal else None,
            "identity_constraints": self._identity_constraints,
            "working_memory": [
                {"id": f.id, "content": f.content, "tags": f.tags}
                for f in self._working_memory[-3:]
            ],
        }

        self.emit(
            topic="control.sandbox.build",
            payload=payload,
            channel="control",
            priority=8,
            ttl=5,
        )
        self._broadcast_plan()

    def _handle_narrative_ready(self, payload: dict[str, Any]) -> None:
        self._awaiting_ready = False
        self._narrative_ready = True
        self._sandbox_built = False

        task = Goal("叙事线就绪，进入创作执行", "task", 0.6)
        self._push_task(task)
        self._current_task = task.name
        self._broadcast_plan()

    def _compute_executive_load(self) -> float:
        load = 0.0
        load += min(1.0, len(self._working_memory) * 0.1)
        if self._awaiting_ready:
            load += 0.5
        if self._sandbox_built:
            load += 0.3
        return float(round(min(1.0, load), 3))

    def _trim_working_memory(self) -> None:
        while len(self._working_memory) > self._WORKING_MEMORY_CAPACITY:
            self._working_memory.pop(0)

    def _broadcast_plan(self) -> None:
        plan_text = self._generate_plan_text()
        payload = {
            "goal_stack": [g.to_dict() for g in self._goal_stack],
            "current_goal": self._current_goal.to_dict() if self._current_goal else None,
            "current_task": self._current_task,
            "executive_load": self._executive_load,
            "sandbox_built": self._sandbox_built,
            "awaiting_ready": self._awaiting_ready,
            "narrative_ready": self._narrative_ready,
            "working_memory_count": len(self._working_memory),
            "plan_text": plan_text,
        }
        self.emit(
            topic="data.cen.plan",
            payload=payload,
            channel="data",
            priority=4,
            ttl=2,
        )

    def _generate_plan_text(self) -> str:
        goals = " -> ".join(g.name for g in self._goal_stack)
        prompt = (
            f"Create a concise executive plan. Goals: {goals}. "
            f"Current task: {self._current_task}. "
            f"Identity: {self._identity_constraints.get('self_narrative', '')}"
        )
        if self._llm is not None:
            text = self._llm.complete(prompt, max_tokens=120).strip()
            if text:
                return text
        return f"目标层级：{goals}；当前任务：{self._current_task}"

    @staticmethod
    def _coerce_fragment(payload: Any) -> Fragment | None:
        if payload is None:
            return None
        if isinstance(payload, Fragment):
            return payload
        if isinstance(payload, dict):
            return Fragment(**payload)
        return None
