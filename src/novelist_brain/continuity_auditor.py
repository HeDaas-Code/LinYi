"""ContinuityAuditor — six-dimensional continuity audit for novel paragraphs.

Per ``docs/系统重构方案_v1.md`` §3.10 / §8 / §9 (Stage 4), this module audits
each published paragraph across six dimensions:

1. **OOC** — character behavior vs ``OCCharacterSheet.traits`` / ``desires``
   / ``fears`` / ``immutable_facts``.
2. **setting_conflict** — paragraph vs ``WorldStateContract.rules`` /
   ``forbidden`` + anachronism check.
3. **timeline** — event ordering contradictions (time-reference tokens +
   character presence transitions).
4. **foreshadowing** — introduced-not-paid / early-payoff / missing-plan /
   reinforce-before-introduce.
5. **style** — paragraph metrics vs ``StyleFingerprint`` + forbidden phrases.
6. **rhythm** — chapter-level Hook / climax / chapter-end suspense
   (emitted with ``category="tone"`` because ``ContinuityIssue.category``
   only allows the literal set ``{"ooc", "setting_conflict", "timeline",
   "foreshadowing", "tone", "style"}`` per ``models.py`` — "rhythm" maps
   to "tone" as the closest valid literal).

Subscribes to (per ``topics.py`` REFACTOR_V2_TOPICS):

- ``event.novel.paragraph.published`` — audit on each new paragraph.
- ``control.novel.audit`` — explicit audit trigger.
- ``control.module.init`` — init handshake.
- ``data.sandbox.world.updated`` — refresh cached ``WorldStateContract``.
- ``data.oc.evolved`` — refresh cached OC sheets.

Publishes:

- ``data.novel.audit.issues`` — ``{issues, chapter_id, paragraph_index,
  audit_timestamp}``.

Persistence:

``audit_state/{novel_id}.json`` — timeline events, foreshadowing state,
character presence map, audit history. Writes go through
:meth:`PersistenceManager.save_atomic` (§3.2.2 atomic strategy).
"""

from __future__ import annotations

import datetime
import json
import os
import re
from typing import Any

from src.novelist_brain.models import (
    BusMessage,
    ChapterIntent,
    ContinuityIssue,
    ForeshadowingEntry,
    ForeshadowingOp,
    ModuleState,
    OCCharacterSheet,
    Paragraph,
    RhythmProfile,
    StoryBible,
    StyleFingerprint,
    TickDelta,
    TraitVector,
    WorldStateContract,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import PersistenceManager


# ---------------------------------------------------------------------------
# Topic string literals (Task 4.3 will unify these into ``topics.py``).
# ---------------------------------------------------------------------------

_TOPIC_PARAGRAPH_PUBLISHED = "event.novel.paragraph.published"
_TOPIC_AUDIT_CONTROL = "control.novel.audit"
_TOPIC_MODULE_INIT = "control.module.init"
_TOPIC_WORLD_UPDATED = "data.sandbox.world.updated"
_TOPIC_OC_EVOLVED = "data.oc.evolved"

_TOPIC_AUDIT_ISSUES = "data.novel.audit.issues"


# ---------------------------------------------------------------------------
# Tunable thresholds (per SubTask 4.1.6 / 4.1.7).
# ---------------------------------------------------------------------------

# Style-metric deviation thresholds: flag when |paragraph - fingerprint|
# exceeds the threshold for the given metric.
_STYLE_DEVIATION_THRESHOLDS: dict[str, float] = {
    "vocabulary_density": 0.15,
    "sentence_length_variance": 0.20,
    "dialogue_ratio": 0.20,
}

# Rhythm thresholds (per SubTask 4.1.7).
_HOOK_STRENGTH_THRESHOLD = 0.4
_COOL_POINT_DENSITY_THRESHOLD = 0.3
_CHAPTER_END_SUSPENSE_REST_RATIO = 0.2  # rest_ratio <= this → expect chapter-end hook

# Foreshadowing staleness: chapters after which an introduced-but-unreinforced
# foreshadowing is flagged as missing a payoff plan.
_FORESHADOW_STALENESS_CHAPTERS = 5

# Caps to keep in-memory state bounded for long-running novels.
_MAX_TIMELINE_EVENTS = 1000
_MAX_AUDIT_HISTORY = 500


# ---------------------------------------------------------------------------
# Lexicons used by the keyword-based auditors.
# ---------------------------------------------------------------------------

# Time-reference tokens recognised by the timeline auditor.
_TIME_TOKENS_PAST: tuple[str, ...] = (
    "昨天", "前天", "之前", "刚才", "刚刚", "先前", "昔日", "往日",
)
_TIME_TOKENS_FUTURE: tuple[str, ...] = (
    "明天", "后天", "将来", "之后", "稍后", "未来", "次日",
)
_TIME_TOKENS_PRESENT: tuple[str, ...] = (
    "今天", "现在", "此刻", "如今", "眼下",
)

# Character-presence transition tokens.
_LEAVE_TOKENS: tuple[str, ...] = (
    "离开", "走开", "退场", "消失", "走了", "离去", "退下", "转身离去",
    "夺门而出", "扬长而去",
)
_RETURN_TOKENS: tuple[str, ...] = (
    "回来", "返回", "重新出现", "再次出现", "重新登场", "归来",
)

# Modern-item tokens flagged in 古代 settings (complements the OC system's
# ``_MODERN_SKILLS`` list).
_MODERN_ITEM_TOKENS: tuple[str, ...] = (
    "手机", "电脑", "电视", "电话", "汽车", "电灯", "电梯",
    "飞机", "火车", "高铁", "相机", "电子", "网络", "互联网",
    "收音机", "录像", "视频", "微信", "邮件", "App",
)
_ANCIENT_GENRE_TOKENS: tuple[str, ...] = (
    "古代", "古风", "古代中国", "历史", "ancient", "historical",
)

# OOC behavior keywords: maps trait axis → (high-trait behavior keywords,
# low-trait behavior keywords). When a character's trait value is on the
# extreme end and the paragraph shows the *opposite* behavior, flag an OOC.
_TRAIT_BEHAVIOR_MAP: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    # extraversion: low = introvert (avoids social), high = extravert (seeks social)
    "extraversion": (
        ("主动社交", "热情寒暄", "大声招呼", "主动攀谈", "热情洋溢",
         "开怀大笑", "活跃气氛", "滔滔不绝", "侃侃而谈"),
        ("独处", "回避", "沉默", "退到角落", "避开人群", "寡言",
         "独自一人", "静静坐着", "默然"),
    ),
    # neuroticism: low = emotionally stable, high = anxious/fragile
    "neuroticism": (
        ("泰然自若", "处变不惊", "冷静应对", "毫不动容", "镇定自若"),
        ("惊慌失措", "颤抖", "战栗", "心跳加速", "焦虑", "恐惧",
         "手足无措", "心神不宁"),
    ),
    # conscientiousness: low = careless, high = meticulous
    "conscientiousness": (
        ("草率", "鲁莽", "冲动", "毛手毛脚", "毫不顾忌", "莽撞"),
        ("仔细检查", "反复确认", "细致入微", "一丝不苟", "斟酌"),
    ),
    # agreeableness: low = cold/hostile, high = warm/cooperative
    "agreeableness": (
        ("冷漠", "嘲讽", "讥讽", "敌意", "冷言冷语", "刻薄"),
        ("体贴", "关怀", "温柔以待", "善解人意", "和颜悦色"),
    ),
}

# Hook / climax / suspense cue tokens used by the rhythm auditor.
_HOOK_CUES: tuple[str, ...] = (
    "?", "？", "!", "！", "突然", "忽然", "意外", "奇怪",
    "诡异", "谜", "未知", "消失", "出现", "为什么", "为何",
)
_CLIMAX_CUES: tuple[str, ...] = (
    "高潮", "爆发", "对决", "对峙", "冲突", "转折", "震惊",
    "意外", "猛然", "骤然",
)
_SUSPENSE_CUES: tuple[str, ...] = (
    "?", "？", "……", "...", "未完", "下文", "下一步",
    "然而", "可是", "但是", "究竟", "到底", "究竟会",
)

# Default forbidden phrases (per ``prompts.DE_AI_RULES``). Always checked
# even when no ``StyleFingerprint`` is configured.
_DEFAULT_FORBIDDEN_PHRASES: tuple[str, ...] = (
    "然而", "综上所述", "与此同时", "事实上", "总而言之",
    "由此可见", "毋庸置疑", "不仅而且",
)


