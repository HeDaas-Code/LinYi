"""Integration tests for rulebook-driven TRPG in the mental sandbox."""

from __future__ import annotations

import random

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import CharacterProjection, Scene, TraitVector
from src.novelist_brain.sandbox import MentalSandbox
from src.novelist_brain.trpg import GameMaster, TRPGCharacterSheet, build_character_sheet
from src.novelist_brain.trpg_rulebook import Rulebook
from src.novelist_brain.trpg_state import SkillCheckOutcome


def _minimal_rulebook() -> Rulebook:
    return Rulebook(
        {
            "skills": [
                {"name": "观察", "base_value": 25.0},
                {"name": "格斗", "base_value": 25.0},
                {"name": "追踪", "base_value": 20.0},
            ],
            "actions": [
                {"name": "观察", "skill": "观察", "keywords": ["看", "观察"]},
                {"name": "战斗", "skill": "格斗", "keywords": ["打", "攻击", "战斗"]},
                {"name": "追逐", "skill": "追踪", "keywords": ["追", "逃"]},
                {"name": "对抗", "skill": "格斗", "keywords": ["对抗", "较量"]},
            ],
            "combat": {
                "attack_skill": "格斗",
                "dodge_skill": "闪避",
                "damage_formula": "1d3",
                "critical_multiplier": 2.0,
            },
        }
    )


def _make_sheet(name: str = "测试角色") -> TRPGCharacterSheet:
    return TRPGCharacterSheet(
        character_id="test-1",
        name=name,
        attributes={"str": 12, "dex": 12, "pow": 12, "int": 12},
        skills={"格斗": 50.0, "闪避": 25.0},
    )


def test_gamemaster_uses_rulebook_for_action() -> None:
    rulebook = _minimal_rulebook()
    gm = GameMaster(rulebook=rulebook, rng=random.Random(1))
    sheet = _make_sheet()
    resolution = gm.resolve_round("观察人群", sheet)
    assert resolution.check.skill == "观察"
    assert resolution.check.outcome in SkillCheckOutcome


def test_gamemaster_resolve_opposed() -> None:
    rulebook = _minimal_rulebook()
    gm = GameMaster(rulebook=rulebook, rng=random.Random(2))
    initiator = _make_sheet("A")
    responder = _make_sheet("B")
    opposed = gm.resolve_opposed("对抗", initiator, responder)
    assert opposed.winner_id in (initiator.character_id, responder.character_id, "")


def test_gamemaster_resolve_chase() -> None:
    rulebook = _minimal_rulebook()
    gm = GameMaster(rulebook=rulebook, rng=random.Random(3))
    quarry = _make_sheet("Quarry")
    hunter = _make_sheet("Hunter")
    chase = gm.resolve_chase(quarry, hunter)
    assert chase.quarry_id == quarry.character_id
    assert chase.hunter_id == hunter.character_id
    assert chase.round_count >= 1


def test_gamemaster_resolve_combat_round() -> None:
    rulebook = _minimal_rulebook()
    gm = GameMaster(rulebook=rulebook, rng=random.Random(4))
    attacker = _make_sheet("A")
    defender = _make_sheet("D")
    combat_round = gm.resolve_combat_round([attacker], [defender])
    assert combat_round.attacks


def test_sandbox_uses_embedded_rulebook() -> None:
    router = BusRouter()
    sandbox = MentalSandbox(llm_service=None, min_rounds=2, max_rounds=4)
    sandbox.register(router)
    rulebook = _minimal_rulebook()
    context = {
        "sandbox": {
            "rulebook": rulebook,
            "world": {"name": "test", "rules": ["测试规则"]},
        },
        "identity": {"name": "林逸", "traits": {"开放性": 0.8, "尽责性": 0.6, "内倾性": 0.7, "神经质": 0.5, "敏感性": 0.8}, "interests": ["记忆"]},
    }
    sandbox.init(context)
    assert sandbox._gm.rulebook is rulebook


def test_sandbox_resolve_event_opposed() -> None:
    router = BusRouter()
    sandbox = MentalSandbox(llm_service=None, min_rounds=2, max_rounds=4)
    sandbox.register(router)
    rulebook = _minimal_rulebook()
    sandbox.init(
        {
            "sandbox": {
                "rulebook": rulebook,
                "world": {"name": "test", "rules": ["测试规则"]},
            },
            "identity": {"name": "林逸", "traits": {"开放性": 0.8, "尽责性": 0.6, "内倾性": 0.7, "神经质": 0.5, "敏感性": 0.8}, "interests": ["记忆"]},
        }
    )
    # Ensure a second character exists for opposed checks.
    other = CharacterProjection(
        name="对手",
        archetype="对手",
        traits=TraitVector(),
    )
    sandbox._characters.append(other)
    sandbox._rebuild_character_sheets()

    protagonist = sandbox._characters[0]
    sandbox._current_scene = Scene(
        description="对峙", setting="街道", conflict_level=0.7
    )
    result = sandbox._resolve_event("与对方对抗", protagonist)
    assert result["outcome"] in ("成功", "失败")
    assert "opposed" in result["scene_delta"]


def test_sandbox_resolve_event_combat() -> None:
    router = BusRouter()
    sandbox = MentalSandbox(llm_service=None, min_rounds=2, max_rounds=4)
    sandbox.register(router)
    rulebook = _minimal_rulebook()
    sandbox.init(
        {
            "sandbox": {
                "rulebook": rulebook,
                "world": {"name": "test", "rules": ["测试规则"]},
            },
            "identity": {"name": "林逸", "traits": {"开放性": 0.8, "尽责性": 0.6, "内倾性": 0.7, "神经质": 0.5, "敏感性": 0.8}, "interests": ["记忆"]},
        }
    )
    other = CharacterProjection(
        name="敌人",
        archetype="敌人",
        traits=TraitVector(),
    )
    sandbox._characters.append(other)
    sandbox._rebuild_character_sheets()

    protagonist = sandbox._characters[0]
    # Boost protagonist attack and lower defender dodge to make the hit
    # deterministic for this integration test.
    sandbox._character_sheets[protagonist.id].skills["格斗"] = 99.0
    sandbox._character_sheets[other.id].skills["闪避"] = 1.0
    sandbox._current_scene = Scene(
        description="战斗", setting="街道", conflict_level=0.9
    )
    result = sandbox._resolve_event("与敌人战斗", protagonist)
    assert result["outcome"] == "战斗"
    assert "combat_round" in result["scene_delta"]
    assert sandbox._actor_states[other.id].hit_points < sandbox._actor_states[other.id].max_hit_points


def test_sandbox_round_trip_preserves_rulebook() -> None:
    router = BusRouter()
    sandbox = MentalSandbox(llm_service=None, min_rounds=2, max_rounds=4)
    sandbox.register(router)
    rulebook = _minimal_rulebook()
    sandbox.init(
        {
            "sandbox": {
                "rulebook": rulebook,
                "world": {"name": "test", "rules": ["测试规则"]},
            },
            "identity": {"name": "林逸", "traits": {"开放性": 0.8, "尽责性": 0.6, "内倾性": 0.7, "神经质": 0.5, "敏感性": 0.8}, "interests": ["记忆"]},
        }
    )
    snapshot = sandbox.to_dict()
    restored = MentalSandbox(llm_service=None)
    restored.register(router)
    restored.from_dict(snapshot)
    assert restored._rulebook is not None
    assert "观察" in restored._rulebook.skills
