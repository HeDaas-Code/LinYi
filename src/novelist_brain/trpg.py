"""TRPG mechanics for the mental sandbox (Design.md §17).

The mental sandbox is a solo COC-style game: the novelist's self projects into
a protagonist (investigator), an inner game master (GM) adjudicates rules and
chance, and a narrator voice re-describes outcomes as literary scenes.  This
module provides the character sheet, skill-check resolution, sanity system, and
a minimal GM that can arbitrate a round.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any, Literal

from src.novelist_brain.models import (
    CharacterProjection,
    Condition,
    Conflict,
    Desire,
    Fear,
    NarrativeLine,
    Relationship,
    SanitySystem,
    Scene,
    TraitVector,
)
from src.novelist_brain.trpg_state import (
    ActorState,
    Inventory,
    LuckPool,
    SkillCheck,
    SkillCheckOutcome,
    SkillImprovement,
    emotional_shift_for_outcome,
    resolve_skill_check,
    roll_d100,
)
from src.novelist_brain.trpg_rulebook import ActionDef, Rulebook
from src.novelist_brain import trpg_extended


# Standard COC attributes (0-18 scale, converted to skill base values).
_COC_ATTRIBUTES = ["str", "con", "dex", "int", "pow", "app", "edu", "siz"]


# === Stage 3.5.1: literary narration templates for skill check outcomes ===
# Five SkillCheckOutcome values map to five emotional description templates
# used by ``narrate_skill_check`` and ``GameMaster._narrate``. Each template
# leans on body / environment / inner shifts rather than game terminology,
# so the narration can be fed directly into ``build_scene_prose_prompt`` as
# the seed of a literary paragraph (per docs/系统重构方案_v1.md §3.9 / §9.3).
_OUTCOME_CN_LABELS: dict[SkillCheckOutcome, str] = {
    SkillCheckOutcome.CRITICAL_SUCCESS: "大成功",
    SkillCheckOutcome.HARD_SUCCESS: "困难成功",
    SkillCheckOutcome.SUCCESS: "成功",
    SkillCheckOutcome.FAILURE: "失败",
    SkillCheckOutcome.FUMBLE: "大失败",
}

_OUTCOME_NARRATION_TEMPLATES: dict[SkillCheckOutcome, str] = {
    SkillCheckOutcome.CRITICAL_SUCCESS: (
        "{character}的指尖仿佛被某种预感引导，几乎不假思索就完成了"
        "{challenge}。所有紧绷的弦同时松开，呼吸变得轻盈而清晰，"
        "氛围悄然上扬，连空气都像在为这一刻让路。"
    ),
    SkillCheckOutcome.HARD_SUCCESS: (
        "{character}咬牙顶住{challenge}的阻力，掌心沁出冷汗，"
        "关节因用力发白。目标终于达成，代价是一瞬的眩晕与指尖的微颤，"
        "胜利带着一丝擦伤的余味。"
    ),
    SkillCheckOutcome.SUCCESS: (
        "{character}稳妥地推进{challenge}，节奏没有被打乱。"
        "并不耀眼，但每一步都踩在实处，像一段被反复练习的乐句，"
        "只在末尾留下一处未被解决的小裂缝。"
    ),
    SkillCheckOutcome.FAILURE: (
        "{character}试图{challenge}，计划被推开了一道缝。"
        "迟疑像冷水沿着脊背淌下，氛围骤然下沉，"
        "不是绝望，而是一种迟到的认出。"
    ),
    SkillCheckOutcome.FUMBLE: (
        "{character}的{challenge}彻底崩坏——工具脱手，脚步踉跄，"
        "理智的边缘开始嗡鸣，sanity 检定的警铃在远处响起，"
        "雪崩式的崩坏由具体物件而非情绪形容词承载。"
    ),
}


def narrate_skill_check(
    outcome: SkillCheckOutcome,
    character: str,
    challenge: str,
    dice: int,
    difficulty: float,
    setting: str | None = None,
) -> str:
    """Return a literary, emotion-laden description of a skill check outcome.

    Stage 3.5.1 (Task 3.5.1): The output replaces the old
    ``"在{setting}，{name}试图{action}，掷出了 {roll}/{target} 的{outcome}。"``
    format with a richer prose that carries dice value, difficulty, the
    Chinese outcome label and an emotional beat describing the character's
    body / environment / inner shift.

    The function is module-level (not a ``GameMaster`` method) so that
    ``CreationExecutive`` can call it without instantiating a GM, and the
    output can be embedded in ``current_beat`` / ``audit_metadata`` for
    downstream prose generation.

    Parameters
    ----------
    outcome:
        The resolved :class:`SkillCheckOutcome` enum value.
    character:
        Character name (e.g. ``"林逸"``).
    challenge:
        The plain-language action being attempted (e.g. ``"说服守卫"``).
    dice:
        The d100 roll value.
    difficulty:
        The target / difficulty value the roll was compared against.
    setting:
        Optional scene setting. Defaults to ``"无名之地"`` so the
        ``[场景]`` slot always carries an explicit location cue.

    Returns
    -------
    A single Chinese string in the format
    ``"[{setting}] {character} 面对 {challenge}，掷出 {dice}（难度 {difficulty}），{outcome_cn}。{emotional_description}"``.
    """
    setting_str = setting if setting else "无名之地"
    outcome_cn = _OUTCOME_CN_LABELS.get(outcome, "未知")
    template = _OUTCOME_NARRATION_TEMPLATES.get(
        outcome,
        "{character}的{challenge}留下了未解的余响。",
    )
    try:
        emotional_description = template.format(
            character=character, challenge=challenge
        )
    except (KeyError, IndexError):
        emotional_description = template
    return (
        f"[{setting_str}] {character} 面对 {challenge}，"
        f"掷出 {dice}（难度 {int(difficulty)}），{outcome_cn}。"
        f"{emotional_description}"
    )


# === Stage 3.4: depth thresholds for the COC N-round contract ===
# These constants live in ``trpg.py`` so the COC simulation layer owns the
# quality bar a narrative arc must clear before it is committed. The mental
# sandbox (``sandbox.py``) re-imports them as the single source of truth so
# the thresholds can evolve without drifting between modules.
_DEFAULT_MIN_ROUNDS = 3
_DEFAULT_MAX_ROUNDS = 7
_DEPTH_THRESHOLDS = {
    "conflict_depth": 0.6,
    "character_development": 0.5,
    "emotional_shift": 0.5,
    "coherence_score": 0.6,
    # Stage 3.4.1 extensions — finer-grained readiness signals.
    "hook_strength": 0.4,
    "foreshadowing_progress": 0.3,
    "scene_variety": 0.4,
}


def _compute_extended_metrics(line: NarrativeLine | None) -> dict[str, float]:
    """Compute the three extended depth metrics introduced in Stage 3.4.1.

    These metrics are optional extensions to the core depth metrics used by
    the N-round contract. They give the COC simulation a finer-grained view
    of narrative readiness:

    - ``hook_strength``: how strongly the opening scene grabs the reader,
      derived from the first scene's conflict level and emotional tone.
    - ``foreshadowing_progress``: how much foreshadowing has been planted
      relative to a target density of ~1 per 3 scenes. The metric is gated
      by scene count so a fresh 1-2 scene line cannot saturate it with a
      single foreshadowing.
    - ``scene_variety``: diversity of scene settings used so far, gated by
      a minimum scene count so a 1-2 scene line cannot trivially pass.

    The function tolerates a missing narrative line (returns zeros) so it
    can be called even before the first scene exists. Returned values are
    clamped to ``[0, 1]`` and rounded to three decimals to match the core
    depth metrics shape.

    The conservative gating is intentional: the legacy four metrics already
    drive the N-round contract, and these extensions must not cause a
    narrative arc to be declared ready earlier than before.
    """
    if line is None or not line.scenes:
        return {
            "hook_strength": 0.0,
            "foreshadowing_progress": 0.0,
            "scene_variety": 0.0,
        }

    opening = line.scenes[0]
    hook_strength = min(
        1.0,
        max(
            float(getattr(opening, "conflict_level", 0.0) or 0.0),
            abs(float(getattr(opening, "emotional_tone", 0.0) or 0.0)),
        ),
    )

    scene_count = len(line.scenes)
    foreshadowing_count = len(line.foreshadowing)
    # Target density of ~1 foreshadowing per 3 scenes. Require at least 3
    # scenes before the metric becomes non-zero, so a fresh line does not
    # trivially clear the 0.3 threshold with its first foreshadowing.
    target_foreshadowing = scene_count / 3.0
    if target_foreshadowing < 1.0:
        foreshadowing_progress = 0.0
    else:
        foreshadowing_progress = min(
            1.0, foreshadowing_count / target_foreshadowing
        )

    settings = {
        s.setting for s in line.scenes if getattr(s, "setting", "")
    }
    # Scene variety: ratio of distinct settings to scenes, gated by a
    # minimum scene count so a 1-2 scene line cannot saturate the metric.
    # The gate ramps linearly from 0 at 1 scene to 1 at 4 scenes, matching
    # the typical arc length before variety becomes meaningful.
    variety_ratio = len(settings) / max(1, scene_count)
    scene_count_gate = min(1.0, scene_count / 4.0)
    scene_variety = min(1.0, variety_ratio * scene_count_gate)

    return {
        "hook_strength": round(hook_strength, 3),
        "foreshadowing_progress": round(foreshadowing_progress, 3),
        "scene_variety": round(scene_variety, 3),
    }


@dataclass
class TRPGCharacterSheet:
    """A complete COC-style character sheet for a sandbox projection."""

    character_id: str
    name: str
    projection_ratio: float = 0.5
    archetype: str = ""
    attributes: dict[str, int] = field(default_factory=dict)
    skills: dict[str, float] = field(default_factory=dict)
    sanity: SanitySystem = field(default_factory=SanitySystem)
    desires: list[Desire] = field(default_factory=list)
    fears: list[Fear] = field(default_factory=list)
    relationships: list[Relationship] = field(default_factory=list)
    luck: LuckPool = field(default_factory=LuckPool)
    hit_points: float = 12.0
    magic_points: float = 12.0
    inventory: Inventory = field(default_factory=Inventory)
    conditions: list[Condition] = field(default_factory=list)
    improvement_marks: SkillImprovement = field(default_factory=SkillImprovement)

    def skill_value(self, skill_name: str) -> float:
        """Return the effective skill value, deriving from attributes if absent."""
        if skill_name in self.skills:
            return self.skills[skill_name]
        # Simple fallback derivation from relevant attributes.
        attribute_bonus = 0.0
        mapping: dict[str, list[str]] = {
            "观察": ["pow", "int"],
            "潜行": ["dex", "pow"],
            "说服": ["app", "edu"],
            "图书馆使用": ["int", "edu"],
            "格斗": ["str", "dex"],
            "闪避": ["dex"],
            "心理学": ["pow", "int"],
            "追踪": ["int", "pow"],
        }
        for attr in mapping.get(skill_name, ["pow"]):
            attribute_bonus += self.attributes.get(attr, 10) * 2
        return min(99.0, attribute_bonus)

    def effective_skill_value(self, skill_name: str) -> float:
        """Return skill value plus inventory bonuses and improvement marks."""
        base = self.skill_value(skill_name)
        bonus = self.inventory.skill_bonus(skill_name)
        improvement = self.improvement_marks.improvements.get(skill_name, 0.0)
        return min(99.0, base + bonus + improvement)

    def set_default_attributes(self, rng: random.Random | None = None) -> None:
        """Roll 3d6 for each standard COC attribute and store the results."""
        gen = rng or random.Random()
        for attr in _COC_ATTRIBUTES:
            if attr not in self.attributes:
                self.attributes[attr] = sum(gen.randint(1, 6) for _ in range(3))

    def apply_sanity_shock(
        self, magnitude: float, permanent: bool = False
    ) -> dict[str, Any]:
        """Apply a sanity loss and possibly record a new phobia or mania."""
        loss = max(0.0, min(magnitude, self.sanity.current_sanity))
        self.sanity.current_sanity -= loss
        result: dict[str, Any] = {"sanity_loss": loss, "new_condition": None}
        if loss > 5 and random.random() < 0.3:
            condition = Fear(
                object="未命名的恐惧",
                intensity=round(min(1.0, loss / 10.0), 3),
                permanent=permanent,
            )
            self.sanity.phobias.append(condition)
            result["new_condition"] = condition
        return result


def build_character_sheet(
    projection: CharacterProjection,
    rng: random.Random | None = None,
) -> TRPGCharacterSheet:
    """Convert a CharacterProjection into a full TRPG character sheet."""
    sheet = TRPGCharacterSheet(
        character_id=projection.id,
        name=projection.name,
        projection_ratio=projection.projection_ratio,
        archetype=projection.archetype,
        skills=dict(projection.skills),
        sanity=projection.sanity,
        desires=list(projection.desires),
        fears=list(projection.fears),
        relationships=list(projection.relationships),
        luck=LuckPool(),
        hit_points=12.0,
        magic_points=12.0,
        inventory=Inventory(),
        conditions=list(projection.conditions) if hasattr(projection, "conditions") else [],
        improvement_marks=SkillImprovement(),
    )
    sheet.set_default_attributes(rng)
    # Ensure every character has a small core skill set.
    defaults = {
        "观察": 25.0,
        "潜行": 20.0,
        "说服": 15.0,
        "图书馆使用": 20.0,
        "心理学": 20.0,
    }
    for skill, value in defaults.items():
        sheet.skills.setdefault(skill, value)
    return sheet


@dataclass
class GMResolution:
    """The result of one GM-adjudicated round."""

    action: str
    check: SkillCheck
    narration: str
    emotional_shift: float
    sanity_result: dict[str, Any] | None
    scene_delta: dict[str, Any] = field(default_factory=dict)
    opposed: trpg_extended.OpposedCheck | None = None
    chase: dict[str, Any] | None = None
    combat_round: dict[str, Any] | None = None


class GameMaster:
    """Rulebook-driven COC game master for the mental sandbox.

    The GM consumes a :class:`Rulebook` to map plain-language actions to
    skills, applies bonus/penalty dice and pushed rolls, and can resolve
    opposed checks, chases and combat rounds.
    """

    def __init__(
        self,
        rulebook: Rulebook | None = None,
        world_rules: list[str] | None = None,
        rng: random.Random | None = None,
    ) -> None:
        self._rulebook = rulebook if rulebook is not None else Rulebook()
        self._world_rules = list(world_rules) if world_rules else []
        self._rng = rng or random.Random()

    @property
    def rulebook(self) -> Rulebook:
        return self._rulebook

    def resolve_round(
        self,
        action: str,
        sheet: TRPGCharacterSheet,
        scene: Scene | None = None,
        difficulty: float | None = None,
        modifier: float | None = None,
        bonus_dice: int = 0,
        penalty_dice: int = 0,
        pushed: bool = False,
    ) -> GMResolution:
        """Resolve one round of intent -> check -> consequence -> narration."""
        action_def = self._rulebook.skill_for_action(action)
        skill_name = action_def.skill or self._fallback_skill(action)
        effective_difficulty = difficulty if difficulty is not None else action_def.difficulty
        effective_modifier = modifier if modifier is not None else action_def.default_modifier
        skill_value = sheet.effective_skill_value(skill_name)

        roll, target, outcome, metadata = trpg_extended.resolve_skill_check_with_dice(
            skill_value,
            modifier=effective_modifier,
            difficulty=effective_difficulty,
            bonus_dice=bonus_dice,
            penalty_dice=penalty_dice,
            pushed=pushed,
            rng=self._rng,
        )
        check = SkillCheck(
            character_id=sheet.character_id,
            character_name=sheet.name,
            skill=skill_name,
            skill_value=skill_value,
            difficulty=effective_difficulty,
            modifier=effective_modifier,
            roll=roll,
            target=round(target, 2),
            outcome=outcome,
        )

        # Skill improvement mark on success.
        if outcome in (
            SkillCheckOutcome.SUCCESS,
            SkillCheckOutcome.HARD_SUCCESS,
            SkillCheckOutcome.CRITICAL_SUCCESS,
        ):
            sheet.improvement_marks.mark_success(skill_name)

        # Sanity shock on fumble or critical failure against a feared object.
        sanity_result: dict[str, Any] | None = None
        if outcome == SkillCheckOutcome.FUMBLE:
            sanity_result = sheet.apply_sanity_shock(
                magnitude=5.0 + self._rng.random() * 5.0, permanent=False
            )
        elif outcome == SkillCheckOutcome.FAILURE and sheet.fears:
            fear = self._rng.choice(sheet.fears)
            if fear.intensity > 0.5 and self._rng.random() < 0.25:
                sanity_result = sheet.apply_sanity_shock(
                    magnitude=fear.intensity * 3.0, permanent=False
                )

        emotional_shift = emotional_shift_for_outcome(
            outcome,
            neuroticism=0.5,
            openness=0.5,
        )

        narration = self._narrate(action, check, scene, emotional_shift)

        scene_delta = {
            "tension_delta": abs(emotional_shift),
            "emotional_tone": emotional_shift,
        }
        if metadata:
            scene_delta["check_metadata"] = metadata

        return GMResolution(
            action=action,
            check=check,
            narration=narration,
            emotional_shift=emotional_shift,
            sanity_result=sanity_result,
            scene_delta=scene_delta,
        )

    def resolve_opposed(
        self,
        action: str,
        initiator: TRPGCharacterSheet,
        responder: TRPGCharacterSheet,
    ) -> trpg_extended.OpposedCheck:
        """Resolve an opposed check between two characters."""
        action_def = self._rulebook.skill_for_action(action)
        skill_name = action_def.skill or self._fallback_skill(action)
        return trpg_extended.resolve_opposed_check(
            initiator_skill=initiator.effective_skill_value(skill_name),
            responder_skill=responder.effective_skill_value(skill_name),
            initiator_name=initiator.name,
            responder_name=responder.name,
            initiator_id=initiator.character_id,
            responder_id=responder.character_id,
            skill_name=skill_name,
            rng=self._rng,
        )

    def resolve_chase(
        self,
        quarry: TRPGCharacterSheet,
        hunter: TRPGCharacterSheet,
        obstacle: str = "",
        initial_distance: float = 5.0,
    ) -> trpg_extended.Chase:
        """Create and return a chase scene object."""
        action_def = self._rulebook.skill_for_action("追逐")
        skill_name = action_def.skill or "追踪"
        chase = trpg_extended.Chase(
            quarry_id=quarry.character_id,
            hunter_id=hunter.character_id,
            distance=initial_distance,
            obstacle=obstacle,
        )
        chase.resolve_round(
            quarry_skill_value=quarry.effective_skill_value(skill_name),
            hunter_skill_value=hunter.effective_skill_value(skill_name),
            rulebook=self._rulebook,
            rng=self._rng,
        )
        return chase

    def resolve_combat_round(
        self,
        attackers: list[TRPGCharacterSheet],
        defenders: list[TRPGCharacterSheet],
    ) -> trpg_extended.CombatRound:
        """Resolve one round of narrative combat."""
        combat_rule = self._rulebook.combat
        attack_skill = combat_rule.attack_skill or "格斗"
        dodge_skill = combat_rule.dodge_skill or "闪避"
        attacker_combatants = [
            trpg_extended.Combatant(
                character_id=sheet.character_id,
                name=sheet.name,
                side="attacker",
                attack_skill_value=sheet.effective_skill_value(attack_skill),
                dodge_skill_value=sheet.effective_skill_value(dodge_skill),
                hit_points=sheet.hit_points,
                max_hit_points=sheet.hit_points,
            )
            for sheet in attackers
        ]
        defender_combatants = [
            trpg_extended.Combatant(
                character_id=sheet.character_id,
                name=sheet.name,
                side="defender",
                attack_skill_value=sheet.effective_skill_value(attack_skill),
                dodge_skill_value=sheet.effective_skill_value(dodge_skill),
                hit_points=sheet.hit_points,
                max_hit_points=sheet.hit_points,
            )
            for sheet in defenders
        ]
        return trpg_extended.CombatRound().resolve(
            attackers=attacker_combatants,
            defenders=defender_combatants,
            rule=combat_rule,
            rng=self._rng,
        )

    def _fallback_skill(self, action: str) -> str:
        """Return a skill when the rulebook has no mapping for an action."""
        action_lower = action.lower()
        keywords: dict[str, list[str]] = {
            "观察": ["看", "观察", "注视", "发现", "寻找"],
            "潜行": ["躲", "藏", "走", "离开", "避"],
            "说服": ["说", "问", "劝", "解释", "谈"],
            "图书馆使用": ["查", "资料", "书", "档案"],
            "格斗": ["打", "斗", "对抗", "保护"],
            "闪避": ["躲闪", "回避", "让开"],
            "心理学": ["揣摩", "理解", "洞察"],
            "追踪": ["跟", "追踪", "追寻"],
        }
        for skill, words in keywords.items():
            if any(word in action_lower for word in words):
                return skill
        return self._rng.choice(list(keywords.keys()))

    def _narrate(
        self,
        action: str,
        check: SkillCheck,
        scene: Scene | None,
        emotional_shift: float,
    ) -> str:
        """Produce a literary, dice-aware description of the check outcome.

        Stage 3.5.1: The output now carries the dice roll, difficulty,
        outcome label and an emotional beat describing the character's
        body / environment / inner shift, via :func:`narrate_skill_check`.
        The original method signature is preserved so existing callers
        (and tests) keep working; ``emotional_shift`` is retained as a
        parameter for backward compatibility even though the new template
        encodes its own emotional direction per outcome.
        """
        setting = scene.setting if scene else "无名之地"
        return narrate_skill_check(
            outcome=check.outcome,
            character=check.character_name or "主角",
            challenge=action,
            dice=check.roll,
            difficulty=check.target,
            setting=setting,
        )


def build_narrative_line(
    scenes: list[Scene],
    checks: list[SkillCheck],
    conflicts: list[Conflict] | None = None,
) -> NarrativeLine:
    """Assemble a narrative line from scenes, checks, and conflicts.

    Sorts scenes chronologically, extracts conflicts from dramatic outcomes,
    collects foreshadowing, and marks a climax at the point of highest tension.
    """
    line = NarrativeLine()
    line.scenes = list(scenes)
    line.conflicts = list(conflicts) if conflicts else []

    # Derive additional conflicts from fumbles / critical successes.
    for check in checks:
        if check.outcome in (SkillCheckOutcome.FUMBLE, SkillCheckOutcome.CRITICAL_SUCCESS):
            line.conflicts.append(
                Conflict(
                    parties=[check.character_name or "主角"],
                    stakes=f"{check.skill} 判定出现 {check.outcome.value}",
                    intensity=0.7,
                    resolved=False,
                )
            )

    # Simple foreshadowing: any unresolved conflict seeds a future event.
    for conflict in line.conflicts:
        if not conflict.resolved:
            line.foreshadowing.append(
                f"关于「{conflict.stakes}」的伏笔尚未收回。"
            )

    # Climax: scene with the highest conflict_level, fallback to last scene.
    if line.scenes:
        line.climax = max(
            line.scenes,
            key=lambda s: getattr(s, "conflict_level", 0.0),
        )

    return line


def projection_ratio_for_archetype(archetype: str) -> float:
    """Return a default projection ratio based on narrative archetype."""
    archetype_lower = archetype.lower()
    if "主角" in archetype_lower or "protagonist" in archetype_lower:
        return 0.85
    if "对手" in archetype_lower or "antagonist" in archetype_lower:
        return 0.55
    if "配角" in archetype_lower or "supporting" in archetype_lower:
        return 0.35
    return 0.5
