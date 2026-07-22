"""Tests for WorldStateContract persistence, versioning, and evolution.

Covers Task 1.10.1 of the refactor-novelist-system-v1 spec. Exercises
``src/novelist_brain/world_state.py`` together with the
``WorldStateContract`` / ``WorldRule`` / ``Mystery`` / ``HistoricalEvent``
/ ``Faction`` / ``Forbidden`` dataclasses declared in
``src/novelist_brain/models.py``.

Scenarios covered:
- ``create_default_world_state`` / ``load_or_create_world_state`` initialization
- ``WorldEvolutionRules.validate()`` rule checks (stable rules / forbidden
  consequences / mystery budget / faction range / geography name)
- ``WorldStateStore`` versioned snapshots + human-readable projection
- ``WorldStateStore.diff()`` structural diff
- Atomic write failure recovery (no corruption, no ``.tmp`` residue)
- ``ExperienceToWorldMapper`` for memory trace / social encounter /
  DMN insight / IdentityCore shift
- ``WorldEvolutionRules.apply_mutations`` boundary enforcement
  (mystery budget, forbidden consequences, geography activation,
  faction power clamping, input immutability)
- ``WorldStateContract.to_ontology()`` sandbox compatibility
"""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from unittest import mock

import pytest

from src.novelist_brain.models import (
    Forbidden,
    Mystery,
    WorldRule,
    WorldStateContract,
)
from src.novelist_brain.world_state import (
    ExperienceToWorldMapper,
    WorldEvolutionRules,
    WorldStateStore,
    create_default_world_state,
    load_or_create_world_state,
)


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


def test_create_default_world_state_seeds_minimum_contract() -> None:
    contract = create_default_world_state(
        "novel_A", genre="literary", tone="melancholic"
    )
    assert isinstance(contract, WorldStateContract)
    assert contract.novel_id == "novel_A"
    assert contract.genre == "literary"
    assert contract.tone == "melancholic"
    assert contract.version == 0
    assert len(contract.geography) >= 1
    assert len(contract.factions) >= 1
    assert len(contract.rules) >= 2
    # Foundational rules are unbreakable and active by spec §5.3 稳定规则.
    for rule in contract.rules:
        assert rule.rule_id
        assert rule.domain in {"physical", "social", "mystical", "narrative"}
        assert rule.breakable is False
        assert rule.status == "active"
    # No mysteries or forbidden entries seeded by default.
    assert contract.mysteries == []
    assert contract.forbidden == []
    assert contract.history == []


def test_load_or_create_world_state_creates_then_returns_existing(
    tmp_path: Path,
) -> None:
    store = WorldStateStore(str(tmp_path), "novel_init")
    # First call: nothing on disk → create default (not auto-saved).
    created = load_or_create_world_state(
        store, "novel_init", genre="literary", tone="melancholic"
    )
    assert created.version == 0
    assert store.load() is None  # not yet persisted

    # Persist explicitly; save() bumps version to 1.
    store.save(created, reason="initial seed")
    assert store.load() is not None

    # Second call: returns the persisted contract, not a fresh default.
    loaded = load_or_create_world_state(
        store, "novel_init", genre="literary", tone="melancholic"
    )
    assert loaded.version == 1
    assert loaded.novel_id == "novel_init"
    assert loaded.genre == "literary"


# ---------------------------------------------------------------------------
# WorldEvolutionRules.validate
# ---------------------------------------------------------------------------


def test_validate_clean_contract_returns_no_warnings() -> None:
    contract = create_default_world_state("novel_clean")
    assert WorldEvolutionRules().validate(contract) == []


def test_validate_detects_stable_rule_status_violation() -> None:
    contract = create_default_world_state("novel_stable")
    # A foundational (breakable=False) rule must remain 'active'.
    contract.rules[0].status = "broken"
    warnings = WorldEvolutionRules().validate(contract)
    broken_id = contract.rules[0].rule_id
    assert any(
        "stable rule" in w and broken_id in w and "active" in w for w in warnings
    )


def test_validate_detects_forbidden_without_consequences() -> None:
    contract = create_default_world_state("novel_taboo")
    contract.forbidden.append(
        Forbidden(
            forbidden_id="taboo_x",
            name="无后果禁忌",
            description="...",
            consequences=[],
            introduced_in="test",
        )
    )
    warnings = WorldEvolutionRules().validate(contract)
    assert any("taboo_x" in w and "consequences" in w for w in warnings)


