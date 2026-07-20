"""Mental sandbox module for the novelist brain prototype."""

from __future__ import annotations

import random
from typing import Any

from src.novelist_brain.llm import LLMService, MockLLMService
from src.novelist_brain.models import (
    BusMessage,
    CharacterProjection,
    Conflict,
    Desire,
    Fear,
    ModuleState,
    NarrativeLine,
    Scene,
    TickDelta,
    Trace,
    TraitVector,
    WorldModel,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass
from src.novelist_brain.trpg import (
    GameMaster,
    SkillCheckOutcome,
    TRPGCharacterSheet,
    build_character_sheet,
    build_narrative_line,
    emotional_shift_for_outcome,
    projection_ratio_for_archetype,
    resolve_skill_check,
)
from src.novelist_brain.trpg_rulebook import Rulebook
from src.novelist_brain.trpg_state import ActorState
from src.novelist_brain import trpg_extended
from src.novelist_brain.sandbox_versioning import SandboxVersionManager


_DEFAULT_MIN_ROUNDS = 3
_DEFAULT_MAX_ROUNDS = 7
_DEPTH_THRESHOLDS = {
    "conflict_depth": 0.6,
    "character_development": 0.5,
    "emotional_shift": 0.5,
    "coherence_score": 0.6,
}


class MentalSandbox(Module):
    """Holds the internal story world and runs COC-style simulation rounds.

    The sandbox maintains a :class:`WorldModel`, a cast of
    :class:`CharacterProjection`s, a current :class:`Scene`, and a growing
    :class:`NarrativeLine`.  It responds to ``control.sandbox.build`` and
    ``control.sandbox.simulate`` messages, projects characters from memory
    traces, and eventually publishes ``data.sandbox.narrative.ready`` once the
    N-round contract is satisfied.
    """

    def __init__(
        self,
        name: str = "mental_sandbox",
        llm_service: LLMService | None = None,
        min_rounds: int = _DEFAULT_MIN_ROUNDS,
        max_rounds: int = _DEFAULT_MAX_ROUNDS,
        depth_thresholds: dict[str, float] | None = None,
    ) -> None:
        super().__init__(name)
        self._llm = llm_service if llm_service is not None else MockLLMService()
        self._rng = random.Random()
        self._min_rounds = min_rounds
        self._max_rounds = max_rounds
        self._depth_thresholds = dict(_DEPTH_THRESHOLDS)
        if depth_thresholds is not None:
            self._depth_thresholds.update(depth_thresholds)

        self._world_model: WorldModel | None = None
        self._characters: list[CharacterProjection] = []
        self._current_scene: Scene | None = None
        self._narrative_lines: list[NarrativeLine] = []
        self._prediction_errors: list[dict[str, Any]] = []
        self._simulation_round = 0
        self._identity_constraints: dict[str, Any] = {}
        self._pending_traces: list[Trace] = []
        self._rulebook: Rulebook | None = None
        self._gm = GameMaster(rulebook=Rulebook(), rng=self._rng)
        self._character_sheets: dict[str, TRPGCharacterSheet] = {}
        self._actor_states: dict[str, ActorState] = {}
        self._skill_checks: list[Any] = []
        self._current_chase: trpg_extended.Chase | None = None
        self._current_combat: trpg_extended.CombatRound | None = None
        self._version_manager: SandboxVersionManager | None = None

        self.subscribe(
            "control.sandbox.build",
            "control.sandbox.simulate",
            "data.memory.trace.query.result",
            "data.identity.constraint",
            "data.identity.updated",
            "control.module.init",
            "data.social.trace",
            "control.sandbox.fork",
            "control.sandbox.version.merge",
            "control.sandbox.version.discard",
        )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.25,
            custom={
                "simulation_round": 0,
                "narrative_line_count": 0,
                "character_count": 0,
                "world_built": False,
            },
        )

    def init(self, context: dict[str, Any]) -> None:
        """Initialize sandbox from agent context."""
        sandbox_context = context.get("sandbox", {})
        self._min_rounds = sandbox_context.get("min_rounds", self._min_rounds)
        self._max_rounds = sandbox_context.get("max_rounds", self._max_rounds)
        self._depth_thresholds.update(
            sandbox_context.get("depth_thresholds", {})
        )

        seed = sandbox_context.get("seed")
        if seed is not None:
            self._rng = random.Random(seed)
            if self._llm.is_mock:
                self._llm = MockLLMService(seed=seed)

        world_data = sandbox_context.get("world")
        if world_data:
            self._world_model = WorldModel(**world_data)
        if self._world_model is None:
            self._world_model = WorldModel(
                name="default",
                ontology={"genre": "literary fiction", "tone": "melancholic"},
                rules=[
                    "actions have emotional consequences",
                    "randomness shapes fate",
                ],
                current_state={"time": "morning", "mood": "quiet"},
            )

        self._identity_constraints = context.get("identity", self._identity_constraints)

        self._rulebook = context.get("sandbox", {}).get("rulebook")
        if self._rulebook is None:
            self._rulebook = Rulebook()
        if self._world_model is not None:
            self._gm = GameMaster(
                rulebook=self._rulebook,
                world_rules=self._world_model.rules,
                rng=self._rng,
            )

        enable_ab_fork = sandbox_context.get("enable_ab_fork", True)
        max_versions = sandbox_context.get("max_versions", 8)
        context_vm = sandbox_context.get("version_manager")
        if context_vm is not None:
            self._version_manager = context_vm
        elif enable_ab_fork and self._version_manager is None:
            self._version_manager = SandboxVersionManager(max_versions=max_versions)

        self._process_pending_traces()
        self._ensure_protagonist_projection()
        self._ensure_narrative_line()
        self._rebuild_character_sheets()
        self._state.custom["world_built"] = True
        self._emit_world_updated("sandbox.initialized")

    def on_bus_message(self, message: BusMessage) -> None:
        """Dispatch sandbox control and data messages."""
        if not self._state.active:
            return
        if message.topic == "control.sandbox.build":
            self._handle_build(message.payload)
        elif message.topic == "control.sandbox.simulate":
            self._handle_simulate(message.payload)
        elif message.topic == "data.memory.trace.query.result":
            self._handle_trace_results(message.payload)
        elif message.topic in ("data.identity.constraint", "data.identity.updated"):
            self._handle_identity_constraint(message.payload)
        elif message.topic == "data.social.trace":
            self._handle_social_trace(message.payload)
        elif message.topic == "control.sandbox.fork":
            self._handle_fork(message.payload or {})
        elif message.topic == "control.sandbox.version.merge":
            self._handle_version_merge(message.payload or {})
        elif message.topic == "control.sandbox.version.discard":
            self._handle_version_discard(message.payload or {})

    def tick(self, delta: TickDelta) -> None:
        """Advance sandbox bookkeeping by one tick."""
        self._state.last_tick = delta.absolute_time

    def get_state(self) -> dict[str, Any]:
        """Return a serializable snapshot of sandbox state."""
        return {
            "active": self._state.active,
            "energy_cost": self._state.energy_cost,
            "last_tick": self._state.last_tick,
            "simulation_round": self._simulation_round,
            "character_count": len(self._characters),
            "narrative_line_count": len(self._narrative_lines),
            "world_built": self._world_model is not None,
            "current_scene_id": self._current_scene.id if self._current_scene else None,
            "depth_metrics": self._compute_depth_metrics(),
        }

    def to_dict(self) -> dict[str, Any]:
        """Serialize the full mental sandbox state."""
        base = super().to_dict()
        base.update(
            {
                "min_rounds": self._min_rounds,
                "max_rounds": self._max_rounds,
                "depth_thresholds": self._depth_thresholds,
                "world_model": dataclass_to_dict(self._world_model)
                if self._world_model
                else None,
                "characters": [dataclass_to_dict(c) for c in self._characters],
                "current_scene": dataclass_to_dict(self._current_scene)
                if self._current_scene
                else None,
                "narrative_lines": [
                    dataclass_to_dict(line) for line in self._narrative_lines
                ],
                "prediction_errors": list(self._prediction_errors),
                "simulation_round": self._simulation_round,
                "identity_constraints": self._identity_constraints,
                "pending_traces": [
                    dataclass_to_dict(t) for t in self._pending_traces
                ],
                "character_sheets": {
                    cid: (
                        sheet.to_dict()
                        if hasattr(sheet, "to_dict")
                        else dataclass_to_dict(sheet)
                    )
                    for cid, sheet in self._character_sheets.items()
                },
                "skill_checks": [
                    c.to_dict() if hasattr(c, "to_dict") else c
                    for c in self._skill_checks
                ],
                "rulebook": self._rulebook.to_dict() if self._rulebook else None,
                "actor_states": {
                    cid: state.to_dict()
                    for cid, state in self._actor_states.items()
                },
                "current_chase": self._current_chase.to_dict()
                if self._current_chase
                else None,
                "current_combat": self._current_combat.to_dict()
                if self._current_combat
                else None,
                "version_manager": self._version_manager.to_dict()
                if self._version_manager
                else None,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore the full mental sandbox state."""
        super().from_dict(data, **kwargs)
        llm = kwargs.get("llm_service")
        if llm is not None:
            self._llm = llm
        self._rng = random.Random()
        self._min_rounds = int(data.get("min_rounds", self._min_rounds))
        self._max_rounds = int(data.get("max_rounds", self._max_rounds))
        self._depth_thresholds = dict(
            data.get("depth_thresholds", self._depth_thresholds)
        )

        world_data = data.get("world_model")
        self._world_model = (
            reconstruct_dataclass(WorldModel, world_data) if world_data else None
        )
        self._characters = [
            reconstruct_dataclass(CharacterProjection, c)
            for c in data.get("characters", [])
        ]
        scene_data = data.get("current_scene")
        self._current_scene = (
            reconstruct_dataclass(Scene, scene_data) if scene_data else None
        )
        self._narrative_lines = [
            reconstruct_dataclass(NarrativeLine, line)
            for line in data.get("narrative_lines", [])
        ]
        self._prediction_errors = list(data.get("prediction_errors", []))
        self._simulation_round = int(data.get("simulation_round", 0))
        self._identity_constraints = data.get("identity_constraints", {})
        self._pending_traces = [
            reconstruct_dataclass(Trace, t)
            for t in data.get("pending_traces", [])
        ]

        seed = data.get("seed")
        if seed is not None:
            self._rng = random.Random(seed)

        rulebook_data = data.get("rulebook")
        self._rulebook = Rulebook(rulebook_data) if rulebook_data else Rulebook()

        if self._world_model is not None:
            self._gm = GameMaster(
                rulebook=self._rulebook,
                world_rules=self._world_model.rules,
                rng=self._rng,
            )
        self._rebuild_character_sheets()

        version_manager_data = data.get("version_manager")
        if version_manager_data:
            self._version_manager = SandboxVersionManager.from_dict(
                version_manager_data
            )

        self._state.custom["simulation_round"] = self._simulation_round
        self._state.custom["character_count"] = len(self._characters)
        self._state.custom["narrative_line_count"] = len(self._narrative_lines)
        self._state.custom["world_built"] = self._world_model is not None

    # ------------------------------------------------------------------
    # Public accessors
    # ------------------------------------------------------------------

    @property
    def world_model(self) -> WorldModel | None:
        return self._world_model

    @property
    def characters(self) -> list[CharacterProjection]:
        return list(self._characters)

    @property
    def current_scene(self) -> Scene | None:
        return self._current_scene

    @property
    def narrative_lines(self) -> list[NarrativeLine]:
        return list(self._narrative_lines)

    @property
    def current_narrative_line(self) -> NarrativeLine | None:
        return self._narrative_lines[-1] if self._narrative_lines else None

    @property
    def simulation_round(self) -> int:
        return self._simulation_round

    @property
    def version_manager(self) -> SandboxVersionManager | None:
        return self._version_manager

    # ------------------------------------------------------------------
    # Message handlers
    # ------------------------------------------------------------------

    def _handle_build(self, payload: Any) -> None:
        """Construct or modify the mental world."""
        payload = payload or {}
        if not isinstance(payload, dict):
            payload = {}

        if payload.get("reset", False):
            self._reset_simulation()

        if self._world_model is None or payload.get("world"):
            world_data = payload.get("world", {"name": "default"})
            self._world_model = WorldModel(**world_data)

        scene_data = payload.get("scene")
        if scene_data:
            self._current_scene = Scene(**scene_data)
        elif self._current_scene is None and self._world_model is not None:
            self._current_scene = self._create_default_scene()

        characters_data = payload.get("characters", [])
        for char_data in characters_data:
            if isinstance(char_data, CharacterProjection):
                self._characters.append(char_data)
            elif isinstance(char_data, dict):
                self._characters.append(CharacterProjection(**char_data))

        self._process_pending_traces()
        self._ensure_protagonist_projection()
        self._ensure_narrative_line()
        self._rebuild_character_sheets()
        self._state.custom["world_built"] = True
        self._emit_world_updated("data.sandbox.world.updated")

        for character in self._characters:
            self.emit(
                topic="data.sandbox.character.updated",
                payload={"character": character, "source": "build"},
                channel="data",
                priority=5,
                ttl=3,
            )
            self.emit(
                topic="data.sandbox.character.action",
                payload={
                    "character_id": character.id,
                    "autonomy_score": 1.0 - character.projection_ratio,
                    "action": "在场景中显形",
                    "source": "build",
                },
                channel="data",
                priority=4,
                ttl=2,
            )

    def _simulate_round(
        self,
        action: str | None = None,
        character_id: str | None = None,
        evaluate_ready: bool = False,
    ) -> dict[str, Any]:
        """Run one simulation round and return its resolution.

        This is the core simulation step used both by the live ``_handle_simulate``
        and by the version manager's what-if simulations.  Bus emissions and
        narrative-ready evaluation are optional so that forked versions can run
        silently.
        """
        if self._world_model is None:
            raise RuntimeError("sandbox world model is not built")
        if self._current_scene is None:
            self._current_scene = self._create_default_scene()

        if action is None:
            action = self._generate_action()
        character = self._resolve_actor(character_id)

        resolution = self._resolve_event(action, character)
        self._simulation_round += 1
        self._prediction_errors.append(
            {
                "round": self._simulation_round,
                "dice": resolution["dice"],
                "target": resolution["target"],
                "outcome": resolution["outcome"],
                "emotional_shift": resolution["emotional_shift"],
                "action": action,
            }
        )

        if self._world_model is not None:
            self._world_model.prediction_errors.append(
                {
                    "round": self._simulation_round,
                    "expected": resolution["target"],
                    "observed": resolution["dice"],
                    "error": abs(resolution["dice"] - resolution["target"]),
                }
            )
            self._world_model.history.append(
                f"Round {self._simulation_round}: {action} -> {resolution['outcome']}"
            )
            self._world_model.current_state["last_outcome"] = resolution["outcome"]
            self._world_model.current_state["last_action"] = action

        self._update_scene_and_characters(resolution, character)
        self._state.custom["simulation_round"] = self._simulation_round

        if self._router is not None:
            self.emit(
                topic="data.sandbox.event.resolved",
                payload=resolution,
                channel="data",
                priority=6,
                ttl=3,
            )
            self._emit_world_updated("data.sandbox.world.updated")
            if character is not None:
                self.emit(
                    topic="data.sandbox.character.updated",
                    payload={"character": character, "source": "simulate"},
                    channel="data",
                    priority=5,
                    ttl=3,
                )
                autonomy = 1.0 - character.projection_ratio
                if resolution.get("outcome") in ("大成功", "大失败"):
                    autonomy = min(1.0, autonomy + 0.15)
                self.emit(
                    topic="data.sandbox.character.action",
                    payload={
                        "character_id": character.id,
                        "autonomy_score": round(autonomy, 3),
                        "action": action,
                        "outcome": resolution.get("outcome"),
                        "source": "simulate",
                    },
                    channel="data",
                    priority=4,
                    ttl=2,
                )

        if evaluate_ready:
            self._evaluate_narrative_ready()

        return resolution

    def _handle_simulate(self, payload: Any) -> None:
        """Run one COC-style simulation round (live mode with bus emits)."""
        if self._world_model is None:
            return
        if self._current_scene is None:
            self._current_scene = self._create_default_scene()

        payload = payload or {}
        if not isinstance(payload, dict):
            payload = {}

        self._simulate_round(
            action=payload.get("action"),
            character_id=payload.get("character_id"),
            evaluate_ready=True,
        )

    def _handle_trace_results(self, payload: Any) -> None:
        """Project characters from memory trace query results."""
        if payload is None:
            return
        if not isinstance(payload, dict):
            return
        results = payload.get("results", [])
        if not results:
            return

        for item in results:
            trace: Trace | None = None
            if isinstance(item, Trace):
                trace = item
            elif isinstance(item, dict):
                trace = Trace(**item)
            elif isinstance(item, tuple):
                # Some query results may be (score, trace) pairs.
                candidate = item[-1]
                trace = candidate if isinstance(candidate, Trace) else Trace(**candidate)
            if trace is None:
                continue

            if trace.narrative_role == "character" or _looks_like_character(trace):
                self._pending_traces.append(trace)
            elif self._world_model is not None:
                # Enrich the world model with setting/event/theme traces.
                self._world_model.ontology.setdefault("memory_traces", []).append(
                    {"id": trace.id, "role": trace.narrative_role, "content": trace.content}
                )

        if self._state.custom.get("world_built"):
            self._process_pending_traces()

    def _handle_identity_constraint(self, payload: Any) -> None:
        """Store identity constraints for later injection."""
        if isinstance(payload, dict) and "constraints" in payload:
            self._identity_constraints = payload["constraints"]
        elif isinstance(payload, dict):
            self._identity_constraints = payload

    def _handle_social_trace(self, payload: Any) -> None:
        """Incorporate social traces as world-model ontology and scene seeds."""
        if not isinstance(payload, dict):
            return
        if self._world_model is None:
            return
        fragment = payload.get("fragment")
        if fragment is None:
            return
        content = getattr(fragment, "content", str(fragment))
        self._world_model.ontology.setdefault("social_traces", []).append(
            {
                "space_id": payload.get("space_id"),
                "role_id": payload.get("role_id"),
                "gaze_pressure": payload.get("gaze_pressure", 0.0),
                "dialogue_mode": payload.get("dialogue_mode", "surface"),
                "content": content,
            }
        )
        # High-gaze social traces bleed into the current scene tension.
        gaze = float(payload.get("gaze_pressure", 0.0) or 0.0)
        if gaze > 0.5 and self._current_scene is not None:
            self._current_scene.conflict_level = min(
                1.0, self._current_scene.conflict_level + gaze * 0.1
            )

    def _handle_fork(self, payload: dict[str, Any]) -> None:
        """Create a new sandbox version from the current state."""
        if self._version_manager is None:
            return
        label = payload.get("label", "fork")
        version = self._version_manager.fork(self, label=label)
        self.emit(
            topic="data.sandbox.version.forked",
            payload={
                "version_id": version.id,
                "parent_id": version.parent_id,
                "label": version.label,
                "current_version_id": self._version_manager.current_version_id,
            },
            channel="data",
            priority=6,
            ttl=3,
        )

    def _handle_version_merge(self, payload: dict[str, Any]) -> None:
        """Merge a version back into the live sandbox."""
        if self._version_manager is None:
            return
        version_id = payload.get("version_id")
        if not version_id:
            return
        self._version_manager.merge(self, version_id)
        self._emit_world_updated("data.sandbox.world.updated")
        self.emit(
            topic="data.sandbox.version.merged",
            payload={
                "version_id": version_id,
                "current_version_id": self._version_manager.current_version_id,
            },
            channel="data",
            priority=6,
            ttl=3,
        )

    def _handle_version_discard(self, payload: dict[str, Any]) -> None:
        """Mark a version as abandoned."""
        if self._version_manager is None:
            return
        version_id = payload.get("version_id")
        if not version_id:
            return
        self._version_manager.discard(version_id)
        self.emit(
            topic="data.sandbox.version.discarded",
            payload={"version_id": version_id},
            channel="data",
            priority=5,
            ttl=2,
        )

    # ------------------------------------------------------------------
    # COC-style resolution
    # ------------------------------------------------------------------

    def _world_model_modifier(self) -> float:
        """Return a small modifier derived from world rules and chance."""
        modifier = self._rng.uniform(-10.0, 10.0)
        if self._world_model and self._world_model.rules:
            modifier += len(self._world_model.rules) * 2.0 - 5.0
        return modifier

    def _resolve_event(
        self, action: str, character: CharacterProjection | None
    ) -> dict[str, Any]:
        """Resolve one sandbox round using the TRPG skill-check system.

        If a character sheet exists for the acting character, the GM resolves
        the round with a proper COC-style check.  Depending on the action
        keywords and the current scene's conflict level, the GM may escalate to
        an opposed check, a chase, or a combat round.  Otherwise the method
        falls back to the legacy trait-based resolution so that the module is
        never blocked by missing character sheets.
        """
        if character is not None and character.id in self._character_sheets:
            sheet = self._character_sheets[character.id]
            conflict_level = getattr(self._current_scene, "conflict_level", 0.0) or 0.0
            other_characters = [c for c in self._characters if c.id != character.id]

            resolution = self._resolve_trpg_action(
                action=action,
                character=character,
                sheet=sheet,
                conflict_level=conflict_level,
                other_characters=other_characters,
            )
            skill_check_obj = resolution.pop("_skill_check_obj", None)
            if skill_check_obj is not None:
                self._skill_checks.append(skill_check_obj)
                resolution["skill_check"] = skill_check_obj.to_dict()
            return resolution

        # Legacy fallback path.
        base_difficulty = 50.0
        if character is not None:
            base_difficulty += (character.traits.conscientiousness - 0.5) * 20.0
            base_difficulty += (character.traits.openness - 0.5) * 10.0
            base_difficulty -= (character.traits.neuroticism - 0.5) * 10.0

        target = max(5.0, min(95.0, base_difficulty + self._world_model_modifier()))
        dice = self._rng.randint(1, 100)

        if dice <= 5:
            outcome = "大成功"
        elif dice <= target:
            outcome = "成功"
        elif dice >= 96:
            outcome = "大失败"
        else:
            outcome = "失败"

        consequences = self._generate_consequences(action, outcome, character)
        emotional_shift = self._compute_emotional_shift(outcome, character)

        return {
            "dice": dice,
            "target": round(target, 2),
            "outcome": outcome,
            "action": action,
            "consequences": consequences,
            "emotional_shift": round(emotional_shift, 3),
            "round": self._simulation_round + 1,
            "character_id": character.id if character else None,
            "scene_id": self._current_scene.id if self._current_scene else None,
            "skill_check": None,
            "sanity_result": None,
            "scene_delta": {},
        }

    def _resolve_trpg_action(
        self,
        action: str,
        character: CharacterProjection,
        sheet: TRPGCharacterSheet,
        conflict_level: float,
        other_characters: list[CharacterProjection],
    ) -> dict[str, Any]:
        """Dispatch the right TRPG mechanic based on action and scene tension."""
        action_lower = action.lower()
        modifier = self._world_model_modifier()

        opposed_keywords = ["对抗", "较量", "阻止", "压制", "争执", "争辩"]
        chase_keywords = ["追", "逃", "追赶", "逃离", "追踪"]
        combat_keywords = ["战斗", "攻击", "保护", "搏斗", "击打"]

        is_opposed = any(kw in action_lower for kw in opposed_keywords)
        is_chase = any(kw in action_lower for kw in chase_keywords)
        is_combat = any(kw in action_lower for kw in combat_keywords)

        scene = self._current_scene
        scene_id = scene.id if scene else None

        # Combat: high conflict or explicit combat action.
        if is_combat or (conflict_level >= 0.8 and other_characters):
            attackers = [sheet]
            defender_sheets = [
                self._character_sheets[c.id]
                for c in other_characters[:1]
                if c.id in self._character_sheets
            ] or [build_character_sheet(other_characters[0], rng=self._rng)] if other_characters else []
            if defender_sheets:
                combat_round = self._gm.resolve_combat_round(attackers, defender_sheets)
                self._current_combat = combat_round
                self._apply_combat_damage(combat_round, attackers + defender_sheets)
                narration = combat_round.narration
                for attack in combat_round.attacks:
                    narration += (
                        f" {attack.get('attacker_id', '?')} 攻击 "
                        f"{attack.get('defender_id', '?')}："
                        f"{'命中' if attack.get('hit') else '未命中'}"
                        f"（伤害 {attack.get('damage', 0)}）。"
                    )
                consequences = self._generate_consequences(action, "战斗", character)
                consequences = f"{narration} {consequences}"
                emotional_shift = self._combat_emotional_shift(combat_round)
                return {
                    "dice": min(
                        (a.get("attack_roll", 100) for a in combat_round.attacks),
                        default=100,
                    ),
                    "target": 0,
                    "outcome": "战斗",
                    "action": action,
                    "consequences": consequences,
                    "emotional_shift": round(emotional_shift, 3),
                    "round": self._simulation_round + 1,
                    "character_id": character.id,
                    "scene_id": scene_id,
                    "_skill_check_obj": None,
                    "skill_check": None,
                    "sanity_result": None,
                    "scene_delta": {
                        "tension_delta": abs(emotional_shift),
                        "emotional_tone": emotional_shift,
                        "combat_round": combat_round.to_dict(),
                    },
                }

        # Chase: movement or pursuit keywords.
        if is_chase and other_characters:
            quarry = sheet
            hunter = self._character_sheets.get(
                other_characters[0].id,
                build_character_sheet(other_characters[0], rng=self._rng),
            )
            chase = self._gm.resolve_chase(
                quarry=quarry,
                hunter=hunter,
                obstacle=scene.setting if scene else "",
                initial_distance=5.0,
            )
            self._current_chase = chase
            consequences = self._generate_consequences(action, "追逐", character)
            consequences = f"{chase.narration} {consequences}"
            emotional_shift = 0.3 if not chase.resolved else 0.6
            return {
                "dice": 0,
                "target": 0,
                "outcome": "追逐",
                "action": action,
                "consequences": consequences,
                "emotional_shift": round(emotional_shift, 3),
                "round": self._simulation_round + 1,
                "character_id": character.id,
                "scene_id": scene_id,
                "_skill_check_obj": None,
                "skill_check": None,
                "sanity_result": None,
                "scene_delta": {
                    "tension_delta": abs(emotional_shift),
                    "emotional_tone": emotional_shift,
                    "chase": chase.to_dict(),
                },
            }

        # Opposed check: social/physical confrontation.
        if is_opposed or (conflict_level >= 0.6 and other_characters):
            responder = self._character_sheets.get(
                other_characters[0].id,
                build_character_sheet(other_characters[0], rng=self._rng),
            )
            opposed = self._gm.resolve_opposed(action, sheet, responder)
            winner_id = opposed.winner_id
            winner_name = (
                character.name if winner_id == character.id else responder.name
            )
            outcome_cn = "成功" if winner_id == character.id else "失败"
            narration = opposed.narration
            consequences = self._generate_consequences(action, outcome_cn, character)
            consequences = f"{narration} {consequences}"
            emotional_shift = 0.4 if winner_id == character.id else -0.4
            return {
                "dice": opposed.initiator_check.roll,
                "target": round(opposed.initiator_check.target, 2),
                "outcome": outcome_cn,
                "action": action,
                "consequences": consequences,
                "emotional_shift": round(emotional_shift, 3),
                "round": self._simulation_round + 1,
                "character_id": character.id,
                "scene_id": scene_id,
                "_skill_check_obj": opposed.initiator_check,
                "skill_check": opposed.initiator_check.to_dict(),
                "sanity_result": None,
                "scene_delta": {
                    "tension_delta": abs(emotional_shift),
                    "emotional_tone": emotional_shift,
                    "opposed": opposed.to_dict(),
                },
            }

        # Standard skill check.
        bonus_dice = 1 if conflict_level <= 0.2 else 0
        penalty_dice = 1 if conflict_level >= 0.5 else 0
        resolution = self._gm.resolve_round(
            action=action,
            sheet=sheet,
            scene=scene,
            difficulty=1.0,
            modifier=modifier,
            bonus_dice=bonus_dice,
            penalty_dice=penalty_dice,
            pushed=False,
        )
        outcome_cn = {
            SkillCheckOutcome.CRITICAL_SUCCESS: "大成功",
            SkillCheckOutcome.HARD_SUCCESS: "困难成功",
            SkillCheckOutcome.SUCCESS: "成功",
            SkillCheckOutcome.FAILURE: "失败",
            SkillCheckOutcome.FUMBLE: "大失败",
        }.get(resolution.check.outcome, "未知")

        consequences = self._generate_consequences(action, outcome_cn, character)
        if consequences == resolution.narration:
            consequences = resolution.narration
        else:
            consequences = f"{resolution.narration} {consequences}"

        self._apply_sanity_result(character.id, resolution.sanity_result)

        return {
            "dice": resolution.check.roll,
            "target": round(resolution.check.target, 2),
            "outcome": outcome_cn,
            "action": action,
            "consequences": consequences,
            "emotional_shift": round(resolution.emotional_shift, 3),
            "round": self._simulation_round + 1,
            "character_id": character.id,
            "scene_id": scene_id,
            "_skill_check_obj": resolution.check,
            "skill_check": resolution.check.to_dict(),
            "sanity_result": resolution.sanity_result,
            "scene_delta": resolution.scene_delta,
        }

    def _apply_combat_damage(
        self, combat_round: trpg_extended.CombatRound, sheets: list[TRPGCharacterSheet]
    ) -> None:
        """Apply combat damage to actor states based on combat round results."""
        sheet_by_id = {s.character_id: s for s in sheets}
        for attack in combat_round.attacks:
            defender_id = attack.get("defender_id")
            damage = attack.get("damage", 0.0)
            if defender_id in self._actor_states and damage:
                self._actor_states[defender_id].apply_damage(float(damage))
            if defender_id in sheet_by_id:
                sheet_by_id[defender_id].hit_points = max(
                    0.0, sheet_by_id[defender_id].hit_points - float(damage)
                )

    def _combat_emotional_shift(self, combat_round: trpg_extended.CombatRound) -> float:
        """Return an emotional shift magnitude based on combat results."""
        if not combat_round.attacks:
            return 0.0
        total_damage = sum(a.get("damage", 0.0) for a in combat_round.attacks)
        hits = sum(1 for a in combat_round.attacks if a.get("hit"))
        shift = 0.2 + min(0.6, total_damage / 10.0)
        if hits == 0:
            shift = -0.1
        return round(max(-1.0, min(1.0, shift)), 3)

    def _apply_sanity_result(
        self, character_id: str, sanity_result: dict[str, Any] | None
    ) -> None:
        """Apply sanity loss to the actor state and sheet if available."""
        if not sanity_result:
            return
        loss = sanity_result.get("sanity_loss", 0.0)
        if loss and character_id in self._actor_states:
            self._actor_states[character_id].apply_sanity_shock(float(loss))
        if character_id in self._character_sheets:
            sheet = self._character_sheets[character_id]
            sheet.magic_points = max(0.0, sheet.magic_points - float(loss))

    def _generate_consequences(
        self,
        action: str,
        outcome: str,
        character: CharacterProjection | None,
    ) -> str:
        """Generate a brief narrative consequence string."""
        char_name = character.name if character else "那个身影"

        # For the mock service, bypass the JSON-oriented prompt to avoid
        # leaking system instructions into the narrative.
        if self._llm.is_mock:
            return (
                f"{char_name}{action}，结果是{outcome}。"
                "空气中有什么东西轻轻移动了一下，像是一个尚未被命名的转折。"
            )

        # Use the structured COC judgment prompt when a real LLM is available.
        from src.novelist_brain import prompts as prompts_mod
        from src.novelist_brain.llm import LLMCallError

        scene_desc = self._current_scene.description if self._current_scene else ""
        character_states = []
        if character is not None:
            character_states.append(
                {
                    "name": character.name,
                    "sanity": getattr(character, "sanity", 50),
                    "traits_summary": ", ".join(
                        f"{k}={v:.2f}" for k, v in character.traits.__dict__.items()
                    ),
                }
            )

        identity = getattr(self, "_identity_constraints", {}) or {}
        rules = (self.world_model.rules or [])[:5]
        world_rules = [str(r) for r in rules] or ["寻常现实"]

        system, user = prompts_mod.build_coc_judgment_prompt(
            identity=identity,
            world_rules=world_rules,
            scene_description=scene_desc,
            character_states=character_states,
            pending_action=action,
        )

        try:
            response = self._llm.complete(
                user,
                context={"system": system},
                temperature=0.7,
                max_tokens=1200,
            )
        except LLMCallError:
            response = ""

        # The prompt asks for JSON. Try to extract a usable outcome string.
        text = response.strip()
        if text:
            import json as _json
            # Find the first {...} block.
            match = None
            for start in range(len(text)):
                if text[start] == "{":
                    end = text.find("}", start)
                    if end != -1:
                        candidate = text[start : end + 1]
                        try:
                            match = _json.loads(candidate)
                            break
                        except _json.JSONDecodeError:
                            continue
            if match and isinstance(match, dict):
                outcome_text = match.get("outcome") or ""
                if outcome_text:
                    return outcome_text
            # If JSON parse failed, fall back to the raw text (truncated).
            return text[:240]

        # Fallback for empty response.
        prompt = (
            f"在{outcome}的情况下，{char_name} 试图 {action}，会发生什么？"
        )
        return self._llm.complete(prompt, max_tokens=96)

    def _compute_emotional_shift(
        self, outcome: str, character: CharacterProjection | None
    ) -> float:
        """Return an emotional shift magnitude in [-1, 1]."""
        outcome_map = {
            "大成功": 0.8,
            "成功": 0.3,
            "失败": -0.3,
            "大失败": -0.8,
        }
        shift = outcome_map.get(outcome, 0.0)
        if character is not None:
            shift += (character.traits.neuroticism - 0.5) * 0.2
            shift += (character.traits.openness - 0.5) * 0.1
        return max(-1.0, min(1.0, shift))

    # ------------------------------------------------------------------
    # Narrative bookkeeping
    # ------------------------------------------------------------------

    def _update_scene_and_characters(
        self, resolution: dict[str, Any], character: CharacterProjection | None
    ) -> None:
        """Advance the current scene and character states."""
        line = self.current_narrative_line
        if line is None:
            return

        shift = resolution["emotional_shift"]
        new_scene = Scene(
            description=resolution["consequences"],
            characters=[character.name] if character else [],
            setting=self._current_scene.setting if self._current_scene else "",
            conflict_level=abs(shift),
            emotional_tone=shift,
        )
        line.scenes.append(new_scene)
        self._current_scene = new_scene

        if abs(shift) > 0.4:
            conflict = Conflict(
                parties=[character.name] if character else ["世界"],
                stakes=self._generate_stakes(character),
                intensity=abs(shift),
                resolved=False,
            )
            line.conflicts.append(conflict)

        if self._rng.random() < 0.35:
            if self._llm.is_mock:
                foreshadowing = "远处有一盏灯，将在某个需要的时刻熄灭。"
            else:
                foreshadowing = self._llm.complete(
                    "根据当前世界，伏笔一个未来事件，用中文写一句。",
                    max_tokens=64,
                )
            line.foreshadowing.append(foreshadowing)

        if character is not None:
            character.traits.neuroticism = max(
                0.0, min(1.0, character.traits.neuroticism + shift * 0.05)
            )
            character.traits.openness = max(
                0.0, min(1.0, character.traits.openness + abs(shift) * 0.02)
            )

        # Mark a climax if a dramatic outcome occurs late in the arc.
        metrics = self._compute_depth_metrics()
        if (
            resolution["outcome"] in ("大成功", "大失败")
            and metrics["conflict_depth"] >= 0.5
        ):
            line.climax = new_scene

    def _evaluate_narrative_ready(self) -> None:
        """Check the N-round contract and emit narrative.ready if satisfied."""
        metrics = self._compute_depth_metrics()
        ready = False
        if self._simulation_round >= self._max_rounds:
            ready = True
        elif (
            self._simulation_round >= self._min_rounds
            and self._any_depth_metric_passes(metrics)
        ):
            ready = True

        if ready and self.current_narrative_line is not None:
            line = self.current_narrative_line
            line.status = "committed"
            # Narrative yield: how many scenes per round were produced.
            narrative_yield = min(
                1.0, len(line.scenes) / max(1, self._simulation_round)
            )
            self.emit(
                topic="data.sandbox.narrative.ready",
                payload={
                    "narrative_line": line,
                    "depth_metrics": metrics,
                    "simulation_round": self._simulation_round,
                    "narrative_yield": round(narrative_yield, 3),
                    "source": self.name,
                },
                channel="data",
                priority=7,
                ttl=5,
            )
            # Reset simulation bookkeeping so the next build/simulate cycle
            # starts fresh while characters and world model continue to evolve.
            self._simulation_round = 0
            self._prediction_errors.clear()
            self._skill_checks.clear()
            if self._world_model is not None:
                self._world_model.prediction_errors.clear()
            next_line = NarrativeLine()
            if self._current_scene is not None:
                next_line.scenes.append(self._current_scene)
            self._narrative_lines.append(next_line)
            self._state.custom["simulation_round"] = 0
            self._state.custom["narrative_line_count"] = len(self._narrative_lines)

    def _any_depth_metric_passes(self, metrics: dict[str, float]) -> bool:
        return any(
            metrics.get(key, 0.0) >= threshold
            for key, threshold in self._depth_thresholds.items()
        )

    def _compute_depth_metrics(self) -> dict[str, float]:
        """Compute depth metrics used by the N-round contract."""
        line = self.current_narrative_line

        conflict_depth = 0.0
        if line and line.conflicts:
            avg_intensity = sum(c.intensity for c in line.conflicts) / len(
                line.conflicts
            )
            conflict_depth = min(
                1.0, avg_intensity + len(line.conflicts) * 0.08
            )
        elif self._current_scene:
            conflict_depth = self._current_scene.conflict_level

        character_development = min(
            1.0,
            len(self._characters) * 0.25
            + sum(1.0 for c in self._characters if c.internal_conflict) * 0.15,
        )

        emotional_shift = 0.0
        if self._prediction_errors:
            emotional_shift = min(
                1.0,
                sum(abs(p.get("emotional_shift", 0.0)) for p in self._prediction_errors)
                / len(self._prediction_errors),
            )

        coherence_score = 0.5
        if line:
            scene_count = len(line.scenes)
            if scene_count > 1:
                coherence_score = min(1.0, 0.4 + scene_count * 0.08)
            if line.climax is not None:
                coherence_score = min(1.0, coherence_score + 0.15)

        return {
            "conflict_depth": round(conflict_depth, 3),
            "character_development": round(character_development, 3),
            "emotional_shift": round(emotional_shift, 3),
            "coherence_score": round(coherence_score, 3),
        }

    # ------------------------------------------------------------------
    # Character projection
    # ------------------------------------------------------------------

    def _ensure_protagonist_projection(self) -> None:
        """Ensure the sandbox has a protagonist that is a projection of 林逸.

        The novelist's self is the default actor in the mental sandbox. If no
        character exists yet, create one directly from the identity constraints
        broadcast by the identity core.
        """
        if any(c.name == "林逸" for c in self._characters):
            return

        identity = self._identity_constraints or {}
        traits = identity.get("traits", {}) if isinstance(identity, dict) else {}
        trait_vector = TraitVector(
            openness=_trait_value(traits, "开放性", 0.85),
            conscientiousness=_trait_value(traits, "尽责性", 0.6),
            extraversion=1.0 - _trait_value(traits, "内倾性", 0.75),
            agreeableness=_trait_value(traits, "敏感性", 0.8),
            neuroticism=_trait_value(traits, "神经质", 0.5),
        )

        interests = identity.get("interests", ["城市边缘人", "记忆", "雨"])
        self_narrative = identity.get(
            "self_narrative",
            "我是一个在人群边缘写字的人。",
        )
        desires = [
            Desire(object=obj, strength=0.6, urgency=0.5)
            for obj in (interests[:2] if len(interests) >= 2 else ["被忽略的瞬间", "未被说出的话"])
        ]

        internal_conflict = identity.get(
            "internal_conflict",
            "林逸想要靠近世界以收集它，又害怕被它看见；"
            "他相信孤独里才有真正的小说，却又在孤独中怀疑这是否只是借口。",
        )
        protagonist = CharacterProjection(
            name="林逸",
            archetype="主角：在人群边缘写字的小说家",
            source_trace_ids=["identity_projection"],
            traits=trait_vector,
            desires=desires,
            internal_conflict=internal_conflict,
            projection_ratio=0.85,
        )
        self._characters.insert(0, protagonist)
        self._rebuild_character_sheets()
        self.emit(
            topic="data.sandbox.character.updated",
            payload={"character": protagonist, "source": "identity_projection"},
            channel="data",
            priority=6,
            ttl=5,
        )
        self.emit(
            topic="data.sandbox.character.action",
            payload={
                "character_id": protagonist.id,
                "autonomy_score": 0.5,
                "action": "进入脑中世界",
                "source": "identity_projection",
            },
            channel="data",
            priority=4,
            ttl=2,
        )
        self._state.custom["character_count"] = len(self._characters)

    def _process_pending_traces(self) -> None:
        """Convert queued character traces into character projections."""
        added: list[CharacterProjection] = []
        for trace in self._pending_traces:
            character = self._character_from_trace(trace)
            self._characters.append(character)
            added.append(character)
            self.emit(
                topic="data.sandbox.character.updated",
                payload={"character": character, "source": "trace_projection"},
                channel="data",
                priority=5,
                ttl=3,
            )
        self._pending_traces.clear()
        if added:
            self._rebuild_character_sheets()
            for character in added:
                self.emit(
                    topic="data.sandbox.character.action",
                    payload={
                        "character_id": character.id,
                        "autonomy_score": 1.0 - character.projection_ratio,
                        "action": "从记忆痕迹中浮现",
                        "source": "trace_projection",
                    },
                    channel="data",
                    priority=4,
                    ttl=2,
                )
        self._state.custom["character_count"] = len(self._characters)

    def _character_from_trace(self, trace: Trace) -> CharacterProjection:
        """Build a character projection from a memory trace."""
        name = _extract_name(trace.content) or f"Character-{trace.id[:4]}"
        archetype = _infer_archetype(trace)
        emotional_weight = max(0.0, min(1.0, trace.emotional_weight))
        importance = max(0.0, min(1.0, trace.importance))

        traits = TraitVector(
            openness=round(
                0.3 + emotional_weight * 0.4 + self._rng.random() * 0.3, 3
            ),
            conscientiousness=round(
                0.3 + importance * 0.4 + self._rng.random() * 0.3, 3
            ),
            extraversion=round(0.3 + self._rng.random() * 0.4, 3),
            agreeableness=round(0.3 + self._rng.random() * 0.4, 3),
            neuroticism=round(
                0.2 + emotional_weight * 0.5 + self._rng.random() * 0.3, 3
            ),
        )

        desire_object = _infer_desire(trace)
        desires = [Desire(object=desire_object, strength=0.5, urgency=0.5)]

        if self._llm.is_mock:
            internal_conflict = (
                f"{name}想要靠近，又害怕被看见；"
                "记忆越是清晰，沉默就越沉重。"
            )
        else:
            internal_conflict = self._llm.complete(
                f"请用中文为一位名为 {name} 的 {archetype} 描述一个内心冲突，"
                f"依据如下记忆：{trace.content}",
                max_tokens=80,
            )

        projection_ratio = projection_ratio_for_archetype(archetype)
        fears = []
        if emotional_weight > 0.6:
            fears.append(
                Fear(
                    object="失去或被遗忘",
                    intensity=round(emotional_weight, 3),
                    permanent=False,
                )
            )

        return CharacterProjection(
            name=name,
            archetype=archetype,
            source_trace_ids=[trace.id],
            traits=traits,
            desires=desires,
            fears=fears,
            internal_conflict=internal_conflict,
            projection_ratio=projection_ratio,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _reset_simulation(self) -> None:
        self._simulation_round = 0
        self._prediction_errors.clear()
        self._characters.clear()
        self._pending_traces.clear()
        self._character_sheets.clear()
        self._actor_states.clear()
        self._skill_checks.clear()
        self._current_chase = None
        self._current_combat = None
        self._current_scene = None
        if self._world_model is not None:
            self._world_model.history.clear()
            self._world_model.prediction_errors.clear()
            self._world_model.current_state = {}
        self._narrative_lines.clear()
        self._state.custom["simulation_round"] = 0
        self._state.custom["character_count"] = 0
        self._state.custom["narrative_line_count"] = 0

    def _rebuild_character_sheets(self) -> None:
        """Build or refresh TRPG character sheets and actor states for all projections."""
        for character in self._characters:
            sheet = build_character_sheet(character, rng=self._rng)
            self._character_sheets[character.id] = sheet
            # Write default attributes/skills back to the projection so that
            # serialization captures the full character card.
            character.skills = dict(sheet.skills)
            if character.id not in self._actor_states:
                self._actor_states[character.id] = ActorState(
                    hit_points=sheet.hit_points,
                    max_hit_points=sheet.hit_points,
                    magic_points=sheet.magic_points,
                    max_magic_points=sheet.magic_points,
                )

    def _ensure_narrative_line(self) -> None:
        if not self._narrative_lines:
            line = NarrativeLine()
            if self._current_scene is not None:
                line.scenes.append(self._current_scene)
            self._narrative_lines.append(line)
            self._state.custom["narrative_line_count"] = 1

    def _create_default_scene(self) -> Scene:
        setting = "黎明中无名的城市"
        if self._world_model and self._world_model.ontology:
            setting = self._world_model.ontology.get("setting", setting)
        if self._llm.is_mock:
            description = f"{setting}的街道还沉浸在未被命名的寂静里，只有远处的灯光在缓慢呼吸。"
        else:
            description = self._llm.complete(
                f"请用中文描写一个发生在「{setting}」的场景。", max_tokens=96
            )
        return Scene(
            description=description,
            characters=[c.name for c in self._characters],
            setting=setting,
            conflict_level=0.1,
            emotional_tone=0.0,
        )

    def _generate_action(self) -> str:
        if self._llm.is_mock:
            return "面对未被解决的过去"
        if self._world_model and self._world_model.ontology:
            genre = self._world_model.ontology.get("genre", "严肃文学")
            return self._llm.complete(
                f"请用中文为一个 {genre} 故事建议一个有意义的行动。", max_tokens=48
            )
        return "面对未被解决的过去"

    def _generate_stakes(self, character: CharacterProjection | None) -> str:
        char_name = character.name if character else "主角"
        if self._llm.is_mock:
            return f"对{char_name}来说，过去正悬在一句未说出口的话上。"
        return self._llm.complete(
            f"对 {char_name} 来说，什么处于危险之中？请用中文回答。", max_tokens=64
        )

    def _resolve_actor(self, character_id: Any) -> CharacterProjection | None:
        if character_id is None:
            return self._characters[0] if self._characters else None
        for character in self._characters:
            if character.id == character_id:
                return character
        return self._characters[0] if self._characters else None

    def _emit_world_updated(self, topic: str) -> None:
        if self._world_model is None:
            return
        self.emit(
            topic=topic,
            payload={
                "world_model": self._world_model,
                "simulation_round": self._simulation_round,
                "source": self.name,
            },
            channel="data",
            priority=5,
            ttl=3,
        )


# ----------------------------------------------------------------------
# Utility functions
# ----------------------------------------------------------------------


def _trait_value(traits: dict[str, Any], key: str, default: float) -> float:
    """Return a trait value clamped to [0, 1]."""
    value = traits.get(key, default)
    try:
        return float(max(0.0, min(1.0, value)))
    except (TypeError, ValueError):
        return float(default)


def _looks_like_character(trace: Trace) -> bool:
    """Heuristic: a trace may describe a character even if not labelled so."""
    if trace.narrative_role == "character":
        return True
    if _extract_name(trace.content):
        return True
    return False


def _extract_name(text: str) -> str | None:
    """Extract the first likely person name from text."""
    for token in text.split():
        cleaned = token.strip(",.!?;:\"'()[]"
        )
        if cleaned and cleaned[0].isupper() and len(cleaned) > 2:
            if cleaned.lower() not in _COMMON_WORDS:
                return cleaned
    return None


def _infer_archetype(trace: Trace) -> str:
    """Infer a character archetype from trace tags and content."""
    archetypes = {
        "lonely": "the solitary watcher",
        "memory": "the haunted rememberer",
        "love": "the reluctant lover",
        "loss": "the mourner",
        "city": "the urban wanderer",
        "dream": "the dreamer",
        "secret": "the keeper of secrets",
    }
    content_lower = trace.content.lower()
    for tag in trace.tags:
        key = tag.lower()
        if key in archetypes:
            return archetypes[key]
        if key in content_lower and key in archetypes:
            return archetypes[key]
    for key, archetype in archetypes.items():
        if key in content_lower:
            return archetype
    return "the stranger"


def _infer_desire(trace: Trace) -> str:
    """Infer a simple desire object from trace content."""
    desire_map = {
        "love": "to be loved",
        "memory": "to remember",
        "forget": "to forget",
        "home": "to belong",
        "city": "to find meaning in the city",
        "dream": "to understand the dream",
        "secret": "to uncover the truth",
        "loss": "to recover what was lost",
    }
    content_lower = trace.content.lower()
    for key, desire in desire_map.items():
        if key in content_lower:
            return desire
    return "to make sense of the past"


_COMMON_WORDS = {
    "the", "a", "an", "and", "but", "or", "for", "nor", "on", "at", "to", "from",
    "by", "with", "in", "out", "up", "down", "of", "off", "over", "under", "again",
    "further", "then", "once", "here", "there", "when", "where", "why", "how", "all",
    "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "not",
    "only", "own", "same", "so", "than", "too", "very", "can", "will", "just", "should",
    "now", "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
}
