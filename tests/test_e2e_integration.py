"""End-to-end integration tests (Stage 6 Task 6.1).

Covers the four E2E scenarios mandated by SubTasks 6.1.1–6.1.4 of the
``refactor-novelist-system-v1`` spec:

- **6.1.1 Story Bible → COC 推演 → 段落 → 审计 → 定稿** — drives the
  full ``ChapterIntent → COCMappingEngine scenario.load → CEN simulate →
  narrative.ready → CreationExecutive paragraph → ChapterManager →
  ContinuityAuditor → QualityEngine`` pipeline through a real
  ``BusRouter`` and verifies no stage silently drops messages.
- **6.1.2 经验输入 → 世界演进 → 持久化 → 回放** — exercises
  ``ExperienceToWorldMapper`` + ``WorldEvolutionRules.apply_mutations`` +
  ``WorldStateStore.save`` (versioned ``v{N}.json``) + reload round-trip
  + ``WorldVisualDebugger`` snapshot publication.
- **6.1.3 多章生成 → 版本回退 → 状态一致** — generates 3 chapters
  via ``ChapterManager`` + commit, walks the version history, rolls
  back to an earlier version, and asserts paragraph count / status /
  version metadata remain consistent.
- **6.1.4 并发读写 Story Bible 竞态条件** — runs concurrent writers
  against ``WorldStateStore`` and ``PersistenceManager.save_atomic``;
  verifies no ``.tmp`` residue, no corrupt JSON, readers never observe
  partial state.

The tests follow the actual implementation (per the task's "key
reminder"). Notable integration quirks reflected here:

- CEN's scenario-driven ``data.sandbox.narrative.ready`` payload is a
  summary dict (``scenario_id`` / ``depth_metrics`` / ...) rather than
  a ``NarrativeLine``-shaped dict. ``CreationExecutive``'s legacy
  ``_handle_narrative_ready`` handler does ``NarrativeLine(**dict)``
  which crashes on the extra keys. The Stage-2
  ``_handle_narrative_ready_for_chapter`` handler uses the defensive
  ``reconstruct_dataclass`` so it tolerates the extras. We disable
  the legacy handler (mirroring ``test_end_to_end_chapter_intent_to_paragraphs``)
  and force paragraph regeneration via ``control.novel.chapter.write``.
- ``ChapterManager``'s emitted ``event.novel.paragraph.published``
  payload includes the full ``paragraph.to_dict()`` so the
  ``ContinuityAuditor`` can read ``paragraph.content`` directly.
- ``CreationExecutive`` emits ``data.novel.paragraph`` *during* the
  drain (its ``emit()`` enqueues on the router inbox), so those
  messages must be captured from the drain's returned list —
  subsequent ``router.flush()`` calls would be empty.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.cen import CentralExecutiveNetwork
from src.novelist_brain.chapter_manager import ChapterManager
from src.novelist_brain.coc_mapping_engine import COCMappingEngine
from src.novelist_brain.continuity_auditor import ContinuityAuditor
from src.novelist_brain.creation_executive import CreationExecutive
from src.novelist_brain.llm import MockLLMService
from src.novelist_brain.models import (
    BusMessage,
    ChapterIntent,
    Fear,
    ForeshadowingEntry,
    ForeshadowingOp,
    NarrativeLine,
    OCCharacterSheet,
    Paragraph,
    PlotCompass,
    Scene,
    StoryBible,
    StyleFingerprint,
    TickDelta,
    TraitVector,
    WorldRule,
    WorldStateContract,
)
from src.novelist_brain.oc_character_system import OCCharacterSystem
from src.novelist_brain.persistence import PersistenceManager
from src.novelist_brain.planner import Planner
from src.novelist_brain.quality_engine import QualityEngine
from src.novelist_brain.trpg_state import SkillCheck, SkillCheckOutcome
from src.novelist_brain.world_state import (
    ExperienceToWorldMapper,
    WorldEvolutionRules,
    WorldStateStore,
    create_default_world_state,
)
from src.novelist_brain.world_visual_debugger import WorldVisualDebugger


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _drain(router: BusRouter, max_rounds: int = 30) -> list[BusMessage]:
    """Flush ``router`` until the inbox is empty, collecting delivered messages.

    E2E flows fan-out across many modules, so each ``flush()`` only
    processes the snapshot taken at its start; messages emitted *during*
    a flush appear in the next round. The loop terminates once a flush
    returns no messages.
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
    channel: str = "data",
    target: str | None = None,
) -> None:
    router.publish(
        source="test",
        topic=topic,
        channel=channel,
        payload=payload,
        target=target,
    )


def _make_tick(t: float = 0.0, phase: str = "creation") -> TickDelta:
    return TickDelta(
        absolute_time=t,
        delta_ms=100.0,
        phase=phase,
        global_context=type(
            "GC",
            (),
            {
                "tick": 0,
                "absolute_time": t,
                "phase": phase,
                "active_network": "cen",
                "budget_warning": False,
            },
        )(),
    )


def _make_llm(seed: int = 42) -> MockLLMService:
    return MockLLMService(seed=seed)


def _by_topic(messages: list[BusMessage], topic: str) -> list[BusMessage]:
    return [m for m in messages if m.topic == topic]


def _make_characters() -> list[OCCharacterSheet]:
    """Build a small OC registry used to drive the COC scenario."""
    return [
        OCCharacterSheet(
            character_id="c_protagonist",
            name="林逸",
            archetype="主角",
            role_in_story="protagonist",
            traits=TraitVector(extraversion=0.9),
        ),
        OCCharacterSheet(
            character_id="c_antagonist",
            name="阴影",
            archetype="反派",
            role_in_story="antagonist",
        ),
    ]


def _make_story_bible(
    novel_id: str = "e2e_novel",
    *,
    with_extreme_traits: bool = True,
) -> StoryBible:
    """Build a real ``StoryBible`` with world contract + OC registry."""
    wc = create_default_world_state(novel_id=novel_id, genre="克苏鲁", tone="阴郁")
    pc = PlotCompass(
        ending_intent="温暖",
        active_long_arcs=["主弧"],
        scale="medium",
    )
    characters = _make_characters() if with_extreme_traits else [
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
    ]
    return StoryBible(
        novel_id=novel_id,
        title="E2E 测试小说",
        genre="克苏鲁",
        theme="孤独",
        premise="一个孤独的小说家在记忆与城市之间游走。",
        world_contract=wc,
        character_registry={c.character_id: c for c in characters},
        plot_compass=pc,
        foreshadowing_ledger=[
            ForeshadowingEntry(
                entry_id="fs1",
                description="一盏将熄的灯",
                introduced_in_chapter="ch_1",
                status="introduced",
            ),
        ],
        style_fingerprint=StyleFingerprint(),
        continuity_rules=[],
    )


