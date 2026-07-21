"""QualityEngine — quality-closure loop for novel continuity issues.

Per ``docs/系统重构方案_v1.md`` §3.11 / §8 / §9 (Stage 4), this module
consumes ``ContinuityIssue`` batches emitted by :class:`ContinuityAuditor`
and routes them by severity:

1. **info** — recorded into the quality report only; no rewrite triggered.
2. **warning** — aggregated by ``paragraph_id`` (fallback ``chapter_id``)
   and dispatched to CreationExecutive via
   ``control.novel.revision.required`` for low-risk auto-rewrite.
   Completion is acknowledged on ``data.novel.revision.applied``.
3. **critical** — flagged for human review via
   ``control.novel.revision.human_required``; never auto-rewritten.

After each batch the engine emits a quality report
(``data.novel.quality.report``) and a lightweight score
(``data.novel.quality.score`` in ``[0.0, 1.0]``). Critical OOC issues feed
back to the OC registry via ``data.oc.evolved``; critical setting conflicts
feed back to the world manager via ``data.sandbox.world.updated``.
Feedback is restricted to ``critical`` issues to avoid frequent world
perturbations from ``info`` / ``warning`` noise.

Subscribes to (per ``topics.py`` REFACTOR_V2_TOPICS):

- ``data.novel.audit.issues`` — ContinuityAuditor output.
- ``data.novel.revision.applied`` — CreationExecutive rewrite completion.
- ``control.module.init`` — init handshake.

Publishes:

- ``control.novel.revision.required`` — low-risk auto-rewrite request.
- ``control.novel.revision.human_required`` — critical human-review request.
- ``data.novel.quality.report`` — full quality report per batch.
- ``data.novel.quality.score`` — lightweight score per batch.
- ``data.oc.evolved`` — OOC feedback to OC registry (critical only).
- ``data.sandbox.world.updated`` — setting-conflict feedback (critical only).

Persistence: ``quality_state/{novel_id}.json`` via
:meth:`PersistenceManager.save_atomic` (§3.2.2 atomic strategy).

Note on field names: ``ContinuityIssue.category`` uses the literal set
``{"ooc", "setting_conflict", "timeline", "foreshadowing", "tone",
"style"}`` (no ``"rhythm"``) and ``ContinuityIssue.severity`` uses
``{"info", "warning", "critical"}`` (no ``low/medium/high``) per
``models.py``. ``ContinuityIssue`` has no ``id`` field, so synthetic
identifiers are derived from ``paragraph_id`` + ``category`` + index when
emitting ``source_issues`` in Story Bible feedback payloads.
"""

from __future__ import annotations

import datetime
import json
import os
import re
import uuid
from typing import Any

