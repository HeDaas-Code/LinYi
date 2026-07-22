"""Unit tests for ``OCCharacterSystem`` (Task 1.10.2).

Covers SubTask 1.3.1–1.3.6 of the refactor-novelist-system-v1 spec:
subscriptions, ``build_oc_sheet`` COC generation, ``control.oc.create`` /
``control.oc.update`` bus handlers, ``immutable_facts`` protection,
``check_world_fit`` world-adaptation checks, query interfaces, and
persistence to ``oc_registry/{novel_id}.json``.

The tests follow the actual ``models.py`` / ``oc_character_system.py``
field names (which differ from the spec template in several places —
notably ``SanitySystem.current_sanity`` and COC attributes being
``3d6 × 5`` in the [15, 90] range rather than bare ``3d6``).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.llm import MockLLMService
from src.novelist_brain.models import BusMessage, OCCharacterSheet, Relationship, WorldStateContract
from src.novelist_brain.oc_character_system import COC_ATTRIBUTES, OCCharacterSystem
from src.novelist_brain.world_state import create_default_world_state


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_system(
    tmp_path: Path,
    *,
    novel_id: str = "test_novel",
    rng_seed: int | None = 42,
    world_contract: WorldStateContract | None = None,
    llm: Any | None = None,
) -> tuple[OCCharacterSystem, BusRouter]:
    """Build an ``OCCharacterSystem`` registered to a fresh ``BusRouter``.

    The registry is pointed at ``tmp_path / "oc_registry"`` so each test
    is isolated from the real workspace filesystem.
    """
    system = OCCharacterSystem()
    router = BusRouter()
    system.register(router)
    registry_dir = str(tmp_path / "oc_registry")
    system.init(
        {
            "novel_v2": {"novel_id": novel_id, "oc_registry_dir": registry_dir},
            "rng_seed": rng_seed,
            "world_contract": world_contract,
            "llm": llm if llm is not None else MockLLMService(seed=42),
        }
    )
    return system, router


def _drain(router: BusRouter, max_rounds: int = 12) -> list[BusMessage]:
    """Flush ``router`` until the inbox is empty, collecting delivered messages.

    Each ``flush()`` only processes the snapshot taken at its start, so
    messages emitted *during* a flush appear in the next round. The loop
    terminates once a flush returns no messages.
    """
    delivered: list[BusMessage] = []
    for _ in range(max_rounds):
        batch = router.flush()
        if not batch:
            break
        delivered.extend(batch)
    return delivered


def _publish(
    router: BusRouter,
    *,
    topic: str,
    payload: Any,
    channel: str = "control",
) -> None:
    router.publish(source="test", topic=topic, channel=channel, payload=payload)


# ---------------------------------------------------------------------------
# Subscriptions & metadata
# ---------------------------------------------------------------------------


class TestSubscriptions:
    def test_subscribes_to_required_topics(self) -> None:
        system = OCCharacterSystem()
        required = {
            "data.memory.trace.query.result",
            "control.oc.create",
            "control.oc.update",
            "data.sandbox.world.updated",
        }
        assert required.issubset(set(system.subscriptions))

    def test_metadata_reports_novel_source_category(self) -> None:
        meta = OCCharacterSystem.metadata()
        assert meta["name"] == "oc_character_system"
        assert meta["category"] == "novel_source"
        assert meta["version"]


# ---------------------------------------------------------------------------
# build_oc_sheet — COC attribute & derived-stat generation
# ---------------------------------------------------------------------------


class TestBuildOCSheet:
    def test_generates_all_eight_coc_attributes_in_valid_range(self, tmp_path: Path) -> None:
        system, _ = _make_system(tmp_path)
        sheet = system.build_oc_sheet(character_id="c1", name="Alice")
        assert set(sheet.coc_attributes.keys()) == set(COC_ATTRIBUTES)
        # COC 7e: each attribute = 3d6 × 5 → range [15, 90].
        for attr in COC_ATTRIBUTES:
            val = sheet.coc_attributes[attr]
            assert 15 <= val <= 90, f"attribute {attr}={val} outside [15, 90]"

    def test_derived_stats_match_coc_formulas(self, tmp_path: Path) -> None:
        system, _ = _make_system(tmp_path, rng_seed=7)
        sheet = system.build_oc_sheet(character_id="c1")
        con = sheet.coc_attributes["con"]
        siz = sheet.coc_attributes["siz"]
        pow_ = sheet.coc_attributes["pow"]
        assert sheet.hit_points == math.floor((con + siz) / 10)
        assert sheet.hit_points > 0
        assert sheet.magic_points == math.floor(pow_ / 5)
        assert sheet.magic_points > 0
        assert sheet.sanity.current_sanity == min(pow_ * 5, 99)
        assert sheet.sanity.max_sanity == 99

    def test_luck_is_independent_roll_capped_at_99(self, tmp_path: Path) -> None:
        system, _ = _make_system(tmp_path)
        for _ in range(20):
            sheet = system.build_oc_sheet(character_id="c")
            # Luck = 3d6 × 5 (independent of attributes), capped at 99.
            assert 15 <= sheet.luck.current <= 99
            assert sheet.luck.max == 99
            assert sheet.luck.spent_today == 0

    def test_default_skill_points_sum_to_200(self, tmp_path: Path) -> None:
        system, _ = _make_system(tmp_path)
        sheet = system.build_oc_sheet(character_id="c1")
        total = sum(float(v) for v in sheet.coc_skills.values())
        assert total == 200

    def test_projection_ratio_is_zero(self, tmp_path: Path) -> None:
        system, _ = _make_system(tmp_path)
        sheet = system.build_oc_sheet(character_id="c1")
        assert sheet.projection_ratio == 0.0

    def test_same_seed_produces_deterministic_sheet(self, tmp_path: Path) -> None:
        system_a, _ = _make_system(tmp_path, rng_seed=123, novel_id="seed_a")
        system_b, _ = _make_system(tmp_path, rng_seed=123, novel_id="seed_b")
        sheet_a = system_a.build_oc_sheet(character_id="c1")
        sheet_b = system_b.build_oc_sheet(character_id="c1")
        assert sheet_a.coc_attributes == sheet_b.coc_attributes
        assert sheet_a.coc_skills == sheet_b.coc_skills
        assert sheet_a.luck.current == sheet_b.luck.current
        assert sheet_a.sanity.current_sanity == sheet_b.sanity.current_sanity

    def test_different_seed_produces_different_attributes(self, tmp_path: Path) -> None:
        system_a, _ = _make_system(tmp_path, rng_seed=1, novel_id="diff_a")
        system_b, _ = _make_system(tmp_path, rng_seed=2, novel_id="diff_b")
        sheet_a = system_a.build_oc_sheet(character_id="c1")
        sheet_b = system_b.build_oc_sheet(character_id="c1")
        # 8 attributes × 3d6×5 each — collision between two different seeds
        # is astronomically unlikely.
        assert sheet_a.coc_attributes != sheet_b.coc_attributes


# ---------------------------------------------------------------------------
# control.oc.create bus handler
# ---------------------------------------------------------------------------


class TestCreateViaBus:
    def test_create_emits_data_oc_created_with_sheet(self, tmp_path: Path) -> None:
        system, router = _make_system(tmp_path)
        _publish(
            router,
            topic="control.oc.create",
            payload={
                "character_id": "oc_1",
                "name": "Alice",
                "archetype": "导师",
                "role_in_story": "supporting",
                "immutable_facts": ["name", "archetype"],
            },
        )
        delivered = _drain(router)
        created = [m for m in delivered if m.topic == "data.oc.created"]
        assert len(created) == 1
        payload = created[0].payload
        assert payload["character_id"] == "oc_1"
        assert payload["sheet"]["name"] == "Alice"
        assert payload["sheet"]["archetype"] == "导师"
        assert "world_fit_warnings" in payload
        # Sheet is also stored in the registry.
        sheet = system.get_sheet("oc_1")
        assert sheet is not None
        assert sheet.name == "Alice"

    def test_create_duplicate_character_emits_rejected(self, tmp_path: Path) -> None:
        system, router = _make_system(tmp_path)
        payload = {"character_id": "oc_1", "name": "Alice"}
        _publish(router, topic="control.oc.create", payload=payload)
        _drain(router)
        _publish(router, topic="control.oc.create", payload=payload)
        delivered = _drain(router)
        rejected = [m for m in delivered if m.topic == "data.oc.update.rejected"]
        assert len(rejected) == 1
        assert rejected[0].payload["reason"] == "character already exists"
        assert rejected[0].payload["operation"] == "create"


# ---------------------------------------------------------------------------
# control.oc.update bus handler
# ---------------------------------------------------------------------------


class TestUpdateViaBus:
    def test_update_non_immutable_fields_succeeds(self, tmp_path: Path) -> None:
        system, router = _make_system(tmp_path)
        _publish(
            router,
            topic="control.oc.create",
            payload={
                "character_id": "oc_1",
                "name": "Alice",
                "archetype": "导师",
                "immutable_facts": ["name", "archetype"],
            },
        )
        _drain(router)
        _publish(
            router,
            topic="control.oc.update",
            payload={
                "character_id": "oc_1",
                "updates": {
                    "internal_conflict": "new conflict",
                    "values": ["勇气", "诚实"],
                    "current_goal": "找到真相",
                },
            },
        )
        delivered = _drain(router)
        updated = [m for m in delivered if m.topic == "data.oc.updated"]
        assert len(updated) == 1
        assert updated[0].payload["character_id"] == "oc_1"
        assert "internal_conflict" in updated[0].payload["updates"]
        sheet = system.get_sheet("oc_1")
        assert sheet is not None
        assert sheet.internal_conflict == "new conflict"
        assert sheet.values == ["勇气", "诚实"]
        assert sheet.current_goal == "找到真相"

    def test_update_immutable_field_is_rejected(self, tmp_path: Path) -> None:
        system, router = _make_system(tmp_path)
        _publish(
            router,
            topic="control.oc.create",
            payload={
                "character_id": "oc_1",
                "name": "Alice",
                "archetype": "导师",
                "immutable_facts": ["name", "archetype"],
            },
        )
        _drain(router)
        original_sheet = system.get_sheet("oc_1")
        assert original_sheet is not None
        original_name = original_sheet.name
        original_archetype = original_sheet.archetype

        _publish(
            router,
            topic="control.oc.update",
            payload={
                "character_id": "oc_1",
                "updates": {"name": "Eve", "archetype": "反派"},
            },
        )
        delivered = _drain(router)
        rejected = [m for m in delivered if m.topic == "data.oc.update.rejected"]
        assert len(rejected) == 1
        assert rejected[0].payload["reason"] == "attempted to modify immutable_facts"
        violations = rejected[0].payload.get("violations", [])
        assert "name" in violations
        assert "archetype" in violations
        # No data.oc.updated should have been emitted.
        updated = [m for m in delivered if m.topic == "data.oc.updated"]
        assert updated == []
        # The sheet is unchanged.
        unchanged = system.get_sheet("oc_1")
        assert unchanged is not None
        assert unchanged.name == original_name
        assert unchanged.archetype == original_archetype

    def test_update_unknown_character_is_rejected(self, tmp_path: Path) -> None:
        system, router = _make_system(tmp_path)
        _publish(
            router,
            topic="control.oc.update",
            payload={"character_id": "ghost", "updates": {"internal_conflict": "x"}},
        )
        delivered = _drain(router)
        rejected = [m for m in delivered if m.topic == "data.oc.update.rejected"]
        assert len(rejected) == 1
        assert rejected[0].payload["reason"] == "character not found"
        assert system.get_sheet("ghost") is None


# ---------------------------------------------------------------------------
# check_world_fit
# ---------------------------------------------------------------------------


class TestCheckWorldFit:
    def test_no_world_contract_returns_empty_warnings(self, tmp_path: Path) -> None:
        system, _ = _make_system(tmp_path, world_contract=None)
        sheet = system.build_oc_sheet(character_id="c1")
        assert system.check_world_fit(sheet) == []

    def test_ancient_genre_flags_modern_skill(self, tmp_path: Path) -> None:
        wc = create_default_world_state(novel_id="t", genre="古代", tone="沉郁")
        system, _ = _make_system(tmp_path, world_contract=wc)
        # Force a modern skill into the sheet via skill_prior.
        sheet = system.build_oc_sheet(
            character_id="c1", skill_prior={"电脑使用": 1.0}
        )
        warnings = system.check_world_fit(sheet)
        assert any("电脑使用" in w for w in warnings)
        assert any("时代错位" in w for w in warnings)

    def test_scifi_genre_flags_missing_tech_skill(self, tmp_path: Path) -> None:
        wc = create_default_world_state(novel_id="t", genre="科幻", tone="冷峻")
        system, _ = _make_system(tmp_path, world_contract=wc)
        # Default COC skills do not include 电脑使用.
        sheet = system.build_oc_sheet(character_id="c1")
        warnings = system.check_world_fit(sheet)
        assert any("电脑使用" in w for w in warnings)

    def test_cthulhu_genre_flags_high_sanity(self, tmp_path: Path) -> None:
        wc = create_default_world_state(novel_id="t", genre="克苏鲁", tone="诡异")
        system, _ = _make_system(tmp_path, world_contract=wc)
        sheet = system.build_oc_sheet(character_id="c1")
        # build_oc_sheet sets sanity = min(pow*5, 99), which is always >= 75.
        assert sheet.sanity.current_sanity >= 50
        warnings = system.check_world_fit(sheet)
        assert any("克苏鲁" in w and "sanity" in w.lower() for w in warnings)

    def test_archetype_role_mismatch_is_flagged(self, tmp_path: Path) -> None:
        wc = create_default_world_state(novel_id="t", genre="文学", tone="沉郁")
        system, _ = _make_system(tmp_path, world_contract=wc)
        # 导师 normally maps to "supporting"; pairing it with protagonist is a mismatch.
        sheet = system.build_oc_sheet(
            character_id="c1", archetype="导师", role_in_story="protagonist"
        )
        warnings = system.check_world_fit(sheet)
        assert any("导师" in w and "protagonist" in w for w in warnings)

    def test_archetype_role_match_emits_no_mismatch_warning(self, tmp_path: Path) -> None:
        wc = create_default_world_state(novel_id="t", genre="文学", tone="沉郁")
        system, _ = _make_system(tmp_path, world_contract=wc)
        sheet = system.build_oc_sheet(
            character_id="c1", archetype="导师", role_in_story="supporting"
        )
        warnings = system.check_world_fit(sheet)
        # 文学 genre triggers none of the genre-specific checks; archetype matches.
        assert warnings == []


# ---------------------------------------------------------------------------
# Query interfaces
# ---------------------------------------------------------------------------


class TestQueryInterfaces:
    def test_get_sheet_returns_correct_oc(self, tmp_path: Path) -> None:
        system, _ = _make_system(tmp_path)
        sheet = system.build_oc_sheet(character_id="c1", name="Alice")
        system._sheets["c1"] = sheet
        assert system.get_sheet("c1") is sheet
        assert system.get_sheet("nonexistent") is None

    def test_query_by_archetype_filters_correctly(self, tmp_path: Path) -> None:
        system, _ = _make_system(tmp_path)
        a = system.build_oc_sheet(character_id="a", archetype="导师")
        b = system.build_oc_sheet(character_id="b", archetype="导师")
        c = system.build_oc_sheet(character_id="c", archetype="反派")
        system._sheets = {"a": a, "b": b, "c": c}
        result = system.query_by_archetype("导师")
        assert {s.character_id for s in result} == {"a", "b"}
        result_empty = system.query_by_archetype("主角")
        assert result_empty == []

    def test_query_by_relationship_filters_correctly(self, tmp_path: Path) -> None:
        system, _ = _make_system(tmp_path)
        a = system.build_oc_sheet(character_id="a")
        b = system.build_oc_sheet(character_id="b")
        c = system.build_oc_sheet(character_id="c")
        # a and b have a relationship to "target"; c does not.
        a.relationships["target"] = Relationship(
            target_id="target", target_name="T", type="ally"
        )
        b.relationships["target"] = Relationship(
            target_id="target", target_name="T", type="rival"
        )
        system._sheets = {"a": a, "b": b, "c": c}
        all_to_target = system.query_by_relationship("target")
        assert {s.character_id for s in all_to_target} == {"a", "b"}
        only_allies = system.query_by_relationship("target", relationship_type="ally")
        assert {s.character_id for s in only_allies} == {"a"}
        only_rivals = system.query_by_relationship("target", relationship_type="rival")
        assert {s.character_id for s in only_rivals} == {"b"}


# ---------------------------------------------------------------------------
# Persistence (oc_registry/{novel_id}.json)
# ---------------------------------------------------------------------------


class TestPersistence:
    def test_create_writes_registry_file(self, tmp_path: Path) -> None:
        system, router = _make_system(tmp_path, novel_id="my_novel")
        _publish(
            router,
            topic="control.oc.create",
            payload={"character_id": "oc_1", "name": "Alice"},
        )
        _drain(router)
        registry_path = tmp_path / "oc_registry" / "my_novel.json"
        assert registry_path.is_file()
        with open(registry_path, encoding="utf-8") as f:
            data = json.load(f)
        assert data["novel_id"] == "my_novel"
        assert "sheets" in data
        assert "oc_1" in data["sheets"]
        assert data["sheets"]["oc_1"]["name"] == "Alice"

    def test_reload_restores_all_ocs(self, tmp_path: Path) -> None:
        system1, router1 = _make_system(tmp_path, novel_id="persist_novel")
        _publish(
            router1,
            topic="control.oc.create",
            payload={"character_id": "oc_1", "name": "Alice", "archetype": "导师"},
        )
        _publish(
            router1,
            topic="control.oc.create",
            payload={"character_id": "oc_2", "name": "Bob", "archetype": "反派"},
        )
        _drain(router1)
        # Spin up a fresh system pointed at the same registry directory.
        system2, _ = _make_system(tmp_path, novel_id="persist_novel")
        oc1 = system2.get_sheet("oc_1")
        oc2 = system2.get_sheet("oc_2")
        assert oc1 is not None
        assert oc1.name == "Alice"
        assert oc1.archetype == "导师"
        assert oc2 is not None
        assert oc2.name == "Bob"
        assert oc2.archetype == "反派"
        # COC attributes survive the round-trip.
        assert set(oc1.coc_attributes.keys()) == set(COC_ATTRIBUTES)
        assert oc1.projection_ratio == 0.0


# ---------------------------------------------------------------------------
# data.memory.trace.query.result handler
# ---------------------------------------------------------------------------


class TestTraceResultsHandler:
    def test_trace_awards_improvement_marks_and_emits_evolved(self, tmp_path: Path) -> None:
        system, router = _make_system(tmp_path)
        _publish(
            router,
            topic="control.oc.create",
            payload={"character_id": "oc_1", "name": "Alice"},
        )
        _drain(router)
        _publish(
            router,
            topic="data.memory.trace.query.result",
            channel="data",
            payload={
                "traces": [
                    {"character_id": "oc_1", "skill": "观察", "id": "tr_1"},
                    {"character_id": "oc_1", "skill": "观察", "id": "tr_2"},
                    {"character_id": "ghost", "skill": "潜行", "id": "tr_3"},
                ]
            },
        )
        delivered = _drain(router)
        evolved = [m for m in delivered if m.topic == "data.oc.evolved"]
        # Two traces reference oc_1 → two evolved events.
        assert len(evolved) == 2
        sheet = system.get_sheet("oc_1")
        assert sheet is not None
        assert sheet.improvement_marks.get("观察") == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
