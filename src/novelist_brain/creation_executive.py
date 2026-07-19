"""Creation executive module for the novelist brain prototype."""

from __future__ import annotations

import random
from typing import Any

from src.novelist_brain import prompts
from src.novelist_brain.llm import LLMCallError, LLMService, MockLLMService
from src.novelist_brain.models import BusMessage, ModuleState, NarrativeLine, Scene, TickDelta, Trace
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass


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
        self._current_phase: str | None = None

        self.subscribe(
            "data.sandbox.narrative.ready",
            "data.identity.constraint",
            "data.identity.updated",
            "data.memory.trace.query.result",
            "control.module.init",
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
            if isinstance(self._llm, MockLLMService):
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
        elif message.topic in ("data.identity.constraint", "data.identity.updated"):
            self._handle_identity_constraint(message.payload)
        elif message.topic == "data.memory.trace.query.result":
            self._handle_trace_results(message.payload)

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
            if isinstance(self._llm, MockLLMService):
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
        if self._llm is not None and not isinstance(self._llm, MockLLMService):
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
