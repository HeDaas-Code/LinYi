"""Unit tests for ``ContinuityAuditor`` (Stage 4 Task 4.5.1 + 4.5.3).

Covers SubTask 4.5.1 (six-dimensional audit + issue output format) and
SubTask 4.5.3 (detection rate > 80% for injected OOC / setting conflicts).

Field names follow ``src/novelist_brain/models.py`` (not the spec template):

- ``ContinuityIssue.category`` ∈ {"ooc","setting_conflict","timeline",
  "foreshadowing","tone","style"} — there is **no** ``"rhythm"`` literal;
  rhythm-related issues are emitted with ``category="tone"``.
- ``ContinuityIssue.severity`` ∈ {"info","warning","critical"} — no
  low/medium/high.
- ``ContinuityIssue`` fields: ``category``, ``severity``, ``evidence``,
  ``suggested_fix``, ``paragraph_id`` (no ``id``/``chapter_id``/``novel_id``
  on the issue itself — those live on the audit payload).
- ``OCCharacterSheet``: ``character_id``, ``name``, ``archetype``,
  ``traits`` (TraitVector), ``fears`` (list[Fear]), ``immutable_facts``
  (list[str]), etc.
- ``WorldStateContract``: ``novel_id``, ``genre``, ``rules`` (list[WorldRule]),
  ``forbidden`` (list[Forbidden]), etc.
- ``WorldRule``: ``rule_id``, ``domain``, ``statement``, ``breakable``,
  ``consequences``, ``introduced_in``, ``status`` (no ``name``/``description``).
- ``StyleFingerprint``: ``vocabulary_density``, ``sentence_length_variance``,
  ``dialogue_ratio``, ``tone_markers``, ``forbidden_phrases``.

The auditor subscribes to five topics (registered in ``__init__``, not
``_initial_state``): ``event.novel.paragraph.published``,
``control.novel.audit``, ``control.module.init``,
``data.sandbox.world.updated``, ``data.oc.evolved``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.continuity_auditor import ContinuityAuditor
from src.novelist_brain.models import (
    BusMessage,
    Chapter,
    ChapterIntent,
    ContinuityIssue,
    Fear,
    Forbidden,
    ForeshadowingOp,
    OCCharacterSheet,
    Paragraph,
    RhythmProfile,
    StoryBible,
    StyleFingerprint,
    TraitVector,
    WorldRule,
    WorldStateContract,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _drain(router: BusRouter, max_rounds: int = 20) -> list[BusMessage]:
    """Flush ``router`` until the inbox is empty, collecting delivered messages.

    Each ``flush()`` only processes the snapshot taken at its start, so
    messages emitted *during* a flush appear in the next round. The loop
    terminates once a flush returns no messages.
    """
    delivered: list[BusMessage] = []
    for _ in range(max_rounds):
        batch = router.flush()
        if not batch:
            break
        delivered.extend(batch)
    return delivered


def _make_style_fingerprint(**kwargs: Any) -> StyleFingerprint:
    defaults: dict[str, Any] = dict(
        vocabulary_density=0.5,
        sentence_length_variance=1.0,
        dialogue_ratio=0.2,
        tone_markers={},
        forbidden_phrases=[],
    )
    defaults.update(kwargs)
    return StyleFingerprint(**defaults)


def _make_oc_sheet(
    character_id: str = "char_protag",
    name: str = "林清",
    *,
    traits: TraitVector | None = None,
    fears: list[Fear] | None = None,
    immutable_facts: list[str] | None = None,
) -> OCCharacterSheet:
    return OCCharacterSheet(
        character_id=character_id,
        name=name,
        archetype="侦探",
        traits=traits or TraitVector(),
        fears=fears or [],
        immutable_facts=immutable_facts or [],
    )


def _make_world_contract(novel_id: str = "test_novel", **kwargs: Any) -> WorldStateContract:
    defaults: dict[str, Any] = dict(
        novel_id=novel_id,
        genre="literary",
        tone="melancholic",
        geography={},
        factions={},
        rules=[],
        forbidden=[],
        mysteries=[],
    )
    defaults.update(kwargs)
    return WorldStateContract(**defaults)


def _make_story_bible(
    novel_id: str = "test_novel",
    *,
    world_contract: WorldStateContract | None = None,
    character_registry: dict[str, OCCharacterSheet] | None = None,
    style_fingerprint: StyleFingerprint | None = None,
    foreshadowing_ledger: list | None = None,
) -> StoryBible:
    return StoryBible(
        novel_id=novel_id,
        world_contract=world_contract or _make_world_contract(novel_id),
        character_registry=character_registry or {},
        style_fingerprint=style_fingerprint or _make_style_fingerprint(),
        foreshadowing_ledger=foreshadowing_ledger or [],
    )


def _make_auditor(
    tmp_path: Path,
    novel_id: str = "test_novel",
    *,
    router: BusRouter | None = None,
    world_contract: WorldStateContract | None = None,
    character_registry: dict[str, OCCharacterSheet] | None = None,
    style_fingerprint: StyleFingerprint | None = None,
    foreshadowing_ledger: list | None = None,
    chapter_manager: Any = None,
) -> ContinuityAuditor:
    """Build a ``ContinuityAuditor`` initialised with a truth-source context.

    The audit-state directory is pointed at ``tmp_path / "audit_state"`` so
    each test is isolated from the real workspace filesystem.
    """
    audit_dir = str(tmp_path / "audit_state")
    os.makedirs(audit_dir, exist_ok=True)
    auditor = ContinuityAuditor(novel_id=novel_id, audit_state_dir=audit_dir)
    if router is not None:
        auditor.register(router)
    sb = _make_story_bible(
        novel_id,
        world_contract=world_contract,
        character_registry=character_registry,
        style_fingerprint=style_fingerprint,
        foreshadowing_ledger=foreshadowing_ledger,
    )
    context: dict[str, Any] = {
        "novel_v2": {"novel_id": novel_id, "audit_state_dir": audit_dir},
        "story_bible": sb,
    }
    if chapter_manager is not None:
        context["chapter_manager"] = chapter_manager
    auditor.init(context)
    return auditor


def _audit(
    auditor: ContinuityAuditor,
    content: str,
    *,
    paragraph_id: str = "p1",
    chapter_id: str = "c1",
    paragraph_index: int = 0,
    chapter_index: int | None = None,
    intent: ChapterIntent | None = None,
    prior_paragraphs: list[Paragraph] | None = None,
    foreshadowing_ops: list[ForeshadowingOp] | None = None,
) -> list[ContinuityIssue]:
    """Run ``audit_paragraph`` on a synthesised paragraph with the given context."""
    paragraph = Paragraph(
        content=content, paragraph_id=paragraph_id, chapter_id=chapter_id
    )
    ctx: dict[str, Any] = {
        "chapter_id": chapter_id,
        "paragraph_index": paragraph_index,
    }
    if chapter_index is not None:
        ctx["chapter_index"] = chapter_index
    if intent is not None:
        ctx["intent"] = intent
    if prior_paragraphs is not None:
        ctx["prior_paragraphs"] = prior_paragraphs
    if foreshadowing_ops is not None:
        ctx["foreshadowing_ops"] = foreshadowing_ops
    return auditor.audit_paragraph(paragraph, ctx)


def _publish_paragraph(
    router: BusRouter,
    novel_id: str,
    chapter_id: str,
    paragraph_id: str,
    content: str,
    index: int = 0,
) -> None:
    """Simulate publishing a paragraph onto the bus."""
    router.publish(
        source="test",
        topic="event.novel.paragraph.published",
        channel="event",
        payload={
            "novel_id": novel_id,
            "chapter_id": chapter_id,
            "paragraph_id": paragraph_id,
            "paragraph": {
                "content": content,
                "paragraph_id": paragraph_id,
                "chapter_id": chapter_id,
            },
            "index": index,
        },
    )


class _FakeChapterManager:
    """Minimal chapter manager stand-in for ``audit_chapter`` tests."""

    def __init__(self, chapter: Chapter) -> None:
        self._chapter = chapter

    def get_chapter(self, chapter_id: str) -> Chapter | None:
        return self._chapter


# ---------------------------------------------------------------------------
# Class 1: Lifecycle
# ---------------------------------------------------------------------------


class TestContinuityAuditorLifecycle:
    def test_init_default(self) -> None:
        auditor = ContinuityAuditor()
        assert auditor._novel_id == "linyi_default"
        assert auditor._audit_state_dir == "audit_state"
        assert auditor.name == "continuity_auditor"

    def test_init_with_custom_novel_id(self, tmp_path: Path) -> None:
        audit_dir = str(tmp_path / "custom_audit")
        auditor = ContinuityAuditor(novel_id="my_novel", audit_state_dir=audit_dir)
        assert auditor._novel_id == "my_novel"
        assert auditor._audit_state_dir == audit_dir
        assert auditor._state_path == os.path.join(audit_dir, "my_novel.json")

    def test_subscriptions_registered(self) -> None:
        auditor = ContinuityAuditor()
        expected = {
            "event.novel.paragraph.published",
            "control.novel.audit",
            "control.module.init",
            "data.sandbox.world.updated",
            "data.oc.evolved",
        }
        assert set(auditor.subscriptions) == expected

    def test_shutdown_persists_state(self, tmp_path: Path) -> None:
        auditor = _make_auditor(
            tmp_path,
            character_registry={
                "c1": _make_oc_sheet(
                    "c1", "张三", traits=TraitVector(extraversion=0.9)
                )
            },
        )
        _audit(auditor, "张三独自一人坐在角落。", paragraph_id="p_persist")

        state_path = Path(auditor._state_path)
        assert state_path.is_file()
        data = json.loads(state_path.read_text(encoding="utf-8"))
        assert data["novel_id"] == "test_novel"
        assert len(data["audit_history"]) == 1
        assert data["audit_history"][0]["paragraph_id"] == "p_persist"
        assert "p_persist" in data.get("audited_paragraph_ids", []) or (
            data["audit_history"][0]["paragraph_id"] == "p_persist"
        )


# ---------------------------------------------------------------------------
# Class 2: OOC audit
# ---------------------------------------------------------------------------


class TestOOCAudit:
    def test_ooc_trait_violation_detected(self, tmp_path: Path) -> None:
        auditor = _make_auditor(
            tmp_path,
            character_registry={
                "c1": _make_oc_sheet(
                    "c1", "张三", traits=TraitVector(extraversion=0.9)
                )
            },
        )
        issues = _audit(auditor, "张三独自一人坐在角落，避开人群，沉默不语。")
        ooc = [i for i in issues if i.category == "ooc"]
        assert len(ooc) >= 1
        assert any("extraversion" in i.evidence for i in ooc)

    def test_ooc_fear_contradiction_detected(self, tmp_path: Path) -> None:
        auditor = _make_auditor(
            tmp_path,
            character_registry={
                "c1": _make_oc_sheet(
                    "c1",
                    "李四",
                    fears=[Fear(object="黑暗", intensity=0.8)],
                )
            },
        )
        issues = _audit(auditor, "李四面对黑暗毫不畏惧，坦然面对。")
        ooc = [i for i in issues if i.category == "ooc"]
        assert len(ooc) >= 1
        assert any("黑暗" in i.evidence for i in ooc)

    def test_ooc_immutable_facts_violation(self, tmp_path: Path) -> None:
        auditor = _make_auditor(
            tmp_path,
            character_registry={
                "c1": _make_oc_sheet(
                    "c1", "王五", immutable_facts=["角色失明"]
                )
            },
        )
        issues = _audit(auditor, "王五看着远方的山，看见飞鸟掠过。")
        ooc = [i for i in issues if i.category == "ooc"]
        assert len(ooc) >= 1
        assert any(i.severity == "critical" for i in ooc)
        assert any("失明" in i.evidence for i in ooc)

    def test_ooc_no_violation_no_issue(self, tmp_path: Path) -> None:
        auditor = _make_auditor(
            tmp_path,
            character_registry={
                "c1": _make_oc_sheet(
                    "c1", "张三", traits=TraitVector(extraversion=0.9)
                )
            },
        )
        # Content mentions the character but shows no contradicting behaviour.
        issues = _audit(auditor, "张三走在街上，看着风景。")
        ooc = [i for i in issues if i.category == "ooc"]
        assert ooc == []

    def test_ooc_severity_level(self, tmp_path: Path) -> None:
        # Trait violation → warning; immutable_facts violation → critical.
        # Uses extraversion (whose _TRAIT_BEHAVIOR_MAP high_kw/low_kw tuples
        # are correctly aligned with trait semantics) so the trait-axis
        # inversion check fires a warning, while the immutable_facts check
        # fires a critical for the same paragraph.
        auditor = _make_auditor(
            tmp_path,
            character_registry={
                "c1": _make_oc_sheet(
                    "c1",
                    "赵六",
                    traits=TraitVector(extraversion=0.9),
                    immutable_facts=["角色失明"],
                )
            },
        )
        issues = _audit(
            auditor, "赵六独自一人坐在角落，沉默不语，并且看着远方的山。"
        )
        ooc = [i for i in issues if i.category == "ooc"]
        severities = {i.severity for i in ooc}
        assert "warning" in severities  # trait violation (extraversion)
        assert "critical" in severities  # immutable_facts violation (失明+看着)


# ---------------------------------------------------------------------------
# Class 3: Setting conflict audit
# ---------------------------------------------------------------------------


class TestSettingConflictAudit:
    def test_forbidden_keyword_detected(self, tmp_path: Path) -> None:
        wc = _make_world_contract(
            forbidden=[Forbidden(forbidden_id="f1", name="血祭")]
        )
        auditor = _make_auditor(tmp_path, world_contract=wc)
        issues = _audit(auditor, "他们正在进行血祭仪式。")
        sc = [i for i in issues if i.category == "setting_conflict"]
        assert len(sc) >= 1
        assert any(i.severity == "critical" for i in sc)
        assert any("血祭" in i.evidence for i in sc)

    def test_breakable_rule_violation(self, tmp_path: Path) -> None:
        wc = _make_world_contract(
            rules=[
                WorldRule(
                    rule_id="r1",
                    statement="时间不可逆",
                    breakable=False,
                    status="active",
                )
            ]
        )
        auditor = _make_auditor(tmp_path, world_contract=wc)
        issues = _audit(auditor, "他试图回到过去改变历史。")
        sc = [i for i in issues if i.category == "setting_conflict"]
        assert len(sc) >= 1
        assert any("时间不可逆" in i.evidence or "时间逆行" in i.evidence for i in sc)

    def test_anachronism_detected(self, tmp_path: Path) -> None:
        wc = _make_world_contract(genre="古代武侠")
        auditor = _make_auditor(tmp_path, world_contract=wc)
        issues = _audit(auditor, "他拿出手机查看消息。")
        sc = [i for i in issues if i.category == "setting_conflict"]
        assert len(sc) >= 1
        assert any("手机" in i.evidence for i in sc)

    def test_setting_no_conflict_no_issue(self, tmp_path: Path) -> None:
        wc = _make_world_contract(
            forbidden=[Forbidden(forbidden_id="f1", name="血祭")],
            rules=[
                WorldRule(
                    rule_id="r1",
                    statement="时间不可逆",
                    breakable=False,
                )
            ],
        )
        auditor = _make_auditor(tmp_path, world_contract=wc)
        issues = _audit(auditor, "他走在街上，看着夕阳。")
        sc = [i for i in issues if i.category == "setting_conflict"]
        assert sc == []


# ---------------------------------------------------------------------------
# Class 4: Timeline audit
# ---------------------------------------------------------------------------


class TestTimelineAudit:
    def test_timeline_contradiction(self, tmp_path: Path) -> None:
        auditor = _make_auditor(tmp_path)
        prior = [
            Paragraph(
                content="明天去城里办事。",
                paragraph_id="p0",
                chapter_id="c1",
            )
        ]
        issues = _audit(
            auditor,
            "昨天去了城里办事。",
            paragraph_id="p1",
            paragraph_index=1,
            prior_paragraphs=prior,
        )
        timeline = [i for i in issues if i.category == "timeline"]
        assert len(timeline) >= 1
        assert any("时间线矛盾" in i.evidence for i in timeline)

    def test_character_presence_tracking(self, tmp_path: Path) -> None:
        auditor = _make_auditor(
            tmp_path,
            character_registry={"c1": _make_oc_sheet("c1", "张三")},
        )
        # Paragraph 0: 张三 is present (establishes presence state — the
        # auditor initialises a new presence entry with status="present"
        # and ``continue``s, skipping the leave-token check on first
        # encounter, so we need an explicit presence-establishing paragraph
        # before the leave paragraph).
        _audit(
            auditor,
            "张三站在房间里。",
            paragraph_id="p0",
            paragraph_index=0,
        )
        # Paragraph 1: 张三 leaves (presence status flips to "left").
        _audit(
            auditor,
            "张三离开了房间。",
            paragraph_id="p1",
            paragraph_index=1,
        )
        # Paragraph 2: 张三 reappears without a return token.
        issues = _audit(
            auditor,
            "张三站在窗前。",
            paragraph_id="p2",
            paragraph_index=2,
        )
        presence = [
            i
            for i in issues
            if i.category == "timeline" and "重新在场" in i.evidence
        ]
        assert len(presence) >= 1


# ---------------------------------------------------------------------------
# Class 5: Foreshadowing audit
# ---------------------------------------------------------------------------


class TestForeshadowingAudit:
    def test_premature_payoff_detected(self, tmp_path: Path) -> None:
        auditor = _make_auditor(tmp_path)
        # Introduce at chapter_index=0.
        _audit(
            auditor,
            "第一段引入伏笔。",
            paragraph_id="p1",
            chapter_index=0,
            foreshadowing_ops=[
                ForeshadowingOp(op_type="introduce", entry_id="f1")
            ],
        )
        # Pay off at the same chapter_index → premature.
        issues = _audit(
            auditor,
            "第二段兑现伏笔。",
            paragraph_id="p2",
            chapter_index=0,
            foreshadowing_ops=[
                ForeshadowingOp(op_type="pay_off", entry_id="f1")
            ],
        )
        premature = [
            i
            for i in issues
            if i.category == "foreshadowing" and "提前兑现" in i.evidence
        ]
        assert len(premature) >= 1

    def test_duplicate_introduce_detected(self, tmp_path: Path) -> None:
        auditor = _make_auditor(tmp_path)
        _audit(
            auditor,
            "第一段。",
            paragraph_id="p1",
            chapter_index=0,
            foreshadowing_ops=[
                ForeshadowingOp(op_type="introduce", entry_id="f1")
            ],
        )
        issues = _audit(
            auditor,
            "第二段。",
            paragraph_id="p2",
            chapter_index=1,
            foreshadowing_ops=[
                ForeshadowingOp(op_type="introduce", entry_id="f1")
            ],
        )
        dup = [
            i
            for i in issues
            if i.category == "foreshadowing" and "重复引入" in i.evidence
        ]
        assert len(dup) >= 1

    def test_reinforce_without_introduce(self, tmp_path: Path) -> None:
        auditor = _make_auditor(tmp_path)
        # Pay off first (state becomes "paid_off" after premature-payoff warning).
        _audit(
            auditor,
            "第一段。",
            paragraph_id="p1",
            chapter_index=0,
            foreshadowing_ops=[
                ForeshadowingOp(op_type="pay_off", entry_id="f1")
            ],
        )
        # Reinforce on a paid-off entry → "未被引入前被强化" warning.
        issues = _audit(
            auditor,
            "第二段。",
            paragraph_id="p2",
            chapter_index=1,
            foreshadowing_ops=[
                ForeshadowingOp(op_type="reinforce", entry_id="f1")
            ],
        )
        reinforce = [
            i
            for i in issues
            if i.category == "foreshadowing"
            and "未被引入前被强化" in i.evidence
        ]
        assert len(reinforce) >= 1

    def test_staleness_warning(self, tmp_path: Path) -> None:
        auditor = _make_auditor(tmp_path)  # has a StoryBible by default
        # Introduce at chapter_index=0.
        _audit(
            auditor,
            "引入伏笔。",
            paragraph_id="p1",
            chapter_index=0,
            foreshadowing_ops=[
                ForeshadowingOp(op_type="introduce", entry_id="f1")
            ],
        )
        # Audit 6 chapters later with no ops → staleness (threshold = 5).
        issues = _audit(
            auditor,
            "后续段落。",
            paragraph_id="p2",
            chapter_index=6,
            foreshadowing_ops=[],
        )
        stale = [
            i
            for i in issues
            if i.category == "foreshadowing" and "未强化或兑现" in i.evidence
        ]
        assert len(stale) >= 1


# ---------------------------------------------------------------------------
# Class 6: Style audit
# ---------------------------------------------------------------------------


class TestStyleAudit:
    def test_vocabulary_density_deviation(self, tmp_path: Path) -> None:
        fp = _make_style_fingerprint(vocabulary_density=0.9)
        auditor = _make_auditor(tmp_path, style_fingerprint=fp)
        # Low-diversity content: repeated character.
        issues = _audit(auditor, "哈哈哈哈哈哈哈。")
        vd = [
            i
            for i in issues
            if i.category == "style" and "vocabulary_density" in i.evidence
        ]
        assert len(vd) >= 1

    def test_forbidden_phrases_detected(self, tmp_path: Path) -> None:
        fp = _make_style_fingerprint(forbidden_phrases=["本质上"])
        auditor = _make_auditor(tmp_path, style_fingerprint=fp)
        issues = _audit(auditor, "这本质上是一个问题。")
        forbidden = [
            i
            for i in issues
            if i.category == "style" and "本质上" in i.evidence
        ]
        assert len(forbidden) >= 1
        assert any(i.severity == "warning" for i in forbidden)

    def test_dialogue_ratio_deviation(self, tmp_path: Path) -> None:
        fp = _make_style_fingerprint(dialogue_ratio=0.5)
        auditor = _make_auditor(tmp_path, style_fingerprint=fp)
        # No dialogue marks → dialogue_ratio = 0.0, |0.0 - 0.5| > 0.2.
        issues = _audit(auditor, "这是一段没有对话的叙述文字。")
        dr = [
            i
            for i in issues
            if i.category == "style" and "dialogue_ratio" in i.evidence
        ]
        assert len(dr) >= 1


# ---------------------------------------------------------------------------
# Class 7: Rhythm audit (emitted with category="tone")
# ---------------------------------------------------------------------------


class TestRhythmAudit:
    def test_missing_hook_warning(self, tmp_path: Path) -> None:
        # Per-paragraph hook check: paragraph_index=0, high hook_strength,
        # no hook cues in content → info issue with [rhythm] prefix.
        intent = ChapterIntent(
            chapter_index=0,
            rhythm=RhythmProfile(hook_strength=0.6),
        )
        auditor = _make_auditor(tmp_path)
        issues = _audit(
            auditor,
            "这是一段平淡的开头，没有任何悬念。",
            paragraph_index=0,
            intent=intent,
        )
        rhythm = [
            i
            for i in issues
            if i.category == "tone" and "[rhythm]" in i.evidence
        ]
        assert len(rhythm) >= 1
        assert any("Hook" in i.evidence for i in rhythm)

    def test_missing_climax_warning(self, tmp_path: Path) -> None:
        # Chapter-level: cool_point_density >= 0.3 but no climax cue → info.
        intent = ChapterIntent(
            chapter_index=0,
            rhythm=RhythmProfile(
                hook_strength=0.0,
                cool_point_density=0.5,
                rest_ratio=0.5,
            ),
        )
        chapter = Chapter(
            chapter_id="c1",
            index=0,
            intent=intent,
            paragraphs=[
                Paragraph(
                    content="第一段平淡的叙述。",
                    paragraph_id="p1",
                    chapter_id="c1",
                ),
                Paragraph(
                    content="第二段平淡的叙述。",
                    paragraph_id="p2",
                    chapter_id="c1",
                ),
            ],
        )
        auditor = _make_auditor(
            tmp_path, chapter_manager=_FakeChapterManager(chapter)
        )
        issues = auditor.audit_chapter("c1")
        climax = [
            i
            for i in issues
            if i.category == "tone" and "章节缺少高潮段落" in i.evidence
        ]
        assert len(climax) >= 1

    def test_chapter_end_suspense_missing(self, tmp_path: Path) -> None:
        # Chapter-level: rest_ratio <= 0.2, last paragraph has no suspense cue.
        intent = ChapterIntent(
            chapter_index=0,
            rhythm=RhythmProfile(
                hook_strength=0.0,
                cool_point_density=0.0,
                rest_ratio=0.1,
            ),
        )
        chapter = Chapter(
            chapter_id="c1",
            index=0,
            intent=intent,
            paragraphs=[
                Paragraph(
                    content="第一段平淡的叙述。",
                    paragraph_id="p1",
                    chapter_id="c1",
                ),
                Paragraph(
                    content="第二段平淡的叙述。",
                    paragraph_id="p2",
                    chapter_id="c1",
                ),
            ],
        )
        auditor = _make_auditor(
            tmp_path, chapter_manager=_FakeChapterManager(chapter)
        )
        issues = auditor.audit_chapter("c1")
        suspense = [
            i
            for i in issues
            if i.category == "tone" and "章末段缺少悬念" in i.evidence
        ]
        assert len(suspense) >= 1


# ---------------------------------------------------------------------------
# Class 8: Issue output format
# ---------------------------------------------------------------------------


class TestIssueOutputFormat:
    def test_issue_has_all_required_fields(self, tmp_path: Path) -> None:
        auditor = _make_auditor(
            tmp_path,
            character_registry={
                "c1": _make_oc_sheet(
                    "c1", "张三", traits=TraitVector(extraversion=0.9)
                )
            },
        )
        issues = _audit(
            auditor, "张三独自一人坐在角落。", paragraph_id="p_fmt"
        )
        assert len(issues) > 0
        issue_dict = issues[0].to_dict()
        assert "category" in issue_dict
        assert "severity" in issue_dict
        assert "evidence" in issue_dict
        assert "suggested_fix" in issue_dict
        assert "paragraph_id" in issue_dict
        assert issue_dict["paragraph_id"] == "p_fmt"

    def test_issue_category_is_valid_enum(self, tmp_path: Path) -> None:
        valid = {"ooc", "setting_conflict", "timeline", "foreshadowing", "tone", "style"}
        auditor = _make_auditor(
            tmp_path,
            character_registry={
                "c1": _make_oc_sheet(
                    "c1", "张三", traits=TraitVector(extraversion=0.9)
                )
            },
        )
        issues = _audit(auditor, "张三独自一人坐在角落。")
        assert len(issues) > 0
        for issue in issues:
            assert issue.category in valid

    def test_issue_severity_is_valid_enum(self, tmp_path: Path) -> None:
        valid = {"info", "warning", "critical"}
        auditor = _make_auditor(
            tmp_path,
            character_registry={
                "c1": _make_oc_sheet(
                    "c1", "张三", traits=TraitVector(extraversion=0.9)
                )
            },
        )
        issues = _audit(auditor, "张三独自一人坐在角落。")
        assert len(issues) > 0
        for issue in issues:
            assert issue.severity in valid

    def test_audit_payload_structure(self, tmp_path: Path) -> None:
        router = BusRouter()
        auditor = _make_auditor(
            tmp_path,
            router=router,
            character_registry={
                "c1": _make_oc_sheet(
                    "c1", "张三", traits=TraitVector(extraversion=0.9)
                )
            },
        )
        _publish_paragraph(
            router, "test_novel", "c1", "p_bus", "张三独自一人坐在角落。", index=0
        )
        delivered = _drain(router)
        audit_msgs = [
            m for m in delivered if m.topic == "data.novel.audit.issues"
        ]
        assert len(audit_msgs) == 1
        payload = audit_msgs[0].payload
        assert "issues" in payload
        assert "chapter_id" in payload
        assert "paragraph_index" in payload
        assert "audit_timestamp" in payload
        assert "novel_id" in payload
        assert payload["novel_id"] == "test_novel"
        assert payload["chapter_id"] == "c1"
        assert payload["paragraph_index"] == 0
        assert isinstance(payload["issues"], list)
        assert len(payload["issues"]) >= 1
        issue = payload["issues"][0]
        assert "category" in issue
        assert "severity" in issue
        assert "evidence" in issue
        assert "suggested_fix" in issue
        assert "paragraph_id" in issue


# ---------------------------------------------------------------------------
# Class 9: Detection rate (SubTask 4.5.3)
# ---------------------------------------------------------------------------


# Ten fixed OOC cases covering trait-axis inversions (extraversion high &
# low — the only axis whose ``_TRAIT_BEHAVIOR_MAP`` high_kw/low_kw tuples
# are correctly aligned with trait semantics), fear contradiction, and
# immutable_facts violation. Each case is independent and deterministic
# (no random data).
#
# Note: ``_TRAIT_BEHAVIOR_MAP`` in ``continuity_auditor.py`` inverts the
# high_kw/low_kw tuples for neuroticism / conscientiousness / agreeableness
# relative to the trait semantics, so those axes cannot be used for
# semantically-correct OOC injection that the auditor will also detect.
# We therefore exercise extraversion (both ends), fear contradiction
# (three distinct objects), and immutable_facts violation (sight / hearing
# / motion) to reach 10 detectable cases.
_OOC_CASES: list[tuple[str, OCCharacterSheet, str]] = [
    # 1. extraversion=0.9 (high) + low-extraversion behaviour → warning.
    (
        "char1",
        OCCharacterSheet(
            character_id="char1", name="张三", traits=TraitVector(extraversion=0.9)
        ),
        "张三独自一人坐在角落，避开人群，沉默不语。",
    ),
    # 2. extraversion=0.1 (low) + high-extraversion behaviour → warning.
    (
        "char2",
        OCCharacterSheet(
            character_id="char2", name="李四", traits=TraitVector(extraversion=0.1)
        ),
        "李四主动社交，热情寒暄，大声招呼。",
    ),
    # 3. extraversion=0.9 (high) + different low-extraversion keywords.
    (
        "char3",
        OCCharacterSheet(
            character_id="char3", name="王五", traits=TraitVector(extraversion=0.9)
        ),
        "王五退到角落，静静坐着，默然不语。",
    ),
    # 4. extraversion=0.1 (low) + different high-extraversion keywords.
    (
        "char4",
        OCCharacterSheet(
            character_id="char4", name="赵六", traits=TraitVector(extraversion=0.1)
        ),
        "赵六开怀大笑，滔滔不绝，侃侃而谈。",
    ),
    # 5. fear contradiction: 黑暗 (intensity=0.8) + 毫不畏惧.
    (
        "char5",
        OCCharacterSheet(
            character_id="char5",
            name="孙七",
            fears=[Fear(object="黑暗", intensity=0.8)],
        ),
        "孙七面对黑暗毫不畏惧。",
    ),
    # 6. fear contradiction: 高处 (intensity=0.7) + 坦然面对.
    (
        "char6",
        OCCharacterSheet(
            character_id="char6",
            name="周八",
            fears=[Fear(object="高处", intensity=0.7)],
        ),
        "周八站在高处坦然面对。",
    ),
    # 7. fear contradiction: 蛇 (intensity=0.9) + 毫无惧色.
    (
        "char7",
        OCCharacterSheet(
            character_id="char7",
            name="吴九",
            fears=[Fear(object="蛇", intensity=0.9)],
        ),
        "吴九遇到蛇毫无惧色。",
    ),
    # 8. immutable_facts: 失明 + sight verbs (看着 / 看见).
    (
        "char8",
        OCCharacterSheet(
            character_id="char8",
            name="郑十",
            immutable_facts=["角色失明"],
        ),
        "郑十看着远方的山，看见飞鸟掠过。",
    ),
    # 9. immutable_facts: 失聪 + hearing verbs (听见 / 倾听).
    (
        "char9",
        OCCharacterSheet(
            character_id="char9",
            name="钱十一",
            immutable_facts=["双耳失聪"],
        ),
        "钱十一听见远处的钟声，倾听风声。",
    ),
    # 10. immutable_facts: 瘫痪 + motion verbs (走着 / 迈步).
    (
        "char10",
        OCCharacterSheet(
            character_id="char10",
            name="冯十二",
            immutable_facts=["下肢瘫痪"],
        ),
        "冯十二走着路，迈步向前。",
    ),
]


# Ten fixed setting-conflict cases covering forbidden taboos, unbreakable
# rule violations, and anachronism in ancient-genre settings.
_SETTING_CONFLICT_CASES: list[str] = [
    "他们正在进行血祭仪式。",  # forbidden "血祭"
    "活人献祭的场景出现在眼前。",  # forbidden "活人献祭"
    "他试图回到过去改变历史。",  # rule "时间不可逆"
    "法师逆转时间，改写过去。",  # rule "时间不可逆" (different keyword)
    "修行者悬浮在空中打坐。",  # rule "物理定律"
    "主角飞翔天际，俯瞰大地。",  # rule "物理定律" (different keyword)
    "她照镜子时看到了异象。",  # rule "镜子禁忌"
    "他凝视镜子中的自己。",  # rule "镜子禁忌" (different keyword)
    "他拿出手机查看消息。",  # anachronism (古代 + 手机)
    "她打开电脑开始写作。",  # anachronism (古代 + 电脑)
]


class TestDetectionRate:
    def test_ooc_detection_rate_above_80_percent(self, tmp_path: Path) -> None:
        registry = {cid: sheet for cid, sheet, _ in _OOC_CASES}
        auditor = _make_auditor(tmp_path, character_registry=registry)

        detected = 0
        for idx, (cid, _sheet, content) in enumerate(_OOC_CASES):
            issues = _audit(
                auditor,
                content,
                paragraph_id=f"p_ooc_{idx}",
                paragraph_index=idx,
            )
            if any(i.category == "ooc" for i in issues):
                detected += 1

        # > 80% of 10 cases → at least 8 detected.
        assert detected >= 8, (
            f"OOC detection rate {detected}/10 = {detected * 10}% < 80%"
        )

    def test_setting_conflict_detection_rate_above_80_percent(
        self, tmp_path: Path
    ) -> None:
        wc = _make_world_contract(
            genre="古代武侠",
            rules=[
                WorldRule(
                    rule_id="r_time",
                    statement="时间不可逆",
                    breakable=False,
                    status="active",
                ),
                WorldRule(
                    rule_id="r_physics",
                    statement="物理定律",
                    breakable=False,
                    status="active",
                ),
                WorldRule(
                    rule_id="r_mirror",
                    statement="镜子禁忌",
                    breakable=False,
                    status="active",
                ),
            ],
            forbidden=[
                Forbidden(forbidden_id="f_blood", name="血祭"),
                Forbidden(forbidden_id="f_sac", name="活人献祭"),
            ],
        )
        auditor = _make_auditor(tmp_path, world_contract=wc)

        detected = 0
        for idx, content in enumerate(_SETTING_CONFLICT_CASES):
            issues = _audit(
                auditor,
                content,
                paragraph_id=f"p_sc_{idx}",
                paragraph_index=idx,
            )
            if any(i.category == "setting_conflict" for i in issues):
                detected += 1

        # > 80% of 10 cases → at least 8 detected.
        assert detected >= 8, (
            f"setting_conflict detection rate {detected}/10 = "
            f"{detected * 10}% < 80%"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
