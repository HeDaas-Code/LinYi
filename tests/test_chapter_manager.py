"""Unit tests for ``ChapterManager`` (Task 2.7.1 + 2.7.3).

Covers SubTask 2.1.1–2.1.5 of the refactor-novelist-system-v1 spec:
paragraph attribution, chapter completion / commit lifecycle, version
snapshots, rollback (by int position and by version_id string), FIFO
version pruning, persistence, and ``to_dict`` / ``from_dict`` round-trip.

The tests follow the actual ``chapter_manager.py`` implementation. Per
``models.py``, ``ChapterVersion`` exposes ``version_id`` / ``created_at``
/ ``paragraphs`` / ``intent`` / ``change_summary`` — the spec template's
``reason`` / ``audit_metadata`` fields are not present on the dataclass,
so we assert against ``change_summary`` instead.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.chapter_manager import ChapterManager
from src.novelist_brain.llm import MockLLMService
from src.novelist_brain.models import (
    BusMessage,
    Chapter,
    ChapterIntent,
    ChapterVersion,
    Paragraph,
    TickDelta,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_manager(
    tmp_path: Path,
    *,
    novel_id: str = "test_novel",
    max_versions: int = 20,
    llm: MockLLMService | None = None,
) -> tuple[ChapterManager, BusRouter]:
    """Build a ``ChapterManager`` registered to a fresh ``BusRouter``.

    The chapters directory is pointed at ``tmp_path / "chapters"`` so each
    test is isolated from the real workspace filesystem. A real
    ``MockLLMService`` is plumbed through the init context per the task
    requirement (ChapterManager itself does not consume LLM output, but
    downstream Stage-2 modules do).
    """
    chapters_dir = str(tmp_path / "chapters")
    manager = ChapterManager(
        novel_id=novel_id,
        chapters_dir=chapters_dir,
        max_versions=max_versions,
    )
    router = BusRouter()
    manager.register(router)
    manager.init(
        {
            "novel_v2": {"novel_id": novel_id, "chapter_dir": chapters_dir},
            "llm": llm if llm is not None else MockLLMService(seed=42),
        }
    )
    return manager, router


def _drain(router: BusRouter, max_rounds: int = 12) -> list[BusMessage]:
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


def _publish(
    router: BusRouter,
    *,
    topic: str,
    payload: Any,
    channel: str = "data",
) -> None:
    router.publish(source="test", topic=topic, channel=channel, payload=payload)


def _make_tick(t: float = 0.0) -> TickDelta:
    return TickDelta(absolute_time=t, delta_ms=10.0, phase="deep_night")


def _read_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _paragraph_contents(chapter: Chapter) -> list[str]:
    return [p.content for p in chapter.paragraphs]


# ---------------------------------------------------------------------------
# SubTask 2.7.1 — Paragraph attribution
# ---------------------------------------------------------------------------


class TestParagraphAttribution:
    def test_create_chapter_creates_draft_chapter_with_index_persistence(
        self, tmp_path: Path
    ) -> None:
        manager, _ = _make_manager(tmp_path)
        chapter = manager.create_chapter(volume_id="v1", chapter_id="c1")

        assert chapter.chapter_id == "c1"
        assert chapter.volume_id == "v1"
        assert chapter.status == "draft"
        assert chapter.index == 1
        assert chapter.paragraphs == []
        assert chapter.versions == []

        # index.json should record the new chapter, and chapter.json should
        # exist on disk.
        index_path = tmp_path / "chapters" / "test_novel" / "index.json"
        meta_path = (
            tmp_path / "chapters" / "test_novel" / "v1" / "c1" / "chapter.json"
        )
        assert index_path.is_file()
        assert meta_path.is_file()
        index_data = _read_json(index_path)
        assert index_data["novel_id"] == "test_novel"
        assert index_data["chapter_count"] == 1
        assert "c1" in index_data["chapter_order"]
        meta = _read_json(meta_path)
        assert meta["chapter_id"] == "c1"
        assert meta["status"] == "draft"
        assert meta["index"] == 1

    def test_paragraph_with_explicit_chapter_id_is_attributed_correctly(
        self, tmp_path: Path
    ) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")

        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "hello world"},
        )
        delivered = _drain(router)

        chapter = manager.get_chapter("c1")
        assert chapter is not None
        assert len(chapter.paragraphs) == 1
        assert chapter.paragraphs[0].content == "hello world"
        assert chapter.paragraphs[0].chapter_id == "c1"

        # An event.novel.paragraph.published should have been emitted with
        # the resolved chapter_id and a 0-indexed paragraph index.
        published = [
            m for m in delivered if m.topic == "event.novel.paragraph.published"
        ]
        assert len(published) == 1
        assert published[0].payload["chapter_id"] == "c1"
        assert published[0].payload["index"] == 0
        assert published[0].payload["paragraph_count"] == 1

    def test_paragraph_without_chapter_id_goes_to_current_draft_chapter(
        self, tmp_path: Path
    ) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        manager.create_chapter(volume_id="v1", chapter_id="c2")

        # No chapter_id in payload — should go to the most recent draft (c2).
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"paragraph": "orphan paragraph"},
        )
        _drain(router)

        c1 = manager.get_chapter("c1")
        c2 = manager.get_chapter("c2")
        assert c1 is not None and c2 is not None
        assert len(c1.paragraphs) == 0
        assert len(c2.paragraphs) == 1
        assert c2.paragraphs[0].content == "orphan paragraph"
        assert c2.paragraphs[0].chapter_id == "c2"

    def test_paragraph_when_no_draft_chapter_auto_creates_new_chapter(
        self, tmp_path: Path
    ) -> None:
        manager, router = _make_manager(tmp_path)
        assert manager._chapters == {}

        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"paragraph": "auto chapter"},
        )
        _drain(router)

        chapters = list(manager._chapters.values())
        assert len(chapters) == 1
        auto = chapters[0]
        assert auto.chapter_id == "c1"  # _auto_chapter_id starts at "c1"
        assert auto.status == "draft"
        assert len(auto.paragraphs) == 1
        assert auto.paragraphs[0].content == "auto chapter"

    def test_paragraph_persistence_writes_paragraphs_n_json(
        self, tmp_path: Path
    ) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")

        for i in range(3):
            _publish(
                router,
                topic="data.novel.paragraph",
                payload={"chapter_id": "c1", "paragraph": f"para {i + 1}"},
            )
        _drain(router)

        paras_dir = (
            tmp_path
            / "chapters"
            / "test_novel"
            / "v1"
            / "c1"
            / "paragraphs"
        )
        for n in (1, 2, 3):
            path = paras_dir / f"{n}.json"
            assert path.is_file(), f"missing {path}"
            data = _read_json(path)
            assert data["content"] == f"para {n}"
            assert data["index"] == n
            assert data["chapter_id"] == "c1"

    def test_paragraph_index_increments_per_chapter(self, tmp_path: Path) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        manager.create_chapter(volume_id="v1", chapter_id="c2")

        # Two paragraphs into c1, one into c2 — each chapter's N.json
        # numbering must be independent.
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "c1-a"},
        )
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "c1-b"},
        )
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c2", "paragraph": "c2-a"},
        )
        _drain(router)

        c1_paras = tmp_path / "chapters" / "test_novel" / "v1" / "c1" / "paragraphs"
        c2_paras = tmp_path / "chapters" / "test_novel" / "v1" / "c2" / "paragraphs"
        assert (c1_paras / "1.json").is_file()
        assert (c1_paras / "2.json").is_file()
        assert not (c1_paras / "3.json").is_file()
        assert (c2_paras / "1.json").is_file()
        assert not (c2_paras / "2.json").is_file()

        c1_p1 = _read_json(c1_paras / "1.json")
        c2_p1 = _read_json(c2_paras / "1.json")
        assert c1_p1["index"] == 1 and c1_p1["content"] == "c1-a"
        assert c2_p1["index"] == 1 and c2_p1["content"] == "c2-a"

    def test_chapter_index_json_persists_across_restart(self, tmp_path: Path) -> None:
        chapters_dir = str(tmp_path / "chapters")
        manager1, router1 = _make_manager(tmp_path)
        manager1.create_chapter(volume_id="v1", chapter_id="c1")
        manager1.create_chapter(volume_id="v1", chapter_id="c2", target_paragraph_count=4)
        for content in ("alpha", "beta"):
            _publish(
                router1,
                topic="data.novel.paragraph",
                payload={"chapter_id": "c1", "paragraph": content},
            )
        _drain(router1)

        # Spin up a fresh manager pointed at the same chapters_dir and
        # call init() — it should reconstruct chapters, paragraphs and
        # chapter_targets from disk.
        manager2 = ChapterManager(
            novel_id="test_novel",
            chapters_dir=chapters_dir,
        )
        router2 = BusRouter()
        manager2.register(router2)
        manager2.init(
            {
                "novel_v2": {
                    "novel_id": "test_novel",
                    "chapter_dir": chapters_dir,
                },
                "llm": MockLLMService(seed=7),
            }
        )

        assert manager2._chapters.keys() == {"c1", "c2"}
        c1 = manager2.get_chapter("c1")
        assert c1 is not None
        assert c1.status == "draft"
        assert _paragraph_contents(c1) == ["alpha", "beta"]
        # chapter_targets must also be restored from index.json.
        assert manager2._chapter_targets["c2"] == 4
        # _chapter_order is persisted and used by get_current_chapter.
        assert manager2._chapter_order == ["c1", "c2"]


# ---------------------------------------------------------------------------
# SubTask 2.7.1 — Chapter completion & commit
# ---------------------------------------------------------------------------


class TestChapterCompletionAndCommit:
    def test_complete_chapter_transitions_to_audited_and_emits_event(
        self, tmp_path: Path
    ) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")

        _publish(
            router,
            topic="control.novel.chapter.complete",
            payload={"chapter_id": "c1", "reason": "manual"},
        )
        delivered = _drain(router)

        chapter = manager.get_chapter("c1")
        assert chapter is not None
        assert chapter.status == "audited"

        completed = [
            m for m in delivered if m.topic == "event.novel.chapter.completed"
        ]
        assert len(completed) == 1
        assert completed[0].payload["chapter_id"] == "c1"
        assert completed[0].payload["reason"] == "manual"

    def test_commit_chapter_transitions_to_committed_and_writes_version_snapshot(
        self, tmp_path: Path
    ) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "commit body"},
        )
        _drain(router)

        _publish(
            router,
            topic="control.novel.chapter.complete",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={
                "chapter_id": "c1",
                "reason": "audit_passed",
                "audit_metadata": {"score": 0.9},
            },
        )
        delivered = _drain(router)

        chapter = manager.get_chapter("c1")
        assert chapter is not None
        assert chapter.status == "committed"
        assert chapter.committed_at is not None
        assert len(chapter.versions) == 1

        version_path = (
            tmp_path / "chapters" / "test_novel" / "v1" / "c1" / "versions" / "v1.json"
        )
        assert version_path.is_file()
        vdata = _read_json(version_path)
        assert vdata["chapter_id"] == "c1"
        assert vdata["version_number"] == 1
        assert vdata["chapter_status"] == "committed"
        assert len(vdata["paragraphs"]) == 1
        assert vdata["paragraphs"][0]["content"] == "commit body"

        committed = [
            m for m in delivered if m.topic == "event.novel.chapter.committed"
        ]
        assert len(committed) == 1
        assert committed[0].payload["chapter_id"] == "c1"
        assert committed[0].payload["version_number"] == 1
        assert committed[0].payload["reason"] == "audit_passed"
        assert committed[0].payload["audit_metadata"] == {"score": 0.9}

    def test_tick_auto_completes_chapter_when_target_reached(
        self, tmp_path: Path
    ) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(
            volume_id="v1", chapter_id="c1", target_paragraph_count=2
        )
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p1"},
        )
        _drain(router)

        # Only 1 paragraph — tick should NOT auto-complete yet.
        manager.tick(_make_tick(t=1.0))
        delivered_after_first = _drain(router)
        assert manager.get_chapter("c1").status == "draft"
        assert not any(
            m.topic == "event.novel.chapter.completed"
            for m in delivered_after_first
        )

        # Add the second paragraph — now len(paragraphs) >= target.
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p2"},
        )
        _drain(router)
        manager.tick(_make_tick(t=2.0))
        delivered_after_second = _drain(router)

        chapter = manager.get_chapter("c1")
        assert chapter.status == "audited"
        completed = [
            m for m in delivered_after_second
            if m.topic == "event.novel.chapter.completed"
        ]
        assert len(completed) == 1
        assert completed[0].payload["reason"] == "target_reached"
        assert completed[0].payload["target_paragraph_count"] == 2
        assert completed[0].payload["paragraph_count"] == 2

    def test_commit_writes_chapter_version_with_paragraphs_snapshot(
        self, tmp_path: Path
    ) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "snap-a"},
        )
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "snap-b"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)

        chapter = manager.get_chapter("c1")
        assert chapter is not None
        assert len(chapter.versions) == 1
        version = chapter.versions[0]
        assert _paragraph_contents_of_version(version) == ["snap-a", "snap-b"]
        # The version's paragraphs must be a deep copy: mutating the
        # chapter's paragraph list after commit must not affect the snapshot.
        chapter.paragraphs[0].content = "mutated"
        assert version.paragraphs[0].content == "snap-a"


def _paragraph_contents_of_version(version: ChapterVersion) -> list[str]:
    return [p.content for p in version.paragraphs]


# ---------------------------------------------------------------------------
# SubTask 2.7.1 + 2.7.3 — Version rollback
# ---------------------------------------------------------------------------


class TestVersionRollback:
    def test_rollback_to_version_by_int_position_restores_paragraphs(
        self, tmp_path: Path
    ) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p1"},
        )
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p2"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)

        # Add a third paragraph AFTER commit (paragraphs diverge from v1).
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p3"},
        )
        _drain(router)
        chapter_before = manager.get_chapter("c1")
        assert _paragraph_contents(chapter_before) == ["p1", "p2", "p3"]

        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 1},
        )
        _drain(router)

        chapter = manager.get_chapter("c1")
        assert _paragraph_contents(chapter) == ["p1", "p2"]
        assert chapter.status == "revised"
        assert chapter.committed_at is None

    def test_rollback_to_version_by_version_id_string_restores_paragraphs(
        self, tmp_path: Path
    ) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "x1"},
        )
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "x2"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        version_id = manager.get_chapter("c1").versions[0].version_id

        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "x3"},
        )
        _drain(router)

        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": version_id},
        )
        _drain(router)

        chapter = manager.get_chapter("c1")
        assert _paragraph_contents(chapter) == ["x1", "x2"]
        assert chapter.status == "revised"

    def test_rollback_creates_new_version_record(self, tmp_path: Path) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "v1-content"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        assert len(manager.list_versions("c1")) == 1
        commit_version_id = manager.list_versions("c1")[0].version_id

        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 1},
        )
        _drain(router)

        versions = manager.list_versions("c1")
        assert len(versions) == 2  # commit + rollback record
        rollback_version = versions[-1]
        assert rollback_version.version_id != commit_version_id
        assert rollback_version.change_summary == f"rollback to {commit_version_id}"
        # The rollback version's paragraphs must snapshot the restored state.
        assert _paragraph_contents_of_version(rollback_version) == ["v1-content"]

    def test_rollback_emits_event_novel_chapter_rollback(self, tmp_path: Path) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p1"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        commit_version_id = manager.get_chapter("c1").versions[0].version_id

        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 1},
        )
        delivered = _drain(router)

        rollback_events = [
            m for m in delivered if m.topic == "event.novel.chapter.rollback"
        ]
        assert len(rollback_events) == 1
        payload = rollback_events[0].payload
        assert payload["chapter_id"] == "c1"
        assert payload["target_version_id"] == commit_version_id
        assert payload["target_version_number"] == 1
        assert payload["previous_status"] == "committed"
        assert payload["new_status"] == "revised"
        assert payload["paragraph_count"] == 1

    def test_rollback_to_nonexistent_version_raises_or_returns_error(
        self, tmp_path: Path
    ) -> None:
        """The implementation returns silently when the target version is
        unknown — the chapter is left untouched and no rollback event is
        emitted. This test pins that contract: no exception escapes, no
        side effects are observed.
        """
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p1"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)

        paragraphs_before = list(manager.get_chapter("c1").paragraphs)
        status_before = manager.get_chapter("c1").status

        # Out-of-range int position.
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 999},
        )
        delivered_int = _drain(router)
        # Unknown version_id string.
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": "does-not-exist"},
        )
        delivered_str = _drain(router)

        chapter = manager.get_chapter("c1")
        assert chapter.status == status_before  # still "committed"
        assert [p.content for p in chapter.paragraphs] == [
            p.content for p in paragraphs_before
        ]
        assert not any(
            m.topic == "event.novel.chapter.rollback"
            for m in delivered_int + delivered_str
        )

    def test_can_rollback_to_any_chapter_version(self, tmp_path: Path) -> None:
        """Build a chain of commit / rollback cycles and verify we can
        restore the paragraph set from any prior version — not just the
        latest one.
        """
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")

        # v1: commit snapshot of [p1]
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p1"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        # v2: rollback → revised, then add p2 and commit → v3 snapshot [p1, p2]
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 1},
        )
        _drain(router)
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p2"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        # v4: rollback → revised, add p3, commit → v5 snapshot [p1, p3]
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 1},
        )
        _drain(router)
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p3"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)

        # 5 versions total (3 commits + 2 rollbacks), default max_versions=20
        # so no pruning occurred.
        versions = manager.list_versions("c1")
        assert len(versions) == 5

        # Rollback to the v3-equivalent position (commit snapshot of [p1, p2]).
        # After the two rollbacks above, chapter.paragraphs should currently be
        # [p1, p3]. Rolling back to position 3 (the [p1, p2] commit) must
        # restore exactly that paragraph set.
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 3},
        )
        _drain(router)

        chapter = manager.get_chapter("c1")
        assert _paragraph_contents(chapter) == ["p1", "p2"]
        assert chapter.status == "revised"

        # And we can still rollback to the very first commit (position 1).
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 1},
        )
        _drain(router)
        assert _paragraph_contents(manager.get_chapter("c1")) == ["p1"]

    def test_max_versions_fifo_pruning(self, tmp_path: Path) -> None:
        """With ``max_versions=2``, the oldest version is pruned FIFO once
        the cap is exceeded, and the remaining version files are renumbered
        so their ``v{N}.json`` filenames match their new 1-indexed position.
        """
        manager, router = _make_manager(tmp_path, max_versions=2)
        manager.create_chapter(volume_id="v1", chapter_id="c1")

        # v1: commit snapshot of [p1]
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p1"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1", "reason": "first"},
        )
        _drain(router)
        first_version_id = manager.list_versions("c1")[0].version_id
        # v2: rollback record (chapter becomes revised)
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 1},
        )
        _drain(router)
        # Add p2 and commit → v3 (snap [p1, p2]). Pruning kicks in: v1 dropped.
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p2"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1", "reason": "second"},
        )
        _drain(router)

        versions = manager.list_versions("c1")
        assert len(versions) == 2
        # Oldest version (v1) was popped FIFO — its version_id is gone.
        assert all(v.version_id != first_version_id for v in versions)
        # Remaining: rollback record (now position 1) + second commit (position 2).
        assert versions[0].change_summary.startswith("rollback to")
        assert versions[1].change_summary == "commit: second"

        # On disk, only v1.json and v2.json remain (renumbered).
        versions_dir = (
            tmp_path / "chapters" / "test_novel" / "v1" / "c1" / "versions"
        )
        files = sorted(
            f for f in os.listdir(versions_dir)
            if f.endswith(".json") and not f.endswith(".tmp")
        )
        assert files == ["v1.json", "v2.json"]
        v1_disk = _read_json(versions_dir / "v1.json")
        v2_disk = _read_json(versions_dir / "v2.json")
        assert v1_disk["version_number"] == 1
        assert v2_disk["version_number"] == 2
        # The disk content for position 1 must be the rollback record.
        assert v1_disk["change_summary"].startswith("rollback to")


# ---------------------------------------------------------------------------
# SubTask 2.7.1 — State-machine transitions
# ---------------------------------------------------------------------------


class TestStateMachine:
    def test_state_machine_draft_to_audited_to_committed(self, tmp_path: Path) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        assert manager.get_chapter("c1").status == "draft"

        _publish(
            router,
            topic="control.novel.chapter.complete",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        assert manager.get_chapter("c1").status == "audited"

        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        assert manager.get_chapter("c1").status == "committed"

    def test_state_machine_rollback_transitions_to_revised(self, tmp_path: Path) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "p1"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        assert manager.get_chapter("c1").status == "committed"

        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 1},
        )
        _drain(router)
        assert manager.get_chapter("c1").status == "revised"

        # Revised chapters can be re-committed (state machine allows it).
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        assert manager.get_chapter("c1").status == "committed"

    def test_list_versions_returns_chronological_order(self, tmp_path: Path) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")

        # Track every version_id in the order it was appended to
        # chapter.versions — commits AND rollbacks both create versions.
        creation_order: list[str] = []

        # v1: commit snapshot of ["first"]
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "first"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1", "reason": "first"},
        )
        _drain(router)
        creation_order.append(manager.list_versions("c1")[-1].version_id)

        # v2: rollback record (status → revised)
        _publish(
            router,
            topic="control.novel.chapter.rollback",
            payload={"chapter_id": "c1", "target_version": 1},
        )
        _drain(router)
        creation_order.append(manager.list_versions("c1")[-1].version_id)

        # v3: commit snapshot of ["first", "second"] (revised → committed)
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "second"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1", "reason": "second"},
        )
        _drain(router)
        creation_order.append(manager.list_versions("c1")[-1].version_id)

        versions = manager.list_versions("c1")
        # list_versions returns oldest-first (insertion order in chapter.versions).
        assert [v.version_id for v in versions] == creation_order
        # created_at should be non-decreasing across the chronological list.
        timestamps = [v.created_at for v in versions]
        assert timestamps == sorted(timestamps)

    def test_get_version_returns_correct_snapshot(self, tmp_path: Path) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(volume_id="v1", chapter_id="c1")
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "snap"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)

        versions = manager.list_versions("c1")
        target_id = versions[0].version_id
        fetched = manager.get_version("c1", target_id)
        assert fetched is not None
        assert fetched.version_id == target_id
        assert _paragraph_contents_of_version(fetched) == ["snap"]

        # Unknown version_id returns None.
        assert manager.get_version("c1", "no-such-version") is None
        # Unknown chapter returns None.
        assert manager.get_version("ghost", target_id) is None


# ---------------------------------------------------------------------------
# SubTask 2.7.1 — Persistence & serialization
# ---------------------------------------------------------------------------


class TestPersistenceAndSerialization:
    def test_to_dict_from_dict_round_trip(self, tmp_path: Path) -> None:
        manager, router = _make_manager(tmp_path)
        manager.create_chapter(
            volume_id="v1", chapter_id="c1", target_paragraph_count=3
        )
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "rt-1"},
        )
        _publish(
            router,
            topic="data.novel.paragraph",
            payload={"chapter_id": "c1", "paragraph": "rt-2"},
        )
        _drain(router)
        _publish(
            router,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1"},
        )
        _drain(router)
        manager.create_chapter(volume_id="v1", chapter_id="c2")

        snapshot = manager.to_dict()

        restored = ChapterManager(
            novel_id="placeholder",  # should be overwritten by from_dict
            chapters_dir="placeholder",
            max_versions=99,
        )
        restored.from_dict(snapshot)

        assert restored._novel_id == "test_novel"
        assert restored._chapters_dir == str(tmp_path / "chapters")
        assert restored._max_versions == 20
        assert restored._chapter_order == ["c1", "c2"]
        assert restored._chapter_targets["c1"] == 3

        c1 = restored.get_chapter("c1")
        assert c1 is not None
        assert c1.status == "committed"
        assert _paragraph_contents(c1) == ["rt-1", "rt-2"]
        assert len(c1.versions) == 1
        assert _paragraph_contents_of_version(c1.versions[0]) == ["rt-1", "rt-2"]

        # c2 was created with default target_paragraph_count.
        c2 = restored.get_chapter("c2")
        assert c2 is not None
        assert c2.status == "draft"

    def test_chapter_manager_state_persists_across_restart(
        self, tmp_path: Path
    ) -> None:
        chapters_dir = str(tmp_path / "chapters")
        manager1, router1 = _make_manager(tmp_path)
        manager1.create_chapter(volume_id="v1", chapter_id="c1", target_paragraph_count=5)
        for content in ("one", "two", "three"):
            _publish(
                router1,
                topic="data.novel.paragraph",
                payload={"chapter_id": "c1", "paragraph": content},
            )
        _drain(router1)
        _publish(
            router1,
            topic="control.novel.chapter.complete",
            payload={"chapter_id": "c1"},
        )
        _drain(router1)
        _publish(
            router1,
            topic="control.novel.chapter.commit",
            payload={"chapter_id": "c1", "reason": "audited_ok"},
        )
        _drain(router1)

        # Fresh manager instance pointing at the same on-disk chapters_dir.
        manager2 = ChapterManager(
            novel_id="test_novel",
            chapters_dir=chapters_dir,
        )
        router2 = BusRouter()
        manager2.register(router2)
        manager2.init(
            {
                "novel_v2": {
                    "novel_id": "test_novel",
                    "chapter_dir": chapters_dir,
                },
                "llm": MockLLMService(seed=99),
            }
        )

        c1 = manager2.get_chapter("c1")
        assert c1 is not None
        assert c1.status == "committed"
        assert c1.committed_at is not None
        assert _paragraph_contents(c1) == ["one", "two", "three"]
        # Versions were loaded from versions/v1.json.
        assert len(c1.versions) == 1
        assert _paragraph_contents_of_version(c1.versions[0]) == [
            "one",
            "two",
            "three",
        ]
        # chapter_targets were loaded from index.json.
        assert manager2._chapter_targets["c1"] == 5
        # Aggregated counters were refreshed by init().
        state = manager2.get_state()
        assert state["chapter_count"] == 1
        assert state["paragraph_count"] == 3
        assert state["committed_count"] == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