from src.novelist_brain.models import (
    BusMessage,
    ContinuityIssue,
    ModuleState,
    TickDelta,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import PersistenceManager


# ---------------------------------------------------------------------------
# Topic string literals (matches ``topics.py`` REFACTOR_V2_TOPICS; the
# ``control.module.init`` literal is shared with ContinuityAuditor).
# ---------------------------------------------------------------------------

_TOPIC_AUDIT_ISSUES = "data.novel.audit.issues"
_TOPIC_REVISION_APPLIED = "data.novel.revision.applied"
_TOPIC_MODULE_INIT = "control.module.init"

_TOPIC_REVISION_REQUIRED = "control.novel.revision.required"
_TOPIC_REVISION_HUMAN_REQUIRED = "control.novel.revision.human_required"
_TOPIC_QUALITY_REPORT = "data.novel.quality.report"
_TOPIC_QUALITY_SCORE = "data.novel.quality.score"
_TOPIC_OC_EVOLVED = "data.oc.evolved"
_TOPIC_WORLD_UPDATED = "data.sandbox.world.updated"


# ---------------------------------------------------------------------------
# Tunable thresholds (per SubTask 4.2.4 / 4.2.5).
# ---------------------------------------------------------------------------

# Quality-score deductions per issue severity (SubTask 4.2.4).
_SCORE_DEDUCTION: dict[str, float] = {
    "info": 0.02,
    "warning": 0.1,
    "critical": 0.3,
}

# Keyword set used to decide whether a critical OOC issue's ``suggested_fix``
# carries OC-relevant information worth feeding back to the OC registry.
_OC_FEEDBACK_KEYWORDS: tuple[str, ...] = (
    "角色", "traits", "OC", "角色卡", "immutable_facts", "行为", "性格",
)

# Reason strings attached to human-revision requests.
_HUMAN_REVISION_REASON = "critical severity issues detected"

# Caps to keep in-memory / persisted state bounded for long-running novels.
_MAX_ISSUE_HISTORY = 500


def _now_iso() -> str:
    """Return a UTC ISO-8601 timestamp string."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# Pattern used to extract a character name from OOC issue evidence /
# suggested_fix text (e.g. "角色 '林依' traits..."). Used as a best-effort
# ``character_id`` for the ``data.oc.evolved`` feedback payload.
_CHARACTER_NAME_PATTERN = re.compile(r"角色\s*['\"]([^'\"]+)['\"]")


class QualityEngine(Module):
    """Quality-closure engine routing ``ContinuityIssue`` batches by severity.

    State:
        - ``novel_id``: str (defaults to ``"linyi_default"``)
        - ``quality_state_dir``: root directory for quality-state files
          (defaults to ``"quality_state"``)
        - ``_pending_revisions``: ``dict[revision_id, request]`` awaiting
          ``data.novel.revision.applied``
        - ``_human_revisions``: ``dict[human_revision_id, record]``
          persisted for human review tracking
        - ``_issue_history``: list of processed batch summaries
        - ``_revised_paragraph_ids``: paragraphs with a revision already in
          flight (avoids duplicate revision requests per SubTask 4.2.2)
        - ``_last_quality_score``: most recently computed score
    """

    def __init__(
        self,
        name: str = "quality_engine",
        novel_id: str = "linyi_default",
        quality_state_dir: str = "quality_state",
    ) -> None:
        super().__init__(name)
        self._novel_id: str = novel_id
        self._quality_state_dir: str = quality_state_dir
        self._state_path: str = os.path.join(
            quality_state_dir, f"{novel_id}.json"
        )

        # Runtime state.
        self._pending_revisions: dict[str, dict[str, Any]] = {}
        self._human_revisions: dict[str, dict[str, Any]] = {}
        self._issue_history: list[dict[str, Any]] = []
        self._revised_paragraph_ids: set[str] = set()
        self._last_quality_score: float = 1.0

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "quality_engine",
            "version": "0.1.0",
            "description": (
                "Quality-closure engine: severity-based issue dispatch, "
                "auto-revision requests, human-review flags, quality "
                "scoring and Story Bible feedback"
            ),
            "dependencies": ["continuity_auditor"],
            "category": "novel_audit",
        }

    def _initial_state(self) -> ModuleState:
        # NOTE: ``self._novel_id`` is NOT yet set when the parent ``Module``
        # constructor calls this method (it runs before our ``__init__``
        # body assigns ``self._novel_id``). Use a literal default here;
        # ``init()`` and ``from_dict()`` refresh ``state.custom["novel_id"]``
        # afterwards. Subscriptions are registered here per SubTask 4.2.1.
        self.subscribe(
            _TOPIC_AUDIT_ISSUES,
            _TOPIC_REVISION_APPLIED,
            _TOPIC_MODULE_INIT,
        )
        return ModuleState(
            active=True,
            energy_cost=0.15,
            custom={
                "issues_processed": 0,
                "auto_revisions_initiated": 0,
                "human_revisions_initiated": 0,
                "revisions_completed": 0,
                "quality_reports_emitted": 0,
                "novel_id": "linyi_default",
            },
        )

    # ------------------------------------------------------------------
    # Lifecycle (Module interface)
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        """Initialize from agent context.

        Expected context keys (all optional):

        - ``novel_v2``: ``{'novel_id': str, 'quality_state_dir': str}`` —
          overrides the constructor defaults if present.
        """
        novel_v2 = context.get("novel_v2", {}) or {}
        if not isinstance(novel_v2, dict):
            novel_v2 = {}
        if novel_v2.get("novel_id"):
            self._novel_id = str(novel_v2["novel_id"])
        if novel_v2.get("quality_state_dir"):
            self._quality_state_dir = str(novel_v2["quality_state_dir"])
        self._state_path = os.path.join(
            self._quality_state_dir, f"{self._novel_id}.json"
        )

        # Load persisted quality state.
        self._load_state()
        self._state.custom["novel_id"] = self._novel_id
        self._state.custom["issues_processed"] = self._state.custom.get(
            "issues_processed", 0
        )
        self._state.custom["auto_revisions_initiated"] = (
            self._state.custom.get("auto_revisions_initiated", 0)
        )
        self._state.custom["human_revisions_initiated"] = (
            self._state.custom.get("human_revisions_initiated", 0)
        )
        self._state.custom["revisions_completed"] = self._state.custom.get(
            "revisions_completed", 0
        )
        self._state.custom["quality_reports_emitted"] = (
            self._state.custom.get("quality_reports_emitted", 0)
        )

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        payload = message.payload
        if topic == _TOPIC_AUDIT_ISSUES:
            self._handle_audit_issues(payload)
        elif topic == _TOPIC_REVISION_APPLIED:
            self._handle_revision_applied(payload)
        elif topic == _TOPIC_MODULE_INIT:
            self._handle_module_init(payload)

    def tick(self, delta: TickDelta) -> None:
        """Advance engine bookkeeping (currently stateless per tick)."""
        self._state.last_tick = delta.absolute_time

    def shutdown(self) -> None:
        """Persist state and deactivate the engine.

        Not part of the :class:`Module` abstract interface but provided as a
        standard lifecycle hook (per Task 4.2 implementation requirements).
        """
        self._save_state()
        self._state.active = False

    # ------------------------------------------------------------------
    # Bus handlers (SubTask 4.2.1)
    # ------------------------------------------------------------------

    def _handle_module_init(self, payload: Any) -> None:
        """Init handshake — already initialized via :meth:`init`."""
        # No-op: the engine initializes from agent context in ``init()``.
        # Subscribing to ``control.module.init`` keeps the engine aware of
        # lifecycle signals without requiring additional action here.
        return

    def _handle_audit_issues(self, payload: Any) -> None:
        """Dispatch a batch of ``ContinuityIssue`` by severity.

        Payload shape (from ContinuityAuditor):
        ``{issues: list[dict], chapter_id: str, paragraph_index: int|None,
        audit_timestamp: str, novel_id: str}``.
        """
        if not isinstance(payload, dict):
            return
        raw_issues = payload.get("issues")
        if not isinstance(raw_issues, list):
            return
        issues: list[ContinuityIssue] = []
        for raw in raw_issues:
            issue = self._coerce_issue(raw)
            if issue is not None:
                issues.append(issue)
        if not issues:
            return

        chapter_id = str(payload.get("chapter_id") or "")
        paragraph_index = payload.get("paragraph_index")
        novel_id = str(payload.get("novel_id") or self._novel_id)

        # Severity-based triage (SubTask 4.2.1).
        info_issues = [i for i in issues if i.severity == "info"]
        warning_issues = [i for i in issues if i.severity == "warning"]
        critical_issues = [i for i in issues if i.severity == "critical"]

        # SubTask 4.2.2: low-risk auto-revision for warning issues.
        auto_count = self._dispatch_warnings(
            warning_issues, chapter_id=chapter_id, novel_id=novel_id
        )
        # SubTask 4.2.3: critical human-review flag.
        human_count = self._dispatch_critical(
            critical_issues, chapter_id=chapter_id, novel_id=novel_id
        )
        # SubTask 4.2.5: Story Bible / OC registry feedback (critical only).
        self._feedback_to_story_bible(critical_issues, novel_id=novel_id)

        # SubTask 4.2.4: quality score + report emission.
        score = self._compute_quality_score(issues)
        self._last_quality_score = score
        paragraph_id = self._resolve_paragraph_id(issues)
        self._emit_quality_report(
            novel_id=novel_id,
            chapter_id=chapter_id,
            paragraph_id=paragraph_id,
            info_count=len(info_issues),
            warning_count=len(warning_issues),
            critical_count=len(critical_issues),
            score=score,
            auto_revisions=auto_count,
            human_revisions=human_count,
        )

        # Record batch in history + refresh counters.
        self._issue_history.append({
            "received_at": _now_iso(),
            "chapter_id": chapter_id,
            "paragraph_index": paragraph_index,
            "novel_id": novel_id,
            "issue_count": len(issues),
            "info_count": len(info_issues),
            "warning_count": len(warning_issues),
            "critical_count": len(critical_issues),
            "quality_score": score,
            "auto_revisions_initiated": auto_count,
            "human_revisions_initiated": human_count,
            "issues": [i.to_dict() for i in issues],
        })
        if len(self._issue_history) > _MAX_ISSUE_HISTORY:
            self._issue_history = self._issue_history[-_MAX_ISSUE_HISTORY:]

        self._state.custom["issues_processed"] = (
            self._state.custom.get("issues_processed", 0) + len(issues)
        )
        self._state.custom["auto_revisions_initiated"] = (
            self._state.custom.get("auto_revisions_initiated", 0) + auto_count
        )
        self._state.custom["human_revisions_initiated"] = (
            self._state.custom.get("human_revisions_initiated", 0)
            + human_count
        )
        self._save_state()

    def _handle_revision_applied(self, payload: Any) -> None:
        """Mark a pending revision as completed on ``data.novel.revision.applied``.

        Matches the revision by ``revision_id``, removes it from the pending
        queue and increments the completed-revision counter.
        """
        if not isinstance(payload, dict):
            return
        revision_id = payload.get("revision_id")
        if not revision_id or not isinstance(revision_id, str):
            return
        request = self._pending_revisions.pop(revision_id, None)
        if request is None:
            # Unknown revision_id — nothing to close (could be a replay or
            # a revision triggered by another module). No-op.
            return
        self._state.custom["revisions_completed"] = (
            self._state.custom.get("revisions_completed", 0) + 1
        )
        # Release the paragraph so future warnings can trigger new revisions.
        paragraph_id = request.get("paragraph_id", "")
        if paragraph_id:
            self._revised_paragraph_ids.discard(paragraph_id)
        self._save_state()

    # ------------------------------------------------------------------
    # SubTask 4.2.2: low-risk auto-revision dispatch
    # ------------------------------------------------------------------

    def _dispatch_warnings(
        self,
        warning_issues: list[ContinuityIssue],
        *,
        chapter_id: str,
        novel_id: str,
    ) -> int:
        """Group warning issues by paragraph/chapter and emit revision requests.

        Groups issues sharing the same ``paragraph_id`` (falling back to
        ``chapter_id``) to avoid duplicate revision requests per paragraph.
        Returns the number of new revision requests emitted.
        """
        if not warning_issues:
            return 0
        groups: dict[str, list[ContinuityIssue]] = {}
        for issue in warning_issues:
            key = issue.paragraph_id or f"chapter:{chapter_id}"
            groups.setdefault(key, []).append(issue)

        emitted = 0
        for grouped in groups.values():
            paragraph_id = grouped[0].paragraph_id or ""
            # Avoid duplicate revision requests for a paragraph that already
            # has one in flight (per SubTask 4.2.2 "避免重复修订").
            if paragraph_id and self._has_pending_revision(paragraph_id):
                continue
            if paragraph_id and paragraph_id in self._revised_paragraph_ids:
                continue
            revision_id = uuid.uuid4().hex
            requested_at = _now_iso()
            revision_prompt = self._generate_revision_prompt(
                grouped,
                paragraph_id=paragraph_id,
                chapter_id=chapter_id,
            )
            payload = {
                "paragraph_id": paragraph_id,
                "chapter_id": chapter_id,
                "novel_id": novel_id,
                "issues": [i.to_dict() for i in grouped],
                "revision_prompt": revision_prompt,
                "requested_at": requested_at,
                "revision_id": revision_id,
            }
            self._pending_revisions[revision_id] = {
                "revision_id": revision_id,
                "paragraph_id": paragraph_id,
                "chapter_id": chapter_id,
                "novel_id": novel_id,
                "issues": [i.to_dict() for i in grouped],
                "revision_prompt": revision_prompt,
                "requested_at": requested_at,
            }
            if paragraph_id:
                self._revised_paragraph_ids.add(paragraph_id)
            self._emit(
                topic=_TOPIC_REVISION_REQUIRED,
                payload=payload,
                channel="control",
            )
            emitted += 1
        return emitted

    def _has_pending_revision(self, paragraph_id: str) -> bool:
        """Return True if a pending revision already targets ``paragraph_id``."""
        return any(
            req.get("paragraph_id") == paragraph_id
            for req in self._pending_revisions.values()
        )

    def _generate_revision_prompt(
        self,
        issues: list[ContinuityIssue],
        *,
        paragraph_id: str,
        chapter_id: str,
    ) -> str:
        """Build a structured revision-prompt string for CreationExecutive.

        Carries ``paragraph_id``, the grouped issues and their suggested
        fixes so the rewrite request is self-describing.
        """
        lines: list[str] = []
        lines.append("# 段落修订请求")
        lines.append(f"novel_id: {self._novel_id}")
        lines.append(f"chapter_id: {chapter_id}")
        lines.append(f"paragraph_id: {paragraph_id}")
        lines.append(f"issue_count: {len(issues)}")
        lines.append("")
        lines.append("## Issues")
        for idx, issue in enumerate(issues):
            lines.append(f"### Issue {idx + 1}")
            lines.append(f"- category: {issue.category}")
            lines.append(f"- severity: {issue.severity}")
            lines.append(f"- evidence: {issue.evidence}")
            lines.append(f"- suggested_fix: {issue.suggested_fix}")
            lines.append("")
        lines.append("## Instructions")
        lines.append(
            "请根据上述 issues 的 suggested_fix 重写该段落，保持风格一致并消除连续性问题。"
        )
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # SubTask 4.2.3: critical human-review dispatch
    # ------------------------------------------------------------------

    def _dispatch_critical(
        self,
        critical_issues: list[ContinuityIssue],
        *,
        chapter_id: str,
        novel_id: str,
    ) -> int:
        """Flag critical issues for human review via ``control.novel.revision.human_required``.

        Groups issues by paragraph/chapter (same as warnings) and emits one
        human-revision request per group. Persists the records to
        ``quality_state/{novel_id}.json``. Returns the number of new
        human-revision requests emitted.
        """
        if not critical_issues:
            return 0
        groups: dict[str, list[ContinuityIssue]] = {}
        for issue in critical_issues:
            key = issue.paragraph_id or f"chapter:{chapter_id}"
            groups.setdefault(key, []).append(issue)

        emitted = 0
        for grouped in groups.values():
            paragraph_id = grouped[0].paragraph_id or ""
            human_revision_id = uuid.uuid4().hex
            requested_at = _now_iso()
            record = {
                "human_revision_id": human_revision_id,
                "paragraph_id": paragraph_id,
                "chapter_id": chapter_id,
                "novel_id": novel_id,
                "issues": [i.to_dict() for i in grouped],
                "reason": _HUMAN_REVISION_REASON,
                "requested_at": requested_at,
            }
            self._human_revisions[human_revision_id] = record
            payload = {
                "paragraph_id": paragraph_id,
                "chapter_id": chapter_id,
                "novel_id": novel_id,
                "issues": [i.to_dict() for i in grouped],
                "reason": _HUMAN_REVISION_REASON,
                "requested_at": requested_at,
                "human_revision_id": human_revision_id,
            }
            self._emit(
                topic=_TOPIC_REVISION_HUMAN_REQUIRED,
                payload=payload,
                channel="control",
            )
            emitted += 1
        # Persist human-revision records (SubTask 4.2.3).
        self._save_state()
        return emitted

    # ------------------------------------------------------------------
    # SubTask 4.2.4: quality score + report
    # ------------------------------------------------------------------

    def _compute_quality_score(self, issues: list[ContinuityIssue]) -> float:
        """Compute a quality score in ``[0.0, 1.0]`` for a batch of issues.

        Starts at 1.0 and deducts per-issue penalties:
        ``info``: -0.02, ``warning``: -0.1, ``critical``: -0.3.
        Clamped to ``[0.0, 1.0]``.
        """
        score = 1.0
        for issue in issues:
            score -= _SCORE_DEDUCTION.get(issue.severity, 0.0)
        return max(0.0, min(1.0, score))

    def _resolve_paragraph_id(
        self, issues: list[ContinuityIssue]
    ) -> str | None:
        """Return the shared ``paragraph_id`` if all issues agree, else ``None``."""
        pids = {i.paragraph_id for i in issues if i.paragraph_id}
        if len(pids) == 1:
            return next(iter(pids))
        return None

    def _emit_quality_report(
        self,
        *,
        novel_id: str,
        chapter_id: str,
        paragraph_id: str | None,
        info_count: int,
        warning_count: int,
        critical_count: int,
        score: float,
        auto_revisions: int,
        human_revisions: int,
    ) -> None:
        """Publish ``data.novel.quality.report`` + ``data.novel.quality.score``."""
        generated_at = _now_iso()
        report_payload: dict[str, Any] = {
            "novel_id": novel_id,
            "chapter_id": chapter_id or None,
            "paragraph_id": paragraph_id,
            "issues_count": {
                "info": info_count,
                "warning": warning_count,
                "critical": critical_count,
            },
            "quality_score": score,
            "generated_at": generated_at,
            "auto_revisions_initiated": auto_revisions,
            "human_revisions_initiated": human_revisions,
        }
        self._emit(
            topic=_TOPIC_QUALITY_REPORT,
            payload=report_payload,
            channel="data",
        )
        self._state.custom["quality_reports_emitted"] = (
            self._state.custom.get("quality_reports_emitted", 0) + 1
        )
        score_payload: dict[str, Any] = {
            "novel_id": novel_id,
            "chapter_id": chapter_id or None,
            "score": score,
            "timestamp": generated_at,
        }
        self._emit(
            topic=_TOPIC_QUALITY_SCORE,
            payload=score_payload,
            channel="data",
        )

    # ------------------------------------------------------------------
    # SubTask 4.2.5: feedback to Story Bible / OC Registry
    # ------------------------------------------------------------------

    def _feedback_to_story_bible(
        self,
        critical_issues: list[ContinuityIssue],
        *,
        novel_id: str,
    ) -> None:
        """Feed critical issues back to the OC registry / world manager.

        - Critical ``ooc`` issues whose ``suggested_fix`` carries OC-relevant
          info → ``data.oc.evolved`` (``evolution_reason`` =
          ``"continuity_audit_ooc"``).
        - Critical ``setting_conflict`` issues → ``data.sandbox.world.updated``
          (``update_reason`` = ``"continuity_audit_setting_conflict"``).

        Only ``critical`` issues feed back, to avoid frequent world
        perturbations from ``info`` / ``warning`` noise.
        """
        if not critical_issues:
            return
        timestamp = _now_iso()

        # OOC feedback → data.oc.evolved.
        ooc_issues = [
            i for i in critical_issues
            if i.category == "ooc" and i.suggested_fix
            and any(kw in i.suggested_fix for kw in _OC_FEEDBACK_KEYWORDS)
        ]
        if ooc_issues:
            character_id = self._extract_character_id(ooc_issues)
            source_issues = [
                f"{i.paragraph_id or 'nopid'}:ooc:{idx}"
                for idx, i in enumerate(ooc_issues)
            ]
            self._emit(
                topic=_TOPIC_OC_EVOLVED,
                payload={
                    "novel_id": novel_id,
                    "character_id": character_id,
                    "evolution_reason": "continuity_audit_ooc",
                    "source_issues": source_issues,
                    "timestamp": timestamp,
                },
                channel="data",
            )

        # Setting-conflict feedback → data.sandbox.world.updated.
        setting_issues = [
            i for i in critical_issues if i.category == "setting_conflict"
        ]
        if setting_issues:
            source_issues = [
                f"{i.paragraph_id or 'nopid'}:setting_conflict:{idx}"
                for idx, i in enumerate(setting_issues)
            ]
            self._emit(
                topic=_TOPIC_WORLD_UPDATED,
                payload={
                    "novel_id": novel_id,
                    "update_reason": "continuity_audit_setting_conflict",
                    "source_issues": source_issues,
                    "timestamp": timestamp,
                },
                channel="data",
            )

    def _extract_character_id(
        self, issues: list[ContinuityIssue]
    ) -> str | None:
        """Best-effort extraction of a character identifier from issue text.

        Looks for the pattern ``角色 '<name>'`` in ``evidence`` /
        ``suggested_fix``. Returns ``None`` if no name can be located — the
        OC registry is expected to resolve the name downstream.
        """
        for issue in issues:
            text = f"{issue.evidence} {issue.suggested_fix}"
            match = _CHARACTER_NAME_PATTERN.search(text)
            if match:
                return match.group(1)
        return None

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _coerce_issue(self, raw: Any) -> ContinuityIssue | None:
        """Coerce a bus payload entry into a :class:`ContinuityIssue`.

        Accepts a ``ContinuityIssue`` (returned as-is) or a ``dict`` (passed
        through ``ContinuityIssue.from_dict``). Unknown / malformed entries
        are dropped (``None``).
        """
        if isinstance(raw, ContinuityIssue):
            return raw
        if isinstance(raw, dict):
            try:
                return ContinuityIssue.from_dict(raw)
            except Exception:
                return None
        return None

    def _emit(
        self, *, topic: str, payload: Any, channel: str = "event"
    ) -> None:
        """Emit a bus message if a router is attached, else no-op."""
        if self._router is None:
            return
        self.emit(topic=topic, payload=payload, channel=channel)

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _load_state(self) -> None:
        """Load persisted quality state from ``self._state_path``.

        Missing / corrupt files are treated as empty state — the engine
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
        pr = data.get("pending_revisions", {}) or {}
        self._pending_revisions = {
            str(k): dict(v) for k, v in pr.items() if isinstance(v, dict)
        }
        hr = data.get("human_revisions", {}) or {}
        self._human_revisions = {
            str(k): dict(v) for k, v in hr.items() if isinstance(v, dict)
        }
        self._issue_history = list(data.get("issue_history", []) or [])
        try:
            self._last_quality_score = float(
                data.get("last_quality_score", 1.0)
            )
        except (TypeError, ValueError):
            self._last_quality_score = 1.0
        self._revised_paragraph_ids = set(
            data.get("revised_paragraph_ids", []) or []
        )
        counters = data.get("counters", {}) or {}
        if isinstance(counters, dict):
            for key, value in counters.items():
                self._state.custom[key] = value
        # Rebuild the in-flight paragraph set from pending revisions so
        # duplicate-revision guard survives restarts.
        for req in self._pending_revisions.values():
            pid = req.get("paragraph_id", "")
            if pid:
                self._revised_paragraph_ids.add(pid)

    def _save_state(self) -> None:
        """Persist quality state to ``self._state_path`` atomically.

        Uses :meth:`PersistenceManager.save_atomic` (§3.2.2) so readers
        never see a half-written file.
        """
        if not self._state_path:
            return
        data = {
            "novel_id": self._novel_id,
            "pending_revisions": self._pending_revisions,
            "human_revisions": self._human_revisions,
            "issue_history": self._issue_history,
            "last_quality_score": self._last_quality_score,
            "revised_paragraph_ids": sorted(self._revised_paragraph_ids),
            "counters": {
                "issues_processed": self._state.custom.get(
                    "issues_processed", 0
                ),
                "auto_revisions_initiated": self._state.custom.get(
                    "auto_revisions_initiated", 0
                ),
                "human_revisions_initiated": self._state.custom.get(
                    "human_revisions_initiated", 0
                ),
                "revisions_completed": self._state.custom.get(
                    "revisions_completed", 0
                ),
                "quality_reports_emitted": self._state.custom.get(
                    "quality_reports_emitted", 0
                ),
            },
            "saved_at": _now_iso(),
        }
        try:
            PersistenceManager.save_atomic(data, self._state_path)
        except OSError:
            # Persistence failures must not crash the quality pipeline.
            pass

    # ------------------------------------------------------------------
    # Module serialization (to_dict / from_dict / get_state)
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """Return a serializable snapshot of the engine's full state."""
        base = super().to_dict()
        base.update({
            "novel_id": self._novel_id,
            "quality_state_dir": self._quality_state_dir,
            "state_path": self._state_path,
            "pending_revisions": {
                k: dict(v) for k, v in self._pending_revisions.items()
            },
            "human_revisions": {
                k: dict(v) for k, v in self._human_revisions.items()
            },
            "issue_history": list(self._issue_history),
            "revised_paragraph_ids": sorted(self._revised_paragraph_ids),
            "last_quality_score": self._last_quality_score,
        })
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore engine state from a snapshot produced by :meth:`to_dict`."""
        super().from_dict(data, **kwargs)
        self._novel_id = str(data.get("novel_id", self._novel_id))
        self._quality_state_dir = str(
            data.get("quality_state_dir", self._quality_state_dir)
        )
        self._state_path = str(
            data.get("state_path")
            or os.path.join(
                self._quality_state_dir, f"{self._novel_id}.json"
            )
        )
        pr = data.get("pending_revisions", {}) or {}
        self._pending_revisions = {
            str(k): dict(v) for k, v in pr.items() if isinstance(v, dict)
        }
        hr = data.get("human_revisions", {}) or {}
        self._human_revisions = {
            str(k): dict(v) for k, v in hr.items() if isinstance(v, dict)
        }
        self._issue_history = list(data.get("issue_history", []) or [])
        try:
            self._last_quality_score = float(
                data.get("last_quality_score", 1.0)
            )
        except (TypeError, ValueError):
            self._last_quality_score = 1.0
        self._revised_paragraph_ids = set(
            data.get("revised_paragraph_ids", []) or []
        )
        self._state.custom.setdefault("novel_id", self._novel_id)

    def get_state(self) -> ModuleState:
        """Return the current module state with refreshed counters."""
        self._state.custom["novel_id"] = self._novel_id
        return self._state
