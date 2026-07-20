"""Socialization data models for the novelist brain (Design.md §16).

Social experience is not entertainment for the novelist; it is a form of
field work.  The models below capture the triple dialectic of social space
(Lefebvre), the role network (Goffman), and the disciplinary gaze (Foucault)
that together shape how social fragments become literary material.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Literal


SpaceType = Literal[
    "public", "private", "liminal", "sacred", "marginal"
]

EncounterType = Literal[
    "chance", "reunion", "conflict", "help_request", "eavesdrop"
]

DialogueMode = Literal["surface", "probe", "confessional"]

RelationshipType = Literal[
    "stranger", "acquaintance", "friend", "intimate", "rival", "antagonist"
]


@dataclass
class Norm:
    """A social norm operating inside a space."""

    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    description: str = ""
    violation_cost: float = 0.0  # energy / emotional exposure when violated
    gaze_intensity: float = 0.0  # how strongly the norm is enforced


@dataclass
class SocialSpace:
    """A social space shaped by practice, power, and subjective experience."""

    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str = ""
    space_type: SpaceType = "public"
    spatial_practice: list[str] = field(default_factory=list)
    representations_of_space: list[str] = field(default_factory=list)
    representational_space: list[str] = field(default_factory=list)
    norms: list[Norm] = field(default_factory=list)
    gaze_intensity: float = 0.0
    encounter_base_rate: float = 0.3

    def total_gaze(self) -> float:
        """Return the combined institutional and normative gaze intensity."""
        norm_gaze = sum(n.gaze_intensity for n in self.norms)
        return _clamp(self.gaze_intensity + norm_gaze * 0.1)


@dataclass
class SocialRole:
    """A role the novelist wears in a given space."""

    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str = ""
    space_ids: list[str] = field(default_factory=list)
    front_stage_persona: str = ""  # impression-management mask
    back_stage_persona: str = ""  # relaxed self
    goals: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    encounter_affinity: float = 0.5
    energy_cost_multiplier: float = 1.0


@dataclass
class SocialNPC:
    """A recurring non-player character in the novelist's social world.

    NPCs give relationships a stable anchor: instead of every encounter
    producing a new random stranger, the novelist can meet the same café
    owner, neighbor, or street musician repeatedly, allowing intensity and
    trust to accumulate or decay over time.
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str = ""
    space_ids: list[str] = field(default_factory=list)
    archetype: str = ""  # e.g. "stranger", "regular", "authority", "outsider"
    initial_intensity: float = 0.0
    initial_trust: float = 0.0
    recurrence_weight: float = 1.0  # how likely the NPC is to reappear

    def can_appear_in(self, space_id: str) -> bool:
        return space_id in self.space_ids


@dataclass
class GazePressure:
    """A vector of social surveillance, whether external or internalized."""

    source: str = ""
    norm: str = ""
    intensity: float = 0.0
    internalized: bool = False

    def effective_pressure(self, social_defense: float = 0.0) -> float:
        """Internalized gaze is harder to escape but can be partially mitigated."""
        multiplier = 1.2 if self.internalized else 1.0
        return _clamp((self.intensity * multiplier) - social_defense)


@dataclass
class SocialCost:
    """The threefold price of a social encounter."""

    energy_drain: float = 0.0
    attention_drain: float = 0.0
    emotional_exposure: float = 0.0

    def total(self) -> float:
        return self.energy_drain + self.attention_drain * 0.5 + self.emotional_exposure


@dataclass
class Relationship:
    """A directed relationship between the novelist and another social entity."""

    target_id: str = ""
    target_name: str = ""
    type: RelationshipType = "stranger"
    intensity: float = 0.0
    trust: float = 0.0
    history: list[str] = field(default_factory=list)

    def can_shift(self, delta: RelationshipDelta) -> bool:
        """Whether the proposed intensity change stays within plausible bounds."""
        next_value = self.intensity + delta.delta
        return -1.0 <= next_value <= 1.0


@dataclass
class RelationshipDelta:
    """A change in relationship intensity and type."""

    target_id: str = ""
    target_name: str = ""
    type: RelationshipType = "stranger"
    delta: float = 0.0


