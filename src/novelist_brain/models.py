"""Core data models for the novelist brain prototype."""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Optional


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


# =============================================================================
# === Story Bible Truth Source ===
# =============================================================================


@dataclass
class PlotCompass:
    """High-level narrative compass: ending intent, active long arcs, scale."""

    ending_intent: str = ""
    active_long_arcs: list[str] = field(default_factory=list)
    scale: Literal["short", "medium", "long"] = "medium"
    current_arc_position: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> PlotCompass:
        return cls(**data)


@dataclass
class StyleFingerprint:
    """Voice/style signature used by the continuity auditor for style checks."""

    vocabulary_density: float = 0.0
    sentence_length_variance: float = 0.0
    dialogue_ratio: float = 0.0
    tone_markers: dict[str, float] = field(default_factory=dict)
    forbidden_phrases: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> StyleFingerprint:
        return cls(**data)


@dataclass
class ForeshadowingEntry:
    """A single foreshadowing ledger entry tracked by the Story Bible."""

    entry_id: str
    description: str = ""
    introduced_in_chapter: str = ""
    status: Literal["introduced", "reinforced", "paid_off", "abandoned"] = "introduced"
    suggested_payoff: str = ""
    payoff_chapter: Optional[str] = None
    emotional_purpose: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> ForeshadowingEntry:
        return cls(**data)


@dataclass
class ForeshadowingOp:
    """An operation on the foreshadowing ledger emitted by the Planner."""

    op_type: Literal["introduce", "reinforce", "pay_off", "abandon"] = "introduce"
    entry_id: str = ""
    note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> ForeshadowingOp:
        return cls(**data)


# =============================================================================
# === World State ===
# =============================================================================


@dataclass
class WorldRule:
    """A rule governing the world (physical / social / mystical / narrative)."""

    rule_id: str
    domain: Literal["physical", "social", "mystical", "narrative"] = "physical"
    statement: str = ""
    breakable: bool = False
    consequences: list[str] = field(default_factory=list)
    introduced_in: str = ""
    status: Literal["active", "broken", "evolved"] = "active"

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> WorldRule:
        return cls(**data)


@dataclass
class Mystery:
    """An unresolved mystery in the world."""

    mystery_id: str
    name: str = ""
    description: str = ""
    revealed: bool = False
    revealed_in_chapter: Optional[str] = None
    payoff_rules: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> Mystery:
        return cls(**data)


@dataclass
class HistoricalEvent:
    """A historical event recorded in the world timeline."""

    event_id: str
    name: str = ""
    description: str = ""
    occurred_at: str = ""
    involved_factions: list[str] = field(default_factory=list)
    consequences: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> HistoricalEvent:
        return cls(**data)


@dataclass
class Faction:
    """A faction / organization inside the world."""

    faction_id: str
    name: str = ""
    description: str = ""
    power: float = 0.0
    influence: float = 0.0
    relations: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> Faction:
        return cls(**data)


@dataclass
class Forbidden:
    """A taboo / forbidden action and its consequences."""

    forbidden_id: str
    name: str = ""
    description: str = ""
    consequences: list[str] = field(default_factory=list)
    introduced_in: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> Forbidden:
        return cls(**data)


@dataclass
class WorldStateContract:
    """Structured world state contract that replaces the hard-coded default world.

    Acts as the single source of truth for the world and provides
    ``to_ontology()`` to remain compatible with the existing ``WorldModel``
    construction pattern in ``sandbox.py``.
    """

    novel_id: str
    genre: str = ""
    tone: str = ""
    geography: dict[str, Any] = field(default_factory=dict)
    factions: dict[str, Any] = field(default_factory=dict)
    rules: list[WorldRule] = field(default_factory=list)
    history: list[HistoricalEvent] = field(default_factory=list)
    forbidden: list[Forbidden] = field(default_factory=list)
    mysteries: list[Mystery] = field(default_factory=list)
    current_state: dict[str, Any] = field(default_factory=dict)
    version: int = 0

    def to_ontology(self) -> dict[str, Any]:
        """Return a dict compatible with existing ``WorldModel.ontology`` format.

        The legacy ``WorldModel(name="default", ontology={...})`` call in
        ``sandbox.py`` expected an ontology dict containing ``genre`` and
        ``tone`` keys. This method returns a richer ontology that preserves
        backwards compatibility while exposing the full world structure.
        """
        def _to_dict(item: Any) -> Any:
            if hasattr(item, "to_dict"):
                return item.to_dict()
            return item

        return {
            "genre": self.genre,
            "tone": self.tone,
            "geography": dict(self.geography),
            "factions": dict(self.factions),
            "rules": [_to_dict(r) for r in self.rules],
            "history": [_to_dict(h) for h in self.history],
            "forbidden": [_to_dict(f) for f in self.forbidden],
            "mysteries": [_to_dict(m) for m in self.mysteries],
            "current_state": dict(self.current_state),
            "version": self.version,
        }

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> WorldStateContract:
        rules = [
            WorldRule.from_dict(r) if isinstance(r, dict) else r
            for r in data.get("rules", [])
        ]
        history = [
            HistoricalEvent.from_dict(h) if isinstance(h, dict) else h
            for h in data.get("history", [])
        ]
        forbidden = [
            Forbidden.from_dict(f) if isinstance(f, dict) else f
            for f in data.get("forbidden", [])
        ]
        mysteries = [
            Mystery.from_dict(m) if isinstance(m, dict) else m
            for m in data.get("mysteries", [])
        ]
        return cls(
            novel_id=data.get("novel_id", ""),
            genre=data.get("genre", ""),
            tone=data.get("tone", ""),
            geography=dict(data.get("geography", {})),
            factions=dict(data.get("factions", {})),
            rules=rules,
            history=history,
            forbidden=forbidden,
            mysteries=mysteries,
            current_state=dict(data.get("current_state", {})),
            version=data.get("version", 0),
        )


