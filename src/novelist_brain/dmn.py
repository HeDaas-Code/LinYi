"""Default mode network module for the novelist brain prototype."""

from __future__ import annotations

import random
from typing import Any, Literal

from src.novelist_brain import prompts
from src.novelist_brain.llm import LLMCallError, LLMService, MockLLMService
from src.novelist_brain.models import BusMessage, Fragment, ModuleState, TickDelta, Trace
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass


class DefaultModeNetwork(Module):
    """Background default mode network: dreaming, reflection, mental wandering.

    DMN is active during rest, deep_night, reflection and incubation phases.
    It consumes recent memories and identity constraints to produce dream,
    reflection and insight fragments.  High-salience insight fragments are
    designed to be picked up by the salience network and routed to CEN.
    """

    _REFLECTION_CAPACITY = 20
    _DREAM_CAPACITY = 10
    _WANDERING_CAPACITY = 5
    _HIGH_SALIENCE_THRESHOLD = 0.75

    _DREAM_TEMPLATES = [
        "A shadow moved across the ceiling, carrying the sound of a conversation you never had.",
        "The train station had no exits, only doors that opened into earlier rooms of your life.",
        "You found a letter written in your own handwriting, but you did not remember writing it.",
    ]

    _REFLECTION_TEMPLATES = [
        "The day folded into itself, leaving only the weight of small choices.",
        "Looking back, every silence seemed to contain a sentence that had not been spoken.",
        "Memory edited the hours until only the color of the light remained.",
    ]

    _INSIGHT_TEMPLATES = [
        "What if the city itself is the protagonist, and every street a sentence?",
        "The gap between two unrelated memories is where the real story begins.",
        "Loneliness and time are the same material, observed from different angles.",
    ]

    def __init__(self, name: str = "default_mode_network") -> None:
        super().__init__(name)
        self._activation_level = 0.0
        self._current_theme = ""
        self._wandering_traces: list[Trace] = []
        self._dream_queue: list[Fragment] = []
        self._reflection_buffer: list[Fragment] = []
        self._llm: LLMService | None = None
        self._identity_constraints: dict[str, Any] = {}
        self._rng = random.Random()
        self._last_phase: str | None = None

        self.subscribe(
            "control.network.dmn.active",
            "control.network.cen.active",
            "control.network.switch",
            "fragment.personal.new",
            "fragment.social.new",
            "fragment.memory.new",
            "fragment.dream.new",
            "fragment.reflection.new",
            "fragment.insight.new",
            "fragment.novel.new",
            "fragment.dmn.new",
            "fragment.cen.new",
            "fragment.sandbox.new",
            "data.memory.trace.query.result",
            "event.novel.paragraph.published",
            "identity.constraints",
            "identity.initialized",
            "control.module.init",
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            last_tick=0.0,
            custom={
                "activation_level": 0.0,
                "current_theme": "",
                "wandering_trace_count": 0,
                "dream_queue_count": 0,
                "reflection_buffer_count": 0,
            },
        )

    def get_state(self) -> ModuleState:
        """Return the current DMN state, including internal buffers."""
        self._state.custom.update(
            {
                "activation_level": self._activation_level,
                "current_theme": self._current_theme,
                "wandering_trace_count": len(self._wandering_traces),
                "dream_queue_count": len(self._dream_queue),
                "reflection_buffer_count": len(self._reflection_buffer),
            }
        )
        return self._state

    def to_dict(self) -> dict[str, Any]:
        """Serialize DMN state."""
        base = super().to_dict()
        base.update(
            {
                "activation_level": self._activation_level,
                "current_theme": self._current_theme,
                "identity_constraints": self._identity_constraints,
                "last_phase": self._last_phase,
                "wandering_traces": [
                    dataclass_to_dict(t) for t in self._wandering_traces
                ],
                "dream_queue": [dataclass_to_dict(f) for f in self._dream_queue],
                "reflection_buffer": [
                    dataclass_to_dict(f) for f in self._reflection_buffer
                ],
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore DMN state."""
        super().from_dict(data, **kwargs)
        llm = kwargs.get("llm_service")
        if llm is not None:
            self._llm = llm
        self._rng = random.Random()
        self._activation_level = float(data.get("activation_level", 0.0))
        self._current_theme = data.get("current_theme", "")
        self._identity_constraints = data.get("identity_constraints", {})
        self._last_phase = data.get("last_phase")
        self._wandering_traces = [
            reconstruct_dataclass(Trace, t)
            for t in data.get("wandering_traces", [])
        ]
        self._dream_queue = [
            reconstruct_dataclass(Fragment, f)
            for f in data.get("dream_queue", [])
        ]
        self._reflection_buffer = [
            reconstruct_dataclass(Fragment, f)
            for f in data.get("reflection_buffer", [])
        ]

    def init(self, context: dict[str, Any]) -> None:
        """Initialize DMN from agent context."""
        self._llm = context.get("llm_service")
        if self._llm is None:
            self._llm = MockLLMService()

        identity = context.get("identity", {})
        if identity:
            self._identity_constraints = dict(identity)
            self._current_theme = ", ".join(
                self._identity_constraints.get("interests", ["memory"])
            )
        else:
            self._identity_constraints = {
                "name": "novelist",
                "interests": ["memory", "loneliness", "time"],
                "self_narrative": "I turn ordinary moments into fiction.",
            }
            self._current_theme = "memory, loneliness, time"

        self._state.custom["current_theme"] = self._current_theme

    def on_bus_message(self, message: BusMessage) -> None:
        """Handle network switches, fragments, memory results and feedback."""
        topic = message.topic

        if topic == "control.network.dmn.active":
            self._activate()
        elif topic == "control.network.cen.active":
            self._deactivate()
        elif topic == "control.network.switch":
            target = (message.payload or {}).get("target_network")
            if target == "dmn":
                self._activate()
            elif target == "cen":
                self._deactivate()
        elif topic.startswith("fragment.") and topic.endswith(".new"):
            self._buffer_fragment(message.payload)
        elif topic == "data.memory.trace.query.result":
            self._handle_query_result(message.payload or {})
        elif topic == "event.novel.paragraph.published":
            self._handle_novel_feedback(message.payload or {})
        elif topic in ("identity.constraints", "identity.initialized"):
            payload = message.payload or {}
            constraints = payload.get("constraints")
            if isinstance(constraints, dict):
                self._identity_constraints = constraints
                interests = constraints.get("interests", [])
                if interests:
                    self._current_theme = ", ".join(interests)

    def tick(self, delta: TickDelta) -> None:
        """Advance DMN: query memory and generate phase-appropriate fragments."""
        self._state.last_tick = delta.absolute_time
        self._last_phase = delta.phase

        if not self._state.active or self._activation_level <= 0.0:
            return

        # Slowly decay activation so DMN does not stay locked on indefinitely.
        self._activation_level = max(0.0, self._activation_level - 0.02)

        self._request_memory_for_phase(delta.phase)
        fragment = self._produce_fragment(delta.phase)
        if fragment is not None:
            self._emit_fragment(fragment)

        self._emit_state()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _activate(self) -> None:
        self.resume()
        self._activation_level = 1.0

    def _deactivate(self) -> None:
        self.pause()
        self._activation_level = 0.0

    def _buffer_fragment(self, payload: Any) -> None:
        fragment = self._coerce_fragment(payload)
        if fragment is None:
            return

        self._reflection_buffer.append(fragment)
        if fragment.source in ("dream", "memory", "novel") or fragment.modality in (
            "emotion",
            "scene",
        ):
            self._dream_queue.append(fragment)

        self._trim_buffers()

    def _trim_buffers(self) -> None:
        while len(self._reflection_buffer) > self._REFLECTION_CAPACITY:
            self._reflection_buffer.pop(0)
        while len(self._dream_queue) > self._DREAM_CAPACITY:
            self._dream_queue.pop(0)

    def _handle_query_result(self, payload: dict[str, Any]) -> None:
        results = payload.get("results", [])
        traces: list[Trace] = []
        for item in results:
            if isinstance(item, Trace):
                traces.append(item)
            elif isinstance(item, dict):
                traces.append(Trace(**item))

        self._wandering_traces = traces[: self._WANDERING_CAPACITY]
        if traces:
            tags: set[str] = set()
            for trace in traces:
                tags.update(trace.tags)
            if tags:
                self._current_theme = ", ".join(sorted(tags)[:5])

    def _handle_novel_feedback(self, payload: dict[str, Any]) -> None:
        text = str(payload.get("text", payload.get("paragraph", "")))
        if not text:
            return
        fragment = Fragment(
            content=text,
            source="novel",
            modality="scene",
            valence=0.2,
            arousal=0.4,
            salience=0.5,
            timestamp=payload.get("timestamp", 0.0),
            tags=["novel", "feedback"],
        )
        self._buffer_fragment(fragment)

    def _request_memory_for_phase(self, phase: str) -> None:
        interests = self._identity_constraints.get("interests", ["memory"])
        if phase == "deep_night":
            tags = list(set(interests + ["dream", "sleep", "night"]))
            sort_by = "recency"
        elif phase == "reflection":
            tags = list(set(interests + ["reflection", "day", "experience"]))
            sort_by = "recency"
        elif phase == "incubation":
            tags = list(set(interests + ["insight", "association"]))
            sort_by = "relevance"
        else:
            tags = list(interests)
            sort_by = "relevance"

        self.emit(
            topic="control.memory.query",
            payload={
                "query_type": "tags",
                "tags": tags,
                "limit": 5,
                "sort_by": sort_by,
                "requester": self.name,
            },
            channel="control",
            priority=4,
            ttl=2,
        )

    def _produce_fragment(self, phase: str) -> Fragment | None:
        if phase == "deep_night":
            return self._make_dream_fragment()
        if phase == "reflection":
            return self._make_reflection_fragment()
        if phase == "incubation":
            return self._make_insight_fragment()
        return None

    def _make_dream_fragment(self) -> Fragment:
        trace_dicts = [self._trace_to_dict(t) for t in self._wandering_traces]
        queue_fragments = self._dream_queue[-3:]
        mood_vector = self._estimate_mood()
        system, user = prompts.build_dream_prompt(
            self._identity_constraints, trace_dicts, mood_vector
        )
        content = self._generate_text(
            user,
            context={"system": system},
            fallback=self._DREAM_TEMPLATES,
            max_tokens=900,
        )

        valence = self._aggregate_valence(self._dream_queue)
        arousal = 0.7
        salience = 0.4

        return Fragment(
            content=content,
            source="dream",
            modality="scene",
            valence=valence,
            arousal=arousal,
            salience=salience,
            tags=self._collect_tags("dream"),
        )

    def _make_reflection_fragment(self) -> Fragment:
        trace_dicts = [self._trace_to_dict(t) for t in self._wandering_traces]
        buffer_texts = [f.content for f in self._reflection_buffer[-5:]]
        day_summary = " | ".join(buffer_texts) or "An unremarkable day."
        mood_vector = self._estimate_mood()
        system, user = prompts.build_reflection_prompt(
            self._identity_constraints, day_summary, mood_vector
        )
        content = self._generate_text(
            user,
            context={"system": system},
            fallback=self._REFLECTION_TEMPLATES,
            max_tokens=700,
        )

        valence = self._aggregate_valence(self._reflection_buffer)
        arousal = 0.3
        salience = 0.35

        return Fragment(
            content=content,
            source="dmn",
            modality="emotion",
            valence=valence,
            arousal=arousal,
            salience=salience,
            tags=self._collect_tags("reflection"),
        )

    def _make_insight_fragment(self) -> Fragment:
        trace_texts = [t.content for t in self._wandering_traces if t.content]
        buffer_texts = [f.content for f in self._reflection_buffer[-3:]]
        wandering_themes = self._current_theme.split(", ") if self._current_theme else []
        system, user = prompts.build_insight_prompt(
            self._identity_constraints, wandering_themes, trace_texts + buffer_texts
        )
        content = self._generate_text(
            user,
            context={"system": system},
            fallback=self._INSIGHT_TEMPLATES,
            max_tokens=700,
        )

        valence = self._aggregate_valence(self._reflection_buffer)
        arousal = 0.6
        salience = 0.85

        return Fragment(
            content=content,
            source="dmn",
            modality="concept",
            valence=valence,
            arousal=arousal,
            salience=salience,
            tags=self._collect_tags("insight"),
        )

    @staticmethod
    def _trace_to_dict(trace: Trace) -> dict[str, Any]:
        return {
            "content": trace.content,
            "summary": trace.content[:160],
            "tags": list(trace.tags),
            "narrative_role": getattr(trace, "narrative_role", "theme"),
        }

    def _estimate_mood(self) -> dict[str, float]:
        fragments = self._reflection_buffer[-8:] + self._dream_queue[-3:]
        if not fragments:
            return {"valence": 0.0, "arousal": 0.3}
        valence = sum(f.valence for f in fragments) / len(fragments)
        arousal = sum(f.arousal for f in fragments) / len(fragments)
        return {"valence": float(valence), "arousal": float(arousal)}

    def _generate_text(
        self,
        prompt: str,
        *,
        context: dict[str, Any] | None = None,
        fallback: list[str],
        max_tokens: int = 256,
    ) -> str:
        if self._llm is not None:
            try:
                text = self._llm.complete(
                    prompt,
                    context=context,
                    max_tokens=max_tokens,
                ).strip()
            except LLMCallError:
                text = ""
            if text:
                return text
        return self._rng.choice(fallback)

    def _aggregate_valence(self, fragments: list[Fragment]) -> float:
        if not fragments:
            return 0.0
        return float(round(sum(f.valence for f in fragments) / len(fragments), 3))

    def _collect_tags(self, mode: str) -> list[str]:
        tags: set[str] = {mode}
        tags.update(self._identity_constraints.get("interests", []))
        for trace in self._wandering_traces:
            tags.update(trace.tags)
        return sorted(tags)

    def _emit_fragment(self, fragment: Fragment) -> None:
        if fragment.modality == "scene" and fragment.source == "dream":
            topic = "fragment.dream.new"
        elif fragment.modality == "emotion":
            topic = "fragment.reflection.new"
        else:
            topic = "fragment.insight.new"

        self.emit(
            topic=topic,
            payload=fragment,
            channel="event",
            priority=6 if fragment.salience >= self._HIGH_SALIENCE_THRESHOLD else 4,
            ttl=3,
        )

    def _emit_state(self) -> None:
        self.emit(
            topic="data.dmn.state",
            payload={
                "activation_level": self._activation_level,
                "current_theme": self._current_theme,
                "wandering_traces": [
                    {"id": t.id, "content": t.content, "tags": t.tags}
                    for t in self._wandering_traces
                ],
                "dream_queue": [
                    {"id": f.id, "content": f.content} for f in self._dream_queue
                ],
                "reflection_buffer": [
                    {"id": f.id, "content": f.content} for f in self._reflection_buffer
                ],
            },
            channel="data",
            priority=3,
            ttl=2,
        )

    @staticmethod
    def _coerce_fragment(payload: Any) -> Fragment | None:
        if payload is None:
            return None
        if isinstance(payload, Fragment):
            return payload
        if isinstance(payload, dict):
            return Fragment(**payload)
        return None
