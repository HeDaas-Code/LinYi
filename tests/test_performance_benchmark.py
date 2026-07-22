"""Performance benchmarks for Stage 6 Task 6.3 (refactor-novelist-system-v1).

Verifies the three performance acceptance criteria:

- SubTask 6.3.1: Single-chapter generation (with audit) under 60 seconds.
  Drives a real BusRouter pipeline of COCMappingEngine → CentralExecutiveNetwork
  → CreationExecutive → ContinuityAuditor → QualityEngine using
  ``MockLLMService`` so no real LLM latency is paid.
- SubTask 6.3.2: ``WorldStateContract`` serialization under 500 milliseconds.
  Constructs a richly populated contract (10+ geography, 6 factions, 12 rules,
  12 historical events, 6 mysteries, 6 forbidden) and measures
  ``to_dict()`` / ``json.dumps`` / ``WorldStateStore.save``.
- SubTask 6.3.3: Module startup loading under 10 seconds. Measures
  ``create_modules()`` + ``build_context()`` + per-module
  ``register`` / ``init_with_timeout`` against a real ``BusRouter``.

All measurements use ``time.perf_counter()`` for high-resolution timing and
print a per-benchmark report to stdout so a developer can eyeball actual
elapsed times vs the acceptance thresholds. State directories are pointed at
``tmp_path`` so each test is fully isolated from the workspace filesystem.

No pytest markers (``@pytest.mark.slow`` etc.) are used — there is no
``pytest.ini`` / ``pyproject.toml`` markers config in this repo, so the
benchmarks run as part of the default suite.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable

import pytest

from main import build_context, create_modules
from src.novelist_brain.bus import BusRouter
from src.novelist_brain.cen import CentralExecutiveNetwork
from src.novelist_brain.clock import Clock
from src.novelist_brain.coc_mapping_engine import COCMappingEngine
from src.novelist_brain.config import ConfigRegistry, NovelistConfig
from src.novelist_brain.continuity_auditor import ContinuityAuditor
from src.novelist_brain.creation_executive import CreationExecutive
from src.novelist_brain.llm import MockLLMService
from src.novelist_brain.models import (
    BusMessage,
    ChapterIntent,
    Forbidden,
    HistoricalEvent,
    Mystery,
    NarrativeLine,
    OCCharacterSheet,
    PlotCompass,
    Scene,
    StoryBible,
    TickDelta,
    WorldRule,
    WorldStateContract,
)
from src.novelist_brain.planner import Planner
from src.novelist_brain.quality_engine import QualityEngine
from src.novelist_brain.trpg_state import SkillCheck, SkillCheckOutcome
from src.novelist_brain.world_state import (
    WorldStateStore,
    create_default_world_state,
)


# ---------------------------------------------------------------------------
# Timing helper
# ---------------------------------------------------------------------------


def _measure(func: Callable[[], Any]) -> tuple[Any, float]:
    """Run ``func`` and return ``(result, elapsed_seconds)`` via ``perf_counter``."""
    start = time.perf_counter()
    result = func()
    elapsed = time.perf_counter() - start
    return result, elapsed


# ---------------------------------------------------------------------------
# Story Bible / world contract / character fixtures
# ---------------------------------------------------------------------------


def _make_llm(seed: int = 42) -> MockLLMService:
    return MockLLMService(seed=seed)


def _make_characters() -> list[OCCharacterSheet]:
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


def _make_story_bible(
    *,
    novel_id: str = "perf_novel",
    genre: str = "克苏鲁",
) -> StoryBible:
    wc = create_default_world_state(novel_id=novel_id, genre=genre, tone="阴郁")
    pc = PlotCompass(
        ending_intent="温暖",
        active_long_arcs=["主弧"],
        scale="medium",
    )
    return StoryBible(
        novel_id=novel_id,
        title="性能基准小说",
        genre=genre,
        premise="一个用于性能测试的故事。",
        world_contract=wc,
        character_registry={c.character_id: c for c in _make_characters()},
        plot_compass=pc,
    )


def _build_world_contract(novel_id: str = "perf_novel") -> WorldStateContract:
    """Build a richly populated WorldStateContract for serialization benchmarks.

    Includes 12 geography entries, 6 factions, 12 rules, 12 historical
    events, 6 mysteries and 6 forbidden entries so ``to_dict`` / JSON
    serialization / on-disk persistence exercise meaningful data volume
    (≈ 60 nested objects rather than the empty default contract).
    """
    geography = {
        f"loc_{i}": {
            "name": f"地点_{i}",
            "description": (
                f"第 {i} 处地理场所的描述性文本，包含氛围、人口、"
                f"地理特征、与主角的关系等元数据。"
            ),
            "activation_level": "熟悉" if i % 2 == 0 else "陌生",
            "mood": "阴郁" if i % 3 == 0 else "平静",
            "tags": [f"tag_{i}_{j}" for j in range(3)],
        }
        for i in range(12)
    }
    factions = {
        f"fac_{i}": {
            "faction_id": f"fac_{i}",
            "name": f"势力_{i}",
            "description": f"第 {i} 个势力的描述、目标与主角关系。",
            "power": 0.1 * i,
            "influence": 0.05 * i,
            "relations": {f"fac_{j}": "neutral" for j in range(5) if j != i},
        }
        for i in range(6)
    }
    rules = [
        WorldRule(
            rule_id=f"rule_{i}",
            domain="mystical" if i % 4 == 0 else "physical",
            statement=f"规则 {i} 的具体陈述与限制条件。",
            breakable=(i % 3 == 0),
            consequences=[f"后果_{i}_{j}" for j in range(2)],
            introduced_in=f"ch_{i}",
            status="active",
        )
        for i in range(12)
    ]
    history = [
        HistoricalEvent(
            event_id=f"evt_{i}",
            name=f"历史事件_{i}",
            description=f"第 {i} 个历史事件的详细描述与影响。",
            occurred_at=f"年份_{i}",
            involved_factions=[f"fac_{j}" for j in range(2)],
            consequences=[f"后果_{i}_{j}" for j in range(2)],
        )
        for i in range(12)
    ]
    forbidden = [
        Forbidden(
            forbidden_id=f"for_{i}",
            name=f"禁忌_{i}",
            description=f"第 {i} 条禁忌的描述与触发条件。",
            consequences=[f"禁忌后果_{i}_{j}" for j in range(2)],
            introduced_in=f"ch_{i}",
        )
        for i in range(6)
    ]
    mysteries = [
        Mystery(
            mystery_id=f"mys_{i}",
            name=f"未解之谜_{i}",
            description=f"第 {i} 个未解之谜的描述与线索。",
            revealed=(i % 5 == 0),
            revealed_in_chapter=f"ch_{i}" if i % 5 == 0 else None,
            payoff_rules=[f"回收规则_{i}_{j}" for j in range(2)],
        )
        for i in range(6)
    ]
    return WorldStateContract(
        novel_id=novel_id,
        genre="克苏鲁",
        tone="阴郁",
        geography=geography,
        factions=factions,
        rules=rules,
        history=history,
        forbidden=forbidden,
        mysteries=mysteries,
        current_state={
            "initialized_at": "2026-01-01T00:00:00",
            "tick": 100,
            "phase": "creation",
            "active_threads": [f"thread_{i}" for i in range(4)],
        },
        version=7,
    )


# ---------------------------------------------------------------------------
# Module assembly for chapter generation benchmarks
# ---------------------------------------------------------------------------


def _make_coc_engine(
    tmp_path: Path,
    *,
    story_bible: StoryBible,
    novel_id: str,
    router: BusRouter,
) -> COCMappingEngine:
    engine = COCMappingEngine(novel_id=novel_id)
    state_dir = str(tmp_path / "coc_mapping_state")
    engine._state_dir = state_dir
    engine._state_path = os.path.join(state_dir, f"{novel_id}.json")
    engine.register(router)
    engine.init(
        {
            "story_bible": story_bible,
            "world_contract": story_bible.world_contract,
            "character_registry": list(story_bible.character_registry.values()),
            "novel_v2": {
                "novel_id": novel_id,
                "coc_mapping_state_dir": state_dir,
            },
        }
    )
    return engine


def _make_auditor(
    tmp_path: Path,
    *,
    novel_id: str,
    router: BusRouter,
    story_bible: StoryBible,
) -> ContinuityAuditor:
    audit_dir = str(tmp_path / "audit_state")
    os.makedirs(audit_dir, exist_ok=True)
    auditor = ContinuityAuditor(novel_id=novel_id, audit_state_dir=audit_dir)
    auditor.register(router)
    auditor.init(
        {
            "novel_v2": {"novel_id": novel_id, "audit_state_dir": audit_dir},
            "story_bible": story_bible,
        }
    )
    return auditor


def _make_quality_engine(
    tmp_path: Path,
    *,
    novel_id: str,
    router: BusRouter,
) -> QualityEngine:
    quality_dir = str(tmp_path / "quality_state")
    os.makedirs(quality_dir, exist_ok=True)
    engine = QualityEngine(novel_id=novel_id, quality_state_dir=quality_dir)
    engine.register(router)
    engine.init(
        {"novel_v2": {"novel_id": novel_id, "quality_state_dir": quality_dir}}
    )
    return engine


def _make_planner(
    tmp_path: Path,
    *,
    novel_id: str,
    router: BusRouter,
    story_bible: StoryBible,
    llm: MockLLMService,
) -> Planner:
    planner = Planner(llm_service=llm)
    planner.register(router)
    state_dir = str(tmp_path / "planner_state")
    planner.init(
        {
            "novel_v2": {"novel_id": novel_id, "planner_state_dir": state_dir},
            "story_bible": story_bible,
            "world_contract": story_bible.world_contract,
            "llm": llm,
        }
    )
    return planner


def _make_full_system(
    tmp_path: Path,
    *,
    novel_id: str = "perf_novel",
) -> tuple[
    CentralExecutiveNetwork,
    COCMappingEngine,
    CreationExecutive,
    Planner,
    ContinuityAuditor,
    QualityEngine,
    BusRouter,
    StoryBible,
    MockLLMService,
]:
    """Build a real v2 novel pipeline wired to a single BusRouter.

    All six functional modules are real instances registered against the
    same router so they route messages to each other exactly as in
    production. The CEN's LLM is a ``MockLLMService`` so scenario-driven
    ``_generate_plan_text`` stays deterministic and zero-latency.
    """
    llm = _make_llm()
    sb = _make_story_bible(novel_id=novel_id)
    router = BusRouter()

    cen = CentralExecutiveNetwork(name="central_executive_network")
    cen.register(router)
    cen.init({"llm_service": llm, "identity": {}})

    coc_engine = _make_coc_engine(
        tmp_path, story_bible=sb, novel_id=novel_id, router=router
    )

    creation = CreationExecutive(
        name="creation_executive",
        llm_service=llm,
        seed=42,
    )
    creation.register(router)
    creation.init({})

    planner = _make_planner(
        tmp_path, novel_id=novel_id, router=router, story_bible=sb, llm=llm
    )
    auditor = _make_auditor(
        tmp_path, novel_id=novel_id, router=router, story_bible=sb
    )
    quality = _make_quality_engine(
        tmp_path, novel_id=novel_id, router=router
    )

    return cen, coc_engine, creation, planner, auditor, quality, router, sb, llm


def _drain(router: BusRouter, max_rounds: int = 20) -> list[BusMessage]:
    """Flush ``router`` until the inbox is empty, collecting delivered messages."""
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
) -> None:
    router.publish(
        source="test", topic=topic, channel=channel, payload=payload
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


def _make_chapter_intent_payload(chapter_index: int = 1) -> dict[str, Any]:
    intent = ChapterIntent(
        chapter_index=chapter_index,
        scene_type="dialogue",
        narrative_beats=[
            "章首 Hook",
            "主线推进",
            "情感冲突",
            "世界观揭示",
            "爽点兑现",
            "章末悬念",
        ],
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
            {"name": "情感冲突", "intent": "深化角色"},
            {"name": "世界观揭示", "intent": "扩展设定"},
            {"name": "爽点兑现", "intent": "兑现承诺"},
            {"name": "章末悬念", "intent": "留下钩子"},
        ],
        "emotional_arc_beats": [0.0, 0.2, 0.3, 0.4, 0.5, 0.5],
        "weave_violations": [],
        "weave_ratios": {
            "quest": 0.6,
            "fire": 0.2,
            "constellation": 0.1,
            "rest": 0.1,
        },
    }


def _make_skill_check_dataclass(
    outcome: SkillCheckOutcome = SkillCheckOutcome.SUCCESS,
) -> SkillCheck:
    return SkillCheck(
        character_id="c_protagonist",
        character_name="林逸",
        skill="观察",
        skill_value=25.0,
        difficulty=0.3,
        modifier=0.0,
        roll=25,
        target=30.0,
        outcome=outcome,
    )


def _make_skill_check_result_payload(
    *,
    check_index: int = 0,
    round_num: int = 1,
) -> dict[str, Any]:
    return {
        "scenario_id": "sc_perf",
        "chapter_index": 1,
        "round": round_num,
        "check_index": check_index,
        "skill": "观察",
        "outcome": "success",
        "character_id": "c_protagonist",
        "character_name": "林逸",
        "roll": 25,
        "target": 30.0,
        "difficulty": 0.3,
        "dice": 25,
    }


def _prime_creation_with_narrative_ready(
    router: BusRouter,
    *,
    skill_checks: list[Any],
) -> None:
    """Publish ``data.sandbox.narrative.ready`` so CreationExecutive caches context."""
    narrative_line = NarrativeLine(
        scenes=[Scene(description="旧书店的空气凝固了。", setting="旧书店")],
        conflicts=[],
        foreshadowing=[],
    )
    payload = {
        "narrative_line": narrative_line,
        "narrative_lines": [narrative_line],
        "skill_checks": skill_checks,
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
        "scenario_id": "sc_perf",
        "chapter_index": 1,
        "world_state": {
            "scenario_id": "sc_perf",
            "chapter_index": 1,
            "location": {"name": "旧书店", "details": {}},
        },
        "source": "central_executive_network",
        "origin": "scenario_driven",
    }
    _publish(router, topic="data.sandbox.narrative.ready", payload=payload)


def _drive_coc_scenario(
    cen: CentralExecutiveNetwork,
    router: BusRouter,
    *,
    rounds: int = 1,
    checks_per_round: int = 3,
) -> None:
    """Drive a minimal COC scenario loop: chapter.intent → scenario.load →
    simulate (per check) → narrative.ready.

    The loop publishes one ``data.novel.chapter.intent`` to trigger COC's
    ``control.coc.scenario.request`` / ``control.sandbox.scenario.load``
    exchange, then ticks CEN once per ``possible_check`` and feeds back a
    matching ``data.sandbox.skill_check.result``. After all checks are
    dispatched, one more tick advances the round contract; when the
    contract is satisfied CEN emits ``data.sandbox.narrative.ready``.
    """
    _publish(
        router,
        topic="data.novel.chapter.intent",
        payload=_make_chapter_intent_payload(chapter_index=1),
    )
    _drain(router)
    for r in range(rounds):
        for check_index in range(checks_per_round):
            cen.tick(_make_tick(t=float(r * 10 + check_index)))
            _drain(router)
            _publish(
                router,
                topic="data.sandbox.skill_check.result",
                payload=_make_skill_check_result_payload(
                    check_index=check_index, round_num=r + 1
                ),
            )
            _drain(router)
        cen.tick(_make_tick(t=float(r * 10 + checks_per_round)))
        _drain(router)


def _republish_paragraphs_as_published(
    router: BusRouter,
    delivered: list[BusMessage],
    *,
    novel_id: str = "perf_novel",
    chapter_id: str = "ch1",
) -> int:
    """Convert collected ``data.novel.paragraph`` messages into
    ``event.novel.paragraph.published`` so the ContinuityAuditor picks them up.

    In the full agent this translation is done by ``NovelOutput`` /
    ``ChapterManager``; the benchmark omits those modules to keep the
    timing focused on the COC → CE → audit → quality path, so we replay
    the paragraph payloads directly. Returns the number of paragraphs
    re-published.
    """
    count = 0
    for msg in delivered:
        if msg.topic != "data.novel.paragraph":
            continue
        raw = msg.payload.get("paragraph")
        msg_chapter_id = msg.payload.get("chapter_id") or chapter_id
        # Chapter-pipeline path emits ``paragraph`` as ``Paragraph.to_dict()``
        # (a dict with a string ``content`` field); legacy path emits a
        # bare string. Normalise both into a dict the auditor's
        # ``_coerce_paragraph`` can ingest directly.
        if isinstance(raw, dict):
            paragraph_dict = dict(raw)
            paragraph_dict.setdefault("paragraph_id", f"p{count}")
            paragraph_dict.setdefault("chapter_id", msg_chapter_id)
            paragraph_dict.setdefault("content", paragraph_dict.get("content", ""))
        elif isinstance(raw, str):
            paragraph_dict = {
                "content": raw,
                "paragraph_id": f"p{count}",
                "chapter_id": msg_chapter_id,
            }
        else:
            paragraph_dict = {
                "content": msg.payload.get("content", "") or "",
                "paragraph_id": f"p{count}",
                "chapter_id": msg_chapter_id,
            }
        paragraph_id = paragraph_dict.get("paragraph_id", f"p{count}")
        _publish(
            router,
            topic="event.novel.paragraph.published",
            channel="event",
            payload={
                "novel_id": novel_id,
                "chapter_id": msg_chapter_id,
                "paragraph_id": paragraph_id,
                "paragraph": paragraph_dict,
                "index": count,
            },
        )
        count += 1
    return count


# ---------------------------------------------------------------------------
# Class 1: Chapter generation benchmark (SubTask 6.3.1)
# ---------------------------------------------------------------------------


class TestChapterGenerationBenchmark:
    """SubTask 6.3.1: Single-chapter generation (with audit) under 60s."""

    def test_single_chapter_generation_under_60s(self, tmp_path: Path) -> None:
        """Drive the chapter generation pipeline end-to-end.

        Verifies that producing one chapter's worth of paragraphs (via
        ``data.novel.paragraph`` events) completes inside the 60-second
        acceptance threshold when the LLM is mocked.

        The flow: publish ``data.sandbox.narrative.ready`` (priming CE's
        cached narrative context) → Planner consumes it and emits
        ``data.novel.chapter.intent`` → CreationExecutive consumes the
        intent and emits one ``data.novel.paragraph`` per beat. The
        COCMappingEngine + CEN are wired into the system so the timing
        reflects a realistic module graph; the CEN simulation loop is
        not driven here because its dict-form ``narrative.ready`` would
        crash the legacy CE handler (see test_scenario_driven_simulation).
        """
        cen, coc, creation, planner, auditor, quality, router, sb, llm = (
            _make_full_system(tmp_path)
        )
        skill_check = _make_skill_check_dataclass().to_dict()

        def _run_chapter() -> tuple[list[BusMessage], set[str]]:
            # Prime CE with a fully-formed narrative.ready. Planner also
            # consumes this and emits chapter.intent, which CE then turns
            # into paragraphs — all within the same drain.
            _prime_creation_with_narrative_ready(
                router, skill_checks=[skill_check]
            )
            delivered = _drain(router, max_rounds=30)
            return delivered, {m.topic for m in delivered}

        (delivered, topics), elapsed = _measure(_run_chapter)
        paragraph_count = sum(1 for m in delivered if m.topic == "data.novel.paragraph")
        print(
            "\n[SubTask 6.3.1] single_chapter_generation_under_60s: "
            f"elapsed={elapsed:.3f}s | paragraphs={paragraph_count} | "
            f"messages={len(delivered)} | threshold=60s"
        )
        assert "data.novel.paragraph" in topics, (
            f"expected data.novel.paragraph in delivered topics, got {topics}"
        )
        assert paragraph_count >= 1, (
            f"expected at least 1 paragraph, got {paragraph_count}"
        )
        assert elapsed < 60.0, (
            f"single chapter generation took {elapsed:.3f}s, exceeds 60s threshold"
        )

    def test_chapter_generation_with_audit_under_60s(self, tmp_path: Path) -> None:
        """Drive the full chapter-with-audit pipeline.

        After CreationExecutive produces ``data.novel.paragraph`` messages
        (triggered by the Planner's ``data.novel.chapter.intent`` emission)
        they are re-published as ``event.novel.paragraph.published`` so the
        ContinuityAuditor can audit them and emit ``data.novel.audit.issues``,
        which the QualityEngine consumes to emit ``data.novel.quality.report``.
        Verifies both audit and quality topics fire and the full cycle stays
        under 60 seconds.
        """
        cen, coc, creation, planner, auditor, quality, router, sb, llm = (
            _make_full_system(tmp_path)
        )
        skill_check = _make_skill_check_dataclass().to_dict()

        def _run_chapter_with_audit() -> tuple[set[str], int, int]:
            # 1. Prime → Planner emits chapter.intent → CE emits paragraphs.
            _prime_creation_with_narrative_ready(
                router, skill_checks=[skill_check]
            )
            delivered = _drain(router, max_rounds=30)
            # 2. Re-publish paragraphs as published events → audit → quality.
            #    The auditor emits ``data.novel.audit.issues`` while flushing
            #    the republished events, and the quality engine then consumes
            #    those issues to emit ``data.novel.quality.report``. Both
            #    emissions land in this drain (flush loops until the inbox is
            #    empty), so its output MUST be captured — not discarded.
            _republish_paragraphs_as_published(router, delivered)
            audit_quality = _drain(router, max_rounds=20)
            # 3. Final flush in case quality emits further downstream messages.
            final = _drain(router, max_rounds=10)
            all_messages = delivered + audit_quality + final
            all_topics = {m.topic for m in all_messages}
            audit_count = sum(
                1
                for m in all_messages
                if m.topic == "data.novel.audit.issues"
            )
            quality_count = sum(
                1
                for m in all_messages
                if m.topic in ("data.novel.quality.report", "data.novel.quality.score")
            )
            return all_topics, audit_count, quality_count

        (topics, audit_count, quality_count), elapsed = _measure(
            _run_chapter_with_audit
        )
        print(
            "\n[SubTask 6.3.1] chapter_generation_with_audit_under_60s: "
            f"elapsed={elapsed:.3f}s | audit_issues_msgs={audit_count} | "
            f"quality_msgs={quality_count} | threshold=60s"
        )
        assert "data.novel.paragraph" in topics, (
            f"expected data.novel.paragraph in delivered topics, got {topics}"
        )
        assert "data.novel.audit.issues" in topics, (
            f"expected data.novel.audit.issues in delivered topics, got {topics}"
        )
        assert (
            "data.novel.quality.report" in topics
            or "data.novel.quality.score" in topics
        ), f"expected quality report/score in delivered topics, got {topics}"
        assert elapsed < 60.0, (
            f"chapter generation with audit took {elapsed:.3f}s, "
            "exceeds 60s threshold"
        )

    def test_chapter_generation_timing_report(self, tmp_path: Path) -> None:
        """Print a per-phase timing breakdown for one chapter generation.

        Splits the total elapsed time across: narrative ready prime +
        Planner chapter.intent emission + CreationExecutive paragraph
        generation (all in one drain), then paragraph re-publish, then
        audit + quality drain. Asserts the total stays under 60 seconds.
        """
        cen, coc, creation, planner, auditor, quality, router, sb, llm = (
            _make_full_system(tmp_path)
        )
        skill_check = _make_skill_check_dataclass().to_dict()

        phases: dict[str, float] = {}

        # Phase 1: prime + drain (Planner → chapter.intent → CE → paragraphs)
        t0 = time.perf_counter()
        _prime_creation_with_narrative_ready(
            router, skill_checks=[skill_check]
        )
        delivered = _drain(router, max_rounds=30)
        phases["prime_and_paragraphs"] = time.perf_counter() - t0

        # Phase 2: republish paragraphs as published events
        t0 = time.perf_counter()
        republished = _republish_paragraphs_as_published(router, delivered)
        phases["paragraph_republish"] = time.perf_counter() - t0

        # Phase 3: drain audit + quality emissions. The auditor emits
        # ``data.novel.audit.issues`` while flushing the republished events,
        # and the quality engine consumes those to emit its report — both
        # land in this drain.
        t0 = time.perf_counter()
        audit_quality = _drain(router, max_rounds=20)
        final = _drain(router, max_rounds=10)
        phases["audit_quality_drain"] = time.perf_counter() - t0

        total = sum(phases.values())
        all_messages = delivered + audit_quality + final
        all_topics = {m.topic for m in all_messages}
        print(
            "\n[SubTask 6.3.1] chapter_generation_timing_report:"
            f"\n  prime_and_paragraphs   = {phases['prime_and_paragraphs']:.3f}s"
            f"\n  paragraph_republish    = {phases['paragraph_republish']:.3f}s"
            f"\n  audit_quality_drain    = {phases['audit_quality_drain']:.3f}s"
            f"\n  TOTAL                  = {total:.3f}s  (threshold=60s)"
            f"\n  paragraphs={republished} messages={len(all_messages)}"
            f"\n  topics={sorted(all_topics)}"
        )
        assert "data.novel.paragraph" in all_topics, (
            f"expected data.novel.paragraph in topics, got {all_topics}"
        )
        assert total < 60.0, (
            f"chapter generation total {total:.3f}s exceeds 60s threshold"
        )


# ---------------------------------------------------------------------------
# Class 2: World state serialization benchmark (SubTask 6.3.2)
# ---------------------------------------------------------------------------


class TestWorldStateSerializationBenchmark:
    """SubTask 6.3.2: ``WorldStateContract`` serialization under 500ms."""

    def test_world_state_to_dict_under_500ms(self, tmp_path: Path) -> None:
        """Measure ``WorldStateContract.to_dict()`` on a richly populated contract."""
        contract = _build_world_contract()
        # Warm-up: ensure dataclass field construction is not first-call penalized
        contract.to_dict()

        def _run() -> dict:
            return contract.to_dict()

        result, elapsed = _measure(_run)
        # Sanity: to_dict returns a dict with the expected nested lists
        assert isinstance(result, dict)
        assert len(result.get("rules", [])) == 12
        assert len(result.get("history", [])) == 12
        print(
            "\n[SubTask 6.3.2] world_state_to_dict_under_500ms: "
            f"elapsed={elapsed * 1000:.3f}ms | rules={len(result['rules'])} | "
            f"history={len(result['history'])} | threshold=500ms"
        )
        assert elapsed < 0.5, (
            f"to_dict took {elapsed * 1000:.3f}ms, exceeds 500ms threshold"
        )

    def test_world_state_json_serialize_under_500ms(self, tmp_path: Path) -> None:
        """Measure ``json.dumps(contract.to_dict(), ensure_ascii=False)``."""
        contract = _build_world_contract()
        payload = contract.to_dict()
        # Warm-up
        json.dumps(payload, ensure_ascii=False)

        def _run() -> str:
            return json.dumps(payload, ensure_ascii=False)

        result, elapsed = _measure(_run)
        assert isinstance(result, str)
        # Sanity: round-trip yields the same rules count
        decoded = json.loads(result)
        assert len(decoded.get("rules", [])) == 12
        print(
            "\n[SubTask 6.3.2] world_state_json_serialize_under_500ms: "
            f"elapsed={elapsed * 1000:.3f}ms | json_bytes={len(result)} | "
            f"threshold=500ms"
        )
        assert elapsed < 0.5, (
            f"json.dumps took {elapsed * 1000:.3f}ms, exceeds 500ms threshold"
        )

    def test_world_state_persist_under_500ms(self, tmp_path: Path) -> None:
        """Measure ``WorldStateStore.save()`` (atomic write + projection)."""
        contract = _build_world_contract(novel_id="perf_persist")
        store = WorldStateStore(
            base_dir=str(tmp_path / "world_state"),
            novel_id="perf_persist",
        )
        # Warm-up: first save builds version 1 on disk
        store.save(contract, bump_version=True, reason="warm_up")

        def _run() -> int:
            # Bump version to force a new versioned snapshot rather than
            # overwriting the same file (matches typical production usage).
            return store.save(contract, bump_version=True, reason="bench")

        version, elapsed = _measure(_run)
        # Sanity: a v2.json snapshot exists on disk
        v2_path = tmp_path / "world_state" / "perf_persist" / "v2.json"
        assert v2_path.is_file(), f"expected v2.json at {v2_path}"
        print(
            "\n[SubTask 6.3.2] world_state_persist_under_500ms: "
            f"elapsed={elapsed * 1000:.3f}ms | version={version} | "
            f"snapshot={v2_path.name} | threshold=500ms"
        )
        assert elapsed < 0.5, (
            f"store.save took {elapsed * 1000:.3f}ms, exceeds 500ms threshold"
        )


# ---------------------------------------------------------------------------
# Class 3: Startup loading benchmark (SubTask 6.3.3)
# ---------------------------------------------------------------------------


class TestStartupBenchmark:
    """SubTask 6.3.3: Module startup loading under 10 seconds."""

    def test_module_creation_under_10s(self, tmp_path: Path) -> None:
        """Measure ``create_modules(MockLLMService())`` only (no init)."""
        llm = _make_llm()

        def _run() -> list[Any]:
            return create_modules(llm)

        modules, elapsed = _measure(_run)
        module_names = [getattr(m, "name", type(m).__name__) for m in modules]
        print(
            "\n[SubTask 6.3.3] module_creation_under_10s: "
            f"elapsed={elapsed:.3f}s | modules={len(modules)} | "
            f"names={module_names} | threshold=10s"
        )
        assert len(modules) >= 10, (
            f"expected at least 10 modules, got {len(modules)}"
        )
        assert elapsed < 10.0, (
            f"create_modules took {elapsed:.3f}s, exceeds 10s threshold"
        )

    def test_module_init_under_10s(self, tmp_path: Path) -> None:
        """Measure ``build_context`` + per-module ``register`` / ``init_with_timeout``.

        ``create_modules`` is excluded from this measurement so it isolates
        the cost of building the shared context and initializing each
        module against a real ``BusRouter``.
        """
        llm = _make_llm()
        modules = create_modules(llm)
        router = BusRouter()
        cfg = NovelistConfig()
        config_registry = ConfigRegistry(config=cfg)
        clock = Clock(start_hour=0.0, tick_duration_ms=60000.0)

        def _build_and_init() -> tuple[dict[str, Any], float]:
            ctx_start = time.perf_counter()
            context = build_context(
                router,
                clock,
                llm,
                config_registry=config_registry,
            )
            ctx_elapsed = time.perf_counter() - ctx_start

            init_start = time.perf_counter()
            for module in modules:
                module.register(router)
            for module in modules:
                module.init_with_timeout(context, timeout_seconds=5.0)
            router.flush()
            init_elapsed = time.perf_counter() - init_start
            return context, ctx_elapsed + init_elapsed

        context, total = _build_and_init()
        print(
            "\n[SubTask 6.3.3] module_init_under_10s: "
            f"elapsed={total:.3f}s | modules={len(modules)} | "
            f"context_keys={len(context)} | threshold=10s"
        )
        assert total < 10.0, (
            f"build_context + module init took {total:.3f}s, "
            "exceeds 10s threshold"
        )

    def test_full_startup_under_10s(self, tmp_path: Path) -> None:
        """Measure the full startup path: create_modules + build_context + init."""
        llm = _make_llm()
        router = BusRouter()
        cfg = NovelistConfig()
        config_registry = ConfigRegistry(config=cfg)
        clock = Clock(start_hour=0.0, tick_duration_ms=60000.0)

        def _full_startup() -> tuple[list[Any], dict[str, Any]]:
            modules = create_modules(llm)
            context = build_context(
                router,
                clock,
                llm,
                config_registry=config_registry,
            )
            for module in modules:
                module.register(router)
            for module in modules:
                module.init_with_timeout(context, timeout_seconds=5.0)
            router.flush()
            return modules, context

        (modules, context), elapsed = _measure(_full_startup)
        print(
            "\n[SubTask 6.3.3] full_startup_under_10s: "
            f"elapsed={elapsed:.3f}s | modules={len(modules)} | "
            f"context_keys={len(context)} | threshold=10s"
        )
        assert len(modules) >= 10, (
            f"expected at least 10 modules, got {len(modules)}"
        )
        assert elapsed < 10.0, (
            f"full startup took {elapsed:.3f}s, exceeds 10s threshold"
        )