# =============================================================================
# === OC Characters ===
# =============================================================================


@dataclass
class LuckPool:
    """COC-style luck pool for an OC character."""

    current: int = 0
    max: int = 99
    spent_today: int = 0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> LuckPool:
        return cls(**data)


@dataclass
class OCCharacterSheet:
    """Original-Character (OC) sheet replacing the projection-based CharacterProjection.

    All fields use COC-compatible structures. ``projection_ratio`` is fixed at
    ``0.0`` to signal that the character is fully original (no real-person
    projection blend). Reuses existing ``TraitVector`` / ``Desire`` / ``Fear``
    / ``SanitySystem`` / ``Condition`` / ``Relationship`` dataclasses for
    compatibility with the rest of the codebase.
    """

    character_id: str
    name: str = ""
    archetype: str = ""
    role_in_story: Literal["protagonist", "antagonist", "supporting", "walk-on"] = "supporting"
    source_traces: list[str] = field(default_factory=list)

    # Personality
    traits: TraitVector = field(default_factory=TraitVector)
    values: list[str] = field(default_factory=list)
    desires: list[Desire] = field(default_factory=list)
    fears: list[Fear] = field(default_factory=list)
    internal_conflict: str = ""

    # COC rule card
    coc_attributes: dict[str, int] = field(default_factory=dict)
    coc_skills: dict[str, float] = field(default_factory=dict)
    sanity: SanitySystem = field(default_factory=SanitySystem)
    luck: LuckPool = field(default_factory=LuckPool)
    hit_points: float = 0.0
    magic_points: float = 0.0
    inventory: dict[str, Any] = field(default_factory=dict)
    conditions: list[Condition] = field(default_factory=list)
    improvement_marks: dict[str, int] = field(default_factory=dict)

    # Narrative state
    relationships: dict[str, Relationship] = field(default_factory=dict)
    current_goal: str = ""
    current_emotional_state: dict[str, float] = field(default_factory=dict)
    narrative_arc: list[str] = field(default_factory=list)
    immutable_facts: list[str] = field(default_factory=list)

    projection_ratio: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> OCCharacterSheet:
        traits_data = data.get("traits")
        traits = (
            TraitVector(**traits_data) if isinstance(traits_data, dict) else traits_data
        )
        sanity_data = data.get("sanity")
        sanity = (
            SanitySystem(**sanity_data) if isinstance(sanity_data, dict) else sanity_data
        )
        luck_data = data.get("luck")
        luck = LuckPool(**luck_data) if isinstance(luck_data, dict) else luck_data
        desires = [
            Desire(**d) if isinstance(d, dict) else d for d in data.get("desires", [])
        ]
        fears = [
            Fear(**f) if isinstance(f, dict) else f for f in data.get("fears", [])
        ]
        conditions = [
            Condition(**c) if isinstance(c, dict) else c
            for c in data.get("conditions", [])
        ]
        relationships = {
            k: (Relationship(**v) if isinstance(v, dict) else v)
            for k, v in data.get("relationships", {}).items()
        }
        return cls(
            character_id=data.get("character_id", ""),
            name=data.get("name", ""),
            archetype=data.get("archetype", ""),
            role_in_story=data.get("role_in_story", "supporting"),
            source_traces=list(data.get("source_traces", [])),
            traits=traits,
            values=list(data.get("values", [])),
            desires=desires,
            fears=fears,
            internal_conflict=data.get("internal_conflict", ""),
            coc_attributes=dict(data.get("coc_attributes", {})),
            coc_skills=dict(data.get("coc_skills", {})),
            sanity=sanity,
            luck=luck,
            hit_points=data.get("hit_points", 0.0),
            magic_points=data.get("magic_points", 0.0),
            inventory=dict(data.get("inventory", {})),
            conditions=conditions,
            improvement_marks=dict(data.get("improvement_marks", {})),
            relationships=relationships,
            current_goal=data.get("current_goal", ""),
            current_emotional_state=dict(data.get("current_emotional_state", {})),
            narrative_arc=list(data.get("narrative_arc", [])),
            immutable_facts=list(data.get("immutable_facts", [])),
            projection_ratio=data.get("projection_ratio", 0.0),
        )