@dataclass
class SocialEncounter:
    """A concrete social encounter that produces experience fragments."""

    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    space_id: str = ""
    encounter_type: EncounterType = "chance"
    participants: list[str] = field(default_factory=list)
    dialogue_mode: DialogueMode = "surface"
    content: str = ""
    valence: float = 0.0
    arousal: float = 0.0
    salience: float = 0.0
    gaze_pressure: float = 0.0
    cost: SocialCost = field(default_factory=SocialCost)
    relationship_delta: RelationshipDelta | None = None
    timestamp: float = 0.0
    tags: list[str] = field(default_factory=list)


@dataclass
class SocialState:
    """Runtime social state maintained by the socialization module."""

    current_space_id: str | None = None
    current_role_id: str | None = None
    relationships: dict[str, Relationship] = field(default_factory=dict)
    gaze_pressures: list[GazePressure] = field(default_factory=list)
    recent_encounters: list[SocialEncounter] = field(default_factory=list)
    social_energy: float = 100.0
    accumulated_gaze_load: float = 0.0

    def current_space_gaze(self, spaces: dict[str, SocialSpace]) -> float:
        if self.current_space_id is None:
            return 0.0
        space = spaces.get(self.current_space_id)
        if space is None:
            return 0.0
        return space.total_gaze()

    def apply_cost(self, cost: SocialCost) -> None:
        self.social_energy -= cost.energy_drain
        self.accumulated_gaze_load += cost.emotional_exposure
        self.accumulated_gaze_load = _clamp(self.accumulated_gaze_load)


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


DEFAULT_SPACES: list[SocialSpace] = [
    SocialSpace(
        id="town_square",
        name="广场",
        space_type="public",
        spatial_practice=["行走", "停驻", "借火", "围观"],
        representations_of_space=["市政空间", "市民聚集地"],
        representational_space=["流动的面孔", "偶然的相遇"],
        norms=[
            Norm(description="保持礼貌距离", violation_cost=0.2, gaze_intensity=0.3),
            Norm(description="不大声喧哗", violation_cost=0.1, gaze_intensity=0.2),
        ],
        gaze_intensity=0.4,
        encounter_base_rate=0.35,
    ),
    SocialSpace(
        id="cafe",
        name="咖啡馆",
        space_type="public",
        spatial_practice=["独坐", "观察邻桌", "低声交谈"],
        representations_of_space=["消费场所", "社交舞台"],
        representational_space=["半公开的孤独", "他人的生活片段"],
        norms=[
            Norm(description="不偷听他人谈话", violation_cost=0.1, gaze_intensity=0.2),
            Norm(description="保持安静", violation_cost=0.15, gaze_intensity=0.3),
        ],
        gaze_intensity=0.35,
        encounter_base_rate=0.25,
    ),
    SocialSpace(
        id="home",
        name="出租屋",
        space_type="private",
        spatial_practice=["写作", "发呆", "恢复"],
        representations_of_space=["私人领地"],
        representational_space=["安全但略带窒息的壳"],
        norms=[
            Norm(description="可以拒绝一切社交", violation_cost=0.0, gaze_intensity=0.0),
        ],
        gaze_intensity=0.05,
        encounter_base_rate=0.02,
    ),
    SocialSpace(
        id="station",
        name="车站",
        space_type="liminal",
        spatial_practice=["等待", "擦肩", "短暂注视"],
        representations_of_space=["交通枢纽"],
        representational_space=["尚未到达任何地方的人"],
        norms=[
            Norm(description="不打扰赶路人", violation_cost=0.1, gaze_intensity=0.2),
        ],
        gaze_intensity=0.25,
        encounter_base_rate=0.4,
    ),
    SocialSpace(
        id="night_market",
        name="夜市",
        space_type="marginal",
        spatial_practice=["穿行", "注视", "短暂买卖"],
        representations_of_space=["市井边缘"],
        representational_space=["失控的灯光与欲望"],
        norms=[
            Norm(description="讨价还价", violation_cost=0.05, gaze_intensity=0.1),
            Norm(description="保持距离", violation_cost=0.15, gaze_intensity=0.2),
        ],
        gaze_intensity=0.3,
        encounter_base_rate=0.3,
    ),
]


