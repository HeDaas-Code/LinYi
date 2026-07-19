"""Identity core module for the novelist brain prototype."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass


@dataclass
class IdentityProfile:
    """Stable identity data for the novelist agent."""

    name: str = "novelist"
    pen_name: str = ""
    values: list[str] = field(default_factory=list)
    traits: dict[str, float] = field(default_factory=dict)
    interests: list[str] = field(default_factory=list)
    self_narrative: str = ""
    voice_signature: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.values:
            self.values = ["truth", "empathy", "beauty", "freedom"]
        if not self.traits:
            self.traits = {
                "openness": 0.8,
                "introversion": 0.7,
                "neuroticism": 0.5,
                "conscientiousness": 0.6,
            }
        if not self.interests:
            self.interests = ["urban life", "memory", "loneliness", "time"]
        if not self.self_narrative:
            self.self_narrative = (
                "I am a quiet observer who turns ordinary moments into fiction."
            )


class IdentityCore(Module):
    """Maintains stable identity and broadcasts personality constraints.

    The identity core does not directly call other modules.  Instead, it
    publishes constraint messages on the control and data buses so that DMN,
    CEN, Sandbox and Creation modules can inject a consistent personality.
    """

    def __init__(self, name: str = "identity_core", profile: IdentityProfile | None = None) -> None:
        super().__init__(name)
        self._profile = profile if profile is not None else IdentityProfile()
        self.subscribe(
            "control.identity.request",
            "data.identity.profile",
            "control.module.init",
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(active=True, custom={"broadcast_count": 0, "last_phase": None})

    @property
    def profile(self) -> IdentityProfile:
        return self._profile

    def get_constraints(self) -> dict[str, Any]:
        """Return a serializable snapshot of current identity constraints."""
        return {
            "name": self._profile.name,
            "pen_name": self._profile.pen_name,
            "values": list(self._profile.values),
            "traits": dict(self._profile.traits),
            "interests": list(self._profile.interests),
            "self_narrative": self._profile.self_narrative,
            "voice_signature": dict(self._profile.voice_signature),
        }

    def to_dict(self) -> dict[str, Any]:
        """Serialize identity core state."""
        base = super().to_dict()
        base["profile"] = dataclass_to_dict(self._profile)
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore identity core state."""
        super().from_dict(data, **kwargs)
        profile_data = data.get("profile")
        if profile_data:
            self._profile = reconstruct_dataclass(IdentityProfile, profile_data)

    def init(self, context: dict[str, Any]) -> None:
        """Initialize from context, optionally overriding the profile."""
        profile_data = context.get("identity", {})
        if profile_data:
            self._profile = IdentityProfile(**profile_data)
        self._broadcast_constraints("identity.initialized")

    def on_bus_message(self, message: BusMessage) -> None:
        """Respond to identity-related requests."""
        if message.topic == "control.identity.request":
            self._broadcast_constraints("identity.constraints")
        elif message.topic == "data.identity.profile":
            payload = message.payload or {}
            if "profile" in payload:
                self._profile = IdentityProfile(**payload["profile"])

    def tick(self, delta: TickDelta) -> None:
        """Re-broadcast constraints whenever the daily phase changes."""
        current_phase = delta.phase
        last_phase = self._state.custom.get("last_phase")
        if current_phase != last_phase:
            self._state.custom["last_phase"] = current_phase
            self._broadcast_constraints("identity.constraints")

    def _broadcast_constraints(self, topic: str) -> None:
        constraints = self.get_constraints()
        self.emit(
            topic=topic,
            payload={"source": self.name, "constraints": constraints},
            channel="data",
            priority=7,
            ttl=5,
        )
        self._state.custom["broadcast_count"] += 1
