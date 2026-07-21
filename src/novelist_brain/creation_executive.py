"""Creation executive module for the novelist brain prototype."""

from __future__ import annotations

import hashlib
import random
import time
from typing import Any

from src.novelist_brain import prompts
from src.novelist_brain.llm import LLMCallError, LLMService, MockLLMService
from src.novelist_brain.models import (
    BusMessage,
    ChapterIntent,
    ModuleState,
    NarrativeLine,
    Paragraph,
    Scene,
    TickDelta,
    Trace,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass
from src.novelist_brain.trpg import narrate_skill_check
from src.novelist_brain.trpg_state import SkillCheck, SkillCheckOutcome


def _looks_like_prose(text: str) -> bool:
    """Heuristic: does this text look like Chinese prose, not reasoning?"""
    if not text or len(text) < 50:
        return False
    # Count Chinese characters.
    chinese_chars = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    if chinese_chars < 80:
        return False
    # If English letters dominate, it's reasoning.
    english_letters = sum(1 for ch in text if ch.isascii() and ch.isalpha())
    if english_letters > chinese_chars:
        return False
    return True


_PROSE_TEMPLATES: dict[str, list[str]] = {
    "opening": [
        "{setting}在{time_of_day}屏住了呼吸，仿佛整个世界都在等待{protagonist}迈出第一步。苍白的光线落在窗台上，尘埃像悬浮在记忆与当下之间的思绪一样缓缓漂移。",
        "在{setting}，时间转向了内部。{protagonist}站在门槛上，知道一旦跨过去，就必须承认某些已经悄悄组装多日的东西。",
        "窗外，{setting}以灰色的增量展开。{protagonist}从一个静止的点注视着它，好像整个{time_of_day}都是一句写出来只为被修改的句子。",
    ],
    "scene_progression": [
        "{protagonist}穿过{setting}，每一步都回荡着只有孤独才能放大的意义。这个地方似乎倾身靠近，好奇于{protagonist}背负的重量。",
        "{setting}里的每一件物品都因境遇而显得锋利——桌子的边缘，窗帘的褶皱，远处钟表丈量剩余寂静的声音。",
        "{setting}不提供安慰，只提供在场。{protagonist}接受了这一点，明白有些房间靠倾听而非说话来保守秘密。",
    ],
    "rendered_scene": [
        "接下来发生的事缓慢展开：{description}{protagonist}以一种知道平凡时刻才是真正人生情节的清晰观察着它。",
        "{protagonist}还在试图命名那种感觉，这时{description}这感觉不像惊讶，更像延迟了多年的认出。",
        "然后，仿佛这一刻一直在等待许可：{description}{protagonist}注意到空气似乎改变了对沉默的主意。",
        "没有什么宣告自己，然而有什么发生了移动：{description}{protagonist}小心翼翼地捧着这个画面，怕它碎掉。",
        "下一件事以碎片形式显露：{description}{protagonist}在理解它之前就先认出了它，就像在黑暗的房间里认出某个声音。",
    ],
    "dialogue": [
        "“我一直在想你说的话，”{char1}承认，话语像飞蛾一样逃出。{char2}移开目光。“有些事不是用来完成的，”{char2}回答，“只能被携带。”",
        "“你还记得什么时候这很简单吗？”{char1}问。{char2}微笑，但没有抵达眼睛。“我记得我们假装它很简单的时候，”{char2}说。",
        "“故事一直在我眼前变化，”{char1}轻声说。{char2}点头。“这就是你还活着的证明，”{char2}回答。",
    ],
    "monologue": [
        "{protagonist}只对空房间说出这些话，但它们听起来像是一封写给永远不会读到的人的信：‘即使故事忘了我，我还在这里。’",
        "出声地，{protagonist}什么也没说；但内在有一个声音不断重复同一行，好像在练习一句可能永远不会到来的忏悔。",
    ],
    "trace_texture": [
        "在此时此刻的表面之下，动着往日残留的渣滓——一段{trace_role}不是作为事实归来，而是作为天气，改变着{protagonist}触及的一切的温度。",
        "记忆未经允许地抵达，一段{trace_role}被压在下午的纸页之间，边缘已被反复阅读磨软。",
    ],
    "closing": [
        "于是{time_of_day}沉入它自身不确定的结局，留给{protagonist}一种奇特的孤独：终于理解了下一个句子，却仍然需要勇气去写出它。",
        "当光线最终移动时，{protagonist}仍停在原地，像捧着一份脆弱的稿子一样捧着这个时刻：再多一段，再多一次沉默，再多一步，走向那个正在慢慢成真的故事。",
    ],
    "expansion": [
        "远处的什么地方有狗吠，那声音似乎穿越了很长的距离才抵达{protagonist}，好像连噪音也累了。",
        "空气闻起来像尚未落下的雨，一种被悬置的承诺，{protagonist}像呼吸一个秘密一样把它吸入。",
        "很长一段时间里，除了影子没有什么在移动，它们在地板上拉长，像一个拥有世界上所有时间的叙述者那样耐心。",
        "那是一种让人意识到自己心跳的寂静，每一次脉搏都是一个小小的提醒：身体，至少，仍然忠于现在时。",
    ],
}


class CreationExecutive(Module):
    """Converts a ready narrative line into a literary paragraph.

    The creation executive listens for ``data.sandbox.narrative.ready``,
    queries memory for traces that can enrich the current narrative, and
    composes a 200-500 word paragraph that contains scene description,
    character action or dialogue, and emotional atmosphere.  The module is
    designed to work with the built-in :class:`MockLLMService` so the
    prototype runs without external LLM dependencies.

    Paragraph output is gated to the ``creation`` phase so that 林逸 writes
    in the evening as configured by his rhythm preferences.
    """

    def __init__(
        self,
        name: str = "creation_executive",
        llm_service: LLMService | None = None,
        seed: int | None = None,
    ) -> None:
        super().__init__(name)
        self._seed = seed
        self._llm = llm_service if llm_service is not None else MockLLMService()
        self._rng = random.Random(seed)
        self._current_narrative_line: NarrativeLine | None = None
        self._draft_buffer: list[str] = []
        self._style_profile: dict[str, Any] = {}
        self._focus_stack: list[str] = []
        self._pending_query: bool = False
        self._trace_results: list[Trace] = []
        self._identity_constraints: dict[str, Any] = {}
        self._attachment_tone: dict[str, Any] | None = None
        self._current_phase: str | None = None

        # Stage-2 chapter pipeline cache (Task 2.3). Populated by
        # ``data.sandbox.narrative.ready`` and ``data.novel.chapter.intent``;
        # consumed by ``_generate_paragraphs_for_chapter``. These caches
        # are deliberately transient — they are NOT round-tripped through
        # ``to_dict`` / ``from_dict`` because the upstream Planner/Sandbox
        # will re-emit them on the next simulation cycle.
        self._latest_chapter_intent: ChapterIntent | None = None
        self._latest_chapter_intent_metadata: dict[str, Any] = {}
        self._latest_narrative_lines: list[NarrativeLine] = []
        self._latest_skill_checks: list[Any] = []
        self._latest_world_state: Any = None
        self._latest_source_narrative_id: str = ""
        # Per-chapter paragraph counter (1-indexed internally; emitted as
        # 0-indexed ``index`` in the ``data.novel.paragraph`` payload to
        # match the ChapterManager convention).
        self._chapter_paragraph_index: int = 0
        # chapter_id override set by ``control.novel.chapter.write``;
        # falls back to ``f"ch_{chapter_index}"`` when unset.
        self._chapter_write_chapter_id: str | None = None
        # Tracks the ``chapter_index`` of the last chapter we generated
        # paragraphs for, so a duplicate ``data.novel.chapter.intent`` for
        # the same chapter doesn't re-emit the same paragraphs. Bypassed
        # by ``control.novel.chapter.write`` (which forces regeneration).
        self._last_generated_chapter_index: int = -1
        self._force_regeneration: bool = False

        self.subscribe(
            "data.sandbox.narrative.ready",
            "data.identity.constraint",
            "data.identity.updated",
            "data.memory.trace.query.result",
            "control.creative.tone",
            "control.module.init",
            # Stage-2 chapter pipeline (Task 2.3)
            "data.novel.chapter.intent",
            "control.novel.chapter.write",
        )

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.2,
            custom={
                "paragraphs_generated": 0,
                "narrative_lines_received": 0,
            },
        )

    def init(self, context: dict[str, Any]) -> None:
        """Initialize creation executive from agent context."""
        creation_context = context.get("creation", {})
        seed = creation_context.get("seed")
        if seed is not None:
            self._rng = random.Random(seed)
            if self._llm.is_mock:
                self._llm = MockLLMService(seed=seed)

        self._style_profile = creation_context.get("style_profile", {})
        self._focus_stack = creation_context.get("focus_stack", [])
        self._identity_constraints = context.get("identity", self._identity_constraints)

    def on_bus_message(self, message: BusMessage) -> None:
        """Handle narrative ready, identity constraints, and trace results."""
        if not self._state.active:
            return

        if message.topic == "data.sandbox.narrative.ready":
            self._handle_narrative_ready(message.payload)
            # Stage-2: also cache narrative/skill_checks/world_state for
            # chapter-driven paragraph generation (Task 2.3.1).
            self._handle_narrative_ready_for_chapter(message.payload)
        elif message.topic in ("data.identity.constraint", "data.identity.updated"):
            self._handle_identity_constraint(message.payload)
        elif message.topic == "control.creative.tone":
            self._handle_creative_tone(message.payload)
        elif message.topic == "data.memory.trace.query.result":
            self._handle_trace_results(message.payload)
        elif message.topic == "data.novel.chapter.intent":
            self._handle_chapter_intent(message.payload)
        elif message.topic == "control.novel.chapter.write":
            self._handle_write_command(message.payload)

    def tick(self, delta: TickDelta) -> None:
        """Advance creation executive bookkeeping."""
        self._state.last_tick = delta.absolute_time
        previous_phase = self._current_phase
        self._current_phase = delta.phase

        # If a narrative line became ready earlier (e.g. during simulation),
        # compose the paragraph as soon as the creation phase begins.
        if (
            self._current_phase == "creation"
            and previous_phase != "creation"
            and self._current_narrative_line is not None
            and self._trace_results
            and not self._pending_query
        ):
            self._compose_and_publish()

    def _compose_and_publish(self) -> None:
        """Compose and emit a paragraph from the buffered narrative line."""
        if self._current_narrative_line is None:
            return
        paragraph = self._compose_paragraph(
            self._current_narrative_line, self._trace_results
        )
        self._draft_buffer.append(paragraph)
        self._state.custom["paragraphs_generated"] += 1
        self.emit(
            topic="data.novel.paragraph",
            payload={
                "paragraph": paragraph,
                "narrative_line_id": self._current_narrative_line.id,
                "source": self.name,
                "trace_count": len(self._trace_results),
            },
            channel="data",
            priority=7,
            ttl=5,
        )

    def get_state(self) -> dict[str, Any]:
        """Return a serializable snapshot of creation state."""
        return {
            "active": self._state.active,
            "energy_cost": self._state.energy_cost,
            "last_tick": self._state.last_tick,
            "draft_buffer_count": len(self._draft_buffer),
            "style_profile": self._style_profile,
            "focus_stack": self._focus_stack,
            "current_narrative_line_id": self._current_narrative_line.id if self._current_narrative_line else None,
            "paragraphs_generated": self._state.custom["paragraphs_generated"],
            "narrative_lines_received": self._state.custom["narrative_lines_received"],
            # Stage-2 chapter pipeline cache observability (Task 2.3).
            "has_chapter_intent": self._latest_chapter_intent is not None,
            "cached_chapter_index": (
                self._latest_chapter_intent.chapter_index
                if self._latest_chapter_intent is not None
                else None
            ),
            "cached_narrative_lines": len(self._latest_narrative_lines),
            "cached_skill_checks": len(self._latest_skill_checks),
            "has_world_state": self._latest_world_state is not None,
            "last_generated_chapter_index": self._last_generated_chapter_index,
        }

    def to_dict(self) -> dict[str, Any]:
        """Serialize creation executive state."""
        base = super().to_dict()
        base.update(
            {
                "seed": self._seed,
                "current_narrative_line": dataclass_to_dict(self._current_narrative_line)
                if self._current_narrative_line
                else None,
                "draft_buffer": list(self._draft_buffer),
                "style_profile": dict(self._style_profile),
                "focus_stack": list(self._focus_stack),
                "pending_query": self._pending_query,
                "trace_results": [
                    dataclass_to_dict(t) for t in self._trace_results
                ],
                "attachment_tone": self._attachment_tone,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore creation executive state."""
        super().from_dict(data, **kwargs)
        llm = kwargs.get("llm_service")
        if llm is not None:
            self._llm = llm
        self._seed = data.get("seed")
        if self._seed is not None:
            self._rng = random.Random(self._seed)
            if self._llm.is_mock:
                self._llm = MockLLMService(seed=self._seed)
        else:
            self._rng = random.Random()

        line_data = data.get("current_narrative_line")
        self._current_narrative_line = (
            reconstruct_dataclass(NarrativeLine, line_data)
            if line_data
            else None
        )
        self._draft_buffer = list(data.get("draft_buffer", []))
        self._style_profile = dict(data.get("style_profile", {}))
        self._focus_stack = list(data.get("focus_stack", []))
        self._pending_query = bool(data.get("pending_query", False))
        self._trace_results = [
            reconstruct_dataclass(Trace, t)
            for t in data.get("trace_results", [])
        ]
        self._attachment_tone = data.get("attachment_tone")

    # ------------------------------------------------------------------
    # Message handlers
    # ------------------------------------------------------------------

    def _handle_identity_constraint(self, payload: Any) -> None:
        """Update style profile from identity constraints."""
        if not isinstance(payload, dict):
            return
        constraints = payload.get("constraints", {})
        if isinstance(constraints, dict):
            self._identity_constraints = constraints
            self._style_profile.update(constraints.get("voice_signature", {}))
            if not self._focus_stack:
                self._focus_stack = list(constraints.get("interests", []))

    def _handle_creative_tone(self, payload: Any) -> None:
        """Update creative tone from attachment or other upstream modules."""
        if not isinstance(payload, dict):
            return
        # Only attachment-sourced tones are supported for now.
        if payload.get("source") != "attachment":
            return
        self._attachment_tone = {
            "style": payload.get("style", "secure"),
            "intensity": float(payload.get("intensity", 0.0)),
            "tone": payload.get("tone", {}),
        }

    def _handle_narrative_ready(self, payload: Any) -> None:
        """Extract narrative line and query memory for relevant traces."""
        if payload is None:
            return
        if not isinstance(payload, dict):
            return

        narrative_line = payload.get("narrative_line")
        if isinstance(narrative_line, dict):
            narrative_line = NarrativeLine(**narrative_line)
        if not isinstance(narrative_line, NarrativeLine):
            return

        self._current_narrative_line = narrative_line
        self._trace_results.clear()
        self._state.custom["narrative_lines_received"] += 1

        tags = self._extract_query_tags(narrative_line)
        self._pending_query = True
        self.emit(
            topic="control.memory.query",
            payload={
                "query_type": "tags",
                "tags": tags,
                "sort_by": "relevance",
                "limit": 5,
                "source": self.name,
                "reason": "narrative_enrichment",
            },
            channel="control",
            priority=6,
            ttl=3,
        )

    def _handle_trace_results(self, payload: Any) -> None:
        """Generate a paragraph once relevant memory traces arrive.

        Paragraphs are only composed during the ``creation`` phase so that
        writing stays aligned with 林逸's evening rhythm.
        """
        if not isinstance(payload, dict):
            return

        criteria = payload.get("criteria", {})
        if criteria.get("source") != self.name:
            return
        if not self._pending_query:
            return

        results = payload.get("results", [])
        self._trace_results = []
        for item in results:
            trace: Trace | None = None
            if isinstance(item, Trace):
                trace = item
            elif isinstance(item, dict):
                trace = Trace(**item)
            if trace is not None:
                self._trace_results.append(trace)

        self._pending_query = False
        if self._current_phase != "creation":
            # Defer paragraph composition until the creation phase.
            return

        self._compose_and_publish()

    # ------------------------------------------------------------------
    # Stage-2 chapter pipeline (Task 2.3)
    #
    # The legacy flow above (``data.sandbox.narrative.ready`` →
    # ``control.memory.query`` → ``data.memory.trace.query.result`` →
    # ``_compose_and_publish``) is preserved verbatim. The new flow below
    # runs in parallel: it consumes ``data.novel.chapter.intent`` (emitted
    # by Planner) and produces one ``data.novel.paragraph`` per
    # ``ChapterIntent.narrative_beats`` entry, carrying ``chapter_id`` and
    # ``audit_metadata`` so the ChapterManager can attribute and audit
    # each paragraph (per docs/系统重构方案_v1.md §3.5 / Task 2.3).
    # ------------------------------------------------------------------

    def _handle_narrative_ready_for_chapter(self, payload: Any) -> None:
        """Cache narrative/skill_checks/world_state for chapter generation.

        This handler runs alongside the legacy ``_handle_narrative_ready``
        on every ``data.sandbox.narrative.ready`` message. It does NOT
        trigger paragraph generation on its own — generation is driven by
        ``data.novel.chapter.intent`` (or ``control.novel.chapter.write``).
        The Sandbox payload currently omits ``skill_checks`` /
        ``world_state``; both default to empty/None when absent.
        """
        if not isinstance(payload, dict):
            return

        narrative_lines: list[NarrativeLine] = []
        if "narrative_lines" in payload:
            raw_lines = payload["narrative_lines"]
            if isinstance(raw_lines, list):
                for item in raw_lines:
                    line = self._coerce_narrative_line(item)
                    if line is not None:
                        narrative_lines.append(line)
        elif "narrative_line" in payload:
            line = self._coerce_narrative_line(payload["narrative_line"])
            if line is not None:
                narrative_lines.append(line)
        if narrative_lines:
            self._latest_narrative_lines = narrative_lines

        skill_checks = payload.get("skill_checks")
        if isinstance(skill_checks, list):
            self._latest_skill_checks = list(skill_checks)

        world_state = payload.get("world_state")
        if world_state is None:
            world_state = payload.get("world_contract")
        if world_state is not None:
            self._latest_world_state = world_state

    def _handle_chapter_intent(self, payload: Any) -> None:
        """Cache ``ChapterIntent`` + metadata and trigger paragraph generation.

        Per Task 2.3.1: payload destructure includes ``chapter_intent``,
        ``source_narrative_id``, ``beats``, ``emotional_arc_beats``,
        ``weave_violations``, ``weave_ratios``. The intent is cached for
        downstream ``control.novel.chapter.write`` re-generation, and
        paragraph generation fires immediately using whatever narrative
        context is currently cached (sent by an earlier
        ``data.sandbox.narrative.ready``).
        """
        if not isinstance(payload, dict):
            return

        chapter_intent = payload.get("chapter_intent")
        if isinstance(chapter_intent, dict):
            try:
                chapter_intent = ChapterIntent.from_dict(chapter_intent)
            except Exception:
                chapter_intent = None
        if not isinstance(chapter_intent, ChapterIntent):
            return

        self._latest_chapter_intent = chapter_intent
        self._latest_chapter_intent_metadata = {
            "source_narrative_id": str(payload.get("source_narrative_id", "")),
            "beats": list(payload.get("beats", []) or []),
            "emotional_arc_beats": list(
                payload.get("emotional_arc_beats", []) or []
            ),
            "weave_violations": list(payload.get("weave_violations", []) or []),
            "weave_ratios": dict(payload.get("weave_ratios", {}) or {}),
            "generated_at": payload.get("generated_at"),
        }
        self._latest_source_narrative_id = (
            self._latest_chapter_intent_metadata.get("source_narrative_id", "")
        )

        # Reset the per-chapter paragraph counter for the new intent.
        self._chapter_paragraph_index = 0

        # Generate paragraphs immediately using the cached narrative +
        # skill_checks + world_state. If no narrative has been cached yet
        # the generation still proceeds with empty context —
        # ``build_scene_prose_prompt`` degrades gracefully when
        # ``world_state`` is None and ``skill_checks`` is empty.
        self._generate_paragraphs_for_chapter(
            chapter_intent=chapter_intent,
            narrative_lines=self._latest_narrative_lines,
            skill_checks=self._latest_skill_checks,
            world_state=self._latest_world_state,
        )

    def _handle_write_command(self, payload: Any) -> None:
        """Force paragraph generation for the cached chapter intent.

        ``control.novel.chapter.write`` is the explicit trigger path
        (Task 2.3.1). Unlike ``data.novel.chapter.intent``, it always
        regenerates paragraphs even if the same chapter was already
        produced, and it lets the caller override ``chapter_id`` for
        paragraph attribution.
        """
        if not isinstance(payload, dict):
            payload = {}
        chapter_id = payload.get("chapter_id")
        if chapter_id and isinstance(chapter_id, str):
            self._chapter_write_chapter_id = chapter_id
        if payload.get("reset_index"):
            self._chapter_paragraph_index = 0

        if self._latest_chapter_intent is None:
            # Nothing to generate from yet — wait for
            # ``data.novel.chapter.intent``.
            return

        # Bypass the duplicate-chapter guard so an explicit write command
        # always re-emits paragraphs.
        self._force_regeneration = True
        self._generate_paragraphs_for_chapter(
            chapter_intent=self._latest_chapter_intent,
            narrative_lines=self._latest_narrative_lines,
            skill_checks=self._latest_skill_checks,
            world_state=self._latest_world_state,
        )

    def _generate_paragraphs_for_chapter(
        self,
        chapter_intent: ChapterIntent,
        narrative_lines: list[NarrativeLine],
        skill_checks: list[Any],
        world_state: Any,
    ) -> None:
        """Generate one paragraph per beat in ``chapter_intent.narrative_beats``.

        For each beat this method:

        1. Resolves the ``scene_type`` (from ``chapter_intent.scene_type``
           when set, otherwise classified from the beat string).
        2. Picks a :class:`SkillCheckOutcome` for the beat (round-robin
           over the cached ``skill_checks``).
        3. Builds the scene-prose prompt via
           :func:`prompts.build_scene_prose_prompt`.
        4. Calls ``self._llm.complete`` to produce the prose.
        5. Wraps the prose in a :class:`Paragraph` carrying
           ``audit_metadata`` (``scene_type``, ``source_beat``,
           ``source_skill_check``, ``prompt_hash``, ``weave_strand``,
           ``generation_timestamp``).
        6. Publishes ``data.novel.paragraph`` with ``chapter_id``,
           ``paragraph``, ``index`` and ``audit_metadata`` fields so the
           ChapterManager can attribute and version the paragraph.
        """
        if chapter_intent is None:
            return

        # Guard against duplicate generation for the same chapter_index.
        if (
            not self._force_regeneration
            and chapter_intent.chapter_index
            == self._last_generated_chapter_index
            and self._last_generated_chapter_index != -1
        ):
            return
        self._last_generated_chapter_index = chapter_intent.chapter_index
        self._force_regeneration = False

        beats = list(chapter_intent.narrative_beats or [])
        if not beats:
            # Always emit at least one paragraph so the chapter doesn't
            # end up empty.
            beats = [chapter_intent.scene_type or "默认节拍"]

        chapter_id = self._resolve_chapter_id(chapter_intent)
        world_state_dict = self._world_state_to_dict(world_state)
        style_fingerprint = self._style_profile.get("style_fingerprint")

        # Reset the per-chapter paragraph counter at the start of each
        # generation pass, so re-generation via ``control.novel.chapter.
        # write`` produces 0-indexed sequences again.
        self._chapter_paragraph_index = 0

        for beat_index, beat in enumerate(beats):
            scene_type = self._resolve_scene_type_for_beat(beat, chapter_intent)
            skill_check_outcome, skill_check_obj = self._pick_skill_check(
                skill_checks, beat_index
            )
            current_beat = self._build_current_beat_dict(
                beat, beat_index, chapter_intent
            )

            # Stage 3.5.2: produce a literary, dice-aware narration for
            # the resolved skill check and stash it on ``current_beat`` so
            # downstream prompt builders / audit metadata can pick it up.
            # The narration is the bridge between the COC dice layer and
            # the prose layer (per docs/系统重构方案_v1.md §3.9 / Task 3.5).
            narration = self._build_beat_narration(
                skill_check_outcome, skill_check_obj, beat
            )
            if narration:
                current_beat["narration"] = narration

            try:
                prompt = prompts.build_scene_prose_prompt(
                    scene_type=scene_type,
                    skill_check_outcome=skill_check_outcome,
                    chapter_intent=chapter_intent,
                    current_beat=current_beat,
                    style_fingerprint=style_fingerprint,
                    world_state=world_state_dict,
                )
            except Exception:
                # Prompt construction should never fail, but if it does
                # we skip the beat rather than aborting the whole chapter.
                continue

            prompt_hash = hashlib.sha256(
                prompt.encode("utf-8")
            ).hexdigest()[:16]

            try:
                content = self._llm.complete(
                    prompt,
                    context={"system": ""},
                    temperature=0.85,
                    max_tokens=2000,
                ).strip()
            except LLMCallError:
                content = ""
            if not content:
                continue

            # Stage 3.5.2: de-AI polish pass. Only fires when a real LLM
            # is wired in — the mock LLM would replace the paragraph with
            # an unrelated template, which would break determinism for
            # tests that assert on paragraph content.
            content = self._refine_with_de_ai(content, style_fingerprint)

            weave_strand = self._infer_weave_strand(
                beat, scene_type, chapter_intent
            )
            self._chapter_paragraph_index += 1
            paragraph = self._build_paragraph(
                content=content,
                chapter_id=chapter_id,
                scene_type=scene_type,
                beat=beat,
                skill_check=skill_check_obj,
                prompt=prompt,
                weave_strand=weave_strand,
                narration=narration,
            )

            # Legacy bookkeeping: keep the draft buffer / counter in sync
            # with the new chapter-pipeline emissions so ``get_state``
            # reports a consistent ``paragraphs_generated`` total.
            self._draft_buffer.append(content)
            self._state.custom["paragraphs_generated"] += 1

            # 0-indexed ``index`` to match ChapterManager's emitted event.
            emitted_index = self._chapter_paragraph_index - 1
            self.emit(
                topic="data.novel.paragraph",
                payload={
                    "chapter_id": chapter_id,
                    "paragraph": paragraph.to_dict(),
                    "index": emitted_index,
                    "audit_metadata": dict(paragraph.audit_metadata),
                },
                channel="data",
                priority=7,
                ttl=5,
            )

    # ------------------------------------------------------------------
    # Stage-2 helpers (Task 2.3)
    # ------------------------------------------------------------------

    def _coerce_narrative_line(self, item: Any) -> NarrativeLine | None:
        """Coerce a payload entry into a :class:`NarrativeLine` (or None)."""
        if isinstance(item, NarrativeLine):
            return item
        if isinstance(item, dict):
            try:
                return reconstruct_dataclass(NarrativeLine, item)
            except Exception:
                return None
        return None

    def _resolve_chapter_id(self, chapter_intent: ChapterIntent) -> str:
        """Resolve the ``chapter_id`` for paragraph attribution.

        Priority: explicit ``control.novel.chapter.write`` override →
        ``f"ch_{chapter_index}"`` derived from the intent → ``"ch_current"``.
        """
        if self._chapter_write_chapter_id:
            return self._chapter_write_chapter_id
        if chapter_intent.chapter_index and chapter_intent.chapter_index > 0:
            return f"ch_{chapter_intent.chapter_index}"
        return "ch_current"

    def _resolve_scene_type_for_beat(
        self, beat: str, chapter_intent: ChapterIntent
    ) -> str:
        """Resolve the scene_type for a beat.

        Per Task 2.3.2: if ``ChapterIntent.scene_type`` is set (it always
        is — the dataclass defaults to ``"dialogue"``), use it for all
        beats in the chapter. Otherwise fall back to per-beat
        classification via :meth:`_classify_scene_type`.
        """
        chapter_scene_type = getattr(chapter_intent, "scene_type", None)
        if (
            chapter_scene_type
            and chapter_scene_type
            in (
                "dialogue",
                "action",
                "psychological",
                "environment",
                "transition",
            )
        ):
            return chapter_scene_type
        return self._classify_scene_type(beat)

    def _classify_scene_type(self, beat_str: str) -> str:
        """Infer a scene_type from a beat string.

        Used as a fallback when ``ChapterIntent.scene_type`` is unset.
        Keyword scoring mirrors the Planner's scene-type inference in
        ``planner._infer_scene_type``.
        """
        if not beat_str:
            return "dialogue"
        text = beat_str.lower()
        scores: dict[str, float] = {
            "dialogue": 0.0,
            "action": 0.0,
            "psychological": 0.0,
            "environment": 0.0,
            "transition": 0.0,
        }
        keyword_map = {
            "dialogue": (
                "对话", "说", "问", "答", "谈", "谈论", "对白", "dialogue",
            ),
            "action": (
                "动作", "战斗", "追", "逃", "打", "attack", "fight", "chase",
            ),
            "psychological": (
                "心理", "想", "内心", "意识", "恐惧", "希望", "psychological",
            ),
            "environment": (
                "环境", "场景", "天气", "光", "雨", "街", "environment",
            ),
            "transition": (
                "过渡", "随后", "之后", "接着", "离开", "前往", "transition",
            ),
        }
        for scene_type, keywords in keyword_map.items():
            for kw in keywords:
                if kw in text:
                    scores[scene_type] += 1.0
        priority = [
            "action",
            "dialogue",
            "psychological",
            "environment",
            "transition",
        ]
        best = max(priority, key=lambda k: (scores[k], -priority.index(k)))
        if scores[best] <= 0.0:
            return "dialogue"
        return best

    def _pick_skill_check(
        self, skill_checks: list[Any], beat_index: int
    ) -> tuple[SkillCheckOutcome | None, Any]:
        """Pick a skill check for the beat (round-robin by index).

        Returns ``(outcome_enum, raw_object)``. The outcome enum is fed
        to :func:`prompts.build_scene_prose_prompt`; the raw object is
        recorded in ``audit_metadata.source_skill_check`` for traceability.
        """
        if not skill_checks:
            return None, None
        idx = beat_index % len(skill_checks)
        sc = skill_checks[idx]
        outcome: SkillCheckOutcome | None = None
        if isinstance(sc, SkillCheck):
            outcome = sc.outcome
        elif isinstance(sc, dict):
            outcome_str = sc.get("outcome")
            if outcome_str:
                try:
                    outcome = SkillCheckOutcome(outcome_str)
                except ValueError:
                    outcome = None
        return outcome, sc

    def _build_current_beat_dict(
        self, beat_name: str, beat_index: int, chapter_intent: ChapterIntent
    ) -> dict[str, Any]:
        """Build the ``current_beat`` dict expected by ``build_scene_prose_prompt``.

        The prompt builder reads ``name`` / ``intent`` / ``target_strand``
        from this dict (see prompts.py). When the cached
        ``chapter_intent_metadata['beats']`` carries a structured beat
        (from Planner), we reuse its ``intent``; otherwise we synthesize a
        short intent string from the beat name.
        """
        intent_str = ""
        beats_meta = self._latest_chapter_intent_metadata.get("beats", []) or []
        if isinstance(beats_meta, list) and beat_index < len(beats_meta):
            meta = beats_meta[beat_index]
            if isinstance(meta, dict):
                intent_str = str(meta.get("intent", ""))
        if not intent_str:
            intent_str = self._beat_intent_fallback(beat_name)
        target_strand = self._infer_weave_strand(
            beat_name, chapter_intent.scene_type, chapter_intent
        )
        return {
            "name": beat_name,
            "intent": intent_str,
            "target_strand": target_strand,
        }

    def _beat_intent_fallback(self, beat_name: str) -> str:
        """Return a short Chinese intent string for a beat name."""
        name = beat_name or ""
        if "Hook" in name or "钩子" in name or "章首" in name:
            return "以悬念或异常细节抓住读者注意。"
        if "主线" in name or "推进" in name:
            return "推进核心冲突，让主角在目标上取得关键进展或遭受挫败。"
        if "情感" in name or "关系" in name:
            return "放大角色之间的关系张力，暴露信任、爱意或敌意的微妙裂痕。"
        if "世界观" in name or "揭示" in name:
            return "揭示一处世界规则或神秘设定，让读者感到世界比想象更大。"
        if "爽点" in name or "兑现" in name:
            return "兑现一个此前埋下的微小承诺，给读者一次情绪释放。"
        if "悬念" in name or "章末" in name:
            return "留一个钩子，让下一章开头成为读者无法跳过的追问。"
        return "推进当前节拍意图。"

    def _infer_weave_strand(
        self, beat: str, scene_type: str, chapter_intent: ChapterIntent
    ) -> str:
        """Infer which of the four weave strands this paragraph belongs to.

        Maps the standard six-beat curve (Hook / 主线推进 / 情感冲突 /
        世界观揭示 / 爽点兑现 / 章末悬念) onto the Quest / Fire /
        Constellation / Rest strands. Falls back to a scene_type-based
        mapping when the beat name doesn't match a known pattern.
        """
        beat_lower = (beat or "").lower()
        if "hook" in beat_lower or "章首" in beat or "钩子" in beat:
            return "quest"
        if "主线" in beat or "推进" in beat:
            return "quest"
        if "情感" in beat or "关系" in beat:
            return "fire"
        if "世界观" in beat or "揭示" in beat:
            return "constellation"
        if "爽点" in beat or "兑现" in beat:
            return "quest"
        if "悬念" in beat or "章末" in beat:
            return "rest"
        scene_to_strand = {
            "action": "quest",
            "dialogue": "fire",
            "psychological": "fire",
            "environment": "constellation",
            "transition": "rest",
        }
        return scene_to_strand.get(scene_type, "quest")

    def _build_beat_narration(
        self,
        skill_check_outcome: SkillCheckOutcome | None,
        skill_check_obj: Any,
        beat: str,
    ) -> str | None:
        """Build a literary narration for a beat's skill check (Task 3.5.2).

        Returns ``None`` when no skill check outcome is available; otherwise
        delegates to :func:`narrate_skill_check` to produce the
        dice-aware, emotion-laden Chinese narration that bridges the COC
        dice layer and the prose layer.
        """
        if skill_check_outcome is None:
            return None
        character = "主角"
        challenge = beat or "推进节拍"
        dice = 0
        difficulty = 0.0
        if isinstance(skill_check_obj, SkillCheck):
            character = skill_check_obj.character_name or "主角"
            challenge = beat or skill_check_obj.skill or "推进节拍"
            dice = int(skill_check_obj.roll or 0)
            difficulty = float(skill_check_obj.target or 0.0)
        elif isinstance(skill_check_obj, dict):
            character = str(skill_check_obj.get("character_name") or "主角")
            challenge = beat or str(skill_check_obj.get("skill") or "推进节拍")
            try:
                dice = int(skill_check_obj.get("roll") or 0)
            except (TypeError, ValueError):
                dice = 0
            try:
                difficulty = float(skill_check_obj.get("target") or 0.0)
            except (TypeError, ValueError):
                difficulty = 0.0
        try:
            return narrate_skill_check(
                outcome=skill_check_outcome,
                character=character,
                challenge=challenge,
                dice=dice,
                difficulty=difficulty,
            )
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Stage 3.5.2 literary-quality helpers
    # ------------------------------------------------------------------

    # Chinese cue lexicons for the three literary-element buckets
    # (per docs/系统重构方案_v1.md §3.9 / §7). Hits are counted by
    # substring occurrence, so the lists favour distinctive character
    # bigrams / trigrams that are unlikely to appear by accident.
    _ACTION_CUES: tuple[str, ...] = (
        "走", "跑", "抓", "推", "拉", "抬", "挥", "握", "跨", "迈",
        "转身", "抬头", "低头", "伸手", "缩回", "起身", "坐下", "站起",
        "推开门", "推开", "踏", "踩", "跳", "停", "凝视", "看向", "望向",
        "举起", "放下", "抓紧", "松开", "颤抖", "皱眉", "点头", "摇头",
    )
    _ENVIRONMENT_CUES: tuple[str, ...] = (
        "风", "雨", "光", "影", "气味", "声音", "尘", "窗", "墙", "地面",
        "天", "云", "雾", "湿", "冷", "热", "时钟", "钟表", "脚步",
        "光线", "尘埃", "街", "路", "树", "灯", "门", "桌", "椅",
        "雨声", "风声", "灰", "潮", "窗台", "走廊", "楼梯",
    )
    _INNER_CUES: tuple[str, ...] = (
        "心", "想", "记起", "犹豫", "害怕", "颤", "呼吸", "意识到",
        "感觉", "察觉", "恐惧", "希望", "疑虑", "不安", "预感",
        "回忆", "念头", "心头", "心中", "内心", "意识", "思绪",
        "瞬间", "猛然", "忽然", "突然", "不由", "忍不住",
    )

    def _compute_literary_quality_score(self, content: str) -> float:
        """Return a 0-1 score for how literary a paragraph is (Task 3.5.2).

        Heuristic: a paragraph is considered literary when it carries all
        three element types — 人物动作 (action) / 环境反应 (environment) /
        内心波动 (inner). The score is the count of present buckets
        divided by 3, so:

        - all three present  → 1.0
        - two present        → 0.67
        - one present        → 0.33
        - none               → 0.0

        Empty / whitespace-only content scores 0.0. The score is meant
        for audit dashboards and revision triage, not for hard gating.
        """
        if not content or not content.strip():
            return 0.0
        text = content
        has_action = any(cue in text for cue in self._ACTION_CUES)
        has_environment = any(cue in text for cue in self._ENVIRONMENT_CUES)
        has_inner = any(cue in text for cue in self._INNER_CUES)
        present = sum(1 for flag in (has_action, has_environment, has_inner) if flag)
        return round(present / 3.0, 3)

    def _refine_with_de_ai(
        self,
        paragraph: str,
        style_fingerprint: Any,
    ) -> str:
        """Run a de-AI polish pass on a generated paragraph (Task 3.5.2).

        Calls :func:`prompts.build_de_ai_prompt` and asks the LLM to
        rewrite the paragraph according to :data:`prompts.DE_AI_RULES`.
        Only fires when a real LLM is wired in (``not self._llm.is_mock``)
        so that tests using :class:`MockLLMService` remain deterministic.

        Returns the polished paragraph on success; on any failure (LLM
        error, unparseable response, empty content) returns the original
        paragraph unchanged so the chapter pipeline never produces an
        empty paragraph due to a polish-step failure.
        """
        if not paragraph or not paragraph.strip():
            return paragraph
        if self._llm is None or self._llm.is_mock:
            return paragraph
        try:
            prompt = prompts.build_de_ai_prompt(paragraph, style_fingerprint)
        except Exception:
            return paragraph
        try:
            response = self._llm.complete(
                prompt,
                context={"system": ""},
                temperature=0.7,
                max_tokens=2000,
            ).strip()
        except LLMCallError:
            return paragraph
        if not response:
            return paragraph
        # The de-AI prompt asks for a single-line JSON with a
        # ``rewritten`` field. Try to extract it; if anything looks off,
        # fall back to the original paragraph.
        try:
            import json as _json

            payload = _json.loads(response)
            rewritten = payload.get("rewritten")
            if isinstance(rewritten, str) and rewritten.strip():
                return rewritten.strip()
        except (ValueError, TypeError):
            pass
        return paragraph

    def _build_paragraph(
        self,
        content: str,
        chapter_id: str,
        scene_type: str,
        beat: str,
        skill_check: Any,
        prompt: str,
        weave_strand: str,
        narration: str | None = None,
    ) -> Paragraph:
        """Build a :class:`Paragraph` with audit_metadata (Task 2.3.3 + 3.5.2).

        Stage 3.5.2 adds two new audit_metadata fields:

        - ``source_narration``: the literary narration produced by
          :func:`narrate_skill_check` for this beat's skill check (or
          ``None`` when no skill check was available).
        - ``literary_quality_score``: a 0-1 heuristic score based on
          whether the paragraph contains the three element types
          (action / environment / inner) expected from a literary scene
          per docs/系统重构方案_v1.md §3.9.
        """
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16]
        source_skill_check: dict[str, Any] | None = None
        if isinstance(skill_check, SkillCheck):
            source_skill_check = {
                "skill": skill_check.skill,
                "outcome": (
                    skill_check.outcome.value
                    if isinstance(skill_check.outcome, SkillCheckOutcome)
                    else str(skill_check.outcome)
                ),
                "roll": skill_check.roll,
                "target": skill_check.target,
                "character_name": skill_check.character_name,
            }
        elif isinstance(skill_check, dict):
            source_skill_check = {
                "skill": skill_check.get("skill", ""),
                "outcome": skill_check.get("outcome", ""),
                "roll": skill_check.get("roll"),
                "target": skill_check.get("target"),
                "character_name": skill_check.get("character_name", ""),
            }
        literary_quality_score = self._compute_literary_quality_score(content)
        audit_metadata: dict[str, Any] = {
            "scene_type": scene_type,
            "source_beat": beat,
            "source_skill_check": source_skill_check,
            "source_narration": narration,
            "literary_quality_score": literary_quality_score,
            "prompt_hash": prompt_hash,
            "weave_strand": weave_strand,
            "generation_timestamp": time.time(),
        }
        return Paragraph(
            content=content,
            chapter_id=chapter_id,
            audit_metadata=audit_metadata,
        )

    def _world_state_to_dict(self, world_state: Any) -> dict | None:
        """Convert a world_state object to a dict for prompt builders."""
        if world_state is None:
            return None
        if isinstance(world_state, dict):
            return world_state
        if hasattr(world_state, "to_dict"):
            try:
                result = world_state.to_dict()
                if isinstance(result, dict):
                    return result
            except Exception:
                pass
        if hasattr(world_state, "__dict__"):
            return dict(world_state.__dict__)
        return None

    # ------------------------------------------------------------------
    # Paragraph composition
    # ------------------------------------------------------------------

    def _compose_paragraph(
        self, narrative_line: NarrativeLine, traces: list[Trace]
    ) -> str:
        """Convert a narrative line into a 200-500 word literary paragraph.

        When a real LLM is available, delegate the prose generation to the
        model using a structured prompt. Otherwise fall back to the
        template-based composer.
        """
        if self._llm is not None and not self._llm.is_mock:
            paragraph = self._compose_paragraph_with_llm(narrative_line, traces)
            if paragraph:
                paragraph = self._normalize_spacing(paragraph)
                paragraph = self._remove_duplicate_sentences(paragraph)
                words = paragraph.split()
                if len(words) > 500:
                    paragraph = " ".join(words[:500])
                return paragraph

        return self._compose_paragraph_with_templates(narrative_line, traces)

    def _compose_paragraph_with_llm(
        self, narrative_line: NarrativeLine, traces: list[Trace]
    ) -> str:
        """Use the LLM to compose the paragraph."""
        scenes = narrative_line.scenes
        if not scenes:
            return ""

        setting = self._resolve_setting(narrative_line)
        protagonist, _ = self._resolve_characters(narrative_line)

        narrative_line_dict = {
            "scenes": [
                {
                    "setting": s.setting or setting,
                    "description": s.description or "",
                    "emotional_tone": s.emotional_tone,
                }
                for s in scenes[:4]
            ],
            "conflicts": [
                {"description": c.stakes or (c.parties[0] if c.parties else "")}
                for c in narrative_line.conflicts[:3]
            ],
            "foreshadowing": list(narrative_line.foreshadowing or []),
        }
        relevant_traces = [
            {
                "content": t.content,
                "summary": t.content[:160],
                "narrative_role": t.narrative_role,
                "tags": list(t.tags),
            }
            for t in traces[:4]
        ]
        previous_paragraph = self._draft_buffer[-1] if self._draft_buffer else ""

        system, user = prompts.build_novel_paragraph_prompt(
            identity=self._identity_constraints_for_prompt(),
            narrative_line=narrative_line_dict,
            relevant_traces=relevant_traces,
            previous_paragraph=previous_paragraph,
            style_profile=self._style_profile,
            attachment_tone=self._attachment_tone,
        )

        try:
            text = self._llm.complete(
                user,
                context={"system": system},
                temperature=0.85,
                max_tokens=3000,
            ).strip()
        except LLMCallError:
            text = ""

        # If the result is too short or pure reasoning, retry once with a
        # more explicit instruction.
        from src.novelist_brain.llm import OpenAILLMService
        if (
            not text
            or len(text) < 100
            or (
                isinstance(self._llm, OpenAILLMService)
                and not _looks_like_prose(text)
            )
        ):
            retry_user = (
                user
                + "\n\n注意：请直接输出中文散文段落本身，不要输出任何"
                "英文、推理过程、字数统计或思考。直接从第一个汉字开始写。"
            )
            try:
                retry_text = self._llm.complete(
                    retry_user,
                    context={"system": system},
                    temperature=0.9,
                    max_tokens=3000,
                ).strip()
            except LLMCallError:
                retry_text = ""
            if retry_text and _looks_like_prose(retry_text):
                text = retry_text

        return text

    def _identity_constraints_for_prompt(self) -> dict[str, Any]:
        """Return identity constraints formatted for prompt builders."""
        if self._identity_constraints:
            return dict(self._identity_constraints)
        if self._style_profile.get("identity"):
            return dict(self._style_profile["identity"])
        return {
            "name": "林逸",
            "pen_name": "静观者",
            "values": ["真实", "共情", "美", "孤独", "自由"],
            "traits": {"开放性": 0.85, "敏感性": 0.8, "内倾性": 0.75},
            "self_narrative": "我是一个在人群边缘写字的人。我相信那些被忽略的瞬间里藏着真正的小说。",
            "interests": self._focus_stack or ["城市边缘人", "记忆", "雨", "旧物", "未说出口的话"],
        }

    def _compose_paragraph_with_templates(
        self, narrative_line: NarrativeLine, traces: list[Trace]
    ) -> str:
        """Template-based paragraph composer (fallback when no real LLM)."""
        scenes = narrative_line.scenes
        if not scenes:
            return self._fallback_paragraph()

        setting = self._resolve_setting(narrative_line)
        protagonist, characters = self._resolve_characters(narrative_line)
        mood = self._resolve_mood(narrative_line)
        time_of_day = self._resolve_time_of_day(setting)

        parts: list[str] = []

        parts.append(
            self._fill_template(
                self._rng.choice(_PROSE_TEMPLATES["opening"]),
                setting=setting,
                protagonist=protagonist,
                time_of_day=time_of_day,
            )
        )

        scene_count = 0
        seen_descriptions: set[str] = set()
        for scene in scenes:
            if scene_count >= 3:
                break
            description = (scene.description or "").strip()
            if description and description in seen_descriptions:
                continue
            rendered = self._render_scene(scene, protagonist, setting, scene_count)
            if rendered:
                parts.append(rendered)
                scene_count += 1
                if description:
                    seen_descriptions.add(description)

        if scene_count < 2:
            for _ in range(2 - scene_count):
                parts.append(
                    self._fill_template(
                        self._rng.choice(_PROSE_TEMPLATES["scene_progression"]),
                        setting=setting,
                        protagonist=protagonist,
                        time_of_day=time_of_day,
                    )
                )

        if len(characters) >= 2:
            parts.append(
                self._fill_template(
                    self._rng.choice(_PROSE_TEMPLATES["dialogue"]),
                    char1=characters[0],
                    char2=characters[1],
                )
            )
        else:
            parts.append(
                self._fill_template(
                    self._rng.choice(_PROSE_TEMPLATES["monologue"]),
                    protagonist=protagonist,
                )
            )

        if traces:
            trace = traces[0]
            trace_role = trace.narrative_role
            parts.append(
                self._fill_template(
                    self._rng.choice(_PROSE_TEMPLATES["trace_texture"]),
                    protagonist=protagonist,
                    trace_role=trace_role,
                )
            )

        parts.append(
            self._fill_template(
                self._rng.choice(_PROSE_TEMPLATES["closing"]),
                setting=setting,
                protagonist=protagonist,
                time_of_day=time_of_day,
            )
        )

        paragraph = "".join(parts)
        paragraph = self._normalize_spacing(paragraph)
        paragraph = self._enforce_word_count(paragraph, narrative_line, protagonist, setting, time_of_day)
        return paragraph

    def _render_scene(
        self, scene: Scene, protagonist: str, setting: str, scene_index: int = 0
    ) -> str:
        """Render a single scene into prose."""
        description = scene.description.strip() if scene.description else ""
        if not description:
            return self._fill_template(
                self._rng.choice(_PROSE_TEMPLATES["scene_progression"]),
                setting=setting or "room",
                protagonist=protagonist,
            )

        templates = _PROSE_TEMPLATES["rendered_scene"]
        # Cycle through templates by scene index to avoid consecutive repetition.
        template = templates[scene_index % len(templates)]
        rendered = template.format(
            protagonist=protagonist,
            description=description,
        )
        return rendered

    def _fallback_paragraph(self) -> str:
        """Return a safe paragraph when no scenes are available."""
        return (
            "纸页空白了很久，像是在等待一个许可才能开始。寂静里有一个句子"
            "鼓起勇气走了出来。它还不是段落，但已不再是沉默。字迹留在屏幕上，"
            "柔软而犹疑，像尘土里的脚印，只要足够耐心，也许会通向某个值得追随"
            "的地方。于是小说家等待着，倾听下一行字从与第一行相同的地方抵达："
            "寻常世界背后那个空洞之处，小说起始之处。"
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _resolve_setting(self, narrative_line: NarrativeLine) -> str:
        """Determine a primary setting from the narrative line."""
        for scene in narrative_line.scenes:
            if scene.setting:
                return scene.setting
        if self._style_profile.get("default_setting"):
            return str(self._style_profile["default_setting"])
        return "安静的房间"

    def _resolve_characters(
        self, narrative_line: NarrativeLine
    ) -> tuple[str, list[str]]:
        """Return the protagonist and a deduplicated character list."""
        characters: list[str] = []
        for scene in narrative_line.scenes:
            for char in scene.characters:
                if char and char not in characters:
                    characters.append(char)
        for conflict in narrative_line.conflicts:
            for party in conflict.parties:
                if party and party not in characters:
                    characters.append(party)

        if not characters:
            if self._style_profile.get("default_protagonist"):
                return str(self._style_profile["default_protagonist"]), []
            return "那个身影", []

        return characters[0], characters

    def _resolve_mood(self, narrative_line: NarrativeLine) -> str:
        """Map aggregate emotional tone to a mood label."""
        tones = [s.emotional_tone for s in narrative_line.scenes if s.emotional_tone != 0.0]
        if not tones:
            return "中性"
        avg = sum(tones) / len(tones)
        if avg > 0.3:
            return "希望"
        if avg < -0.3:
            return "忧郁"
        if avg < -0.6:
            return "黯淡"
        return "紧张"

    def _resolve_time_of_day(self, setting: str) -> str:
        """Guess a time of day from style profile or setting hints."""
        if self._style_profile.get("default_time"):
            return str(self._style_profile["default_time"])
        # 中文关键词匹配
        if "黎明" in setting or "清晨" in setting or "早晨" in setting:
            return "清晨"
        if "黄昏" in setting or "傍晚" in setting:
            return "傍晚"
        if "夜晚" in setting or "深夜" in setting:
            return "夜晚"
        return "午后"

    def _extract_query_tags(self, narrative_line: NarrativeLine) -> list[str]:
        """Gather query tags from narrative line scenes and conflicts."""
        tags: set[str] = set()
        for scene in narrative_line.scenes:
            if scene.setting:
                for word in scene.setting.lower().split():
                    word = word.strip(",.!?;:\"'()[]")
                    if len(word) > 2:
                        tags.add(word)
            if scene.emotional_tone > 0.3:
                tags.add("hope")
            elif scene.emotional_tone < -0.3:
                tags.add("loss")
        for conflict in narrative_line.conflicts:
            if conflict.stakes:
                for word in conflict.stakes.lower().split():
                    cleaned = word.strip(",.!?;:\"'()[]")
                    if len(cleaned) > 3:
                        tags.add(cleaned)
        if narrative_line.foreshadowing:
            tags.add("memory")
        if not tags:
            tags.add("memory")
        return sorted(tags)[:8]

    def _fill_template(self, template: str, **kwargs: str) -> str:
        """Fill a template string, defaulting missing keys gracefully."""
        try:
            return template.format(**kwargs)
        except KeyError:
            return template

    def _normalize_spacing(self, text: str) -> str:
        """Collapse multiple spaces and fix simple punctuation spacing."""
        result = " ".join(text.split())
        result = result.replace(" .", ".").replace(" ,", ",").replace("  ", " ")
        return result

    def _enforce_word_count(
        self,
        paragraph: str,
        narrative_line: NarrativeLine,
        protagonist: str,
        setting: str,
        time_of_day: str,
    ) -> str:
        """Ensure paragraph length is appropriate for its language.

        For Chinese prose we count characters; for English prose we count words.
        """
        current_len = self._text_length(paragraph)
        max_len = 360 if self._is_chinese_dominant(paragraph) else 500
        min_len = 180 if self._is_chinese_dominant(paragraph) else 200

        if current_len > max_len:
            return self._truncate_to_length(paragraph, max_len)

        expansion_parts: list[str] = []
        while self._text_length(paragraph + "".join(expansion_parts)) < min_len:
            template = self._rng.choice(_PROSE_TEMPLATES["expansion"])
            filled = self._fill_template(
                template,
                protagonist=protagonist,
                setting=setting,
                time_of_day=time_of_day,
            )
            expansion_parts.append(filled)
            if len(expansion_parts) > 10:
                break

        if expansion_parts:
            paragraph = paragraph + "".join(expansion_parts)
            paragraph = self._normalize_spacing(paragraph)

        paragraph = self._remove_duplicate_sentences(paragraph)
        final_len = self._text_length(paragraph)
        if final_len > max_len:
            return self._truncate_to_length(paragraph, max_len)
        return paragraph

    @staticmethod
    def _is_chinese_dominant(text: str) -> bool:
        """Return True if the text is mostly Chinese characters."""
        if not text:
            return False
        chinese_chars = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
        return chinese_chars > len(text.split())

    @staticmethod
    def _text_length(text: str) -> int:
        """Return character count for Chinese, word count otherwise."""
        if CreationExecutive._is_chinese_dominant(text):
            return sum(1 for ch in text if not ch.isspace())
        return len(text.split())

    @staticmethod
    def _truncate_to_length(text: str, length: int) -> str:
        """Truncate text to the given length while preserving Chinese chars/words."""
        if CreationExecutive._is_chinese_dominant(text):
            chars = [ch for ch in text if not ch.isspace()]
            return "".join(chars[:length])
        return " ".join(text.split()[:length])

    def _remove_duplicate_sentences(self, paragraph: str) -> str:
        """Remove consecutive duplicate sentences and near-duplicate fragments."""
        if "." not in paragraph:
            return paragraph
        sentences = [s.strip() for s in paragraph.split(".") if s.strip()]
        if not sentences:
            return paragraph

        filtered: list[str] = []
        for sentence in sentences:
            # Skip if this sentence is identical to the previous one.
            if filtered and sentence == filtered[-1]:
                continue
            # Skip if this sentence is a substring of the previous one.
            if filtered and sentence in filtered[-1]:
                continue
            # Skip if the previous sentence is a substring of this one.
            if filtered and filtered[-1] in sentence:
                filtered.pop()
            filtered.append(sentence)

        return ". ".join(filtered) + ("." if filtered else "")