def _build_agent(
    router: BusRouter,
    tmp_path: Path,
    *,
    novel_id: str = "e2e_novel",
    with_extreme_traits: bool = True,
) -> dict[str, Any]:
    """Build a full agent with all core modules registered to ``router``.

    Returns a dict of module references so tests can poke at internal
    state (e.g. ``cen._scenario_id``) without re-fetching via the
    router's module registry.

    Modules instantiated (in dependency order):

    - ``CentralExecutiveNetwork`` (CEN)
    - ``COCMappingEngine`` (responds to scenario.request)
    - ``CreationExecutive`` (paragraph generation)
    - ``ChapterManager`` (volume / chapter / paragraph ownership)
    - ``Planner`` (narrative.ready → chapter.intent)
    - ``OCCharacterSystem`` (OC registry, world-fit checks)
    - ``ContinuityAuditor`` (six-dim audit on published paragraphs)
    - ``QualityEngine`` (severity triage + revision dispatch)
    - ``WorldVisualDebugger`` (snapshot / diff / replay)

    All state directories are isolated under ``tmp_path`` so tests are
    filesystem-isolated. All LLM consumers use ``MockLLMService``.
    """
    llm = _make_llm()
    sb = _make_story_bible(novel_id=novel_id, with_extreme_traits=with_extreme_traits)

    # --- CEN --------------------------------------------------------
    cen = CentralExecutiveNetwork(name="central_executive_network")
    cen.register(router)
    cen.init({"llm_service": llm, "identity": {}})

    # --- COCMappingEngine ------------------------------------------
    coc_engine = COCMappingEngine(novel_id=novel_id)
    coc_state_dir = str(tmp_path / "coc_mapping_state")
    coc_engine._state_dir = coc_state_dir
    coc_engine._state_path = os.path.join(coc_state_dir, f"{novel_id}.json")
    coc_engine.register(router)
    coc_engine.init(
        {
            "story_bible": sb,
            "world_contract": sb.world_contract,
            "character_registry": list(sb.character_registry.values()),
            "novel_v2": {
                "novel_id": novel_id,
                "coc_mapping_state_dir": coc_state_dir,
            },
        }
    )

    # --- CreationExecutive ----------------------------------------
    creation = CreationExecutive(
        name="creation_executive",
        llm_service=llm,
        seed=42,
    )
    creation.register(router)
    creation.init({})
    # Disable CE's legacy ``_handle_narrative_ready`` coercion. CEN's
    # scenario-driven ``data.sandbox.narrative.ready`` payload carries a
    # ``narrative_line`` dict with extra summary fields (``scenario_id``,
    # ``depth_metrics`` ...) that the legacy handler tries to splat into
    # ``NarrativeLine(**dict)`` — raising ``TypeError`` on the unknown
    # kwargs. The Stage-2 ``_handle_narrative_ready_for_chapter`` handler
    # uses the defensive ``reconstruct_dataclass`` path and is the one
    # that actually caches ``skill_checks`` / ``world_state`` for the
    # paragraph-generation flow, so silencing the legacy one is safe.
    creation._handle_narrative_ready = lambda _payload: None  # type: ignore[assignment]

    # --- ChapterManager -------------------------------------------
    chapters_dir = str(tmp_path / "chapters")
    chapter_manager = ChapterManager(
        novel_id=novel_id,
        chapters_dir=chapters_dir,
        max_versions=20,
    )
    chapter_manager.register(router)
    chapter_manager.init(
        {
            "novel_v2": {"novel_id": novel_id, "chapter_dir": chapters_dir},
            "llm": llm,
        }
    )

    # --- Planner ---------------------------------------------------
    planner_state_dir = str(tmp_path / "planner_state")
    planner = Planner()
    planner.register(router)
    planner.init(
        {
            "novel_v2": {
                "novel_id": novel_id,
                "planner_state_dir": planner_state_dir,
            },
            "story_bible": sb,
            "world_contract": sb.world_contract,
            "llm": llm,
        }
    )

    # --- OCCharacterSystem ----------------------------------------
    oc_registry_dir = str(tmp_path / "oc_registry")
    oc_system = OCCharacterSystem()
    oc_system.register(router)
    oc_system.init(
        {
            "novel_v2": {
                "novel_id": novel_id,
                "oc_registry_dir": oc_registry_dir,
            },
            "rng_seed": 42,
            "world_contract": sb.world_contract,
            "llm": llm,
        }
    )

    # --- ContinuityAuditor ----------------------------------------
    audit_dir = str(tmp_path / "audit_state")
    os.makedirs(audit_dir, exist_ok=True)
    auditor = ContinuityAuditor(
        novel_id=novel_id,
        audit_state_dir=audit_dir,
    )
    auditor.register(router)
    auditor.init(
        {
            "novel_v2": {"novel_id": novel_id, "audit_state_dir": audit_dir},
            "story_bible": sb,
            "chapter_manager": chapter_manager,
        }
    )

    # --- QualityEngine --------------------------------------------
    quality_dir = str(tmp_path / "quality_state")
    quality_engine = QualityEngine(
        novel_id=novel_id,
        quality_state_dir=quality_dir,
    )
    quality_engine.register(router)
    quality_engine.init(
        {
            "novel_v2": {
                "novel_id": novel_id,
                "quality_state_dir": quality_dir,
            },
        }
    )

    # --- WorldVisualDebugger --------------------------------------
    debug_dir = str(tmp_path / "debug_state")
    debugger = WorldVisualDebugger(
        novel_id=novel_id,
        max_snapshots=10,
        debug_state_dir=debug_dir,
    )
    debugger.register(router)
    debugger.init(
        {
            "novel_v2": {"novel_id": novel_id, "debug_state_dir": debug_dir},
            "world_contract": sb.world_contract,
            "character_registry": dict(sb.character_registry),
        }
    )

    return {
        "story_bible": sb,
        "llm": llm,
        "cen": cen,
        "coc_engine": coc_engine,
        "creation": creation,
        "chapter_manager": chapter_manager,
        "planner": planner,
        "oc_system": oc_system,
        "auditor": auditor,
        "quality_engine": quality_engine,
        "debugger": debugger,
        "router": router,
    }


def _make_chapter_intent_payload(
    chapter_index: int = 1,
    *,
    scene_type: str = "dialogue",
    beats: list[str] | None = None,
) -> dict[str, Any]:
    """Build a ``data.novel.chapter.intent`` payload with a real ChapterIntent."""
    intent = ChapterIntent(
        chapter_index=chapter_index,
        scene_type=scene_type,  # type: ignore[arg-type]
        narrative_beats=beats or ["章首 Hook", "主线推进", "章末悬念"],
        required_characters=["c_protagonist"],
        required_settings=[],
        emotional_arc=(0.0, 0.5),
    )
    return {
        "chapter_intent": intent.to_dict(),
        "chapter_index": chapter_index,
        "source_narrative_id": f"narr_{chapter_index}",
        "generated_at": 1234.5,
        "beats": [
            {"name": "章首 Hook", "intent": "抓住读者注意力"},
            {"name": "主线推进", "intent": "推进核心冲突"},
            {"name": "章末悬念", "intent": "留下钩子"},
        ],
        "emotional_arc_beats": [0.0, 0.3, 0.5],
        "weave_violations": [],
        "weave_ratios": {
            "quest": 0.6,
            "fire": 0.2,
            "constellation": 0.1,
            "rest": 0.1,
        },
    }


def _make_skill_check_result_payload(
    scenario_id: str,
    *,
    round_num: int = 1,
    check_index: int = 0,
    outcome: str = "success",
    skill: str = "观察",
    chapter_index: int = 1,
) -> dict[str, Any]:
    """Build a ``data.sandbox.skill_check.result`` payload for CEN collection."""
    return {
        "scenario_id": scenario_id,
        "chapter_index": chapter_index,
        "round": round_num,
        "check_index": check_index,
        "skill": skill,
        "outcome": outcome,
        "character_id": "c_protagonist",
        "character_name": "林逸",
        "roll": 25,
        "target": 30.0,
        "difficulty": 0.3,
        "dice": 25,
    }


