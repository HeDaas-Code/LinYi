"""Unit tests for ``COCMappingEngine`` (Task 3.6.1).

Covers SubTask 3.1.1–3.1.4 of the refactor-novelist-system-v1 spec:
subscriptions & module lifecycle, ``build_rulebook`` (5 genres + default
fallback), ``build_campaign_arc`` (5 stages, 3 scales, ending-intent-driven
climax intensity), ``build_chapter_scenario`` (required fields, key NPCs,
location, checks, event emission), and the ``control.coc.scenario.request``
bus handler.

The tests follow the actual ``coc_mapping_engine.py`` implementation
rather than the spec template, per the task's "key reminder". Notable
implementation details reflected here:

- ``build_rulebook`` dispatches via ``_match_genre`` to one of 5 genre
  builders (cthulhu/urban/ancient/scifi/magic) or a default fallback.
  Each builder accepts ``world_rules`` but the rulebook's distinctive
  skills are genre-specific.
- ``build_campaign_arc`` uses ``_SCALE_CHAPTERS`` (short=5, medium=12,
  long=24) and adjusts the climax stage so stage totals sum to
  ``total_chapters``.
- ``build_chapter_scenario`` returns a dict whose ``key_npcs`` is a
  ``list[OCCharacterSheet]`` (not dicts); the emitted
  ``control.sandbox.scenario.load`` payload serialises them to dicts.
- ``init`` reads ``novel_v2.coc_mapping_state_dir`` to override the
  default state directory.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.coc_mapping_engine import (
    COCMappingEngine,
    TOPIC_CONTROL_COC_SCENARIO_REQUEST,
    TOPIC_CONTROL_MODULE_INIT,
    TOPIC_CONTROL_SANDBOX_SCENARIO_LOAD,
    TOPIC_DATA_OC_EVOLVED,
    TOPIC_DATA_SANDBOX_WORLD_UPDATED,
)
from src.novelist_brain.llm import MockLLMService
from src.novelist_brain.models import (
    BusMessage,
    OCCharacterSheet,
    PlotCompass,
    StoryBible,
    WorldRule,
    WorldStateContract,
)
from src.novelist_brain.world_state import create_default_world_state


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_engine(
    tmp_path: Path,
    *,
    novel_id: str = "test_novel",
    register_router: bool = True,
) -> tuple[COCMappingEngine, BusRouter | None]:
    """Build a ``COCMappingEngine`` with state_dir isolated to ``tmp_path``.

    The default ``coc_mapping_state`` directory would leak into the real
    workspace; redirecting it to ``tmp_path`` keeps each test isolated.
    A real ``BusRouter`` is attached so ``_emit_safe`` can publish
    ``control.sandbox.scenario.load`` events.
    """
    engine = COCMappingEngine(novel_id=novel_id)
    state_dir = str(tmp_path / "coc_mapping_state")
    engine._state_dir = state_dir
    engine._state_path = os.path.join(state_dir, f"{novel_id}.json")
    router: BusRouter | None = None
    if register_router:
        router = BusRouter()
        engine.register(router)
    return engine, router


def _make_characters() -> list[OCCharacterSheet]:
    """Build a small registry: protagonist, antagonist, supporting."""
    return [
        OCCharacterSheet(
            character_id="c_protagonist",
            name="林逸",
            archetype="主角",
            role_in_story="protagonist",
        ),
        OCCharacterSheet(
            character_id="c_antagonist",
            name="阴影",
            archetype="反派",
            role_in_story="antagonist",
        ),
        OCCharacterSheet(
            character_id="c_supporting",
            name="老者",
            archetype="导师",
            role_in_story="supporting",
        ),
    ]


def _make_story_bible(
    *,
    novel_id: str = "test_novel",
    genre: str = "克苏鲁",
    scale: str = "medium",
    ending_intent: str = "温暖",
) -> StoryBible:
    """Build a real ``StoryBible`` with world contract, registry and compass."""
    wc = create_default_world_state(novel_id=novel_id, genre=genre, tone="阴郁")
    pc = PlotCompass(
        ending_intent=ending_intent,
        active_long_arcs=["主弧"],
        scale=scale,  # type: ignore[arg-type]
    )
    return StoryBible(
        novel_id=novel_id,
        title="测试小说",
        genre=genre,
        premise="一个测试用的故事",
        world_contract=wc,
        character_registry={c.character_id: c for c in _make_characters()},
        plot_compass=pc,
    )


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
# SubTask 3.1.2: build_rulebook — genre → Rulebook dispatch
# ---------------------------------------------------------------------------


class TestBuildRulebook:
    def test_build_rulebook_cthulhu_genre_includes_mythos_skills(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        rb = engine.build_rulebook("克苏鲁", [])
        assert "克苏鲁神话" in rb.skills
        assert "神秘学" in rb.skills
        # Cthulhu rulebook enables sanity; other genres disable it.
        assert rb.sanity.enabled is True
        # mythos-tagged skill exists with forbidden-knowledge flavour.
        mythos = rb.skills["克苏鲁神话"]
        assert "mythos" in mythos.tags

    def test_build_rulebook_urban_genre_includes_social_skills(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        rb = engine.build_rulebook("都市", [])
        assert "信誉" in rb.skills
        assert "街头智慧" in rb.skills
        # Urban reality rules disable sanity.
        assert rb.sanity.enabled is False

    def test_build_rulebook_ancient_genre_includes_martial_skills(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        rb = engine.build_rulebook("古代", [])
        assert "剑术" in rb.skills
        assert "拳脚" in rb.skills
        assert "轻功" in rb.skills

    def test_build_rulebook_scifi_genre_includes_tech_skills(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        rb = engine.build_rulebook("科幻", [])
        assert "电子学" in rb.skills
        assert "机械维修" in rb.skills
        assert "黑客" in rb.skills

    def test_build_rulebook_magic_genre_includes_magic_skills(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        rb = engine.build_rulebook("奇幻", [])
        assert "魔法" in rb.skills
        assert "法术辨识" in rb.skills
        assert "炼金术" in rb.skills

    def test_build_rulebook_unknown_genre_falls_back_to_default(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        rb = engine.build_rulebook("未识别题材XYZ", [])
        # Default rulebook name.
        assert rb.name == "通用规则书"
        # Default skills present.
        assert "观察" in rb.skills
        assert "格斗" in rb.skills
        # canonical genre reported as default.
        assert rb.metadata.get("canonical_genre") == "default"
        # Sanity disabled in default fallback.
        assert rb.sanity.enabled is False

    def test_build_rulebook_5_genres_skills_non_overlapping(
        self, tmp_path: Path
    ) -> None:
        """Each of the 5 genres contributes at least one distinctive skill.

        The genre rulebooks legitimately share utility skills (观察, 说服),
        so "non-overlapping" here means each genre brings at least one
        skill not present in any other genre's rulebook — i.e. the
        genre-specific flavour is real, not cosmetic.
        """
        engine, _ = _make_engine(tmp_path)
        genres = ["克苏鲁", "都市", "古代", "科幻", "奇幻"]
        skill_sets: dict[str, set[str]] = {}
        for g in genres:
            rb = engine.build_rulebook(g, [])
            skill_sets[g] = set(rb.skills.keys())
        for g in genres:
            others = set.union(*[s for k, s in skill_sets.items() if k != g])
            distinctive = skill_sets[g] - others
            assert distinctive, (
                f"genre {g} has no distinctive skill; "
                f"skill_set={skill_sets[g]}, others={others}"
            )

    def test_build_rulebook_injects_world_rules(self, tmp_path: Path) -> None:
        """``world_rules`` is accepted by ``build_rulebook`` and forwarded
        to the genre builder; the resulting rulebook carries the genre's
        canonical metadata so downstream consumers can trace provenance."""
        engine, _ = _make_engine(tmp_path)
        world_rules = [
            WorldRule(
                rule_id="r1",
                domain="physical",
                statement="测试规则",
                breakable=False,
                consequences=["后果"],
                introduced_in="test",
                status="active",
            ),
        ]
        rb = engine.build_rulebook("克苏鲁", world_rules)
        assert "克苏鲁神话" in rb.skills
        assert rb.metadata.get("source_genre") == "克苏鲁"
        assert rb.metadata.get("canonical_genre") == "cthulhu"
        # Sanity still enabled despite world_rules input.
        assert rb.sanity.enabled is True


# ---------------------------------------------------------------------------
# SubTask 3.1.3: build_campaign_arc — 5-stage template
# ---------------------------------------------------------------------------


class TestBuildCampaignArc:
    def test_build_campaign_arc_returns_5_stages(self, tmp_path: Path) -> None:
        engine, _ = _make_engine(tmp_path)
        pc = PlotCompass(scale="medium", ending_intent="温暖")
        arc = engine.build_campaign_arc(pc)
        stages = arc["stages"]
        assert len(stages) == 5
        phases = [s["phase"] for s in stages]
        assert phases == [
            "introduction",
            "rising_action",
            "turning_point",
            "climax",
            "falling_action",
        ]
        # Each stage carries the metadata fields the spec requires.
        for stage in stages:
            assert "name" in stage
            assert "target_chapters" in stage
            assert "intensity" in stage
            assert "summary" in stage

    def test_campaign_arc_short_scale_targets_5_chapters(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        pc = PlotCompass(scale="short", ending_intent="温暖")
        arc = engine.build_campaign_arc(pc)
        assert arc["total_chapters"] == 5
        assert arc["scale"] == "short"

    def test_campaign_arc_medium_scale_targets_12_chapters(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        pc = PlotCompass(scale="medium", ending_intent="温暖")
        arc = engine.build_campaign_arc(pc)
        assert arc["total_chapters"] == 12
        assert arc["scale"] == "medium"

    def test_campaign_arc_long_scale_targets_24_chapters(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        pc = PlotCompass(scale="long", ending_intent="温暖")
        arc = engine.build_campaign_arc(pc)
        assert arc["total_chapters"] == 24
        assert arc["scale"] == "long"

    def test_campaign_arc_stages_chapters_sum_to_total(
        self, tmp_path: Path
    ) -> None:
        """Rounding may cause drift; the engine patches the climax stage so
        the per-stage chapter counts sum exactly to ``total_chapters``."""
        engine, _ = _make_engine(tmp_path)
        for scale in ("short", "medium", "long"):
            pc = PlotCompass(scale=scale, ending_intent="温暖")
            arc = engine.build_campaign_arc(pc)
            total = arc["total_chapters"]
            allocated = sum(s["target_chapters"] for s in arc["stages"])
            assert allocated == total, (
                f"scale={scale}: allocated {allocated} != total {total}"
            )

    def test_campaign_arc_ending_intent_affects_climax_intensity(
        self, tmp_path: Path
    ) -> None:
        """``ending_intent`` keywords drive ``climax_intensity``:
        bitter > ambiguous > happy."""
        engine, _ = _make_engine(tmp_path)
        bitter = engine.build_campaign_arc(
            PlotCompass(ending_intent="悲剧")
        )["climax_intensity"]
        happy = engine.build_campaign_arc(
            PlotCompass(ending_intent="温暖")
        )["climax_intensity"]
        ambiguous = engine.build_campaign_arc(
            PlotCompass(ending_intent="开放")
        )["climax_intensity"]
        assert bitter > happy
        assert ambiguous > happy
        assert bitter > ambiguous
        # All three are distinct values.
        assert len({bitter, happy, ambiguous}) == 3


# ---------------------------------------------------------------------------
# SubTask 3.1.4: build_chapter_scenario
# ---------------------------------------------------------------------------


class TestBuildChapterScenario:
    def test_build_chapter_scenario_returns_required_fields(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        wc = create_default_world_state(novel_id="t", genre="克苏鲁", tone="阴郁")
        cr = _make_characters()
        arc = engine.build_campaign_arc(
            PlotCompass(scale="medium", ending_intent="温暖")
        )
        scenario = engine.build_chapter_scenario(
            chapter_index=1,
            campaign_arc=arc,
            world_contract=wc,
            character_registry=cr,
        )
        for field in (
            "scenario_id",
            "chapter_index",
            "campaign_phase",
            "objective",
            "key_npcs",
            "location",
            "conflict",
            "possible_checks",
        ):
            assert field in scenario, f"missing field: {field}"
        assert scenario["chapter_index"] == 1
        # campaign_phase is one of the 5 canonical stages.
        assert scenario["campaign_phase"] in {
            "introduction",
            "rising_action",
            "turning_point",
            "climax",
            "falling_action",
        }

    def test_chapter_scenario_key_npcs_within_2_to_5(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        wc = create_default_world_state(novel_id="t", genre="克苏鲁", tone="阴郁")
        cr = _make_characters()
        arc = engine.build_campaign_arc(
            PlotCompass(scale="medium", ending_intent="温暖")
        )
        scenario = engine.build_chapter_scenario(
            chapter_index=1,
            campaign_arc=arc,
            world_contract=wc,
            character_registry=cr,
        )
        # 3 characters provided → all 3 selected (within [2, 5]).
        assert 2 <= len(scenario["key_npcs"]) <= 5
        # key_npcs are OCCharacterSheet instances (not dicts) per the
        # implementation's in-memory representation.
        for npc in scenario["key_npcs"]:
            assert isinstance(npc, OCCharacterSheet)

    def test_chapter_scenario_location_from_world_contract_geography(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        wc = create_default_world_state(novel_id="t", genre="克苏鲁", tone="阴郁")
        # default world state seeds 'anchor_place' into geography.
        assert "anchor_place" in wc.geography
        cr = _make_characters()
        arc = engine.build_campaign_arc(
            PlotCompass(scale="medium", ending_intent="温暖")
        )
        scenario = engine.build_chapter_scenario(
            chapter_index=1,
            campaign_arc=arc,
            world_contract=wc,
            character_registry=cr,
        )
        location = scenario["location"]
        assert isinstance(location, dict)
        assert "name" in location
        # location name should come from world_contract.geography keys.
        assert location["name"] in wc.geography

    def test_chapter_scenario_possible_checks_non_empty(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        wc = create_default_world_state(novel_id="t", genre="克苏鲁", tone="阴郁")
        cr = _make_characters()
        arc = engine.build_campaign_arc(
            PlotCompass(scale="medium", ending_intent="温暖")
        )
        scenario = engine.build_chapter_scenario(
            chapter_index=1,
            campaign_arc=arc,
            world_contract=wc,
            character_registry=cr,
        )
        checks = scenario["possible_checks"]
        assert isinstance(checks, list)
        assert len(checks) >= 1
        # Each check should describe a skill check.
        for check in checks:
            assert "skill" in check

    def test_chapter_scenario_emits_control_sandbox_scenario_load(
        self, tmp_path: Path
    ) -> None:
        engine, router = _make_engine(tmp_path)
        assert router is not None
        wc = create_default_world_state(novel_id="t", genre="克苏鲁", tone="阴郁")
        cr = _make_characters()
        arc = engine.build_campaign_arc(
            PlotCompass(scale="medium", ending_intent="温暖")
        )
        engine.build_chapter_scenario(
            chapter_index=1,
            campaign_arc=arc,
            world_contract=wc,
            character_registry=cr,
        )
        delivered = _drain(router)
        load_events = [
            m for m in delivered if m.topic == TOPIC_CONTROL_SANDBOX_SCENARIO_LOAD
        ]
        assert len(load_events) >= 1
        payload = load_events[0].payload
        assert isinstance(payload, dict)
        assert "scenario_id" in payload
        assert "chapter_index" in payload
        assert payload["chapter_index"] == 1
        # Emitted payload serialises key_npcs to dicts (JSON-safe).
        assert isinstance(payload["key_npcs"], list)
        for npc in payload["key_npcs"]:
            assert isinstance(npc, dict)


# ---------------------------------------------------------------------------
# SubTask 3.1.1: module lifecycle — subscriptions, init, persistence
# ---------------------------------------------------------------------------


class TestModuleLifecycle:
    def test_coc_mapping_engine_subscribes_to_required_topics(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path)
        required = {
            TOPIC_CONTROL_MODULE_INIT,
            TOPIC_DATA_SANDBOX_WORLD_UPDATED,
            TOPIC_DATA_OC_EVOLVED,
            TOPIC_CONTROL_COC_SCENARIO_REQUEST,
        }
        assert required.issubset(set(engine.subscriptions))

    def test_init_reads_story_bible_world_contract_character_registry_from_context(
        self, tmp_path: Path
    ) -> None:
        engine, _ = _make_engine(tmp_path, novel_id="init_test")
        sb = _make_story_bible(novel_id="init_test", genre="克苏鲁")
        wc = sb.world_contract
        assert wc is not None
        cr = _make_characters()
        engine.init(
            {
                "novel_v2": {"novel_id": "init_test"},
                "story_bible": sb,
                "world_contract": wc,
                "character_registry": cr,
                "llm": MockLLMService(seed=42),
            }
        )
        # Truth sources are read directly from context.
        assert engine._story_bible is sb
        assert engine._world_contract is wc
        assert engine._character_registry == cr
        # Genre was inferred → rulebook built.
        assert engine._rulebook is not None
        assert "克苏鲁神话" in engine._rulebook.skills
        assert engine._state.custom.get("rulebook_built") is True
        # plot_compass present → campaign arc built.
        assert engine._campaign_arc is not None
        assert engine._campaign_arc["total_chapters"] == 12  # medium default
        assert engine._state.custom.get("campaign_arc_built") is True

    def test_to_dict_from_dict_round_trip(self, tmp_path: Path) -> None:
        engine, _ = _make_engine(tmp_path, novel_id="rt_novel")
        sb = _make_story_bible(novel_id="rt_novel", genre="克苏鲁")
        wc = sb.world_contract
        assert wc is not None
        cr = _make_characters()
        engine.init(
            {
                "novel_v2": {"novel_id": "rt_novel"},
                "story_bible": sb,
                "world_contract": wc,
                "character_registry": cr,
                "llm": MockLLMService(seed=42),
            }
        )
        # Populate _scenarios with a built chapter scenario.
        engine.build_chapter_scenario(
            chapter_index=1,
            world_contract=wc,
            character_registry=cr,
        )
        snapshot = engine.to_dict()

        # Restore into a fresh engine.
        engine2, _ = _make_engine(tmp_path, novel_id="rt_novel")
        engine2.from_dict(snapshot)
        assert engine2._novel_id == engine._novel_id
        # Story bible / world contract / rulebook / campaign arc restored.
        assert engine2._story_bible is not None
        assert engine2._story_bible.novel_id == sb.novel_id
        assert engine2._world_contract is not None
        assert engine2._world_contract.novel_id == wc.novel_id
        assert engine2._rulebook is not None
        assert "克苏鲁神话" in engine2._rulebook.skills
        assert engine2._campaign_arc is not None
        assert (
            engine2._campaign_arc["total_chapters"]
            == engine._campaign_arc["total_chapters"]
        )
        # Scenarios preserved; key_npcs deserialised back to OCCharacterSheet.
        assert 1 in engine2._scenarios
        npcs = engine2._scenarios[1]["key_npcs"]
        assert all(isinstance(n, OCCharacterSheet) for n in npcs)

    def test_persist_state_to_coc_mapping_state_novel_id_json(
        self, tmp_path: Path
    ) -> None:
        novel_id = "persist_test"
        engine, _ = _make_engine(tmp_path, novel_id=novel_id)
        sb = _make_story_bible(novel_id=novel_id, genre="克苏鲁")
        engine.init(
            {
                "novel_v2": {"novel_id": novel_id},
                "story_bible": sb,
                "character_registry": _make_characters(),
                "llm": MockLLMService(seed=42),
            }
        )
        # State file should exist at {state_dir}/{novel_id}.json.
        state_file = tmp_path / "coc_mapping_state" / f"{novel_id}.json"
        assert state_file.is_file()
        with open(state_file, encoding="utf-8") as f:
            data = json.load(f)
        assert data["novel_id"] == novel_id
        assert data["rulebook"] is not None
        assert data["campaign_arc"] is not None
        # Story bible round-tripped through JSON.
        assert data["story_bible"] is not None
        assert data["story_bible"]["novel_id"] == novel_id

    def test_handle_scenario_request_triggers_build_chapter_scenario(
        self, tmp_path: Path
    ) -> None:
        engine, router = _make_engine(tmp_path, novel_id="req_novel")
        assert router is not None
        sb = _make_story_bible(novel_id="req_novel", genre="克苏鲁")
        engine.init(
            {
                "novel_v2": {"novel_id": "req_novel"},
                "story_bible": sb,
                "character_registry": _make_characters(),
                "llm": MockLLMService(seed=42),
            }
        )
        # init builds campaign_arc from plot_compass.
        assert engine._campaign_arc is not None
        initial_count = len(engine._scenarios)
        _publish(
            router,
            topic=TOPIC_CONTROL_COC_SCENARIO_REQUEST,
            payload={"chapter_index": 2},
        )
        delivered = _drain(router)
        # Scenario was built for chapter 2.
        assert 2 in engine._scenarios
        assert len(engine._scenarios) == initial_count + 1
        scenario = engine._scenarios[2]
        assert scenario["chapter_index"] == 2
        assert "scenario_id" in scenario
        # The sandbox load event was emitted as a side effect.
        load_events = [
            m for m in delivered if m.topic == TOPIC_CONTROL_SANDBOX_SCENARIO_LOAD
        ]
        assert len(load_events) >= 1
        assert load_events[0].payload["chapter_index"] == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
