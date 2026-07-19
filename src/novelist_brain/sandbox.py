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
    ModuleState,
    NarrativeLine,
    Scene,
    TickDelta,
    Trace,
    TraitVector,
    WorldModel,
)
from src.novelist_brain.module import Module


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

        self.subscribe(
            "control.sandbox.build",
            "control.sandbox.simulate",
            "data.memory.trace.query.result",
            "data.identity.constraint",
            "control.module.init",
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
            if isinstance(self._llm, MockLLMService):
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

        self._process_pending_traces()
        self._ensure_narrative_line()
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
        elif message.topic == "data.identity.constraint":
            self._handle_identity_constraint(message.payload)

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
        self._ensure_narrative_line()
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

    def _handle_simulate(self, payload: Any) -> None:
        """Run one COC-style simulation round."""
        if self._world_model is None:
            return
        if self._current_scene is None:
            self._current_scene = self._create_default_scene()

        payload = payload or {}
        if not isinstance(payload, dict):
            payload = {}

        action = payload.get("action", self._generate_action())
        character = self._resolve_actor(payload.get("character_id"))

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

        self._evaluate_narrative_ready()

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

    # ------------------------------------------------------------------
    # COC-style resolution
    # ------------------------------------------------------------------

    def _resolve_event(
        self, action: str, character: CharacterProjection | None
    ) -> dict[str, Any]:
        """Roll a d100 against a difficulty target and classify the outcome."""
        base_difficulty = 50.0
        if character is not None:
            base_difficulty += (character.traits.conscientiousness - 0.5) * 20.0
            base_difficulty += (character.traits.openness - 0.5) * 10.0
            base_difficulty -= (character.traits.neuroticism - 0.5) * 10.0

        rule_modifier = self._rng.uniform(-10.0, 10.0)
        if self._world_model and self._world_model.rules:
            rule_modifier += len(self._world_model.rules) * 2.0 - 5.0

        target = max(5.0, min(95.0, base_difficulty + rule_modifier))
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
        }

    def _generate_consequences(
        self,
        action: str,
        outcome: str,
        character: CharacterProjection | None,
    ) -> str:
        """Generate a brief narrative consequence string."""
        char_name = character.name if character else "the figure"
        prompt = (
            f"In a {outcome}, what happens when {char_name} attempts to {action}?"
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
                parties=[character.name] if character else ["world"],
                stakes=self._generate_stakes(character),
                intensity=abs(shift),
                resolved=False,
            )
            line.conflicts.append(conflict)

        if self._rng.random() < 0.35:
            line.foreshadowing.append(
                self._llm.complete(
                    "Foreshadow a future event based on the current world.",
                    max_tokens=64,
                )
            )

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
            self.emit(
                topic="data.sandbox.narrative.ready",
                payload={
                    "narrative_line": line,
                    "depth_metrics": metrics,
                    "simulation_round": self._simulation_round,
                    "source": self.name,
                },
                channel="data",
                priority=7,
                ttl=5,
            )

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

    def _process_pending_traces(self) -> None:
        """Convert queued character traces into character projections."""
        for trace in self._pending_traces:
            character = self._character_from_trace(trace)
            self._characters.append(character)
            self.emit(
                topic="data.sandbox.character.updated",
                payload={"character": character, "source": "trace_projection"},
                channel="data",
                priority=5,
                ttl=3,
            )
        self._pending_traces.clear()
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

        internal_conflict = self._llm.complete(
            f"Describe an internal conflict for a {archetype} named {name} "
            f"based on: {trace.content}",
            max_tokens=80,
        )

        return CharacterProjection(
            name=name,
            archetype=archetype,
            source_trace_ids=[trace.id],
            traits=traits,
            desires=desires,
            internal_conflict=internal_conflict,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _reset_simulation(self) -> None:
        self._simulation_round = 0
        self._prediction_errors.clear()
        self._characters.clear()
        self._pending_traces.clear()
        self._current_scene = None
        if self._world_model is not None:
            self._world_model.history.clear()
            self._world_model.prediction_errors.clear()
            self._world_model.current_state = {}
        self._narrative_lines.clear()
        self._state.custom["simulation_round"] = 0
        self._state.custom["character_count"] = 0
        self._state.custom["narrative_line_count"] = 0

    def _ensure_narrative_line(self) -> None:
        if not self._narrative_lines:
            line = NarrativeLine()
            if self._current_scene is not None:
                line.scenes.append(self._current_scene)
            self._narrative_lines.append(line)
            self._state.custom["narrative_line_count"] = 1

    def _create_default_scene(self) -> Scene:
        setting = "an unnamed city at dawn"
        if self._world_model and self._world_model.ontology:
            setting = self._world_model.ontology.get("setting", setting)
        return Scene(
            description=self._llm.complete(
                f"Describe a scene set in {setting}.", max_tokens=96
            ),
            characters=[c.name for c in self._characters],
            setting=setting,
            conflict_level=0.1,
            emotional_tone=0.0,
        )

    def _generate_action(self) -> str:
        if self._world_model and self._world_model.ontology:
            genre = self._world_model.ontology.get("genre", "literary fiction")
            return self._llm.complete(
                f"Suggest a meaningful action in a {genre} story.", max_tokens=48
            )
        return "confront the unresolved past"

    def _generate_stakes(self, character: CharacterProjection | None) -> str:
        char_name = character.name if character else "the protagonist"
        return self._llm.complete(
            f"What is at stake for {char_name}?", max_tokens=64
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
