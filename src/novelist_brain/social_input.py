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
            "content": "广场上的陌生人向我借火，然后停留得比必要久了一点。",
            "modality": "dialogue",
            "valence": 0.0,
            "arousal": 0.4,
            "salience": 0.55,
            "tags": ["社交", "陌生人", "广场"],
            "norm_violated": False,
        },
        {
            "content": "咖啡馆里，两个朋友用本该私密的音量争论钱的事，我不得不听见。",
            "modality": "dialogue",
            "valence": -0.2,
            "arousal": 0.5,
            "salience": 0.6,
            "tags": ["社交", "咖啡馆", "冲突"],
            "norm_violated": True,
        },
        {
            "content": "一个孩子指着我磨破边的笔记本问：‘叔叔，你为什么总写难过的事？’",
            "modality": "dialogue",
            "valence": 0.1,
            "arousal": 0.5,
            "salience": 0.65,
            "tags": ["社交", "孩子", "笔记本"],
            "norm_violated": False,
        },
        {
            "content": "我扶着门等后面的人，他点头致谢，那一下点头像一份小小的契约。",
            "modality": "event",
            "valence": 0.2,
            "arousal": 0.2,
            "salience": 0.35,
            "tags": ["社交", "礼貌", "手势"],
            "norm_violated": False,
        },
        {
            "content": "有人插队，整个房间假装没有看见。我把这一幕写进便签。",
            "modality": "event",
            "valence": -0.3,
            "arousal": 0.5,
            "salience": 0.55,
            "tags": ["社交", "规则", "越界"],
            "norm_violated": True,
        },
        {
            "content": "一个熟人讲了十分钟，没有问过我一句话。我微笑，心想这也许就是小说材料。",
            "modality": "dialogue",
            "valence": -0.1,
            "arousal": 0.4,
            "salience": 0.5,
            "tags": ["社交", "熟人", "独白"],
            "norm_violated": True,
        },
        {
            "content": "邻桌的笑声起落得像一件乐器，我坐在自己的沉默里，像它的倒影。",
            "modality": "event",
            "valence": 0.3,
            "arousal": 0.4,
            "salience": 0.45,
            "tags": ["社交", "笑声", "咖啡馆"],
            "norm_violated": False,
        },
    ]

    INTRUSION_TABLE: list[dict[str, Any]] = [
        {
            "content": "楼上邻居的脚步声在不该有的时辰穿过天花板，像另一个人的生活漏了进来。",
            "modality": "event",
            "valence": 0.0,
            "arousal": 0.2,
            "salience": 0.25,
            "tags": ["社交", "邻居", "侵入"],
            "norm_violated": False,
        },
        {
            "content": "远处的警笛提醒我，即使我不醒着，城市也醒着。",
            "modality": "event",
            "valence": -0.1,
            "arousal": 0.3,
            "salience": 0.3,
            "tags": ["社交", "城市", "声音"],
            "norm_violated": False,
        },
        {
            "content": "门后有人咳嗽，那是一个我无法见面的存在发出的唯一信号。",
            "modality": "event",
            "valence": 0.0,
            "arousal": 0.1,
            "salience": 0.15,
            "tags": ["社交", "声音", "室内"],
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

    # Phase-specific activity levels for social input.
    _PHASE_ACTIVITY: dict[str, float] = {
        "social": 1.0,
        "simulation": 0.5,
        "incubation": 0.4,
        "morning": 0.2,
        "reflection": 0.2,
        "creation": 0.1,
        "deep_night": 0.05,
    }

    def tick(self, delta: TickDelta) -> None:
        """Generate social fragments according to the phase activity map."""
        phase = delta.phase
        self._state.custom["last_phase"] = phase

        activity = self._PHASE_ACTIVITY.get(phase, 0.1)
        if self._rng.random() > activity:
            return

        if phase == "social":
            fragment = self._generate_social_fragment(delta.absolute_time)
        else:
            fragment = self._generate_intrusion(delta.absolute_time)

        # Reduce energy cost at night so social input does not drain sleep.
        if phase in ("deep_night", "creation"):
            fragment.arousal = max(0.0, fragment.arousal - 0.15)
            fragment.salience = max(0.0, fragment.salience - 0.1)

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
        anchors = self._constraints.get("anchors", {})
        anchor_places = anchors.get("places", []) if isinstance(anchors, dict) else []
        if not interests and not values and not anchor_places:
            return content

        if self._rng.random() < 0.2 and anchor_places:
            place = self._rng.choice(anchor_places)
            return f"{content}（这发生在{place}附近）"
        if self._rng.random() < 0.2 and interests:
            interest = self._rng.choice(interests)
            return f"{content}（我透过{interest}的棱镜看着这一幕）"
        if self._rng.random() < 0.1 and values:
            value = self._rng.choice(values)
            return f"{content}［{value}］"
        return content
