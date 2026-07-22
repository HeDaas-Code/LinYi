"""ChapterManager — volume / chapter / paragraph structure with versioning.

Per ``docs/系统重构方案_v1.md`` §3.3 and §9 (Stage 2), this module replaces
``NovelOutput``'s flat paragraph list with a three-level
``卷 (volume) → 章 (chapter) → 段 (paragraph)`` structure, adds
``ChapterVersion`` snapshots for rollback, and exposes the chapter
lifecycle state machine ``draft → audited → revised → committed``.

Subscribes to (per Task 2.1 spec — Task 2.5 will unify these topic strings
into ``topics.py``):

- ``data.novel.paragraph`` — paragraph ingestion
- ``control.novel.chapter.complete`` — explicit completion signal
- ``control.novel.chapter.commit`` — promote audited → committed
- ``control.novel.chapter.rollback`` — restore paragraphs from a version
- ``control.module.init`` — module init handshake

Publishes:

- ``event.novel.chapter.completed``
- ``event.novel.chapter.committed``
- ``event.novel.chapter.rollback``
- ``event.novel.paragraph.published`` (for downstream Memory/Identity
  subscribers that previously listened to ``NovelOutput``)

Persistence layout (per SubTask 2.1.1):

::

    chapters/{novel_id}/index.json
    chapters/{novel_id}/{volume_id}/{chapter_id}/chapter.json
    chapters/{novel_id}/{volume_id}/{chapter_id}/paragraphs/{N}.json
    chapters/{novel_id}/{volume_id}/{chapter_id}/versions/v{N}.json

All writes go through :meth:`PersistenceManager.save_atomic` to guarantee
atomicity (§3.2.2).
"""

from __future__ import annotations

import datetime
import json
import os
import time
import uuid
from typing import Any

