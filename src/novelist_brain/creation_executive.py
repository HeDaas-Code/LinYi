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
        "{setting} held its breath at {time_of_day}, as if the world itself were waiting for {protagonist} to make the first move. Light fell through the window in pale slabs, illuminating dust motes that drifted like thoughts suspended between memory and the present moment.",
        "In {setting}, the hour had turned inward. {protagonist} stood at the threshold, aware that crossing it would mean acknowledging something that had been quietly assembling for days.",
        "Outside, {setting} unfolded in gray increments. {protagonist} watched it from a still point, as though the whole {time_of_day} were a sentence written only to be revised.",
    ],
    "scene_progression": [
        "{protagonist} moved through {setting}, each step echoing with a significance that only solitude can magnify. The place seemed to lean closer, curious about the weight {protagonist} carried.",
        "Every object in {setting} appeared sharpened by circumstance—the edge of a table, the fold of a curtain, the distant sound of a clock measuring out the remaining silence.",
        "{setting} offered no comfort, only presence. {protagonist} accepted this, understanding that some rooms keep their secrets by listening rather than speaking.",
    ],
    "rendered_scene": [
        "What happened next unfolded slowly: {description} {protagonist} observed it with the particular clarity of someone who knows that ordinary moments are the true plot of a life.",
        "{protagonist} was still trying to name the feeling when {description} The sensation was less like surprise than like recognition delayed by years.",
        "Then, as if the moment had been waiting for permission: {description} {protagonist} noticed how the air seemed to change its mind about silence.",
        "Nothing announced itself, yet something shifted: {description} {protagonist} carried the image carefully, afraid it would bruise.",
        "The next thing revealed itself in fragments: {description} {protagonist} recognized it before understanding it, the way one recognizes a voice in a dark room.",
    ],
    "dialogue": [
        "'I keep thinking about what you said,' {char1} admitted, the words escaping like moths. {char2} looked away. 'Some things aren't meant to be finished,' {char2} replied. 'Only carried.'",
        "'Do you remember when this felt simple?' {char1} asked. {char2} smiled, but it did not reach the eyes. 'I remember when we pretended it was,' {char2} said.",
        "'The story keeps changing on me,' {char1} said quietly. {char2} nodded. 'That's how you know it's still alive,' {char2} answered.",
    ],
    "monologue": [
        "{protagonist} spoke the words only to the empty room, yet they sounded like a letter written to someone who might never read it: 'I am still here, even when the story forgets me.'",
        "Aloud, {protagonist} said nothing; but inwardly a voice kept repeating the same line, as if practicing it for a confession that might never arrive.",
    ],
    "trace_texture": [
        "Somewhere beneath the surface of the moment moved the residue of older days—a {trace_role} returning not as fact but as weather, changing the temperature of everything {protagonist} touched.",
        "The memory arrived without permission, a {trace_role} pressed between the pages of the afternoon, its edges softened by the many times it had already been reread.",
    ],
    "closing": [
        "And so the {time_of_day} settled into its own uncertain conclusion, leaving {protagonist} with the peculiar loneliness of a person who has finally understood the next sentence but must still find the courage to write it.",
        "When the light finally shifted, {protagonist} remained in place, holding the moment like a fragile manuscript: one more paragraph, one more silence, one more step toward the story that was slowly becoming real.",
    ],
    "expansion": [
        "A dog barked somewhere far below, and the sound seemed to travel a great distance before reaching {protagonist}, as though even noise were tired.",
        "The air smelled of rain that had not yet fallen, a promise held in abeyance, and {protagonist} breathed it in like a secret.",
        "For a long while nothing moved except the shadows, which lengthened across the floor with the patience of a narrator who has all the time in the world.",
        "It was the kind of stillness that makes a person aware of their own heartbeat, each pulse a small reminder that the body, at least, remains loyal to the present tense.",
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

        self.subscribe(
            "data.sandbox.narrative.ready",
            "data.identity.constraint",
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

    def on_bus_message(self, message: BusMessage) -> None:
        """Handle narrative ready, identity constraints, and trace results."""
        if not self._state.active:
            return

        if message.topic == "data.sandbox.narrative.ready":
            self._handle_narrative_ready(message.payload)
        elif message.topic == "data.identity.constraint":
            self._handle_identity_constraint(message.payload)
        elif message.topic == "data.memory.trace.query.result":
            self._handle_trace_results(message.payload)

    def tick(self, delta: TickDelta) -> None:
        """Advance creation executive bookkeeping."""
        self._state.last_tick = delta.absolute_time

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
        """Generate a paragraph once relevant memory traces arrive."""
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
        if self._current_narrative_line is not None:
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
        if self._style_profile.get("identity"):
            return dict(self._style_profile["identity"])
        return {
            "name": "the novelist",
            "values": ["truth", "beauty"],
            "traits": {"introspection": 0.8, "observation": 0.7},
            "self_narrative": "I turn ordinary moments into fiction.",
            "interests": self._focus_stack or ["memory", "loneliness", "time"],
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

        paragraph = " ".join(parts)
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
        """Ensure paragraph length is between 200 and 500 words."""
        words = paragraph.split()
        if len(words) > 500:
            return " ".join(words[:500])

        expansion_parts: list[str] = []
        while len(words) + len(" ".join(expansion_parts).split()) < 200:
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
            # Append expansions with a soft transitional phrase.
            paragraph = paragraph + " " + " ".join(expansion_parts)
            paragraph = self._normalize_spacing(paragraph)

        paragraph = self._remove_duplicate_sentences(paragraph)
        final_words = paragraph.split()
        if len(final_words) > 500:
            return " ".join(final_words[:500])
        return paragraph

    def _remove_duplicate_sentences(self, paragraph: str) -> str:
        """Remove consecutive duplicate sentences and near-duplicate fragments."""
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
