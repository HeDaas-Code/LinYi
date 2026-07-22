"""Planner module: NarrativeLine → ChapterIntent.

Per docs/系统重构方案_v1.md §3.4 (Planner) and §4.4 (节奏控制模型 /
四线编织法), the Planner sits between ``MentalSandbox`` and
``CreationExecutive``. It subscribes to ``data.sandbox.narrative.ready``,
combines the yielded narrative line(s) with ``StoryBible.plot_compass`` /
``foreshadowing_ledger``, and emits ``data.novel.chapter.intent`` carrying
a fully-populated ``ChapterIntent`` dataclass.

The five sub-tasks implemented here (Task 2.2 in
``.trae/specs/refactor-novelist-system-v1/tasks.md``):

- SubTask 2.2.1: subscribe ``data.sandbox.narrative.ready`` → publish
  ``data.novel.chapter.intent``.
- SubTask 2.2.2: four-strand weave (Quest 50-70% / Fire 10-30% /
  Constellation 10-30% / Rest 0-20%) with threshold-violation warnings.
- SubTask 2.2.3: beat-curve generation
  (Hook → 主线推进 → 情感冲突 → 世界观揭示 → 爽点兑现 → 章末悬念).
- SubTask 2.2.4: ``ForeshadowingOp`` (introduce / reinforce / pay_off)
  generation from ``StoryBible.foreshadowing_ledger``.
- SubTask 2.2.5: ``emotional_arc`` 起→终情感值 calculation.

Note on field names: the spec template uses ``ChapterIntent.weave_ratios``
and ``ChapterIntent.beats``, but the actual ``models.ChapterIntent``
dataclass (see ``src/novelist_brain/models.py``) exposes
``rhythm: RhythmProfile`` (which has ``quest_ratio`` / ``fire_ratio`` /
``constellation_ratio`` / ``rest_ratio``) and ``narrative_beats: list[str]``.
We follow the actual dataclass; structured beat info and weave-violation
strings are emitted as additional payload metadata alongside
``chapter_intent`` so downstream modules (and tests) can read them.
"""

from __future__ import annotations

import datetime
import json
import os
import time
from typing import Any

