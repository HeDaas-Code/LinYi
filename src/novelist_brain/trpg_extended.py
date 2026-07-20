"""Extended TRPG mechanics for a richer mental sandbox (Design.md §17).

This module provides:
- bonus/penalty dice
- pushed rolls
- Luck pool
- inventory management
- conditions / actor state
- skill improvement
- opposed checks
- chases
- combat rounds

These mechanics are rule-driven: they read configuration from a
``Rulebook`` instance but can also operate with sensible defaults when the
rulebook is minimal.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass, field
from typing import Any

from src.novelist_brain.models import Condition, Item
from src.novelist_brain.trpg_rulebook import CombatRule, ImprovementRule, Rulebook
from src.novelist_brain.trpg_state import (
    ActorState,
    Inventory,
    LuckPool,
    SkillCheck,
    SkillCheckOutcome,
    SkillImprovement,
    resolve_skill_check,
    roll_d100,
)


# ---------------------------------------------------------------------------
# Dice helpers
# ---------------------------------------------------------------------------

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


def _tens_digit(value: int) -> int:
    """Return the tens digit of a d100 roll (1-100)."""
    if value == 100:
        return 0
    return value // 10


def _ones_digit(value: int) -> int:
    """Return the ones digit of a d100 roll (1-100)."""
    if value == 100:
        return 0
    return value % 10


def _recombine(tens: int, ones: int) -> int:
    """Recombine tens and ones digits into a d100 roll value."""
    value = tens * 10 + ones
    if value == 0:
        return 100
    return value


# ---------------------------------------------------------------------------
# Bonus / penalty dice
# ---------------------------------------------------------------------------

def roll_with_bonus_penalty_dice(
    base_roll: int,
    bonus_dice: int = 0,
    penalty_dice: int = 0,
    rng: random.Random | None = None,
) -> int:
    """Apply COC bonus/penalty dice to a base d100 roll.

    Bonus dice roll extra tens digits and keep the lowest (best for the
    investigator). Penalty dice keep the highest (worst for the investigator).
    The ones digit is always kept from the original roll.
    """
    gen = rng or random.Random()
    base_tens = _tens_digit(base_roll)
    ones = _ones_digit(base_roll)

    tens_rolls = [base_tens]
    total_dice = bonus_dice + penalty_dice
    for _ in range(total_dice):
        tens_rolls.append(gen.randint(0, 9))

    if bonus_dice > penalty_dice:
        selected_tens = min(tens_rolls)
    elif penalty_dice > bonus_dice:
        selected_tens = max(tens_rolls)
    else:
        selected_tens = base_tens
    return _recombine(selected_tens, ones)


def resolve_skill_check_with_dice(
    skill_value: float,
    modifier: float = 0.0,
    difficulty: float = 1.0,
    bonus_dice: int = 0,
    penalty_dice: int = 0,
    pushed: bool = False,
    rng: random.Random | None = None,
) -> tuple[int, float, SkillCheckOutcome, dict[str, Any]]:
    """Resolve a skill check with bonus/penalty dice and optional push.

    Returns the final roll, target, outcome and a metadata dict.
    """
    gen = rng or random.Random()
    target = max(1.0, min(99.0, skill_value * difficulty + modifier))
    raw_roll = roll_d100(gen)
    roll = raw_roll
    metadata: dict[str, Any] = {"raw_roll": raw_roll, "pushed": pushed}

    if bonus_dice or penalty_dice:
        roll = roll_with_bonus_penalty_dice(raw_roll, bonus_dice, penalty_dice, gen)
        metadata["bonus_dice"] = bonus_dice
        metadata["penalty_dice"] = penalty_dice
        metadata["final_roll"] = roll

    if roll <= 5:
        outcome = SkillCheckOutcome.CRITICAL_SUCCESS
    elif roll <= target / 5:
        outcome = SkillCheckOutcome.HARD_SUCCESS
    elif roll <= target:
        outcome = SkillCheckOutcome.SUCCESS
    elif roll >= 96:
        outcome = SkillCheckOutcome.FUMBLE
    else:
        outcome = SkillCheckOutcome.FAILURE

    return roll, target, outcome, metadata


# ---------------------------------------------------------------------------
# Pushed rolls
# ---------------------------------------------------------------------------

@dataclass
class PushedRoll:
    """A pushed re-roll after an initial failure.

    The second roll cannot be pushed again.  On a second failure the outcome
    becomes one degree worse (failure -> fumble) and the character suffers a
    complication.
    """

    first_roll: int = 0
    second_roll: int = 0
    final_outcome: SkillCheckOutcome = SkillCheckOutcome.FAILURE
    complication: Condition | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "first_roll": self.first_roll,
            "second_roll": self.second_roll,
            "final_outcome": self.final_outcome.value,
            "complication": {
                "name": self.complication.name,
                "type": self.complication.type,
                "intensity": self.complication.intensity,
            }
            if self.complication
            else None,
        }


def resolve_pushed_roll(
    skill_value: float,
    modifier: float = 0.0,
    difficulty: float = 1.0,
    rng: random.Random | None = None,
) -> PushedRoll:
    """Resolve a pushed roll: first roll, then second roll if first failed."""
    gen = rng or random.Random()
    first_roll, _, first_outcome = resolve_skill_check(
        skill_value, modifier, difficulty, rng=gen
    )

    if first_outcome in (SkillCheckOutcome.SUCCESS, SkillCheckOutcome.HARD_SUCCESS, SkillCheckOutcome.CRITICAL_SUCCESS):
        return PushedRoll(
            first_roll=first_roll,
            second_roll=0,
            final_outcome=first_outcome,
        )

    second_roll, _, second_outcome = resolve_skill_check(
        skill_value, modifier, difficulty, rng=gen
    )
    final_outcome = second_outcome
    complication = None
    if second_outcome in (SkillCheckOutcome.FAILURE, SkillCheckOutcome.FUMBLE):
        final_outcome = SkillCheckOutcome.FUMBLE
        complication = Condition(
            name="压力", type="mental", intensity=0.3, source="pushed_roll"
        )
    return PushedRoll(
        first_roll=first_roll,
        second_roll=second_roll,
        final_outcome=final_outcome,
        complication=complication,
    )


# ---------------------------------------------------------------------------
# Opposed checks
# ---------------------------------------------------------------------------

@dataclass
class OpposedCheck:
    """Result of an opposed skill check between two actors."""

    initiator_check: SkillCheck
    responder_check: SkillCheck
    winner_id: str = ""
    margin: float = 0.0
    narration: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "initiator_check": self.initiator_check.to_dict(),
            "responder_check": self.responder_check.to_dict(),
            "winner_id": self.winner_id,
            "margin": self.margin,
            "narration": self.narration,
        }


def resolve_opposed_check(
    initiator_skill: float,
    responder_skill: float,
    initiator_name: str = "",
    responder_name: str = "",
    initiator_id: str = "",
    responder_id: str = "",
    skill_name: str = "",
    rng: random.Random | None = None,
) -> OpposedCheck:
    """Resolve an opposed check and return the winner."""
    gen = rng or random.Random()
    i_roll, i_target, i_outcome = resolve_skill_check(initiator_skill, rng=gen)
    r_roll, r_target, r_outcome = resolve_skill_check(responder_skill, rng=gen)

    def score(outcome: SkillCheckOutcome, roll: int, target: float) -> float:
        outcome_scores = {
            SkillCheckOutcome.CRITICAL_SUCCESS: 5.0,
            SkillCheckOutcome.HARD_SUCCESS: 4.0,
            SkillCheckOutcome.SUCCESS: 3.0,
            SkillCheckOutcome.FAILURE: 1.0,
            SkillCheckOutcome.FUMBLE: 0.0,
        }
        margin = max(0.0, target - roll)
        return outcome_scores.get(outcome, 1.0) * 100 + margin

    i_score = score(i_outcome, i_roll, i_target)
    r_score = score(r_outcome, r_roll, r_target)

    i_check = SkillCheck(
        character_id=initiator_id,
        character_name=initiator_name,
        skill=skill_name,
        skill_value=initiator_skill,
        roll=i_roll,
        target=round(i_target, 2),
        outcome=i_outcome,
    )
    r_check = SkillCheck(
        character_id=responder_id,
        character_name=responder_name,
        skill=skill_name,
        skill_value=responder_skill,
        roll=r_roll,
        target=round(r_target, 2),
        outcome=r_outcome,
    )

    if i_score > r_score:
        winner_id = initiator_id
        margin = i_score - r_score
        narration = f"{initiator_name}在对抗中压过了{responder_name}。"
    elif r_score > i_score:
        winner_id = responder_id
        margin = r_score - i_score
        narration = f"{responder_name}在对抗中守住了优势。"
    else:
        winner_id = ""
        margin = 0.0
        narration = "双方势均力敌，对抗陷入僵持。"

    return OpposedCheck(
        initiator_check=i_check,
        responder_check=r_check,
        winner_id=winner_id,
        margin=margin,
        narration=narration,
    )


# ---------------------------------------------------------------------------
# Chase
# ---------------------------------------------------------------------------

@dataclass
class Chase:
    """A simple chase scene with distance and obstacles."""

    quarry_id: str = ""
    hunter_id: str = ""
    distance: float = 5.0
    obstacle: str = ""
    round_count: int = 0
    resolved: bool = False
    narration: str = ""

    def resolve_round(
        self,
        quarry_skill_value: float,
        hunter_skill_value: float,
        rulebook: Rulebook | None = None,
        rng: random.Random | None = None,
    ) -> dict[str, Any]:
        """Resolve one chase round and update distance."""
        gen = rng or random.Random()
        q_roll, q_target, q_outcome = resolve_skill_check(quarry_skill_value, rng=gen)
        h_roll, h_target, h_outcome = resolve_skill_check(hunter_skill_value, rng=gen)

        self.round_count += 1
        q_margin = max(0.0, q_target - q_roll)
        h_margin = max(0.0, h_target - h_roll)
        delta = q_margin - h_margin
        self.distance += delta

        if self.distance <= 0:
            self.resolved = True
            self.narration = "猎人追上了猎物。"
        elif self.distance >= 10:
            self.resolved = True
            self.narration = "猎物消失在视野尽头。"
        else:
            self.narration = f"距离变为 {self.distance:.1f}。"

        return {
            "quarry_roll": q_roll,
            "hunter_roll": h_roll,
            "distance": self.distance,
            "resolved": self.resolved,
            "narration": self.narration,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "quarry_id": self.quarry_id,
            "hunter_id": self.hunter_id,
            "distance": self.distance,
            "obstacle": self.obstacle,
            "round_count": self.round_count,
            "resolved": self.resolved,
            "narration": self.narration,
        }


# ---------------------------------------------------------------------------
# Combat
# ---------------------------------------------------------------------------

@dataclass
class Combatant:
    """One participant in a combat round."""

    character_id: str
    name: str
    side: str = "ally"
    attack_skill_value: float = 50.0
    dodge_skill_value: float = 25.0
    hit_points: float = 12.0
    max_hit_points: float = 12.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "character_id": self.character_id,
            "name": self.name,
            "side": self.side,
            "attack_skill_value": self.attack_skill_value,
            "dodge_skill_value": self.dodge_skill_value,
            "hit_points": self.hit_points,
            "max_hit_points": self.max_hit_points,
        }


@dataclass
class CombatRound:
    """Result of one narrative combat round."""

    attacks: list[dict[str, Any]] = field(default_factory=list)
    narration: str = ""
    round_index: int = 0

    def resolve(
        self,
        attackers: list[Combatant],
        defenders: list[Combatant],
        rule: CombatRule | None = None,
        rng: random.Random | None = None,
    ) -> "CombatRound":
        """Resolve one round of combat and return a new ``CombatRound``."""
        gen = rng or random.Random()
        rule = rule or CombatRule()
        attacks: list[dict[str, Any]] = []

        for attacker in attackers:
            if not defenders:
                break
            defender = gen.choice(defenders)
            a_roll, a_target, a_outcome = resolve_skill_check(
                attacker.attack_skill_value, rng=gen
            )
            d_roll, d_target, d_outcome = resolve_skill_check(
                defender.dodge_skill_value, rng=gen
            )

            hit = a_outcome in (
                SkillCheckOutcome.SUCCESS,
                SkillCheckOutcome.HARD_SUCCESS,
                SkillCheckOutcome.CRITICAL_SUCCESS,
            ) and not (
                d_outcome in (SkillCheckOutcome.SUCCESS, SkillCheckOutcome.HARD_SUCCESS, SkillCheckOutcome.CRITICAL_SUCCESS)
                and d_roll <= a_roll
            )

            damage = 0.0
            if hit:
                damage = _parse_die(rule.damage_formula, gen)
                if a_outcome == SkillCheckOutcome.CRITICAL_SUCCESS:
                    damage *= rule.critical_multiplier
                defender.hit_points = max(0.0, defender.hit_points - damage)

            attacks.append(
                {
                    "attacker_id": attacker.character_id,
                    "defender_id": defender.character_id,
                    "attack_roll": a_roll,
                    "attack_outcome": a_outcome.value,
                    "dodge_roll": d_roll,
                    "dodge_outcome": d_outcome.value,
                    "hit": hit,
                    "damage": round(damage, 2),
                    "defender_hp": round(defender.hit_points, 2),
                }
            )

        narration = f"第 {self.round_index + 1} 轮战斗，发生 {len(attacks)} 次交锋。"
        return CombatRound(
            attacks=attacks,
            narration=narration,
            round_index=self.round_index + 1,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "attacks": self.attacks,
            "narration": self.narration,
            "round_index": self.round_index,
        }


class CombatResolver:
    """High-level combat resolver that can run multiple rounds until one side falls."""

    def __init__(self, rule: CombatRule | None = None) -> None:
        self.rule = rule or CombatRule()

    def resolve_multi_round(
        self,
        attackers: list[Combatant],
        defenders: list[Combatant],
        max_rounds: int = 3,
        rng: random.Random | None = None,
    ) -> list[CombatRound]:
        """Resolve up to ``max_rounds`` rounds or until one side is defeated."""
        gen = rng or random.Random()
        rounds: list[CombatRound] = []
        current = CombatRound()
        for _ in range(max_rounds):
            current = current.resolve(attackers, defenders, self.rule, gen)
            rounds.append(current)
            if all(d.hit_points <= 0 for d in defenders) or all(
                a.hit_points <= 0 for a in attackers
            ):
                break
        return rounds