DEFAULT_ROLES: list[SocialRole] = [
    SocialRole(
        id="observer",
        name="观察者",
        space_ids=["town_square", "cafe", "station"],
        front_stage_persona="安静、礼貌、不易被记住",
        back_stage_persona="敏锐、疏离、在脑中记录一切",
        goals=["收集碎片", "保持距离"],
        risks=["被误认为冷漠", "过度内化孤独"],
        encounter_affinity=0.4,
        energy_cost_multiplier=0.9,
    ),
    SocialRole(
        id="regular",
        name="常客",
        space_ids=["cafe", "town_square"],
        front_stage_persona="熟悉环境，与人点头之交",
        back_stage_persona="享受被认出的安全感，但不想深入",
        goals=["建立低维护关系", "获得稳定锚点"],
        risks=["关系升级的压力", "失去匿名性"],
        encounter_affinity=0.6,
        energy_cost_multiplier=1.0,
    ),
    SocialRole(
        id="interviewer",
        name="访谈者",
        space_ids=["town_square", "night_market", "station"],
        front_stage_persona="好奇、有礼貌、会问问题",
        back_stage_persona="把对方当作素材，带有轻微愧疚",
        goals=["获取深度碎片", "制造戏剧素材"],
        risks=["侵犯隐私", "情感反噬"],
        encounter_affinity=0.7,
        energy_cost_multiplier=1.3,
    ),
    SocialRole(
        id="outsider",
        name="局外人",
        space_ids=["station", "night_market"],
        front_stage_persona="不知所措，努力不显得突兀",
        back_stage_persona="敏感、防御、观察自己的不适",
        goals=["安全退出", "记录异质感"],
        risks=["过度自我关注", "错失连接"],
        encounter_affinity=0.25,
        energy_cost_multiplier=1.1,
    ),
    SocialRole(
        id="recluse",
        name="隐者",
        space_ids=["home"],
        front_stage_persona="无需表演",
        back_stage_persona="真实的疲惫与创作渴望",
        goals=["恢复能量", "反刍社交经验"],
        risks=["长期回避导致枯竭"],
        encounter_affinity=0.0,
        energy_cost_multiplier=0.0,
    ),
]


DEFAULT_SOCIAL_TABLE: list[dict[str, Any]] = [
    {
        "content": "广场上的陌生人向我借火，然后停留得比必要久了一点。",
        "modality": "dialogue",
        "valence": 0.0,
        "arousal": 0.4,
        "salience": 0.55,
        "tags": ["社交", "陌生人", "广场"],
        "encounter_type": "chance",
        "dialogue_mode": "surface",
        "norm_violated": False,
    },
    {
        "content": "咖啡馆里，两个朋友用本该私密的音量争论钱的事，我不得不听见。",
        "modality": "dialogue",
        "valence": -0.2,
        "arousal": 0.5,
        "salience": 0.6,
        "tags": ["社交", "咖啡馆", "冲突"],
        "encounter_type": "eavesdrop",
        "dialogue_mode": "surface",
        "norm_violated": True,
    },
    {
        "content": "一个孩子指着我磨破边的笔记本问：‘叔叔，你为什么总写难过的事？’",
        "modality": "dialogue",
        "valence": 0.1,
        "arousal": 0.5,
        "salience": 0.65,
        "tags": ["社交", "孩子", "笔记本"],
        "encounter_type": "chance",
        "dialogue_mode": "probe",
        "norm_violated": False,
    },
    {
        "content": "我扶着门等后面的人，他点头致谢，那一下点头像一份小小的契约。",
        "modality": "event",
        "valence": 0.2,
        "arousal": 0.2,
        "salience": 0.35,
        "tags": ["社交", "礼貌", "手势"],
        "encounter_type": "chance",
        "dialogue_mode": "surface",
        "norm_violated": False,
    },
    {
        "content": "有人插队，整个房间假装没有看见。我把这一幕写进便签。",
        "modality": "event",
        "valence": -0.3,
        "arousal": 0.5,
        "salience": 0.55,
        "tags": ["社交", "规则", "越界"],
        "encounter_type": "conflict",
        "dialogue_mode": "surface",
        "norm_violated": True,
    },
    {
        "content": "一个熟人讲了十分钟，没有问过我一句话。我微笑，心想这也许就是小说材料。",
        "modality": "dialogue",
        "valence": -0.1,
        "arousal": 0.4,
        "salience": 0.5,
        "tags": ["社交", "熟人", "独白"],
        "encounter_type": "chance",
        "dialogue_mode": "confessional",
        "norm_violated": True,
    },
    {
        "content": "邻桌的笑声起落得像一件乐器，我坐在自己的沉默里，像它的倒影。",
        "modality": "event",
        "valence": 0.3,
        "arousal": 0.4,
        "salience": 0.45,
        "tags": ["社交", "笑声", "咖啡馆"],
        "encounter_type": "eavesdrop",
        "dialogue_mode": "surface",
        "norm_violated": False,
    },
]


