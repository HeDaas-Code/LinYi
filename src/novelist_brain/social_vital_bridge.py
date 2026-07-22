"""SocialVitalBridge: turn social events into evolving vital state.

Inspired by Project AIRI's emotional continuity, this module listens to OC town
activity and reader interactions and nudges LinYi's internal mood, arousal,
reader warmth and creative drive.  The result is published back to the bus as
``data.metabolism.state`` so that :class:`ExpressionState` and other consumers
can render a character whose emotions are tied to what just happened in their
social world.
"""

from __future__ import annotations

from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


#: Topic emitted when the vital state is nudged by a social event.
TOPIC_SOCIAL_VITAL_UPDATED = "data.social.vital.updated"


class SocialVitalBridge(Module):
    """Bridge social input into continuous vital-state changes."""

    # Baseline values that the state slowly drifts back toward.
    BASE_AROUSAL: float = 0.5
    BASE_READER_TEMPERATURE: float = 0.5
    BASE_CREATIVE_DRIVE: float = 0.5

    def __init__(self, name: str = "social_vital_bridge") -> None:
        super().__init__(name)
        self._mood_bias: str = "平静"
        self._arousal: float = 0.5
        self._reader_temperature: float = 0.5
        self._creative_drive: float = 0.5
        self._decay_per_hour: float = 0.05
        self.subscribe(
            "data.oc.town.event",
            "event.reader.interaction",
            "data.relationship.updated",
            "data.reader.profile.updated",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "social_vital_bridge",
            "version": "0.1.0",
            "description": "Turn social events into evolving vital state",
            "dependencies": [],
            "category": "social",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "mood_bias": "平静",
                "arousal": 0.5,
                "reader_temperature": 0.5,
                "creative_drive": 0.5,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def mood_bias(self) -> str:
        return self._mood_bias

    @property
    def arousal(self) -> float:
        return self._arousal

    @property
    def reader_temperature(self) -> float:
        return self._reader_temperature

    @property
    def creative_drive(self) -> float:
        return self._creative_drive

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        vital = context.get("vital_state")
        if isinstance(vital, dict):
            self._mood_bias = str(vital.get("mood_bias", "平静"))
            self._arousal = float(vital.get("arousal", 0.5))
            self._reader_temperature = float(vital.get("reader_temperature", 0.5))
            self._creative_drive = float(vital.get("creative_drive", 0.5))

        cfg = context.get("social_vital_bridge", {})
        decay = cfg.get("decay_per_hour")
        if isinstance(decay, (int, float)) and decay >= 0:
            self._decay_per_hour = float(decay)

        self._sync_state()

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        payload = message.payload or {}

        if message.topic == "data.oc.town.event":
            self._handle_town_event(payload)
            return

        if message.topic == "event.reader.interaction":
            self._handle_reader_interaction(payload)
            return

        if message.topic == "data.relationship.updated":
            self._handle_relationship_update(payload)
            return

        if message.topic == "data.reader.profile.updated":
            self._handle_reader_profile_update(payload)
            return

    def tick(self, delta: TickDelta) -> None:
        """Slowly decay social excitation back toward baseline."""
        if self._decay_per_hour <= 0.0:
            return
        hours = delta.delta_ms / (3600.0 * 1000.0)
        if hours <= 0.0:
            return

        self._arousal = self._drift(self._arousal, self.BASE_AROUSAL, hours)
        self._reader_temperature = self._drift(
            self._reader_temperature, self.BASE_READER_TEMPERATURE, hours
        )
        self._creative_drive = self._drift(
            self._creative_drive, self.BASE_CREATIVE_DRIVE, hours
        )
        self._broadcast()

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    def _handle_town_event(self, payload: dict[str, Any]) -> None:
        kind = payload.get("kind")
        extra = payload.get("extra", {})

        if kind == "conversation":
            delta = float(extra.get("relationship_delta", 0.05))
            mood = "愉悦" if delta > 0.05 else None
            self._nudge(
                arousal=delta * 2.0,
                creative_drive=delta,
                mood_towards=mood,
            )
            return

        if kind == "reflection":
            # Reflections are inward and slightly creative, but calming.
            self._nudge(arousal=-0.02, creative_drive=0.03)
            return

        if kind == "agent_moved":
            # A little environmental stimulation.
            self._nudge(arousal=0.01)
            return

        if kind == "external":
            # External story injections create mild alertness.
            self._nudge(arousal=0.02, creative_drive=0.01)
            return

    def _handle_reader_interaction(self, payload: dict[str, Any]) -> None:
        summary = str(payload.get("summary") or payload.get("content") or "")
        sentiment = self._quick_sentiment(summary)
        self._nudge(
            reader_temperature=0.03 * (1 if sentiment >= 0 else -1),
            arousal=0.02 * abs(sentiment),
            mood_towards="愉悦" if sentiment > 0 else None,
        )

    def _handle_relationship_update(self, payload: dict[str, Any]) -> None:
        weight = float(payload.get("weight", 0.0))
        kind = payload.get("kind", "")
        if kind == "affinity":
            if weight >= 0.5:
                self._nudge(mood_towards="愉悦", reader_temperature=0.02)
            elif weight <= -0.3:
                self._nudge(mood_towards="忧郁")

    def _handle_reader_profile_update(self, payload: dict[str, Any]) -> None:
        temp = payload.get("reader_temperature")
        if isinstance(temp, (int, float)):
            self._reader_temperature = float(temp)
            self._nudge()

    # ------------------------------------------------------------------
    # State helpers
    # ------------------------------------------------------------------

    def _nudge(
        self,
        arousal: float = 0.0,
        reader_temperature: float = 0.0,
        creative_drive: float = 0.0,
        mood_towards: str | None = None,
    ) -> None:
        self._arousal = max(0.0, min(1.0, self._arousal + arousal))
        self._reader_temperature = max(
            0.0, min(1.0, self._reader_temperature + reader_temperature)
        )
        self._creative_drive = max(
            0.0, min(1.0, self._creative_drive + creative_drive)
        )
        if mood_towards:
            self._mood_bias = mood_towards
        self._broadcast()

    def _drift(self, current: float, target: float, hours: float) -> float:
        """Move ``current`` toward ``target`` by decay_per_hour * hours."""
        step = self._decay_per_hour * hours
        if current > target:
            return max(target, current - step)
        if current < target:
            return min(target, current + step)
        return current

    def _quick_sentiment(self, text: str) -> int:
        """Very lightweight sentiment hint for reader messages."""
        positives = {"喜欢", "爱", "好", "棒", "谢谢", "开心", "赞", "温柔"}
        negatives = {"讨厌", "恨", "差", "烦", "别", "生气", "滚", "失望"}
        pos = sum(1 for p in positives if p in text)
        neg = sum(1 for n in negatives if n in text)
        if pos > neg:
            return 1
        if neg > pos:
            return -1
        return 0

    def _sync_state(self) -> None:
        self._state.custom["mood_bias"] = self._mood_bias
        self._state.custom["arousal"] = self._arousal
        self._state.custom["reader_temperature"] = self._reader_temperature
        self._state.custom["creative_drive"] = self._creative_drive

    def _broadcast(self) -> None:
        self._sync_state()
        payload = {
            "mood_bias": self._mood_bias,
            "arousal": self._arousal,
            "reader_temperature": self._reader_temperature,
            "creative_drive": self._creative_drive,
        }
        self.emit(
            topic="data.metabolism.state",
            payload=payload,
            channel="data",
            priority=4,
            ttl=3,
        )
        self.emit(
            topic=TOPIC_SOCIAL_VITAL_UPDATED,
            payload=payload,
            channel="data",
            priority=4,
            ttl=3,
        )

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "mood_bias": self._mood_bias,
                "arousal": self._arousal,
                "reader_temperature": self._reader_temperature,
                "creative_drive": self._creative_drive,
                "decay_per_hour": self._decay_per_hour,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._mood_bias = str(data.get("mood_bias", "平静"))
        self._arousal = float(data.get("arousal", 0.5))
        self._reader_temperature = float(data.get("reader_temperature", 0.5))
        self._creative_drive = float(data.get("creative_drive", 0.5))
        self._decay_per_hour = float(data.get("decay_per_hour", 0.05))
        self._sync_state()


__all__ = [
    "SocialVitalBridge",
    "TOPIC_SOCIAL_VITAL_UPDATED",
]