from src.novelist_brain.llm import LLMService, MockLLMService
from src.novelist_brain.models import (
    BusMessage,
    ChapterIntent,
    Conflict,
    ForeshadowingEntry,
    ForeshadowingOp,
    ModuleState,
    NarrativeLine,
    PlotCompass,
    RhythmProfile,
    Scene,
    StoryBible,
    TickDelta,
    WorldStateContract,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import (
    PersistenceManager,
    dataclass_to_dict,
    reconstruct_dataclass,
)


# ---------------------------------------------------------------------------
# Four-strand weave thresholds (§4.4)
# ---------------------------------------------------------------------------
#
# Each tuple is (min_ratio, max_ratio). A ratio outside this range triggers a
# ``weave_violations`` entry. Quest is 50-70%, Fire 10-30%, Constellation
# 10-30%, Rest 0-20%.
WEAVE_THRESHOLDS: dict[str, tuple[float, float]] = {
    "quest": (0.50, 0.70),
    "fire": (0.10, 0.30),
    "constellation": (0.10, 0.30),
    "rest": (0.00, 0.20),
}

# Default weave ratios used when no scenes are available to classify. These
# sit safely inside the legal ranges above.
DEFAULT_WEAVE_RATIOS: dict[str, float] = {
    "quest": 0.55,
    "fire": 0.20,
    "constellation": 0.15,
    "rest": 0.10,
}

# Canonical six-beat sequence (§4.4 figure): chapter opening hook → main
# plot progression → emotional conflict → worldview revelation → cool-point
# payoff → end-of-chapter suspense. Order matters; weights are used to
# allocate paragraphs proportional to the beat's typical length.
BEAT_SEQUENCE: list[tuple[str, float]] = [
    ("章首Hook", 2.0),
    ("主线推进", 3.0),
    ("情感冲突", 2.0),
    ("世界观揭示", 2.0),
    ("爽点兑现", 2.0),
    ("章末悬念", 1.0),
]

# Default paragraph count per chapter when the narrative line carries no
# usable scene-count signal. 12 paragraphs is a comfortable web-novel
# chapter length and lines up with the BEAT_SEQUENCE weights above.
DEFAULT_TARGET_PARAGRAPHS = 12

# Heuristic keyword sets used to classify scenes into the four strands.
_QUEST_KEYWORDS = (
    "战斗", "对抗", "决定", "选择", "达成", "追踪", "推进", "冲突", "目标",
    "失败", "成功", "胜利", "击败", "逃", "追", "夺取", "发现真相",
    "decision", "fight", "pursue", "achieve", "resolve",
)
_FIRE_KEYWORDS = (
    "情感", "情绪", "关系", "信任", "爱", "恨", "信任", "心动", "亲密",
    "争执", "和解", "拥抱", "告白", "心动", "回忆", "怀疑", "妒忌",
    "love", "trust", "emotion", "relationship", "embrace",
)
_CONSTELLATION_KEYWORDS = (
    "神秘", "揭示", "规则", "禁忌", "传说", "未解", "谜", "神话", "力量",
    "古老", "符文", "预言", "命运", "未知", "玄", "魔法",
    "mystery", "forbidden", "ancient", "myth", "reveal", "lore",
)
_REST_KEYWORDS = (
    "日常", "缓冲", "休息", "平静", "闲聊", "晨", "夜", "饭", "茶", "睡",
    "窗", "雨", "街", "走", "坐", "等", "看",
    "morning", "evening", "calm", "rest", "daily", "wait",
)


def _scene_text(scene: Scene) -> str:
    """Return a lowercased concatenation of the scene's text fields."""
    parts = [scene.description or "", scene.setting or ""]
    return " ".join(p for p in parts).lower()


def _classify_scene(scene: Scene) -> str:
    """Classify a single scene into one of the four weave strands.

    The classifier is a soft keyword scorer: each strand accumulates a
    weight from keyword hits plus a small contribution from structural
    signals (conflict_level, emotional_tone, characters count). The strand
    with the highest combined weight wins. When everything is zero, the
    scene defaults to ``rest``.
    """
    text = _scene_text(scene)
    scores: dict[str, float] = {
        "quest": 0.0,
        "fire": 0.0,
        "constellation": 0.0,
        "rest": 0.0,
    }

    for kw in _QUEST_KEYWORDS:
        if kw in text:
            scores["quest"] += 1.0
    for kw in _FIRE_KEYWORDS:
        if kw in text:
            scores["fire"] += 1.0
    for kw in _CONSTELLATION_KEYWORDS:
        if kw in text:
            scores["constellation"] += 1.0
    for kw in _REST_KEYWORDS:
        if kw in text:
            scores["rest"] += 1.0

    # Structural signals.
    conflict_level = float(getattr(scene, "conflict_level", 0.0) or 0.0)
    emotional_tone = float(getattr(scene, "emotional_tone", 0.0) or 0.0)
    char_count = len(scene.characters or [])

    # High conflict → quest-leaning.
    if conflict_level >= 0.5:
        scores["quest"] += 1.0
    # Strong emotion with relationship characters → fire-leaning.
    if abs(emotional_tone) >= 0.4 and char_count >= 2:
        scores["fire"] += 1.0
    # Setting tagged with mysterious-ish location names → constellation.
    setting = (scene.setting or "").lower()
    if any(tok in setting for tok in ("神秘", "禁地", "遗迹", "古", "庙", "塔")):
        scores["constellation"] += 1.0
    # Very low signal → rest.
    if conflict_level < 0.15 and abs(emotional_tone) < 0.15 and not text:
        scores["rest"] += 1.0

    # Tiebreak priority: quest > fire > constellation > rest. This keeps
    # the classifier deterministic and biased toward the dominant strand.
    priority = ["quest", "fire", "constellation", "rest"]
    best = max(priority, key=lambda k: (scores[k], -priority.index(k)))
    if scores[best] <= 0.0:
        return "rest"
    return best


def _parse_chapter_index(value: Any, default: int = 0) -> int:
    """Parse a chapter-index-like string/int into an int.

    ``ForeshadowingEntry.introduced_in_chapter`` is a ``str`` (e.g.
    ``"ch_3"`` or ``"3"``). We extract the first integer we find.
    """
    if value is None:
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    s = str(value).strip()
    if not s:
        return default
    # Find first run of digits.
    digits = ""
    for ch in s:
        if ch.isdigit():
            digits += ch
        elif digits:
            break
    if digits:
        try:
            return int(digits)
        except ValueError:
            return default
    return default


def _clamp_unit(value: float) -> float:
    """Clamp a float into [0.0, 1.0]."""
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value


def _clamp_signed(value: float, lo: float = -1.0, hi: float = 1.0) -> float:
    """Clamp a float into [lo, hi]."""
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


# ---------------------------------------------------------------------------
# Planner
# ---------------------------------------------------------------------------


class Planner(Module):
    """Convert narrative lines into ``ChapterIntent`` for the writer.

    The Planner reads ``StoryBible`` (read-only, supplied via
    :meth:`init` context) and listens to ``data.sandbox.narrative.ready``
    events. For every ready event it builds a ``ChapterIntent`` containing
    the four-strand weave ratios (in ``rhythm``), the six-beat curve (in
    ``narrative_beats`` plus structured ``beats`` metadata), the
    foreshadowing operations (``foreshadowing_ops``), and the chapter's
    start→end emotional arc (``emotional_arc``).

    The ``StoryBible`` itself is never persisted by this module — only the
    Planner's own bookkeeping (chapter counter and intent history) is
    written to ``planner_state/{novel_id}.json``.
    """

    def __init__(
        self,
        name: str = "planner",
        llm_service: LLMService | None = None,
        foreshadowing_reinforce_after: int = 3,
        foreshadowing_payoff_window: tuple[int, int] = (5, 15),
    ) -> None:
        super().__init__(name)
        self._llm: LLMService = (
            llm_service if llm_service is not None else MockLLMService()
        )
        self._foreshadowing_reinforce_after = max(0, int(foreshadowing_reinforce_after))
        win = foreshadowing_payoff_window
        if (
            isinstance(win, (tuple, list))
            and len(win) == 2
            and int(win[0]) <= int(win[1])
        ):
            self._foreshadowing_payoff_window: tuple[int, int] = (
                int(win[0]),
                int(win[1]),
            )
        else:
            self._foreshadowing_payoff_window = (5, 15)

        # Read-only truth source — supplied via init(context).
        self._story_bible: StoryBible | None = None
        self._world_contract: WorldStateContract | None = None
        self._novel_id: str = ""
        self._planner_state_dir: str = "planner_state"
        self._state_path: str = ""

        # Internal bookkeeping.
        self._chapter_index: int = 0
        self._history_intents: list[dict[str, Any]] = []
        self._latest_intent: ChapterIntent | None = None
        self._latest_beats: list[dict[str, Any]] = []
        self._latest_emotional_arc_beats: list[dict[str, Any]] = []
        self._latest_weave_violations: list[str] = []

        # Subscribe to the three required topics. ``control.module.init``
        # lets the host re-initialize the planner in-place; ``data.sandbox.
        # world.updated`` keeps the world projection fresh so the planner
        # can reference newly-revealed locations/rules when classifying
        # scenes into the Constellation strand.
        self.subscribe(
            "data.sandbox.narrative.ready",
            "control.module.init",
            "data.sandbox.world.updated",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "planner",
            "version": "0.1.0",
            "description": (
                "Novel planning module: converts NarrativeLine into "
                "ChapterIntent with four-strand weave, beat curve, "
                "foreshadowing ops and emotional arc."
            ),
            "dependencies": [],
            "category": "novel_planning",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.20,
            custom={
                "chapter_index": 0,
                "intent_count": 0,
                "novel_id": "",
            },
        )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        """Initialize the planner from agent context.

        Expected context keys:

        - ``story_bible``: ``StoryBible | dict | None`` (read-only truth
          source — provides ``plot_compass`` and ``foreshadowing_ledger``).
        - ``world_contract``: ``WorldStateContract | dict | None``.
        - ``novel_v2``: ``{'novel_id': str, 'planner_state_dir': str}``.
        - ``foreshadowing_reinforce_after``: ``int`` (override).
        - ``foreshadowing_payoff_window``: ``(int, int)`` (override).
        - ``llm``: ``LLMService | None``.
        """
        sb = context.get("story_bible")
        if isinstance(sb, StoryBible):
            self._story_bible = sb
        elif isinstance(sb, dict):
            try:
                self._story_bible = StoryBible.from_dict(sb)
            except Exception:
                self._story_bible = None
        else:
            # Allow re-init to keep the previous bible if the caller did
            # not supply a new one.
            if sb is None and self._story_bible is None:
                self._story_bible = None

        wc = context.get("world_contract")
        if isinstance(wc, WorldStateContract):
            self._world_contract = wc
        elif isinstance(wc, dict):
            try:
                self._world_contract = WorldStateContract.from_dict(wc)
            except Exception:
                self._world_contract = None

        novel_v2 = context.get("novel_v2", {}) or {}
        if not isinstance(novel_v2, dict):
            novel_v2 = {}
        self._novel_id = str(novel_v2.get("novel_id", "default") or "default")
        self._planner_state_dir = (
            novel_v2.get("planner_state_dir", "planner_state") or "planner_state"
        )
        self._state_path = os.path.join(
            self._planner_state_dir, f"{self._novel_id}.json"
        )

        # Optional overrides for foreshadowing thresholds.
        if "foreshadowing_reinforce_after" in context:
            try:
                self._foreshadowing_reinforce_after = max(
                    0, int(context["foreshadowing_reinforce_after"])
                )
            except (TypeError, ValueError):
                pass
        if "foreshadowing_payoff_window" in context:
            try:
                win = context["foreshadowing_payoff_window"]
                if isinstance(win, (tuple, list)) and len(win) == 2:
                    lo, hi = int(win[0]), int(win[1])
                    if lo <= hi:
                        self._foreshadowing_payoff_window = (lo, hi)
            except (TypeError, ValueError):
                pass

        # Optional LLM override.
        llm = context.get("llm")
        if isinstance(llm, LLMService):
            self._llm = llm

        # Load any previously persisted planner state.
        self._load_state()

        self._state.custom["chapter_index"] = self._chapter_index
        self._state.custom["novel_id"] = self._novel_id
        self._state.custom["intent_count"] = len(self._history_intents)

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        if message.topic == "data.sandbox.narrative.ready":
            self._handle_narrative_ready(message.payload)
        elif message.topic == "control.module.init":
            payload = message.payload or {}
            if isinstance(payload, dict) and payload:
                # Re-initialize from the supplied context. This lets the
                # host inject a ``story_bible`` after construction.
                self.init(payload)
        elif message.topic == "data.sandbox.world.updated":
            self._handle_world_updated(message.payload)

    def tick(self, delta: TickDelta) -> None:
        self._state.last_tick = delta.absolute_time

    # ------------------------------------------------------------------
    # SubTask 2.2.1: narrative.ready → chapter.intent
    # ------------------------------------------------------------------

    def _handle_narrative_ready(self, payload: Any) -> None:
        """Build a ChapterIntent from the yielded narrative and emit it."""
        if not isinstance(payload, dict):
            return

        # The current ``MentalSandbox`` (sandbox.py:1263) emits
        # ``narrative_line`` (singular). The spec template references
        # ``narrative_lines`` (plural). Support both forms so the Planner
        # works against today's sandbox and against future senders.
        narrative_lines: list[NarrativeLine] = []
        if "narrative_lines" in payload:
            raw_lines = payload["narrative_lines"]
            if isinstance(raw_lines, list):
                for item in raw_lines:
                    narrative_lines.append(self._coerce_narrative_line(item))
        elif "narrative_line" in payload:
            narrative_lines.append(
                self._coerce_narrative_line(payload["narrative_line"])
            )

        # Drop any None entries produced by failed coercion.
        narrative_lines = [n for n in narrative_lines if n is not None]

        depth_metrics = payload.get("depth_metrics") or {}
        if not isinstance(depth_metrics, dict):
            depth_metrics = {}
        simulation_round_raw = payload.get("simulation_round", 0)
        try:
            simulation_round = int(simulation_round_raw)
        except (TypeError, ValueError):
            simulation_round = 0
        skill_checks = payload.get("skill_checks") or []
        if not isinstance(skill_checks, list):
            skill_checks = []
        world_state = payload.get("world_state")
        if world_state is None:
            world_state = payload.get("world_contract")

        intent, beats, emotional_arc_beats, weave_violations = (
            self.generate_chapter_intent(
                narrative_lines=narrative_lines,
                depth_metrics=depth_metrics,
                simulation_round=simulation_round,
                skill_checks=skill_checks,
                world_state=world_state,
            )
        )

        source_narrative_id = ""
        if narrative_lines:
            source_narrative_id = narrative_lines[-1].id

        generated_at = time.time()

        # Cache the latest intent + structured metadata for get_state/to_dict.
        self._latest_intent = intent
        self._latest_beats = beats
        self._latest_emotional_arc_beats = emotional_arc_beats
        self._latest_weave_violations = weave_violations
        self._chapter_index = intent.chapter_index
        self._history_intents.append(
            {
                "chapter_index": intent.chapter_index,
                "source_narrative_id": source_narrative_id,
                "scene_type": intent.scene_type,
                "intent": intent.to_dict(),
                "beats": list(beats),
                "emotional_arc_beats": list(emotional_arc_beats),
                "weave_violations": list(weave_violations),
                "depth_metrics": dict(depth_metrics),
                "simulation_round": simulation_round,
                "generated_at": generated_at,
            }
        )
        # Cap history to keep the state file bounded.
        if len(self._history_intents) > 100:
            self._history_intents = self._history_intents[-100:]

        self._state.custom["chapter_index"] = self._chapter_index
        self._state.custom["intent_count"] = len(self._history_intents)

        self._save_state()

        self._emit(
            topic="data.novel.chapter.intent",
            payload={
                "chapter_intent": intent,
                "source_narrative_id": source_narrative_id,
                "generated_at": generated_at,
                # Structured metadata that does not fit on the dataclass
                # itself but is required by the spec (§3.4 / Task 2.2).
                "beats": beats,
                "emotional_arc_beats": emotional_arc_beats,
                "weave_violations": weave_violations,
                "weave_ratios": {
                    "quest": intent.rhythm.quest_ratio,
                    "fire": intent.rhythm.fire_ratio,
                    "constellation": intent.rhythm.constellation_ratio,
                    "rest": intent.rhythm.rest_ratio,
                },
            },
            channel="data",
        )

    def _handle_world_updated(self, payload: Any) -> None:
        """Refresh the local world projection when the sandbox evolves it."""
        if not isinstance(payload, dict):
            return
        wc = payload.get("world_contract")
        if isinstance(wc, WorldStateContract):
            self._world_contract = wc
        elif isinstance(wc, dict):
            try:
                self._world_contract = WorldStateContract.from_dict(wc)
            except Exception:
                pass

    def _coerce_narrative_line(self, item: Any) -> NarrativeLine | None:
        """Coerce a payload entry into a ``NarrativeLine`` (or None)."""
        if isinstance(item, NarrativeLine):
            return item
        if isinstance(item, dict):
            try:
                reconstructed = reconstruct_dataclass(NarrativeLine, item)
                return reconstructed
            except Exception:
                return None
        return None

    # ------------------------------------------------------------------
    # Public entry point: generate_chapter_intent
    # ------------------------------------------------------------------

    def generate_chapter_intent(
        self,
        narrative_lines: list[NarrativeLine],
        depth_metrics: dict[str, Any] | None = None,
        simulation_round: int = 0,
        skill_checks: list[Any] | None = None,
        world_state: Any = None,
    ) -> tuple[
        ChapterIntent,
        list[dict[str, Any]],
        list[dict[str, Any]],
        list[str],
    ]:
        """Build a ``ChapterIntent`` from the supplied narrative lines.

        Returns a 4-tuple ``(intent, beats, emotional_arc_beats,
        weave_violations)`` where:

        - ``intent`` is a fully-populated :class:`ChapterIntent` (with the
          four-strand ratios inside ``intent.rhythm``, the six beat names
          inside ``intent.narrative_beats``, the foreshadowing operations
          inside ``intent.foreshadowing_ops``, and the chapter's
          start→end emotion inside ``intent.emotional_arc``).
        - ``beats`` is the structured beat curve ``[{beat,
          paragraph_index_range, intent}]`` (spec §3.4 / Task 2.2.3).
        - ``emotional_arc_beats`` is ``[{beat, emotion_start,
          emotion_end}]`` per Task 2.2.5.
        - ``weave_violations`` is a list of human-readable violation
          strings, one per strand that falls outside its legal range.
        """
        depth_metrics = depth_metrics or {}
        skill_checks = skill_checks or []

        # Combine all scenes / conflicts across the supplied lines.
        combined_scenes: list[Scene] = []
        combined_conflicts: list[Conflict] = []
        for line in narrative_lines:
            combined_scenes.extend(line.scenes or [])
            combined_conflicts.extend(line.conflicts or [])

        # Chapter index advances by 1 from the persisted counter.
        next_chapter_index = self._chapter_index + 1

        # Scene-type inference from the combined scenes / conflicts.
        scene_type = self._infer_scene_type(combined_scenes, combined_conflicts)

        # SubTask 2.2.2 — four-strand weave.
        weave_ratios, weave_violations = self._compute_weave_ratios(
            combined_scenes, combined_conflicts
        )

        # SubTask 2.2.3 — six-beat curve.
        target_paragraph_count = self._default_paragraph_count(combined_scenes)
        beats = self._generate_beats(target_paragraph_count, weave_ratios)

        # SubTask 2.2.4 — foreshadowing ops.
        foreshadowing_ops = self._generate_foreshadowing_ops(next_chapter_index)

        # SubTask 2.2.5 — emotional arc.
        emotional_arc, emotional_arc_beats = self._compute_emotional_arc(
            combined_scenes, beats
        )

        # Required characters / settings extracted from the scenes.
        required_characters: list[str] = []
        for scene in combined_scenes:
            for c in scene.characters or []:
                if c and c not in required_characters:
                    required_characters.append(c)
        required_settings: list[str] = []
        for scene in combined_scenes:
            if scene.setting and scene.setting not in required_settings:
                required_settings.append(scene.setting)

        # RhythmProfile carries the four-strand ratios (real dataclass field).
        rhythm = RhythmProfile(
            quest_ratio=round(weave_ratios["quest"], 4),
            fire_ratio=round(weave_ratios["fire"], 4),
            constellation_ratio=round(weave_ratios["constellation"], 4),
            rest_ratio=round(weave_ratios["rest"], 4),
            hook_strength=round(
                self._compute_hook_strength(combined_scenes, depth_metrics), 4
            ),
            cool_point_density=round(
                self._compute_cool_point_density(
                    combined_scenes, combined_conflicts
                ),
                4,
            ),
        )

        narrative_beats = [b["beat"] for b in beats]

        intent = ChapterIntent(
            chapter_index=next_chapter_index,
            scene_type=scene_type,
            narrative_beats=narrative_beats,
            rhythm=rhythm,
            foreshadowing_ops=foreshadowing_ops,
            required_characters=required_characters,
            required_settings=required_settings,
            emotional_arc=emotional_arc,
        )

        return intent, beats, emotional_arc_beats, weave_violations

    # ------------------------------------------------------------------
    # SubTask 2.2.2: four-strand weave
    # ------------------------------------------------------------------

    def _compute_weave_ratios(
        self,
        scenes: list[Scene],
        conflicts: list[Conflict],
    ) -> tuple[dict[str, float], list[str]]:
        """Compute the four-strand ratios and threshold violations.

        Each scene is classified into exactly one strand via
        :func:`_classify_scene`. The ratio for a strand is
        ``count / total_scenes``. When there are no scenes we fall back
        to :data:`DEFAULT_WEAVE_RATIOS` (which sits safely inside all
        legal ranges, so no violations are emitted).

        Active conflicts (``conflict.resolved == False``) lean the
        classification toward ``quest`` by adding an extra fractional
        quest count. This reflects the §4.4 check "Quest: 是否有关键
        进展/挫败" — an unresolved conflict is core plot progression.
        """
        if not scenes:
            ratios = dict(DEFAULT_WEAVE_RATIOS)
            return ratios, self._check_weave_violations(ratios)

        counts = {"quest": 0.0, "fire": 0.0, "constellation": 0.0, "rest": 0.0}
        for scene in scenes:
            strand = _classify_scene(scene)
            counts[strand] += 1.0

        # Unresolved conflicts add a fractional quest weight (0.5 each,
        # capped so it can't dominate a chapter with many conflicts).
        unresolved = sum(1 for c in conflicts if not c.resolved)
        if unresolved > 0:
            counts["quest"] += min(float(unresolved) * 0.5, float(len(scenes)) * 0.5)

        total = sum(counts.values())
        if total <= 0:
            ratios = dict(DEFAULT_WEAVE_RATIOS)
            return ratios, self._check_weave_violations(ratios)

        ratios = {k: _clamp_unit(v / total) for k, v in counts.items()}

        # Renormalize so the four ratios sum to exactly 1.0 (floating-point
        # rounding can leave them at 0.9999…). We add the residual to the
        # largest strand so the correction is invisible.
        residual = round(1.0 - sum(ratios.values()), 6)
        if abs(residual) > 0:
            largest = max(ratios, key=ratios.get)
            ratios[largest] = _clamp_unit(ratios[largest] + residual)

        violations = self._check_weave_violations(ratios)
        return ratios, violations

    def _check_weave_violations(
        self, ratios: dict[str, float]
    ) -> list[str]:
        """Return a human-readable violation string per out-of-range strand."""
        violations: list[str] = []
        label_map = {
            "quest": "Quest 主线",
            "fire": "Fire 情感线",
            "constellation": "Constellation 世界观线",
            "rest": "Rest 休止线",
        }
        for strand, (lo, hi) in WEAVE_THRESHOLDS.items():
            value = ratios.get(strand, 0.0)
            if value < lo - 1e-6:
                violations.append(
                    f"{label_map[strand]} 占比 {value*100:.1f}% "
                    f"低于下限 {lo*100:.0f}%"
                )
            elif value > hi + 1e-6:
                violations.append(
                    f"{label_map[strand]} 占比 {value*100:.1f}% "
                    f"超出上限 {hi*100:.0f}%"
                )
        return violations

    # ------------------------------------------------------------------
    # SubTask 2.2.3: beat curve
    # ------------------------------------------------------------------

    def _default_paragraph_count(self, scenes: list[Scene]) -> int:
        """Pick a paragraph count for the chapter.

        Heuristic: 2 paragraphs per scene, clamped to [6, 24]. When no
        scenes are available, fall back to :data:`DEFAULT_TARGET_PARAGRAPHS`.
        """
        if not scenes:
            return DEFAULT_TARGET_PARAGRAPHS
        candidate = len(scenes) * 2
        if candidate < 6:
            candidate = 6
        if candidate > 24:
            candidate = 24
        return candidate

    def _generate_beats(
        self,
        target_paragraph_count: int,
        weave_ratios: dict[str, float],
    ) -> list[dict[str, Any]]:
        """Generate the six-beat curve with paragraph index ranges.

        Each beat is allocated a number of paragraphs proportional to its
        weight in :data:`BEAT_SEQUENCE`. The minimum allocation is 1
        paragraph per beat so all six beats are always present (spec §4.4
        figure requires all six). ``paragraph_index_range`` is an inclusive
        ``[start, end]`` pair of 0-based indices.
        """
        total_weight = sum(w for _, w in BEAT_SEQUENCE)
        total_paragraphs = max(
            len(BEAT_SEQUENCE), int(target_paragraph_count)
        )

        # Allocate paragraphs per beat (min 1 each).
        raw_allocations = [
            max(1, round(total_paragraphs * (w / total_weight)))
            for _, w in BEAT_SEQUENCE
        ]
        # Adjust to exactly total_paragraphs by distributing the residual
        # to the largest beat (主线推进).
        diff = total_paragraphs - sum(raw_allocations)
        if diff != 0:
            # The "主线推进" beat is index 1 in BEAT_SEQUENCE.
            main_idx = 1
            raw_allocations[main_idx] = max(1, raw_allocations[main_idx] + diff)

        beats: list[dict[str, Any]] = []
        cursor = 0
        for (beat_name, _), alloc in zip(BEAT_SEQUENCE, raw_allocations):
            start = cursor
            end = cursor + max(1, alloc) - 1
            # Don't exceed total_paragraphs - 1.
            if end >= total_paragraphs:
                end = total_paragraphs - 1
            if start > end:
                start = end
            intent_desc = self._beat_intent_description(
                beat_name, weave_ratios
            )
            beats.append(
                {
                    "beat": beat_name,
                    "paragraph_index_range": [start, end],
                    "intent": intent_desc,
                }
            )
            cursor = end + 1
        return beats

    def _beat_intent_description(
        self, beat_name: str, weave_ratios: dict[str, float]
    ) -> str:
        """Return a short Chinese intent string for each beat."""
        quest = weave_ratios.get("quest", 0.0)
        fire = weave_ratios.get("fire", 0.0)
        constellation = weave_ratios.get("constellation", 0.0)
        rest = weave_ratios.get("rest", 0.0)
        if beat_name == "章首Hook":
            return "以一个未解的悬念或异常细节抓住读者注意。"
        if beat_name == "主线推进":
            return (
                f"推进核心冲突（Quest {quest*100:.0f}%）：让主角在目标上"
                "取得关键进展或遭受挫败。"
            )
        if beat_name == "情感冲突":
            return (
                f"放大角色之间的关系张力（Fire {fire*100:.0f}%）：暴露"
                "信任、爱意或敌意的微妙裂痕。"
            )
        if beat_name == "世界观揭示":
            return (
                f"揭示一处世界规则或神秘设定（Constellation "
                f"{constellation*100:.0f}%）：让读者感到世界比想象更大。"
            )
        if beat_name == "爽点兑现":
            return "兑现一个此前埋下的微小承诺，给读者一次情绪释放。"
        if beat_name == "章末悬念":
            return (
                f"留一个钩子（Rest {rest*100:.0f}%）：让下一章的开头"
                "成为读者无法跳过的追问。"
            )
        return ""

    # ------------------------------------------------------------------
    # SubTask 2.2.4: ForeshadowingOp generation
    # ------------------------------------------------------------------

    def _generate_foreshadowing_ops(
        self, current_chapter_index: int
    ) -> list[ForeshadowingOp]:
        """Scan ``StoryBible.foreshadowing_ledger`` and emit ops.

        Rules (per Task 2.2.4):

        - ``introduced`` but not yet ``reinforced`` for
          ``>= foreshadowing_reinforce_after`` chapters → ``reinforce``.
        - ``introduced`` or ``reinforced`` and the chapter index is
          inside the payoff window → ``pay_off``.
        - If the chapter still has Constellation budget, introduce a new
          foreshadowing seed tied to ``plot_compass.active_long_arcs``.

        Entries already marked ``paid_off`` or ``abandoned`` are skipped.
        """
        ops: list[ForeshadowingOp] = []
        if self._story_bible is None:
            return ops

        ledger = self._story_bible.foreshadowing_ledger or []
        win_lo, win_hi = self._foreshadowing_payoff_window

        for entry in ledger:
            if not isinstance(entry, ForeshadowingEntry):
                continue
            status = entry.status
            if status in ("paid_off", "abandoned"):
                continue

            introduced_at = _parse_chapter_index(
                entry.introduced_in_chapter, default=current_chapter_index
            )
            age = max(0, current_chapter_index - introduced_at)

            # Reinforce: introduced but not reinforced for too long.
            if status == "introduced" and age >= self._foreshadowing_reinforce_after:
                ops.append(
                    ForeshadowingOp(
                        op_type="reinforce",
                        entry_id=entry.entry_id,
                        note=(
                            f"伏笔已引入 {age} 章未强化，建议本章"
                            "再次浮现以维持读者记忆。"
                        ),
                    )
                )

            # Pay off: within the configured payoff window.
            if status in ("introduced", "reinforced") and win_lo <= age <= win_hi:
                ops.append(
                    ForeshadowingOp(
                        op_type="pay_off",
                        entry_id=entry.entry_id,
                        note=(
                            f"伏笔已存在 {age} 章，进入回收窗口"
                            f"（{win_lo}-{win_hi}），建议本章兑现。"
                        ),
                    )
                )

        # Introduce a new foreshadowing seed: only one per chapter, derived
        # from the plot compass's active long arcs.
        plot_compass = self._story_bible.plot_compass
        if isinstance(plot_compass, PlotCompass) and plot_compass.active_long_arcs:
            suggested_topic = plot_compass.active_long_arcs[0]
            ops.append(
                ForeshadowingOp(
                    op_type="introduce",
                    entry_id="",  # entry will be assigned on creation
                    note=(
                        f"本章可引入新伏笔，关联长线：{suggested_topic}。"
                    ),
                )
            )

        return ops

    # ------------------------------------------------------------------
    # SubTask 2.2.5: emotional arc
    # ------------------------------------------------------------------

    def _compute_emotional_arc(
        self,
        scenes: list[Scene],
        beats: list[dict[str, Any]],
    ) -> tuple[tuple[float, float], list[dict[str, Any]]]:
        """Compute the chapter's start→end emotional arc.

        Returns:

        - ``(start_emotion, end_emotion)`` — a tuple of floats in
          ``[-1.0, 1.0]`` suitable for ``ChapterIntent.emotional_arc``.
        - ``emotional_arc_beats`` — ``[{beat, emotion_start, emotion_end}]``
          one entry per beat, interpolating from the chapter's start
          emotion to its end emotion with a small mid-chapter dip (the
          "情感冲突" beat) and a small peak before the end (the "爽点兑现"
          beat). This follows the §4.4 rhythm figure: Hook → build →
          emotional dip → reveal → cool-point peak → end suspense drop.
        """
        if not scenes:
            start_emotion = 0.0
            end_emotion = 0.0
        else:
            start_emotion = _clamp_signed(
                float(getattr(scenes[0], "emotional_tone", 0.0) or 0.0)
            )
            end_emotion = _clamp_signed(
                float(getattr(scenes[-1], "emotional_tone", 0.0) or 0.0)
            )

        # If there is only one scene, the end emotion should not equal the
        # start emotion (that would flatten the arc). Nudge it slightly in
        # the direction of the dominant conflict.
        if len(scenes) == 1:
            single_conflict = float(
                getattr(scenes[0], "conflict_level", 0.0) or 0.0
            )
            end_emotion = _clamp_signed(
                start_emotion + (single_conflict - 0.5) * 0.2
            )

        # Per-beat arc: linearly interpolate from start to end, then apply
        # a small dip on "情感冲突" (beat index 2) and a small peak on
        # "爽点兑现" (beat index 4). This yields a recognizable web-novel
        # emotional shape rather than a flat line.
        beat_count = len(beats)
        emotional_arc_beats: list[dict[str, Any]] = []
        if beat_count == 0:
            return (start_emotion, end_emotion), emotional_arc_beats

        delta = end_emotion - start_emotion
        for i, beat in enumerate(beats):
            t_start = i / beat_count
            t_end = (i + 1) / beat_count
            beat_start = start_emotion + delta * t_start
            beat_end = start_emotion + delta * t_end
            beat_name = beat.get("beat", "")

            # Apply beat-specific shaping.
            if beat_name == "情感冲突":
                # Mid-chapter emotional dip — push the beat's low point
                # ~0.2 below the linear interpolation.
                dip = -0.2
                beat_start = _clamp_signed(beat_start + dip * 0.5)
                beat_end = _clamp_signed(beat_end + dip)
            elif beat_name == "爽点兑现":
                # Cool-point peak — push the beat's high point ~0.25 above
                # the linear interpolation, then settle.
                peak = 0.25
                beat_start = _clamp_signed(beat_start + peak * 0.5)
                beat_end = _clamp_signed(beat_end + peak)
            elif beat_name == "章末悬念":
                # End-of-chapter suspense — drop slightly below the linear
                # interpolation so the chapter closes on an unresolved note.
                beat_end = _clamp_signed(beat_end - 0.1)

            emotional_arc_beats.append(
                {
                    "beat": beat_name,
                    "emotion_start": round(beat_start, 4),
                    "emotion_end": round(beat_end, 4),
                }
            )

        # The chapter's end_emotion follows the last beat's end emotion
        # when beats were generated, so the dataclass field stays
        # consistent with the structured arc.
        if emotional_arc_beats:
            end_emotion = emotional_arc_beats[-1]["emotion_end"]

        return (round(start_emotion, 4), round(end_emotion, 4)), emotional_arc_beats

    # ------------------------------------------------------------------
    # Helpers: scene-type inference, hook/cool-point scoring
    # ------------------------------------------------------------------

    def _infer_scene_type(
        self,
        scenes: list[Scene],
        conflicts: list[Conflict],
    ) -> str:
        """Infer the dominant ``scene_type`` for the chapter.

        Looks at the combined scene descriptions for action / dialogue /
        psychological / environment keywords, plus the conflict density.
        Defaults to ``dialogue`` (the most common web-novel default) when
        no signal is available.
        """
        if not scenes:
            return "dialogue"

        text = " ".join(_scene_text(s) for s in scenes)
        avg_conflict = 0.0
        if conflicts:
            avg_conflict = sum(
                float(c.intensity or 0.0) for c in conflicts
            ) / len(conflicts)

        scores = {
            "action": 0.0,
            "dialogue": 0.0,
            "psychological": 0.0,
            "environment": 0.0,
            "transition": 0.0,
        }
        action_kw = ("战斗", "攻击", "追", "逃", "搏斗", "fight", "chase", "attack")
        dialogue_kw = ("说", "问", "答", "对话", "谈论", "said", "asked", "talk")
        psych_kw = (
            "想", "记得", "意识到", "怀疑", "内心", "恐惧", "希望",
            "thought", "remember", "realize", "fear", "hope",
        )
        env_kw = ("场景", "天气", "光", "雨", "街", "建筑", "scene", "weather", "rain")
        transition_kw = ("随后", "之后", "接着", "离开", "前往", "then", "later", "left")

        for kw in action_kw:
            if kw in text:
                scores["action"] += 1.0
        for kw in dialogue_kw:
            if kw in text:
                scores["dialogue"] += 1.0
        for kw in psych_kw:
            if kw in text:
                scores["psychological"] += 1.0
        for kw in env_kw:
            if kw in text:
                scores["environment"] += 1.0
        for kw in transition_kw:
            if kw in text:
                scores["transition"] += 1.0

        if avg_conflict >= 0.7:
            scores["action"] += 1.5

        priority = ["action", "dialogue", "psychological", "environment", "transition"]
        best = max(priority, key=lambda k: (scores[k], -priority.index(k)))
        if scores[best] <= 0.0:
            return "dialogue"
        return best

    def _compute_hook_strength(
        self,
        scenes: list[Scene],
        depth_metrics: dict[str, Any],
    ) -> float:
        """Estimate the chapter's opening hook strength in [0, 1]."""
        # Base on depth_metrics if available.
        hook = 0.0
        if isinstance(depth_metrics, dict):
            try:
                hook = float(depth_metrics.get("hook_strength", 0.0) or 0.0)
            except (TypeError, ValueError):
                hook = 0.0
        # If the first scene carries an above-baseline conflict/emotion
        # signal, boost the hook score.
        if scenes:
            first = scenes[0]
            conflict = float(getattr(first, "conflict_level", 0.0) or 0.0)
            emotion = abs(float(getattr(first, "emotional_tone", 0.0) or 0.0))
            hook = max(hook, _clamp_unit(conflict * 0.6 + emotion * 0.4))
        return _clamp_unit(hook)

    def _compute_cool_point_density(
        self,
        scenes: list[Scene],
        conflicts: list[Conflict],
    ) -> float:
        """Estimate cool-point (爽点) density in [0, 1].

        Heuristic: count scenes whose conflict_level is high (≥0.6) or
        whose |emotional_tone| is high (≥0.5). The density is the ratio
        of such "peak" scenes to total scenes, weighted by the share of
        resolved conflicts (a resolved conflict is itself a cool point).
        """
        if not scenes:
            return 0.0
        peak_scenes = 0
        for s in scenes:
            conflict = float(getattr(s, "conflict_level", 0.0) or 0.0)
            emotion = abs(float(getattr(s, "emotional_tone", 0.0) or 0.0))
            if conflict >= 0.6 or emotion >= 0.5:
                peak_scenes += 1
        density = peak_scenes / len(scenes)
        if conflicts:
            resolved_share = (
                sum(1 for c in conflicts if c.resolved) / len(conflicts)
            )
            density = _clamp_unit(0.5 * density + 0.5 * resolved_share)
        return _clamp_unit(density)

    # ------------------------------------------------------------------
    # Public accessors (used by tests / smoke scripts)
    # ------------------------------------------------------------------

    @property
    def story_bible(self) -> StoryBible | None:
        return self._story_bible

    @property
    def world_contract(self) -> WorldStateContract | None:
        return self._world_contract

    @property
    def chapter_index(self) -> int:
        return self._chapter_index

    @property
    def latest_intent(self) -> ChapterIntent | None:
        return self._latest_intent

    @property
    def latest_beats(self) -> list[dict[str, Any]]:
        return list(self._latest_beats)

    @property
    def latest_emotional_arc_beats(self) -> list[dict[str, Any]]:
        return list(self._latest_emotional_arc_beats)

    @property
    def latest_weave_violations(self) -> list[str]:
        return list(self._latest_weave_violations)

    def get_state(self) -> dict[str, Any]:
        """Return a serializable snapshot of the planner's runtime state."""
        return {
            "active": self._state.active,
            "energy_cost": self._state.energy_cost,
            "last_tick": self._state.last_tick,
            "chapter_index": self._chapter_index,
            "intent_count": len(self._history_intents),
            "novel_id": self._novel_id,
            "has_story_bible": self._story_bible is not None,
            "has_world_contract": self._world_contract is not None,
            "latest_weave_violations": list(self._latest_weave_violations),
            "foreshadowing_reinforce_after": self._foreshadowing_reinforce_after,
            "foreshadowing_payoff_window": list(
                self._foreshadowing_payoff_window
            ),
        }

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _load_state(self) -> None:
        """Load persisted planner state if it exists on disk."""
        if not self._state_path or not os.path.isfile(self._state_path):
            return
        try:
            with open(self._state_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            # Corrupt or unreadable; start fresh.
            return
        if not isinstance(data, dict):
            return
        try:
            self._chapter_index = int(data.get("chapter_index", 0))
        except (TypeError, ValueError):
            self._chapter_index = 0
        history = data.get("history_intents", [])
        if isinstance(history, list):
            self._history_intents = [
                h for h in history if isinstance(h, dict)
            ]
        # Restore latest intent / beats / arc if present.
        latest = data.get("latest_intent")
        if isinstance(latest, dict):
            try:
                self._latest_intent = ChapterIntent.from_dict(latest)
            except Exception:
                self._latest_intent = None
        latest_beats = data.get("latest_beats")
        if isinstance(latest_beats, list):
            self._latest_beats = latest_beats
        latest_arc = data.get("latest_emotional_arc_beats")
        if isinstance(latest_arc, list):
            self._latest_emotional_arc_beats = latest_arc
        latest_violations = data.get("latest_weave_violations")
        if isinstance(latest_violations, list):
            self._latest_weave_violations = [
                str(v) for v in latest_violations
            ]

    def _save_state(self) -> None:
        """Persist the planner's bookkeeping to disk atomically.

        Only the planner's own state (chapter counter, intent history,
        latest intent + structured metadata) is persisted. The
        ``StoryBible`` itself is never written here — it remains the
        caller's responsibility (§4.2.1).
        """
        if not self._state_path:
            return
        latest_intent_dict: dict[str, Any] | None = None
        if self._latest_intent is not None:
            latest_intent_dict = self._latest_intent.to_dict()
        data = {
            "novel_id": self._novel_id,
            "saved_at": datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat(),
            "chapter_index": self._chapter_index,
            "history_intents": list(self._history_intents),
            "latest_intent": latest_intent_dict,
            "latest_beats": list(self._latest_beats),
            "latest_emotional_arc_beats": list(
                self._latest_emotional_arc_beats
            ),
            "latest_weave_violations": list(self._latest_weave_violations),
            "foreshadowing_reinforce_after": self._foreshadowing_reinforce_after,
            "foreshadowing_payoff_window": list(
                self._foreshadowing_payoff_window
            ),
        }
        PersistenceManager.save_atomic(data, self._state_path)

    # ------------------------------------------------------------------
    # to_dict / from_dict (module state serialization)
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "novel_id": self._novel_id,
                "planner_state_dir": self._planner_state_dir,
                "state_path": self._state_path,
                "chapter_index": self._chapter_index,
                "history_intents": list(self._history_intents),
                "latest_intent": (
                    self._latest_intent.to_dict()
                    if self._latest_intent is not None
                    else None
                ),
                "latest_beats": list(self._latest_beats),
                "latest_emotional_arc_beats": list(
                    self._latest_emotional_arc_beats
                ),
                "latest_weave_violations": list(self._latest_weave_violations),
                "foreshadowing_reinforce_after": (
                    self._foreshadowing_reinforce_after
                ),
                "foreshadowing_payoff_window": list(
                    self._foreshadowing_payoff_window
                ),
                "has_story_bible": self._story_bible is not None,
                "has_world_contract": self._world_contract is not None,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._novel_id = data.get("novel_id", "")
        self._planner_state_dir = data.get(
            "planner_state_dir", self._planner_state_dir
        )
        self._state_path = data.get("state_path", "")
        try:
            self._chapter_index = int(data.get("chapter_index", 0))
        except (TypeError, ValueError):
            self._chapter_index = 0
        history = data.get("history_intents", [])
        if isinstance(history, list):
            self._history_intents = [
                h for h in history if isinstance(h, dict)
            ]
        latest = data.get("latest_intent")
        if isinstance(latest, dict):
            try:
                self._latest_intent = ChapterIntent.from_dict(latest)
            except Exception:
                self._latest_intent = None
        else:
            self._latest_intent = None
        latest_beats = data.get("latest_beats", [])
        if isinstance(latest_beats, list):
            self._latest_beats = latest_beats
        latest_arc = data.get("latest_emotional_arc_beats", [])
        if isinstance(latest_arc, list):
            self._latest_emotional_arc_beats = latest_arc
        latest_violations = data.get("latest_weave_violations", [])
        if isinstance(latest_violations, list):
            self._latest_weave_violations = [
                str(v) for v in latest_violations
            ]
        if "foreshadowing_reinforce_after" in data:
            try:
                self._foreshadowing_reinforce_after = max(
                    0, int(data["foreshadowing_reinforce_after"])
                )
            except (TypeError, ValueError):
                pass
        if "foreshadowing_payoff_window" in data:
            win = data["foreshadowing_payoff_window"]
            if isinstance(win, (list, tuple)) and len(win) == 2:
                try:
                    lo, hi = int(win[0]), int(win[1])
                    if lo <= hi:
                        self._foreshadowing_payoff_window = (lo, hi)
                except (TypeError, ValueError):
                    pass

        self._state.custom["chapter_index"] = self._chapter_index
        self._state.custom["novel_id"] = self._novel_id
        self._state.custom["intent_count"] = len(self._history_intents)

    # ------------------------------------------------------------------
    # Emit helper (mirrors OCCharacterSystem's pattern)
    # ------------------------------------------------------------------

    def _emit(
        self, *, topic: str, payload: Any, channel: str = "event"
    ) -> None:
        """Emit a bus message if a router is attached, else no-op."""
        if self._router is None:
            return
        self.emit(topic=topic, payload=payload, channel=channel)
