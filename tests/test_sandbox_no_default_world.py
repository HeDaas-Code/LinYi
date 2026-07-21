"""Tests verifying MentalSandbox no longer creates ``WorldModel(name="default")``.

Task 1.10.4 (refactor-novelist-system-v1): the v2 startup path driven by
``WorldStateContract`` / ``StoryBible`` must not fall back to the hardcoded
default ``WorldModel``. Only when neither v2 ``world_contract`` nor v1
``sandbox.world`` is supplied may the sandbox emit ``DeprecationWarning`` and
build the legacy default world.
"""

from __future__ import annotations

import warnings

import pytest

from main import build_context
from src.novelist_brain.bus import BusRouter
from src.novelist_brain.llm import MockLLMService
from src.novelist_brain.models import (
    LuckPool,
    OCCharacterSheet,
    SanitySystem,
    StoryBible,
    WorldRule,
    WorldStateContract,
)
from src.novelist_brain.sandbox import MentalSandbox
from src.novelist_brain.trpg import TRPGCharacterSheet


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_sandbox() -> tuple[MentalSandbox, BusRouter]:
    """Build a fresh sandbox + router pair (registered) for one test."""
    router = BusRouter()
    sandbox = MentalSandbox(
        name="test_sandbox",
        llm_service=MockLLMService(seed=42),
        min_rounds=1,
        max_rounds=3,
    )
    sandbox.register(router)
    return sandbox, router


def _make_contract(novel_id: str = "test_v2") -> WorldStateContract:
    """Build a non-empty WorldStateContract for v2 path tests.

    ``activation_level`` is numeric so ``_create_scene_from_contract`` can
    run ``float(...)`` on it without raising.
    """
    return WorldStateContract(
        novel_id=novel_id,
        genre="严肃文学",
        tone="忧郁",
        geography={
            "test_location_v2": {
                "name": "测试地点",
                "description": "v2 契约提供的地点。",
                "activation_level": 0.8,
                "mood": "忧郁",
            },
        },
        factions={},
        rules=[
            WorldRule(
                rule_id="rule_v2_1",
                domain="physical",
                statement="v2 物理规则",
                breakable=False,
                consequences=["叙事一致性崩坏"],
                introduced_in="test",
                status="active",
            ),
        ],
        history=[],
        forbidden=[],
        mysteries=[],
        current_state={"time": "黄昏", "weather": "雨"},
        version=1,
    )


# ---------------------------------------------------------------------------
# Test 1: v2 path does not create default WorldModel
# ---------------------------------------------------------------------------


def test_v2_path_does_not_create_default_world_model() -> None:
    sandbox, _ = _make_sandbox()
    contract = _make_contract(novel_id="test_v2")
    context = {"world_contract": contract, "sandbox": {"seed": 42}}

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        sandbox.init(context)

    assert sandbox._world_model is not None
    assert sandbox._world_model.name != "default"
    assert sandbox._world_model.name == "test_v2"
    assert sandbox._world_contract is contract

    deprecation_warnings = [
        w for w in caught if issubclass(w.category, DeprecationWarning)
    ]
    assert deprecation_warnings == []


# ---------------------------------------------------------------------------
# Test 2: v1 path with explicit world data does not create default
# ---------------------------------------------------------------------------


def test_v1_path_with_world_data_does_not_create_default() -> None:
    sandbox, _ = _make_sandbox()
    context = {
        "sandbox": {
            "seed": 42,
            "world": {
                "name": "custom_v1_world",
                "ontology": {
                    "genre": "测试",
                    "tone": "中性",
                    "setting": "测试场景",
                },
                "rules": ["测试规则"],
                "current_state": {"time": "白天", "mood": "平静"},
            },
        }
    }

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        sandbox.init(context)

    assert sandbox._world_model is not None
    assert sandbox._world_model.name == "custom_v1_world"
    assert sandbox._world_model.name != "default"
    assert sandbox._world_contract is None

    deprecation_warnings = [
        w for w in caught if issubclass(w.category, DeprecationWarning)
    ]
    assert deprecation_warnings == []


# ---------------------------------------------------------------------------
# Test 3: Neither v2 nor v1 → fallback + DeprecationWarning
# ---------------------------------------------------------------------------


def test_no_v2_no_v1_falls_back_with_deprecation_warning() -> None:
    sandbox, _ = _make_sandbox()
    # No world_contract, no sandbox.world → must fall back.
    context = {"sandbox": {"seed": 42}}

    with pytest.warns(DeprecationWarning):
        sandbox.init(context)

    assert sandbox._world_model is not None
    assert sandbox._world_model.name == "default"
    assert sandbox._world_contract is None


# ---------------------------------------------------------------------------
# Test 4: v2 path → _create_default_scene routes through contract geography
# ---------------------------------------------------------------------------


def test_v2_path_creates_scene_from_contract_geography() -> None:
    sandbox, _ = _make_sandbox()
    contract = _make_contract(novel_id="test_v2_scene")
    context = {"world_contract": contract, "sandbox": {"seed": 42}}
    sandbox.init(context)

    # After init, _world_contract is set, so _create_default_scene must
    # dispatch to _create_scene_from_contract and pick a setting from
    # contract.geography (not the hardcoded "黎明中无名的城市").
    scene = sandbox._create_default_scene()

    assert scene.setting in contract.geography.keys()
    assert scene.setting == "test_location_v2"
    assert scene.setting != "黎明中无名的城市"


