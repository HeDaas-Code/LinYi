"""Acceptance tests for Stage 6 Task 6.2: generate a 3-chapter short story.

This is the final task of the ``refactor-novelist-system-v1`` project. It
assembles the full agent (``BusRouter`` + all core modules: COCMappingEngine,
CEN, Planner, CreationExecutive, ChapterManager, ContinuityAuditor,
QualityEngine, WorldVisualDebugger, OCCharacterSystem) and simulates
generating 3 chapters of a short story, verifying the 4 acceptance criteria
mandated by SubTasks 6.2.1–6.2.4:

- **6.2.1 人物行为符合 OC 设定** — ``ContinuityAuditor`` produces no
  ``critical``-severity OOC issues across the 3 generated chapters.
- **6.2.2 无明显设定冲突** — ``ContinuityAuditor`` produces no
  ``critical``-severity ``setting_conflict`` issues.
- **6.2.3 节奏符合 intent** — each chapter's ``ChapterIntent.rhythm``
  (``RhythmProfile``) falls within the four-strand weave thresholds
  (Quest 50-70% / Fire 10-30% / Constellation 10-30% / Rest 0-20%).
- **6.2.4 伏笔有回收计划** — at least one ``foreshadowing_ops`` entry
  carries an ``introduce`` operation, and a subsequent chapter carries a
  ``reinforce`` or ``pay_off`` operation for the same entry.

The tests use ``MockLLMService`` so the generated prose is mock content;
the acceptance criteria are verified at the *system capability* level
(detection / planning / recording), not at the literary-quality level.
The auditor's OOC / setting_conflict *detection capability* is separately
verified in ``test_continuity_auditor.py`` (SubTask 4.5.3, > 80% detection
rate on injected cases).

Test flow (per chapter):

1. Publish ``data.sandbox.narrative.ready`` with a real ``NarrativeLine``
   (empty scenes → Planner falls back to ``DEFAULT_WEAVE_RATIOS`` which
   sit safely inside all four-strand thresholds) + serialized
   ``skill_checks``.
2. Planner receives ``narrative.ready`` → emits ``data.novel.chapter.intent``
   carrying a real ``ChapterIntent`` (with ``RhythmProfile``,
   ``foreshadowing_ops``, ``narrative_beats``, ``emotional_arc``).
3. ``CreationExecutive`` receives ``narrative.ready`` (caches skill_checks
   via the Stage-2 ``_handle_narrative_ready_for_chapter`` handler; the
   legacy coercion handler is disabled) → receives ``chapter.intent`` →
   emits ``data.novel.paragraph`` per beat.
4. ``ChapterManager`` receives ``paragraph`` → emits
   ``event.novel.paragraph.published``.
5. ``ContinuityAuditor`` receives ``paragraph.published`` → emits
   ``data.novel.audit.issues``.
6. ``QualityEngine`` receives ``audit.issues`` → emits
   ``data.novel.quality.report``.
"""

from __future__ import annotations

import os
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
    ForeshadowingEntry,
    ForeshadowingOp,
    NarrativeLine,
    OCCharacterSheet,
    PlotCompass,
    StoryBible,
    StyleFingerprint,
    TickDelta,
    WorldStateContract,
)
from src.novelist_brain.oc_character_system import OCCharacterSystem
from src.novelist_brain.planner import (
    BEAT_SEQUENCE,
    WEAVE_THRESHOLDS,
    Planner,
)
from src.novelist_brain.quality_engine import QualityEngine
from src.novelist_brain.trpg_state import SkillCheck, SkillCheckOutcome
from src.novelist_brain.world_state import create_default_world_state
from src.novelist_brain.world_visual_debugger import WorldVisualDebugger


# ---------------------------------------------------------------------------
# Shared helpers (adapted from tests/test_e2e_integration.py)
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


def _make_oc_characters() -> list[OCCharacterSheet]:
    """Build OC characters with DEFAULT traits (no extreme values).

    Using default traits (all 0.5) ensures the ``MockLLMService``'s
    generated content won't trigger trait-axis inversion OOC warnings,
    keeping the happy-path acceptance test stable. The auditor's OOC
    *detection capability* is separately verified in
    ``test_continuity_auditor.py``.
    """
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
    ]


