"""ExpressionState: map internal vital state to visible emotion/expression.

Inspired by SillyTavern's Expression Images / sprites, this module consumes
``data.metabolism.state`` and ``data.reader.profile.updated`` to produce a
stable expression label and intensity that a frontend can render as an avatar,
sprite, or color theme.  It makes the agent feel "alive" on screen.
"""

from __future__ import annotations

from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState
from src.novelist_brain.module import Module


#: Topic emitted when the visible expression changes.
TOPIC_EXPRESSION_CHANGED = "data.expression.changed"


class ExpressionState(Module):
    """Translate mood/arousal/reader warmth into a frontend-ready expression."""

    # Mood bias -> base expression family.
    MOOD_EXPRESSIONS: dict[str, str] = {
        "平静": "neutral",
        "愉悦": "happy",
        "忧郁": "sad",
        "焦虑": "worried",
        "兴奋": "excited",
    }

    # Arousal level expression suffix.
    AROUSAL_SUFFIX: dict[str, str] = {
        "low": "_calm",
        "medium": "",
        "high": "_intense",
    }

    def __init__(self, name: str = "expression_state") -> None:
        super().__init__(name)
        self._mood_bias: str = "平静"
        self._arousal: float = 0.5
        self._reader_temperature: float = 0.5
        self._expression: str = "neutral"
        self._intensity: float = 0.5
        self.subscribe(
            "data.metabolism.state",
            "data.reader.profile.updated",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "expression_state",
            "version": "0.1.0",
            "description": "Map vital state to a visible expression label",
            "dependencies": [],
            "category": "presentation",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "expression": "neutral",
                "intensity": 0.5,
            },
        )

    @property
    def expression(self) -> str:
        return self._expression

    @property
    def intensity(self) -> float:
        return self._intensity

    @property
    def mood_bias(self) -> str:
        return self._mood_bias

    @property
    def arousal(self) -> float:
        return self._arousal

    @property
    def reader_temperature(self) -> float:
        return self._reader_temperature

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        vital = context.get("vital_state")
        if isinstance(vital, dict):
            self._mood_bias = str(vital.get("mood_bias", "平静"))
            self._arousal = float(vital.get("arousal", 0.5))
            self._reader_temperature = float(vital.get("reader_temperature", 0.5))
        self._recalculate()

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        payload = message.payload or {}
        if message.topic == "data.metabolism.state":
            if "mood_bias" in payload:
                self._mood_bias = str(payload["mood_bias"])
            if "arousal" in payload:
                self._arousal = float(payload["arousal"])
            if "reader_temperature" in payload:
                self._reader_temperature = float(payload["reader_temperature"])
            self._recalculate()
        elif message.topic == "data.reader.profile.updated":
            temp = payload.get("reader_temperature")
            if isinstance(temp, (int, float)):
                self._reader_temperature = float(temp)
                self._recalculate()

    def tick(self, delta: Any) -> None:
        return None

    # ------------------------------------------------------------------
    # Expression calculation
    # ------------------------------------------------------------------

    def _recalculate(self) -> None:
        base = self.MOOD_EXPRESSIONS.get(self._mood_bias, "neutral")
        if self._arousal < 0.35:
            suffix = self.AROUSAL_SUFFIX["low"]
        elif self._arousal > 0.65:
            suffix = self.AROUSAL_SUFFIX["high"]
        else:
            suffix = self.AROUSAL_SUFFIX["medium"]

        # Blend reader warmth into intensity.
        intensity = 0.5 * self._arousal + 0.5 * self._reader_temperature
        intensity = max(0.0, min(1.0, intensity))

        new_expression = f"{base}{suffix}"
        if new_expression != self._expression or abs(intensity - self._intensity) > 0.05:
            self._expression = new_expression
            self._intensity = intensity
            self._state.custom["expression"] = new_expression
            self._state.custom["intensity"] = intensity
            self.emit(
                topic=TOPIC_EXPRESSION_CHANGED,
                payload={
                    "expression": new_expression,
                    "intensity": intensity,
                    "mood_bias": self._mood_bias,
                    "arousal": self._arousal,
                    "reader_temperature": self._reader_temperature,
                },
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
                "expression": self._expression,
                "intensity": self._intensity,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._mood_bias = str(data.get("mood_bias", "平静"))
        self._arousal = float(data.get("arousal", 0.5))
        self._reader_temperature = float(data.get("reader_temperature", 0.5))
        self._expression = str(data.get("expression", "neutral"))
        self._intensity = float(data.get("intensity", 0.5))
        self._state.custom["expression"] = self._expression
        self._state.custom["intensity"] = self._intensity


__all__ = [
    "ExpressionState",
    "TOPIC_EXPRESSION_CHANGED",
]
