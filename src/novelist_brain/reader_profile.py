"""ReaderProfile: persistent persona for the human reader.

Inspired by SillyTavern's User Persona and MemGPT's working memory, this module
stores facts and preferences about the reader (name, relationship stage,
communication style, taboos) so that the agent can treat the reader as a
specific person rather than an anonymous prompt stream.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass


#: Topic emitted when the reader profile changes.
TOPIC_READER_PROFILE_UPDATED = "data.reader.profile.updated"


@dataclass
class ReaderProfileData:
    """Mutable facts and preferences about the reader."""

    reader_id: str = "default_reader"
    display_name: str = ""
    relationship_stage: str = "stranger"  # stranger | acquaintance | friend | close
    preferred_tone: str = "gentle"  # gentle | teasing | formal | playful
    taboo_topics: list[str] = field(default_factory=list)
    known_facts: dict[str, str] = field(default_factory=dict)
    last_seen_at: float = 0.0
    total_interactions: int = 0
    reader_temperature: float = 0.5


class ReaderProfile(Module):
    """Maintain and broadcast a persistent reader persona."""

    def __init__(self, name: str = "reader_profile") -> None:
        super().__init__(name)
        self._profile = ReaderProfileData()
        self.subscribe(
            "event.reader.interaction",
            "data.reader.message",
            "control.reader.profile.update",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "reader_profile",
            "version": "0.1.0",
            "description": "Persistent reader persona for personalized interaction",
            "dependencies": [],
            "category": "input",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={"total_interactions": 0},
        )

    @property
    def profile(self) -> ReaderProfileData:
        return self._profile

    def set_fact(self, key: str, value: str) -> None:
        """Record a known fact about the reader."""
        self._profile.known_facts[key.strip()] = value.strip()
        self._broadcast_update()

    def set_relationship_stage(self, stage: str) -> None:
        """Update the relationship stage."""
        self._profile.relationship_stage = stage
        self._broadcast_update()

    def record_interaction(self, timestamp: float | None = None) -> None:
        """Bump interaction counters and temperature."""
        now = timestamp if timestamp is not None else time.time()
        self._profile.last_seen_at = now
        self._profile.total_interactions += 1
        self._state.custom["total_interactions"] = self._profile.total_interactions
        # Slight warmth increase with sustained interaction.
        self._profile.reader_temperature = min(
            1.0, self._profile.reader_temperature + 0.02
        )

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("reader_profile", {})
        self._profile.reader_id = str(cfg.get("reader_id", "default_reader"))
        self._profile.display_name = str(cfg.get("display_name", ""))
        stage = cfg.get("relationship_stage")
        if isinstance(stage, str):
            self._profile.relationship_stage = stage
        tone = cfg.get("preferred_tone")
        if isinstance(tone, str):
            self._profile.preferred_tone = tone
        taboos = cfg.get("taboo_topics")
        if isinstance(taboos, (list, tuple)):
            self._profile.taboo_topics = [str(t) for t in taboos]
        facts = cfg.get("known_facts")
        if isinstance(facts, dict):
            self._profile.known_facts = {str(k): str(v) for k, v in facts.items()}
        temp = cfg.get("reader_temperature")
        if isinstance(temp, (int, float)):
            self._profile.reader_temperature = float(temp)

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        payload = message.payload or {}

        if topic in ("event.reader.interaction", "data.reader.message"):
            self.record_interaction()
            return

        if topic == "control.reader.profile.update":
            facts = payload.get("facts")
            if isinstance(facts, dict):
                for k, v in facts.items():
                    self.set_fact(str(k), str(v))
            stage = payload.get("relationship_stage")
            if isinstance(stage, str):
                self.set_relationship_stage(stage)
            return

    def tick(self, delta: Any) -> None:
        return None

    # ------------------------------------------------------------------
    # Event publishing
    # ------------------------------------------------------------------

    def _broadcast_update(self) -> None:
        self.emit(
            topic=TOPIC_READER_PROFILE_UPDATED,
            payload={
                "reader_id": self._profile.reader_id,
                "display_name": self._profile.display_name,
                "relationship_stage": self._profile.relationship_stage,
                "preferred_tone": self._profile.preferred_tone,
                "reader_temperature": self._profile.reader_temperature,
                "known_facts": dict(self._profile.known_facts),
            },
            channel="data",
            priority=5,
            ttl=3,
        )

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base["profile"] = dataclass_to_dict(self._profile)
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        profile_data = data.get("profile")
        if isinstance(profile_data, dict):
            self._profile = reconstruct_dataclass(ReaderProfileData, profile_data)


__all__ = [
    "ReaderProfile",
    "ReaderProfileData",
    "TOPIC_READER_PROFILE_UPDATED",
]