def test_validate_detects_open_mystery_budget_exceeded() -> None:
    contract = create_default_world_state("novel_mysteries")
    # MAX_OPEN_MYSTERIES + 1 open mysteries should overflow the budget.
    for i in range(WorldEvolutionRules.MAX_OPEN_MYSTERIES + 1):
        contract.mysteries.append(
            Mystery(
                mystery_id=f"m{i}",
                name=f"谜{i}",
                description="...",
                revealed=False,
            )
        )
    warnings = WorldEvolutionRules().validate(contract)
    assert any("open mysteries" in w and "budget" in w for w in warnings)


def test_validate_detects_faction_power_out_of_range() -> None:
    contract = create_default_world_state("novel_faction")
    contract.factions["background_force"]["power"] = 1.5  # out of [0,1]
    warnings = WorldEvolutionRules().validate(contract)
    assert any("background_force" in w and "power" in w for w in warnings)


def test_validate_detects_geography_without_name() -> None:
    contract = create_default_world_state("novel_geo_validate")
    contract.geography["anon_place"] = {"activation_level": "未探索"}  # no name
    warnings = WorldEvolutionRules().validate(contract)
    assert any("anon_place" in w and "name" in w for w in warnings)


# ---------------------------------------------------------------------------
# Versioned snapshots + projection
# ---------------------------------------------------------------------------


def test_save_writes_versioned_snapshots_with_ascending_n(
    tmp_path: Path,
) -> None:
    store = WorldStateStore(str(tmp_path), "novel_ver")
    c = create_default_world_state("novel_ver")

    v1 = store.save(c, reason="first")
    v2 = store.save(c, reason="second")
    v3 = store.save(c, reason="third")

    assert (v1, v2, v3) == (1, 2, 3)
    for v in (v1, v2, v3):
        version_file = Path(store.novel_dir) / f"v{v}.json"
        assert version_file.is_file()


def test_load_version_returns_specific_snapshot(tmp_path: Path) -> None:
    store = WorldStateStore(str(tmp_path), "novel_loadv")
    c1 = create_default_world_state("novel_loadv")
    v1 = store.save(c1, reason="v1")

    c2 = copy.deepcopy(c1)
    c2.tone = "tense"
    c2.rules.append(
        WorldRule(
            rule_id="extra_rule",
            domain="mystical",
            statement="额外规则",
            breakable=True,
            consequences=[],
            introduced_in="test",
            status="active",
        )
    )
    v2 = store.save(c2, reason="v2")

    loaded_v1 = store.load_version(v1)
    loaded_v2 = store.load_version(v2)
    assert loaded_v1 is not None and loaded_v2 is not None
    assert loaded_v1.tone == "melancholic"
    assert loaded_v2.tone == "tense"
    assert len(loaded_v1.rules) == 2
    assert len(loaded_v2.rules) == 3
    assert loaded_v1.version == v1
    assert loaded_v2.version == v2
    # Missing version returns None.
    assert store.load_version(999) is None


def test_list_versions_returns_ascending_list(tmp_path: Path) -> None:
    store = WorldStateStore(str(tmp_path), "novel_list")
    assert store.list_versions() == []

    c = create_default_world_state("novel_list")
    store.save(c, reason="a")
    store.save(c, reason="b")
    store.save(c, reason="c")

    assert store.list_versions() == [1, 2, 3]


def test_save_writes_human_readable_projection(tmp_path: Path) -> None:
    store = WorldStateStore(str(tmp_path), "novel_proj")
    c = create_default_world_state(
        "novel_proj", genre="literary fiction", tone="melancholic"
    )
    store.save(c, reason="initial")

    proj_path = Path(store.novel_dir) / WorldStateStore.HUMAN_READABLE_FILENAME
    current_path = Path(store.novel_dir) / WorldStateStore.CURRENT_FILENAME
    assert proj_path.is_file()
    assert current_path.is_file()

    projection = json.loads(proj_path.read_text(encoding="utf-8"))
    assert projection["genre"] == "literary fiction"
    assert projection["tone"] == "melancholic"
    assert projection["version"] == 1
    assert any(g["id"] == "anchor_place" for g in projection["geography_summary"])
    assert any(
        f["id"] == "background_force" for f in projection["factions_summary"]
    )
    assert len(projection["rules_summary"]) == 2


# ---------------------------------------------------------------------------
# Diff
# ---------------------------------------------------------------------------


