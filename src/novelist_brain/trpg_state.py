"""Shared TRPG primitives used by both ``trpg.py`` and ``trpg_extended.py``.

This module exists to avoid a circular import: ``trpg_extended.py`` imports
``SkillCheck``/``resolve_skill_check`` from ``trpg.py``, while ``trpg.py`` needs
``LuckPool``/``Inventory``/``ActorState``/``SkillImprovement`` for the character
sheet and game master.  Keeping the shared primitives here breaks the cycle.
"""

from __future__ import annotations

import random
import re
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from src.novelist_brain.models import Condition, Item
from src.novelist_brain.trpg_rulebook import ImprovementRule, SanityRule


def roll_d100(rng: random.Random | None = None) -> int:
    """Roll a percentile die (1-100)."""
    gen = rng or random.Random()
    return gen.randint(1, 100)


class SkillCheckOutcome(str, Enum):
    """Possible outcomes of a d100 COC skill check."""

    CRITICAL_SUCCESS = "critical_success"
    HARD_SUCCESS = "hard_success"
    SUCCESS = "success"
    FAILURE = "failure"
    FUMBLE = "fumble"


@dataclass
class SkillCheck:
    """A single COC-style skill check."""

    character_id: str = ""
    character_name: str = ""
    skill: str = ""
    skill_value: float = 0.0
    difficulty: float = 1.0
    modifier: float = 0.0
    roll: int = 0
    target: float = 0.0
    outcome: SkillCheckOutcome = SkillCheckOutcome.FAILURE
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "character_id": self.character_id,
            "character_name": self.character_name,
            "skill": self.skill,
            "skill_value": self.skill_value,
            "difficulty": self.difficulty,
            "modifier": self.modifier,
            "roll": self.roll,
            "target": self.target,
            "outcome": self.outcome.value,
        }


def resolve_skill_check(
    skill_value: float,
    modifier: float = 0.0,
    difficulty: float = 1.0,
    rng: random.Random | None = None,
) -> tuple[int, float, SkillCheckOutcome]:
    """Resolve a COC-style skill check.

    Parameters
    ----------
    skill_value:
        Base skill value (0-100 scale).
    modifier:
        Flat bonus or penalty applied to the target number.
    difficulty:
        Difficulty multiplier: 1.0 normal, 0.5 hard, 2.0 easy.
    rng:
        Optional random source.

    Returns
    -------
    A tuple of (roll, target, outcome).
    """
    target = max(1.0, min(99.0, skill_value * difficulty + modifier))
    dice = roll_d100(rng)

    if dice <= 5:
        return dice, target, SkillCheckOutcome.CRITICAL_SUCCESS
    if dice <= target / 5:
        return dice, target, SkillCheckOutcome.HARD_SUCCESS
    if dice <= target:
        return dice, target, SkillCheckOutcome.SUCCESS
    if dice >= 96:
        return dice, target, SkillCheckOutcome.FUMBLE
    return dice, target, SkillCheckOutcome.FAILURE


def emotional_shift_for_outcome(
    outcome: SkillCheckOutcome,
    neuroticism: float = 0.5,
    openness: float = 0.5,
) -> float:
    """Return an emotional shift in [-1, 1] from a check outcome."""
    base = {
        SkillCheckOutcome.CRITICAL_SUCCESS: 0.8,
        SkillCheckOutcome.HARD_SUCCESS: 0.5,
        SkillCheckOutcome.SUCCESS: 0.3,
        SkillCheckOutcome.FAILURE: -0.3,
        SkillCheckOutcome.FUMBLE: -0.8,
    }.get(outcome, 0.0)
    base += (neuroticism - 0.5) * 0.2
    base += (openness - 0.5) * 0.1
    return round(max(-1.0, min(1.0, base)), 3)


