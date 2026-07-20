"""Core data models for the novelist brain prototype."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class Fragment:
    """A piece of experience entering the system."""

    content: str
    source: Literal["personal", "social", "memory", "dream", "novel", "dmn", "cen", "sandbox", "multimodal"] = "personal"
    modality: Literal["event", "emotion", "dialogue", "scene", "concept", "image"] = "event"
    valence: float = 0.0
    arousal: float = 0.0
    salience: float = 0.0
    timestamp: float = 0.0
    tags: list[str] = field(default_factory=list)
    embedding: list[float] = field(default_factory=list)
    image_url: str | None = None
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    def __post_init__(self) -> None:
        if not -1.0 <= self.valence <= 1.0:
            raise ValueError("valence must be between -1.0 and 1.0")
        if not 0.0 <= self.arousal <= 1.0:
            raise ValueError("arousal must be between 0.0 and 1.0")
        if not 0.0 <= self.salience <= 1.0:
            raise ValueError("salience must be between 0.0 and 1.0")


@dataclass
class Trace:
    """A memory trace consolidated from one or more fragments."""

    fragment_ids: list[str] = field(default_factory=list)
    importance: float = 0.0
    recency: float = 0.0
    relevance: float = 0.0
    emotional_weight: float = 0.0
    narrative_role: Literal["setting", "character", "event", "theme", "mood"] = "event"
    content: str = ""
    tags: list[str] = field(default_factory=list)
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])


@dataclass
class SocialTrace(Trace):
    """A trace carrying social provenance for later world mapping."""

    space_id: str = ""
    role_id: str = ""
    relationship_delta: dict[str, Any] = field(default_factory=dict)
    gaze_pressure: float = 0.0
    dialogue_mode: str = "surface"


@dataclass
class TraitVector:
    """Numeric personality traits for a character projection."""

    openness: float = 0.5
    conscientiousness: float = 0.5
    extraversion: float = 0.5
    agreeableness: float = 0.5
    neuroticism: float = 0.5


@dataclass
class Desire:
    """A character desire."""

    object: str
    strength: float = 0.5
    urgency: float = 0.5


@dataclass
class Relationship:
    """A relationship between two characters."""

    target_id: str
    target_name: str
    type: str = "neutral"
    intensity: float = 0.0
    trust: float = 0.0
    history: list[str] = field(default_factory=list)


@dataclass
class Fear:
    """A fear or phobia held by a sandbox character."""

    object: str
    intensity: float = 0.5
    permanent: bool = False


@dataclass
class Condition:
    """A temporary or persistent condition affecting a character."""

    name: str
    type: Literal["physical", "mental", "social", "magical"] = "physical"
    intensity: float = 0.5
    permanent: bool = False
    source: str = ""
    duration_rounds: int | None = None


@dataclass
class Item:
    """An item in a character's inventory."""

    id: str
    name: str
    category: Literal["weapon", "tool", "tome", "consumable", "clue", "general"] = "general"
    description: str = ""
    skill_bonus: dict[str, float] = field(default_factory=dict)
    sanity_cost: float = 0.0
    uses: int | None = None
    effects: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SanitySystem:
    """COC-style sanity system for a sandbox character."""

    current_sanity: float = 50.0
    max_sanity: float = 99.0
    phobias: list[Fear] = field(default_factory=list)
    manias: list[Fear] = field(default_factory=list)
    coping_mechanisms: list[str] = field(default_factory=list)
    cthulhu_mythos: float = 0.0


@dataclass
class CharacterProjection:
    """A character imagined inside the mental sandbox."""

    name: str
    archetype: str = ""
    source_trace_ids: list[str] = field(default_factory=list)
    traits: TraitVector = field(default_factory=TraitVector)
    skills: dict[str, float] = field(default_factory=dict)
    sanity: SanitySystem = field(default_factory=SanitySystem)
    desires: list[Desire] = field(default_factory=list)
    fears: list[Fear] = field(default_factory=list)
    relationships: list[Relationship] = field(default_factory=list)
    internal_conflict: str = ""
    projection_ratio: float = 0.5
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])


@dataclass
class Scene:
    """A scene inside the narrative line."""

    description: str
    characters: list[str] = field(default_factory=list)
    setting: str = ""
    conflict_level: float = 0.0
    emotional_tone: float = 0.0
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])


@dataclass
class Conflict:
    """A narrative conflict."""

    parties: list[str] = field(default_factory=list)
    stakes: str = ""
    intensity: float = 0.0
    resolved: bool = False
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])


@dataclass
class NarrativeLine:
    """A sequence of scenes forming a narrative arc."""

    scenes: list[Scene] = field(default_factory=list)
    conflicts: list[Conflict] = field(default_factory=list)
    foreshadowing: list[str] = field(default_factory=list)
    climax: Scene | None = None
    status: Literal["draft", "committed", "abandoned"] = "draft"
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])


@dataclass
class WorldModel:
    """The internal world model of the mental sandbox."""

    name: str
    ontology: dict[str, Any] = field(default_factory=dict)
    rules: list[str] = field(default_factory=list)
    history: list[str] = field(default_factory=list)
    current_state: dict[str, Any] = field(default_factory=dict)
    prediction_errors: list[dict[str, Any]] = field(default_factory=list)
    campaign_arc: dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])


@dataclass
class GlobalContext:
    """Shared context passed with every tick."""

    tick: int = 0
    absolute_time: float = 0.0
    phase: str = "deep_night"
    active_network: Literal["dmn", "cen", "sn"] | None = None
    budget_warning: bool = False


@dataclass
class TickDelta:
    """A single clock advancement unit."""

    absolute_time: float
    delta_ms: float
    phase: str
    global_context: GlobalContext = field(default_factory=GlobalContext)


@dataclass
class ModuleState:
    """Generic runtime state for a module."""

    active: bool = True
    energy_cost: float = 0.0
    last_tick: float = 0.0
    custom: dict[str, Any] = field(default_factory=dict)


@dataclass
class BusMessage:
    """A message routed over the internal bus system."""

    source: str
    topic: str
    channel: Literal["event", "data", "control"] = "event"
    payload: Any = None
    target: str | None = None
    priority: int = 5
    ttl: int = 3
    timestamp: float = 0.0
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    def decay(self) -> BusMessage:
        """Return a copy with TTL decremented."""
        return BusMessage(
            id=self.id,
            timestamp=self.timestamp,
            source=self.source,
            target=self.target,
            channel=self.channel,
            topic=self.topic,
            payload=self.payload,
            priority=self.priority,
            ttl=self.ttl - 1,
        )

    def is_expired(self) -> bool:
        """Check whether the message TTL has expired."""
        return self.ttl <= 0