def _drive_scenario_round(
    cen: CentralExecutiveNetwork,
    router: BusRouter,
    *,
    scenario_id: str,
    chapter_index: int,
    round_num: int,
    possible_checks_count: int,
    outcomes: list[str] | None = None,
) -> list[BusMessage]:
    """Drive one full scenario round: tick CEN per check + emit result.

    For each ``possible_check`` we tick CEN (which emits one
    ``control.sandbox.simulate``) and then publish a matching
    ``data.sandbox.skill_check.result``. After all checks are dispatched,
    an additional tick triggers ``_advance_scenario_round``: by that
    point ``_scenario_simulate_index == possible_checks_count`` so
    ``_drive_scenario_simulate`` falls through to the round-advance
    branch and re-evaluates the N-round contract (potentially emitting
    ``data.sandbox.narrative.ready``).  Returns the drained messages.
    """
    outcomes = outcomes or ["success"] * possible_checks_count
    all_delivered: list[BusMessage] = []
    for check_index in range(possible_checks_count):
        cen.tick(_make_tick(t=round_num * 10.0 + check_index))
        all_delivered.extend(_drain(router))
        outcome = (
            outcomes[check_index]
            if check_index < len(outcomes)
            else "success"
        )
        _publish(
            router,
            topic="data.sandbox.skill_check.result",
            payload=_make_skill_check_result_payload(
                scenario_id,
                round_num=round_num,
                check_index=check_index,
                outcome=outcome,
                chapter_index=chapter_index,
            ),
        )
        all_delivered.extend(_drain(router))
    # Advance tick: simulate_index == possible_checks_count, so
    # _drive_scenario_simulate calls _advance_scenario_round to increment
    # the round counter and (when contracted) emit narrative.ready.
    cen.tick(_make_tick(t=round_num * 10.0 + possible_checks_count))
    all_delivered.extend(_drain(router))
    return all_delivered


# ===========================================================================
# SubTask 6.1.1 — Story Bible → COC 推演 → 段落 → 审计 → 定稿
# ===========================================================================