def _parse_die(die_spec: str, rng: random.Random | None = None) -> int:
    """Roll a die spec like '1d6', '2d10', '1d6+3' or '1d6-1'."""
    gen = rng or random.Random()
    match = re.match(r"(\d+)d(\d+)([+-]\d+)?", die_spec.strip().lower())
    if not match:
        return 0
    count = int(match.group(1))
    sides = int(match.group(2))
    modifier = int(match.group(3) or 0)
    return sum(gen.randint(1, sides) for _ in range(count)) + modifier


@dataclass
class LuckPool:
    """COC-style Luck pool for a character."""

    current: float = 50.0
    max: float = 99.0

    def spend(self, amount: float) -> bool:
        """Spend luck points. Returns True if enough luck remains."""
        if amount > self.current:
            return False
        self.current = max(0.0, self.current - amount)
        return True

    def restore(self, amount: float) -> None:
        """Restore luck up to the maximum."""
        self.current = min(self.max, self.current + amount)

    def to_dict(self) -> dict[str, float]:
        return {"current": self.current, "max": self.max}


@dataclass
class Inventory:
    """A character's inventory of items."""

    items: list[Item] = field(default_factory=list)
    capacity: int = 10

    def add(self, item: Item) -> bool:
        if len(self.items) >= self.capacity:
            return False
        self.items.append(item)
        return True

    def remove(self, item_id: str) -> Item | None:
        for idx, item in enumerate(self.items):
            if item.id == item_id:
                return self.items.pop(idx)
        return None

    def find(self, item_id: str) -> Item | None:
        for item in self.items:
            if item.id == item_id:
                return item
        return None

    def use_item(
        self, item_id: str, rng: random.Random | None = None
    ) -> tuple[Item | None, dict[str, Any]]:
        """Use an item, applying its effects and consuming a use charge.

        Returns the (possibly modified) item and a result dict describing what
        happened.  If the item is not found or has no uses left, the result
        explains the failure.
        """
        gen = rng or random.Random()
        item = self.find(item_id)
        if item is None:
            return None, {"used": False, "reason": "item_not_found"}
        if item.uses is not None and item.uses <= 0:
            return item, {"used": False, "reason": "no_uses_remaining"}

        result: dict[str, Any] = {
            "used": True,
            "effects": [],
            "skill_bonus": dict(item.skill_bonus),
            "sanity_cost": item.sanity_cost,
        }
        for effect in item.effects:
            effect_type = effect.get("type")
            if effect_type == "heal_hp":
                amount = _parse_die(effect.get("formula", "1d6"), gen)
                result["effects"].append({"type": "heal_hp", "amount": amount})
            elif effect_type == "restore_mp":
                amount = _parse_die(effect.get("formula", "1d6"), gen)
                result["effects"].append({"type": "restore_mp", "amount": amount})
            elif effect_type == "restore_luck":
                amount = effect.get("amount", 1.0)
                result["effects"].append({"type": "restore_luck", "amount": amount})
            else:
                result["effects"].append(dict(effect))

        if item.uses is not None:
            item.uses -= 1
        return item, result

    def skill_bonus(self, skill_name: str) -> float:
        return sum(
            item.skill_bonus.get(skill_name, 0.0)
            for item in self.items
            if item.uses is None or item.uses > 0
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "items": [
                {
                    "id": item.id,
                    "name": item.name,
                    "category": item.category,
                    "description": item.description,
                    "skill_bonus": item.skill_bonus,
                    "sanity_cost": item.sanity_cost,
                    "uses": item.uses,
                    "effects": item.effects,
                }
                for item in self.items
            ],
            "capacity": self.capacity,
        }