# =============================================================================
# === Chapter Management ===
# =============================================================================


@dataclass
class Paragraph:
    """A single paragraph of novel prose with audit metadata.

    Replaces the previous flat ``str`` paragraph representation used by
    ``NovelOutput``. Carries ``chapter_id`` for ownership attribution and
    ``audit_metadata`` for continuity-audit provenance.
    """

    paragraph_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    content: str = ""
    chapter_id: str = ""
    audit_metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> Paragraph:
        return cls(
            paragraph_id=data.get("paragraph_id", str(uuid.uuid4())[:8]),
            content=data.get("content", ""),
            chapter_id=data.get("chapter_id", ""),
            audit_metadata=dict(data.get("audit_metadata", {})),
        )


@dataclass
class RhythmProfile:
    """Four-strand weaving density profile for a chapter (Quest/Fire/Constellation/Rest)."""

    quest_ratio: float = 0.0
    fire_ratio: float = 0.0
    constellation_ratio: float = 0.0
    rest_ratio: float = 0.0
    hook_strength: float = 0.0
    cool_point_density: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> RhythmProfile:
        return cls(**data)


@dataclass
class ChapterIntent:
    """Planner-emitted intent that drives a single chapter generation."""

    chapter_index: int = 0
    scene_type: Literal["dialogue", "action", "psychological", "environment", "transition"] = "dialogue"
    narrative_beats: list[str] = field(default_factory=list)
    rhythm: RhythmProfile = field(default_factory=RhythmProfile)
    foreshadowing_ops: list[ForeshadowingOp] = field(default_factory=list)
    required_characters: list[str] = field(default_factory=list)
    required_settings: list[str] = field(default_factory=list)
    emotional_arc: tuple[float, float] = (0.0, 0.0)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> ChapterIntent:
        rhythm_data = data.get("rhythm")
        rhythm = (
            RhythmProfile(**rhythm_data)
            if isinstance(rhythm_data, dict)
            else rhythm_data
        )
        ops = [
            ForeshadowingOp(**op) if isinstance(op, dict) else op
            for op in data.get("foreshadowing_ops", [])
        ]
        emotional_arc_raw = data.get("emotional_arc", (0.0, 0.0))
        if isinstance(emotional_arc_raw, (list, tuple)):
            emotional_arc: tuple[float, float] = (
                float(emotional_arc_raw[0]) if len(emotional_arc_raw) > 0 else 0.0,
                float(emotional_arc_raw[1]) if len(emotional_arc_raw) > 1 else 0.0,
            )
        else:
            emotional_arc = (0.0, 0.0)
        return cls(
            chapter_index=data.get("chapter_index", 0),
            scene_type=data.get("scene_type", "dialogue"),
            narrative_beats=list(data.get("narrative_beats", [])),
            rhythm=rhythm,
            foreshadowing_ops=ops,
            required_characters=list(data.get("required_characters", [])),
            required_settings=list(data.get("required_settings", [])),
            emotional_arc=emotional_arc,
        )


@dataclass
class ChapterVersion:
    """A historical version snapshot of a chapter."""

    version_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    created_at: float = 0.0
    paragraphs: list[Paragraph] = field(default_factory=list)
    intent: Optional[ChapterIntent] = None
    change_summary: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> ChapterVersion:
        paragraphs = [
            Paragraph.from_dict(p) if isinstance(p, dict) else p
            for p in data.get("paragraphs", [])
        ]
        intent_data = data.get("intent")
        intent = (
            ChapterIntent.from_dict(intent_data)
            if isinstance(intent_data, dict)
            else intent_data
        )
        return cls(
            version_id=data.get("version_id", str(uuid.uuid4())[:8]),
            created_at=data.get("created_at", 0.0),
            paragraphs=paragraphs,
            intent=intent,
            change_summary=data.get("change_summary", ""),
        )