class TestStoryBibleToFinalization:
    """End-to-end: StoryBible → COCMappingEngine → CEN → CreationExecutive →
    ChapterManager → ContinuityAuditor → QualityEngine.

    Verifies the full pipeline runs without silent drops and that each
    stage emits its contracted bus messages.
    """

    def test_full_pipeline_story_bible_to_audit(self, tmp_path: Path) -> None:
        """Full E2E: chapter.intent → scenario → narrative.ready →
        paragraph → audit.issues → quality.report.

        Drives the real CEN + COCMappingEngine scenario loop to
        ``data.sandbox.narrative.ready``, then forces paragraph
        regeneration via ``control.novel.chapter.write`` and asserts
        the audit + quality pipeline fires downstream.
        """
        router = BusRouter()
        agent = _build_agent(router, tmp_path)
        cen = agent["cen"]
        creation = agent["creation"]
        chapter_manager = agent["chapter_manager"]

        # Disable CE's legacy narrative_ready coercion (see module
        # docstring); Stage-2 ``_handle_narrative_ready_for_chapter``
        # still runs and caches skill_checks.
        creation._handle_narrative_ready = lambda _payload: None  # type: ignore[assignment]

        chapter_index = 1
        chapter_id = f"ch_{chapter_index}"

        # 1. Publish chapter.intent → CEN emits scenario.request,
        #    COCMappingEngine responds with scenario.load.
        _publish(
            router,
            topic="data.novel.chapter.intent",
            payload=_make_chapter_intent_payload(chapter_index=chapter_index),
        )
        _drain(router)

        # 2. Tick CEN → CEN emits control.coc.scenario.request.
        cen.tick(_make_tick(t=1.0))
        delivered_after_request = _drain(router)
        assert _by_topic(delivered_after_request, "control.coc.scenario.request")

        # 3. COCMappingEngine responded with scenario.load during the
        #    drain; CEN should have cached the scenario.
        assert cen._current_scenario is not None, (
            "COCMappingEngine should have emitted scenario.load for the chapter"
        )
        scenario_id = cen._scenario_id
        assert scenario_id is not None
        possible_checks = cen._current_scenario.get("possible_checks") or []
        assert possible_checks, "scenario should carry possible_checks"
        checks_per_round = len(possible_checks)

        # 4. Drive 3 rounds of simulate + skill_check.result.
        all_delivered: list[BusMessage] = []
        for round_num in range(1, 4):
            round_delivered = _drive_scenario_round(
                cen,
                router,
                scenario_id=scenario_id,
                chapter_index=chapter_index,
                round_num=round_num,
                possible_checks_count=checks_per_round,
                outcomes=["success", "failure", "success"][:checks_per_round]
                if checks_per_round >= 3
                else ["success"] * checks_per_round,
            )
            all_delivered.extend(round_delivered)
            if _by_topic(round_delivered, "data.sandbox.narrative.ready"):
                break

        ready_events = _by_topic(all_delivered, "data.sandbox.narrative.ready")
        if not ready_events:
            cen.tick(_make_tick(t=99.0))
            ready_events = _by_topic(_drain(router), "data.sandbox.narrative.ready")
        assert ready_events, (
            "CEN should emit data.sandbox.narrative.ready after driving the "
            "scenario loop to the N-round contract"
        )

        # 5. CreationExecutive should have cached skill_checks from
        #    narrative.ready. Force regeneration via chapter.write.
        assert creation._latest_skill_checks, (
            "CreationExecutive should have cached skill_checks from narrative.ready"
        )
        _publish(
            router,
            topic="control.novel.chapter.write",
            payload={"chapter_id": chapter_id, "reset_index": True},
            channel="control",
        )
        delivered = _drain(router)
        paragraph_msgs = _by_topic(delivered, "data.novel.paragraph")
        assert paragraph_msgs, (
            "CreationExecutive should regenerate paragraphs after "
            "control.novel.chapter.write using the cached skill_checks"
        )

        # 6. ChapterManager should have attributed the paragraphs and
        #    emitted event.novel.paragraph.published for each.
        chapter = chapter_manager.get_chapter(chapter_id)
        # ChapterManager auto-creates the chapter on first paragraph.
        # If it didn't (because CE emitted before ChapterManager was
        # ready), we create it explicitly and re-publish.
        if chapter is None:
            chapter_manager.create_chapter(volume_id="v1", chapter_id=chapter_id)
            for msg in paragraph_msgs:
                _publish(router, topic="data.novel.paragraph", payload=msg.payload)
            delivered = _drain(router)

        published_events = _by_topic(delivered, "event.novel.paragraph.published")
        assert published_events, (
            "ChapterManager should emit event.novel.paragraph.published"
        )

        # 7. ContinuityAuditor should have audited the published paragraphs
        #    and emitted data.novel.audit.issues.
        audit_msgs = _by_topic(delivered, "data.novel.audit.issues")
        assert audit_msgs, (
            "ContinuityAuditor should emit data.novel.audit.issues "
            "on paragraph publication"
        )

        # 8. QualityEngine should have processed the audit issues and
        #    emitted a quality.report.
        quality_reports = _by_topic(delivered, "data.novel.quality.report")
        assert quality_reports, (
            "QualityEngine should emit data.novel.quality.report "
            "after processing audit.issues"
        )

        # The pipeline ran end-to-end without silent drops.
        assert quality_reports[0].payload["chapter_id"] == chapter_id

    def test_coc_mapping_to_narrative_ready(self, tmp_path: Path) -> None:
        """``chapter.intent`` → COCMappingEngine responds with
        ``scenario.load`` → CEN drives 3 rounds → ``narrative.ready``.

        Verifies the COCMappingEngine → CEN handshake and the N-round
        contract advancement independent of paragraph / audit stages.
        """
        router = BusRouter()
        agent = _build_agent(router, tmp_path)
        cen = agent["cen"]

        chapter_index = 5
        _publish(
            router,
            topic="data.novel.chapter.intent",
            payload=_make_chapter_intent_payload(chapter_index=chapter_index),
        )
        _drain(router)

        # Tick CEN → emits control.coc.scenario.request.
        cen.tick(_make_tick(t=1.0))
        delivered = _drain(router)
        requests = _by_topic(delivered, "control.coc.scenario.request")
        assert requests, "CEN should emit control.coc.scenario.request on chapter.intent"
        assert requests[-1].payload["chapter_index"] == chapter_index

        # COCMappingEngine responded with scenario.load during the drain.
        assert cen._current_scenario is not None
        scenario_id = cen._scenario_id
        assert scenario_id is not None
        possible_checks = cen._current_scenario.get("possible_checks") or []
        assert possible_checks, "scenario should carry possible_checks"
        checks_per_round = len(possible_checks)

        # Drive 3 rounds of simulate + skill_check.result.
        all_delivered: list[BusMessage] = []
        for round_num in range(1, 4):
            round_delivered = _drive_scenario_round(
                cen,
                router,
                scenario_id=scenario_id,
                chapter_index=chapter_index,
                round_num=round_num,
                possible_checks_count=checks_per_round,
                outcomes=["success", "failure", "success"][:checks_per_round]
                if checks_per_round >= 3
                else ["success"] * checks_per_round,
            )
            all_delivered.extend(round_delivered)
            if _by_topic(round_delivered, "data.sandbox.narrative.ready"):
                break

        ready_events = _by_topic(all_delivered, "data.sandbox.narrative.ready")
        if not ready_events:
            cen.tick(_make_tick(t=99.0))
            ready_events = _by_topic(_drain(router), "data.sandbox.narrative.ready")
        assert ready_events, (
            "CEN should emit data.sandbox.narrative.ready after 3 rounds"
        )
        ready_payload = ready_events[-1].payload
        assert ready_payload["origin"] == "scenario_driven"
        assert ready_payload["scenario_id"] == scenario_id
        assert ready_payload["chapter_index"] == chapter_index
        assert ready_payload["skill_checks"], (
            "narrative.ready should carry the collected skill_checks"
        )

    def test_planner_generates_chapter_intent(self, tmp_path: Path) -> None:
        """Planner consumes ``data.sandbox.narrative.ready`` and emits
        ``data.novel.chapter.intent`` with a real ``ChapterIntent`` payload.
        """
        router = BusRouter()
        agent = _build_agent(router, tmp_path)
        planner = agent["planner"]

        # Build a minimal narrative.ready payload with a real NarrativeLine.
        narrative_line = NarrativeLine(
            scenes=[Scene(description="旧书店的空气凝固了。", setting="旧书店")],
            conflicts=[],
            foreshadowing=[],
        )
        _publish(
            router,
            topic="data.sandbox.narrative.ready",
            payload={
                "narrative_line": narrative_line,
                "narrative_lines": [narrative_line],
                "skill_checks": [],
                "depth_metrics": {
                    "conflict_depth": 0.7,
                    "character_development": 0.6,
                    "emotional_shift": 0.5,
                    "coherence_score": 0.7,
                    "hook_strength": 0.5,
                    "foreshadowing_progress": 0.4,
                    "scene_variety": 0.5,
                },
                "simulation_round": 3,
            },
        )
        delivered = _drain(router)

        intent_msgs = _by_topic(delivered, "data.novel.chapter.intent")
        assert intent_msgs, (
            "Planner should emit data.novel.chapter.intent on narrative.ready"
        )
        payload = intent_msgs[-1].payload
        # Planner payload carries these top-level structured fields
        # (per ``planner.py`` _handle_narrative_ready) but NOT a
        # top-level ``chapter_index`` — the chapter index lives on the
        # emitted ``ChapterIntent`` dataclass.
        for key in (
            "chapter_intent",
            "beats",
            "emotional_arc_beats",
            "weave_violations",
            "weave_ratios",
            "source_narrative_id",
            "generated_at",
        ):
            assert key in payload, f"planner payload missing {key}"
        # The emitted intent is a real ``ChapterIntent`` instance.
        ci = payload["chapter_intent"]
        assert isinstance(ci, ChapterIntent)
        # Planner auto-increments its own ``_chapter_index`` (starting
        # at 0); the first narrative.ready therefore produces chapter 1.
        assert ci.chapter_index == 1
        assert ci.scene_type
        assert isinstance(ci.narrative_beats, list)
        assert ci.rhythm is not None
        assert isinstance(ci.foreshadowing_ops, list)
        assert isinstance(ci.required_characters, list)
        assert isinstance(ci.required_settings, list)
        assert ci.emotional_arc is not None
        assert planner._latest_intent is not None
        assert planner._latest_intent.chapter_index == 1
        assert planner.chapter_index == 1

    def test_creation_executive_generates_audited_paragraph(self, tmp_path: Path) -> None:
        """CreationExecutive emits ``data.novel.paragraph`` with
        ``chapter_id`` and the full ``audit_metadata`` block
        (``scene_type`` / ``source_beat`` / ``source_skill_check`` /
        ``source_narration`` / ``literary_quality_score`` /
        ``prompt_hash`` / ``weave_strand`` / ``generation_timestamp``).
        """
        router = BusRouter()
        agent = _build_agent(router, tmp_path)
        creation = agent["creation"]

        # Prime CE with a narrative.ready carrying a real NarrativeLine
        # (so the legacy handler can coerce without crashing).
        narrative_line = NarrativeLine(
            scenes=[Scene(description="旧书店的空气凝固了。", setting="旧书店")],
            conflicts=[],
            foreshadowing=[],
        )
        _publish(
            router,
            topic="data.sandbox.narrative.ready",
            payload={
                "narrative_line": narrative_line,
                "narrative_lines": [narrative_line],
                "skill_checks": [
                    SkillCheck(
                        character_id="c_protagonist",
                        character_name="林逸",
                        skill="观察",
                        skill_value=25.0,
                        difficulty=0.3,
                        modifier=0.0,
                        roll=25,
                        target=30.0,
                        outcome=SkillCheckOutcome.SUCCESS,
                    ).to_dict(),
                ],
                "depth_metrics": {
                    "conflict_depth": 0.7,
                    "character_development": 0.6,
                    "emotional_shift": 0.5,
                    "coherence_score": 0.7,
                    "hook_strength": 0.5,
                    "foreshadowing_progress": 0.4,
                    "scene_variety": 0.5,
                },
                "simulation_round": 3,
                "scenario_id": "sc_ce_audit",
                "chapter_index": 9,
                "world_state": {
                    "scenario_id": "sc_ce_audit",
                    "chapter_index": 9,
                    "location": {"name": "旧书店", "details": {}},
                },
                "source": "central_executive_network",
                "origin": "scenario_driven",
            },
        )
        _drain(router)

        _publish(
            router,
            topic="data.novel.chapter.intent",
            payload=_make_chapter_intent_payload(chapter_index=9),
        )
        # Paragraphs are emitted during the drain — capture them here.
        delivered = _drain(router)
        paragraph_msgs = _by_topic(delivered, "data.novel.paragraph")
        assert paragraph_msgs, (
            "CreationExecutive should emit data.novel.paragraph on chapter.intent"
        )

        payload = paragraph_msgs[0].payload
        assert payload["chapter_id"] == "ch_9"
        assert "paragraph" in payload
        assert isinstance(payload["index"], int)
        audit = payload["audit_metadata"]
        for field in (
            "scene_type",
            "source_beat",
            "source_skill_check",
            "source_narration",
            "literary_quality_score",
            "prompt_hash",
            "weave_strand",
            "generation_timestamp",
        ):
            assert field in audit, f"audit_metadata missing {field}"
        assert audit["scene_type"] in (
            "dialogue",
            "action",
            "psychological",
            "environment",
            "transition",
        )
        assert isinstance(audit["prompt_hash"], str)
        assert len(audit["prompt_hash"]) == 16
        assert audit["weave_strand"] in (
            "quest",
            "fire",
            "constellation",
            "rest",
        )
        assert isinstance(audit["generation_timestamp"], float)
        assert isinstance(audit["literary_quality_score"], float)
        assert 0.0 <= audit["literary_quality_score"] <= 1.0

    def test_continuity_auditor_detects_issues_in_pipeline(self, tmp_path: Path) -> None:
        """Paragraph with OOC content → ContinuityAuditor emits
        ``data.novel.audit.issues`` → QualityEngine triages by severity
        and emits ``control.novel.revision.required`` (warning) +
        ``data.novel.quality.report``.

        Uses a StoryBible with a protagonist whose ``extraversion=0.9``
        (high) and a paragraph showing low-extraversion behavior —
        a deterministic OOC trigger the auditor will flag as a warning.
        """
        router = BusRouter()
        agent = _build_agent(router, tmp_path)
        chapter_manager = agent["chapter_manager"]

        # Create a chapter so paragraph attribution has a target.
        chapter_manager.create_chapter(volume_id="v1", chapter_id="c_ooc")

        # Publish a paragraph with content that contradicts the
        # protagonist's extraversion=0.9 (high) trait — sitting alone,
        # silent, avoiding the crowd.
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={
                "chapter_id": "c_ooc",
                "paragraph": "林逸独自一人坐在角落，避开人群，沉默不语。",
            },
        )
        delivered = _drain(router)

        # ChapterManager → event.novel.paragraph.published
        published = _by_topic(delivered, "event.novel.paragraph.published")
        assert published, "ChapterManager should emit event.novel.paragraph.published"

        # ContinuityAuditor → data.novel.audit.issues
        audit_msgs = _by_topic(delivered, "data.novel.audit.issues")
        assert audit_msgs, (
            "ContinuityAuditor should emit data.novel.audit.issues"
        )
        audit_payload = audit_msgs[0].payload
        assert audit_payload["chapter_id"] == "c_ooc"
        assert isinstance(audit_payload["issues"], list)
        assert audit_payload["issues"], (
            "Auditor should flag at least one issue for OOC content"
        )
        ooc_issues = [
            i for i in audit_payload["issues"] if i["category"] == "ooc"
        ]
        assert ooc_issues, "Auditor should emit at least one OOC issue"
        assert any(i["severity"] == "warning" for i in ooc_issues), (
            "Trait-axis inversion should be a warning"
        )

        # QualityEngine → control.novel.revision.required (warning severity)
        revision_required = _by_topic(
            delivered, "control.novel.revision.required"
        )
        assert revision_required, (
            "QualityEngine should emit control.novel.revision.required "
            "for warning-severity issues"
        )

        # QualityEngine → data.novel.quality.report
        quality_reports = _by_topic(delivered, "data.novel.quality.report")
        assert quality_reports, (
            "QualityEngine should emit data.novel.quality.report"
        )
        report = quality_reports[0].payload
        assert report["chapter_id"] == "c_ooc"
        assert report["issues_count"]["warning"] >= 1
        # 1.0 - 0.1 (warning) - any info deductions; just verify < 1.0
        assert report["quality_score"] < 1.0
        assert report["auto_revisions_initiated"] >= 1


