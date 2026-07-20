"""Attachment theory module for the novelist brain prototype.

This module demonstrates Design.md §10 "添加新理论模块".  It listens to
social events and relationship deltas, maintains an attachment style for
each significant relationship, and publishes an overall attachment state.

Attachment styles map onto the four-category model (secure / anxious /
avoidant / disorganized) based on the balance of positive and negative
affect accumulated from social encounters and relationship changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict


class AttachmentStyle(str, Enum):
    """Bowlby/Ainsworth four-category attachment style."""

    SECURE = "secure"
    ANXIOUS = "anxious"
    AVOIDANT = "avoidant"
    DISORGANIZED = "disorganized"


@dataclass
class TargetAttachment:
    """Attachment profile toward a specific NPC or person."""

    target_id: str
    target_name: str = ""
    style: AttachmentStyle = AttachmentStyle.SECURE
    intensity: float = 0.0  # 0..1, salience of this bond
    positive_affect: float = 0.0  # accumulated positive signal
    negative_affect: float = 0.0  # accumulated negative signal
    inconsistency: float = 0.0  # 0..1, mixed signals
    seeded: bool = False  # True if created from a pre-existing relationship snapshot


@dataclass
class AttachmentState:
    """Global attachment state aggregated across relationships."""

    targets: dict[str, TargetAttachment] = field(default_factory=dict)
    overall: AttachmentStyle = AttachmentStyle.SECURE
    overall_intensity: float = 0.0


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _evaluate_style(
    positive: float, negative: float, intensity: float
) -> AttachmentStyle:
    """Map accumulated affect into an attachment style.

    Logic:
    - Both affects high and similar -> disorganized (inconsistent caregiving).
    - Negative dominates and intensity is high -> anxious (hypervigilant).
    - Negative dominates and intensity is low -> avoidant (withdrawn).
    - Otherwise -> secure.
    """
    total = positive + negative
    if total < 0.01:
        return AttachmentStyle.SECURE

    inconsistency = min(positive, negative) / total
    if inconsistency > 0.35 and positive > 0.05 and negative > 0.05:
        return AttachmentStyle.DISORGANIZED

    if negative > positive * 1.5:
        return AttachmentStyle.ANXIOUS if intensity > 0.4 else AttachmentStyle.AVOIDANT

    return AttachmentStyle.SECURE


class AttachmentModule(Module):
    """Derives attachment styles from social experience.

    The module is intentionally lightweight: it does not call other modules
    directly and only emits ``data.attachment.*`` events.  This makes it a
    clean example of how a new psychological theory can be plugged into the
    bus without changing ``main.py`` beyond registering the class.
    """

    # How much a single positive/negative signal moves affect.
    AFFECT_LEARNING_RATE: float = 0.08
    # How fast attachment intensity decays when a bond is inactive.
    INTENSITY_DECAY: float = 0.002
    # Threshold below which a target is forgotten.
    FORGET_INTENSITY: float = 0.03

    def __init__(self, name: str = "attachment") -> None:
        super().__init__(name)
        self._state_data = AttachmentState()
        self.subscribe(
            "data.social.relationship.delta",
            "data.social.gaze",
            "data.social.fragment",
            "data.social.state",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        data = super().metadata()
        data.update(
            {
                "name": "attachment",
                "version": "0.1.0",
                "description": (
                    "Derives Bowlby/Ainsworth attachment styles from social "
                    "encounters and relationship dynamics."
                ),
                "dependencies": ["social_input"],
                "category": "cognitive",
            }
        )
        return data

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            custom={"target_count": 0, "overall": AttachmentStyle.SECURE.value},
        )

    def init(self, context: dict[str, Any]) -> None:
        """Initialize from agent context; identity traits tune priors."""
        identity = context.get("identity", {})
        traits = identity.get("traits", {}) if isinstance(identity, dict) else {}
        neuroticism = float(traits.get("神经质", 0.5))
        # Higher neuroticism biases the default state toward anxious.
        if neuroticism > 0.7:
            self._state_data.overall = AttachmentStyle.ANXIOUS
        elif neuroticism < 0.3:
            self._state_data.overall = AttachmentStyle.SECURE
        else:
            self._state_data.overall = AttachmentStyle.AVOIDANT
        self._sync_state_custom()

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "attachment_state": {
                    "overall": self._state_data.overall.value,
                    "overall_intensity": self._state_data.overall_intensity,
                    "targets": {
                        tid: {
                            "target_id": t.target_id,
                            "target_name": t.target_name,
                            "style": t.style.value,
                            "intensity": t.intensity,
                            "positive_affect": t.positive_affect,
                            "negative_affect": t.negative_affect,
                            "inconsistency": t.inconsistency,
                        }
                        for tid, t in self._state_data.targets.items()
                    },
                }
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        state_data = data.get("attachment_state", {})
        self._state_data.overall = AttachmentStyle(
            state_data.get("overall", AttachmentStyle.SECURE.value)
        )
        self._state_data.overall_intensity = state_data.get(
            "overall_intensity", 0.0
        )
        self._state_data.targets = {
            tid: TargetAttachment(
                target_id=t.get("target_id", tid),
                target_name=t.get("target_name", ""),
                style=AttachmentStyle(t.get("style", AttachmentStyle.SECURE.value)),
                intensity=t.get("intensity", 0.0),
                positive_affect=t.get("positive_affect", 0.0),
                negative_affect=t.get("negative_affect", 0.0),
                inconsistency=t.get("inconsistency", 0.0),
            )
            for tid, t in state_data.get("targets", {}).items()
        }
        self._sync_state_custom()

    def on_bus_message(self, message: BusMessage) -> None:
        """Update attachment state from social signals."""
        if message.topic == "data.social.relationship.delta":
            self._on_relationship_delta(message.payload or {})
        elif message.topic == "data.social.gaze":
            self._on_gaze(message.payload or {})
        elif message.topic == "data.social.fragment":
            self._on_social_fragment(message.payload or {})
        elif message.topic == "data.social.state":
            self._on_social_state(message.payload or {})

    # Mapping from attachment style to downstream influence signals.
    _STYLE_TONE_MAP: dict[AttachmentStyle, dict[str, Any]] = {
        AttachmentStyle.SECURE: {
            "mood": "温暖而克制",
            "sentence_rhythm": "舒展，允许停顿与呼吸",
            "thematic_bias": ["和解", "连接", "信任"],
        },
        AttachmentStyle.ANXIOUS: {
            "mood": "紧张而渴望",
            "sentence_rhythm": "急促，反复，短句与追问交错",
            "thematic_bias": ["等待", "失去", "未回应的呼唤"],
        },
        AttachmentStyle.AVOIDANT: {
            "mood": "疏离而观察",
            "sentence_rhythm": "遥远，省略，景物多于情感",
            "thematic_bias": ["距离", "沉默", "自我保护"],
        },
        AttachmentStyle.DISORGANIZED: {
            "mood": "断裂而矛盾",
            "sentence_rhythm": "碎片化，视角突然切换",
            "thematic_bias": ["崩塌", "错位", "无法命名之物"],
        },
    }

    # Multiplier applied to social energy cost per encounter.
    _SOCIAL_ENERGY_BUDGET: dict[AttachmentStyle, float] = {
        AttachmentStyle.SECURE: 1.0,
        AttachmentStyle.ANXIOUS: 1.15,  # hypervigilance depletes faster
        AttachmentStyle.AVOIDANT: 1.4,  # social contact is costly
        AttachmentStyle.DISORGANIZED: 1.25,  # unstable regulation
    }

    # Network switching preference: positive dmn_bias favors DMN,
    # positive cen_bias favors CEN.
    _NETWORK_PREFERENCE: dict[AttachmentStyle, dict[str, float]] = {
        AttachmentStyle.SECURE: {"dmn_bias": 0.0, "cen_bias": 0.0},
        AttachmentStyle.ANXIOUS: {"dmn_bias": 0.12, "cen_bias": -0.05},
        AttachmentStyle.AVOIDANT: {"dmn_bias": -0.08, "cen_bias": 0.1},
        AttachmentStyle.DISORGANIZED: {"dmn_bias": 0.08, "cen_bias": 0.08},
    }

    def tick(self, delta: TickDelta) -> None:
        """Decay inactive bonds and recompute overall style."""
        to_forget: list[str] = []
        for tid, target in self._state_data.targets.items():
            target.intensity = _clamp(
                target.intensity - self.INTENSITY_DECAY, 0.0, 1.0
            )
            if target.intensity < self.FORGET_INTENSITY:
                to_forget.append(tid)
        for tid in to_forget:
            self._state_data.targets.pop(tid, None)

        self._recompute_overall()
        self._sync_state_custom()
        self._emit_influence_signals()

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    def _on_relationship_delta(self, payload: dict[str, Any]) -> None:
        delta = payload.get("delta", 0.0)
        target_id = payload.get("target_id", "")
        target_name = payload.get("target_name", "")
        if not target_id:
            return

        target = self._state_data.targets.get(target_id)
        if target is None:
            target = TargetAttachment(
                target_id=target_id, target_name=target_name
            )
            self._state_data.targets[target_id] = target

        # Positive delta increases bond intensity and positive affect;
        # negative delta does the opposite.
        if delta > 0:
            target.positive_affect = _clamp(
                target.positive_affect + delta * self.AFFECT_LEARNING_RATE
            )
            target.intensity = _clamp(target.intensity + delta * 0.1)
        elif delta < 0:
            target.negative_affect = _clamp(
                target.negative_affect + abs(delta) * self.AFFECT_LEARNING_RATE
            )
            target.intensity = _clamp(target.intensity + abs(delta) * 0.1)

        self._update_target_style(target)
        self._emit_style_updated(target)

    def _on_gaze(self, payload: dict[str, Any]) -> None:
        intensity = float(payload.get("intensity", 0.0))
        internalized = float(payload.get("internalized", 0.0))
        if intensity < 0.3:
            return

        # Strong gaze pressure from a socialized norm is interpreted as an
        # environmental "caregiver" signal.  If the novelist internalizes it
        # heavily while already anxious, it amplifies anxiety.
        overall = self._state_data.overall
        if overall in (AttachmentStyle.ANXIOUS, AttachmentStyle.DISORGANIZED):
            # Slightly increase negative affect globally by touching a
            # synthetic social-environment target.
            env = self._state_data.targets.get("social_environment")
            if env is None:
                env = TargetAttachment(
                    target_id="social_environment",
                    target_name="社会环境",
                )
                self._state_data.targets["social_environment"] = env
            env.negative_affect = _clamp(
                env.negative_affect + intensity * internalized * 0.02
            )
            env.intensity = _clamp(
                env.intensity + intensity * internalized * 0.02
            )
            self._update_target_style(env)

    def _on_social_fragment(self, payload: dict[str, Any]) -> None:
        fragment = payload.get("fragment", {})
        if not isinstance(fragment, dict):
            fragment = dataclass_to_dict(fragment)
        if not isinstance(fragment, dict):
            return
        valence = float(fragment.get("valence", 0.0))
        source = fragment.get("source", "")
        tags = fragment.get("tags", []) or []
        if source != "social" or not tags:
            return

        # If a fragment mentions a known target, nudge its affect slightly.
        for tid, target in self._state_data.targets.items():
            if tid == "social_environment":
                continue
            if target.target_name and target.target_name in tags:
                if valence > 0:
                    target.positive_affect = _clamp(
                        target.positive_affect + valence * 0.02
                    )
                elif valence < 0:
                    target.negative_affect = _clamp(
                        target.negative_affect + abs(valence) * 0.02
                    )
                target.intensity = _clamp(target.intensity + abs(valence) * 0.01)
                self._update_target_style(target)
                break

    def _on_social_state(self, payload: dict[str, Any]) -> None:
        """Seed attachment targets from published social relationship state.

        Pre-seeded relationships do not emit ``data.social.relationship.delta``,
        so we mirror them here to give the attachment module an initial map of
        the novelist's social world.
        """
        relationships = payload.get("relationships", {})
        for tid, rel in relationships.items():
            if tid in self._state_data.targets or tid == "social_environment":
                continue
            intensity = float(rel.get("intensity", 0.0))
            trust = float(rel.get("trust", 0.0))
            # Map initial relationship valence into a small attachment seed.
            positive = max(0.0, intensity) * 0.3 + max(0.0, trust) * 0.2
            negative = max(0.0, -intensity) * 0.3 + max(0.0, -trust) * 0.2
            target = TargetAttachment(
                target_id=tid,
                target_name=rel.get("target_name", ""),
                style=_evaluate_style(positive, negative, abs(intensity)),
                intensity=_clamp(abs(intensity)),
                positive_affect=_clamp(positive),
                negative_affect=_clamp(negative),
            )
            self._state_data.targets[tid] = target

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _update_target_style(self, target: TargetAttachment) -> None:
        total = target.positive_affect + target.negative_affect
        target.inconsistency = (
            min(target.positive_affect, target.negative_affect) / total
            if total > 0.01
            else 0.0
        )
        new_style = _evaluate_style(
            target.positive_affect,
            target.negative_affect,
            target.intensity,
        )
        target.style = new_style

    def _recompute_overall(self) -> None:
        if not self._state_data.targets:
            return

        # Overall style is the weighted mode of target styles, with a slight
        # bias toward the most intense bond.
        weights: dict[AttachmentStyle, float] = {
            style: 0.0 for style in AttachmentStyle
        }
        total_intensity = 0.0
        for target in self._state_data.targets.values():
            weights[target.style] += target.intensity
            total_intensity += target.intensity

        if total_intensity > 0:
            self._state_data.overall = max(weights, key=lambda k: weights[k])
            self._state_data.overall_intensity = _clamp(
                total_intensity / len(self._state_data.targets)
            )

    def _emit_style_updated(self, target: TargetAttachment) -> None:
        self.emit(
            topic="data.attachment.style.updated",
            payload={
                "target_id": target.target_id,
                "target_name": target.target_name,
                "style": target.style.value,
                "intensity": target.intensity,
                "inconsistency": target.inconsistency,
            },
        )
        self.emit(
            topic="data.attachment.state",
            payload={
                "overall": self._state_data.overall.value,
                "overall_intensity": self._state_data.overall_intensity,
                "target_count": len(self._state_data.targets),
            },
        )

    def _emit_influence_signals(self) -> None:
        """Publish downstream control signals derived from attachment style.

        This implements Design.md §10.1: a new theory module declares its
        influence on DMN/CEN, the social subsystem, and creative output through
        control-bus messages rather than direct module calls.
        """
        if self._state_data.overall_intensity < 0.02:
            return

        style = self._state_data.overall
        intensity = round(self._state_data.overall_intensity, 3)

        tone = self._STYLE_TONE_MAP.get(
            style, self._STYLE_TONE_MAP[AttachmentStyle.SECURE]
        )
        self.emit(
            topic="control.creative.tone",
            payload={
                "source": "attachment",
                "style": style.value,
                "intensity": intensity,
                "tone": tone,
            },
        )

        energy_multiplier = self._SOCIAL_ENERGY_BUDGET.get(style, 1.0)
        self.emit(
            topic="control.social.energy.budget",
            payload={
                "source": "attachment",
                "style": style.value,
                "intensity": intensity,
                "energy_cost_multiplier": energy_multiplier,
                "reason": f"attachment style {style.value} tunes social energy cost",
            },
        )

        network_pref = self._NETWORK_PREFERENCE.get(
            style, self._NETWORK_PREFERENCE[AttachmentStyle.SECURE]
        )
        self.emit(
            topic="control.network.preference",
            payload={
                "source": "attachment",
                "style": style.value,
                "intensity": intensity,
                "dmn_bias": network_pref["dmn_bias"],
                "cen_bias": network_pref["cen_bias"],
            },
        )

    def _sync_state_custom(self) -> None:
        self._state.custom.update(
            {
                "target_count": len(self._state_data.targets),
                "overall": self._state_data.overall.value,
                "overall_intensity": round(self._state_data.overall_intensity, 3),
            }
        )
