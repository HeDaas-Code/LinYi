"""Personal input module for the novelist brain prototype."""

from __future__ import annotations

import random
from typing import Any

from src.novelist_brain.models import BusMessage, Fragment, ModuleState, TickDelta
from src.novelist_brain.module import Module


class PersonalInput(Module):
    """Generates personality-bearing fragments from inner experience.

    The module produces context-appropriate fragments according to the current
    daily phase (deep_night, morning, creation, reflection, incubation) and
    adjusts them with identity constraints received from the identity core.
    """

    FRAGMENT_TABLE: dict[str, list[dict[str, Any]]] = {
        "deep_night": [
            {
                "content": "A half-remembered dream dissolves into the ceiling.",
                "modality": "emotion",
                "valence": 0.0,
                "arousal": 0.3,
                "salience": 0.25,
                "tags": ["dream", "night", "fragments"],
            },
            {
                "content": "A distant train whistle threads through sleep.",
                "modality": "emotion",
                "valence": -0.1,
                "arousal": 0.2,
                "salience": 0.2,
                "tags": ["dream", "sound", "night"],
            },
            {
                "content": "You are falling upward into a room with no doors.",
                "modality": "emotion",
                "valence": 0.0,
                "arousal": 0.4,
                "salience": 0.3,
                "tags": ["dream", "liminal", "night"],
            },
        ],
        "morning": [
            {
                "content": "The alarm releases you into a gray morning.",
                "modality": "event",
                "valence": -0.2,
                "arousal": 0.4,
                "salience": 0.45,
                "tags": ["morning", "waking", "routine"],
            },
            {
                "content": "Water runs over your hands; the day begins without ceremony.",
                "modality": "event",
                "valence": 0.1,
                "arousal": 0.3,
                "salience": 0.35,
                "tags": ["morning", "routine", "water"],
            },
            {
                "content": "Coffee steam rises while the city mutters awake outside.",
                "modality": "event",
                "valence": 0.2,
                "arousal": 0.4,
                "salience": 0.4,
                "tags": ["morning", "coffee", "city"],
            },
            {
                "content": "A piece of toast, a spoon, the ordinary sacraments.",
                "modality": "event",
                "valence": 0.1,
                "arousal": 0.2,
                "salience": 0.3,
                "tags": ["morning", "food", "routine"],
            },
        ],
        "creation": [
            {
                "content": "A sentence arrives almost fully formed and is written down before doubt can touch it.",
                "modality": "concept",
                "valence": 0.4,
                "arousal": 0.6,
                "salience": 0.7,
                "tags": ["creation", "writing", "insight"],
            },
            {
                "content": "The cursor blinks in a silence that feels like waiting.",
                "modality": "emotion",
                "valence": -0.1,
                "arousal": 0.4,
                "salience": 0.5,
                "tags": ["creation", "writing", "tension"],
            },
            {
                "content": "A character's voice surfaces, unexpected and exact.",
                "modality": "concept",
                "valence": 0.5,
                "arousal": 0.6,
                "salience": 0.75,
                "tags": ["creation", "character", "voice"],
            },
        ],
        "reflection": [
            {
                "content": "Looking back, the morning feels like a draft of something larger.",
                "modality": "emotion",
                "valence": 0.2,
                "arousal": 0.3,
                "salience": 0.45,
                "tags": ["reflection", "memory", "draft"],
            },
            {
                "content": "A line in the notebook embarrasses you now; it is also the truest thing there.",
                "modality": "emotion",
                "valence": 0.1,
                "arousal": 0.4,
                "salience": 0.55,
                "tags": ["reflection", "notebook", "truth"],
            },
            {
                "content": "The diary receives a confession it will keep.",
                "modality": "event",
                "valence": 0.0,
                "arousal": 0.3,
                "salience": 0.4,
                "tags": ["reflection", "diary", "confession"],
            },
        ],
        "incubation": [
            {
                "content": "Steps on wet pavement, no destination in mind.",
                "modality": "event",
                "valence": 0.1,
                "arousal": 0.3,
                "salience": 0.35,
                "tags": ["incubation", "walking", "city"],
            },
            {
                "content": "A streetlamp comes on while you are still looking at it.",
                "modality": "event",
                "valence": 0.2,
                "arousal": 0.2,
                "salience": 0.3,
                "tags": ["incubation", "light", "evening"],
            },
            {
                "content": "The problem you left at the desk follows you at a distance.",
                "modality": "emotion",
                "valence": -0.1,
                "arousal": 0.4,
                "salience": 0.5,
                "tags": ["incubation", "problem", "wandering"],
            },
            {
                "content": "A stranger's gesture lodges in attention without reason.",
                "modality": "event",
                "valence": 0.0,
                "arousal": 0.3,
                "salience": 0.4,
                "tags": ["incubation", "observation", "stranger"],
            },
        ],
    }

    FALLBACK: dict[str, Any] = {
        "content": "A quiet thought passes, leaving almost no trace.",
        "modality": "emotion",
        "valence": 0.0,
        "arousal": 0.2,
        "salience": 0.2,
        "tags": ["personal", "neutral"],
    }

    def __init__(self, name: str = "personal_input", seed: int | None = None) -> None:
        super().__init__(name)
        self._seed = seed
        self._rng = random.Random(seed)
        self._constraints: dict[str, Any] = {}
        self._last_mood: dict[str, Any] = {}
        self.subscribe(
            "data.identity.constraint",
            "identity.initialized",
            "identity.constraints",
            "control.module.init",
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={"fragment_count": 0, "last_phase": None},
        )

    def init(self, context: dict[str, Any]) -> None:
        """Initialize from context, including identity constraints if provided."""
        identity = context.get("identity", {})
        if identity:
            self._constraints = identity

    def to_dict(self) -> dict[str, Any]:
        """Serialize personal input state."""
        base = super().to_dict()
        base["seed"] = self._seed
        base["constraints"] = self._constraints
        base["last_mood"] = self._last_mood
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore personal input state."""
        super().from_dict(data, **kwargs)
        self._seed = data.get("seed")
        if self._seed is not None:
            self._rng = random.Random(self._seed)
        else:
            self._rng = random.Random()
        self._constraints = data.get("constraints", {})
        self._last_mood = data.get("last_mood", {})

    def on_bus_message(self, message: BusMessage) -> None:
        """Capture identity constraints broadcast by the identity core."""
        if message.topic in ("data.identity.constraint", "identity.initialized", "identity.constraints"):
            payload = message.payload or {}
            constraints = payload.get("constraints") or payload
            if isinstance(constraints, dict):
                self._constraints = constraints

    def tick(self, delta: TickDelta) -> None:
        """Generate a personal fragment appropriate to the current phase."""
        phase = delta.phase
        if phase == "social":
            # Personal input is mostly dormant during explicit social phases.
            self._state.custom["last_phase"] = phase
            return

        fragment = self._generate_fragment(phase, delta.absolute_time)
        self._state.custom["fragment_count"] += 1
        self._state.custom["last_phase"] = phase

        self.emit(
            topic="fragment.personal.new",
            payload=fragment,
            channel="data",
            priority=4,
            ttl=3,
        )

        mood = {
            "valence": fragment.valence,
            "arousal": fragment.arousal,
            "phase": phase,
            "source": self.name,
        }
        if mood != self._last_mood:
            self.emit(
                topic="event.personal.mood.changed",
                payload=mood,
                channel="event",
                priority=4,
                ttl=2,
            )
            self._last_mood = mood

        self.emit(
            topic="data.personal.state",
            payload={
                "phase": phase,
                "latest_fragment": fragment,
                "mood": mood,
                "fragment_count": self._state.custom["fragment_count"],
                "constraints_applied": bool(self._constraints),
            },
            channel="data",
            priority=3,
            ttl=2,
        )

    def _generate_fragment(self, phase: str, timestamp: float) -> Fragment:
        """Build a phase-specific fragment, flavored by identity constraints."""
        table = self.FRAGMENT_TABLE.get(phase, [self.FALLBACK])
        template = self._rng.choice(table)

        content = self._apply_constraints(str(template["content"]))
        fragment = Fragment(
            content=content,
            source="personal",
            modality=template.get("modality", "emotion"),
            valence=float(template.get("valence", 0.0)),
            arousal=float(template.get("arousal", 0.2)),
            salience=float(template.get("salience", 0.3)),
            timestamp=timestamp,
            tags=list(template.get("tags", ["personal", phase])),
        )
        return fragment

    def _apply_constraints(self, content: str) -> str:
        """Optionally weave identity interests or values into the fragment."""
        if not self._constraints:
            return content

        interests = self._constraints.get("interests", [])
        values = self._constraints.get("values", [])
        if not interests and not values:
            return content

        # Avoid mutating every fragment; apply identity flavor sparingly.
        if self._rng.random() < 0.3 and interests:
            interest = self._rng.choice(interests)
            return f"{content} (touched by the old theme of {interest})"
        if self._rng.random() < 0.15 and values:
            value = self._rng.choice(values)
            return f"{content} [{value}]"
        return content
