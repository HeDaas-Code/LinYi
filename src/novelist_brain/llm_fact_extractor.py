"""LLMFactExtractor: automatically maintain known facts for reader and OCs.

Inspired by MemGPT's memory manager and MaiBot's persona learning loop, this
module watches ``event.reader.interaction``, ``data.conversation.queue.update``
and ``data.oc.town.event``.  When enough raw text has accumulated it asks the
LLM to extract stable facts and writes them into:

- :class:`ReaderProfile` ``known_facts``
- :class:`OCCharacterSystem` ``known_facts`` on each :class:`OCCharacterSheet`

When no real LLM is available, a rule-based heuristic fallback extracts common
self-disclosure patterns (name, likes, location, work, relationships) so tests
and offline runs still produce usable memory.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module

if TYPE_CHECKING:
    from src.novelist_brain.llm import LLMService
    from src.novelist_brain.oc_character_system import OCCharacterSystem
    from src.novelist_brain.reader_profile import ReaderProfile


#: Emitted when one or more facts have been extracted and stored.
TOPIC_FACT_EXTRACTED = "data.fact.extracted"

#: Reader-facing self-disclosure patterns used by the heuristic fallback.
_READER_FACT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("name", re.compile(r"(?:我叫|我是|我的名字是)\s*[:：]?\s*([^，。！？\n]{1,20})")),
    ("age", re.compile(r"(?:我(\d{1,3})岁|我今年(\d{1,3})岁)")),
    ("location", re.compile(r"(?:我住在|我来自|我在)\s*[:：]?\s*([^，。！？\n]{1,30})")),
    ("job", re.compile(r"(?:我的工作是|我是一名|我做|我从事)\s*[:：]?\s*([^，。！？\n]{1,30})")),
    ("like", re.compile(r"(?:我喜欢|我爱|我钟爱)\s*[:：]?\s*([^，。！？\n]{1,40})")),
    ("dislike", re.compile(r"(?:我讨厌|我不喜欢|我厌恶)\s*[:：]?\s*([^，。！？\n]{1,40})")),
    ("relationship", re.compile(r"(?:我的男/女朋友是|我的伴侣是|我的对象是|我的配偶是)\s*[:：]?\s*([^，。！？\n]{1,20})")),
]

#: OC-facing third-person patterns used by the heuristic fallback.
_OC_FACT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("name", re.compile(r"(?:名叫|名字是|是)\s*[:：]?\s*([^，。！？\n]{1,20})")),
    ("age", re.compile(r"(?:今年?(\d{1,3})岁|(\d{1,3})岁)")),
    ("location", re.compile(r"(?:住在|来自|在)\s*[:：]?\s*([^，。！？\n]{1,30})")),
    ("job", re.compile(r"(?:工作是|职业是|是一名|从事)\s*[:：]?\s*([^，。！？\n]{1,30})")),
    ("like", re.compile(r"(?:喜欢|爱|钟爱)\s*[:：]?\s*([^，。！？\n]{1,40})")),
    ("dislike", re.compile(r"(?:讨厌|不喜欢|厌恶)\s*[:：]?\s*([^，。！？\n]{1,40})")),
]


@dataclass
class ExtractedFact:
    """A single fact extracted from raw text."""

    target_type: str  # reader | oc
    target_id: str
    key: str
    value: str
    confidence: float = 1.0
    source_text: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "target_type": self.target_type,
            "target_id": self.target_id,
            "key": self.key,
            "value": self.value,
            "confidence": self.confidence,
            "source_text": self.source_text,
        }


class LLMFactExtractor(Module):
    """Extract and persist facts about the reader and OCs.

    Configuration via ``context["llm_fact_extractor"]``:

    - ``reader_enabled`` (bool): extract reader facts (default True).
    - ``oc_enabled`` (bool): extract OC facts (default True).
    - ``llm_enabled`` (bool): use LLM when available (default True).
    - ``min_chars`` (int): minimum accumulated text before extraction
      (default 30).
    - ``max_buffer_turns`` (int): force a flush after this many buffered turns
      (default 5).
    - ``cooldown_seconds`` (float): minimum seconds between extractions for the
      same target (default 60).
    - ``max_facts_per_run`` (int): cap on new facts per extraction (default 3).
    - ``llm_temperature`` (float): LLM sampling temperature (default 0.2).
    - ``llm_max_tokens`` (int): LLM output budget (default 400).

    Subscribes to:

    - ``event.reader.interaction``
    - ``data.reader.message``
    - ``data.conversation.queue.update``
    - ``data.oc.town.event``
    - ``control.fact.extract`` (explicit request)
    """

    def __init__(
        self,
        name: str = "llm_fact_extractor",
        *,
        reader_enabled: bool = True,
        oc_enabled: bool = True,
        llm_enabled: bool = True,
        min_chars: int = 30,
        max_buffer_turns: int = 5,
        cooldown_seconds: float = 60.0,
        max_facts_per_run: int = 3,
        llm_temperature: float = 0.2,
        llm_max_tokens: int = 400,
    ) -> None:
        super().__init__(name)
        self._reader_enabled = bool(reader_enabled)
        self._oc_enabled = bool(oc_enabled)
        self._llm_enabled = bool(llm_enabled)
        self._min_chars = max(0, int(min_chars))
        self._max_buffer_turns = max(1, int(max_buffer_turns))
        self._cooldown_seconds = max(0.0, float(cooldown_seconds))
        self._max_facts_per_run = max(1, int(max_facts_per_run))
        self._llm_temperature = float(llm_temperature)
        self._llm_max_tokens = int(llm_max_tokens)

        self._reader_buffer: list[tuple[str, float]] = []
        self._oc_buffer: dict[str, list[tuple[str, float]]] = {}
        self._last_run: dict[str, float] = {}

        self._reader_profile: ReaderProfile | None = None
        self._oc_system: OCCharacterSystem | None = None
        self._llm: LLMService | None = None

        self.subscribe(
            "event.reader.interaction",
            "data.reader.message",
            "data.conversation.queue.update",
            "data.oc.town.event",
            "control.fact.extract",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "llm_fact_extractor",
            "version": "0.1.0",
            "description": "Automatically extract reader/OC facts from dialogue",
            "dependencies": [],
            "category": "memory",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.05,
            custom={
                "reader_facts_extracted": 0,
                "oc_facts_extracted": 0,
                "reader_runs": 0,
                "oc_runs": 0,
            },
        )

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("llm_fact_extractor", {})

        if isinstance(cfg.get("reader_enabled"), bool):
            self._reader_enabled = cfg["reader_enabled"]
        if isinstance(cfg.get("oc_enabled"), bool):
            self._oc_enabled = cfg["oc_enabled"]
        if isinstance(cfg.get("llm_enabled"), bool):
            self._llm_enabled = cfg["llm_enabled"]

        if isinstance(cfg.get("min_chars"), int) and cfg["min_chars"] >= 0:
            self._min_chars = cfg["min_chars"]
        if isinstance(cfg.get("max_buffer_turns"), int) and cfg["max_buffer_turns"] > 0:
            self._max_buffer_turns = cfg["max_buffer_turns"]
        if isinstance(cfg.get("cooldown_seconds"), (int, float)) and cfg["cooldown_seconds"] >= 0:
            self._cooldown_seconds = float(cfg["cooldown_seconds"])
        if isinstance(cfg.get("max_facts_per_run"), int) and cfg["max_facts_per_run"] > 0:
            self._max_facts_per_run = cfg["max_facts_per_run"]
        if isinstance(cfg.get("llm_temperature"), (int, float)):
            self._llm_temperature = float(cfg["llm_temperature"])
        if isinstance(cfg.get("llm_max_tokens"), int) and cfg["llm_max_tokens"] > 0:
            self._llm_max_tokens = cfg["llm_max_tokens"]

        self._reader_profile = context.get("reader_profile_instance")
        self._oc_system = context.get("oc_character_system_instance")
        self._llm = context.get("llm_service")

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        payload = message.payload or {}
        topic = message.topic

        if topic == "control.fact.extract":
            self._handle_control_extract(payload)
            return

        if topic in ("event.reader.interaction", "data.reader.message"):
            text = str(
                payload.get("content") or payload.get("summary") or payload.get("text", "")
            ).strip()
            if text and self._reader_enabled:
                self._reader_buffer.append((text, time.time()))
                self._try_flush_reader()
            return

        if topic == "data.conversation.queue.update":
            turn = payload.get("turn") or {}
            text = str(turn.get("content") or "").strip()
            role = str(turn.get("role", ""))
            if text and self._reader_enabled and role in {"user", "agent"}:
                self._reader_buffer.append((text, time.time()))
                self._try_flush_reader()
            return

        if topic == "data.oc.town.event":
            if not self._oc_enabled:
                return
            text = str(payload.get("summary") or "").strip()
            if not text:
                return
            character_id = str(payload.get("character_id") or payload.get("oc_name") or "").strip()
            if character_id:
                self._oc_buffer.setdefault(character_id, []).append((text, time.time()))
                self._try_flush_oc(character_id)
            else:
                # Try to associate text with any known OC name.
                for cid in self._known_oc_ids():
                    name = self._oc_display_name(cid)
                    if name and name in text:
                        self._oc_buffer.setdefault(cid, []).append((text, time.time()))
                        self._try_flush_oc(cid)
            return

    def tick(self, delta: TickDelta) -> None:
        # Soft flush on tick: if buffers are old and large enough, run even
        # without an explicit event.
        now = delta.absolute_time
        if self._reader_enabled and self._should_flush("reader", now):
            self._flush_reader()
        if self._oc_enabled:
            for cid in list(self._oc_buffer.keys()):
                if self._should_flush(f"oc:{cid}", now):
                    self._flush_oc(cid)

    # ------------------------------------------------------------------
    # Flush logic
    # ------------------------------------------------------------------

    def _try_flush_reader(self) -> None:
        if self._should_flush("reader", time.time()):
            self._flush_reader()

    def _try_flush_oc(self, character_id: str) -> None:
        if self._should_flush(f"oc:{character_id}", time.time()):
            self._flush_oc(character_id)

    def _should_flush(self, target_key: str, now: float) -> bool:
        if target_key == "reader":
            buffer = self._reader_buffer
        else:
            character_id = target_key.split(":", 1)[1]
            buffer = self._oc_buffer.get(character_id, [])
        if not buffer:
            return False
        if len(buffer) >= self._max_buffer_turns:
            return True
        total_chars = sum(len(t) for t, _ in buffer)
        if total_chars < self._min_chars:
            return False
        if target_key not in self._last_run:
            return True
        return (now - self._last_run[target_key]) >= self._cooldown_seconds

    def _flush_reader(self) -> list[ExtractedFact]:
        if not self._reader_buffer:
            return []
        now = time.time()
        texts = [t for t, _ in self._reader_buffer]
        source_text = "\n".join(texts)
        existing = self._reader_known_facts()
        facts = self._extract_facts(
            target_type="reader",
            target_id=self._reader_id(),
            text=source_text,
            existing_facts=existing,
            target_name="读者",
        )
        self._reader_buffer.clear()
        self._last_run["reader"] = now

        stored = 0
        for fact in facts:
            if self._reader_profile is not None:
                self._reader_profile.set_fact(fact.key, fact.value)
                stored += 1
        if facts:
            self._state.custom["reader_runs"] = (
                int(self._state.custom.get("reader_runs", 0)) + 1
            )
            self._state.custom["reader_facts_extracted"] = (
                int(self._state.custom.get("reader_facts_extracted", 0)) + stored
            )
            self._emit_extracted(facts)
        return facts

    def _flush_oc(self, character_id: str) -> list[ExtractedFact]:
        buffer = self._oc_buffer.get(character_id, [])
        if not buffer:
            return []
        now = time.time()
        texts = [t for t, _ in buffer]
        source_text = "\n".join(texts)
        existing = self._oc_known_facts(character_id)
        name = self._oc_display_name(character_id) or character_id
        facts = self._extract_facts(
            target_type="oc",
            target_id=character_id,
            text=source_text,
            existing_facts=existing,
            target_name=name,
        )
        buffer.clear()
        self._last_run[f"oc:{character_id}"] = now

        stored = 0
        for fact in facts:
            if self._oc_system is not None:
                if self._oc_system.set_fact(fact.target_id, fact.key, fact.value):
                    stored += 1
        if facts:
            self._state.custom["oc_runs"] = (
                int(self._state.custom.get("oc_runs", 0)) + 1
            )
            self._state.custom["oc_facts_extracted"] = (
                int(self._state.custom.get("oc_facts_extracted", 0)) + stored
            )
            self._emit_extracted(facts)
        return facts

    # ------------------------------------------------------------------
    # Extraction core
    # ------------------------------------------------------------------

    def _extract_facts(
        self,
        *,
        target_type: str,
        target_id: str,
        text: str,
        existing_facts: dict[str, str],
        target_name: str,
    ) -> list[ExtractedFact]:
        """Return validated, deduplicated facts for a target."""
        if self._llm_enabled and self._llm is not None and not self._llm.is_mock:
            facts = self._llm_extract_facts(
                target_type=target_type,
                target_id=target_id,
                text=text,
                existing_facts=existing_facts,
                target_name=target_name,
            )
        else:
            facts = self._heuristic_extract_facts(
                target_type=target_type,
                target_id=target_id,
                text=text,
                patterns=_OC_FACT_PATTERNS if target_type == "oc" else _READER_FACT_PATTERNS,
            )

        # Deduplicate and filter.
        seen: set[str] = set()
        out: list[ExtractedFact] = []
        for fact in facts:
            if not fact.key or not fact.value:
                continue
            if len(fact.value) < 2:
                continue
            norm_key = fact.key.strip().lower()
            norm_value = fact.value.strip().lower()
            if (norm_key, norm_value) in seen:
                continue
            # Skip if existing fact is essentially the same.
            if self._is_redundant(existing_facts, norm_key, norm_value):
                continue
            seen.add((norm_key, norm_value))
            out.append(fact)
            if len(out) >= self._max_facts_per_run:
                break
        return out

    def _llm_extract_facts(
        self,
        *,
        target_type: str,
        target_id: str,
        text: str,
        existing_facts: dict[str, str],
        target_name: str,
    ) -> list[ExtractedFact]:
        """Ask the LLM for structured facts."""
        existing_lines = "\n".join(
            f"- {k}: {v}" for k, v in list(existing_facts.items())[:20]
        ) or "（无）"
        role_hint = "读者" if target_type == "reader" else f"角色 {target_name}"
        prompt = (
            f"请从以下关于{role_hint}的描述/对话中提取稳定事实（如姓名、喜好、"
            f"关系、生活细节等）。只提取明确或高度暗示的信息，不要猜测。"
            f"如果与已有事实重复，请省略。\n\n"
            f"已有事实：\n{existing_lines}\n\n"
            f"描述/对话：\n{text}\n\n"
            f'请以 JSON 数组返回，每项包含 "key" 和 "value"：\n'
            f'[{{"key":"...","value":"..."}}]\n'
            f"如果没有新事实，返回 []。"
        )
        try:
            raw = self._llm.complete(  # type: ignore[union-attr]
                prompt,
                temperature=self._llm_temperature,
                max_tokens=self._llm_max_tokens,
            )
        except Exception:
            # On LLM failure fall back to heuristic so memory keeps working.
            patterns = _OC_FACT_PATTERNS if target_type == "oc" else _READER_FACT_PATTERNS
            return self._heuristic_extract_facts(
                target_type=target_type,
                target_id=target_id,
                text=text,
                patterns=patterns,
            )
        return self._parse_llm_response(
            target_type=target_type,
            target_id=target_id,
            text=text,
            raw=raw,
        )

    def _parse_llm_response(
        self,
        *,
        target_type: str,
        target_id: str,
        text: str,
        raw: str,
    ) -> list[ExtractedFact]:
        """Parse JSON or pseudo-key-value LLM output into facts."""
        facts: list[ExtractedFact] = []
        cleaned = raw.strip()
        if not cleaned:
            return facts

        # Strip markdown code fences.
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:].strip()

        # Try JSON array first.
        try:
            data = json.loads(cleaned)
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        key = str(item.get("key") or item.get("fact") or "").strip()
                        value = str(item.get("value") or item.get("content") or "").strip()
                        if key and value:
                            facts.append(
                                ExtractedFact(
                                    target_type=target_type,
                                    target_id=target_id,
                                    key=key,
                                    value=value,
                                    source_text=text[:200],
                                )
                            )
                return facts
        except json.JSONDecodeError:
            pass

        # Fallback: line-oriented "key: value" or "- key: value".
        for line in cleaned.splitlines():
            line = line.strip().lstrip("-").strip()
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value:
                facts.append(
                    ExtractedFact(
                        target_type=target_type,
                        target_id=target_id,
                        key=key,
                        value=value,
                        source_text=text[:200],
                    )
                )
        return facts

    def _heuristic_extract_facts(
        self,
        *,
        target_type: str,
        target_id: str,
        text: str,
        patterns: list[tuple[str, re.Pattern[str]]],
    ) -> list[ExtractedFact]:
        """Rule-based fact extraction for mock/offline mode."""
        facts: list[ExtractedFact] = []
        seen: set[tuple[str, str]] = set()
        for key, pattern in patterns:
            for match in pattern.finditer(text):
                value = next((g for g in match.groups() if g), "").strip()
                if not value:
                    continue
                # Clean trailing punctuation.
                value = re.sub(r"[，。！？；：]+$", "", value)
                if len(value) < 2:
                    continue
                norm = (key.lower(), value.lower())
                if norm in seen:
                    continue
                seen.add(norm)
                facts.append(
                    ExtractedFact(
                        target_type=target_type,
                        target_id=target_id,
                        key=key,
                        value=value,
                        confidence=0.7,
                        source_text=text[:200],
                    )
                )
        return facts

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _reader_id(self) -> str:
        if self._reader_profile is None:
            return "default_reader"
        return self._reader_profile.profile.reader_id

    def _reader_known_facts(self) -> dict[str, str]:
        if self._reader_profile is None:
            return {}
        return dict(self._reader_profile.profile.known_facts)

    def _known_oc_ids(self) -> list[str]:
        if self._oc_system is None:
            return []
        return list(getattr(self._oc_system, "_sheets", {}).keys())

    def _oc_display_name(self, character_id: str) -> str:
        if self._oc_system is None:
            return ""
        sheet = self._oc_system.get_sheet(character_id)
        if sheet is None:
            return ""
        return sheet.name or character_id

    def _oc_known_facts(self, character_id: str) -> dict[str, str]:
        if self._oc_system is None:
            return {}
        sheet = self._oc_system.get_sheet(character_id)
        if sheet is None:
            return {}
        return dict(sheet.known_facts)

    @staticmethod
    def _is_redundant(existing_facts: dict[str, str], norm_key: str, norm_value: str) -> bool:
        """Return True if the key/value is already covered by existing facts."""
        for k, v in existing_facts.items():
            if norm_key == k.strip().lower() or norm_value == v.strip().lower():
                return True
        return False

    def _handle_control_extract(self, payload: dict[str, Any]) -> None:
        """Handle explicit ``control.fact.extract`` requests."""
        target_type = str(payload.get("target_type", "")).lower()
        text = str(payload.get("text", "")).strip()
        if not text:
            return

        if target_type == "reader" and self._reader_enabled:
            existing = self._reader_known_facts()
            facts = self._extract_facts(
                target_type="reader",
                target_id=self._reader_id(),
                text=text,
                existing_facts=existing,
                target_name="读者",
            )
            for fact in facts:
                if self._reader_profile is not None:
                    self._reader_profile.set_fact(fact.key, fact.value)
            if facts:
                self._emit_extracted(facts)
            return

        if target_type == "oc" and self._oc_enabled:
            character_id = str(payload.get("target_id", "")).strip()
            if not character_id:
                return
            existing = self._oc_known_facts(character_id)
            name = self._oc_display_name(character_id) or character_id
            facts = self._extract_facts(
                target_type="oc",
                target_id=character_id,
                text=text,
                existing_facts=existing,
                target_name=name,
            )
            for fact in facts:
                if self._oc_system is not None:
                    self._oc_system.set_fact(fact.target_id, fact.key, fact.value)
            if facts:
                self._emit_extracted(facts)

    def _emit_extracted(self, facts: list[ExtractedFact]) -> None:
        if self._router is None or not facts:
            return
        self.emit(
            topic=TOPIC_FACT_EXTRACTED,
            payload={
                "facts": [f.to_dict() for f in facts],
                "count": len(facts),
            },
            channel="data",
            priority=5,
            ttl=3,
        )

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "reader_enabled": self._reader_enabled,
                "oc_enabled": self._oc_enabled,
                "llm_enabled": self._llm_enabled,
                "min_chars": self._min_chars,
                "max_buffer_turns": self._max_buffer_turns,
                "cooldown_seconds": self._cooldown_seconds,
                "max_facts_per_run": self._max_facts_per_run,
                "llm_temperature": self._llm_temperature,
                "llm_max_tokens": self._llm_max_tokens,
                "reader_buffer": [t for t, _ in self._reader_buffer],
                "oc_buffer": {
                    cid: [t for t, _ in items]
                    for cid, items in self._oc_buffer.items()
                },
                "last_run": dict(self._last_run),
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._reader_enabled = bool(data.get("reader_enabled", True))
        self._oc_enabled = bool(data.get("oc_enabled", True))
        self._llm_enabled = bool(data.get("llm_enabled", True))
        self._min_chars = max(0, int(data.get("min_chars", 30)))
        self._max_buffer_turns = max(1, int(data.get("max_buffer_turns", 5)))
        self._cooldown_seconds = max(0.0, float(data.get("cooldown_seconds", 60.0)))
        self._max_facts_per_run = max(1, int(data.get("max_facts_per_run", 3)))
        self._llm_temperature = float(data.get("llm_temperature", 0.2))
        self._llm_max_tokens = max(1, int(data.get("llm_max_tokens", 400)))

        now = time.time()
        self._reader_buffer = [
            (str(t), now) for t in data.get("reader_buffer", []) if isinstance(t, str)
        ]
        oc_data = data.get("oc_buffer", {})
        self._oc_buffer = {}
        if isinstance(oc_data, dict):
            for cid, items in oc_data.items():
                if isinstance(items, list):
                    self._oc_buffer[str(cid)] = [
                        (str(t), now) for t in items if isinstance(t, str)
                    ]
        self._last_run = {
            str(k): float(v)
            for k, v in data.get("last_run", {}).items()
            if isinstance(v, (int, float))
        }


__all__ = [
    "LLMFactExtractor",
    "ExtractedFact",
    "TOPIC_FACT_EXTRACTED",
]