from src.novelist_brain.models import (
    BusMessage,
    Chapter,
    ChapterIntent,
    ChapterVersion,
    ModuleState,
    Paragraph,
    TickDelta,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import PersistenceManager


# Default target paragraph count when ``create_chapter`` is called without
# an explicit ``target_paragraph_count``.
_DEFAULT_TARGET_PARAGRAPHS = 10

# Topic string literals (Task 2.5 will unify these into ``topics.py``).
_TOPIC_PARAGRAPH = "data.novel.paragraph"
_TOPIC_CHAPTER_COMPLETE = "control.novel.chapter.complete"
_TOPIC_CHAPTER_COMMIT = "control.novel.chapter.commit"
_TOPIC_CHAPTER_ROLLBACK = "control.novel.chapter.rollback"
_TOPIC_MODULE_INIT = "control.module.init"

_TOPIC_EVENT_PARAGRAPH_PUBLISHED = "event.novel.paragraph.published"
_TOPIC_EVENT_CHAPTER_COMPLETED = "event.novel.chapter.completed"
_TOPIC_EVENT_CHAPTER_COMMITTED = "event.novel.chapter.committed"
_TOPIC_EVENT_CHAPTER_ROLLBACK = "event.novel.chapter.rollback"


class ChapterManager(Module):
    """Manages the volume → chapter → paragraph structure with versioning.

    State:
        - ``novel_id``: str (defaults to ``"linyi_default"``)
        - ``chapters_dir``: root directory for chapter files
          (defaults to ``"chapters"``)
        - ``max_versions``: per-chapter version history cap (default 20)
        - ``_chapters``: ``dict[str, Chapter]`` keyed by ``chapter_id``
        - ``_chapter_targets``: ``dict[str, int]`` — target paragraph count
          per chapter (``Chapter`` dataclass has no such field, so we keep
          it here as manager-side metadata)
        - ``_chapter_order``: ``list[str]`` of chapter_ids in creation
          order (used to find the most recent draft chapter)
    """

    def __init__(
        self,
        name: str = "chapter_manager",
        novel_id: str = "linyi_default",
        chapters_dir: str = "chapters",
        max_versions: int = 20,
    ) -> None:
        super().__init__(name)
        self._novel_id: str = novel_id
        self._chapters_dir: str = chapters_dir
        self._max_versions: int = int(max_versions)
        self._chapters: dict[str, Chapter] = {}
        self._chapter_targets: dict[str, int] = {}
        self._chapter_order: list[str] = []

        self.subscribe(
            _TOPIC_PARAGRAPH,
            _TOPIC_CHAPTER_COMPLETE,
            _TOPIC_CHAPTER_COMMIT,
            _TOPIC_CHAPTER_ROLLBACK,
            _TOPIC_MODULE_INIT,
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "chapter_manager",
            "version": "0.1.0",
            "description": (
                "Volume/chapter/paragraph structure with version control "
                "and rollback (replaces NovelOutput flat paragraphs)"
            ),
            "dependencies": [],
            "category": "novel_output",
        }

    def _initial_state(self) -> ModuleState:
        # NOTE: ``self._novel_id`` is NOT yet set when the parent ``Module``
        # constructor calls this method (it runs before our ``__init__`` body
        # assigns ``self._novel_id``). Use a literal default here; ``init()``
        # and ``from_dict()`` refresh ``state.custom["novel_id"]`` afterwards.
        return ModuleState(
            active=True,
            energy_cost=0.1,
            custom={
                "chapter_count": 0,
                "paragraph_count": 0,
                "committed_count": 0,
                "novel_id": "linyi_default",
            },
        )

    # ------------------------------------------------------------------
    # Lifecycle (Module interface)
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        """Initialize from agent context.

        Expected context keys:

        - ``novel_v2``: ``{'novel_id': str, 'chapter_dir': str}`` —
          overrides the constructor defaults if present.
        """
        novel_v2 = context.get("novel_v2", {}) or {}
        if not isinstance(novel_v2, dict):
            novel_v2 = {}
        if novel_v2.get("novel_id"):
            self._novel_id = str(novel_v2["novel_id"])
        if novel_v2.get("chapter_dir"):
            self._chapters_dir = str(novel_v2["chapter_dir"])

        self._load_index()
        self._state.custom["novel_id"] = self._novel_id
        self._state.custom["chapter_count"] = len(self._chapters)
        self._state.custom["paragraph_count"] = sum(
            len(c.paragraphs) for c in self._chapters.values()
        )
        self._state.custom["committed_count"] = sum(
            1 for c in self._chapters.values() if c.status == "committed"
        )

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        payload = message.payload
        if topic == _TOPIC_PARAGRAPH:
            self._handle_paragraph(payload)
        elif topic == _TOPIC_CHAPTER_COMPLETE:
            self._handle_complete(payload)
        elif topic == _TOPIC_CHAPTER_COMMIT:
            self._handle_commit(payload)
        elif topic == _TOPIC_CHAPTER_ROLLBACK:
            self._handle_rollback(payload)
        elif topic == _TOPIC_MODULE_INIT:
            # Init handshake — already initialized via ``init()``.
            pass

    def tick(self, delta: TickDelta) -> None:
        """Advance chapter bookkeeping; auto-complete chapters that hit target."""
        self._state.last_tick = delta.absolute_time
        active = self.get_current_chapter()
        if active is None or active.status != "draft":
            return
        target = self._chapter_targets.get(active.chapter_id, 0)
        if target <= 0:
            return
        if len(active.paragraphs) >= target:
            self._trigger_complete(
                active.chapter_id, reason="target_reached"
            )

    # ------------------------------------------------------------------
    # SubTask 2.1.2: Paragraph handling
    # ------------------------------------------------------------------

    def _handle_paragraph(self, payload: Any) -> None:
        """Handle ``data.novel.paragraph``: append paragraph to a chapter."""
        if payload is None:
            return
        # Accept plain string, dict, or Paragraph object.
        if isinstance(payload, Paragraph):
            payload = {"paragraph": payload}
        if isinstance(payload, str):
            payload = {"paragraph": payload}
        if not isinstance(payload, dict):
            return

        chapter_id = payload.get("chapter_id")
        paragraph_payload = payload.get("paragraph")
        if paragraph_payload is None:
            # Some senders use ``content`` directly.
            content = payload.get("content")
            if content is None:
                return
            paragraph_payload = {"content": str(content)}

        paragraph = self._coerce_paragraph(paragraph_payload)
        if paragraph is None:
            return

        # Resolve target chapter: explicit chapter_id wins, else current draft.
        chapter: Chapter | None = None
        if chapter_id and isinstance(chapter_id, str):
            chapter = self._chapters.get(chapter_id)
            if chapter is None:
                # Auto-create with default settings so paragraph ingestion
                # never silently drops content. Explicit ``create_chapter``
                # should be preferred for non-default targets.
                chapter = self.create_chapter(
                    volume_id="v1",
                    chapter_id=chapter_id,
                    intent=None,
                    target_paragraph_count=_DEFAULT_TARGET_PARAGRAPHS,
                )
        else:
            chapter = self.get_current_chapter()
            if chapter is None:
                # No active draft — auto-create one so we don't drop paragraphs.
                chapter = self.create_chapter(
                    volume_id="v1",
                    chapter_id=self._auto_chapter_id(),
                    intent=None,
                    target_paragraph_count=_DEFAULT_TARGET_PARAGRAPHS,
                )

        if not paragraph.chapter_id:
            paragraph.chapter_id = chapter.chapter_id

        # Append, persist paragraph file, refresh chapter metadata + index.
        chapter.paragraphs.append(paragraph)
        para_index = len(chapter.paragraphs)  # 1-indexed
        self._save_paragraph(chapter, para_index, paragraph)
        self._save_chapter_metadata(chapter)
        self._save_index()

        # Emit publication event for downstream consumers (Memory /
        # IdentityCore / future ContinuityAuditor).
        self._emit(
            topic=_TOPIC_EVENT_PARAGRAPH_PUBLISHED,
            payload={
                "paragraph": paragraph.to_dict(),
                "chapter_id": chapter.chapter_id,
                "volume_id": chapter.volume_id,
                "index": para_index - 1,
                "paragraph_count": len(chapter.paragraphs),
                "title": chapter.title,
            },
            channel="event",
            priority=7,
        )

        self._state.custom["paragraph_count"] = sum(
            len(c.paragraphs) for c in self._chapters.values()
        )

    def _coerce_paragraph(self, value: Any) -> Paragraph | None:
        """Coerce a payload value into a :class:`Paragraph` (or ``None``)."""
        if value is None:
            return None
        if isinstance(value, Paragraph):
            return value
        if isinstance(value, str):
            return Paragraph(content=value)
        if isinstance(value, dict):
            try:
                return Paragraph.from_dict(value)
            except Exception:
                content = value.get("content") or value.get("text") or ""
                if not content:
                    return None
                return Paragraph(content=str(content))
        return None

    def _auto_chapter_id(self) -> str:
        """Generate a unique chapter id like ``c1``, ``c2``, ..."""
        existing = set(self._chapters.keys())
        n = len(self._chapters) + 1
        cid = f"c{n}"
        while cid in existing:
            n += 1
            cid = f"c{n}"
        return cid

    # ------------------------------------------------------------------
    # SubTask 2.1.3: Complete / Commit
    # ------------------------------------------------------------------

    def _handle_complete(self, payload: Any) -> None:
        """Handle ``control.novel.chapter.complete``."""
        if not isinstance(payload, dict):
            return
        chapter_id = payload.get("chapter_id")
        if not chapter_id or not isinstance(chapter_id, str):
            chapter = self.get_current_chapter()
            if chapter is None:
                return
            chapter_id = chapter.chapter_id
        reason = str(payload.get("reason", "explicit_signal"))
        self._trigger_complete(chapter_id, reason=reason)

    def _trigger_complete(self, chapter_id: str, reason: str) -> None:
        """Transition a chapter from ``draft`` (or ``revised``) → ``audited``.

        Emits ``event.novel.chapter.completed``. Idempotent: chapters that
        are already ``audited`` / ``committed`` are left untouched.
        """
        chapter = self._chapters.get(chapter_id)
        if chapter is None:
            return
        if chapter.status not in ("draft", "revised"):
            return
        chapter.status = "audited"
        self._save_chapter_metadata(chapter)
        self._save_index()
        self._emit(
            topic=_TOPIC_EVENT_CHAPTER_COMPLETED,
            payload={
                "chapter_id": chapter.chapter_id,
                "volume_id": chapter.volume_id,
                "paragraph_count": len(chapter.paragraphs),
                "target_paragraph_count": self._chapter_targets.get(
                    chapter_id, 0
                ),
                "reason": reason,
            },
            channel="event",
            priority=7,
        )

    def _handle_commit(self, payload: Any) -> None:
        """Handle ``control.novel.chapter.commit``.

        Promotes a chapter from ``audited`` / ``revised`` / ``draft`` →
        ``committed``, snapshots a :class:`ChapterVersion`, and emits
        ``event.novel.chapter.committed``.
        """
        if not isinstance(payload, dict):
            return
        chapter_id = payload.get("chapter_id")
        if not chapter_id or not isinstance(chapter_id, str):
            chapter = self.get_current_chapter()
            if chapter is None:
                return
            chapter_id = chapter.chapter_id
        chapter = self._chapters.get(chapter_id)
        if chapter is None:
            return
        if chapter.status not in ("audited", "revised", "draft"):
            return
        reason = str(payload.get("reason", "audit_passed"))
        audit_metadata = payload.get("audit_metadata", {})
        if not isinstance(audit_metadata, dict):
            audit_metadata = {}

        # Snapshot current paragraphs into a ChapterVersion.
        version = ChapterVersion(
            version_id=self._make_version_id(),
            created_at=time.time(),
            paragraphs=[
                Paragraph.from_dict(p.to_dict()) for p in chapter.paragraphs
            ],
            intent=chapter.intent,
            change_summary=f"commit: {reason}",
        )
        chapter.versions.append(version)
        self._prune_versions(chapter)
        chapter.status = "committed"
        chapter.committed_at = time.time()

        # Persist version snapshot first (uses position-based numbering).
        self._save_version(chapter, version)
        self._save_chapter_metadata(chapter)
        self._save_index()

        self._state.custom["committed_count"] = sum(
            1 for c in self._chapters.values() if c.status == "committed"
        )
        self._emit(
            topic=_TOPIC_EVENT_CHAPTER_COMMITTED,
            payload={
                "chapter_id": chapter.chapter_id,
                "volume_id": chapter.volume_id,
                "version_id": version.version_id,
                "version_number": self._version_number(chapter, version),
                "paragraph_count": len(chapter.paragraphs),
                "reason": reason,
                "audit_metadata": audit_metadata,
            },
            channel="event",
            priority=7,
        )

    # ------------------------------------------------------------------
    # SubTask 2.1.4: Rollback
    # ------------------------------------------------------------------

    def _handle_rollback(self, payload: Any) -> None:
        """Handle ``control.novel.chapter.rollback``.

        Payload: ``{'chapter_id': str, 'target_version': int | str}``.

        - ``int`` is 1-indexed position in ``chapter.versions``.
        - ``str`` is matched against ``ChapterVersion.version_id``.

        Restores the chapter's paragraphs from the target version, sets
        status → ``revised``, appends a new ``ChapterVersion`` recording
        the rollback, and emits ``event.novel.chapter.rollback``.
        """
        if not isinstance(payload, dict):
            return
        chapter_id = payload.get("chapter_id")
        if not chapter_id or not isinstance(chapter_id, str):
            return
        chapter = self._chapters.get(chapter_id)
        if chapter is None:
            return
        target_version = payload.get("target_version")
        if target_version is None:
            return

        target_version_obj = self._resolve_version(chapter, target_version)
        if target_version_obj is None:
            return

        # Replace current paragraphs with a deep copy of the target version's.
        chapter.paragraphs = [
            Paragraph.from_dict(p.to_dict())
            for p in target_version_obj.paragraphs
        ]
        previous_status = chapter.status
        chapter.status = "revised"
        chapter.committed_at = None

        # Record the rollback as a new ChapterVersion.
        rollback_version = ChapterVersion(
            version_id=self._make_version_id(),
            created_at=time.time(),
            paragraphs=[
                Paragraph.from_dict(p.to_dict()) for p in chapter.paragraphs
            ],
            intent=chapter.intent,
            change_summary=(
                f"rollback to {target_version_obj.version_id}"
            ),
        )
        chapter.versions.append(rollback_version)
        self._prune_versions(chapter)

        # Persist: rewrite all paragraph files (since they changed),
        # save the new rollback version, refresh chapter metadata + index.
        self._rewrite_paragraphs(chapter)
        self._save_version(chapter, rollback_version)
        self._save_chapter_metadata(chapter)
        self._save_index()

        self._emit(
            topic=_TOPIC_EVENT_CHAPTER_ROLLBACK,
            payload={
                "chapter_id": chapter.chapter_id,
                "volume_id": chapter.volume_id,
                "target_version_id": target_version_obj.version_id,
                "target_version_number": self._version_number(
                    chapter, target_version_obj
                ),
                "previous_status": previous_status,
                "new_status": chapter.status,
                "new_version_id": rollback_version.version_id,
                "paragraph_count": len(chapter.paragraphs),
            },
            channel="event",
            priority=7,
        )

    def _resolve_version(
        self, chapter: Chapter, target: Any
    ) -> ChapterVersion | None:
        """Resolve ``target`` to a :class:`ChapterVersion` in ``chapter``.

        Accepts a 1-indexed ``int`` position or a ``str`` ``version_id``.
        """
        if not chapter.versions:
            return None
        if isinstance(target, bool):
            # ``bool`` is a subclass of ``int`` — guard against True/False.
            return None
        if isinstance(target, int):
            if target < 1 or target > len(chapter.versions):
                return None
            return chapter.versions[target - 1]
        if isinstance(target, str):
            for v in chapter.versions:
                if v.version_id == target:
                    return v
        return None

    def _version_number(self, chapter: Chapter, version: ChapterVersion) -> int:
        """Return the 1-indexed position of ``version`` in ``chapter.versions``."""
        for i, v in enumerate(chapter.versions):
            if v.version_id == version.version_id:
                return i + 1
        return 0

    def _prune_versions(self, chapter: Chapter) -> None:
        """Keep at most ``self._max_versions`` versions; renumber remaining.

        Oldest versions are dropped first (FIFO). After pruning, all
        remaining version files are rewritten so their ``v{N}.json``
        filenames match their new 1-indexed position in the list.
        """
        if len(chapter.versions) <= self._max_versions:
            return
        while len(chapter.versions) > self._max_versions:
            chapter.versions.pop(0)
        # Clear existing version files and re-save with new numbering.
        versions_dir = self._versions_dir(chapter)
        if os.path.isdir(versions_dir):
            for fname in os.listdir(versions_dir):
                if not fname.endswith(".json") or fname.endswith(".tmp"):
                    continue
                try:
                    os.remove(os.path.join(versions_dir, fname))
                except OSError:
                    pass
        for v in chapter.versions:
            self._save_version(chapter, v)

    # ------------------------------------------------------------------
    # SubTask 2.1.5: Public API
    # ------------------------------------------------------------------

    def create_chapter(
        self,
        volume_id: str,
        chapter_id: str,
        intent: ChapterIntent | None = None,
        target_paragraph_count: int = _DEFAULT_TARGET_PARAGRAPHS,
        title: str = "",
        index: int | None = None,
    ) -> Chapter:
        """Create a new chapter and persist it.

        If a chapter with the same ``chapter_id`` already exists, return
        the existing instance unchanged (idempotent).
        """
        if chapter_id in self._chapters:
            return self._chapters[chapter_id]
        if index is None:
            existing_indices = [
                c.index for c in self._chapters.values()
                if c.volume_id == volume_id
            ]
            index = (max(existing_indices) + 1) if existing_indices else 1
        chapter = Chapter(
            chapter_id=chapter_id,
            volume_id=volume_id,
            index=index,
            title=title or chapter_id,
            intent=intent,
            paragraphs=[],
            status="draft",
            versions=[],
            created_at=time.time(),
            committed_at=None,
        )
        self._chapters[chapter_id] = chapter
        self._chapter_targets[chapter_id] = int(target_paragraph_count)
        if chapter_id not in self._chapter_order:
            self._chapter_order.append(chapter_id)
        self._save_chapter_metadata(chapter)
        self._save_index()
        self._state.custom["chapter_count"] = len(self._chapters)
        return chapter

    def get_chapter(self, chapter_id: str) -> Chapter | None:
        """Return the chapter for ``chapter_id``, or ``None`` if not found."""
        return self._chapters.get(chapter_id)

    def get_current_chapter(self) -> Chapter | None:
        """Return the most recently created ``draft`` chapter, or ``None``.

        Per SubTask 2.1.2: when ``data.novel.paragraph`` arrives without
        a ``chapter_id``, it is attributed to the "current active chapter",
        defined as the most recently created chapter with ``status='draft'``.
        """
        for cid in reversed(self._chapter_order):
            chapter = self._chapters.get(cid)
            if chapter is not None and chapter.status == "draft":
                return chapter
        return None

    def list_versions(self, chapter_id: str) -> list[ChapterVersion]:
        """Return all versions of ``chapter_id`` (oldest first)."""
        chapter = self._chapters.get(chapter_id)
        if chapter is None:
            return []
        return list(chapter.versions)

    def get_version(
        self, chapter_id: str, version_id: str
    ) -> ChapterVersion | None:
        """Return a specific version by ``version_id``, or ``None``."""
        chapter = self._chapters.get(chapter_id)
        if chapter is None:
            return None
        for v in chapter.versions:
            if v.version_id == version_id:
                return v
        return None

    # ------------------------------------------------------------------
    # Persistence (SubTask 2.1.1)
    # ------------------------------------------------------------------

    def _novel_root(self) -> str:
        return os.path.join(self._chapters_dir, self._novel_id)

    def _chapter_dir(self, chapter: Chapter) -> str:
        return os.path.join(
            self._novel_root(), chapter.volume_id, chapter.chapter_id
        )

    def _chapter_metadata_path(self, chapter: Chapter) -> str:
        return os.path.join(self._chapter_dir(chapter), "chapter.json")

    def _paragraphs_dir(self, chapter: Chapter) -> str:
        return os.path.join(self._chapter_dir(chapter), "paragraphs")

    def _paragraph_path(self, chapter: Chapter, n: int) -> str:
        return os.path.join(self._paragraphs_dir(chapter), f"{n}.json")

    def _versions_dir(self, chapter: Chapter) -> str:
        return os.path.join(self._chapter_dir(chapter), "versions")

    def _index_path(self) -> str:
        return os.path.join(self._novel_root(), "index.json")

    def _save_chapter_metadata(self, chapter: Chapter) -> None:
        """Write ``chapter.json`` (metadata only; paragraphs/versions are
        persisted in their own files)."""
        data = chapter.to_dict()
        # Strip paragraphs and versions — they live in their own files.
        data.pop("paragraphs", None)
        data.pop("versions", None)
        data["paragraph_count"] = len(chapter.paragraphs)
        data["version_count"] = len(chapter.versions)
        data["target_paragraph_count"] = self._chapter_targets.get(
            chapter.chapter_id, 0
        )
        data["word_count"] = self._word_count(chapter)
        data["saved_at"] = datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat()
        PersistenceManager.save_atomic(
            data, self._chapter_metadata_path(chapter)
        )

    def _save_paragraph(
        self, chapter: Chapter, n: int, paragraph: Paragraph
    ) -> None:
        """Write ``paragraphs/{N}.json`` (1-indexed ``N``)."""
        path = self._paragraph_path(chapter, n)
        data = paragraph.to_dict()
        data["index"] = n
        data["saved_at"] = datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat()
        PersistenceManager.save_atomic(data, path)

    def _rewrite_paragraphs(self, chapter: Chapter) -> None:
        """Rewrite all paragraph files for ``chapter`` (used after rollback).

        Removes any ``paragraphs/{N}.json`` files that are no longer
        needed (i.e. their index exceeds the new paragraph count).
        """
        paras_dir = self._paragraphs_dir(chapter)
        if os.path.isdir(paras_dir):
            needed = {f"{i + 1}.json" for i in range(len(chapter.paragraphs))}
            for fname in list(os.listdir(paras_dir)):
                if not fname.endswith(".json") or fname.endswith(".tmp"):
                    continue
                if fname not in needed:
                    try:
                        os.remove(os.path.join(paras_dir, fname))
                    except OSError:
                        pass
        for i, para in enumerate(chapter.paragraphs):
            self._save_paragraph(chapter, i + 1, para)

    def _save_version(
        self, chapter: Chapter, version: ChapterVersion
    ) -> None:
        """Write ``versions/v{N}.json`` for ``version``.

        ``N`` is the 1-indexed position of ``version`` in
        ``chapter.versions``. Extra metadata (``chapter_id``,
        ``volume_id``, ``version_number``, ``chapter_status``) is included
        in the persisted JSON for cross-reference; only the standard
        :class:`ChapterVersion` fields are loaded back into memory.
        """
        version_num = self._version_number(chapter, version)
        if version_num == 0:
            return  # not in versions list — nothing to persist
        path = os.path.join(
            self._versions_dir(chapter), f"v{version_num}.json"
        )
        data = version.to_dict()
        data["chapter_id"] = chapter.chapter_id
        data["volume_id"] = chapter.volume_id
        data["version_number"] = version_num
        data["chapter_status"] = chapter.status
        data["saved_at"] = datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat()
        PersistenceManager.save_atomic(data, path)

    def _save_index(self) -> None:
        """Write ``chapters/{novel_id}/index.json`` with chapter overview."""
        volumes: dict[str, Any] = {}
        for chapter_id in self._chapter_order:
            chapter = self._chapters.get(chapter_id)
            if chapter is None:
                continue
            vol = volumes.setdefault(
                chapter.volume_id,
                {"volume_id": chapter.volume_id, "chapters": []},
            )
            vol["chapters"].append(
                {
                    "chapter_id": chapter.chapter_id,
                    "index": chapter.index,
                    "title": chapter.title,
                    "status": chapter.status,
                    "paragraph_count": len(chapter.paragraphs),
                    "word_count": self._word_count(chapter),
                    "target_paragraph_count": self._chapter_targets.get(
                        chapter_id, 0
                    ),
                    "version_count": len(chapter.versions),
                    "created_at": chapter.created_at,
                    "committed_at": chapter.committed_at,
                }
            )
        data = {
            "novel_id": self._novel_id,
            "saved_at": datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat(),
            "chapter_count": len(self._chapters),
            "chapter_order": list(self._chapter_order),
            "chapter_targets": dict(self._chapter_targets),
            "volumes": volumes,
        }
        PersistenceManager.save_atomic(data, self._index_path())

    def _word_count(self, chapter: Chapter) -> int:
        """Return total non-whitespace character count across all paragraphs."""
        total = 0
        for p in chapter.paragraphs:
            content = p.content or ""
            total += sum(1 for ch in content if not ch.isspace())
        return total

    def _load_index(self) -> None:
        """Restore chapter index and per-chapter state from disk.

        Reads ``index.json`` for the overview, then loads each chapter's
        ``chapter.json`` + ``paragraphs/*.json`` + ``versions/v*.json``
        files to fully reconstruct in-memory state.
        """
        index_path = self._index_path()
        if not os.path.isfile(index_path):
            return
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                index_data = json.load(f)
        except (OSError, json.JSONDecodeError):
            return
        if not isinstance(index_data, dict):
            return

        if index_data.get("novel_id"):
            self._novel_id = str(index_data["novel_id"])

        targets = index_data.get("chapter_targets", {})
        if isinstance(targets, dict):
            self._chapter_targets = {
                str(k): int(v) for k, v in targets.items() if v is not None
            }
        order = index_data.get("chapter_order", [])
        if isinstance(order, list):
            self._chapter_order = [str(x) for x in order]

        volumes = index_data.get("volumes", {})
        if not isinstance(volumes, dict):
            return
        # Walk volumes in deterministic (sorted) order for reproducibility.
        for volume_id in sorted(volumes.keys()):
            vol_data = volumes[volume_id]
            if not isinstance(vol_data, dict):
                continue
            chapters_list = vol_data.get("chapters", [])
            if not isinstance(chapters_list, list):
                continue
            for ch_meta in chapters_list:
                if not isinstance(ch_meta, dict):
                    continue
                chapter_id = ch_meta.get("chapter_id")
                if not chapter_id or not isinstance(chapter_id, str):
                    continue
                chapter = self._load_chapter(volume_id, chapter_id)
                if chapter is not None:
                    self._chapters[chapter_id] = chapter

        # Reconcile chapter_order: include any loaded chapters that were
        # missing from the index order, and drop any stale entries.
        for cid in self._chapters.keys():
            if cid not in self._chapter_order:
                self._chapter_order.append(cid)
        self._chapter_order = [
            cid for cid in self._chapter_order if cid in self._chapters
        ]

    def _load_chapter(
        self, volume_id: str, chapter_id: str
    ) -> Chapter | None:
        """Load a single chapter (metadata + paragraphs + versions) from disk."""
        chapter_dir = os.path.join(
            self._novel_root(), volume_id, chapter_id
        )
        meta_path = os.path.join(chapter_dir, "chapter.json")
        if not os.path.isfile(meta_path):
            return None
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(meta, dict):
            return None
        try:
            chapter = Chapter.from_dict(meta)
        except Exception:
            return None

        # Load paragraphs in numeric order.
        chapter.paragraphs = []
        paras_dir = os.path.join(chapter_dir, "paragraphs")
        if os.path.isdir(paras_dir):
            para_files: list[tuple[int, str]] = []
            for fname in os.listdir(paras_dir):
                if not fname.endswith(".json") or fname.endswith(".tmp"):
                    continue
                try:
                    n = int(fname[:-5])
                except ValueError:
                    continue
                para_files.append((n, os.path.join(paras_dir, fname)))
            para_files.sort(key=lambda x: x[0])
            for _n, path in para_files:
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        pdata = json.load(f)
                    if isinstance(pdata, dict):
                        chapter.paragraphs.append(Paragraph.from_dict(pdata))
                except (OSError, json.JSONDecodeError, Exception):
                    continue

        # Load versions in numeric order (v1.json, v2.json, ...).
        chapter.versions = []
        versions_dir = os.path.join(chapter_dir, "versions")
        if os.path.isdir(versions_dir):
            version_files: list[tuple[int, str]] = []
            for fname in os.listdir(versions_dir):
                if not fname.endswith(".json") or fname.endswith(".tmp"):
                    continue
                if not fname.startswith("v"):
                    continue
                try:
                    n = int(fname[1:-5])
                except ValueError:
                    continue
                version_files.append((n, os.path.join(versions_dir, fname)))
            version_files.sort(key=lambda x: x[0])
            for _n, path in version_files:
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        vdata = json.load(f)
                    if isinstance(vdata, dict):
                        chapter.versions.append(
                            ChapterVersion.from_dict(vdata)
                        )
                except (OSError, json.JSONDecodeError, Exception):
                    continue
        return chapter

    def _make_version_id(self) -> str:
        return str(uuid.uuid4())[:8]

    # ------------------------------------------------------------------
    # Emit helper
    # ------------------------------------------------------------------

    def _emit(
        self,
        *,
        topic: str,
        payload: Any,
        channel: str = "event",
        priority: int = 5,
    ) -> None:
        """Emit a bus message if a router is attached, else no-op."""
        if self._router is None:
            return
        self.emit(
            topic=topic,
            payload=payload,
            channel=channel,
            priority=priority,
        )

    # ------------------------------------------------------------------
    # State serialization (to_dict / from_dict / get_state)
    # ------------------------------------------------------------------

    def get_state(self) -> dict[str, Any]:
        """Return a serializable snapshot of chapter manager state."""
        return {
            "active": self._state.active,
            "energy_cost": self._state.energy_cost,
            "last_tick": self._state.last_tick,
            "novel_id": self._novel_id,
            "chapters_dir": self._chapters_dir,
            "chapter_count": len(self._chapters),
            "paragraph_count": sum(
                len(c.paragraphs) for c in self._chapters.values()
            ),
            "committed_count": sum(
                1 for c in self._chapters.values() if c.status == "committed"
            ),
            "draft_count": sum(
                1 for c in self._chapters.values() if c.status == "draft"
            ),
            "audited_count": sum(
                1 for c in self._chapters.values() if c.status == "audited"
            ),
            "revised_count": sum(
                1 for c in self._chapters.values() if c.status == "revised"
            ),
        }

    def to_dict(self) -> dict[str, Any]:
        """Serialize chapter manager state for checkpointing."""
        base = super().to_dict()
        base.update(
            {
                "novel_id": self._novel_id,
                "chapters_dir": self._chapters_dir,
                "max_versions": self._max_versions,
                "chapter_order": list(self._chapter_order),
                "chapter_targets": dict(self._chapter_targets),
                "chapters": {
                    cid: c.to_dict() for cid, c in self._chapters.items()
                },
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore chapter manager state from a checkpoint dict."""
        super().from_dict(data, **kwargs)
        self._novel_id = data.get("novel_id", self._novel_id)
        self._chapters_dir = data.get("chapters_dir", self._chapters_dir)
        self._max_versions = int(data.get("max_versions", self._max_versions))
        self._chapter_order = list(data.get("chapter_order", []))
        targets = data.get("chapter_targets", {})
        if isinstance(targets, dict):
            self._chapter_targets = {
                str(k): int(v) for k, v in targets.items() if v is not None
            }
        chapters_data = data.get("chapters", {})
        if not isinstance(chapters_data, dict):
            chapters_data = {}
        self._chapters = {}
        for cid, cdata in chapters_data.items():
            if not isinstance(cdata, dict):
                continue
            try:
                self._chapters[cid] = Chapter.from_dict(cdata)
            except Exception:
                continue
        # Reconcile chapter_order with loaded chapters.
        for cid in self._chapters.keys():
            if cid not in self._chapter_order:
                self._chapter_order.append(cid)
        self._chapter_order = [
            cid for cid in self._chapter_order if cid in self._chapters
        ]
        self._state.custom["novel_id"] = self._novel_id
        self._state.custom["chapter_count"] = len(self._chapters)
        self._state.custom["paragraph_count"] = sum(
            len(c.paragraphs) for c in self._chapters.values()
        )
        self._state.custom["committed_count"] = sum(
            1 for c in self._chapters.values() if c.status == "committed"
        )