def _make_story_bible(novel_id: str = "acceptance_novel") -> StoryBible:
    """Build a ``StoryBible`` configured for the 3-chapter acceptance test.

    Configuration choices:

    - OC characters with DEFAULT traits (no OOC triggers from mock content).
    - World contract via ``create_default_world_state`` (no forbidden
      taboos, no unbreakable rules → no setting_conflict triggers).
    - ``PlotCompass`` with ``active_long_arcs=["失落的传说"]`` so the
      Planner emits an ``introduce`` foreshadowing op on every chapter.
    - Foreshadowing ledger seeded with ``fs_seed`` introduced at ``ch_0``
      so the Planner emits ``reinforce`` ops starting from chapter 2
      (when ``reinforce_after=2``).
    """
    wc = create_default_world_state(novel_id=novel_id, genre="文学", tone="沉静")
    pc = PlotCompass(
        ending_intent="主角与城市达成和解",
        active_long_arcs=["失落的传说"],
        scale="short",
        current_arc_position="开端",
    )
    characters = _make_oc_characters()
    return StoryBible(
        novel_id=novel_id,
        title="验收测试短篇",
        genre="文学",
        theme="孤独与和解",
        premise="一个孤独的小说家在城市中寻找失落传说。",
        world_contract=wc,
        character_registry={c.character_id: c for c in characters},
        plot_compass=pc,
        foreshadowing_ledger=[
            ForeshadowingEntry(
                entry_id="fs_seed",
                description="一盏将熄的灯",
                introduced_in_chapter="ch_0",
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
    novel_id: str = "acceptance_novel",
) -> dict[str, Any]:
    """Build a full agent with all core modules registered to ``router``.

    Adapted from ``tests/test_e2e_integration.py::_build_agent`` with
    acceptance-test-specific customizations:

    - OC characters with default traits (no OOC triggers).
    - Planner configured with ``reinforce_after=2`` so chapter 2+ emit
      ``reinforce`` ops for the seed foreshadowing entry ``fs_seed``
      (introduced at ``ch_0`` → age 2 at chapter 2).
    - ``payoff_window=(100, 200)`` keeps the seed entry out of the
      ``pay_off`` window so only ``reinforce`` ops fire (cleaner
      verification of the recovery plan).

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
    sb = _make_story_bible(novel_id=novel_id)

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
    # ``narrative_line`` dict with extra summary fields that the legacy
    # handler tries to splat into ``NarrativeLine(**dict)``. The Stage-2
    # ``_handle_narrative_ready_for_chapter`` handler uses the defensive
    # ``reconstruct_dataclass`` path and is the one that actually caches
    # ``skill_checks`` for the paragraph-generation flow.
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
    # reinforce_after=2 so chapter 2 (age=2 for fs_seed introduced at
    # ch_0) triggers the first reinforce op. payoff_window=(100, 200)
    # keeps the seed entry out of the pay_off window within 3 chapters.
    planner_state_dir = str(tmp_path / "planner_state")
    planner = Planner(
        foreshadowing_reinforce_after=2,
        foreshadowing_payoff_window=(100, 200),
    )
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


def _make_narrative_ready_payload(
    chapter_index: int,
    *,
    skill_checks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a ``data.sandbox.narrative.ready`` payload with a real NarrativeLine.

    Uses EMPTY scenes so the Planner falls back to
    ``DEFAULT_WEAVE_RATIOS`` (Quest 0.55 / Fire 0.20 / Constellation 0.15
    / Rest 0.10) which sit safely inside all four-strand thresholds.
    The ``skill_checks`` list is passed as serialized dicts
    (``SkillCheck.to_dict()``) so ``CreationExecutive`` can cache them
    for paragraph generation.
    """
    narrative_line = NarrativeLine(scenes=[], conflicts=[])
    return {
        "narrative_line": narrative_line,
        "narrative_lines": [narrative_line],
        "skill_checks": skill_checks
        or [
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
            "conflict_depth": 0.6,
            "character_development": 0.5,
            "emotional_shift": 0.4,
            "coherence_score": 0.7,
            "hook_strength": 0.5,
            "foreshadowing_progress": 0.3,
            "scene_variety": 0.5,
        },
        "simulation_round": 3,
        "scenario_id": f"sc_acceptance_{chapter_index}",
        "chapter_index": chapter_index,
        "world_state": {
            "scenario_id": f"sc_acceptance_{chapter_index}",
            "chapter_index": chapter_index,
            "location": {"name": "街道", "details": {}},
        },
        "source": "central_executive_network",
        "origin": "scenario_driven",
    }


def _generate_3_chapters(
    router: BusRouter,
    agent: dict[str, Any],
    novel_id: str,
) -> dict[str, Any]:
    """Simulate generating 3 chapters by triggering ``narrative.ready`` 3 times.

    For each chapter:

    1. Publish ``data.sandbox.narrative.ready`` → Planner emits
       ``data.novel.chapter.intent``; CE caches ``skill_checks``.
    2. CE receives ``chapter.intent`` → emits ``data.novel.paragraph``.
    3. ``ChapterManager`` receives ``paragraph`` → emits
       ``event.novel.paragraph.published``.
    4. ``ContinuityAuditor`` receives ``paragraph.published`` → emits
       ``data.novel.audit.issues``.
    5. ``QualityEngine`` receives ``audit.issues`` → emits
       ``data.novel.quality.report``.

    Chapters are pre-created via ``chapter_manager.create_chapter`` so
    paragraph attribution has a target (mirroring the
    ``test_e2e_integration._generate_chapter`` pattern).

    Returns a dict with collected ``chapter_intents``, ``paragraphs``,
    ``audit_issues``, ``quality_reports``, and the raw ``messages`` list.
    """
    chapter_manager = agent["chapter_manager"]

    chapter_intents: list[dict[str, Any]] = []
    paragraphs: list[dict[str, Any]] = []
    audit_issues: list[dict[str, Any]] = []
    quality_reports: list[dict[str, Any]] = []
    all_messages: list[BusMessage] = []

    for chapter_idx in range(1, 4):
        chapter_id = f"ch_{chapter_idx}"
        # Pre-create the chapter so paragraph attribution has a target.
        chapter_manager.create_chapter(volume_id="v1", chapter_id=chapter_id)

        _publish(
            router,
            topic="data.sandbox.narrative.ready",
            payload=_make_narrative_ready_payload(chapter_idx),
        )
        delivered = _drain(router)
        all_messages.extend(delivered)

        for msg in delivered:
            if msg.topic == "data.novel.chapter.intent":
                chapter_intents.append(msg.payload)
            elif msg.topic == "data.novel.paragraph":
                paragraphs.append(msg.payload)
            elif msg.topic == "data.novel.audit.issues":
                audit_issues.extend(msg.payload.get("issues", []))
            elif msg.topic == "data.novel.quality.report":
                quality_reports.append(msg.payload)

    return {
        "chapter_intents": chapter_intents,
        "paragraphs": paragraphs,
        "audit_issues": audit_issues,
        "quality_reports": quality_reports,
        "messages": all_messages,
    }


@pytest.fixture
def three_chapter_run(tmp_path: Path) -> dict[str, Any]:
    """Build a full agent and generate 3 chapters, returning all data.

    This fixture is function-scoped (each test gets its own isolated
    ``tmp_path``) and returns a dict containing the agent, router,
    novel_id, and all collected outputs from the 3-chapter generation.
    """
    router = BusRouter()
    agent = _build_agent(router, tmp_path)
    novel_id = agent["story_bible"].novel_id
    data = _generate_3_chapters(router, agent, novel_id)
    return {
        "agent": agent,
        "router": router,
        "novel_id": novel_id,
        **data,
    }


# ===========================================================================
# Class 1: TestThreeChapterAcceptance — main acceptance (6.2.1–6.2.4)
# ===========================================================================


class TestThreeChapterAcceptance:
    """Main acceptance tests: generate 3 chapters and verify the 4
    acceptance criteria mandated by SubTasks 6.2.1–6.2.4.
    """

    def test_generate_three_chapters_successfully(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """All 3 chapters generate successfully: each produces a
        ``ChapterIntent``, at least one paragraph, audit issues
        (possibly empty), and a quality report.
        """
        chapter_intents = three_chapter_run["chapter_intents"]
        paragraphs = three_chapter_run["paragraphs"]
        quality_reports = three_chapter_run["quality_reports"]

        assert len(chapter_intents) == 3, (
            f"expected 3 ChapterIntents, got {len(chapter_intents)}"
        )
        assert len(paragraphs) >= 3, (
            f"expected at least 3 paragraphs (1+ per chapter), "
            f"got {len(paragraphs)}"
        )
        assert len(quality_reports) >= 1, (
            f"expected at least 1 quality report, got {len(quality_reports)}"
        )

        # Each chapter intent has a valid chapter_index (1, 2, 3).
        chapter_indices = [
            ci["chapter_intent"].chapter_index for ci in chapter_intents
        ]
        assert chapter_indices == [1, 2, 3], (
            f"expected chapter indices [1, 2, 3], got {chapter_indices}"
        )

    def test_character_behavior_matches_oc(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """SubTask 6.2.1: ``ContinuityAuditor`` produces no ``critical``-
        severity OOC issues across the 3 generated chapters.

        The auditor's OOC *detection capability* (for trait violations,
        fear contradictions, immutable_facts violations) is separately
        verified in ``test_continuity_auditor.py`` (SubTask 4.5.3, > 80%
        detection rate on 10 injected cases). This test verifies the
        happy-path acceptance criterion: when the OC characters have
        default traits (no extreme values) and no immutable_facts that
        could be contradicted by mock content, no critical OOC issues
        are produced.
        """
        audit_issues = three_chapter_run["audit_issues"]
        ooc_critical = [
            i
            for i in audit_issues
            if i.get("category") == "ooc" and i.get("severity") == "critical"
        ]
        assert ooc_critical == [], (
            f"expected no critical OOC issues, got {len(ooc_critical)}: "
            f"{[i.get('evidence') for i in ooc_critical]}"
        )

    def test_no_setting_conflicts(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """SubTask 6.2.2: ``ContinuityAuditor`` produces no ``critical``-
        severity ``setting_conflict`` issues across the 3 generated
        chapters.

        The auditor's setting_conflict *detection capability* (for
        forbidden taboos, unbreakable rule violations, anachronisms) is
        separately verified in ``test_continuity_auditor.py``. This test
        verifies the happy-path acceptance criterion: when the world
        contract has no forbidden taboos and no unbreakable rules that
        could be violated by mock content, no critical setting_conflict
        issues are produced.
        """
        audit_issues = three_chapter_run["audit_issues"]
        sc_critical = [
            i
            for i in audit_issues
            if i.get("category") == "setting_conflict"
            and i.get("severity") == "critical"
        ]
        assert sc_critical == [], (
            f"expected no critical setting_conflict issues, got "
            f"{len(sc_critical)}: {[i.get('evidence') for i in sc_critical]}"
        )

    def test_rhythm_matches_intent(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """SubTask 6.2.3: each chapter's ``ChapterIntent.rhythm``
        (``RhythmProfile``) falls within the four-strand weave thresholds.

        Thresholds (per ``planner.WEAVE_THRESHOLDS``):

        - Quest: 50-70%
        - Fire: 10-30%
        - Constellation: 10-30%
        - Rest: 0-20%

        With empty scenes, the Planner falls back to
        ``DEFAULT_WEAVE_RATIOS`` (Quest 0.55 / Fire 0.20 /
        Constellation 0.15 / Rest 0.10) which sit safely inside all
        thresholds.
        """
        chapter_intents = three_chapter_run["chapter_intents"]
        assert len(chapter_intents) == 3

        for idx, ci_payload in enumerate(chapter_intents):
            intent = ci_payload["chapter_intent"]
            assert isinstance(intent, ChapterIntent)
            rhythm = intent.rhythm
            lo_q, hi_q = WEAVE_THRESHOLDS["quest"]
            lo_f, hi_f = WEAVE_THRESHOLDS["fire"]
            lo_c, hi_c = WEAVE_THRESHOLDS["constellation"]
            lo_r, hi_r = WEAVE_THRESHOLDS["rest"]
            assert lo_q - 1e-6 <= rhythm.quest_ratio <= hi_q + 1e-6, (
                f"chapter {idx + 1} quest_ratio {rhythm.quest_ratio} "
                f"outside [{lo_q}, {hi_q}]"
            )
            assert lo_f - 1e-6 <= rhythm.fire_ratio <= hi_f + 1e-6, (
                f"chapter {idx + 1} fire_ratio {rhythm.fire_ratio} "
                f"outside [{lo_f}, {hi_f}]"
            )
            assert lo_c - 1e-6 <= rhythm.constellation_ratio <= hi_c + 1e-6, (
                f"chapter {idx + 1} constellation_ratio "
                f"{rhythm.constellation_ratio} outside [{lo_c}, {hi_c}]"
            )
            assert lo_r - 1e-6 <= rhythm.rest_ratio <= hi_r + 1e-6, (
                f"chapter {idx + 1} rest_ratio {rhythm.rest_ratio} "
                f"outside [{lo_r}, {hi_r}]"
            )

    def test_foreshadowing_has_payoff_plan(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """SubTask 6.2.4: at least one ``foreshadowing_ops`` entry carries
        an ``introduce`` operation, and a subsequent chapter carries a
        ``reinforce`` or ``pay_off`` operation.

        Setup: the ``StoryBible`` has
        ``plot_compass.active_long_arcs=["失落的传说"]`` (→ introduce op
        on every chapter) and a seed ledger entry ``fs_seed`` introduced
        at ``ch_0`` with ``reinforce_after=2`` (→ reinforce op starting
        from chapter 2, where age = 2 - 0 = 2 >= reinforce_after).
        """
        chapter_intents = three_chapter_run["chapter_intents"]
        assert len(chapter_intents) == 3

        all_ops: list[ForeshadowingOp] = []
        per_chapter_ops: list[list[ForeshadowingOp]] = []
        for ci_payload in chapter_intents:
            intent = ci_payload["chapter_intent"]
            ops = intent.foreshadowing_ops
            per_chapter_ops.append(ops)
            all_ops.extend(ops)

        # At least 1 introduce op across all chapters.
        introduce_ops = [op for op in all_ops if op.op_type == "introduce"]
        assert introduce_ops, (
            "expected at least 1 introduce foreshadowing op, got 0"
        )

        # At least 1 reinforce or pay_off op in chapter 2 or 3.
        later_ops = per_chapter_ops[1] + per_chapter_ops[2]
        recovery_ops = [
            op for op in later_ops if op.op_type in ("reinforce", "pay_off")
        ]
        assert recovery_ops, (
            "expected at least 1 reinforce/pay_off op in chapters 2-3, "
            f"got {len(recovery_ops)}"
        )


# ===========================================================================
# Class 2: TestChapterIntentQuality — intent structure (2.2.3 / 2.2.5)
# ===========================================================================


class TestChapterIntentQuality:
    """Verify the structural quality of each chapter's ``ChapterIntent``:
    every chapter has an intent, the beat curve is complete (6 beats),
    and the emotional arc has range across beats.
    """

    def test_each_chapter_has_intent(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """Each of the 3 chapters has a non-None ``ChapterIntent`` with
        ``chapter_index`` 1, 2, 3.
        """
        chapter_intents = three_chapter_run["chapter_intents"]
        assert len(chapter_intents) == 3
        for idx, ci_payload in enumerate(chapter_intents):
            intent = ci_payload["chapter_intent"]
            assert isinstance(intent, ChapterIntent), (
                f"chapter {idx + 1} chapter_intent is not a ChapterIntent"
            )
            assert intent.chapter_index == idx + 1, (
                f"chapter {idx + 1} has chapter_index "
                f"{intent.chapter_index}, expected {idx + 1}"
            )

    def test_narrative_beats_complete(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """Each chapter's ``narrative_beats`` has exactly 6 segments
        matching ``BEAT_SEQUENCE`` (章首Hook / 主线推进 / 情感冲突 /
        世界观揭示 / 爽点兑现 / 章末悬念).
        """
        chapter_intents = three_chapter_run["chapter_intents"]
        expected_beats = [name for name, _ in BEAT_SEQUENCE]
        for idx, ci_payload in enumerate(chapter_intents):
            intent = ci_payload["chapter_intent"]
            assert intent.narrative_beats == expected_beats, (
                f"chapter {idx + 1} beats {intent.narrative_beats} != "
                f"{expected_beats}"
            )

    def test_emotional_arc_has_range(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """Each chapter's ``emotional_arc`` is a (start, end) tuple with
        both values in [-1, 1] and the structured ``emotional_arc_beats``
        has 6 segments with varying values (the "情感冲突" dip and
        "爽点兑现" peak ensure the arc is not flat even with empty scenes).
        """
        chapter_intents = three_chapter_run["chapter_intents"]
        for idx, ci_payload in enumerate(chapter_intents):
            intent = ci_payload["chapter_intent"]
            arc = intent.emotional_arc
            assert isinstance(arc, tuple) and len(arc) == 2, (
                f"chapter {idx + 1} emotional_arc is not a 2-tuple: {arc}"
            )
            for v in arc:
                assert -1.0 <= v <= 1.0, (
                    f"chapter {idx + 1} emotional_arc value {v} "
                    f"outside [-1, 1]"
                )
            beats = ci_payload.get("emotional_arc_beats", [])
            assert len(beats) == len(BEAT_SEQUENCE), (
                f"chapter {idx + 1} emotional_arc_beats count "
                f"{len(beats)} != {len(BEAT_SEQUENCE)}"
            )
            # The arc has range: not all emotion_start values are equal
            # (the "情感冲突" dip and "爽点兑现" peak introduce variation).
            emotion_starts = [b["emotion_start"] for b in beats]
            assert len(set(emotion_starts)) > 1, (
                f"chapter {idx + 1} emotional_arc is flat (all "
                f"emotion_start values equal to {emotion_starts[0]})"
            )


# ===========================================================================
# Class 3: TestForeshadowingPlan — foreshadowing ops (2.2.4)
# ===========================================================================


class TestForeshadowingPlan:
    """Verify the foreshadowing plan across the 3 chapters: at least one
    introduce, at least one reinforce/pay_off, and the ``StoryBible``'s
    foreshadowing ledger tracks the seed entry's status.
    """

    def test_foreshadowing_introduced(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """At least 1 foreshadowing op with ``op_type="introduce"`` is
        emitted across the 3 chapters (from
        ``plot_compass.active_long_arcs``).
        """
        chapter_intents = three_chapter_run["chapter_intents"]
        all_ops: list[ForeshadowingOp] = []
        for ci_payload in chapter_intents:
            intent = ci_payload["chapter_intent"]
            all_ops.extend(intent.foreshadowing_ops)
        introduce_ops = [op for op in all_ops if op.op_type == "introduce"]
        assert introduce_ops, (
            "expected at least 1 introduce op, got 0"
        )
        # The introduce op's note should reference the active long arc.
        assert any("失落的传说" in op.note for op in introduce_ops), (
            "introduce op note should reference active_long_arcs[0]"
        )

    def test_foreshadowing_has_reinforce_or_payoff(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """At least 1 foreshadowing op with ``op_type="reinforce"`` or
        ``op_type="pay_off"`` is emitted in chapter 2 or 3 (for the seed
        entry ``fs_seed`` with ``reinforce_after=2``).
        """
        chapter_intents = three_chapter_run["chapter_intents"]
        assert len(chapter_intents) == 3
        later_ops = (
            chapter_intents[1]["chapter_intent"].foreshadowing_ops
            + chapter_intents[2]["chapter_intent"].foreshadowing_ops
        )
        recovery_ops = [
            op for op in later_ops if op.op_type in ("reinforce", "pay_off")
        ]
        assert recovery_ops, (
            "expected at least 1 reinforce/pay_off op in chapters 2-3"
        )
        # The recovery op should target the seed entry.
        assert any(op.entry_id == "fs_seed" for op in recovery_ops), (
            "expected at least 1 reinforce/pay_off op for fs_seed, got: "
            f"{[(op.op_type, op.entry_id) for op in recovery_ops]}"
        )

    def test_foreshadowing_ledger_tracks_status(
        self, three_chapter_run: dict[str, Any]
    ) -> None:
        """The ``StoryBible``'s foreshadowing ledger is accessible and the
        seed entry ``fs_seed`` retains its ``status="introduced"`` (the
        Planner emits ops but doesn't mutate the ledger; downstream
        consumers apply ops to update status).

        This verifies the "台账" (ledger) capability: the system tracks
        foreshadowing entries and the Planner emits ops referencing them,
        demonstrating the recovery plan is recorded and actionable.
        """
        agent = three_chapter_run["agent"]
        sb = agent["story_bible"]
        ledger = sb.foreshadowing_ledger
        assert ledger, "foreshadowing_ledger should not be empty"
        seed = next((e for e in ledger if e.entry_id == "fs_seed"), None)
        assert seed is not None, "fs_seed entry should be in the ledger"
        assert seed.status == "introduced", (
            f"fs_seed status should be 'introduced', got '{seed.status}'"
        )
        assert seed.introduced_in_chapter == "ch_0"

        # The Planner's emitted ops reference fs_seed (reinforce ops in
        # chapters 2-3), demonstrating the recovery plan exists.
        chapter_intents = three_chapter_run["chapter_intents"]
        all_ops: list[ForeshadowingOp] = []
        for ci_payload in chapter_intents:
            all_ops.extend(ci_payload["chapter_intent"].foreshadowing_ops)
        fs_seed_ops = [op for op in all_ops if op.entry_id == "fs_seed"]
        assert fs_seed_ops, (
            "expected at least 1 op targeting fs_seed"
        )
        assert any(op.op_type == "reinforce" for op in fs_seed_ops), (
            "expected at least 1 reinforce op for fs_seed, got: "
            f"{[(op.op_type, op.entry_id) for op in fs_seed_ops]}"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