DEFAULT_NPCS: list[SocialNPC] = [
    SocialNPC(
        id="npc_old_paper_vendor",
        name="卖报老人",
        space_ids=["town_square", "station"],
        archetype="stranger",
        initial_intensity=0.05,
        initial_trust=0.1,
        recurrence_weight=0.8,
    ),
    SocialNPC(
        id="npc_guitar_busker",
        name="广场吉他手",
        space_ids=["town_square"],
        archetype="outsider",
        initial_intensity=0.1,
        initial_trust=0.05,
        recurrence_weight=0.6,
    ),
    SocialNPC(
        id="npc_cafe_owner",
        name="咖啡馆老板",
        space_ids=["cafe"],
        archetype="regular",
        initial_intensity=0.15,
        initial_trust=0.2,
        recurrence_weight=1.2,
    ),
    SocialNPC(
        id="npc_cafe_regular",
        name="咖啡馆常客",
        space_ids=["cafe"],
        archetype="regular",
        initial_intensity=0.1,
        initial_trust=0.15,
        recurrence_weight=1.0,
    ),
    SocialNPC(
        id="npc_upstairs_neighbor",
        name="楼上邻居",
        space_ids=["home"],
        archetype="stranger",
        initial_intensity=-0.05,
        initial_trust=0.0,
        recurrence_weight=0.4,
    ),
    SocialNPC(
        id="npc_landlord",
        name="房东",
        space_ids=["home"],
        archetype="authority",
        initial_intensity=-0.1,
        initial_trust=-0.05,
        recurrence_weight=0.3,
    ),
    SocialNPC(
        id="npc_security_guard",
        name="车站安检员",
        space_ids=["station"],
        archetype="authority",
        initial_intensity=0.0,
        initial_trust=0.05,
        recurrence_weight=0.7,
    ),
    SocialNPC(
        id="npc_wanderer",
        name="流浪者",
        space_ids=["station", "night_market"],
        archetype="outsider",
        initial_intensity=0.05,
        initial_trust=0.0,
        recurrence_weight=0.5,
    ),
    SocialNPC(
        id="npc_night_vendor",
        name="夜市摊主",
        space_ids=["night_market"],
        archetype="regular",
        initial_intensity=0.1,
        initial_trust=0.1,
        recurrence_weight=0.9,
    ),
    SocialNPC(
        id="npc_night_youth",
        name="夜游的年轻人",
        space_ids=["night_market", "town_square"],
        archetype="stranger",
        initial_intensity=0.05,
        initial_trust=0.05,
        recurrence_weight=0.6,
    ),
]


DEFAULT_INTRUSION_TABLE: list[dict[str, Any]] = [
    {
        "content": "楼上邻居的脚步声在不该有的时辰穿过天花板，像另一个人的生活漏了进来。",
        "modality": "event",
        "valence": 0.0,
        "arousal": 0.2,
        "salience": 0.25,
        "tags": ["社交", "邻居", "侵入"],
        "encounter_type": "eavesdrop",
        "dialogue_mode": "surface",
        "norm_violated": False,
    },
    {
        "content": "远处的警笛提醒我，即使我不醒着，城市也醒着。",
        "modality": "event",
        "valence": -0.1,
        "arousal": 0.3,
        "salience": 0.3,
        "tags": ["社交", "城市", "声音"],
        "encounter_type": "eavesdrop",
        "dialogue_mode": "surface",
        "norm_violated": False,
    },
    {
        "content": "门后有人咳嗽，那是一个我无法见面的存在发出的唯一信号。",
        "modality": "event",
        "valence": 0.0,
        "arousal": 0.1,
        "salience": 0.15,
        "tags": ["社交", "声音", "室内"],
        "encounter_type": "eavesdrop",
        "dialogue_mode": "surface",
        "norm_violated": False,
    },
]