# ---------------------------------------------------------------------------
# Test 5: v2 path → _rebuild_character_sheets uses OC registry
# ---------------------------------------------------------------------------


def test_v2_path_rebuilds_character_sheets_from_oc() -> None:
    sandbox, _ = _make_sandbox()
    contract = _make_contract(novel_id="test_v2_oc")

    oc_sheet = OCCharacterSheet(
        character_id="oc_protagonist",
        name="林逸",
        archetype="主角",
        coc_attributes={"str": 13, "con": 14, "dex": 15},
        coc_skills={"闪避": 55.0, "图书馆": 70.0},
        sanity=SanitySystem(current_sanity=60.0, max_sanity=99.0),
        luck=LuckPool(current=55, max=99),
        hit_points=14.0,
        magic_points=11.0,
        projection_ratio=0.0,
    )
    story_bible = StoryBible(
        novel_id="test_v2_oc",
        character_registry={"oc_protagonist": oc_sheet},
    )

    context = {
        "world_contract": contract,
        "story_bible": story_bible,
        "sandbox": {"seed": 42},
    }
    sandbox.init(context)

    # A TRPGCharacterSheet must be built from the OC, keyed by the OC's
    # character_id, with attributes / skills / hp / mp mirroring the OC's
    # COC card (not re-rolled from the projection).
    assert "oc_protagonist" in sandbox._character_sheets
    sheet = sandbox._character_sheets["oc_protagonist"]
    assert isinstance(sheet, TRPGCharacterSheet)
    assert sheet.character_id == "oc_protagonist"
    assert sheet.name == "林逸"
    assert sheet.attributes == {"str": 13, "con": 14, "dex": 15}
    assert sheet.skills == {"闪避": 55.0, "图书馆": 70.0}
    assert sheet.hit_points == 14.0
    assert sheet.magic_points == 11.0

    # Sanity should be propagated from the OC as well.
    assert sheet.sanity.current_sanity == 60.0
    assert sheet.sanity.max_sanity == 99.0


# ---------------------------------------------------------------------------
# Test 6: v2 takes precedence over v1 world data
# ---------------------------------------------------------------------------


def test_v2_path_takes_precedence_over_v1_world_data() -> None:
    sandbox, _ = _make_sandbox()
    contract = _make_contract(novel_id="v2_wins")
    context = {
        "world_contract": contract,
        "sandbox": {
            "seed": 42,
            "world": {
                "name": "v1_loser_world",
                "ontology": {"genre": "v1", "tone": "v1"},
            },
        },
    }

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        sandbox.init(context)

    # v2 contract should win: name == contract.novel_id, not "v1_loser_world".
    assert sandbox._world_model is not None
    assert sandbox._world_model.name == "v2_wins"
    assert sandbox._world_model.name != "default"
    assert sandbox._world_contract is contract

    deprecation_warnings = [
        w for w in caught if issubclass(w.category, DeprecationWarning)
    ]
    assert deprecation_warnings == []


# ---------------------------------------------------------------------------
# Test 7: build_context includes novel_v2 with default novel_id
# ---------------------------------------------------------------------------


def test_build_context_includes_novel_v2_with_default_id() -> None:
    router = BusRouter()
    llm = MockLLMService(seed=42)

    # build_context only stores the clock in the context dict; a bare stub
    # is sufficient and avoids spinning up the real RealTimeClock.
    class _StubClock:
        pass

    context = build_context(
        router=router,
        clock=_StubClock(),
        llm_service=llm,
    )

    # The v2 novel source layer config must be present with the default
    # novel_id used by run_agent when no novel_v2 config exists.
    assert "novel_v2" in context
    novel_v2 = context["novel_v2"]
    assert novel_v2["novel_id"] == "linyi_default"
    assert "world_state_dir" in novel_v2
    assert "story_bible_dir" in novel_v2
    assert "chapter_dir" in novel_v2
    assert "oc_registry_dir" in novel_v2

    # build_context also injects the legacy sandbox.world; the v2 contract
    # (when later added by run_agent) takes precedence over it.
    assert "world" in context["sandbox"]


# ---------------------------------------------------------------------------
# Test 8: build_context + injected world_contract skips default world
# (mirrors run_agent's non-legacy startup path)
# ---------------------------------------------------------------------------


def test_build_context_with_v2_contract_skips_default_world() -> None:
    router = BusRouter()
    llm = MockLLMService(seed=42)

    class _StubClock:
        pass

    context = build_context(
        router=router,
        clock=_StubClock(),
        llm_service=llm,
    )

    # Simulate run_agent's non-legacy path: load_or_create_world_state
    # returns a contract, which run_agent injects into context.
    contract = _make_contract(novel_id="linyi_default")
    context["world_contract"] = contract

    sandbox = MentalSandbox(
        name="mental_sandbox",
        llm_service=llm,
        min_rounds=1,
        max_rounds=3,
    )
    sandbox.register(router)

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        sandbox.init(context)

    # The v2 path must win even though build_context also injected
    # sandbox.world (the v1 data). The resulting world model carries the
    # contract's novel_id, not "default" and not the v1 "脑中世界".
    assert sandbox._world_model is not None
    assert sandbox._world_model.name == "linyi_default"
    assert sandbox._world_model.name != "default"
    assert sandbox._world_contract is contract

    deprecation_warnings = [
        w for w in caught if issubclass(w.category, DeprecationWarning)
    ]
    assert deprecation_warnings == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