def test_diff_returns_added_changed_removed_per_dimension(
    tmp_path: Path,
) -> None:
    store = WorldStateStore(str(tmp_path), "novel_diff")
    c1 = create_default_world_state("novel_diff")
    v1 = store.save(c1, reason="v1")

    c2 = copy.deepcopy(c1)
    c2.geography["new_place"] = {
        "name": "新地点",
        "activation_level": "未探索",
    }
    c2.mysteries.append(
        Mystery(
            mystery_id="m_new",
            name="新谜",
            description="...",
            revealed=False,
        )
    )
    # Drop one foundational rule.
    c2.rules = [r for r in c2.rules if r.rule_id != "social_basis"]
    # Change an existing faction's power.
    c2.factions["background_force"]["power"] = 0.4
    v2 = store.save(c2, reason="v2")

    diff = store.diff(v1, v2)
    assert "error" not in diff
    assert diff["version"] == {"from": v1, "to": v2}
    assert diff["geography"]["added"] == ["new_place"]
    assert diff["mysteries"]["added"] == ["m_new"]
    assert diff["rules"]["removed"] == ["social_basis"]
    assert diff["factions"]["changed"] == ["background_force"]
    assert diff["tone_changed"] is False
    assert diff["genre_changed"] is False


def test_diff_missing_version_returns_error(tmp_path: Path) -> None:
    store = WorldStateStore(str(tmp_path), "novel_diff_missing")
    c = create_default_world_state("novel_diff_missing")
    store.save(c, reason="v1")

    result = store.diff(1, 99)
    assert "error" in result
    assert "99" in result["error"]


# ---------------------------------------------------------------------------
# Atomic write
# ---------------------------------------------------------------------------


def test_atomic_write_failure_preserves_existing_file(tmp_path: Path) -> None:
    store = WorldStateStore(str(tmp_path), "novel_atomic")
    c1 = create_default_world_state("novel_atomic")
    store.save(c1, reason="v1")

    current_path = Path(store.novel_dir) / WorldStateStore.CURRENT_FILENAME
    original_blob = current_path.read_text(encoding="utf-8")

    c2 = copy.deepcopy(c1)
    with mock.patch.object(
        store, "_atomic_write", side_effect=IOError("disk full")
    ):
        with pytest.raises(IOError):
            store.save(c2, reason="should_fail")

    # Original latest snapshot untouched.
    assert current_path.read_text(encoding="utf-8") == original_blob
    # No .tmp residue left behind.
    tmp_files = list(Path(store.novel_dir).glob("*.tmp"))
    assert tmp_files == []
    # On-disk version list still only contains the first save.
    assert store.list_versions() == [1]


# ---------------------------------------------------------------------------
# ExperienceToWorldMapper
# ---------------------------------------------------------------------------


def test_map_trace_yields_geography_and_mystery_mutations() -> None:
    contract = create_default_world_state("novel_trace")
    mapper = ExperienceToWorldMapper()

    # valence<0 with low arousal/emotional_weight → "边缘空间" activation.
    trace = {
        "tags": ["便利店", "谜"],
        "summary": "凌晨便利店的神秘符号",
        "narrative_role": "event",
        "valence": -0.5,
        "arousal": 0.4,
        "emotional_weight": 0.3,
    }
    mutations = mapper.map_trace(trace, contract)

    ops = [m["op"] for m in mutations]
    assert "add_geography" in ops
    assert "add_mystery" in ops

    geo_mut = next(m for m in mutations if m["op"] == "add_geography")
    # valence<-0.3 and no high arousal/weight → 边缘空间.
    assert geo_mut["value"]["activation_level"] == "边缘空间"
    assert geo_mut["value"]["name"] == "凌晨便利店的神秘符号"

    mys_mut = next(m for m in mutations if m["op"] == "add_mystery")
    assert mys_mut["value"]["revealed"] is False
    assert mys_mut["target"] == "凌晨便利店的神秘符号"


def test_map_social_encounter_yields_faction_and_rule_mutations() -> None:
    contract = create_default_world_state("novel_social")
    mapper = ExperienceToWorldMapper()

    encounter = {
        "space_id": "旧书店",
        "role_id": "店主",
        "gaze_pressure": 0.8,
        "dialogue_mode": "deep",
        "summary": "深夜的对话",
    }
    mutations = mapper.map_social_encounter(encounter, contract)

    ops = [m["op"] for m in mutations]
    assert "add_faction" in ops
    assert "add_rule" in ops

    faction_mut = next(m for m in mutations if m["op"] == "add_faction")
    assert faction_mut["target"] == "旧书店_circle"
    assert faction_mut["value"]["relations"]["protagonist"] == "ambivalent"
    # High gaze_pressure should bump power above the seed default.
    assert faction_mut["value"]["power"] > 0.2

    rule_mut = next(m for m in mutations if m["op"] == "add_rule")
    assert rule_mut["value"]["domain"] == "social"
    assert rule_mut["value"]["breakable"] is True
    assert rule_mut["value"]["status"] == "active"