@dataclass
class Chapter:
    """A chapter managed by ChapterManager (replaces flat paragraph list)."""

    chapter_id: str
    volume_id: str = ""
    index: int = 0
    title: str = ""
    intent: Optional[ChapterIntent] = None
    paragraphs: list[Paragraph] = field(default_factory=list)
    status: Literal["draft", "audited", "revised", "committed"] = "draft"
    versions: list[ChapterVersion] = field(default_factory=list)
    created_at: float = 0.0
    committed_at: Optional[float] = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> Chapter:
        intent_data = data.get("intent")
        intent = (
            ChapterIntent.from_dict(intent_data)
            if isinstance(intent_data, dict)
            else intent_data
        )
        paragraphs = [
            Paragraph.from_dict(p) if isinstance(p, dict) else p
            for p in data.get("paragraphs", [])
        ]
        versions = [
            ChapterVersion.from_dict(v) if isinstance(v, dict) else v
            for v in data.get("versions", [])
        ]
        return cls(
            chapter_id=data.get("chapter_id", ""),
            volume_id=data.get("volume_id", ""),
            index=data.get("index", 0),
            title=data.get("title", ""),
            intent=intent,
            paragraphs=paragraphs,
            status=data.get("status", "draft"),
            versions=versions,
            created_at=data.get("created_at", 0.0),
            committed_at=data.get("committed_at"),
        )


# =============================================================================
# === Audit & Quality ===
# =============================================================================


@dataclass
class ContinuityIssue:
    """A single continuity issue emitted by ContinuityAuditor."""

    category: Literal["ooc", "setting_conflict", "timeline", "foreshadowing", "tone", "style"] = "ooc"
    severity: Literal["info", "warning", "critical"] = "info"
    evidence: str = ""
    suggested_fix: str = ""
    paragraph_id: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> ContinuityIssue:
        return cls(**data)


@dataclass
class QualityReport:
    """A quality report produced by QualityEngine for a chapter."""

    report_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    chapter_id: str = ""
    score: float = 0.0
    issues: list[ContinuityIssue] = field(default_factory=list)
    auto_revised: bool = False
    human_required: bool = False
    generated_at: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> QualityReport:
        issues = [
            ContinuityIssue.from_dict(i) if isinstance(i, dict) else i
            for i in data.get("issues", [])
        ]
        return cls(
            report_id=data.get("report_id", str(uuid.uuid4())[:8]),
            chapter_id=data.get("chapter_id", ""),
            score=data.get("score", 0.0),
            issues=issues,
            auto_revised=data.get("auto_revised", False),
            human_required=data.get("human_required", False),
            generated_at=data.get("generated_at", 0.0),
        )


# =============================================================================
# === Story Bible (root truth source) ===
# =============================================================================


@dataclass
class StoryBible:
    """The single source of truth for a novel.

    Owns the world contract, OC registry, plot compass, foreshadowing ledger,
    chapter blueprint, style fingerprint and continuity rules. All other
    modules read from / write back to this structure.
    """

    novel_id: str
    title: str = ""
    genre: str = ""
    theme: str = ""
    premise: str = ""
    world_contract: Optional[WorldStateContract] = None
    character_registry: dict[str, OCCharacterSheet] = field(default_factory=dict)
    plot_compass: PlotCompass = field(default_factory=PlotCompass)
    foreshadowing_ledger: list[ForeshadowingEntry] = field(default_factory=list)
    chapter_blueprint: list[ChapterIntent] = field(default_factory=list)
    style_fingerprint: StyleFingerprint = field(default_factory=StyleFingerprint)
    continuity_rules: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> StoryBible:
        wc_data = data.get("world_contract")
        world_contract = (
            WorldStateContract.from_dict(wc_data)
            if isinstance(wc_data, dict)
            else wc_data
        )
        character_registry = {
            k: (OCCharacterSheet.from_dict(v) if isinstance(v, dict) else v)
            for k, v in data.get("character_registry", {}).items()
        }
        plot_compass_data = data.get("plot_compass")
        plot_compass = (
            PlotCompass(**plot_compass_data)
            if isinstance(plot_compass_data, dict)
            else plot_compass_data
        )
        foreshadowing_ledger = [
            ForeshadowingEntry.from_dict(e) if isinstance(e, dict) else e
            for e in data.get("foreshadowing_ledger", [])
        ]
        chapter_blueprint = [
            ChapterIntent.from_dict(c) if isinstance(c, dict) else c
            for c in data.get("chapter_blueprint", [])
        ]
        style_fingerprint_data = data.get("style_fingerprint")
        style_fingerprint = (
            StyleFingerprint(**style_fingerprint_data)
            if isinstance(style_fingerprint_data, dict)
            else style_fingerprint_data
        )
        return cls(
            novel_id=data.get("novel_id", ""),
            title=data.get("title", ""),
            genre=data.get("genre", ""),
            theme=data.get("theme", ""),
            premise=data.get("premise", ""),
            world_contract=world_contract,
            character_registry=character_registry,
            plot_compass=plot_compass,
            foreshadowing_ledger=foreshadowing_ledger,
            chapter_blueprint=chapter_blueprint,
            style_fingerprint=style_fingerprint,
            continuity_rules=list(data.get("continuity_rules", [])),
        )
