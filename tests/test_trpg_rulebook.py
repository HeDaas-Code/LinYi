"""Tests for the data-driven TRPG rulebook."""

from __future__ import annotations

import json
import os
import tempfile

import pytest

from src.novelist_brain.trpg_rulebook import (
    ActionDef,
    CombatRule,
    ImprovementRule,
    ItemDef,
    MythosTome,
    Rulebook,
    SanityRule,
    SkillDef,
)


def _minimal_rulebook_data() -> dict:
    return {
        "name": "TestRules",
        "version": "0.1",
        "skills": [
            {"name": "观察", "base_value": 25.0, "attributes": ["pow", "int"]},
            {"name": "格斗", "base_value": 25.0, "attributes": ["str", "dex"]},
        ],
        "actions": [
            {
                "name": "观察",
                "skill": "观察",
                "keywords": ["看", "发现"],
                "difficulty": 1.0,
                "default_modifier": 0.0,
            },
            {
                "name": "战斗",
                "skill": "格斗",
                "keywords": ["打", "攻击"],
                "difficulty": 1.0,
                "default_modifier": 0.0,
            },
        ],
        "combat": {
            "name": "standard",
            "attack_skill": "格斗",
            "dodge_skill": "闪避",
            "damage_formula": "1d6+db",
            "critical_multiplier": 2.0,
        },
        "sanity": {
            "enabled": True,
            "fumble_shock_range": [5.0, 10.0],
        },
        "improvement": {
            "enabled": True,
            "improvement_die": "1d10",
        },
        "items": [
            {
                "id": "knife",
                "name": "小刀",
                "category": "weapon",
                "skill_bonus": {"格斗": 5.0},
            }
        ],
        "tomes": [
            {
                "id": "grimoir",
                "name": "Grimoire",
                "mythos_rating": 3.0,
                "spells": ["spell"],
            }
        ],
        "campaign_arcs": [
            {
                "id": "arc",
                "name": "Arc",
                "stages": [{"name": "start"}],
                "required_themes": ["theme"],
            }
        ],
    }


def test_rulebook_default_empty() -> None:
    rb = Rulebook()
    assert rb.name == "COC"
    assert rb.version == "1.0"
    assert not rb.skills
    assert not rb.actions


def test_rulebook_loads_dict() -> None:
    data = _minimal_rulebook_data()
    rb = Rulebook(data)
    assert rb.name == "TestRules"
    assert "观察" in rb.skills
    assert rb.skills["观察"].base_value == 25.0
    assert rb.combat.damage_formula == "1d6+db"
    assert rb.sanity.enabled is True
    assert rb.improvement.improvement_die == "1d10"
    assert "knife" in rb.items
    assert "grimoir" in rb.tomes
    assert "arc" in rb.campaign_arcs


def test_skill_for_action_exact_match() -> None:
    rb = Rulebook(_minimal_rulebook_data())
    action = rb.skill_for_action("观察")
    assert action.skill == "观察"


def test_skill_for_action_keyword_match() -> None:
    rb = Rulebook(_minimal_rulebook_data())
    action = rb.skill_for_action("看向窗外")
    assert action.skill == "观察"


def test_skill_for_action_fallback_to_skill_name() -> None:
    rb = Rulebook(_minimal_rulebook_data())
    action = rb.skill_for_action("使用格斗")
    assert action.skill == "格斗"


def test_skill_for_action_unknown_returns_empty() -> None:
    rb = Rulebook(_minimal_rulebook_data())
    action = rb.skill_for_action("unknown action")
    assert action.skill == ""


def test_contains() -> None:
    rb = Rulebook(_minimal_rulebook_data())
    assert "观察" in rb
    assert "战斗" in rb
    assert "不存在" not in rb


def test_items_for_category() -> None:
    rb = Rulebook(_minimal_rulebook_data())
    weapons = rb.items_for_category("weapon")
    assert len(weapons) == 1
    assert weapons[0].id == "knife"


def test_validate_minimal_passes() -> None:
    rb = Rulebook(_minimal_rulebook_data())
    errors = rb.validate()
    assert not errors


def test_validate_missing_skills() -> None:
    data = _minimal_rulebook_data()
    data["skills"] = []
    rb = Rulebook(data)
    errors = rb.validate()
    assert any("no skills" in e.lower() for e in errors)


def test_validate_invalid_damage_formula() -> None:
    data = _minimal_rulebook_data()
    data["combat"]["damage_formula"] = "invalid"
    rb = Rulebook(data)
    errors = rb.validate()
    assert any("damage_formula" in e for e in errors)


def test_rulebook_from_json_file() -> None:
    data = _minimal_rulebook_data()
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        path = f.name
    try:
        rb = Rulebook.from_file(path)
        assert rb.name == "TestRules"
        assert "观察" in rb.skills
    finally:
        os.unlink(path)


def test_rulebook_to_dict_roundtrip() -> None:
    rb = Rulebook(_minimal_rulebook_data())
    serialized = rb.to_dict()
    restored = Rulebook(serialized)
    assert restored.name == rb.name
    assert set(restored.skills) == set(rb.skills)
    assert restored