def test_map_dmn_insight_yields_forbidden_and_mystical_rule() -> None:
    contract = create_default_world_state("novel_dmn")
    mapper = ExperienceToWorldMapper()

    insight = {
        "content": "雾中的低语揭示了禁忌的知识",
        "is_metaphor": True,
        "touches_taboo": True,
    }
    mutations = mapper.map_dmn_insight(insight, contract)

    ops = [m["op"] for m in mutations]
    assert "add_rule" in ops  # metaphor → mystical rule
    assert "add_forbidden" in ops  # touches_taboo → forbidden entry

    rule_mut = next(m for m in mutations if m["op"] == "add_rule")
    assert rule_mut["value"]["domain"] == "mystical"
    assert rule_mut["value"]["breakable"] is False

    forbidden_mut = next(m for m in mutations if m["op"] == "add_forbidden")
    assert forbidden_mut["value"]["consequences"]  # non-empty
    assert forbidden_mut["value"]["forbidden_id"].startswith("taboo_")


def test_map_identity_shift_yields_tone_update() -> None:
    contract = create_default_world_state(
        "novel_identity", tone="melancholic"
    )
    mapper = ExperienceToWorldMapper()

    identity = {
        "tone_shift": "压抑",
        "core_conflict": "现实与幻觉的边界",
        "new_taboos": ["直视不可名状之物"],
    }
    mutations = mapper.map_identity_shift(identity, contract)

    ops = [m["op"] for m in mutations]
    assert "update_tone" in ops
    assert "add_rule" in ops  # core_conflict → narrative rule
    assert "add_forbidden" in ops  # new_taboos → forbidden

    tone_mut = next(m for m in mutations if m["op"] == "update_tone")
    assert tone_mut["value"] == "压抑"
    assert tone_mut["target"] == "tone"

    rule_mut = next(m for m in mutations if m["op"] == "add_rule")
    assert rule_mut["value"]["domain"] == "narrative"


# ---------------------------------------------------------------------------
# WorldEvolutionRules.apply_mutations
# ---------------------------------------------------------------------------


def test_apply_mutations_grows_contract_within_bounds() -> None:
    contract = create_default_world_state("novel_grow")
    mutations = [
        {
            "op": "add_geography",
            "target": "新地点",
            "value": {"name": "新地点", "activation_level": "未探索"},
            "reason": "test",
        },
        {
            "op": "add_faction",
            "target": "新势力",
            "value": {
                "faction_id": "新势力",
                "name": "新势力",
                "description": "测试",
                "power": 0.3,
                "influence": 0.3,
                "relations": {"protagonist": "neutral"},
            },
            "reason": "test",
        },
        {
            "op": "add_rule",
            "target": "rule_new",
            "value": {
                "rule_id": "rule_new",
                "domain": "narrative",
                "statement": "新规则",
                "breakable": True,
                "consequences": [],
                "introduced_in": "test",
                "status": "active",
            },
            "reason": "test",
        },
        {
            "op": "add_mystery",
            "target": "m_new",
            "value": {
                "mystery_id": "m_new",
                "name": "新谜",
                "description": "...",
                "revealed": False,
                "revealed_in_chapter": None,
                "payoff_rules": [],
            },
            "reason": "test",
        },
    ]
    new_contract, applied = WorldEvolutionRules().apply_mutations(
        contract, mutations
    )

    assert "新地点" in new_contract.geography
    assert "新势力" in new_contract.factions
    assert any(r.rule_id == "rule_new" for r in new_contract.rules)
    assert any(m.mystery_id == "m_new" for m in new_contract.mysteries)
    # All four mutations applied successfully.
    assert len(applied) == 4
    assert all("skip" not in a and "BLOCKED" not in a for a in applied)
    # New contract passes validation.
    assert WorldEvolutionRules().validate(new_contract) == []


def test_apply_mutations_rejects_mystery_beyond_max_open() -> None:
    contract = create_default_world_state("novel_mystery_cap")
    # Fill up to MAX_OPEN_MYSTERIES open mysteries.
    for i in range(WorldEvolutionRules.MAX_OPEN_MYSTERIES):
        contract.mysteries.append(
            Mystery(
                mystery_id=f"m{i}",
                name=f"谜{i}",
                description="...",
                revealed=False,
            )
        )

    mutations = [
        {
            "op": "add_mystery",
            "target": "m_overflow",
            "value": {
                "mystery_id": "m_overflow",
                "name": "超限谜",
                "description": "...",
                "revealed": False,
                "revealed_in_chapter": None,
                "payoff_rules": [],
            },
            "reason": "should be rejected",
        }
    ]
    new_contract, applied = WorldEvolutionRules().apply_mutations(
        contract, mutations
    )

    assert not any(
        m.mystery_id == "m_overflow" for m in new_contract.mysteries
    )
    assert (
        len(new_contract.mysteries) == WorldEvolutionRules.MAX_OPEN_MYSTERIES
    )
    assert any(
        "skip" in a and "m_overflow" in a and "budget" in a for a in applied
    )


