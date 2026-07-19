"""Social input module for the novelist brain prototype."""

from __future__ import annotations

import random
from typing import Any

from src.novelist_brain.models import BusMessage, Fragment, ModuleState, TickDelta
from src.novelist_brain.module import Module


class SocialInput(Module):
    """Generates social fragments from encounters, overheard speech, and norms.

    Social fragments are expensive: the module publishes ``event.module.consume``
    so that metabolism can deduct the corresponding energy cost.  Most social
    input is concentrated in the ``social`` phase; other phases only produce
    faint intrusions such as a neighbor's voice.
    """

    SOCIAL_TABLE: list[dict[str, Any]] = [
        {
            "content": "A stranger at the square asks for the time and then lingers a moment too long.",
            "modality": "dialogue",
            "valence": 0.0,
            "arousal": 0.4,
            "salience": 0.55,
            "tags": ["social", "stranger", "square"],
            "norm_violated": False,
        },
        {
            "content": "In the café, two friends argue about money in voices meant to be private.",
            "modality": "dialogue",
            "valence": -0.2,
            "arousal": 0.5,
            "salience": 0.6,
            "tags": ["social", "cafe", "conflict"],
            "norm_violated": True,
        },
        {
            "content": "A child points at your notebook and asks why you are writing sad things.",
            "modality": "dialogue",
            "valence": 0.1,
            "arousal": 0.5,
            "salience": 0.65,
            "tags": ["social", "child", "notebook"],
            "norm_violated": False,
        },
        {
            "content": "You hold the door open; the nod exchanged feels like a small contract.",
            "modality": "event",
            "valence": 0.2,
            "arousal": 0.2,
            "salience": 0.35,
            "tags": ["social", "politeness", "gesture"],
            "norm_violated": False,
        },
        {
            "content": "Someone cuts the line; the room pretends not to notice.",
            "modality": "event",
            "valence": -0.3,
            "arousal": 0.5,
            "salience": 0.55,
            "tags": ["social", "norm", "transgression"],
            "norm_violated": True,
        },
        {
            "content": "An acquaintance talks for ten minutes without asking a single question.",
            "modality": "dialogue",
            "valence": -0.1,
            "arousal": 0.4,
            "salience": 0.5,
            "tags": ["social", "acquaintance", "monologue"],
            "norm_violated": True,
        },
        {
            "content": "At the table beside you, laughter rises and falls like a single instrument.",
            "modality": "event",
            "valence": 0.3,
            "arousal": 0.4,
            "salience": 0.45,
            "tags": ["social", "laughter", "cafe"],
            "norm_violated": False,
        },
    ]

    INTRUSION_TABLE: list[dict[str, Any]] = [
        {
            "content": "A neighbor's footsteps cross the ceiling at an odd hour.",
            "modality": "event",
            "valence": 0.0,
            "arousal": 0.2,
            "salience": 0.25,
            "tags": ["social", "neighbor", "intrusion"],
            "norm_violated": False,
        },
        {
            "content": "Distant sirens remind you that the city is awake even when you are not.",
            "modality": "event",
            "valence": -0.1,
            "arousal": 0.3,
            "salience": 0.3,
            "tags": ["social", "city", "sound"],
            "norm_violated": False,
        },
        {
            "content": "Someone coughs behind a closed door.",
            "modality": "event",
            "valence": 0.0,
            "arousal": 0.1,
            "salience": 0.15,
            "tags": ["social", "sound", "indoor"],
            "norm_violated": False,
        },
    ]

    ENERGY_COST: float = 1.2
    INTRUSION_CHANCE: float = 0.15

    def __init__(self, name: str = "social_input", seed: int | None = None) -> None:
        super().__init__(name)
        self._seed = seed
        self._rng = random.Random(seed)
        self._fragment_count = 0
        self._constraints: dict[str, Any] = {}
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
        """Serialize social input state."""
        base = super().to_dict()
        base["seed"] = self._seed
        base["constraints"] = self._constraints
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore social input state."""
        super().from_dict(data, **kwargs)
        self._seed = data.get("seed")
        if self._seed is not None:
            self._rng = random.Random(self._seed)
        else:
            self._rng = random.Random()
        self._constraints = data.get("constraints", {})
        self._fragment_count = self._state.custom.get("fragment_count", 0)

    def on_bus_message(self, message: BusMessage) -> None:
        """Capture identity constraints broadcast by the identity core."""
        if message.topic in ("data.identity.constraint", "identity.initialized", "identity.constraints"):
            payload = message.payload or {}
            constraints = payload.get("constraints") or payload
            if isinstance(constraints, dict):
                self._constraints = constraints

    def tick(self, delta: TickDelta) -> None:
        """Generate social fragments, mostly during the social phase."""
        phase = delta.phase
        self._state.custom["last_phase"] = phase

        if phase == "social":
            fragment = self._generate_social_fragment(delta.absolute_time)
            self._emit_social(fragment)
            return

        # Occasional light social intrusion in other phases.
        if self._rng.random() < self.INTRUSION_CHANCE:
            fragment = self._generate_intrusion(delta.absolute_time)
            self._emit_social(fragment)

    def _emit_social(self, fragment: Fragment) -> None:
        """Publish the social fragment and its associated state events."""
        self._fragment_count += 1
        self._state.custom["fragment_count"] = self._fragment_count

        self.emit(
            topic="fragment.social.new",
            payload=fragment,
            channel="data",
            priority=5,
            ttl=3,
        )

        # Social interaction is metabolically expensive.
        self.emit(
            topic="event.module.consume",
            payload={
                "module": "social",
                "cost_type": "energy",
                "amount": self.ENERGY_COST,
                "reason": "social_input_fragment",
            },
            channel="event",
            priority=6,
            ttl=3,
        )

        if fragment.tags and "norm" in fragment.tags:
            self.emit(
                topic="event.social.norm.violated",
                payload={
                    "fragment": fragment,
                    "description": fragment.content,
                    "severity": abs(fragment.valence) + fragment.arousal,
                },
                channel="event",
                priority=6,
                ttl=3,
            )

        self.emit(
            topic="data.social.state",
            payload={
                "latest_fragment": fragment,
                "fragment_count": self._fragment_count,
                "energy_cost": self.ENERGY_COST,
                "constraints_applied": bool(self._constraints),
            },
            channel="data",
            priority=4,
            ttl=2,
        )

    def _generate_social_fragment(self, timestamp: float) -> Fragment:
        """Build a fragment drawn from the social encounter table."""
        template = self._rng.choice(self.SOCIAL_TABLE)
        return self._fragment_from_template(template, timestamp)

    def _generate_intrusion(self, timestamp: float) -> Fragment:
        """Build a faint social intrusion fragment."""
        template = self._rng.choice(self.INTRUSION_TABLE)
        return self._fragment_from_template(template, timestamp)

    def _fragment_from_template(self, template: dict[str, Any], timestamp: float) -> Fragment:
        """Convert a template dict into a Fragment instance."""
        content = self._apply_constraints(str(template["content"]))
        fragment = Fragment(
            content=content,
            source="social",
            modality=template.get("modality", "event"),
            valence=float(template.get("valence", 0.0)),
            arousal=float(template.get("arousal", 0.3)),
            salience=float(template.get("salience", 0.4)),
            timestamp=timestamp,
            tags=list(template.get("tags", ["social"])),
        )
        return fragment

    def _apply_constraints(self, content: str) -> str:
        """Optionally flavor social content with identity values or interests."""
        if not self._constraints:
            return content

        interests = self._constraints.get("interests", [])
        values = self._constraints.get("values", [])
        if not interests and not values:
            return content

        if self._rng.random() < 0.2 and interests:
            interest = self._rng.choice(interests)
            return f"{content} (you notice it through the lens of {interest})"
        if self._rng.random() < 0.1 and values:
            value = self._rng.choice(values)
            return f"{content} [{value}]"
        return content
