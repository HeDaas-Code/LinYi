"""Tests for extended TRPG mechanics."""

from __future__ import annotations

import random

import pytest

from src.novelist_brain.models import Condition, Item
from src.novelist_brain.trpg_extended import (
    Chase,
    Combatant,
    CombatResolver,
    CombatRound,
    OpposedCheck,
    PushedRoll,
    resolve_opposed_check,
    resolve_pushed_roll,
    resolve_skill_check_with_dice,
    roll_with_bonus_penalty_dice,
)
from src.novelist_brain.trpg_rulebook import CombatRule, Rulebook
from src.novelist_brain.trpg_state import (
    ActorState,
    Inventory,
    LuckPool,
    SkillCheckOutcome,
    SkillImprovement,
)


def test_roll_with_bonus_dice_lowers_result() -> None:
    rng = random.Random(42)
    base = 95
    # With a large number of bonus dice the tens digit should tend downward.
    rolls = [roll_with_bonus_penalty_dice(base, bonus_dice=5, rng=rng) for _ in range(100)]
    assert all(1 <= r <= 100 for r in rolls)
    assert sum(rolls) / len(rolls) < base


def test_roll_with_penalty_dice_raises_result() -> None:
    rng = random.Random(42)
    base = 15
    rolls = [roll_with_bonus_penalty_dice(base, penalty_dice=5, rng=rng) for _ in range(100)]
    assert all(1 <= r <= 100 for r in rolls)
    assert sum(rolls) / len(rolls) > base


def test_resolve_skill_check_with_dice_returns_metadata() -> None:
    roll, target, outcome, metadata = resolve_skill_check_with_dice(
        50.0, bonus_dice=1, penalty_dice=0, rng=random.Random(1)
    )
    assert 1 <= roll <= 100
    assert "raw_roll" in metadata
    assert "bonus_dice" in metadata


def test_resolve_pushed_roll_success_stops() -> None:
    rng = random.Random(1)
    # Pump skill value high enough that the first roll is likely a success.
    pushed = resolve_pushed_roll(99.0, rng=rng)
    assert pushed.final_outcome in (
        SkillCheckOutcome.SUCCESS,
        SkillCheckOutcome.HARD_SUCCESS,
        SkillCheckOutcome.CRITICAL_SUCCESS,
    )


def test_resolve_pushed_roll_failure_adds_complication() -> None:
    rng = random.Random(7)
    pushed = resolve_pushed_roll(1.0, rng=rng)
    assert pushed.final_outcome == SkillCheckOutcome.FUMBLE
    assert pushed.complication is not None


def test_luck_pool_spend_and_restore() -> None:
    luck = LuckPool(current=30.0, max=99.0)
    assert luck.spend(10.0) is True
    assert luck.current == 20.0
    assert luck.spend(25.0) is False
    luck.restore(15.0)
    assert luck.current == 35.0


def test_inventory_skill_bonus() -> None:
    inv = Inventory()
    inv.add(Item(id="knife", name="小刀", category="weapon", skill_bonus={"格斗": 5.0}))
    assert inv.skill_bonus("格斗") == 5.0


def test_inventory_use_item_consumes_charge() -> None:
    inv = Inventory()
    inv.add(
        Item(
            id="bandage",
            name="绷带",
            category="consumable",
            uses=1,
            effects=[{"type": "heal_hp", "formula": "1d3"}],
        )
    )
    item, result = inv.use_item("bandage")
    assert result["used"] is True
    assert item is not None
    assert item.uses == 0


def test_actor_state_apply_damage() -> None:
    actor = ActorState(hit_points=12.0, max_hit_points=12.0)
    result = actor.apply_damage(7.0)
    assert actor.hit_points == 5.0
    assert result["major_wound"] is True
    actor2 = ActorState(hit_points=12.0, max_hit_points=12.0)
    actor2.apply_damage(12.0)
    assert actor2.unconscious is True


def test_actor_state_apply_sanity_shock() -> None:
    actor = ActorState(magic_points=12.0, max_magic_points=12.0)
    result = actor.apply_sanity_shock(3.0)
    assert result["sanity_loss"] == 3.0
    assert actor.magic_points == 9.0


def test_skill_improvement_resolve() -> None:
    improvement = SkillImprovement()
    improvement.mark_success("观察")
    gain = improvement.resolve_improvement("观察", rng=random.Random(1))
    assert gain >= 0.0


def test_resolve_opposed_check_returns_winner() -> None:
    opposed = resolve_opposed_check(
        80.0,
        10.0,
        initiator_name="A",
        responder_name="B",
        initiator_id="a",
        responder_id="b",
        skill_name="格斗",
        rng=random.Random(2),
    )
    assert isinstance(opposed, OpposedCheck)
    assert opposed.winner_id == "a"
    assert opposed.margin > 0


def test_chase_resolve_round_updates_distance() -> None:
    chase = Chase(quarry_id="q", hunter_id="h", distance=5.0)
    result = chase.resolve_round(50.0, 50.0, rng=random.Random(3))
    assert "distance" in result
    assert chase.round_count == 1


def test_combat_round_resolve_records_attacks() -> None:
    attacker = Combatant(character_id="a", name="A", attack_skill_value=80.0)
    defender = Combatant(character_id="d", name="D", dodge_skill_value=20.0)
    round_result = CombatRound().resolve(
        [attacker], [defender], rule=CombatRule(damage_formula="1d6"), rng=random.Random(4)
    )
    assert round_result.attacks
    assert round_result.round_index == 1


def test_combat_resolver_multi_round() -> None:
    attacker = Combatant(character_id="a", name="A", attack_skill_value=99.0)
    defender = Combatant(character_id="d", name="D", dodge_skill_value=1.0, hit_points=1.0)
    resolver = CombatResolver(rule=CombatRule(damage_formula="1d6"))
    rounds = resolver.resolve_multi_round([attacker], [defender], max_rounds=5, rng=random.Random(5))
    assert len(rounds) >= 1
    # High-skill attacker against weak defender should end quickly.
    assert defender.hit_points <= 0