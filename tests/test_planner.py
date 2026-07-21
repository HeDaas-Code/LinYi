"""Unit tests for ``Planner`` (Task 2.7.2).

Covers SubTask 2.2.1–2.2.5 of the refactor-novelist-system-v1 spec:

- NarrativeLine → ChapterIntent subscription / emission (2.2.1)
- Four-strand weave ratios + threshold violations (2.2.2)
- Six-beat curve generation (2.2.3)
- ForeshadowingOp introduce / reinforce / pay_off (2.2.4)
- emotional_arc start→end + per-beat arc (2.2.5)
- Persistence to ``planner_state/{novel_id}.json``

The tests follow the actual ``planner.py`` / ``models.py`` field names
(which differ from the spec template in several places — notably
``RhythmProfile`` carries ``quest_ratio`` / ``fire_ratio`` /
``constellation_ratio`` / ``rest_ratio`` rather than a ``weave_ratios``
dict, ``ForeshadowingOp`` uses ``op_type`` / ``entry_id`` / ``note`` and
``ChapterIntent.narrative_beats`` is ``list[str]``).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.llm import MockLLMService
from src.novelist_brain.models import (
    BusMessage,
    ChapterIntent,
    ForeshadowingEntry,
    NarrativeLine,
    PlotCompass,
    Scene,
    StoryBible,
    StyleFingerprint,
    WorldStateContract,
)
from src.novelist_brain.planner import (
    BEAT_SEQUENCE,
    DEFAULT_TARGET_PARAGRAPHS,
    Planner,
    _classify_scene,
)
from src.novelist_brain.world_state import create_default_world_state


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_story_bible(
    *,
    with_foreshadowing: bool = True,
    active_long_arcs: list[str] | None = None,
    extra_entries: list[ForeshadowingEntry] | None = None,
) -> StoryBible:
    """Build a minimal but real ``StoryBible`` for tests.

    Includes ``plot_compass`` (with the supplied ``active_long_arcs``),
    ``foreshadowing_ledger`` and an empty ``character_registry`` so the
    Planner exercises the real code paths instead of ``None`` guards.
    """
    ledger: list[ForeshadowingEntry] = []
    if with_foreshadowing:
        ledger.append(
            ForeshadowingEntry(
                entry_id="fs_old",
                description="一盏将熄的灯",
                introduced_in_chapter="ch_1",
                status="introduced",
            )
        )
    if extra_entries:
        ledger.extend(extra_entries)
    return StoryBible(
        novel_id="test_novel",
        title="测试小说",
        genre="文学",
        theme="孤独",
        premise="一个孤独的小说家在记忆与城市之间游走。",
        world_contract=None,
        character_registry={},
        plot_compass=PlotCompass(
            ending_intent="主角与城市达成和解",
            active_long_arcs=active_long_arcs or [],
            scale="long",
            current_arc_position="开端",
        ),
        foreshadowing_ledger=ledger,
        chapter_blueprint=[],
        style_fingerprint=StyleFingerprint(),
        continuity_rules=[],
    )


def _make_planner(
    tmp_path: Path,
    *,
    novel_id: str = "test_novel",
    story_bible: StoryBible | None = None,
    world_contract: WorldStateContract | None = None,
    reinforce_after: int = 3,
    payoff_window: tuple[int, int] = (5, 15),
) -> tuple[Planner, BusRouter]:
    """Build a ``Planner`` registered to a fresh ``BusRouter``.

    The planner state directory is pointed at ``tmp_path / "planner_state"``
    so each test is isolated from the real workspace filesystem.
    """
    planner = Planner(
        foreshadowing_reinforce_after=reinforce_after,
        foreshadowing_payoff_window=payoff_window,
    )
    router = BusRouter()
    planner.register(router)
    state_dir = str(tmp_path / "planner_state")
    planner.init(
        {
            "novel_v2": {"novel_id": novel_id, "planner_state_dir": state_dir},
            "story_bible": story_bible,
            "world_contract": world_contract
            or create_default_world_state(novel_id=novel_id),
            "llm": MockLLMService(seed=42),
        }
    )
    return planner, router


def _send_narrative_ready(
    planner: Planner,
    *,
    narrative_line: NarrativeLine | None = None,
    narrative_lines: list[NarrativeLine] | None = None,
    depth_metrics: dict[str, Any] | None = None,
    simulation_round: int = 3,
) -> None:
    """Inject a ``data.sandbox.narrative.ready`` message directly into the planner.

    Bypasses the router so the test controls ordering precisely; the
    planner's emitted ``data.novel.chapter.intent`` still lands in the
    router inbox for later assertion via :func:`_drain`.
    """
    payload: dict[str, Any] = {
        "simulation_round": simulation_round,
        "depth_metrics": depth_metrics or {},
    }
    if narrative_lines is not None:
        payload["narrative_lines"] = narrative_lines
    elif narrative_line is not None:
        payload["narrative_line"] = narrative_line
    planner.on_bus_message(
        BusMessage(
            source="sandbox",
            topic="data.sandbox.narrative.ready",
            channel="data",
            payload=payload,
        )
    )


def _drain(router: BusRouter, max_rounds: int = 12) -> list[BusMessage]:
    """Flush ``router`` until the inbox is empty, collecting delivered messages."""
    delivered: list[BusMessage] = []
    for _ in range(max_rounds):
        batch = router.flush()
        if not batch:
            break
        delivered.extend(batch)
    return delivered


def _simple_line(scenes: list[Scene] | None = None) -> NarrativeLine:
    """A minimal ``NarrativeLine`` (empty by default)."""
    return NarrativeLine(scenes=scenes or [], conflicts=[])


# ---------------------------------------------------------------------------
# 1. Subscriptions & payload structure (SubTask 2.7.2 / 2.2.1)
# ---------------------------------------------------------------------------


class TestSubscriptionsAndPayload:
    def test_planner_subscribes_to_narrative_ready_and_emits_chapter_intent(
        self, tmp_path: Path
    ) -> None:
        planner, router = _make_planner(tmp_path)
        assert "data.sandbox.narrative.ready" in planner.subscriptions
        assert "control.module.init" in planner.subscriptions
        assert "data.sandbox.world.updated" in planner.subscriptions

        _send_narrative_ready(planner, narrative_line=_simple_line())
        delivered = _drain(router)

        chapter_intents = [
            m for m in delivered if m.topic == "data.novel.chapter.intent"
        ]
        assert len(chapter_intents) == 1
        assert planner.latest_intent is not None
        assert isinstance(planner.latest_intent, ChapterIntent)

    def test_chapter_intent_payload_contains_required_fields(
        self, tmp_path: Path
    ) -> None:
        planner, router = _make_planner(tmp_path)
        _send_narrative_ready(planner, narrative_line=_simple_line())
        delivered = _drain(router)

        chapter_intent_msgs = [
            m for m in delivered if m.topic == "data.novel.chapter.intent"
        ]
        assert len(chapter_intent_msgs) == 1
        payload = chapter_intent_msgs[0].payload
        for key in (
            "chapter_intent",
            "beats",
            "emotional_arc_beats",
            "weave_violations",
            "weave_ratios",
            "source_narrative_id",
            "generated_at",
        ):
            assert key in payload, f"missing payload key: {key}"
        assert isinstance(payload["chapter_intent"], ChapterIntent)
        assert isinstance(payload["beats"], list)
        assert isinstance(payload["emotional_arc_beats"], list)
        assert isinstance(payload["weave_violations"], list)
        assert isinstance(payload["weave_ratios"], dict)
        assert set(payload["weave_ratios"].keys()) == {
            "quest",
            "fire",
            "constellation",
            "rest",
        }

    def test_planner_handles_both_singular_and_plural_narrative_line_payload(
        self, tmp_path: Path
    ) -> None:
        planner, router = _make_planner(tmp_path)

        # Singular form (today's sandbox payload).
        _send_narrative_ready(planner, narrative_line=_simple_line())
        delivered_singular = _drain(router)
        assert any(m.topic == "data.novel.chapter.intent" for m in delivered_singular)
        assert planner.chapter_index == 1

        # Plural form (spec template / future senders).
        _send_narrative_ready(
            planner, narrative_lines=[_simple_line(), _simple_line()]
        )
        delivered_plural = _drain(router)
        assert any(m.topic == "data.novel.chapter.intent" for m in delivered_plural)
        assert planner.chapter_index == 2

    def test_chapter_index_increments_per_narrative_ready_event(
        self, tmp_path: Path
    ) -> None:
        planner, router = _make_planner(tmp_path)
        for i in range(1, 4):
            _send_narrative_ready(planner, narrative_line=_simple_line())
            _drain(router)
            assert planner.chapter_index == i
            assert planner.latest_intent is not None
            assert planner.latest_intent.chapter_index == i

    def test_planner_without_story_bible_uses_defaults(self, tmp_path: Path) -> None:
        # No story_bible supplied → Planner must still emit a ChapterIntent
        # with the default weave ratios and an empty foreshadowing_ops list.
        planner, router = _make_planner(tmp_path, story_bible=None)
        assert planner.story_bible is None

        _send_narrative_ready(planner, narrative_line=_simple_line())
        delivered = _drain(router)

        assert any(m.topic == "data.novel.chapter.intent" for m in delivered)
        assert planner.latest_intent is not None
        assert planner.latest_intent.foreshadowing_ops == []
        # The six-beat curve is still produced.
        assert len(planner.latest_beats) == len(BEAT_SEQUENCE)


# ---------------------------------------------------------------------------
# 2. Four-strand weave (SubTask 2.7.2 / 2.2.2)
# ---------------------------------------------------------------------------


class TestWeaveRatios:
    def test_weave_ratios_sum_to_one(self, tmp_path: Path) -> None:
        planner, _ = _make_planner(tmp_path)
        intent, _, _, _ = planner.generate_chapter_intent(
            narrative_lines=[_simple_line()]
        )
        total = (
            intent.rhythm.quest_ratio
            + intent.rhythm.fire_ratio
            + intent.rhythm.constellation_ratio
            + intent.rhythm.rest_ratio
        )
        assert abs(total - 1.0) < 1e-6

    def test_weave_ratios_within_thresholds_emits_no_violations(
        self, tmp_path: Path
    ) -> None:
        # No scenes → DEFAULT_WEAVE_RATIOS, which sit safely inside every
        # legal range (Quest 50-70 / Fire 10-30 / Constellation 10-30 /
        # Rest 0-20).
        planner, _ = _make_planner(tmp_path)
        _, _, _, violations = planner.generate_chapter_intent(
            narrative_lines=[_simple_line()]
        )
        assert violations == []

    def test_weave_ratios_violating_quest_threshold_emits_violation(
        self, tmp_path: Path
    ) -> None:
        # Three Fire-leaning scenes → Quest strand gets 0% → below 50%.
        fire_scenes = [
            Scene(
                description="他告白并拥抱她，心动与信任在情感中生长，回忆消解了怀疑",
                characters=["a", "b"],
                setting="咖啡馆",
                conflict_level=0.0,
                emotional_tone=0.6,
            )
            for _ in range(3)
        ]
        planner, _ = _make_planner(tmp_path)
        intent, _, _, violations = planner.generate_chapter_intent(
            narrative_lines=[NarrativeLine(scenes=fire_scenes, conflicts=[])]
        )
        assert intent.rhythm.quest_ratio < 0.5
        assert any("Quest 主线" in v for v in violations)

    def test_weave_ratios_violating_fire_threshold_emits_violation(
        self, tmp_path: Path
    ) -> None:
        # Three Quest-leaning scenes → Fire strand gets 0% → below 10%.
        quest_scenes = [
            Scene(
                description="主角决定击败敌人并追击逃犯，达成关键目标",
                characters=[],
                setting="战场",
                conflict_level=0.8,
                emotional_tone=0.0,
            )
            for _ in range(3)
        ]
        planner, _ = _make_planner(tmp_path)
        intent, _, _, violations = planner.generate_chapter_intent(
            narrative_lines=[NarrativeLine(scenes=quest_scenes, conflicts=[])]
        )
        assert intent.rhythm.fire_ratio < 0.1
        assert any("Fire 情感线" in v for v in violations)

    def test_scene_classification_assigns_correct_strand(self) -> None:
        quest_scene = Scene(
            description="主角决定击败敌人并追击逃犯，达成关键目标",
            characters=[],
            setting="战场",
            conflict_level=0.8,
            emotional_tone=0.0,
        )
        fire_scene = Scene(
            description="告白与拥抱，心动与信任，情感与回忆",
            characters=["a", "b"],
            setting="咖啡馆",
            conflict_level=0.0,
            emotional_tone=0.6,
        )
        const_scene = Scene(
            description="古老符文中揭示一个神秘预言与未知命运",
            characters=[],
            setting="禁地",
            conflict_level=0.0,
            emotional_tone=0.0,
        )
        rest_scene = Scene(
            description="",
            characters=[],
            setting="家",
            conflict_level=0.0,
            emotional_tone=0.0,
        )
        assert _classify_scene(quest_scene) == "quest"
        assert _classify_scene(fire_scene) == "fire"
        assert _classify_scene(const_scene) == "constellation"
        assert _classify_scene(rest_scene) == "rest"


# ---------------------------------------------------------------------------
# 3. Beat curve (SubTask 2.7.2 / 2.2.3)
# ---------------------------------------------------------------------------


class TestBeatCurve:
    def test_beats_have_six_standard_segments(self, tmp_path: Path) -> None:
        planner, _ = _make_planner(tmp_path)
        _, beats, _, _ = planner.generate_chapter_intent(
            narrative_lines=[_simple_line()]
        )
        assert len(beats) == len(BEAT_SEQUENCE)
        assert [b["beat"] for b in beats] == [name for name, _ in BEAT_SEQUENCE]

    def test_beats_paragraph_index_ranges_cover_all_paragraphs_no_overlap(
        self, tmp_path: Path
    ) -> None:
        planner, _ = _make_planner(tmp_path)
        _, beats, _, _ = planner.generate_chapter_intent(
            narrative_lines=[_simple_line()]
        )
        # First beat starts at paragraph 0.
        assert beats[0]["paragraph_index_range"][0] == 0
        # Adjacent beats must be contiguous (no gaps, no overlaps).
        for i in range(len(beats) - 1):
            cur_end = beats[i]["paragraph_index_range"][1]
            next_start = beats[i + 1]["paragraph_index_range"][0]
            assert cur_end < next_start, f"overlap between beat {i} and {i + 1}"
            assert next_start == cur_end + 1, f"gap between beat {i} and {i + 1}"
        # Last beat must end at the final paragraph index.
        last_end = beats[-1]["paragraph_index_range"][1]
        assert last_end + 1 == DEFAULT_TARGET_PARAGRAPHS

    def test_beats_each_has_intent_description(self, tmp_path: Path) -> None:
        planner, _ = _make_planner(tmp_path)
        _, beats, _, _ = planner.generate_chapter_intent(
            narrative_lines=[_simple_line()]
        )
        for beat in beats:
            assert "intent" in beat
            assert isinstance(beat["intent"], str)
            assert beat["intent"].strip() != ""


# ---------------------------------------------------------------------------
# 4. ForeshadowingOp (SubTask 2.7.2 / 2.2.4)
# ---------------------------------------------------------------------------


class TestForeshadowingOps:
    def test_foreshadowing_reinforce_op_generated_for_old_introduced_entry(
        self, tmp_path: Path
    ) -> None:
        # fs_old introduced at ch_1. Push the planner forward 4 chapters so
        # on the 4th narrative.ready, next_chapter_index=4 and age=3, which
        # is >= reinforce_after=3 → reinforce. payoff_window=(100, 200)
        # keeps the entry out of the pay_off window.
        sb = _make_story_bible(active_long_arcs=[])
        planner, router = _make_planner(
            tmp_path,
            story_bible=sb,
            reinforce_after=3,
            payoff_window=(100, 200),
        )
        for _ in range(4):
            _send_narrative_ready(planner, narrative_line=_simple_line())
        _drain(router)

        intent = planner.latest_intent
        assert intent is not None
        reinforce_ops = [
            op for op in intent.foreshadowing_ops if op.op_type == "reinforce"
        ]
        assert any(op.entry_id == "fs_old" for op in reinforce_ops)

    def test_foreshadowing_pay_off_op_generated_within_window(
        self, tmp_path: Path
    ) -> None:
        # Advance 6 chapters so next_chapter_index=6, age=5 ∈ [5, 15].
        # reinforce_after=100 keeps the entry out of the reinforce branch.
        sb = _make_story_bible(active_long_arcs=[])
        planner, router = _make_planner(
            tmp_path,
            story_bible=sb,
            reinforce_after=100,
            payoff_window=(5, 15),
        )
        for _ in range(6):
            _send_narrative_ready(planner, narrative_line=_simple_line())
        _drain(router)

        intent = planner.latest_intent
        assert intent is not None
        payoff_ops = [
            op for op in intent.foreshadowing_ops if op.op_type == "pay_off"
        ]
        assert any(op.entry_id == "fs_old" for op in payoff_ops)

    def test_foreshadowing_introduce_op_generated_from_plot_compass_arcs(
        self, tmp_path: Path
    ) -> None:
        # plot_compass.active_long_arcs[0] should be referenced in the
        # introduce op's note. reinforce_after / payoff_window pushed out
        # so only the introduce op fires on the first chapter.
        sb = _make_story_bible(active_long_arcs=["失落的传说"])
        planner, router = _make_planner(
            tmp_path,
            story_bible=sb,
            reinforce_after=100,
            payoff_window=(100, 200),
        )
        _send_narrative_ready(planner, narrative_line=_simple_line())
        _drain(router)

        intent = planner.latest_intent
        assert intent is not None
        introduce_ops = [
            op for op in intent.foreshadowing_ops if op.op_type == "introduce"
        ]
        assert len(introduce_ops) == 1
        assert "失落的传说" in introduce_ops[0].note

    def test_foreshadowing_paid_off_entries_are_skipped(self, tmp_path: Path) -> None:
        # paid_off / abandoned entries must not trigger reinforce or pay_off,
        # and an empty active_long_arcs list suppresses the introduce op.
        sb = StoryBible(
            novel_id="test_novel",
            plot_compass=PlotCompass(),
            foreshadowing_ledger=[
                ForeshadowingEntry(
                    entry_id="fs_paid",
                    description="x",
                    introduced_in_chapter="ch_1",
                    status="paid_off",
                ),
                ForeshadowingEntry(
                    entry_id="fs_abandoned",
                    description="y",
                    introduced_in_chapter="ch_1",
                    status="abandoned",
                ),
            ],
        )
        planner, router = _make_planner(
            tmp_path,
            story_bible=sb,
            reinforce_after=1,
            payoff_window=(1, 100),
        )
        # Advance 4 chapters so age would normally trigger both ops.
        for _ in range(4):
            _send_narrative_ready(planner, narrative_line=_simple_line())
        _drain(router)

        intent = planner.latest_intent
        assert intent is not None
        assert intent.foreshadowing_ops == []


# ---------------------------------------------------------------------------
# 5. Emotional arc (SubTask 2.7.2 / 2.2.5)
# ---------------------------------------------------------------------------


class TestEmotionalArc:
    def test_emotional_arc_returns_start_and_end_values(self, tmp_path: Path) -> None:
        planner, _ = _make_planner(tmp_path)
        intent, _, _, _ = planner.generate_chapter_intent(
            narrative_lines=[_simple_line()]
        )
        assert isinstance(intent.emotional_arc, tuple)
        assert len(intent.emotional_arc) == 2
        for value in intent.emotional_arc:
            assert isinstance(value, float)
            assert -1.0 <= value <= 1.0

    def test_emotional_arc_beats_six_segments_with_emotion_transitions(
        self, tmp_path: Path
    ) -> None:
        planner, _ = _make_planner(tmp_path)
        _, _, emotional_arc_beats, _ = planner.generate_chapter_intent(
            narrative_lines=[_simple_line()]
        )
        assert len(emotional_arc_beats) == len(BEAT_SEQUENCE)
        for beat in emotional_arc_beats:
            assert "beat" in beat
            assert "emotion_start" in beat
            assert "emotion_end" in beat
            assert -1.0 <= beat["emotion_start"] <= 1.0
            assert -1.0 <= beat["emotion_end"] <= 1.0

    def test_emotional_arc_end_matches_final_beat_emotion_end(
        self, tmp_path: Path
    ) -> None:
        planner, _ = _make_planner(tmp_path)
        intent, _, emotional_arc_beats, _ = planner.generate_chapter_intent(
            narrative_lines=[_simple_line()]
        )
        assert emotional_arc_beats
        # The dataclass field must be consistent with the structured arc.
        assert intent.emotional_arc[1] == emotional_arc_beats[-1]["emotion_end"]


# ---------------------------------------------------------------------------
# 6. Persistence & serialization (SubTask 2.7.2)
# ---------------------------------------------------------------------------


class TestPersistence:
    def test_to_dict_from_dict_round_trip(self, tmp_path: Path) -> None:
        planner, _ = _make_planner(tmp_path, story_bible=_make_story_bible())
        _send_narrative_ready(planner, narrative_line=_simple_line())
        _send_narrative_ready(planner, narrative_line=_simple_line())

        snapshot = planner.to_dict()
        restored = Planner()
        restored.from_dict(snapshot)

        assert restored.chapter_index == planner.chapter_index
        assert len(restored._history_intents) == len(planner._history_intents)
        assert restored.latest_intent is not None
        assert planner.latest_intent is not None
        assert (
            restored.latest_intent.chapter_index
            == planner.latest_intent.chapter_index
        )
        assert (
            restored.latest_intent.narrative_beats
            == planner.latest_intent.narrative_beats
        )
        assert restored.latest_beats == planner.latest_beats
        assert (
            restored.latest_emotional_arc_beats
            == planner.latest_emotional_arc_beats
        )

    def test_planner_state_persists_across_restart(self, tmp_path: Path) -> None:
        state_dir = str(tmp_path / "planner_state")
        novel_id = "restart_novel"

        # First session: emit one chapter intent.
        planner1 = Planner()
        router1 = BusRouter()
        planner1.register(router1)
        planner1.init(
            {
                "novel_v2": {"novel_id": novel_id, "planner_state_dir": state_dir},
                "story_bible": _make_story_bible(),
                "world_contract": create_default_world_state(novel_id=novel_id),
                "llm": MockLLMService(seed=42),
            }
        )
        _send_narrative_ready(planner1, narrative_line=_simple_line())
        _drain(router1)
        assert planner1.chapter_index == 1

        # Second session: a fresh planner should load the persisted state.
        planner2 = Planner()
        router2 = BusRouter()
        planner2.register(router2)
        planner2.init(
            {
                "novel_v2": {"novel_id": novel_id, "planner_state_dir": state_dir},
                "story_bible": _make_story_bible(),
                "world_contract": create_default_world_state(novel_id=novel_id),
                "llm": MockLLMService(seed=42),
            }
        )
        assert planner2.chapter_index == 1
        # The next narrative.ready must continue advancing the counter.
        _send_narrative_ready(planner2, narrative_line=_simple_line())
        _drain(router2)
        assert planner2.chapter_index == 2

    def test_story_bible_not_persisted_in_state(self, tmp_path: Path) -> None:
        state_dir = str(tmp_path / "planner_state")
        novel_id = "sb_leak_novel"
        planner = Planner()
        router = BusRouter()
        planner.register(router)
        planner.init(
            {
                "novel_v2": {"novel_id": novel_id, "planner_state_dir": state_dir},
                "story_bible": _make_story_bible(active_long_arcs=["长线A"]),
                "world_contract": create_default_world_state(novel_id=novel_id),
                "llm": MockLLMService(seed=42),
            }
        )
        _send_narrative_ready(planner, narrative_line=_simple_line())
        _drain(router)

        state_path = Path(state_dir) / f"{novel_id}.json"
        assert state_path.is_file()
        with open(state_path, encoding="utf-8") as f:
            data = json.load(f)

        serialized = json.dumps(data, ensure_ascii=False)

        # The StoryBible truth source must NOT be embedded in the planner
        # state file (§4.2.1 — only the planner's own bookkeeping is
        # persisted).
        assert "story_bible" not in data
        assert "plot_compass" not in data
        assert "character_registry" not in data
        assert "foreshadowing_ledger" not in data
        assert "world_contract" not in data
        assert "premise" not in data
        # Foreshadowing entry descriptions must not leak through, either.
        assert "一盏将熄的灯" not in serialized


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
