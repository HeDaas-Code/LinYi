"""Unit tests for ``QualityEngine`` (SubTask 4.5.2).

Covers the quality-closure loop: severity-based triage (info / warning /
critical), auto-revision dispatch, human-review flagging, quality scoring
(1.0 base, info -0.02 / warning -0.1 / critical -0.3), quality-report
emission, and Story Bible / OC feedback for critical issues.

The tests follow the actual ``quality_engine.py`` implementation. Per
``models.py``, ``ContinuityIssue`` exposes ``category`` / ``severity`` /
``evidence`` / ``suggested_fix`` / ``paragraph_id`` — the spec template's
``id`` / ``chapter_id`` / ``novel_id`` fields are not present on the
dataclass (those live on the audit payload top level). ``category`` has
no ``"rhythm"`` literal and ``severity`` has no ``low/medium/high``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage, ContinuityIssue
from src.novelist_brain.quality_engine import QualityEngine


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


def _make_issue(
    category: str = "ooc",
    severity: str = "warning",
    paragraph_id: str | None = "p1",
    evidence: str = "test evidence",
    suggested_fix: str = "test fix",
) -> ContinuityIssue:
    return ContinuityIssue(
        category=category,  # type: ignore[arg-type]
        severity=severity,  # type: ignore[arg-type]
        evidence=evidence,
        suggested_fix=suggested_fix,
        paragraph_id=paragraph_id,
    )


def _publish(
    router: BusRouter,
    *,
    topic: str,
    payload: Any,
    channel: str = "data",
) -> None:
    router.publish(source="test", topic=topic, channel=channel, payload=payload)


def _publish_audit_issues(
    router: BusRouter,
    *,
    novel_id: str = "test_novel",
    chapter_id: str = "ch1",
    paragraph_index: int | None = 0,
    issues: list[ContinuityIssue] | None = None,
) -> None:
    """Publish ``data.novel.audit.issues`` matching ContinuityAuditor's payload.

    Payload shape: ``{issues, chapter_id, paragraph_index, audit_timestamp,
    novel_id}``. The ``paragraph_id`` lives inside each issue, not at the
    payload top level.
    """
    if issues is None:
        issues = [_make_issue()]
    payload = {
        "issues": [i.to_dict() for i in issues],
        "chapter_id": chapter_id,
        "paragraph_index": paragraph_index,
        "audit_timestamp": "2026-01-01T00:00:00",
        "novel_id": novel_id,
    }
    _publish(router, topic="data.novel.audit.issues", payload=payload)


def _make_engine(
    router: BusRouter,
    tmp_path: Path,
    *,
    novel_id: str = "test_novel",
) -> QualityEngine:
    """Build a ``QualityEngine`` with state dir isolated under ``tmp_path``."""
    quality_state_dir = str(tmp_path / "quality_state")
    engine = QualityEngine(
        novel_id=novel_id,
        quality_state_dir=quality_state_dir,
    )
    engine.register(router)
    engine.init(
        {"novel_v2": {"novel_id": novel_id, "quality_state_dir": quality_state_dir}}
    )
    return engine


def _find_messages(messages: list[BusMessage], topic: str) -> list[BusMessage]:
    return [m for m in messages if m.topic == topic]


# ---------------------------------------------------------------------------
# Class 1: Lifecycle
# ---------------------------------------------------------------------------


class TestQualityEngineLifecycle:
    def test_init_default(self) -> None:
        engine = QualityEngine()
        assert engine._novel_id == "linyi_default"
        assert engine._quality_state_dir == "quality_state"
        assert engine._state_path == os.path.join("quality_state", "linyi_default.json")
        assert engine._last_quality_score == 1.0
        assert engine._pending_revisions == {}
        assert engine._human_revisions == {}
        assert engine._revised_paragraph_ids == set()
        # Counters initialized by _initial_state() (called by Module.__init__).
        assert engine._state.custom["issues_processed"] == 0
        assert engine._state.custom["auto_revisions_initiated"] == 0
        assert engine._state.custom["human_revisions_initiated"] == 0
        assert engine._state.custom["revisions_completed"] == 0
        assert engine._state.custom["quality_reports_emitted"] == 0

    def test_init_with_custom_novel_id(self) -> None:
        engine = QualityEngine(novel_id="my_novel", quality_state_dir="/tmp/qs")
        assert engine._novel_id == "my_novel"
        assert engine._quality_state_dir == "/tmp/qs"
        assert engine._state_path == os.path.join("/tmp/qs", "my_novel.json")

    def test_subscriptions_registered(self) -> None:
        engine = QualityEngine()
        # Subscriptions are registered in _initial_state() (invoked by the
        # parent Module.__init__), not in the QualityEngine.__init__ body.
        assert "data.novel.audit.issues" in engine.subscriptions
        assert "data.novel.revision.applied" in engine.subscriptions
        assert "control.module.init" in engine.subscriptions
        assert len(engine.subscriptions) == 3

    def test_shutdown_persists_state(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[_make_issue(severity="warning", paragraph_id="p1")],
        )
        _drain(router)
        engine.shutdown()

        state_file = tmp_path / "quality_state" / "test_novel.json"
        assert state_file.is_file()
        with open(state_file, encoding="utf-8") as f:
            data = json.load(f)
        assert data["novel_id"] == "test_novel"
        assert data["counters"]["issues_processed"] == 1
        assert data["counters"]["auto_revisions_initiated"] == 1
        assert data["counters"]["quality_reports_emitted"] == 1
        # shutdown() deactivates the engine.
        assert engine._state.active is False


# ---------------------------------------------------------------------------
# Class 2: Severity triage
# ---------------------------------------------------------------------------


class TestSeverityTriage:
    def test_info_severity_no_revision_triggered(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[_make_issue(severity="info", paragraph_id="p1")],
        )
        delivered = _drain(router)

        assert not _find_messages(delivered, "control.novel.revision.required")
        assert not _find_messages(delivered, "control.novel.revision.human_required")
        # Quality report is still emitted with zero revisions.
        reports = _find_messages(delivered, "data.novel.quality.report")
        assert len(reports) == 1
        assert reports[0].payload["issues_count"] == {
            "info": 1,
            "warning": 0,
            "critical": 0,
        }
        assert reports[0].payload["auto_revisions_initiated"] == 0
        assert reports[0].payload["human_revisions_initiated"] == 0
        assert engine._state.custom["auto_revisions_initiated"] == 0
        assert engine._state.custom["human_revisions_initiated"] == 0

    def test_warning_severity_triggers_auto_revision(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[_make_issue(severity="warning", paragraph_id="p1")],
        )
        delivered = _drain(router)

        assert len(_find_messages(delivered, "control.novel.revision.required")) == 1
        assert not _find_messages(delivered, "control.novel.revision.human_required")
        assert engine._state.custom["auto_revisions_initiated"] == 1
        assert engine._state.custom["human_revisions_initiated"] == 0

    def test_critical_severity_triggers_human_required(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[
                _make_issue(
                    severity="critical", category="timeline", paragraph_id="p1"
                )
            ],
        )
        delivered = _drain(router)

        assert (
            len(_find_messages(delivered, "control.novel.revision.human_required")) == 1
        )
        # Critical must NOT trigger auto-revision.
        assert not _find_messages(delivered, "control.novel.revision.required")
        assert engine._state.custom["human_revisions_initiated"] == 1
        assert engine._state.custom["auto_revisions_initiated"] == 0

    def test_mixed_severity_batch_correctly_split(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[
                _make_issue(severity="info", category="style", paragraph_id="p1"),
                _make_issue(severity="warning", category="tone", paragraph_id="p2"),
                _make_issue(
                    severity="critical", category="timeline", paragraph_id="p3"
                ),
            ],
        )
        delivered = _drain(router)

        # One auto-revision (warning on p2), one human-required (critical on
        # p3 — timeline triggers no Story Bible feedback), one quality report.
        assert len(_find_messages(delivered, "control.novel.revision.required")) == 1
        assert (
            len(_find_messages(delivered, "control.novel.revision.human_required")) == 1
        )
        reports = _find_messages(delivered, "data.novel.quality.report")
        assert len(reports) == 1
        assert reports[0].payload["issues_count"] == {
            "info": 1,
            "warning": 1,
            "critical": 1,
        }
        # Score = 1.0 - 0.02 - 0.1 - 0.3 = 0.58
        assert reports[0].payload["quality_score"] == pytest.approx(0.58)
        assert engine._state.custom["issues_processed"] == 3


# ---------------------------------------------------------------------------
# Class 3: Auto-revision
# ---------------------------------------------------------------------------


class TestAutoRevision:
    def test_warning_publishes_revision_required(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[_make_issue(severity="warning", paragraph_id="p1")],
        )
        delivered = _drain(router)

        msgs = _find_messages(delivered, "control.novel.revision.required")
        assert len(msgs) == 1
        assert msgs[0].channel == "control"

    def test_revision_required_payload_structure(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            novel_id="test_novel",
            chapter_id="ch1",
            issues=[
                _make_issue(
                    severity="warning", category="tone", paragraph_id="p1"
                )
            ],
        )
        delivered = _drain(router)

        msgs = _find_messages(delivered, "control.novel.revision.required")
        assert len(msgs) == 1
        payload = msgs[0].payload
        assert payload["paragraph_id"] == "p1"
        assert payload["chapter_id"] == "ch1"
        assert payload["novel_id"] == "test_novel"
        assert isinstance(payload["revision_id"], str)
        assert len(payload["revision_id"]) > 0
        assert payload["requested_at"]
        assert "revision_prompt" in payload
        assert isinstance(payload["issues"], list)
        assert len(payload["issues"]) == 1
        assert payload["issues"][0]["severity"] == "warning"
        assert payload["issues"][0]["category"] == "tone"
        assert payload["issues"][0]["paragraph_id"] == "p1"
        # The revision_prompt carries the structured rewrite request.
        assert "段落修订请求" in payload["revision_prompt"]
        assert "p1" in payload["revision_prompt"]

    def test_revision_applied_closes_request(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[_make_issue(severity="warning", paragraph_id="p1")],
        )
        delivered = _drain(router)
        revision_id = _find_messages(delivered, "control.novel.revision.required")[
            0
        ].payload["revision_id"]
        assert revision_id in engine._pending_revisions
        assert "p1" in engine._revised_paragraph_ids

        _publish(
            router,
            topic="data.novel.revision.applied",
            payload={"revision_id": revision_id},
        )
        _drain(router)

        assert revision_id not in engine._pending_revisions
        # The paragraph is released so future warnings can trigger new
        # revisions (per SubTask 4.2.2 duplicate-revision guard).
        assert "p1" not in engine._revised_paragraph_ids

    def test_revision_applied_increments_counter(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[_make_issue(severity="warning", paragraph_id="p1")],
        )
        delivered = _drain(router)
        revision_id = _find_messages(delivered, "control.novel.revision.required")[
            0
        ].payload["revision_id"]
        assert engine._state.custom["revisions_completed"] == 0

        _publish(
            router,
            topic="data.novel.revision.applied",
            payload={"revision_id": revision_id},
        )
        _drain(router)

        assert engine._state.custom["revisions_completed"] == 1

    def test_duplicate_paragraph_id_grouped_into_single_revision(
        self, tmp_path: Path
    ) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[
                _make_issue(
                    severity="warning",
                    category="tone",
                    paragraph_id="p1",
                    evidence="e1",
                ),
                _make_issue(
                    severity="warning",
                    category="style",
                    paragraph_id="p1",
                    evidence="e2",
                ),
            ],
        )
        delivered = _drain(router)

        msgs = _find_messages(delivered, "control.novel.revision.required")
        # Both warning issues share paragraph_id "p1" → grouped into a
        # single revision request (per SubTask 4.2.2 dedup-by-paragraph).
        assert len(msgs) == 1
        assert len(msgs[0].payload["issues"]) == 2
        assert engine._state.custom["auto_revisions_initiated"] == 1


# ---------------------------------------------------------------------------
# Class 4: Human revision
# ---------------------------------------------------------------------------


class TestHumanRevision:
    def test_critical_publishes_human_required(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[
                _make_issue(
                    severity="critical", category="timeline", paragraph_id="p1"
                )
            ],
        )
        delivered = _drain(router)

        msgs = _find_messages(delivered, "control.novel.revision.human_required")
        assert len(msgs) == 1
        assert msgs[0].channel == "control"

    def test_human_required_payload_structure(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            novel_id="test_novel",
            chapter_id="ch1",
            issues=[
                _make_issue(
                    severity="critical", category="timeline", paragraph_id="p1"
                )
            ],
        )
        delivered = _drain(router)

        msgs = _find_messages(delivered, "control.novel.revision.human_required")
        assert len(msgs) == 1
        payload = msgs[0].payload
        assert payload["paragraph_id"] == "p1"
        assert payload["chapter_id"] == "ch1"
        assert payload["novel_id"] == "test_novel"
        assert isinstance(payload["human_revision_id"], str)
        assert len(payload["human_revision_id"]) > 0
        assert payload["reason"] == "critical severity issues detected"
        assert payload["requested_at"]
        assert isinstance(payload["issues"], list)
        assert len(payload["issues"]) == 1
        assert payload["issues"][0]["severity"] == "critical"

    def test_critical_does_not_trigger_auto_revision(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[
                _make_issue(
                    severity="critical",
                    category="timeline",
                    paragraph_id="p1",
                ),
                _make_issue(
                    severity="critical",
                    category="foreshadowing",
                    paragraph_id="p2",
                ),
            ],
        )
        delivered = _drain(router)

        # Two critical issues on two paragraphs → two human-required requests.
        assert (
            len(_find_messages(delivered, "control.novel.revision.human_required")) == 2
        )
        # No auto-revision should be triggered for critical issues.
        assert not _find_messages(delivered, "control.novel.revision.required")
        assert engine._state.custom["auto_revisions_initiated"] == 0
        assert engine._state.custom["human_revisions_initiated"] == 2

    def test_human_revision_persisted(self, tmp_path: Path) -> None:
        router1 = BusRouter()
        engine1 = _make_engine(router1, tmp_path)
        _publish_audit_issues(
            router1,
            issues=[
                _make_issue(
                    severity="critical", category="timeline", paragraph_id="p1"
                )
            ],
        )
        _drain(router1)
        assert len(engine1._human_revisions) == 1
        engine1.shutdown()

        # Fresh engine loading from the same state file.
        quality_state_dir = str(tmp_path / "quality_state")
        engine2 = QualityEngine(
            novel_id="test_novel",
            quality_state_dir=quality_state_dir,
        )
        router2 = BusRouter()
        engine2.register(router2)
        engine2.init(
            {
                "novel_v2": {
                    "novel_id": "test_novel",
                    "quality_state_dir": quality_state_dir,
                }
            }
        )
        assert len(engine2._human_revisions) == 1
        record = next(iter(engine2._human_revisions.values()))
        assert record["paragraph_id"] == "p1"
        assert record["reason"] == "critical severity issues detected"


# ---------------------------------------------------------------------------
# Class 5: Quality score
# ---------------------------------------------------------------------------


class TestQualityScore:
    def test_score_starts_at_1_with_no_issues(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        # _last_quality_score is initialized to 1.0 and _compute_quality_score
        # on an empty list returns 1.0 (the clamp ceiling).
        assert engine._last_quality_score == 1.0
        assert engine._compute_quality_score([]) == 1.0

    def test_info_deducts_0_02(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        score = engine._compute_quality_score([_make_issue(severity="info")])
        assert score == pytest.approx(0.98)

    def test_warning_deducts_0_1(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        score = engine._compute_quality_score([_make_issue(severity="warning")])
        assert score == pytest.approx(0.9)

    def test_critical_deducts_0_3(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        score = engine._compute_quality_score([_make_issue(severity="critical")])
        assert score == pytest.approx(0.7)

    def test_score_clamped_to_zero(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        # 5 critical issues → 1.0 - 5*0.3 = -0.5 → clamped to 0.0.
        issues = [
            _make_issue(severity="critical", paragraph_id=f"p{i}") for i in range(5)
        ]
        assert engine._compute_quality_score(issues) == 0.0

    def test_score_clamped_to_one(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        # An unknown severity maps to a 0.0 deduction (via _SCORE_DEDUCTION
        # .get default), so the score stays at the 1.0 ceiling — exercising
        # the min(1.0, ...) upper clamp.
        issue = _make_issue(severity="info")
        # Bypass the Literal type (not enforced at runtime) to simulate an
        # unknown severity that carries no deduction.
        issue.severity = "unknown"  # type: ignore[assignment]
        assert engine._compute_quality_score([issue]) == 1.0


# ---------------------------------------------------------------------------
# Class 6: Quality report
# ---------------------------------------------------------------------------


class TestQualityReport:
    def test_quality_report_published_with_correct_payload(
        self, tmp_path: Path
    ) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            novel_id="test_novel",
            chapter_id="ch1",
            issues=[_make_issue(severity="warning", paragraph_id="p1")],
        )
        delivered = _drain(router)

        reports = _find_messages(delivered, "data.novel.quality.report")
        assert len(reports) == 1
        payload = reports[0].payload
        assert payload["novel_id"] == "test_novel"
        assert payload["chapter_id"] == "ch1"
        assert payload["paragraph_id"] == "p1"
        assert payload["issues_count"] == {"info": 0, "warning": 1, "critical": 0}
        assert payload["quality_score"] == pytest.approx(0.9)
        assert payload["generated_at"]
        assert payload["auto_revisions_initiated"] == 1
        assert payload["human_revisions_initiated"] == 0
        assert reports[0].channel == "data"

    def test_quality_score_published_with_correct_payload(
        self, tmp_path: Path
    ) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            novel_id="test_novel",
            chapter_id="ch1",
            issues=[
                _make_issue(
                    severity="critical", category="timeline", paragraph_id="p1"
                )
            ],
        )
        delivered = _drain(router)

        scores = _find_messages(delivered, "data.novel.quality.score")
        assert len(scores) == 1
        payload = scores[0].payload
        assert payload["novel_id"] == "test_novel"
        assert payload["chapter_id"] == "ch1"
        assert payload["score"] == pytest.approx(0.7)
        assert payload["timestamp"]
        assert scores[0].channel == "data"

    def test_report_includes_counts_by_severity(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[
                _make_issue(severity="info", category="style", paragraph_id="p1"),
                _make_issue(severity="info", category="style", paragraph_id="p2"),
                _make_issue(severity="warning", category="tone", paragraph_id="p3"),
                _make_issue(
                    severity="critical", category="timeline", paragraph_id="p4"
                ),
                _make_issue(
                    severity="critical",
                    category="foreshadowing",
                    paragraph_id="p5",
                ),
            ],
        )
        delivered = _drain(router)

        reports = _find_messages(delivered, "data.novel.quality.report")
        assert len(reports) == 1
        counts = reports[0].payload["issues_count"]
        assert counts == {"info": 2, "warning": 1, "critical": 2}
        # Score = 1.0 - 2*0.02 - 1*0.1 - 2*0.3 = 1.0 - 0.04 - 0.1 - 0.6 = 0.26
        assert reports[0].payload["quality_score"] == pytest.approx(0.26)
        assert reports[0].payload["auto_revisions_initiated"] == 1
        assert reports[0].payload["human_revisions_initiated"] == 2


# ---------------------------------------------------------------------------
# Class 7: Feedback to Story Bible / OC
# ---------------------------------------------------------------------------


class TestFeedbackToBible:
    def test_critical_ooc_publishes_oc_evolved(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[
                _make_issue(
                    severity="critical",
                    category="ooc",
                    paragraph_id="p1",
                    evidence="角色 '林依' 行为异常",
                    suggested_fix="更新角色 '林依' 的 traits 以保持性格一致",
                ),
            ],
        )
        delivered = _drain(router)

        msgs = _find_messages(delivered, "data.oc.evolved")
        assert len(msgs) == 1
        payload = msgs[0].payload
        assert payload["novel_id"] == "test_novel"
        # character_id extracted via regex 角色 '<name>' from evidence/fix.
        assert payload["character_id"] == "林依"
        assert payload["evolution_reason"] == "continuity_audit_ooc"
        assert isinstance(payload["source_issues"], list)
        assert len(payload["source_issues"]) == 1
        assert payload["source_issues"][0] == "p1:ooc:0"
        assert payload["timestamp"]
        assert msgs[0].channel == "data"

    def test_critical_setting_conflict_publishes_world_updated(
        self, tmp_path: Path
    ) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[
                _make_issue(
                    severity="critical",
                    category="setting_conflict",
                    paragraph_id="p1",
                    evidence="地理设定矛盾",
                    suggested_fix="更新世界规则",
                ),
            ],
        )
        delivered = _drain(router)

        msgs = _find_messages(delivered, "data.sandbox.world.updated")
        assert len(msgs) == 1
        payload = msgs[0].payload
        assert payload["novel_id"] == "test_novel"
        assert payload["update_reason"] == "continuity_audit_setting_conflict"
        assert isinstance(payload["source_issues"], list)
        assert len(payload["source_issues"]) == 1
        assert payload["source_issues"][0] == "p1:setting_conflict:0"
        assert payload["timestamp"]
        assert msgs[0].channel == "data"

    def test_warning_does_not_trigger_feedback(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[
                _make_issue(
                    severity="warning",
                    category="ooc",
                    paragraph_id="p1",
                    evidence="角色 '林依' 行为异常",
                    suggested_fix="更新角色 '林依' 的 traits",
                ),
                _make_issue(
                    severity="warning",
                    category="setting_conflict",
                    paragraph_id="p2",
                    evidence="地理矛盾",
                    suggested_fix="更新世界规则",
                ),
            ],
        )
        delivered = _drain(router)

        # Feedback is restricted to critical issues; warnings must not feed back.
        assert not _find_messages(delivered, "data.oc.evolved")
        assert not _find_messages(delivered, "data.sandbox.world.updated")

    def test_info_does_not_trigger_feedback(self, tmp_path: Path) -> None:
        router = BusRouter()
        engine = _make_engine(router, tmp_path)
        _publish_audit_issues(
            router,
            issues=[
                _make_issue(
                    severity="info",
                    category="ooc",
                    paragraph_id="p1",
                    evidence="角色 '林依' 轻微偏差",
                    suggested_fix="更新角色 '林依' 的 traits",
                ),
                _make_issue(
                    severity="info",
                    category="setting_conflict",
                    paragraph_id="p2",
                    evidence="轻微地理矛盾",
                    suggested_fix="更新世界规则",
                ),
            ],
        )
        delivered = _drain(router)

        assert not _find_messages(delivered, "data.oc.evolved")
        assert not _find_messages(delivered, "data.sandbox.world.updated")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