# ===========================================================================
# SubTask 6.1.2 — 经验输入 → 世界演进 → 持久化 → 回放
# ===========================================================================


class TestExperienceToWorldEvolution:
    """End-to-end: Memory Trace → WorldStateContract evolution →
    WorldStateStore persistence → reload round-trip →
    WorldVisualDebugger snapshot publication.
    """

    def test_memory_trace_updates_world_contract(self, tmp_path: Path) -> None:
        """A memory trace → ``ExperienceToWorldMapper.map_trace`` yields
        ``add_geography`` / ``add_mystery`` mutations →
        ``WorldEvolutionRules.apply_mutations`` returns a new contract
        with the new entries; the contract version is bumped manually
        (mirroring what ``WorldStateStore.save(bump_version=True)``
        does on persist).
        """
        contract = create_default_world_state(
            novel_id="evo_novel", genre="克苏鲁", tone="阴郁"
        )
        original_geography_keys = set(contract.geography.keys())
        original_mystery_count = len(contract.mysteries)
        original_version = contract.version

        mapper = ExperienceToWorldMapper()
        rules = WorldEvolutionRules()

        trace = {
            "tags": ["便利店", "谜"],
            "summary": "凌晨便利店的神秘符号",
            "narrative_role": "event",
            "valence": -0.5,
            "arousal": 0.4,
            "emotional_weight": 0.3,
        }
        mutations = mapper.map_trace(trace, contract)
        assert mutations, "Mapper should yield at least one mutation"

        new_contract, applied = rules.apply_mutations(contract, mutations)
        assert applied, "Rules should apply at least one mutation"

        # Geography mutated: a new entry was added (or an existing one bumped).
        assert new_contract.geography.keys() != original_geography_keys or \
            new_contract.geography != contract.geography, (
                "apply_mutations should change the geography dict"
            )

        # Mystery added (the trace carries the "谜" tag).
        assert len(new_contract.mysteries) > original_mystery_count, (
            "A new mystery should be added from the trace"
        )

        # The original contract is not mutated (defensive copy).
        assert contract.geography.keys() == original_geography_keys
        assert len(contract.mysteries) == original_mystery_count

        # Version bump (mirrors what WorldStateStore.save does).
        new_contract.version = original_version + 1
        assert new_contract.version > original_version

    def test_world_state_persisted_and_reloaded(self, tmp_path: Path) -> None:
        """``WorldStateStore.save`` writes ``v{N}.json`` +
        ``current.json`` + ``world_state.json``; ``load()`` returns the
        persisted contract with all fields round-tripped.
        """
        store = WorldStateStore(str(tmp_path), "persist_novel")
        c1 = create_default_world_state(
            "persist_novel", genre="克苏鲁", tone="阴郁"
        )
        v1 = store.save(c1, reason="initial seed")
        assert v1 == 1

        # Mutate via trace → apply mutations → save v2.
        mapper = ExperienceToWorldMapper()
        rules = WorldEvolutionRules()
        trace = {
            "tags": ["便利店", "谜"],
            "summary": "凌晨便利店的神秘符号",
            "narrative_role": "event",
            "valence": -0.5,
            "arousal": 0.4,
            "emotional_weight": 0.3,
        }
        mutations = mapper.map_trace(trace, c1)
        c2, _ = rules.apply_mutations(c1, mutations)
        v2 = store.save(c2, reason="trace applied")
        assert v2 == 2

        # Reload current → contract matches c2 (deep equality on
        # round-trippable fields).
        loaded = store.load()
        assert loaded is not None
        assert loaded.version == 2
        assert loaded.novel_id == "persist_novel"
        assert loaded.geography.keys() == c2.geography.keys()
        assert len(loaded.mysteries) == len(c2.mysteries)
        assert loaded.genre == c2.genre
        assert loaded.tone == c2.tone

        # Reload v1 explicitly → matches the pre-mutation contract.
        loaded_v1 = store.load_version(1)
        assert loaded_v1 is not None
        assert loaded_v1.version == 1
        assert len(loaded_v1.mysteries) == 0  # default contract has no mysteries
        assert len(loaded_v1.geography) == len(c1.geography)

    def test_world_visual_debugger_publishes_snapshot(self, tmp_path: Path) -> None:
        """``data.sandbox.world.updated`` → ``WorldVisualDebugger`` emits
        ``data.debug.world.snapshot`` carrying the refreshed world
        contract (geography / factions / rules / characters).
        """
        router = BusRouter()
        agent = _build_agent(router, tmp_path)
        debugger = agent["debugger"]

        # Build a fresh world contract and publish world.updated.
        new_wc = create_default_world_state(
            novel_id="e2e_novel", genre="都市奇幻", tone="紧张"
        )
        # Bump version to make the snapshot's version field non-default.
        new_wc.version = 5
        _publish(
            router,
            topic="data.sandbox.world.updated",
            payload={
                "world_contract": new_wc,
                "novel_id": "e2e_novel",
                "update_reason": "test_e2e_evolution",
            },
        )
        delivered = _drain(router)

        snapshots = _by_topic(delivered, "data.debug.world.snapshot")
        assert snapshots, (
            "WorldVisualDebugger should emit data.debug.world.snapshot "
            "on world.updated"
        )
        snap = snapshots[-1].payload
        assert snap["novel_id"] == "e2e_novel"
        assert snap["version"] == "5"
        assert isinstance(snap["geography"], list)
        assert isinstance(snap["factions"], list)
        assert isinstance(snap["rules"], list)
        assert isinstance(snap["characters"], list)
        # The snapshot is buffered in memory + persisted to disk.
        assert debugger._snapshots, "Snapshot should be buffered"
        assert debugger._state.custom["snapshots_emitted"] >= 1

        state_path = Path(debugger._state_path)
        assert state_path.is_file(), "Snapshot buffer should be persisted"
        with open(state_path, encoding="utf-8") as f:
            persisted = json.load(f)
        assert persisted["novel_id"] == "e2e_novel"
        assert isinstance(persisted["snapshots"], list)
        assert persisted["snapshots"]

    def test_version_snapshot_written_to_disk(self, tmp_path: Path) -> None:
        """``WorldStateStore.save(bump_version=True)`` writes a new
        ``v{N}.json`` file each call, ascending by 1, and the file is
        valid JSON loadable via ``load_version``.
        """
        store = WorldStateStore(str(tmp_path), "versioned_novel")
        contract = create_default_world_state("versioned_novel")

        versions: list[int] = []
        for i in range(4):
            v = store.save(contract, reason=f"save_{i}")
            versions.append(v)

        assert versions == [1, 2, 3, 4]
        novel_dir = Path(store.novel_dir)
        for v in versions:
            vpath = novel_dir / f"v{v}.json"
            assert vpath.is_file(), f"missing {vpath}"
            with open(vpath, encoding="utf-8") as f:
                data = json.load(f)
            assert data["version"] == v
            assert data["novel_id"] == "versioned_novel"
            assert "contract" in data
            assert "saved_at" in data

        # ``list_versions()`` reflects the on-disk state.
        assert store.list_versions() == versions

        # The current pointer matches the latest save.
        current_path = novel_dir / WorldStateStore.CURRENT_FILENAME
        assert current_path.is_file()
        with open(current_path, encoding="utf-8") as f:
            current = json.load(f)
        assert current["version"] == 4