def test_apply_mutations_blocks_forbidden_without_consequences_records_history() -> None:
    contract = create_default_world_state("novel_forbidden_blocked")
    initial_history_len = len(contract.history)

    mutations = [
        {
            "op": "add_forbidden",
            "target": "taboo_no_consequence",
            "value": {
                "forbidden_id": "taboo_no_consequence",
                "name": "无后果禁忌",
                "description": "...",
                "consequences": [],
                "introduced_in": "test",
            },
            "reason": "should be blocked",
        }
    ]
    new_contract, applied = WorldEvolutionRules().apply_mutations(
        contract, mutations
    )

    # Forbidden entry rejected.
    assert not any(
        f.forbidden_id == "taboo_no_consequence"
        for f in new_contract.forbidden
    )
    # Violation recorded as a HistoricalEvent per spec §5.3 禁忌代价.
    assert len(new_contract.history) == initial_history_len + 1
    assert any(
        h.event_id == "forbidden_rejected_taboo_no_consequence"
        for h in new_contract.history
    )
    assert any("BLOCKED" in a for a in applied)


def test_apply_mutations_deepens_geography_activation_level() -> None:
    contract = create_default_world_state("novel_geo_deepen")
    # Default anchor_place is seeded at "熟悉".
    assert contract.geography["anchor_place"]["activation_level"] == "熟悉"

    mutations = [
        {
            "op": "update_geography",
            "target": "anchor_place",
            "value": {},
            "reason": "revisit",
        }
    ]
    new_contract, applied = WorldEvolutionRules().apply_mutations(
        contract, mutations
    )

    # 未探索 → 熟悉 → 危险 → 改变: one notch forward from "熟悉" is "危险".
    assert (
        new_contract.geography["anchor_place"]["activation_level"] == "危险"
    )
    assert any("update geography" in a for a in applied)


def test_apply_mutations_clamps_faction_power_to_range() -> None:
    contract = create_default_world_state("novel_clamp")
    mutations = [
        {
            "op": "update_faction",
            "target": "background_force",
            "value": {"power": 2.5, "influence": -0.3},
            "reason": "over-shift",
        }
    ]
    new_contract, applied = WorldEvolutionRules().apply_mutations(
        contract, mutations
    )

    faction = new_contract.factions["background_force"]
    assert faction["power"] == 1.0  # clamped to max
    assert faction["influence"] == 0.0  # clamped to min
    assert any("update faction" in a for a in applied)


def test_apply_mutations_does_not_mutate_input_contract() -> None:
    contract = create_default_world_state("novel_immutable")
    original_rules_len = len(contract.rules)
    original_geo_keys = set(contract.geography.keys())

    mutations = [
        {
            "op": "add_geography",
            "target": "x",
            "value": {"name": "x"},
            "reason": "",
        },
        {
            "op": "add_rule",
            "target": "r_x",
            "value": {
                "rule_id": "r_x",
                "domain": "social",
                "statement": "x",
                "breakable": True,
                "consequences": [],
                "introduced_in": "t",
                "status": "active",
            },
            "reason": "",
        },
    ]
    new_contract, _ = WorldEvolutionRules().apply_mutations(
        contract, mutations
    )

    # Original contract untouched.
    assert len(contract.rules) == original_rules_len
    assert set(contract.geography.keys()) == original_geo_keys
    assert "x" not in contract.geography
    # New contract reflects mutations.
    assert "x" in new_contract.geography
    assert any(r.rule_id == "r_x" for r in new_contract.rules)


# ---------------------------------------------------------------------------
# to_ontology
# ---------------------------------------------------------------------------


def test_to_ontology_exposes_genre_and_tone_for_sandbox() -> None:
    contract = create_default_world_state(
        "novel_onto", genre="literary fiction", tone="melancholic"
    )
    ontology = contract.to_ontology()

    # Sanity: dict shape compatible with WorldModel.ontology consumers.
    assert ontology["genre"] == "literary fiction"
    assert ontology["tone"] == "melancholic"
    assert "geography" in ontology
    assert "factions" in ontology
    assert "rules" in ontology
    assert "mysteries" in ontology
    assert ontology["version"] == 0
    # Rules are projected via to_dict for sandbox consumption.
    assert all(isinstance(r, dict) for r in ontology["rules"])
