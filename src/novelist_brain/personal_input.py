"""Personal input module for the novelist brain prototype."""

from __future__ import annotations

import random
from typing import Any

from src.novelist_brain.models import BusMessage, Fragment, ModuleState, TickDelta
from src.novelist_brain.module import Module


class PersonalInput(Module):
    """Generates personality-bearing fragments from inner experience.

    The module produces context-appropriate fragments during the daytime
    phases (morning, incubation, social, simulation).  At deep_night personal
    input is kept minimal so that DMN dreaming dominates the night.
    """

    FRAGMENT_TABLE: dict[str, list[dict[str, Any]]] = {
        "deep_night": [
            {
                "content": "半醒之间，我梦见旧台灯的光在天花板上慢慢融化，像一句没写完的句子。",
                "modality": "emotion",
                "valence": 0.0,
                "arousal": 0.3,
                "salience": 0.25,
                "tags": ["梦境", "夜晚", "旧台灯"],
            },
            {
                "content": "远处有末班车的声音穿过睡眠，像有人在我耳边低声念一个地名。",
                "modality": "emotion",
                "valence": -0.1,
                "arousal": 0.2,
                "salience": 0.2,
                "tags": ["梦境", "声音", "末班车"],
            },
            {
                "content": "我在梦里向上坠落，跌进一间没有门的房间，墙上贴满我白天没写下的便签。",
                "modality": "emotion",
                "valence": 0.0,
                "arousal": 0.4,
                "salience": 0.3,
                "tags": ["梦境", "边缘", "便签"],
            },
        ],
        "morning": [
            {
                "content": "闹钟把我放进一个灰蒙蒙的清晨，黑咖啡的苦味比光更早抵达。",
                "modality": "event",
                "valence": -0.1,
                "arousal": 0.4,
                "salience": 0.45,
                "tags": ["早晨", "醒来", "黑咖啡"],
            },
            {
                "content": "水流过我的手，这一天开始得毫无仪式，只有窗台的绿萝比我更早清醒。",
                "modality": "event",
                "valence": 0.1,
                "arousal": 0.3,
                "salience": 0.35,
                "tags": ["早晨", "routine", "绿萝"],
            },
            {
                "content": "咖啡热气上升，窗外城市像一句刚起头的长句，还在找它的主语。",
                "modality": "event",
                "valence": 0.2,
                "arousal": 0.4,
                "salience": 0.4,
                "tags": ["早晨", "咖啡", "城市"],
            },
            {
                "content": "一片吐司，一把勺子，出租屋里的普通圣餐。我坐在窗边，等一天露出值得记录的缝隙。",
                "modality": "event",
                "valence": 0.1,
                "arousal": 0.2,
                "salience": 0.3,
                "tags": ["早晨", "食物", "出租屋"],
            },
        ],
        "creation": [
            {
                "content": "一个句子几乎完整地抵达，我在怀疑碰到它之前先把它写进笔记本。",
                "modality": "concept",
                "valence": 0.4,
                "arousal": 0.6,
                "salience": 0.7,
                "tags": ["创作", "写作", "灵感"],
            },
            {
                "content": "光标在沉默里闪烁，那沉默像在等待，又像在质问我白天到底收集了什么。",
                "modality": "emotion",
                "valence": -0.1,
                "arousal": 0.4,
                "salience": 0.5,
                "tags": ["创作", "写作", "紧张"],
            },
            {
                "content": "一个角色的声音浮上来，出乎意料又异常准确，仿佛一直躲在我身后。",
                "modality": "concept",
                "valence": 0.5,
                "arousal": 0.6,
                "salience": 0.75,
                "tags": ["创作", "角色", "声音"],
            },
        ],
        "reflection": [
            {
                "content": "回头看，这个早晨像某件更大东西的草稿，边缘还留着我犹豫的橡皮屑。",
                "modality": "emotion",
                "valence": 0.2,
                "arousal": 0.3,
                "salience": 0.45,
                "tags": ["反思", "记忆", "草稿"],
            },
            {
                "content": "笔记本里有一行字让我现在感到羞赧，但它也是这页纸上最真实的东西。",
                "modality": "emotion",
                "valence": 0.1,
                "arousal": 0.4,
                "salience": 0.55,
                "tags": ["反思", "笔记本", "真实"],
            },
            {
                "content": "日记本收下一份 confession，它会替我保密，也替我忘记。",
                "modality": "event",
                "valence": 0.0,
                "arousal": 0.3,
                "salience": 0.4,
                "tags": ["反思", "日记", "confession"],
            },
        ],
        "incubation": [
            {
                "content": "我走在潮湿的 pavement 上，没有目的地，只是让城市从我身边流过。",
                "modality": "event",
                "valence": 0.1,
                "arousal": 0.3,
                "salience": 0.35,
                "tags": ["酝酿", "散步", "城市"],
            },
            {
                "content": "一盏路灯在我注视它的时候亮起来，仿佛城市终于承认了我的在场。",
                "modality": "event",
                "valence": 0.2,
                "arousal": 0.2,
                "salience": 0.3,
                "tags": ["酝酿", "光", "傍晚"],
            },
            {
                "content": "我留在书桌上的问题在远处跟着我，不靠近，也不离开。",
                "modality": "emotion",
                "valence": -0.1,
                "arousal": 0.4,
                "salience": 0.5,
                "tags": ["酝酿", "问题", "漫游"],
            },
            {
                "content": "一个陌生人的手势无缘无故地落进我的注意里，像一枚种子。",
                "modality": "event",
                "valence": 0.0,
                "arousal": 0.3,
                "salience": 0.4,
                "tags": ["酝酿", "观察", "陌生人"],
            },
        ],
        "simulation": [
            {
                "content": "我在脑中重放一段对话，给它试了三种不同的结尾，没有一种是确定的。",
                "modality": "event",
                "valence": 0.0,
                "arousal": 0.4,
                "salience": 0.45,
                "tags": ["模拟", "记忆", "可能性"],
            },
            {
                "content": "一个 what-if 分叉成三个未来，像雨天的窗玻璃上同时滑下的三滴水。",
                "modality": "concept",
                "valence": 0.1,
                "arousal": 0.5,
                "salience": 0.5,
                "tags": ["模拟", "未来", "分支"],
            },
            {
                "content": "想象中的房间里，家具还在我上次离开的位置，连灰尘都保持忠诚。",
                "modality": "event",
                "valence": 0.0,
                "arousal": 0.2,
                "salience": 0.3,
                "tags": ["模拟", "空间", "连续性"],
            },
        ],
        "social": [
            {
                "content": "我发觉自己在预先排练如果被问话时该说什么，像一场不会发生的面试。",
                "modality": "emotion",
                "valence": 0.0,
                "arousal": 0.3,
                "salience": 0.35,
                "tags": ["社交", "排练", "自我"],
            },
            {
                "content": "一句没说完的话悬在我和房间之间，谁都不想先把它拉下来。",
                "modality": "emotion",
                "valence": -0.1,
                "arousal": 0.3,
                "salience": 0.4,
                "tags": ["社交", "沉默", "紧张"],
            },
        ],
    }

    FALLBACK: dict[str, Any] = {
        "content": "一个安静的念头经过，几乎没有留下痕迹。",
        "modality": "emotion",
        "valence": 0.0,
        "arousal": 0.2,
        "salience": 0.2,
        "tags": ["个人", "中性"],
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
            "data.multimodal.image.new",
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
        """Capture identity constraints and multimodal image inputs."""
        if message.topic in ("data.identity.constraint", "identity.initialized", "identity.constraints"):
            payload = message.payload or {}
            constraints = payload.get("constraints") or payload
            if isinstance(constraints, dict):
                self._constraints = constraints
        elif message.topic == "data.multimodal.image.new":
            self._on_multimodal_image(message.payload)

    # Daytime phases that produce life fragments.
    _ACTIVE_PHASES: set[str] = {"morning", "incubation", "social", "simulation"}

    def tick(self, delta: TickDelta) -> None:
        """Generate a personal fragment appropriate to the current phase."""
        phase = delta.phase
        self._state.custom["last_phase"] = phase

        if phase == "deep_night":
            # Minimal personal intrusion at night; DMN dreaming handles it.
            if self._rng.random() < 0.15:
                fragment = self._generate_fragment(phase, delta.absolute_time)
                self._state.custom["fragment_count"] += 1
                self._emit_fragment(fragment)
            return

        if phase not in self._ACTIVE_PHASES:
            return

        fragment = self._generate_fragment(phase, delta.absolute_time)
        self._state.custom["fragment_count"] += 1
        self._emit_fragment(fragment)

    def _on_multimodal_image(self, payload: Any) -> None:
        """Convert an external image input into a memory fragment.

        Expected payload keys:
        - ``image_url``: required, URL or base64 data URI of the image.
        - ``description``: optional text caption / alt text.
        - ``valence`` / ``arousal`` / ``salience``: optional emotional tags.
        - ``tags``: optional list of tags.
        - ``timestamp``: optional absolute time in ms.
        """
        if not isinstance(payload, dict):
            return
        image_url = payload.get("image_url")
        if not image_url:
            return

        description = str(payload.get("description", "一幅进入系统的图像。"))
        fragment = Fragment(
            content=description,
            source="multimodal",
            modality="image",
            valence=float(payload.get("valence", 0.0)),
            arousal=float(payload.get("arousal", 0.3)),
            salience=float(payload.get("salience", 0.5)),
            timestamp=float(payload.get("timestamp", 0.0)),
            tags=list(payload.get("tags", ["图像", "多模态"])),
            image_url=str(image_url),
        )
        self._state.custom["fragment_count"] = self._state.custom.get("fragment_count", 0) + 1
        self._emit_fragment(fragment)

    def _emit_fragment(self, fragment: Fragment) -> None:
        """Publish a personal fragment and broadcast mood/state updates."""
        phase = self._state.custom.get("last_phase", "unknown")

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
        anchors = self._constraints.get("anchors", {})
        anchor_places = anchors.get("places", []) if isinstance(anchors, dict) else []
        anchor_objects = anchors.get("objects", []) if isinstance(anchors, dict) else []
        if not interests and not values and not anchor_places and not anchor_objects:
            return content

        # Avoid mutating every fragment; apply identity flavor sparingly.
        if self._rng.random() < 0.25 and anchor_objects:
            obj = self._rng.choice(anchor_objects)
            return f"{content}（{obj}在桌角沉默地陪着我）"
        if self._rng.random() < 0.25 and anchor_places:
            place = self._rng.choice(anchor_places)
            return f"{content}（这让人想起{place}）"
        if self._rng.random() < 0.3 and interests:
            interest = self._rng.choice(interests)
            return f"{content}（旧主题：{interest}）"
        if self._rng.random() < 0.15 and values:
            value = self._rng.choice(values)
            return f"{content}［{value}］"
        return content
