"""ExpressionState: map internal vital state to visible emotion/expression.

Inspired by SillyTavern's Expression Images and Project AIRI's unified
renderer-agnostic emotion vocabulary, this module consumes
``data.metabolism.state`` and ``data.reader.profile.updated`` to produce a
stable expression label plus a structured body-expression payload that any
frontend renderer (Live2D / VRM / MMD / Spine / Three) can consume.

The output keeps the legacy ``expression`` string for simple consumers and adds
an ``emotion`` vocabulary + ``expression_targets`` dict + ``blend_duration``
so advanced renderers can cross-fade morphs smoothly instead of snapping
between labels.

Project AIRI extensions (added 2026-07-22):

- ``relaxed`` emotion for low-arousal calm states.
- ``BodyState`` autonomous body parameters: blink_rate, gaze_target,
  breath_speed, pose.
- ``default_duration`` / ``reset_at`` so transient emotions auto-decay back to
  neutral, matching AIRI's ``setEmotionWithResetAfter`` behaviour.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState
from src.novelist_brain.module import Module


#: Topic emitted when the visible expression changes.
TOPIC_EXPRESSION_CHANGED = "data.expression.changed"


@dataclass(frozen=True)
class EmotionProfile:
    """Project AIRI-style renderer-agnostic emotion definition.

    Each emotion maps to a set of facial expression targets with weights and a
    cross-fade duration.  Weights are full-intensity values; the actual applied
    weight is scaled by the computed intensity.

    ``default_duration`` is the number of seconds after which AIRI-style
    renderers should auto-fade back toward ``neutral``/``relaxed``.  ``None``
    means "hold until the next state change".
    """

    emotion: str
    blend_duration: float
    expression_targets: dict[str, float]
    action: str | None = None
    default_duration: float | None = None


@dataclass(frozen=True)
class BodyState:
    """Autonomous body parameters inspired by AIRI's Stage "life signs".

    These values are renderer-agnostic hints that any frontend can interpret
    to make LinYi feel present on screen: blink rate, where to look, idle
    breath speed, and a suggested pose.
    """

    blink_rate: float  # blinks per minute
    gaze_target: dict[str, float]  # normalized {x, y, z}
    breath_speed: float  # idle animation speed multiplier
    pose: str  # idle / lean_forward / lean_back / cross_arms / head_tilt / head_down / fidget

    def to_dict(self) -> dict[str, Any]:
        return {
            "blink_rate": self.blink_rate,
            "gaze_target": dict(self.gaze_target),
            "breath_speed": self.breath_speed,
            "pose": self.pose,
        }


# Project AIRI unified emotion vocabulary.
# Values kept in the 0.7-0.8 range to avoid the "over-expressive" look noted in
# AIRI issue #590; a small secondary mouth/eye morph keeps the face from
# reading as flat.
EMOTION_PROFILES: dict[str, EmotionProfile] = {
    "happy": EmotionProfile(
        emotion="happy",
        blend_duration=0.4,
        expression_targets={"happy": 0.7, "aa": 0.2},
        action="happy",
        default_duration=3.0,
    ),
    "sad": EmotionProfile(
        emotion="sad",
        blend_duration=0.4,
        expression_targets={"sad": 0.7, "oh": 0.15},
        action="sad",
        default_duration=5.0,
    ),
    "angry": EmotionProfile(
        emotion="angry",
        blend_duration=0.3,
        expression_targets={"angry": 0.7, "ee": 0.3},
        action="angry",
        default_duration=3.0,
    ),
    "surprised": EmotionProfile(
        emotion="surprised",
        blend_duration=0.15,
        expression_targets={"surprised": 0.8, "oh": 0.4},
        action="surprise",
        default_duration=1.5,
    ),
    "think": EmotionProfile(
        emotion="think",
        blend_duration=0.5,
        expression_targets={"think": 0.7},
        action="think",
        default_duration=4.0,
    ),
    "awkward": EmotionProfile(
        emotion="awkward",
        blend_duration=0.4,
        expression_targets={"troubled": 0.6, "smile": 0.2},
        action="awkward",
        default_duration=3.0,
    ),
    "question": EmotionProfile(
        emotion="question",
        blend_duration=0.4,
        expression_targets={"troubled": 0.4, "surprise": 0.2},
        action="question",
        default_duration=3.0,
    ),
    "curious": EmotionProfile(
        emotion="curious",
        blend_duration=0.4,
        expression_targets={"surprise": 0.35, "smile": 0.25},
        action="curious",
        default_duration=4.0,
    ),
    "neutral": EmotionProfile(
        emotion="neutral",
        blend_duration=0.6,
        expression_targets={"neutral": 1.0},
        action="idle",
        default_duration=None,
    ),
    "relaxed": EmotionProfile(
        emotion="relaxed",
        blend_duration=0.8,
        expression_targets={"relaxed": 0.7},
        action="idle",
        default_duration=None,
    ),
}


class ExpressionState(Module):
    """Translate mood/arousal/reader warmth into a frontend-ready expression.

    In addition to the legacy expression label, the module now computes a
    Project AIRI-style structured payload:

    - ``emotion``: unified renderer-agnostic emotion name.
    - ``intensity``: computed from arousal and reader warmth, clamped to [0,1].
    - ``blend_duration``: how long the cross-fade should take in seconds.
    - ``expression_targets``: mapping of renderer-specific expression/morph
      names to full-intensity target weights.
    - ``action``: optional gesture/motion hint (e.g. ``happy``, ``idle``).
    - ``body_state``: autonomous body parameters (blink, gaze, breath, pose).
    - ``reset_at``: UNIX timestamp when the emotion should auto-decay, or
      ``None`` for persistent states.

    The legacy ``expression`` string is kept for backwards compatibility with
    simple sprite-based frontends.
    """

    # Mood bias -> base expression family.
    MOOD_EXPRESSIONS: dict[str, str] = {
        "平静": "neutral",
        "放松": "relaxed",
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

    # Deterministic gaze targets per AIRI emotion (normalized screen/model space).
    EMOTION_GAZE: dict[str, dict[str, float]] = {
        "neutral": {"x": 0.5, "y": 0.5, "z": 1.0},
        "relaxed": {"x": 0.5, "y": 0.45, "z": 1.05},
        "happy": {"x": 0.5, "y": 0.5, "z": 0.9},
        "sad": {"x": 0.5, "y": 0.35, "z": 1.1},
        "angry": {"x": 0.4, "y": 0.5, "z": 1.2},
        "surprised": {"x": 0.5, "y": 0.55, "z": 0.8},
        "think": {"x": 0.55, "y": 0.55, "z": 1.1},
        "awkward": {"x": 0.45, "y": 0.45, "z": 1.1},
        "question": {"x": 0.6, "y": 0.5, "z": 0.9},
        "curious": {"x": 0.55, "y": 0.5, "z": 0.85},
    }

    def __init__(self, name: str = "expression_state") -> None:
        super().__init__(name)
        self._mood_bias: str = "平静"
        self._arousal: float = 0.5
        self._reader_temperature: float = 0.5
        self._expression: str = "neutral"
        self._intensity: float = 0.5
        self._emotion: str = "neutral"
        self._blend_duration: float = 0.6
        self._expression_targets: dict[str, float] = {}
        self._action: str | None = "idle"
        self._body_state: BodyState = BodyState(
            blink_rate=18.0,
            gaze_target={"x": 0.5, "y": 0.5, "z": 1.0},
            breath_speed=1.0,
            pose="idle",
        )
        self._reset_at: float | None = None
        self.subscribe(
            "data.metabolism.state",
            "data.reader.profile.updated",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "expression_state",
            "version": "0.3.0",
            "description": "Map vital state to a visible expression label, structured body params and life signs",
            "dependencies": [],
            "category": "presentation",
        }

    def _initial_state(self) -> ModuleState:
        default_body = BodyState(
            blink_rate=18.0,
            gaze_target={"x": 0.5, "y": 0.5, "z": 1.0},
            breath_speed=1.0,
            pose="idle",
        )
        return ModuleState(
            active=True,
            energy_cost=0.0,
            custom={
                "expression": "neutral",
                "intensity": 0.5,
                "emotion": "neutral",
                "blend_duration": 0.6,
                "body_state": default_body.to_dict(),
                "reset_at": None,
            },
        )

    @property
    def expression(self) -> str:
        return self._expression

    @property
    def intensity(self) -> float:
        return self._intensity

    @property
    def emotion(self) -> str:
        return self._emotion

    @property
    def blend_duration(self) -> float:
        return self._blend_duration

    @property
    def expression_targets(self) -> dict[str, float]:
        return dict(self._expression_targets)

    @property
    def action(self) -> str | None:
        return self._action

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
    def body_state(self) -> BodyState:
        return self._body_state

    @property
    def reset_at(self) -> float | None:
        return self._reset_at

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

        # Low-arousal "平静" drifts toward "relaxed" rather than a muted
        # "neutral_calm", matching AIRI's relaxed state.
        if base == "neutral" and self._arousal < 0.35:
            base = "relaxed"

        if base == "relaxed":
            suffix = ""
        elif self._arousal < 0.35:
            suffix = self.AROUSAL_SUFFIX["low"]
        elif self._arousal > 0.65:
            suffix = self.AROUSAL_SUFFIX["high"]
        else:
            suffix = self.AROUSAL_SUFFIX["medium"]

        # Blend reader warmth into intensity.
        intensity = 0.5 * self._arousal + 0.5 * self._reader_temperature
        intensity = max(0.0, min(1.0, intensity))

        new_expression = f"{base}{suffix}" if suffix else base

        # Map the legacy expression family to the Project AIRI emotion profile.
        emotion_key = self._map_legacy_expression_to_emotion(base, suffix)
        profile = EMOTION_PROFILES.get(emotion_key, EMOTION_PROFILES["neutral"])
        new_body_state = self._compute_body_state(profile.emotion, intensity)

        changed = (
            new_expression != self._expression
            or abs(intensity - self._intensity) > 0.05
            or self._emotion != profile.emotion
            or new_body_state != self._body_state
        )

        if changed:
            # Only reset the auto-decay timestamp when the emotion actually
            # changes; otherwise time.time() drift would cause spurious emits.
            new_reset_at = self._compute_reset_at(profile.default_duration)
            self._expression = new_expression
            self._intensity = intensity
            self._emotion = profile.emotion
            self._blend_duration = profile.blend_duration
            self._expression_targets = {
                name: weight * intensity
                for name, weight in profile.expression_targets.items()
            }
            self._action = profile.action
            self._body_state = new_body_state
            self._reset_at = new_reset_at

            self._state.custom["expression"] = new_expression
            self._state.custom["intensity"] = intensity
            self._state.custom["emotion"] = profile.emotion
            self._state.custom["blend_duration"] = profile.blend_duration
            self._state.custom["body_state"] = new_body_state.to_dict()
            self._state.custom["reset_at"] = new_reset_at

            # Only emit when attached to a router; init() may be called
            # before register() in some test/bootstrap paths.
            if self._router is not None:
                self.emit(
                    topic=TOPIC_EXPRESSION_CHANGED,
                    payload={
                        "expression": new_expression,
                        "emotion": profile.emotion,
                        "intensity": intensity,
                        "blend_duration": profile.blend_duration,
                        "expression_targets": self._expression_targets,
                        "action": profile.action,
                        "body_state": new_body_state.to_dict(),
                        "reset_at": new_reset_at,
                        "mood_bias": self._mood_bias,
                        "arousal": self._arousal,
                        "reader_temperature": self._reader_temperature,
                    },
                    channel="data",
                    priority=4,
                    ttl=3,
                )

    def _map_legacy_expression_to_emotion(
        self, base: str, suffix: str
    ) -> str:
        """Map legacy expression label to AIRI unified emotion vocabulary."""
        if base == "excited":
            return "surprised" if suffix == "_intense" else "happy"
        if base == "worried":
            return "think" if suffix == "_calm" else "question"
        if base == "sad":
            return "sad"
        if base == "happy":
            return "happy"
        if base == "relaxed":
            return "relaxed"
        if base == "neutral":
            if suffix == "_calm":
                return "neutral"
            if suffix == "_intense":
                return "curious"
            return "neutral"
        return "neutral"

    def _compute_body_state(self, emotion: str, intensity: float) -> BodyState:
        """Derive autonomous body parameters from AIRI life-sign heuristics."""
        # Blink rate: baseline ~18 bpm, faster when aroused/excited, slower
        # when calm/sleepy.
        arousal_nudge = (self._arousal - 0.5) * 16.0
        temperature_nudge = (self._reader_temperature - 0.5) * 4.0
        blink_rate = 18.0 + arousal_nudge + temperature_nudge
        blink_rate = max(8.0, min(30.0, blink_rate))

        # Breath/idle speed: calm -> slower, excited -> faster.
        breath_speed = 1.0 + (self._arousal - 0.5) * 0.6
        breath_speed = max(0.6, min(1.4, breath_speed))

        # Gaze target from emotion; intensity slightly pulls gaze closer (z
        # decreases) for engaged emotions.
        gaze = dict(self.EMOTION_GAZE.get(emotion, self.EMOTION_GAZE["neutral"]))
        if emotion in ("happy", "curious", "surprised"):
            engagement = 1.0 - 0.15 * intensity
            gaze["z"] = max(0.7, gaze["z"] * engagement)

        # Pose from emotion + arousal.
        pose = self._compute_pose(emotion)

        return BodyState(
            blink_rate=blink_rate,
            gaze_target=gaze,
            breath_speed=breath_speed,
            pose=pose,
        )

    def _compute_pose(self, emotion: str) -> str:
        """Suggest a pose hint based on emotion and arousal."""
        if emotion in ("neutral", "relaxed"):
            return "idle"
        if emotion == "happy":
            return "lean_forward" if self._arousal > 0.5 else "idle"
        if emotion == "curious":
            return "lean_forward" if self._arousal > 0.5 else "head_tilt"
        if emotion == "angry":
            return "cross_arms"
        if emotion == "sad":
            return "head_down"
        if emotion in ("think", "question"):
            return "head_tilt"
        if emotion == "surprised":
            return "lean_back"
        if emotion == "awkward":
            return "fidget"
        return "idle"

    def _compute_reset_at(self, default_duration: float | None) -> float | None:
        """Return the UNIX timestamp when the emotion should auto-decay."""
        if default_duration is None or default_duration <= 0:
            return None
        return time.time() + default_duration

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
                "emotion": self._emotion,
                "blend_duration": self._blend_duration,
                "expression_targets": dict(self._expression_targets),
                "action": self._action,
                "body_state": self._body_state.to_dict(),
                "reset_at": self._reset_at,
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
        self._emotion = str(data.get("emotion", "neutral"))
        self._blend_duration = float(data.get("blend_duration", 0.6))
        self._expression_targets = dict(data.get("expression_targets", {}))
        self._action = data.get("action")
        body = data.get("body_state") or {}
        gaze = body.get("gaze_target") or {"x": 0.5, "y": 0.5, "z": 1.0}
        self._body_state = BodyState(
            blink_rate=float(body.get("blink_rate", 18.0)),
            gaze_target=dict(gaze),
            breath_speed=float(body.get("breath_speed", 1.0)),
            pose=str(body.get("pose", "idle")),
        )
        self._reset_at = data.get("reset_at")
        self._state.custom["expression"] = self._expression
        self._state.custom["intensity"] = self._intensity
        self._state.custom["emotion"] = self._emotion
        self._state.custom["blend_duration"] = self._blend_duration
        self._state.custom["body_state"] = self._body_state.to_dict()
        self._state.custom["reset_at"] = self._reset_at


__all__ = [
    "ExpressionState",
    "TOPIC_EXPRESSION_CHANGED",
    "EmotionProfile",
    "EMOTION_PROFILES",
    "BodyState",
]