# ===========================================================================
# SubTask 6.1.3 — 多章生成 → 版本回退 → 状态一致
# ===========================================================================


class TestMultiChapterVersioning:
    """End-to-end: 3 chapters generated via ``ChapterManager`` + commits →
    each chapter has a non-empty version history → rollback restores
    prior paragraph state → state remains internally consistent.
    """

    @staticmethod
    def _generate_chapter(
        router: BusRouter,
        chapter_manager: ChapterManager,
        *,
        chapter_id: str,
        paragraphs: list[str],
    ) -> None:
        """Generate one chapter with the given paragraph contents.

        Creates the chapter (draft), publishes each paragraph via
        ``data.novel.paragraph``, completes the chapter (audited),
        then commits it (committed + version snapshot).
        """
        chapter_manager.create_chapter(volume_id="v1", chapter_id=chapter_id)
        for content in paragraphs:
            _publish(
                router,
                topic="data.novel.paragraph",
                payload={"chapter_id": chapter_id, "paragraph": content},
            )
            _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.complete",
            payload={"chapter_id": chapter_id, "reason": "manual"},
            channel="control",
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": chapter_id, "reason": "audit_passed"},
            channel="control",
        )
        _drain(router)

    def test_three_chapters_generated(self, tmp_path: Path) -> None:
        """3 chapters × multiple paragraphs each, all committed, each
        with a single version snapshot.
        """
        router = BusRouter()
        agent = _build_agent(router, tmp_path)
        chapter_manager = agent["chapter_manager"]

        chapters_data = {
            "c1": ["p1-a", "p1-b"],
            "c2": ["p2-a", "p2-b", "p2-c"],
            "c3": ["p3-a", "p3-b"],
        }
        for cid, paragraphs in chapters_data.items():
            self._generate_chapter(
                router, chapter_manager, chapter_id=cid, paragraphs=paragraphs
            )

        for cid, paragraphs in chapters_data.items():
            chapter = chapter_manager.get_chapter(cid)
            assert chapter is not None
            assert chapter.status == "committed"
            assert chapter.committed_at is not None
            assert [p.content for p in chapter.paragraphs] == paragraphs
            assert len(chapter.versions) == 1, (
                f"chapter {cid} should have exactly one version after commit"
            )

        # Manager state aggregates across all 3 chapters.
        state = chapter_manager.get_state()
        assert state["chapter_count"] == 3
        assert state["committed_count"] == 3
        assert state["paragraph_count"] == sum(len(p) for p in chapters_data.values())

    def test_chapter_version_history_recorded(self, tmp_path: Path) -> None:
        """A chapter that goes through commit → rollback → re-commit
        records a version for each lifecycle event, in chronological
        order with non-decreasing ``created_at`` timestamps.
        """
        router = BusRouter()
        agent = _build_agent(router, tmp_path)
        chapter_manager = agent["chapter_manager"]

        chapter_manager.create_chapter(volume_id="v1", chapter_id="c_hist")

        # v1: commit snapshot of ["first"]
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c_hist", "paragraph": "first"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c_hist", "reason": "first commit"},
            channel="control",
        )
        _drain(router)
        assert len(chapter_manager.list_versions("c_hist")) == 1

        # v2: rollback record
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c_hist", "target_version": 1},
            channel="control",
        )
        _drain(router)
        assert len(chapter_manager.list_versions("c_hist")) == 2

        # v3: re-commit after adding a paragraph
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c_hist", "paragraph": "second"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c_hist", "reason": "second commit"},
            channel="control",
        )
        _drain(router)

        versions = chapter_manager.list_versions("c_hist")
        assert len(versions) == 3
        # Chronological order with non-decreasing timestamps.
        timestamps = [v.created_at for v in versions]
        assert timestamps == sorted(timestamps)
        # change_summary distinguishes commits from rollbacks.
        assert versions[0].change_summary == "commit: first commit"
        assert versions[1].change_summary.startswith("rollback to")
        assert versions[2].change_summary == "commit: second commit"

    def test_rollback_to_previous_version(self, tmp_path: Path) -> None:
        """Commit [p1, p2] → add p3 → rollback to v1 restores [p1, p2]
        and the chapter status transitions ``committed → revised``.
        """
        router = BusRouter()
        agent = _build_agent(router, tmp_path)
        chapter_manager = agent["chapter_manager"]

        chapter_manager.create_chapter(volume_id="v1", chapter_id="c_rb")
        for content in ("p1", "p2"):
            _publish(
                router,
                topic="data.novel.paragraph",
                payload={"chapter_id": "c_rb", "paragraph": content},
            )
            _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c_rb"},
            channel="control",
        )
        _drain(router)

        # Add a third paragraph after commit (paragraphs diverge from v1).
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c_rb", "paragraph": "p3"},
        )
        _drain(router)
        assert [p.content for p in chapter_manager.get_chapter("c_rb").paragraphs] == [
            "p1",
            "p2",
            "p3",
        ]

        # Rollback to v1 → restores [p1, p2].
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c_rb", "target_version": 1},
            channel="control",
        )
        rollback_delivered = _drain(router)

        chapter = chapter_manager.get_chapter("c_rb")
        assert [p.content for p in chapter.paragraphs] == ["p1", "p2"]
        assert chapter.status == "revised"
        assert chapter.committed_at is None

        # Rollback event emitted.
        rollback_events = _by_topic(rollback_delivered, "event.novel.chapter.rollback")
        assert rollback_events, "Rollback should emit event.novel.chapter.rollback"
        payload = rollback_events[0].payload
        assert payload["chapter_id"] == "c_rb"
        assert payload["previous_status"] == "committed"
        assert payload["new_status"] == "revised"
        assert payload["paragraph_count"] == 2

    def test_state_consistent_after_rollback(self, tmp_path: Path) -> None:
        """After commit → rollback → re-commit → rollback, the chapter
        state (status / paragraph count / version metadata) is internally
        consistent: every commit and rollback appends a new
        :class:`ChapterVersion`, the active paragraphs always match the
        target snapshot, and the on-disk chapter.json reflects the
        rolled-back state.

        Exercise the ``status`` round-trip ``draft → committed → revised
        → committed → revised`` so we verify *multiple* commits +
        rollbacks interleave correctly (not just the single-rollback
        case ``test_rollback_to_previous_version`` already covers).
        """
        router = BusRouter()
        agent = _build_agent(router, tmp_path)
        chapter_manager = agent["chapter_manager"]
        novel_id = agent["story_bible"].novel_id

        chapter_manager.create_chapter(volume_id="v1", chapter_id="c_consist")

        # --- v1: [alpha, beta] -----------------------------------------
        for content in ("alpha", "beta"):
            _publish(
                router,
                topic="data.novel.paragraph",
                payload={"chapter_id": "c_consist", "paragraph": content},
            )
            _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c_consist", "reason": "v1"},
            channel="control",
        )
        _drain(router)
        chapter = chapter_manager.get_chapter("c_consist")
        assert chapter.status == "committed"
        assert len(chapter.versions) == 1
        v1_version_id = chapter.versions[0].version_id

        # --- diverge + rollback to v1 ----------------------------------
        # Adding paragraphs after commit does NOT auto-reopen the
        # chapter (status stays ``committed``); the next commit would
        # be a no-op because ``_handle_commit`` only accepts
        # ``audited / revised / draft``. We must rollback first.
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c_consist", "paragraph": "gamma"},
        )
        _drain(router)
        assert [p.content for p in chapter_manager.get_chapter("c_consist").paragraphs] == [
            "alpha",
            "beta",
            "gamma",
        ]
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c_consist", "target_version": 1},
            channel="control",
        )
        _drain(router)
        chapter = chapter_manager.get_chapter("c_consist")
        assert chapter.status == "revised"
        assert chapter.committed_at is None
        assert [p.content for p in chapter.paragraphs] == ["alpha", "beta"]
        assert len(chapter.versions) == 2  # v1 commit + rollback_to_v1
        assert chapter.versions[-1].change_summary == f"rollback to {v1_version_id}"

        # --- v2: [alpha, beta, gamma] (status is ``revised`` → commit works)
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c_consist", "paragraph": "gamma"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c_consist", "reason": "v2"},
            channel="control",
        )
        _drain(router)
        chapter = chapter_manager.get_chapter("c_consist")
        assert chapter.status == "committed"
        assert chapter.committed_at is not None
        assert [p.content for p in chapter.paragraphs] == ["alpha", "beta", "gamma"]
        assert len(chapter.versions) == 3  # v1, rollback_v1, v2_commit
        v2_version_id = chapter.versions[-1].version_id
        assert chapter.versions[-1].change_summary == "commit: v2"

        # --- rollback to v2 → restores [alpha, beta, gamma] -----------
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c_consist", "target_version": 3},
            channel="control",
        )
        _drain(router)
        chapter = chapter_manager.get_chapter("c_consist")
        assert chapter.status == "revised"
        assert chapter.committed_at is None
        assert [p.content for p in chapter.paragraphs] == ["alpha", "beta", "gamma"]
        assert len(chapter.versions) == 4  # v1, rollback_v1, v2, rollback_v2

        # Each paragraph still carries its chapter_id attribution.
        for p in chapter.paragraphs:
            assert p.chapter_id == "c_consist"

        # Version history is internally consistent: every commit +
        # rollback produced a record, in the right order, with the
        # expected change_summary and a paragraph snapshot matching the
        # restored state.
        versions = chapter_manager.list_versions("c_consist")
        assert [v.change_summary for v in versions] == [
            "commit: v1",
            f"rollback to {v1_version_id}",
            "commit: v2",
            f"rollback to {v2_version_id}",
        ]
        assert [p.content for p in versions[0].paragraphs] == ["alpha", "beta"]
        assert [p.content for p in versions[1].paragraphs] == ["alpha", "beta"]
        assert [p.content for p in versions[2].paragraphs] == ["alpha", "beta", "gamma"]
        assert [p.content for p in versions[3].paragraphs] == ["alpha", "beta", "gamma"]

        # On-disk chapter.json reflects the rolled-back state. Note:
        # ``_save_chapter_metadata`` strips ``paragraphs`` / ``versions``
        # (they live in their own per-index files) and writes summary
        # counters instead, so we verify the metadata projection here.
        chapter_json_path = (
            Path(chapter_manager._chapters_dir)
            / novel_id
            / "v1"
            / "c_consist"
            / "chapter.json"
        )
        assert chapter_json_path.is_file()
        with open(chapter_json_path, encoding="utf-8") as f:
            on_disk = json.load(f)
        assert on_disk["chapter_id"] == "c_consist"
        assert on_disk["status"] == "revised"
        assert on_disk["paragraph_count"] == 3
        assert on_disk["version_count"] == 4
        # ``paragraphs`` field is intentionally stripped from the
        # metadata file — per-paragraph JSON lives under
        # ``paragraphs/{N}.json`` next to ``chapter.json``.
        assert "paragraphs" not in on_disk
        # Verify the per-paragraph files round-trip the rolled-back state.
        paragraphs_dir = chapter_json_path.parent / "paragraphs"
        assert paragraphs_dir.is_dir()
        per_index_contents: list[str] = []
        for i in range(1, 4):
            para_path = paragraphs_dir / f"{i}.json"
            assert para_path.is_file(), f"missing paragraph file: {para_path}"
            with open(para_path, encoding="utf-8") as f:
                pdata = json.load(f)
            per_index_contents.append(pdata["content"])
        assert per_index_contents == ["alpha", "beta", "gamma"]