@dataclass
class ActorState:
    """Runtime status of a TRPG actor (PC or NPC)."""

    hit_points: float = 12.0
    max_hit_points: float = 12.0
    magic_points: float = 12.0
    max_magic_points: float = 12.0
    conditions: list[Condition] = field(default_factory=list)
    major_wound: bool = False
    unconscious: bool = False
    dead: bool = False
    permanently_insane: bool = False

    def add_condition(self, condition: Condition) -> None:
        self.conditions.append(condition)

    def remove_condition(self, name: str) -> None:
        self.conditions = [c for c in self.conditions if c.name != name]

    def apply_damage(self, amount: float) -> dict[str, Any]:
        self.hit_points = max(0.0, self.hit_points - amount)
        result: dict[str, Any] = {"damage": amount, "major_wound": False}
        if self.hit_points <= 0:
            self.unconscious = True
        if self.max_hit_points > 0 and self.hit_points <= self.max_hit_points / 2:
            self.major_wound = True
            result["major_wound"] = True
        return result

    def apply_sanity_shock(self, amount: float) -> dict[str, Any]:
        """Apply sanity loss and update insanity flags."""
        loss = max(0.0, min(amount, self.magic_points))
        self.magic_points = max(0.0, self.magic_points - loss)
        return {"sanity_loss": loss, "remaining_magic_points": self.magic_points}

    def apply_magic_cost(self, amount: float) -> dict[str, Any]:
        """Spend magic points, e.g. for casting or mental exertion."""
        cost = max(0.0, min(amount, self.magic_points))
        self.magic_points = max(0.0, self.magic_points - cost)
        return {"magic_cost": cost, "remaining_magic_points": self.magic_points}

    def check_death_and_insanity(
        self, sanity_rule: SanityRule | None = None
    ) -> dict[str, bool]:
        """Check thresholds and set death / permanent insanity flags."""
        rule = sanity_rule or SanityRule()
        result = {"dead": False, "permanently_insane": False}
        if self.hit_points <= 0 and not self.dead:
            self.dead = True
            result["dead"] = True
        if (
            rule.permanent_insanity_threshold > 0
            and self.magic_points <= rule.permanent_insanity_threshold
            and not self.permanently_insane
        ):
            self.permanently_insane = True
            result["permanently_insane"] = True
        return result

    def to_dict(self) -> dict[str, Any]:
        return {
            "hit_points": self.hit_points,
            "max_hit_points": self.max_hit_points,
            "magic_points": self.magic_points,
            "max_magic_points": self.max_magic_points,
            "conditions": [
                {
                    "name": c.name,
                    "type": c.type,
                    "intensity": c.intensity,
                    "permanent": c.permanent,
                    "source": c.source,
                    "duration_rounds": c.duration_rounds,
                }
                for c in self.conditions
            ],
            "major_wound": self.major_wound,
            "unconscious": self.unconscious,
            "dead": self.dead,
            "permanently_insane": self.permanently_insane,
        }


@dataclass
class SkillImprovement:
    """Records and applies skill improvement marks."""

    marks: dict[str, int] = field(default_factory=dict)
    improvements: dict[str, float] = field(default_factory=dict)

    def mark_success(self, skill_name: str) -> None:
        self.marks[skill_name] = self.marks.get(skill_name, 0) + 1

    def mark_failure(self, skill_name: str) -> None:
        self.marks[skill_name] = self.marks.get(skill_name, 0) + 1

    def resolve_improvement(
        self,
        skill_name: str,
        rule: ImprovementRule | None = None,
        rng: random.Random | None = None,
    ) -> float:
        """Resolve a single skill improvement mark and return the gained value."""
        gen = rng or random.Random()
        rule = rule or ImprovementRule()
        if not rule.enabled or self.marks.get(skill_name, 0) <= 0:
            return 0.0
        self.marks[skill_name] -= 1
        roll = roll_d100(gen)
        # COC-style: if roll >= current skill (i.e. you roll to exceed current), improve.
        current = self.improvements.get(skill_name, 0.0)
        if roll >= current:
            gain = _parse_die(rule.improvement_die, gen)
            self.improvements[skill_name] = current + gain
            return gain
        return 0.0

    def to_dict(self) -> dict[str, Any]:
        return {"marks": dict(self.marks), "improvements": dict(self.improvements)}