def _now_iso() -> str:
    """Return a UTC ISO-8601 timestamp string."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _contains_any(text: str, tokens: tuple[str, ...]) -> str | None:
    """Return the first token found in ``text``, else ``None``."""
    for token in tokens:
        if token and token in text:
            return token
    return None


class ContinuityAuditor(Module):
    """Six-dimensional continuity auditor for novel paragraphs.

    State:
        - ``novel_id``: str (defaults to ``"linyi_default"``)
        - ``audit_state_dir``: root directory for audit-state files
          (defaults to ``"audit_state"``)
        - ``_story_bible`` / ``_world_contract`` / ``_character_registry``
          / ``_style_fingerprint`` / ``_chapter_blueprint``: truth sources
          populated by :meth:`init`.
        - ``_chapter_manager``: optional :class:`ChapterManager` reference
          for chapter-level audits and prior-paragraph lookup.
        - ``_timeline_events`` / ``_foreshadowing_state`` /
          ``_character_presence`` / ``_audit_history``: persisted audit
          state used by the timeline / foreshadowing / presence checks.
    """

    def __init__(
        self,
        name: str = "continuity_auditor",
        novel_id: str = "linyi_default",
        audit_state_dir: str = "audit_state",
    ) -> None:
        super().__init__(name)
        self._novel_id: str = novel_id
        self._audit_state_dir: str = audit_state_dir
        self._state_path: str = os.path.join(audit_state_dir, f"{novel_id}.json")

        # Truth sources (populated by init()).
        self._story_bible: StoryBible | None = None
        self._world_contract: WorldStateContract | None = None
        self._character_registry: dict[str, OCCharacterSheet] = {}
        self._chapter_manager: Any = None  # ChapterManager | None
        self._style_fingerprint: StyleFingerprint | None = None
        self._chapter_blueprint: list[ChapterIntent] = []

        # Persisted audit state.
        self._timeline_events: list[dict[str, Any]] = []
        self._foreshadowing_state: dict[str, dict[str, Any]] = {}
        self._character_presence: dict[str, dict[str, Any]] = {}
        self._audit_history: list[dict[str, Any]] = []
        self._audited_paragraph_ids: set[str] = set()

        self.subscribe(
            _TOPIC_PARAGRAPH_PUBLISHED,
            _TOPIC_AUDIT_CONTROL,
            _TOPIC_MODULE_INIT,
            _TOPIC_WORLD_UPDATED,
            _TOPIC_OC_EVOLVED,
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "continuity_auditor",
            "version": "0.1.0",
            "description": (
                "Six-dimensional continuity auditor (OOC / setting / "
                "timeline / foreshadowing / style / rhythm) for novel "
                "paragraphs"
            ),
            "dependencies": [],
            "category": "novel_audit",
        }

    def _initial_state(self) -> ModuleState:
        # NOTE: ``self._novel_id`` is NOT yet set when the parent ``Module``
        # constructor calls this method (it runs before our ``__init__``
        # body assigns ``self._novel_id``). Use a literal default here;
        # ``init()`` and ``from_dict()`` refresh ``state.custom["novel_id"]``
        # afterwards.
        return ModuleState(
            active=True,
            energy_cost=0.18,
            custom={
                "audits_performed": 0,
                "issues_emitted": 0,
                "novel_id": "linyi_default",
            },
        )

    # ------------------------------------------------------------------
    # Lifecycle (Module interface)
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        """Initialize from agent context.

        Expected context keys (all optional except where noted):

        - ``novel_v2``: ``{'novel_id': str, 'audit_state_dir': str}`` —
          overrides the constructor defaults if present.
        - ``story_bible``: ``StoryBible | dict | None`` — preferred way to
          supply truth sources (owns world_contract, character_registry,
          style_fingerprint, foreshadowing_ledger, chapter_blueprint).
        - ``world_contract``: ``WorldStateContract | dict | None`` — direct
          override; takes precedence over the Story Bible value.
        - ``character_registry``: ``dict[str, OCCharacterSheet | dict]`` —
          direct override merged on top of the Story Bible value.
        - ``style_fingerprint``: ``StyleFingerprint | dict | None`` —
          direct override.
        - ``chapter_manager``: ``ChapterManager | None`` — used by
          :meth:`audit_chapter` and for prior-paragraph lookup.
        """
        novel_v2 = context.get("novel_v2", {}) or {}
        if not isinstance(novel_v2, dict):
            novel_v2 = {}
        if novel_v2.get("novel_id"):
            self._novel_id = str(novel_v2["novel_id"])
        if novel_v2.get("audit_state_dir"):
            self._audit_state_dir = str(novel_v2["audit_state_dir"])
        self._state_path = os.path.join(
            self._audit_state_dir, f"{self._novel_id}.json"
        )

        # Story Bible (preferred — owns all truth sources).
        sb = context.get("story_bible")
        if isinstance(sb, StoryBible):
            self._story_bible = sb
        elif isinstance(sb, dict):
            try:
                self._story_bible = StoryBible.from_dict(sb)
            except Exception:
                self._story_bible = None
        else:
            self._story_bible = None

        if self._story_bible is not None:
            self._world_contract = self._story_bible.world_contract
            self._character_registry = dict(
                self._story_bible.character_registry or {}
            )
            self._style_fingerprint = self._story_bible.style_fingerprint
            self._chapter_blueprint = list(
                self._story_bible.chapter_blueprint or []
            )

        # Direct context overrides (useful for tests that don't construct
        # a full Story Bible).
        wc = context.get("world_contract")
        if isinstance(wc, WorldStateContract):
            self._world_contract = wc
        elif isinstance(wc, dict):
            try:
                self._world_contract = WorldStateContract.from_dict(wc)
            except Exception:
                pass

        cr = context.get("character_registry")
        if isinstance(cr, dict):
            merged = dict(self._character_registry)
            for cid, sheet in cr.items():
                if isinstance(sheet, OCCharacterSheet):
                    merged[cid] = sheet
                elif isinstance(sheet, dict):
                    try:
                        merged[cid] = OCCharacterSheet.from_dict(sheet)
                    except Exception:
                        continue
            self._character_registry = merged

        sf = context.get("style_fingerprint")
        if isinstance(sf, StyleFingerprint):
            self._style_fingerprint = sf
        elif isinstance(sf, dict):
            try:
                self._style_fingerprint = StyleFingerprint.from_dict(sf)
            except Exception:
                pass

        self._chapter_manager = context.get("chapter_manager")

        # Load persisted audit state.
        self._load_state()
        self._state.custom["novel_id"] = self._novel_id
        self._state.custom["audits_performed"] = len(self._audit_history)
        self._state.custom["issues_emitted"] = sum(
            len(entry.get("issues", [])) for entry in self._audit_history
        )

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        payload = message.payload
        if topic == _TOPIC_PARAGRAPH_PUBLISHED:
            self._handle_paragraph_published(payload)
        elif topic == _TOPIC_AUDIT_CONTROL:
            self._handle_audit_control(payload)
        elif topic == _TOPIC_MODULE_INIT:
            # Init handshake — already initialized via ``init()``.
            pass
        elif topic == _TOPIC_WORLD_UPDATED:
            self._handle_world_updated(payload)
        elif topic == _TOPIC_OC_EVOLVED:
            self._handle_oc_evolved(payload)

    def tick(self, delta: TickDelta) -> None:
        """Advance auditor bookkeeping (currently stateless per tick)."""
        self._state.last_tick = delta.absolute_time

    # ------------------------------------------------------------------
    # Bus handlers
    # ------------------------------------------------------------------

    def _handle_paragraph_published(self, payload: Any) -> None:
        """Audit a paragraph on ``event.novel.paragraph.published``."""
        if not isinstance(payload, dict):
            return
        paragraph = self._coerce_paragraph(payload.get("paragraph"))
        if paragraph is None:
            return
        chapter_id = str(
            payload.get("chapter_id") or paragraph.chapter_id or ""
        )
        paragraph_index = payload.get("index")
        try:
            paragraph_index = (
                int(paragraph_index) if paragraph_index is not None else None
            )
        except (TypeError, ValueError):
            paragraph_index = None
        chapter_context = self._build_chapter_context(
            chapter_id=chapter_id,
            paragraph_index=paragraph_index,
            payload=payload,
        )
        issues = self.audit_paragraph(paragraph, chapter_context)
        self._publish_issues(
            issues=issues,
            chapter_id=chapter_id,
            paragraph_index=paragraph_index,
        )

    def _handle_audit_control(self, payload: Any) -> None:
        """Explicit ``control.novel.audit`` trigger.

        Payload may specify:

        - ``chapter_id``: audit a specific chapter via ChapterManager.
        - ``paragraph`` + ``chapter_id`` + ``index``: audit a one-off
          paragraph inline.
        - empty: no-op (control handshake).
        """
        if not isinstance(payload, dict):
            return
        chapter_id = payload.get("chapter_id")
        if not (chapter_id and isinstance(chapter_id, str)):
            return
        paragraph_payload = payload.get("paragraph")
        if paragraph_payload is not None:
            paragraph = self._coerce_paragraph(paragraph_payload)
            if paragraph is None:
                return
            paragraph_index = payload.get("index")
            try:
                paragraph_index = (
                    int(paragraph_index) if paragraph_index is not None else None
                )
            except (TypeError, ValueError):
                paragraph_index = None
            chapter_context = self._build_chapter_context(
                chapter_id=chapter_id,
                paragraph_index=paragraph_index,
                payload=payload,
            )
            issues = self.audit_paragraph(paragraph, chapter_context)
            self._publish_issues(
                issues=issues,
                chapter_id=chapter_id,
                paragraph_index=paragraph_index,
            )
            return
        # Otherwise audit the whole chapter.
        issues = self.audit_chapter(chapter_id)
        self._publish_issues(
            issues=issues,
            chapter_id=chapter_id,
            paragraph_index=None,
        )

    def _handle_world_updated(self, payload: Any) -> None:
        """Refresh the cached ``WorldStateContract`` on world updates."""
        if not isinstance(payload, dict):
            return
        wc = payload.get("world_contract") or payload.get("contract")
        if isinstance(wc, WorldStateContract):
            self._world_contract = wc
        elif isinstance(wc, dict):
            try:
                self._world_contract = WorldStateContract.from_dict(wc)
            except Exception:
                pass

    def _handle_oc_evolved(self, payload: Any) -> None:
        """Refresh a single OC sheet on ``data.oc.evolved``.

        The OC system emits this when a character gains improvement marks or
        when world-fit warnings change. We refresh the cached sheet if a
        full sheet is attached to the payload.
        """
        if not isinstance(payload, dict):
            return
        character_id = payload.get("character_id")
        if not character_id or not isinstance(character_id, str):
            return
        sheet = payload.get("sheet")
        if isinstance(sheet, OCCharacterSheet):
            self._character_registry[character_id] = sheet
        elif isinstance(sheet, dict):
            try:
                self._character_registry[character_id] = (
                    OCCharacterSheet.from_dict(sheet)
                )
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Public API: audit_paragraph / audit_chapter
    # ------------------------------------------------------------------

    def audit_paragraph(
        self,
        paragraph: Paragraph,
        chapter_context: dict[str, Any] | None = None,
    ) -> list[ContinuityIssue]:
        """Audit a single paragraph across all six dimensions.

        ``chapter_context`` is a dict with optional keys:

        - ``chapter_id``: str
        - ``chapter_index``: int
        - ``paragraph_index``: int (0-indexed)
        - ``intent``: :class:`ChapterIntent`
        - ``prior_paragraphs``: ``list[Paragraph]`` (preceding paragraphs
          in the same chapter)
        - ``foreshadowing_ops``: ``list[ForeshadowingOp]`` (intent-driven
          ops; if absent, ops are inferred from paragraph content vs the
          Story Bible foreshadowing ledger)

        Returns a list of :class:`ContinuityIssue` instances (may be empty).
        Also updates internal audit state (timeline, foreshadowing,
        character presence) and persists to disk.
        """
        if chapter_context is None:
            chapter_context = {}
        issues: list[ContinuityIssue] = []
        issues.extend(self._audit_ooc(paragraph, chapter_context))
        issues.extend(self._audit_setting_conflict(paragraph, chapter_context))
        issues.extend(self._audit_timeline(paragraph, chapter_context))
        issues.extend(self._audit_foreshadowing(paragraph, chapter_context))
        issues.extend(self._audit_style(paragraph, chapter_context))
        issues.extend(self._audit_rhythm(paragraph, chapter_context))

        # Record audit in history.
        audit_entry = {
            "paragraph_id": paragraph.paragraph_id,
            "chapter_id": chapter_context.get(
                "chapter_id", paragraph.chapter_id or ""
            ),
            "paragraph_index": chapter_context.get("paragraph_index"),
            "audited_at": _now_iso(),
            "issue_count": len(issues),
            "issues": [issue.to_dict() for issue in issues],
        }
        self._audit_history.append(audit_entry)
        if len(self._audit_history) > _MAX_AUDIT_HISTORY:
            self._audit_history = self._audit_history[-_MAX_AUDIT_HISTORY:]
        self._audited_paragraph_ids.add(paragraph.paragraph_id)
        self._state.custom["audits_performed"] = len(self._audit_history)
        self._state.custom["issues_emitted"] = sum(
            len(entry.get("issues", [])) for entry in self._audit_history
        )
        self._save_state()
        return issues

    def audit_chapter(self, chapter_id: str) -> list[ContinuityIssue]:
        """Audit all paragraphs in a chapter, plus chapter-level rhythm audit.

        Looks up the chapter from the attached ChapterManager; if none is
        attached, returns an empty list. The chapter's intent (if any) is
        used for the per-paragraph and chapter-level rhythm audits.
        """
        if self._chapter_manager is None:
            return []
        chapter = self._chapter_manager.get_chapter(chapter_id)
        if chapter is None:
            return []
        intent = chapter.intent
        all_issues: list[ContinuityIssue] = []
        prior_paragraphs: list[Paragraph] = []
        for idx, paragraph in enumerate(chapter.paragraphs):
            chapter_context: dict[str, Any] = {
                "chapter_id": chapter_id,
                "chapter_index": chapter.index,
                "paragraph_index": idx,
                "intent": intent,
                "prior_paragraphs": list(prior_paragraphs),
                "foreshadowing_ops": (
                    list(intent.foreshadowing_ops) if intent else []
                ),
                "narrative_beats": (
                    list(intent.narrative_beats) if intent else []
                ),
                "is_chapter_audit": True,
            }
            issues = self.audit_paragraph(paragraph, chapter_context)
            all_issues.extend(issues)
            prior_paragraphs.append(paragraph)
        # Chapter-level rhythm audit (Hook / climax / chapter-end suspense).
        rhythm_issues = self._audit_chapter_rhythm(chapter, intent)
        all_issues.extend(rhythm_issues)
        return all_issues

    # ------------------------------------------------------------------
    # SubTask 4.1.2: OOC audit
    # ------------------------------------------------------------------

    def _audit_ooc(
        self,
        paragraph: Paragraph,
        context: dict[str, Any],
    ) -> list[ContinuityIssue]:
        """Detect OOC: behavior contradicting ``OCCharacterSheet.traits``.

        Checks:

        - Trait-axis behavior inversion (extraversion / neuroticism /
          conscientiousness / agreeableness) using keyword maps. When a
          character's trait value is on the extreme end (>= 0.7 high or
          <= 0.3 low) and the paragraph shows the *opposite* behavior,
          flag a warning.
        - Behavior contradicting ``fears`` (e.g., a claustrophobic
          character entering tight spaces fearlessly).
        - Behavior contradicting ``immutable_facts`` (e.g., a blind
          character reading).
        """
        issues: list[ContinuityIssue] = []
        if not self._character_registry:
            return issues
        content = paragraph.content or ""
        if not content:
            return issues
        involved = self._find_involved_characters(content)
        if not involved:
            return issues
        for character_id, sheet in involved:
            name = sheet.name or character_id
            # 1. Trait-axis behavior inversion.
            for axis, (high_kw, low_kw) in _TRAIT_BEHAVIOR_MAP.items():
                trait_value = float(getattr(sheet.traits, axis, 0.5))
                if trait_value >= 0.7:
                    hit = _contains_any(content, low_kw)
                    if hit:
                        issues.append(ContinuityIssue(
                            category="ooc",
                            severity="warning",
                            evidence=(
                                f"角色 '{name}' traits.{axis}="
                                f"{trait_value:.2f}（高），但段落出现"
                                f"低分值行为关键词 '{hit}'："
                                f"'{self._excerpt(content, hit)}'"
                            ),
                            suggested_fix=(
                                f"调整段落或角色卡：让 {name} 的行为符合 "
                                f"{axis} 高分值倾向，或显式写出行为偏离"
                                f"的内在动机"
                            ),
                            paragraph_id=paragraph.paragraph_id,
                        ))
                elif trait_value <= 0.3:
                    hit = _contains_any(content, high_kw)
                    if hit:
                        issues.append(ContinuityIssue(
                            category="ooc",
                            severity="warning",
                            evidence=(
                                f"角色 '{name}' traits.{axis}="
                                f"{trait_value:.2f}（低），但段落出现"
                                f"高分值行为关键词 '{hit}'："
                                f"'{self._excerpt(content, hit)}'"
                            ),
                            suggested_fix=(
                                f"调整段落或角色卡：让 {name} 的行为符合 "
                                f"{axis} 低分值倾向，或显式写出行为偏离"
                                f"的内在动机"
                            ),
                            paragraph_id=paragraph.paragraph_id,
                        ))
            # 2. Fear contradiction.
            for fear in sheet.fears:
                if not fear.object:
                    continue
                if fear.object in content and fear.intensity >= 0.6:
                    fearless_kw = (
                        "毫不犹豫", "毫不畏惧", "勇敢", "坦然面对",
                        "毫无惧色", "泰然", "镇定自若",
                    )
                    fearless_hit = _contains_any(content, fearless_kw)
                    if fearless_hit:
                        issues.append(ContinuityIssue(
                            category="ooc",
                            severity="warning",
                            evidence=(
                                f"角色 '{name}' 害怕 '{fear.object}'"
                                f"（intensity={fear.intensity:.2f}），"
                                f"但段落出现无惧行为 '{fearless_hit}'"
                            ),
                            suggested_fix=(
                                f"让 {name} 面对 {fear.object} 时表现出符合"
                                f"恐惧的犹豫 / 回避 / 内心波动，或显式写出"
                                f"克服恐惧的代价"
                            ),
                            paragraph_id=paragraph.paragraph_id,
                        ))
            # 3. immutable_facts contradiction.
            for fact in sheet.immutable_facts:
                if not fact:
                    continue
                violation = self._immutable_fact_violated(content, fact)
                if violation:
                    issues.append(ContinuityIssue(
                        category="ooc",
                        severity="critical",
                        evidence=(
                            f"角色 '{name}' 的 immutable_fact '{fact}' "
                            f"与段落内容矛盾：{violation}"
                        ),
                        suggested_fix=(
                            f"修正段落以符合 immutable_fact：{fact}，"
                            f"或通过显式剧情手段（如幻觉 / 视角欺骗）"
                            f"解释偏差"
                        ),
                        paragraph_id=paragraph.paragraph_id,
                    ))
        return issues

    def _immutable_fact_violated(self, content: str, fact: str) -> str | None:
        """Heuristic: does ``content`` contradict an immutable fact?

        Recognises a few common patterns:

        - "失明" / "盲" → paragraph should not show reading / 看着.
        - "失聪" / "聋" → paragraph should not show 听见 / 听到.
        - "瘫痪" / "截瘫" → paragraph should not show 走 / 跑 / 跳.
        - "已死" / "已故" → too unreliable without character context; skip.

        Returns a short violation hint string, or ``None``. We err on the
        side of not flagging — false positives are worse than false
        negatives for a smoke-tier auditor.
        """
        if not fact or not content:
            return None
        if any(kw in fact for kw in ("失明", "盲", "看不见")):
            sight_verbs = (
                "看着", "看见", "看到", "读到", "阅读", "凝视",
                "瞥见", "望见", "注视",
            )
            hit = _contains_any(content, sight_verbs)
            if hit:
                return f"出现视觉行为 '{hit}'，但角色失明"
        if any(kw in fact for kw in ("失聪", "聋", "听不见")):
            hearing_verbs = (
                "听见", "听到", "聆听", "倾听", "闻声",
            )
            hit = _contains_any(content, hearing_verbs)
            if hit:
                return f"出现听觉行为 '{hit}'，但角色失聪"
        if any(kw in fact for kw in ("瘫痪", "截瘫", "无法行走", "残疾")):
            motion_verbs = (
                "走着", "跑着", "跳", "迈步", "站立", "跨步",
                "起身", "走来",
            )
            hit = _contains_any(content, motion_verbs)
            if hit:
                return f"出现行走行为 '{hit}'，但角色瘫痪"
        return None

    def _find_involved_characters(
        self, content: str
    ) -> list[tuple[str, OCCharacterSheet]]:
        """Return ``[(character_id, sheet), ...]`` for characters in content."""
        result: list[tuple[str, OCCharacterSheet]] = []
        for cid, sheet in self._character_registry.items():
            name = sheet.name or ""
            if name and name in content:
                result.append((cid, sheet))
                continue
            if cid and cid in content:
                result.append((cid, sheet))
        return result

    # ------------------------------------------------------------------
    # SubTask 4.1.3: Setting conflict audit
    # ------------------------------------------------------------------

    def _audit_setting_conflict(
        self,
        paragraph: Paragraph,
        context: dict[str, Any],
    ) -> list[ContinuityIssue]:
        """Detect violations of ``WorldStateContract.rules`` / ``forbidden``.

        Checks:

        - Each ``forbidden`` entry: if the paragraph mentions a forbidden
          keyword, flag a critical issue.
        - Each ``WorldRule`` with ``breakable=False`` and ``status='active'``:
          keyword overlap with the rule statement; if the paragraph appears
          to violate the rule, flag a warning.
        - Anachronism: modern-item tokens in 古代 settings.
        """
        issues: list[ContinuityIssue] = []
        wc = self._world_contract
        if wc is None:
            return issues
        content = paragraph.content or ""
        if not content:
            return issues

        # 1. Forbidden taboos.
        for forbidden in wc.forbidden:
            keywords = (
                self._extract_keywords(forbidden.name)
                + self._extract_keywords(forbidden.description)
            )
            if not keywords:
                continue
            hit = _contains_any(content, tuple(keywords))
            if hit:
                consequences = (
                    "、".join(forbidden.consequences) or "未指定"
                )
                issues.append(ContinuityIssue(
                    category="setting_conflict",
                    severity="critical",
                    evidence=(
                        f"段落触及禁忌 '{forbidden.name or forbidden.forbidden_id}'"
                        f"（关键词 '{hit}'），后果：{consequences}"
                    ),
                    suggested_fix=(
                        f"删除或替换触及禁忌的内容；若剧情需要违反，"
                        f"请显式安排后果（{consequences}）"
                    ),
                    paragraph_id=paragraph.paragraph_id,
                ))

        # 2. Stable rules (breakable=False, status='active').
        for rule in wc.rules:
            if rule.breakable or rule.status != "active":
                continue
            violation = self._rule_violation_hint(content, rule)
            if violation:
                consequences = (
                    "、".join(rule.consequences) or "未指定"
                )
                issues.append(ContinuityIssue(
                    category="setting_conflict",
                    severity="warning",
                    evidence=(
                        f"段落可能违反世界规则 '{rule.rule_id}'"
                        f"（{rule.statement}）：{violation}"
                    ),
                    suggested_fix=(
                        f"调整段落以符合规则；若需要违反，请显式标注"
                        f"规则状态演化并触发后果（{consequences}）"
                    ),
                    paragraph_id=paragraph.paragraph_id,
                ))

        # 3. Anachronism: modern items in 古代 settings.
        genre = (wc.genre or "").lower()
        if any(token in genre for token in _ANCIENT_GENRE_TOKENS):
            modern_hit = _contains_any(content, _MODERN_ITEM_TOKENS)
            if modern_hit:
                issues.append(ContinuityIssue(
                    category="setting_conflict",
                    severity="warning",
                    evidence=(
                        f"古代/历史题材 (genre={wc.genre}) 段落出现"
                        f"现代物品 '{modern_hit}'"
                    ),
                    suggested_fix=(
                        f"删除 '{modern_hit}' 或替换为符合古代背景的"
                        f"对应物"
                    ),
                    paragraph_id=paragraph.paragraph_id,
                ))

        return issues

    def _rule_violation_hint(self, content: str, rule: Any) -> str | None:
        """Heuristic: does ``content`` likely violate ``rule``?

        Recognises a few common rule patterns:

        - Rule mentions "时间不可逆" / "因果律" → paragraph should not
          contain time-reversal tokens.
        - Rule mentions "物理" / "重力" → paragraph should not contain
          gravity / levitation violations.
        - Rule mentions "镜子" / "禁忌" → paragraph should not contain
          mirror-gazing tokens.

        Returns a short violation hint string, or ``None``.
        """
        statement = (rule.statement or "")
        if not statement:
            return None
        if any(kw in statement for kw in ("时间不可逆", "因果律", "时间线")):
            time_violation = _contains_any(content, (
                "回到过去", "逆转时间", "穿越时空", "时间倒流",
                "改写过去", "时光倒流",
            ))
            if time_violation:
                return f"出现时间逆行关键词 '{time_violation}'"
        if any(kw in statement for kw in ("物理", "重力", "引力")):
            physics_violation = _contains_any(content, (
                "悬浮", "飘浮", "飞翔", "无视重力", "腾空", "飞起",
                "飘在空中",
            ))
            if physics_violation:
                return f"出现物理违规关键词 '{physics_violation}'"
        if any(kw in statement for kw in ("镜子", "禁忌", "不可直视")):
            mirror_violation = _contains_any(content, (
                "照镜子", "看着镜中", "凝视镜子", "镜中的自己",
                "望向镜子", "端详镜子",
            ))
            if mirror_violation:
                return f"出现镜子禁忌关键词 '{mirror_violation}'"
        return None

    # ------------------------------------------------------------------
    # SubTask 4.1.4: Timeline audit
    # ------------------------------------------------------------------

    def _audit_timeline(
        self,
        paragraph: Paragraph,
        context: dict[str, Any],
    ) -> list[ContinuityIssue]:
        """Detect event ordering contradictions.

        Maintains per-paragraph timeline of time-reference tokens
        (昨天 / 今天 / 明天 / 后天 / 之前 / 之后) and flags contradictions:

        - A "明天" reference in a prior paragraph followed by a "昨天"
          reference to the same event in the current paragraph.
        - A character leaving and then appearing without a "return" token.
        """
        issues: list[ContinuityIssue] = []
        content = paragraph.content or ""
        if not content:
            return issues
        chapter_id = context.get(
            "chapter_id", paragraph.chapter_id or ""
        )
        paragraph_index = context.get("paragraph_index")

        # 1. Time-reference contradictions vs prior paragraphs.
        past_hit = _contains_any(content, _TIME_TOKENS_PAST)
        future_hit = _contains_any(content, _TIME_TOKENS_FUTURE)
        prior_paragraphs = context.get("prior_paragraphs", []) or []
        if prior_paragraphs and past_hit:
            # Look at the most recent prior paragraphs (last 3).
            prior_content = " ".join(
                (p.content or "") for p in prior_paragraphs[-3:]
            )
            prior_future = _contains_any(prior_content, _TIME_TOKENS_FUTURE)
            if prior_future:
                issues.append(ContinuityIssue(
                    category="timeline",
                    severity="warning",
                    evidence=(
                        f"前段以 '{prior_future}' 指向未来事件，但本段"
                        f"以 '{past_hit}' 回溯为过去，存在时间线矛盾"
                    ),
                    suggested_fix=(
                        f"统一时间指向：将本段的 '{past_hit}' 改为"
                        f"'此时' / '今天'，或将前段的 '{prior_future}' "
                        f"改为已经发生的过去事件"
                    ),
                    paragraph_id=paragraph.paragraph_id,
                ))

        # 2. Record this paragraph's time references for future audits.
        time_refs: list[str] = []
        if past_hit:
            time_refs.append(past_hit)
        if future_hit:
            time_refs.append(future_hit)
        present_hit = _contains_any(content, _TIME_TOKENS_PRESENT)
        if present_hit:
            time_refs.append(present_hit)
        self._timeline_events.append({
            "chapter_id": chapter_id,
            "paragraph_id": paragraph.paragraph_id,
            "paragraph_index": paragraph_index,
            "time_refs": time_refs,
            "recorded_at": _now_iso(),
        })
        if len(self._timeline_events) > _MAX_TIMELINE_EVENTS:
            self._timeline_events = self._timeline_events[-_MAX_TIMELINE_EVENTS:]

        # 3. Character presence: leaving then appearing without returning.
        involved = self._find_involved_characters(content)
        for character_id, sheet in involved:
            name = sheet.name or character_id
            presence = self._character_presence.get(character_id)
            if presence is None:
                self._character_presence[character_id] = {
                    "last_chapter_id": chapter_id,
                    "last_paragraph_id": paragraph.paragraph_id,
                    "last_paragraph_index": paragraph_index,
                    "status": "present",
                }
                continue
            # If character was marked as 'left' in a prior paragraph and
            # now appears again without a return token, flag it.
            if presence.get("status") == "left":
                if not _contains_any(content, _RETURN_TOKENS):
                    issues.append(ContinuityIssue(
                        category="timeline",
                        severity="warning",
                        evidence=(
                            f"角色 '{name}' 在前段已离开"
                            f"（chapter={presence.get('last_chapter_id')}, "
                            f"para={presence.get('last_paragraph_index')}），"
                            f"但本段未出现返回标记即重新在场"
                        ),
                        suggested_fix=(
                            f"在段落中显式写出 '{name}' 的返回"
                            f"（如 '回来' / '重新出现'），或修正前段的"
                            f"离开描写"
                        ),
                        paragraph_id=paragraph.paragraph_id,
                    ))
            # Update presence state.
            presence["last_chapter_id"] = chapter_id
            presence["last_paragraph_id"] = paragraph.paragraph_id
            presence["last_paragraph_index"] = paragraph_index
            leave_hit = _contains_any(content, _LEAVE_TOKENS)
            return_hit = _contains_any(content, _RETURN_TOKENS)
            if leave_hit:
                presence["status"] = "left"
            else:
                presence["status"] = "present"

        return issues

    # ------------------------------------------------------------------
    # SubTask 4.1.5: Foreshadowing audit
    # ------------------------------------------------------------------

    def _audit_foreshadowing(
        self,
        paragraph: Paragraph,
        context: dict[str, Any],
    ) -> list[ContinuityIssue]:
        """Detect foreshadowing issues.

        Maintains per-entry state: ``introduced_chapter``,
        ``last_reinforced_chapter``, ``paid_off_chapter``, ``status``.

        Detection rules:

        - ``introduce`` + ``pay_off`` in the same chapter (or payoff
          chapter_index <= introduce chapter_index) → "提前兑现" warning.
        - Introduced > ``_FORESHADOW_STALENESS_CHAPTERS`` chapters ago
          without reinforce / payoff → "回收计划缺失" warning.
        - ``pay_off`` without prior ``introduce`` → "回收未引入" warning.
        - ``reinforce`` without prior ``introduce`` → "强化未引入" warning.
        - Duplicate ``introduce`` on an already-introduced entry → info.
        """
        issues: list[ContinuityIssue] = []
        content = paragraph.content or ""
        chapter_id = context.get(
            "chapter_id", paragraph.chapter_id or ""
        )
        chapter_index = context.get("chapter_index")

        # Resolve foreshadowing ops: explicit context-driven ops take
        # precedence; otherwise fall back to intent.foreshadowing_ops;
        # finally infer from paragraph content vs the Story Bible
        # foreshadowing ledger.
        ops: list[ForeshadowingOp] = list(context.get("foreshadowing_ops") or [])
        if not ops:
            intent = context.get("intent")
            if intent is not None:
                ops = list(getattr(intent, "foreshadowing_ops", []) or [])
        if not ops and self._story_bible is not None:
            ledger = list(self._story_bible.foreshadowing_ledger or [])
            ops = self._infer_foreshadowing_ops(content, ledger)

        for op in ops:
            if not isinstance(op, ForeshadowingOp):
                continue
            entry_id = op.entry_id
            if not entry_id:
                continue
            state = self._foreshadowing_state.setdefault(entry_id, {
                "status": "introduced",
                "introduced_chapter": chapter_id,
                "introduced_chapter_index": chapter_index,
                "last_reinforced_chapter": None,
                "last_reinforced_chapter_index": None,
                "paid_off_chapter": None,
                "paid_off_chapter_index": None,
                "description": op.note or "",
            })
            if op.op_type == "introduce":
                if state.get("status") in ("introduced", "reinforced", "paid_off"):
                    issues.append(ContinuityIssue(
                        category="foreshadowing",
                        severity="info",
                        evidence=(
                            f"伏笔 '{entry_id}' 已在 chapter="
                            f"{state.get('introduced_chapter')} 引入，"
                            f"本段重复引入"
                        ),
                        suggested_fix=(
                            f"删除重复引入，或将其改为 reinforce 操作"
                        ),
                        paragraph_id=paragraph.paragraph_id,
                    ))
                else:
                    state["status"] = "introduced"
                    state["introduced_chapter"] = chapter_id
                    state["introduced_chapter_index"] = chapter_index
                    state["description"] = op.note or state.get("description", "")
            elif op.op_type == "reinforce":
                if state.get("status") not in ("introduced", "reinforced"):
                    issues.append(ContinuityIssue(
                        category="foreshadowing",
                        severity="warning",
                        evidence=(
                            f"伏笔 '{entry_id}' 在未被引入前被强化"
                            f"（current status={state.get('status')}）"
                        ),
                        suggested_fix=(
                            f"先显式引入伏笔 '{entry_id}'，再进行强化"
                        ),
                        paragraph_id=paragraph.paragraph_id,
                    ))
                else:
                    state["status"] = "reinforced"
                    state["last_reinforced_chapter"] = chapter_id
                    state["last_reinforced_chapter_index"] = chapter_index
            elif op.op_type == "pay_off":
                if state.get("status") == "introduced" and chapter_index is not None:
                    introduced_idx = state.get("introduced_chapter_index")
                    if (
                        isinstance(introduced_idx, int)
                        and isinstance(chapter_index, int)
                        and chapter_index <= introduced_idx
                    ):
                        issues.append(ContinuityIssue(
                            category="foreshadowing",
                            severity="warning",
                            evidence=(
                                f"伏笔 '{entry_id}' 在 chapter_index="
                                f"{introduced_idx} 引入，本段 "
                                f"(chapter_index={chapter_index}) 立即兑现，"
                                f"属于提前兑现"
                            ),
                            suggested_fix=(
                                f"将 '{entry_id}' 的兑现推迟到至少 "
                                f"{introduced_idx + 2} 章之后，或在中间"
                                f"安排一次 reinforce"
                            ),
                            paragraph_id=paragraph.paragraph_id,
                        ))
                if state.get("status") == "paid_off":
                    issues.append(ContinuityIssue(
                        category="foreshadowing",
                        severity="info",
                        evidence=(
                            f"伏笔 '{entry_id}' 已在 chapter="
                            f"{state.get('paid_off_chapter')} 兑现，"
                            f"本段重复兑现"
                        ),
                        suggested_fix=(
                            f"删除重复兑现，或将其改写为新的伏笔引入"
                        ),
                        paragraph_id=paragraph.paragraph_id,
                    ))
                else:
                    state["status"] = "paid_off"
                    state["paid_off_chapter"] = chapter_id
                    state["paid_off_chapter_index"] = chapter_index
            elif op.op_type == "abandon":
                if state.get("status") in ("introduced", "reinforced"):
                    state["status"] = "abandoned"
                # Abandoning an already-paid-off or never-introduced entry
                # is suspicious but not flagged here — the planner may have
                # reason to retract.

        # Staleness check: introduced > N chapters ago without reinforce
        # or payoff → flag missing payoff plan.
        if (
            chapter_index is not None
            and self._story_bible is not None
        ):
            for entry_id, state in self._foreshadowing_state.items():
                if state.get("status") != "introduced":
                    continue
                introduced_idx = state.get("introduced_chapter_index")
                if not isinstance(introduced_idx, int):
                    continue
                if chapter_index - introduced_idx >= _FORESHADOW_STALENESS_CHAPTERS:
                    issues.append(ContinuityIssue(
                        category="foreshadowing",
                        severity="warning",
                        evidence=(
                            f"伏笔 '{entry_id}' 在 chapter_index="
                            f"{introduced_idx} 引入，已过 "
                            f"{chapter_index - introduced_idx} 章未强化或兑现"
                        ),
                        suggested_fix=(
                            f"在本章安排 reinforce 或 pay_off，或在 "
                            f"chapter_blueprint 中显式标注回收计划"
                        ),
                        paragraph_id=paragraph.paragraph_id,
                    ))
        return issues

    # ------------------------------------------------------------------
    # SubTask 4.1.6: Style audit
    # ------------------------------------------------------------------

    def _audit_style(
        self,
        paragraph: Paragraph,
        context: dict[str, Any],
    ) -> list[ContinuityIssue]:
        """Detect style deviations from ``StyleFingerprint`` + forbidden phrases.

        Computes paragraph-level metrics and compares against the
        fingerprint baseline. Flags:

        - ``vocabulary_density`` / ``sentence_length_variance`` /
          ``dialogue_ratio`` deviation beyond ``_STYLE_DEVIATION_THRESHOLDS``.
        - Forbidden phrases from fingerprint + ``_DEFAULT_FORBIDDEN_PHRASES``.
        - Tone-marker inversion: a tone marker whose fingerprint value is
          high (>=0.6) but is essentially absent from the paragraph, or
          vice versa.
        """
        issues: list[ContinuityIssue] = []
        content = paragraph.content or ""
        if not content:
            return issues
        metrics = self._compute_style_metrics(content)
        fingerprint = self._style_fingerprint
        if fingerprint is not None:
            for metric_name, threshold in _STYLE_DEVIATION_THRESHOLDS.items():
                baseline = float(getattr(fingerprint, metric_name, 0.0))
                actual = float(metrics.get(metric_name, 0.0))
                if abs(actual - baseline) > threshold:
                    issues.append(ContinuityIssue(
                        category="style",
                        severity="info",
                        evidence=(
                            f"风格指标 '{metric_name}' 偏离基准："
                            f"fingerprint={baseline:.3f}，段落={actual:.3f}，"
                            f"差值={abs(actual - baseline):.3f}（阈值={threshold}）"
                        ),
                        suggested_fix=(
                            f"调整段落措辞使 {metric_name} 接近基准 "
                            f"{baseline:.3f}，或在 ChapterIntent 中显式标注"
                            f"本段为有意偏离"
                        ),
                        paragraph_id=paragraph.paragraph_id,
                    ))
        # Forbidden phrases.
        forbidden_set: set[str] = set(_DEFAULT_FORBIDDEN_PHRASES)
        if fingerprint is not None:
            forbidden_set.update(fingerprint.forbidden_phrases or [])
        for phrase in forbidden_set:
            if not phrase:
                continue
            if phrase in content:
                issues.append(ContinuityIssue(
                    category="style",
                    severity="warning",
                    evidence=(
                        f"段落包含禁用短语 '{phrase}'"
                    ),
                    suggested_fix=(
                        f"删除或替换 '{phrase}'，参考 DE_AI_RULES 与"
                        f"StyleFingerprint.forbidden_phrases"
                    ),
                    paragraph_id=paragraph.paragraph_id,
                ))
        # Tone-marker inversion.
        if fingerprint is not None and fingerprint.tone_markers:
            for marker, baseline in fingerprint.tone_markers.items():
                if not marker:
                    continue
                present = marker in content
                if baseline >= 0.6 and not present:
                    issues.append(ContinuityIssue(
                        category="style",
                        severity="info",
                        evidence=(
                            f"tone_marker '{marker}' 在 fingerprint 中"
                            f"权重 {baseline:.2f}（高），但段落未出现"
                        ),
                        suggested_fix=(
                            f"在段落中织入 '{marker}' 的语义色彩，或"
                            f"在 intent 中显式标注本段为反向 tone"
                        ),
                        paragraph_id=paragraph.paragraph_id,
                    ))
        return issues

    def _compute_style_metrics(self, content: str) -> dict[str, float]:
        """Compute paragraph-level style metrics.

        - ``vocabulary_density``: unique-character ratio (rough proxy for
          lexical diversity on Chinese text).
        - ``sentence_length_variance``: variance of sentence lengths (split
          on 。!?！？).
        - ``dialogue_ratio``: fraction of content inside CJK quotation
          marks “” / 『』 / 「」.
        """
        if not content:
            return {
                "vocabulary_density": 0.0,
                "sentence_length_variance": 0.0,
                "dialogue_ratio": 0.0,
            }
        # Vocabulary density: unique CJK chars / total CJK chars.
        cjk_chars = [
            ch for ch in content
            if "\u4e00" <= ch <= "\u9fff"
        ]
        if cjk_chars:
            vocabulary_density = len(set(cjk_chars)) / len(cjk_chars)
        else:
            vocabulary_density = 0.0
        # Sentence length variance.
        sentences = [
            s for s in re.split(r"[。!?！？\n]+", content) if s.strip()
        ]
        if len(sentences) >= 2:
            lengths = [len(s) for s in sentences]
            mean = sum(lengths) / len(lengths)
            variance = sum(
                (length - mean) ** 2 for length in lengths
            ) / len(lengths)
            sentence_length_variance = float(variance) / max(mean, 1.0)
        else:
            sentence_length_variance = 0.0
        # Dialogue ratio: characters inside quotation marks.
        dialogue_chars = 0
        total_chars = len(content)
        in_quote = False
        for ch in content:
            if ch in ("“", "『", "「"):
                in_quote = True
            elif ch in ("”", "』", "」"):
                in_quote = False
            elif in_quote:
                dialogue_chars += 1
        dialogue_ratio = (
            dialogue_chars / total_chars if total_chars else 0.0
        )
        return {
            "vocabulary_density": vocabulary_density,
            "sentence_length_variance": sentence_length_variance,
            "dialogue_ratio": dialogue_ratio,
        }

    # ------------------------------------------------------------------
    # SubTask 4.1.7: Rhythm audit (per-paragraph + chapter-level)
    #
    # NOTE: ``ContinuityIssue.category`` only allows the literal set
    # ``{"ooc", "setting_conflict", "timeline", "foreshadowing", "tone",
    # "style"}`` per ``models.py``. There is no ``"rhythm"`` literal, so
    # rhythm-related issues are emitted with ``category="tone"`` — the
    # closest valid literal — and the evidence string carries a
    # ``[rhythm]`` prefix to disambiguate at the consumer side.
    # ------------------------------------------------------------------

    def _audit_rhythm(
        self,
        paragraph: Paragraph,
        context: dict[str, Any],
    ) -> list[ContinuityIssue]:
        """Per-paragraph rhythm audit.

        Checks:

        - Hook cues (question marks / exclamations / 突然/忽然/意外) on the
          first paragraph of a chapter — expected, missing → info.
        - Climax cues on non-climax paragraphs (only flagged when
          ``intent.rhythm.cool_point_density`` is low).
        - Rest-ratio overload: if ``intent.rhythm.rest_ratio`` is high
          (>=0.4) but the paragraph shows no cool-down language, flag info.
        """
        issues: list[ContinuityIssue] = []
        content = paragraph.content or ""
        if not content:
            return issues
        intent: ChapterIntent | None = context.get("intent")
        paragraph_index = context.get("paragraph_index")
        rhythm = intent.rhythm if intent is not None else None
        # Hook check (only meaningful on first paragraph of a chapter).
        if paragraph_index == 0:
            hook_hit = _contains_any(content, _HOOK_CUES)
            hook_strength = (
                float(rhythm.hook_strength) if rhythm is not None else 0.0
            )
            if hook_strength >= _HOOK_STRENGTH_THRESHOLD and not hook_hit:
                issues.append(ContinuityIssue(
                    category="tone",
                    severity="info",
                    evidence=(
                        f"[rhythm] 章首段缺少 Hook 线索（hook_strength="
                        f"{hook_strength:.2f}，阈值="
                        f"{_HOOK_STRENGTH_THRESHOLD}）"
                    ),
                    suggested_fix=(
                        "在章首段加入问号 / 感叹号 / '突然' / '意外' 等"
                        "Hook 线索，或降低 intent.rhythm.hook_strength"
                    ),
                    paragraph_id=paragraph.paragraph_id,
                ))
        # Climax cue overload when cool_point_density is low.
        if rhythm is not None:
            cool_density = float(rhythm.cool_point_density)
            climax_hit = _contains_any(content, _CLIMAX_CUES)
            if (
                climax_hit
                and cool_density < _COOL_POINT_DENSITY_THRESHOLD
                and paragraph_index not in (0, None)
            ):
                issues.append(ContinuityIssue(
                    category="tone",
                    severity="info",
                    evidence=(
                        f"[rhythm] 段落出现高潮线索 '{climax_hit}'，但"
                        f"intent.rhythm.cool_point_density={cool_density:.2f}"
                        f"（< 阈值 {_COOL_POINT_DENSITY_THRESHOLD}），"
                        f"可能导致节奏过载"
                    ),
                    suggested_fix=(
                        "在高潮段落前后插入 rest / 微爽点段落以缓冲节奏，"
                        "或显式提高 intent.rhythm.cool_point_density"
                    ),
                    paragraph_id=paragraph.paragraph_id,
                ))
        # Rest-ratio expectation: when rest_ratio is high, expect rest
        # language; absence → info. We approximate "rest language" by
        # the absence of climax / hook cues.
        if rhythm is not None and rhythm.rest_ratio >= 0.4:
            climax_hit = _contains_any(content, _CLIMAX_CUES)
            hook_hit = _contains_any(content, _HOOK_CUES)
            if climax_hit or hook_hit:
                issues.append(ContinuityIssue(
                    category="tone",
                    severity="info",
                    evidence=(
                        f"[rhythm] intent.rhythm.rest_ratio="
                        f"{rhythm.rest_ratio:.2f}（高），但段落出现"
                        f"高强度线索（climax={climax_hit}, hook={hook_hit}），"
                        f"与节奏定位不符"
                    ),
                    suggested_fix=(
                        "将该段改写为过渡 / 缓冲内容，或在 intent 中"
                        "降低 rest_ratio"
                    ),
                    paragraph_id=paragraph.paragraph_id,
                ))
        return issues

    def _audit_chapter_rhythm(
        self,
        chapter: Any,
        intent: ChapterIntent | None,
    ) -> list[ContinuityIssue]:
        """Chapter-level rhythm audit: Hook / climax / chapter-end suspense.

        Operates on the full paragraph list of a chapter:

        - Hook: first paragraph should contain a hook cue when
          ``intent.rhythm.hook_strength >= _HOOK_STRENGTH_THRESHOLD``.
        - Climax: at least one paragraph should contain a climax cue when
          ``intent.rhythm.cool_point_density >= threshold``.
        - Chapter-end suspense: last paragraph should contain a suspense
          cue when ``intent.rhythm.rest_ratio`` is low.
        """
        issues: list[ContinuityIssue] = []
        paragraphs: list[Paragraph] = list(getattr(chapter, "paragraphs", []) or [])
        if not paragraphs:
            return issues
        chapter_id = getattr(chapter, "chapter_id", "") or ""
        rhythm = intent.rhythm if intent is not None else None
        # Synthesize a stable paragraph_id for chapter-level issues.
        chapter_pid = f"chapter:{chapter_id}" if chapter_id else None

        # 1. Hook on the first paragraph.
        first = paragraphs[0]
        first_content = first.content or ""
        hook_strength = (
            float(rhythm.hook_strength) if rhythm is not None else 0.0
        )
        if (
            hook_strength >= _HOOK_STRENGTH_THRESHOLD
            and not _contains_any(first_content, _HOOK_CUES)
        ):
            issues.append(ContinuityIssue(
                category="tone",
                severity="warning",
                evidence=(
                    f"[rhythm] 章节首段缺少 Hook（hook_strength="
                    f"{hook_strength:.2f}）：'{self._excerpt(first_content, '')}'"
                ),
                suggested_fix=(
                    "在章首段加入问号 / 感叹号 / '突然' / '意外' 等 Hook 线索"
                ),
                paragraph_id=first.paragraph_id,
            ))

        # 2. Climax somewhere in the chapter (skip if cool_point_density
        # is too low — climax would overload the chapter).
        climax_threshold = _COOL_POINT_DENSITY_THRESHOLD
        cool_density = (
            float(rhythm.cool_point_density) if rhythm is not None else 0.0
        )
        if cool_density >= climax_threshold:
            has_climax = any(
                _contains_any(p.content or "", _CLIMAX_CUES)
                for p in paragraphs
            )
            if not has_climax:
                issues.append(ContinuityIssue(
                    category="tone",
                    severity="info",
                    evidence=(
                        f"[rhythm] 章节缺少高潮段落（cool_point_density="
                        f"{cool_density:.2f}，期望至少一处 climax 线索）"
                    ),
                    suggested_fix=(
                        "在章节中段插入一处高潮 / 对决 / 转折，"
                        "或在 intent 中降低 cool_point_density"
                    ),
                    paragraph_id=chapter_pid,
                ))

        # 3. Chapter-end suspense: when rest_ratio is low (action-heavy),
        # the last paragraph should carry a suspense cue.
        rest_ratio = (
            float(rhythm.rest_ratio) if rhythm is not None else 0.0
        )
        last = paragraphs[-1]
        last_content = last.content or ""
        if rest_ratio <= _CHAPTER_END_SUSPENSE_REST_RATIO:
            if not _contains_any(last_content, _SUSPENSE_CUES):
                issues.append(ContinuityIssue(
                    category="tone",
                    severity="info",
                    evidence=(
                        f"[rhythm] 章末段缺少悬念线索（rest_ratio="
                        f"{rest_ratio:.2f}，期望章末 Hook / 悬念）："
                        f"'{self._excerpt(last_content, '')}'"
                    ),
                    suggested_fix=(
                        "在章末段加入 '然而' / '究竟' / '……' 等悬念线索，"
                        "或在 intent 中提高 rest_ratio"
                    ),
                    paragraph_id=last.paragraph_id,
                ))
        return issues

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _infer_foreshadowing_ops(
        self,
        content: str,
        ledger: list[ForeshadowingEntry],
    ) -> list[ForeshadowingOp]:
        """Infer foreshadowing ops from paragraph content vs ledger.

        For each ledger entry whose description / entry_id appears in the
        paragraph content, emit a ``reinforce`` op (or ``pay_off`` if the
        content contains payoff cues like '兑现' / '揭晓' / '解开' / '真相').
        This is a keyword heuristic — the planner's explicit ops take
        precedence when available.
        """
        if not content or not ledger:
            return []
        payoff_cues = ("兑现", "揭晓", "解开", "真相", "应验", "成真", "落地")
        ops: list[ForeshadowingOp] = []
        for entry in ledger:
            entry_id = entry.entry_id or ""
            if not entry_id:
                continue
            cue = entry_id
            if entry.description:
                # Use the longest description token as the cue.
                tokens = [
                    t for t in re.split(r"[，。、\s]+", entry.description)
                    if len(t) >= 2
                ]
                if tokens:
                    cue = max(tokens, key=len) or entry_id
            if cue and cue in content:
                op_type: str = "reinforce"
                if _contains_any(content, payoff_cues):
                    op_type = "pay_off"
                ops.append(ForeshadowingOp(
                    op_type=op_type,  # type: ignore[arg-type]
                    entry_id=entry_id,
                    note=f"inferred from content (cue='{cue}')",
                ))
        return ops

    def _coerce_paragraph(self, raw: Any) -> Paragraph | None:
        """Coerce a bus payload value into a :class:`Paragraph`.

        Accepts:

        - ``Paragraph`` (returned as-is).
        - ``dict`` — passed through ``Paragraph.from_dict``; missing
          ``content`` falls back to ``paragraph`` / ``text`` keys.
        - ``str`` — wrapped in a ``Paragraph`` with default id.
        - anything else → ``None``.
        """
        if raw is None:
            return None
        if isinstance(raw, Paragraph):
            return raw
        if isinstance(raw, str):
            return Paragraph(content=raw)
        if isinstance(raw, dict):
            data = dict(raw)
            if "content" not in data:
                data["content"] = data.get("paragraph") or data.get("text") or ""
            try:
                return Paragraph.from_dict(data)
            except Exception:
                return None
        return None

    def _build_chapter_context(
        self,
        *,
        chapter_id: str,
        paragraph_index: int | None,
        payload: Any,
    ) -> dict[str, Any]:
        """Build the ``chapter_context`` dict for an audit call.

        Pulls prior paragraphs from the attached ChapterManager when
        available, and resolves the chapter's intent for rhythm /
        foreshadowing audits.
        """
        context: dict[str, Any] = {
            "chapter_id": chapter_id,
            "paragraph_index": paragraph_index,
        }
        if self._chapter_manager is None or not chapter_id:
            return context
        try:
            chapter = self._chapter_manager.get_chapter(chapter_id)
        except Exception:
            chapter = None
        if chapter is None:
            return context
        context["chapter_index"] = getattr(chapter, "index", None)
        intent = getattr(chapter, "intent", None)
        if intent is not None:
            context["intent"] = intent
            context["foreshadowing_ops"] = list(
                getattr(intent, "foreshadowing_ops", []) or []
            )
            context["narrative_beats"] = list(
                getattr(intent, "narrative_beats", []) or []
            )
        # Prior paragraphs: those whose index < paragraph_index (if known),
        # else all earlier paragraphs.
        paragraphs = list(getattr(chapter, "paragraphs", []) or [])
        if paragraph_index is not None and paragraph_index >= 0:
            prior = paragraphs[:paragraph_index]
        else:
            prior = paragraphs[:-1] if paragraphs else []
        context["prior_paragraphs"] = prior
        return context

    def _publish_issues(
        self,
        *,
        issues: list[ContinuityIssue],
        chapter_id: str,
        paragraph_index: int | None,
    ) -> None:
        """Publish ``data.novel.audit.issues`` to the bus.

        Payload shape: ``{issues, chapter_id, paragraph_index,
        audit_timestamp}``. Each issue is serialized via
        :meth:`ContinuityIssue.to_dict`. No-op when no router is attached
        (e.g. when called from tests or unit scripts).
        """
        if self._router is None:
            return
        payload = {
            "issues": [issue.to_dict() for issue in issues],
            "chapter_id": chapter_id,
            "paragraph_index": paragraph_index,
            "audit_timestamp": _now_iso(),
            "novel_id": self._novel_id,
        }
        self.emit(
            topic=_TOPIC_AUDIT_ISSUES,
            payload=payload,
            channel="data",
        )

    def _extract_keywords(self, text: str) -> list[str]:
        """Extract candidate keywords from ``text`` for taboo / rule matching.

        Splits on CJK punctuation and whitespace, keeps tokens of length
        >= 2 (single CJK chars are too noisy). Falls back to the full text
        if no tokens survive.
        """
        if not text:
            return []
        tokens = [
            t for t in re.split(r"[，。、；：！？\s,;:!?]+", text)
            if t and len(t) >= 2
        ]
        return tokens or ([text] if text else [])

    def _excerpt(self, content: str, anchor: str, max_len: int = 60) -> str:
        """Return a short excerpt of ``content`` centered on ``anchor``.

        Used to keep ``ContinuityIssue.evidence`` readable without dumping
        the full paragraph. If ``anchor`` is empty or not found, returns
        the first ``max_len`` characters.
        """
        if not content:
            return ""
        if anchor and anchor in content:
            idx = content.index(anchor)
            start = max(0, idx - max_len // 2)
            end = min(len(content), idx + len(anchor) + max_len // 2)
            snippet = content[start:end]
            prefix = "…" if start > 0 else ""
            suffix = "…" if end < len(content) else ""
            return f"{prefix}{snippet}{suffix}"
        return content[:max_len] + ("…" if len(content) > max_len else "")

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _load_state(self) -> None:
        """Load persisted audit state from ``self._state_path``.

        Missing / corrupt files are treated as empty state — the auditor
        starts fresh rather than crashing.
        """
        if not self._state_path or not os.path.isfile(self._state_path):
            return
        try:
            with open(self._state_path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            return
        if not isinstance(data, dict):
            return
        self._timeline_events = list(data.get("timeline_events", []) or [])
        fs = data.get("foreshadowing_state", {}) or {}
        self._foreshadowing_state = {
            str(k): dict(v) for k, v in fs.items() if isinstance(v, dict)
        }
        cp = data.get("character_presence", {}) or {}
        self._character_presence = {
            str(k): dict(v) for k, v in cp.items() if isinstance(v, dict)
        }
        self._audit_history = list(data.get("audit_history", []) or [])
        # ``_audited_paragraph_ids`` is reconstructed from history.
        self._audited_paragraph_ids = {
            str(entry.get("paragraph_id"))
            for entry in self._audit_history
            if entry.get("paragraph_id")
        }

    def _save_state(self) -> None:
        """Persist audit state to ``self._state_path`` atomically.

        Uses :meth:`PersistenceManager.save_atomic` (§3.2.2) so readers
        never see a half-written file.
        """
        if not self._state_path:
            return
        data = {
            "novel_id": self._novel_id,
            "timeline_events": self._timeline_events,
            "foreshadowing_state": self._foreshadowing_state,
            "character_presence": self._character_presence,
            "audit_history": self._audit_history,
            "saved_at": _now_iso(),
        }
        try:
            PersistenceManager.save_atomic(data, self._state_path)
        except OSError:
            # Persistence failures must not crash the audit pipeline.
            pass

    # ------------------------------------------------------------------
    # Module serialization (to_dict / from_dict / get_state)
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """Return a serializable snapshot of the auditor's full state."""
        base = super().to_dict()
        base.update({
            "novel_id": self._novel_id,
            "audit_state_dir": self._audit_state_dir,
            "state_path": self._state_path,
            "timeline_events": list(self._timeline_events),
            "foreshadowing_state": {
                k: dict(v) for k, v in self._foreshadowing_state.items()
            },
            "character_presence": {
                k: dict(v) for k, v in self._character_presence.items()
            },
            "audit_history": list(self._audit_history),
            "audited_paragraph_ids": sorted(self._audited_paragraph_ids),
            # Truth sources are referenced by id only — they are owned
            # by the Story Bible / context, not by the auditor.
            "world_contract_present": self._world_contract is not None,
            "character_registry_ids": sorted(self._character_registry.keys()),
            "style_fingerprint_present": self._style_fingerprint is not None,
            "chapter_blueprint_count": len(self._chapter_blueprint),
            "chapter_manager_attached": self._chapter_manager is not None,
        })
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore auditor state from a snapshot produced by :meth:`to_dict`.

        Note: truth sources (Story Bible / WorldStateContract / OC sheets /
        StyleFingerprint / ChapterManager) are NOT restored here — they
        must be re-supplied via :meth:`init`. Only the auditor's own
        persisted audit state is restored.
        """
        super().from_dict(data, **kwargs)
        self._novel_id = str(data.get("novel_id", self._novel_id))
        self._audit_state_dir = str(
            data.get("audit_state_dir", self._audit_state_dir)
        )
        self._state_path = str(
            data.get("state_path")
            or os.path.join(self._audit_state_dir, f"{self._novel_id}.json")
        )
        self._timeline_events = list(data.get("timeline_events", []) or [])
        fs = data.get("foreshadowing_state", {}) or {}
        self._foreshadowing_state = {
            str(k): dict(v) for k, v in fs.items() if isinstance(v, dict)
        }
        cp = data.get("character_presence", {}) or {}
        self._character_presence = {
            str(k): dict(v) for k, v in cp.items() if isinstance(v, dict)
        }
        self._audit_history = list(data.get("audit_history", []) or [])
        self._audited_paragraph_ids = set(
            data.get("audited_paragraph_ids", []) or []
        )
        self._state.custom.setdefault("novel_id", self._novel_id)
        self._state.custom["audits_performed"] = len(self._audit_history)
        self._state.custom["issues_emitted"] = sum(
            len(entry.get("issues", [])) for entry in self._audit_history
        )

    def get_state(self) -> ModuleState:
        """Return the current module state with refreshed counters."""
        self._state.custom["audits_performed"] = len(self._audit_history)
        self._state.custom["issues_emitted"] = sum(
            len(entry.get("issues", [])) for entry in self._audit_history
        )
        self._state.custom["novel_id"] = self._novel_id
        return self._state