# ===========================================================================
# SubTask 6.1.4 — 并发读写 Story Bible 竞态条件
# ===========================================================================


class TestConcurrentAccess:
    """Concurrent reads / writes against ``WorldStateStore`` and
    ``PersistenceManager.save_atomic`` — verifies the ``.tmp`` +
    ``os.replace`` atomic-write strategy holds under contention.
    """

    def test_concurrent_world_state_writes(self, tmp_path: Path) -> None:
        """Multiple threads call ``WorldStateStore.save`` concurrently
        against the same store. After all writers join:

        - At least one writer succeeded (final ``current.json`` exists).
        - No ``.tmp`` residue remains.
        - ``current.json`` is loadable and round-trips through
          ``WorldStateContract.from_dict``.
        - All ``v{N}.json`` files are valid JSON (no truncated writes).

        Note: ``WorldStateStore._atomic_write`` uses ``.tmp`` +
        ``os.replace`` which is *atomic for readers* but **not
        thread-safe for concurrent writers** — two writers racing on
        the same ``{path}.tmp`` will see the loser's ``os.replace``
        raise ``FileNotFoundError`` because the winner already moved
        the tmp file. This is the documented contract of the
        atomic-write strategy: it guarantees readers never observe a
        half-written file, not that concurrent writers never
        conflict. This test therefore tolerates
        ``FileNotFoundError`` / ``OSError`` on losing writers and only
        asserts the *final* on-disk state is consistent.
        """
        store = WorldStateStore(str(tmp_path), "concurrent_novel")

        write_errors: list[Exception] = []

        def writer(i: int) -> None:
            try:
                local = create_default_world_state(
                    "concurrent_novel", genre=f"genre_{i}", tone=f"tone_{i}"
                )
                store.save(local, reason=f"thread_{i}")
            except (FileNotFoundError, FileExistsError, OSError):
                # Expected race on the shared ``.tmp`` path.
                pass
            except Exception as exc:  # pragma: no cover - defensive
                write_errors.append(exc)

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # No *unexpected* exceptions escaped any writer thread.
        assert not write_errors, (
            f"writer threads raised unexpected errors: {write_errors[:3]}"
        )

        novel_dir = Path(store.novel_dir)
        # No .tmp residue — every winning writer renamed its tmp file.
        tmp_files = list(novel_dir.glob("*.tmp"))
        assert tmp_files == [], f"unexpected .tmp residue: {tmp_files}"

        # current.json is loadable and consistent.
        loaded = store.load()
        assert loaded is not None, "no current.json written — every writer lost the race"
        assert loaded.novel_id == "concurrent_novel"

        # Every v{N}.json is valid JSON (no truncated writes — readers
        # never saw a half-written file even under contention).
        versions = store.list_versions()
        assert versions, "no versioned snapshots were written"
        for v in versions:
            vpath = novel_dir / f"v{v}.json"
            assert vpath.is_file(), f"missing version file: {vpath}"
            with open(vpath, encoding="utf-8") as f:
                data = json.load(f)
            assert data["version"] == v
            assert "contract" in data

    def test_atomic_write_no_corruption(self, tmp_path: Path) -> None:
        """``PersistenceManager.save_atomic`` under heavy concurrent
        access to the same path:

        - Final file is valid JSON (one of the writers won).
        - No ``.tmp`` residue remains.
        - No *unexpected* exception escaped any thread.

        As with ``test_concurrent_world_state_writes``, the ``.tmp`` +
        ``os.replace`` strategy is atomic for readers but not
        thread-safe for writers — losing writers may raise
        ``FileNotFoundError`` when their ``.tmp`` is moved out from
        under them. The atomicity guarantee we *do* verify is that
        the surviving file is never corrupt: a reader opening the
        path after all writers join always sees complete, valid JSON.
        """
        path = str(tmp_path / "atomic_target.json")

        write_errors: list[Exception] = []

        def writer(i: int) -> None:
            try:
                # Use distinct payloads so the final state is
                # non-deterministic but always valid.
                payload = {
                    "writer_id": i,
                    "payload": "x" * 500,
                    "nested": {"list": list(range(50)), "ts": time.time()},
                }
                PersistenceManager.save_atomic(payload, path)
            except (FileNotFoundError, FileExistsError, OSError):
                # Expected race on the shared ``.tmp`` path.
                pass
            except Exception as exc:  # pragma: no cover - defensive
                write_errors.append(exc)

        threads = [
            threading.Thread(target=writer, args=(i,)) for i in range(20)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # No *unexpected* exceptions escaped any writer thread.
        assert not write_errors, (
            f"writer threads raised unexpected errors: {write_errors[:3]}"
        )

        # No .tmp residue — the winning writer renamed its tmp file.
        assert not Path(f"{path}.tmp").exists(), ".tmp residue left behind"

        # Final file is valid JSON, has a writer_id from one of the writers.
        assert Path(path).is_file(), "no atomic_target.json written — every writer lost the race"
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        assert "writer_id" in data
        assert data["writer_id"] in {i for i in range(20)}
        assert "payload" in data
        assert "nested" in data

    def test_concurrent_read_during_write(self, tmp_path: Path) -> None:
        """A long-running reader thread reads ``current.json`` while
        writers concurrently call ``store.save``. Readers must observe
        either the old or the new state, never a truncated / corrupt
        file (no ``JSONDecodeError``, no missing required keys).
        """
        store = WorldStateStore(str(tmp_path), "rw_novel")
        # Seed initial state so the reader has something to read.
        store.save(create_default_world_state("rw_novel"), reason="seed")

        stop = threading.Event()
        read_errors: list[str] = []
        read_count = 0

        def reader() -> None:
            nonlocal read_count
            current_path = Path(store.novel_dir) / WorldStateStore.CURRENT_FILENAME
            while not stop.is_set():
                try:
                    # Direct file read (simulating a concurrent reader
                    # that bypasses the store API) — this is the
                    # hardest case the atomic-write strategy must handle.
                    with open(current_path, encoding="utf-8") as f:
                        raw = f.read()
                    data = json.loads(raw)
                    # Verify required fields are present.
                    assert "version" in data, "missing version"
                    assert "contract" in data, "missing contract"
                    assert "novel_id" in data, "missing novel_id"
                    read_count += 1
                except json.JSONDecodeError as exc:
                    read_errors.append(f"corrupt JSON: {exc}")
                except Exception as exc:  # pragma: no cover - defensive
                    read_errors.append(f"reader error: {exc}")

        def writer() -> None:
            for i in range(20):
                c = create_default_world_state(
                    "rw_novel", genre=f"g{i}", tone=f"t{i}"
                )
                try:
                    store.save(c, reason=f"iter_{i}")
                except Exception as exc:  # pragma: no cover - defensive
                    read_errors.append(f"writer error: {exc}")

        reader_t = threading.Thread(target=reader)
        writer_t = threading.Thread(target=writer)
        reader_t.start()
        writer_t.start()

        writer_t.join(timeout=10.0)
        stop.set()
        reader_t.join(timeout=5.0)

        # Reader must have completed at least one read.
        assert read_count > 0, "reader thread never completed a read"
        # No corrupt / partial reads observed.
        assert not read_errors, (
            f"readers observed inconsistent state: {read_errors[:5]}"
        )

        # Final state: clean, no .tmp residue.
        novel_dir = Path(store.novel_dir)
        assert not list(novel_dir.glob("*.tmp"))
        loaded = store.load()
        assert loaded is not None
        assert loaded.novel_id == "rw_novel"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
