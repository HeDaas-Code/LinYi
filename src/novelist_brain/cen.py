"""Central executive network module for the novelist brain prototype."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from src.novelist_brain.llm import LLMService, MockLLMService
from src.novelist_brain.models import BusMessage, Fragment, ModuleState, TickDelta, Trace
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass
from src.novelist_brain.sandbox_versioning import SandboxVersionManager
from src.novelist_brain.trpg import (
    _DEFAULT_MAX_ROUNDS,
    _DEFAULT_MIN_ROUNDS,
    _DEPTH_THRESHOLDS,
)


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
    _CEN_PHASES: frozenset[str] = frozenset({"creation", "simulation"})

    def __init__(self, name: str = "central_executive_network") -> None:
        # Initialize fields that _initial_state() may read before super().__init__().
        self._goal_stack: list[Goal] = []
        self._current_goal: Goal | None = None
        self._setup_default_goals()
        self._version_manager: SandboxVersionManager | None = None
        self._sandbox_module: Any | None = None
        self._enable_ab_fork = True
        self._ab_max_rounds = 2
        self._ab_in_progress = False
        self._ab_versions: tuple[str, str] = ()
        self._ab_rounds_remaining = 0

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
        self._current_phase: str | None = None
        self._proactive_build_pending = False
        self._narrative_triggered_phases: set[str] = set()
        self._build_phase: str | None = None

        # SubTask 3.3.1 / 3.3.2 — scenario-driven simulation state.
        # Populated when ``data.novel.chapter.intent`` arrives from Planner
        # and consumed by the COC scenario.request → scenario.load →
        # simulate → skill_check.result → narrative.ready loop.  These
        # fields are independent of the legacy ``_sandbox_built`` /
        # ``_awaiting_ready`` flags so the two paths can coexist.
        self._latest_chapter_intent: dict[str, Any] | None = None
        self._latest_chapter_index: int | None = None
        self._current_scenario: dict[str, Any] | None = None
        self._scenario_id: str | None = None
        self._scenario_chapter_index: int | None = None
        self._scenario_round_counter: int = 0
        self._scenario_skill_checks: list[dict[str, Any]] = []
        self._scenario_request_pending: bool = False
        self._scenario_simulate_index: int = 0
        self._scenario_narrative_ready: bool = False

        self.subscribe(
            "control.network.cen.active",
            "control.network.dmn.active",
            "control.network.switch",
            "fragment.insight.new",
            "data.sandbox.narrative.ready",
            "data.memory.trace.query.result",
            "identity.constraints",
            "identity.initialized",
            "data.identity.constraint",
            "data.identity.updated",
            "control.module.init",
            # SubTask 3.3.1 — scenario-driven simulation subscriptions.
            "data.novel.chapter.intent",
            "control.sandbox.scenario.load",
            "data.sandbox.skill_check.result",
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
                "current_phase": None,
                "proactive_build_pending": False,
                "narrative_triggered_phases": [],
                "build_phase": None,
                "enable_ab_fork": self._enable_ab_fork,
                "ab_in_progress": self._ab_in_progress,
                "ab_rounds_remaining": self._ab_rounds_remaining,
                # SubTask 3.3.1 / 3.3.2 — scenario-driven flow projection.
                "scenario_round_counter": 0,
                "scenario_request_pending": False,
                "scenario_narrative_ready": False,
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
                "current_phase": self._current_phase,
                "proactive_build_pending": self._proactive_build_pending,
                "narrative_triggered_phases": list(self._narrative_triggered_phases),
                "build_phase": self._build_phase,
                "enable_ab_fork": self._enable_ab_fork,
                "ab_in_progress": self._ab_in_progress,
                "ab_rounds_remaining": self._ab_rounds_remaining,
                # SubTask 3.3.1 / 3.3.2 — scenario-driven flow projection.
                "scenario_round_counter": self._scenario_round_counter,
                "scenario_request_pending": self._scenario_request_pending,
                "scenario_narrative_ready": self._scenario_narrative_ready,
                "scenario_skill_check_count": len(self._scenario_skill_checks),
            },
        )
        return self._state

    def to_dict(self) -> dict[str, Any]:
        """Serialize CEN state."""
        base = super().to_dict()
        base.update(
            {
                "goal_stack": [g.to_dict() for g in self._goal_stack],
                "current_goal": self._current_goal.to_dict()
                if self._current_goal
                else None,
                "working_memory": [
                    dataclass_to_dict(f) for f in self._working_memory
                ],
                "executive_load": self._executive_load,
                "current_task": self._current_task,
                "sandbox_built": self._sandbox_built,
                "awaiting_ready": self._awaiting_ready,
                "narrative_ready": self._narrative_ready,
                "current_phase": self._current_phase,
                "proactive_build_pending": self._proactive_build_pending,
                "narrative_triggered_phases": list(self._narrative_triggered_phases),
                "build_phase": self._build_phase,
                "latest_traces": [
                    dataclass_to_dict(t) for t in self._latest_traces
                ],
                "identity_constraints": self._identity_constraints,
                "enable_ab_fork": self._enable_ab_fork,
                "ab_max_rounds": self._ab_max_rounds,
                "ab_in_progress": self._ab_in_progress,
                "ab_versions": list(self._ab_versions),
                "ab_rounds_remaining": self._ab_rounds_remaining,
                # SubTask 3.3.1 / 3.3.2 — scenario-driven flow snapshot.
                "latest_chapter_intent": self._latest_chapter_intent,
                "latest_chapter_index": self._latest_chapter_index,
                "current_scenario": self._current_scenario,
                "scenario_id": self._scenario_id,
                "scenario_chapter_index": self._scenario_chapter_index,
                "scenario_round_counter": self._scenario_round_counter,
                "scenario_skill_checks": list(self._scenario_skill_checks),
                "scenario_request_pending": self._scenario_request_pending,
                "scenario_simulate_index": self._scenario_simulate_index,
                "scenario_narrative_ready": self._scenario_narrative_ready,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore CEN state."""
        super().from_dict(data, **kwargs)
        llm = kwargs.get("llm_service")
        if llm is not None:
            self._llm = llm
        self._goal_stack = [
            reconstruct_dataclass(Goal, g)
            for g in data.get("goal_stack", [])
        ]
        current_goal_data = data.get("current_goal")
        self._current_goal = (
            reconstruct_dataclass(Goal, current_goal_data)
            if current_goal_data
            else None
        )
        self._working_memory = [
            reconstruct_dataclass(Fragment, f)
            for f in data.get("working_memory", [])
        ]
        self._executive_load = float(data.get("executive_load", 0.0))
        self._current_task = data.get("current_task", self._current_task)
        self._sandbox_built = bool(data.get("sandbox_built", False))
        self._awaiting_ready = bool(data.get("awaiting_ready", False))
        self._narrative_ready = bool(data.get("narrative_ready", False))
        self._current_phase = data.get("current_phase")
        # These flags are intentionally reset when loading so that a new run/day
        # can generate fresh narrative lines in each high-energy phase.
        self._proactive_build_pending = False
        self._narrative_triggered_phases: set[str] = set()
        self._build_phase = None
        self._latest_traces = [
            reconstruct_dataclass(Trace, t)
            for t in data.get("latest_traces", [])
        ]
        self._identity_constraints = data.get("identity_constraints", {})
        self._enable_ab_fork = bool(data.get("enable_ab_fork", self._enable_ab_fork))
        self._ab_max_rounds = int(data.get("ab_max_rounds", self._ab_max_rounds))
        # A/B state is intentionally reset on load so a resumed run starts fresh.
        self._ab_in_progress = False
        self._ab_versions = ()
        self._ab_rounds_remaining = 0

        # SubTask 3.3.1 / 3.3.2 — restore scenario-driven flow snapshot.
        # ``current_scenario`` is restored best-effort; an in-flight scenario
        # at save time will be re-requested by the next ``data.novel.chapter.intent``.
        intent_data = data.get("latest_chapter_intent")
        self._latest_chapter_intent = (
            dict(intent_data) if isinstance(intent_data, dict) else None
        )
        idx = data.get("latest_chapter_index")
        try:
            self._latest_chapter_index = int(idx) if idx is not None else None
        except (TypeError, ValueError):
            self._latest_chapter_index = None
        scenario_data = data.get("current_scenario")
        self._current_scenario = (
            dict(scenario_data) if isinstance(scenario_data, dict) else None
        )
        self._scenario_id = data.get("scenario_id")
        scenario_chapter = data.get("scenario_chapter_index")
        try:
            self._scenario_chapter_index = (
                int(scenario_chapter) if scenario_chapter is not None else None
            )
        except (TypeError, ValueError):
            self._scenario_chapter_index = None
        self._scenario_round_counter = int(data.get("scenario_round_counter", 0))
        checks_data = data.get("scenario_skill_checks", [])
        self._scenario_skill_checks = [
            c for c in checks_data if isinstance(c, dict)
        ] if isinstance(checks_data, list) else []
        self._scenario_request_pending = False
        self._scenario_simulate_index = int(data.get("scenario_simulate_index", 0))
        # A restored run always re-evaluates the N-round contract from the
        # current counter rather than reusing a stale "ready" flag, so we
        # reset the ready flag and let ``_advance_scenario_round`` decide.
        self._scenario_narrative_ready = False

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

        sandbox_context = context.get("sandbox", {})
        self._version_manager = sandbox_context.get("version_manager")
        self._sandbox_module = sandbox_context.get("sandbox_module")
        self._enable_ab_fork = bool(
            sandbox_context.get("enable_ab_fork", self._enable_ab_fork)
        )
        self._ab_max_rounds = int(
            sandbox_context.get("ab_max_rounds", self._ab_max_rounds)
        )

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
        elif topic in (
            "identity.constraints",
            "identity.initialized",
            "data.identity.constraint",
            "data.identity.updated",
        ):
            payload = message.payload or {}
            constraints = payload.get("constraints")
            if isinstance(constraints, dict):
                self._identity_constraints = constraints
        elif topic == "data.novel.chapter.intent":
            self._handle_chapter_intent_for_scenario(message.payload or {})
        elif topic == "control.sandbox.scenario.load":
            self._handle_scenario_load(message.payload or {})
        elif topic == "data.sandbox.skill_check.result":
            self._handle_skill_check_result(message.payload or {})

    def tick(self, delta: TickDelta) -> None:
        """Advance CEN: drive sandbox simulation until the narrative is ready."""
        self._state.last_tick = delta.absolute_time
        previous_phase = self._current_phase
        self._current_phase = delta.phase

        # Day boundary: entering "morning" marks the start of a new day.
        # Allow fresh sandbox builds in the high-energy phases of the new day.
        if previous_phase is not None and previous_phase != "morning" and delta.phase == "morning":
            self._narrative_triggered_phases.clear()

        # Phase-driven activation: CEN owns the high-energy creation/simulation phases.
        if delta.phase in self._CEN_PHASES:
            if not self._state.active:
                self._activate()
                self.emit(
                    topic="control.network.cen.active",
                    payload={"reason": "phase_driven", "phase": delta.phase},
                    channel="control",
                    priority=8,
                    ttl=3,
                )

            # Proactively schedule a sandbox build once per high-energy phase,
            # even when no external insight fragment has arrived.
            if (
                not self._sandbox_built
                and not self._awaiting_ready
                and delta.phase not in self._narrative_triggered_phases
                and not self._proactive_build_pending
            ):
                self._proactive_build_pending = True
                self._current_task = "基于阶段主动检索记忆"
                interests = self._identity_constraints.get("interests", ["memory"])
                self.emit(
                    topic="control.memory.query",
                    payload={
                        "query_type": "tags",
                        "tags": list(interests)[:5],
                        "limit": 5,
                        "sort_by": "relevance",
                        "requester": self.name,
                        "reason": "phase_driven_proactive_build",
                    },
                    channel="control",
                    priority=6,
                    ttl=3,
                )
                self._broadcast_plan()
        else:
            if self._state.active:
                self._deactivate()
                self.emit(
                    topic="control.network.dmn.active",
                    payload={"reason": "phase_exit", "phase": delta.phase},
                    channel="control",
                    priority=8,
                    ttl=3,
                )

        if not self._state.active:
            return

        self._executive_load = self._compute_executive_load()

        if self._sandbox_built and self._awaiting_ready and not self._narrative_ready:
            if self._enable_ab_fork and self._can_run_ab():
                self._run_ab_step()
            else:
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

        # SubTask 3.3.1 / 3.3.2 — scenario-driven simulation loop.
        # Drives the Planner → CEN → COCMappingEngine → MentalSandbox loop
        # independently of the legacy ``control.sandbox.simulate`` path
        # above.  See ``_advance_scenario_round`` for the N-round contract.
        if self._latest_chapter_intent is not None and not self._scenario_narrative_ready:
            if self._current_scenario is None:
                if not self._scenario_request_pending:
                    self._request_chapter_scenario()
            else:
                self._drive_scenario_simulate()

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

    def _can_run_ab(self) -> bool:
        """Return True if A/B forking can be orchestrated right now."""
        return (
            self._version_manager is not None
            and self._sandbox_module is not None
            and not self._ab_in_progress
        )

    def _run_ab_step(self) -> None:
        """Orchestrate one step of the A/B fork/simulate/merge cycle."""
        assert self._version_manager is not None
        assert self._sandbox_module is not None

        if not self._ab_in_progress:
            # Start A/B: fork baseline and alternative from the live sandbox.
            baseline = self._version_manager.fork(
                self._sandbox_module, label="baseline"
            )
            alternative = self._version_manager.fork(
                self._sandbox_module, label="alternative"
            )
            self._ab_versions = (baseline.id, alternative.id)
            self._ab_in_progress = True
            self._ab_rounds_remaining = max(1, self._ab_max_rounds)
            self._current_task = "脑中世界 A/B 分叉推演"
            self._broadcast_plan()
            return

        a_id, b_id = self._ab_versions
        # Run one simulation round on each branch with different seeds.
        self._version_manager.simulate(a_id, rounds=1, rng_seed=hash(a_id) % (2**31))
        self._version_manager.simulate(b_id, rounds=1, rng_seed=hash(b_id) % (2**31))
        self._ab_rounds_remaining -= 1

        if self._ab_rounds_remaining > 0:
            self._current_task = f"A/B 推演剩余 {self._ab_rounds_remaining} 轮"
            self._broadcast_plan()
            return

        # Compare and merge the winner.
        result = self._version_manager.compare(a_id, b_id)
        winner_id = result["winner_id"]
        loser_id = b_id if winner_id == a_id else a_id
        self._version_manager.merge(self._sandbox_module, winner_id)
        self._version_manager.discard(loser_id)
        self._ab_in_progress = False
        self._ab_versions = ()
        self._ab_rounds_remaining = 0
        self._current_task = f"合并 A/B 优胜分支 {winner_id}"
        self.emit(
            topic="data.sandbox.version.ab_completed",
            payload=result,
            channel="data",
            priority=6,
            ttl=3,
        )
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

        was_proactive = self._proactive_build_pending
        if was_proactive:
            self._proactive_build_pending = False

        if not self._sandbox_built and not self._awaiting_ready:
            self._build_sandbox()

    def _build_sandbox(self) -> None:
        task = Goal("建构脑中世界", "task", 0.8)
        self._push_task(task)
        self._current_task = task.name
        self._sandbox_built = True
        self._awaiting_ready = True
        self._narrative_ready = False
        self._build_phase = self._current_phase

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

    def _handle_narrative_ready(self, _payload: dict[str, Any]) -> None:
        self._awaiting_ready = False
        self._narrative_ready = True
        self._sandbox_built = False

        if self._build_phase in self._CEN_PHASES:
            self._narrative_triggered_phases.add(self._build_phase)
        self._build_phase = None

        task = Goal("叙事线就绪，进入创作执行", "task", 0.6)
        self._push_task(task)
        self._current_task = task.name
        self._broadcast_plan()

    # ------------------------------------------------------------------
    # SubTask 3.3.1 / 3.3.2 — scenario-driven simulation handlers
    # ------------------------------------------------------------------

    def _handle_chapter_intent_for_scenario(self, payload: dict[str, Any]) -> None:
        """Cache the latest ``data.novel.chapter.intent`` for scenario driving.

        Resets any in-flight scenario state so the next tick re-issues a fresh
        ``control.coc.scenario.request``.  The ChapterIntent payload emitted
        by Planner carries the structured intent plus auxiliary metadata
        (``beats``, ``weave_ratios`` …) which we forward verbatim to the
        COC mapping engine.
        """
        if not isinstance(payload, dict):
            return
        chapter_intent = payload.get("chapter_intent")
        if chapter_intent is None:
            return
        # Accept either a ChapterIntent dataclass or its dict form.
        if hasattr(chapter_intent, "to_dict"):
            intent_dict = chapter_intent.to_dict()
        elif isinstance(chapter_intent, dict):
            intent_dict = dict(chapter_intent)
        else:
            return
        chapter_index_raw = (
            getattr(chapter_intent, "chapter_index", None)
            or intent_dict.get("chapter_index")
            or payload.get("chapter_index")
        )
        try:
            chapter_index = (
                int(chapter_index_raw) if chapter_index_raw is not None else None
            )
        except (TypeError, ValueError):
            chapter_index = None

        self._latest_chapter_intent = {
            "chapter_intent": intent_dict,
            "chapter_index": chapter_index,
            "source_narrative_id": payload.get("source_narrative_id"),
            "generated_at": payload.get("generated_at"),
            "beats": payload.get("beats"),
            "emotional_arc_beats": payload.get("emotional_arc_beats"),
            "weave_violations": payload.get("weave_violations"),
            "weave_ratios": payload.get("weave_ratios"),
        }
        self._latest_chapter_index = chapter_index
        # Reset scenario bookkeeping so the new intent drives a fresh round.
        self._current_scenario = None
        self._scenario_id = None
        self._scenario_chapter_index = chapter_index
        self._scenario_round_counter = 0
        self._scenario_skill_checks = []
        self._scenario_request_pending = False
        self._scenario_simulate_index = 0
        self._scenario_narrative_ready = False

        task = Goal("驱动 COC 场景化推演", "task", 0.7)
        self._push_task(task)
        self._current_task = task.name

    def _handle_scenario_load(self, payload: dict[str, Any]) -> None:
        """Cache the scenario returned by COCMappingEngine and prime the loop.

        Only scenarios whose ``chapter_index`` matches the latest cached
        intent are accepted, so a stale ``scenario.load`` from a previous
        chapter cannot corrupt the current run.
        """
        if not isinstance(payload, dict):
            return
        if self._latest_chapter_intent is None:
            return
        scenario_chapter = payload.get("chapter_index")
        try:
            scenario_chapter_int = (
                int(scenario_chapter) if scenario_chapter is not None else None
            )
        except (TypeError, ValueError):
            scenario_chapter_int = None
        expected = self._latest_chapter_index
        if expected is not None and scenario_chapter_int is not None:
            if scenario_chapter_int != expected:
                return
        self._current_scenario = dict(payload)
        self._scenario_id = payload.get("scenario_id") or self._scenario_id
        if scenario_chapter_int is not None:
            self._scenario_chapter_index = scenario_chapter_int
        self._scenario_request_pending = False
        self._scenario_simulate_index = 0

    def _handle_skill_check_result(self, payload: dict[str, Any]) -> None:
        """Collect ``data.sandbox.skill_check.result`` events for the round.

        Defensive: if no scenario is in flight (e.g. legacy simulate also
        happens to emit such events one day), the result is ignored.
        """
        if not isinstance(payload, dict):
            return
        if self._current_scenario is None:
            return
        if self._scenario_narrative_ready:
            return
        self._scenario_skill_checks.append(payload)

    def _request_chapter_scenario(self) -> None:
        """Emit ``control.coc.scenario.request`` for the cached chapter intent."""
        if self._latest_chapter_intent is None:
            return
        chapter_index = self._latest_chapter_index
        if chapter_index is None:
            return
        self._scenario_request_pending = True
        self._current_task = f"请求第 {chapter_index} 章 COC 场景"
        self.emit(
            topic="control.coc.scenario.request",
            payload={
                "chapter_index": chapter_index,
                "chapter_intent": self._latest_chapter_intent.get(
                    "chapter_intent"
                ),
                "requester": self.name,
            },
            channel="control",
            priority=7,
            ttl=3,
        )

    def _drive_scenario_simulate(self) -> None:
        """Emit the next ``control.sandbox.simulate`` for the current round.

        One ``possible_check`` is dispatched per tick.  When all checks in a
        round have been dispatched, the round counter is advanced and the
        N-round contract is re-evaluated.
        """
        assert self._current_scenario is not None
        possible_checks = self._current_scenario.get("possible_checks") or []
        if not isinstance(possible_checks, list):
            possible_checks = []

        if self._scenario_simulate_index < len(possible_checks):
            check = possible_checks[self._scenario_simulate_index]
            if not isinstance(check, dict):
                check = {}
            character_id = self._pick_scenario_character_id()
            skill = check.get("skill")
            difficulty = check.get("difficulty")
            action = check.get("purpose") or check.get("action") or skill or "act"
            idempotency_key = (
                f"{self._scenario_id}:"
                f"r{self._scenario_round_counter}:"
                f"i{self._scenario_simulate_index}"
            )
            self._current_task = (
                f"运行场景推演 第 {self._scenario_round_counter + 1} 轮 "
                f"检定 {self._scenario_simulate_index + 1}/{len(possible_checks)}"
            )
            self.emit(
                topic="control.sandbox.simulate",
                payload={
                    "action": action,
                    "character_id": character_id,
                    "skill": skill,
                    "difficulty": difficulty,
                    "scenario_id": self._scenario_id,
                    "chapter_index": self._scenario_chapter_index,
                    "round": self._scenario_round_counter + 1,
                    "check_index": self._scenario_simulate_index,
                    "idempotency_key": idempotency_key,
                    "current_goal": (
                        self._current_goal.to_dict()
                        if self._current_goal
                        else None
                    ),
                    "current_task": self._current_task,
                },
                channel="control",
                priority=7,
                ttl=3,
            )
            self._scenario_simulate_index += 1
        else:
            # Round complete: roll over to the next round and re-evaluate
            # the N-round contract.
            self._advance_scenario_round()

    def _advance_scenario_round(self) -> None:
        """Increment the round counter and emit narrative.ready if contracted.

        The contract mirrors ``trpg._DEFAULT_MIN_ROUNDS`` (3) and
        ``_DEFAULT_MAX_ROUNDS`` (7): once ``_scenario_round_counter`` reaches
        the minimum and any depth metric clears its threshold, or once the
        maximum is hit, CEN emits ``data.sandbox.narrative.ready`` with the
        aggregated skill-check results and resets the scenario bookkeeping
        so the next ``data.novel.chapter.intent`` starts fresh.
        """
        self._scenario_round_counter += 1
        self._scenario_simulate_index = 0

        depth_metrics = self._compute_scenario_depth_metrics()
        min_met = self._scenario_round_counter >= _DEFAULT_MIN_ROUNDS
        max_met = self._scenario_round_counter >= _DEFAULT_MAX_ROUNDS
        any_metric_passes = any(
            depth_metrics.get(key, 0.0) >= threshold
            for key, threshold in _DEPTH_THRESHOLDS.items()
        )
        ready = max_met or (min_met and any_metric_passes)
        if not ready:
            self._current_task = (
                f"COC 场景推演第 {self._scenario_round_counter} 轮完成，"
                f"未达 N-round 契约（min={_DEFAULT_MIN_ROUNDS}）"
            )
            return

        narrative_line = {
            "scenario_id": self._scenario_id,
            "chapter_index": self._scenario_chapter_index,
            "round": self._scenario_round_counter,
            "skill_checks": list(self._scenario_skill_checks),
            "depth_metrics": depth_metrics,
            "source": "cen_scenario_driven",
        }
        world_state = self._extract_scenario_world_state()
        payload = {
            "narrative_line": narrative_line,
            "narrative_lines": [narrative_line],
            "skill_checks": list(self._scenario_skill_checks),
            "depth_metrics": depth_metrics,
            "simulation_round": self._scenario_round_counter,
            "scenario_id": self._scenario_id,
            "chapter_index": self._scenario_chapter_index,
            "world_state": world_state,
            "source": self.name,
            "origin": "scenario_driven",
        }
        self._scenario_narrative_ready = True
        self._current_task = (
            f"COC 场景推演就绪，第 {self._scenario_round_counter} 轮触发叙事就绪"
        )
        self.emit(
            topic="data.sandbox.narrative.ready",
            payload=payload,
            channel="data",
            priority=7,
            ttl=5,
        )

    def _pick_scenario_character_id(self) -> str | None:
        """Pick the first key NPC's ``character_id`` for the simulate payload."""
        scenario = self._current_scenario or {}
        npcs = scenario.get("key_npcs") or []
        if not isinstance(npcs, list) or not npcs:
            return None
        first = npcs[0]
        if isinstance(first, dict):
            return first.get("character_id") or first.get("name")
        return getattr(first, "character_id", None) or getattr(first, "name", None)

    def _compute_scenario_depth_metrics(self) -> dict[str, float]:
        """Compute a coarse depth-metrics snapshot from collected skill checks.

        Mirrors the keys defined in ``trpg._DEPTH_THRESHOLDS`` so the
        N-round contract evaluation can reuse the same thresholds.  Values
        are intentionally coarse because CEN only sees the skill-check
        results published on the bus; the authoritative metrics still live
        in MentalSandbox.  This is a best-effort signal that lets CEN
        trigger ``narrative.ready`` early when the round clearly produced
        enough conflict / character development.
        """
        checks = self._scenario_skill_checks
        check_count = len(checks)
        successes = sum(
            1
            for c in checks
            if isinstance(c, dict)
            and str(c.get("outcome", "")).lower() in {"success", "hard_success", "extreme_success"}
        )
        conflicts_count = sum(
            1
            for c in checks
            if isinstance(c, dict)
            and str(c.get("outcome", "")).lower() in {"failure", "fumble"}
        )
        # Map coarse signals onto the threshold keys; each metric is in [0, 1].
        conflict_depth = min(1.0, conflicts_count * 0.25)
        character_development = min(1.0, check_count * 0.2)
        emotional_shift = min(1.0, successes * 0.2)
        coherence_score = (
            min(1.0, check_count * 0.25) if check_count > 0 else 0.0
        )
        hook_strength = (
            min(1.0, conflicts_count * 0.35)
            if self._scenario_round_counter >= 1
            else 0.0
        )
        foreshadowing_progress = min(
            1.0, self._scenario_round_counter * 0.25
        )
        scene_variety = min(1.0, check_count * 0.2)
        return {
            "conflict_depth": round(conflict_depth, 3),
            "character_development": round(character_development, 3),
            "emotional_shift": round(emotional_shift, 3),
            "coherence_score": round(coherence_score, 3),
            "hook_strength": round(hook_strength, 3),
            "foreshadowing_progress": round(foreshadowing_progress, 3),
            "scene_variety": round(scene_variety, 3),
        }

    def _extract_scenario_world_state(self) -> dict[str, Any]:
        """Project the cached scenario into a world-state snapshot for the payload."""
        scenario = self._current_scenario or {}
        return {
            "scenario_id": self._scenario_id,
            "chapter_index": self._scenario_chapter_index,
            "campaign_phase": scenario.get("campaign_phase"),
            "location": scenario.get("location"),
            "conflict": scenario.get("conflict"),
            "objective": scenario.get("objective"),
            "key_npcs": [
                npc if isinstance(npc, dict) else getattr(npc, "to_dict", lambda: {})()
                for npc in (scenario.get("key_npcs") or [])
                if npc is not None
            ],
        }

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
