"""Tests for the mental-sandbox version branching manager."""

from __future__ import annotations

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import CharacterProjection, TraitVector, WorldModel
from src.novelist_brain.sandbox import MentalSandbox
from src.novelist_brain.sandbox_versioning import SandboxVersion, SandboxVersionManager, VersionTree


def _make_version(vid: str, parent_id: str | None = None, label: str = "v") -> SandboxVersion:
    return SandboxVersion(
        id=vid,
        parent_id=parent_id,
        label=label,
        created_at=0.0,
        sandbox_dict={},
    )


@pytest.fixture
def fresh_sandbox() -> MentalSandbox:
    sandbox = MentalSandbox(
        name="test_sandbox",
        llm_service=None,
        min_rounds=1,
        max_rounds=5,
    )
    router = BusRouter()
    sandbox.register(router)
    sandbox._world_model = WorldModel(
        name="test_world",
        ontology={"genre": "test", "tone": "neutral"},
        rules=["rule1"],
        current_state={"time": "morning", "mood": "calm"},
    )
    sandbox._current_scene = sandbox._create_default_scene()
    protagonist = CharacterProjection(
        id="protagonist",
        name="Lin",
        archetype="observer",
        traits=TraitVector(),
    )
    sandbox._characters.append(protagonist)
    sandbox._rebuild_character_sheets()
    return sandbox


class TestVersionTree:
    def test_add_root_and_children(self) -> None:
        tree = VersionTree()
        tree.add_version(_make_version("root", None, "root"))
        assert tree.root_id == "root"
        tree.add_version(_make_version("child", "root", "child"))
        assert tree.get_children("root") == ["child"]
        assert tree.get_lineage("child") == ["root", "child"]

    def test_prune_keeps_lineage(self) -> None:
        tree = VersionTree()
        for vid, parent in [("a", None), ("b", "a"), ("c", "b"), ("d", "a")]:
            tree.add_version(_make_version(vid, parent, vid))
        removed = tree.prune({"a", "b", "c"})
        assert sorted(removed) == ["d"]
        assert "c" in tree.versions

    def test_serialization_roundtrip(self) -> None:
        tree = VersionTree()
        tree.add_version(_make_version("a", None, "a"))
        tree.add_version(_make_version("b", "a", "b"))
        restored = VersionTree.from_dict(tree.to_dict())
        assert restored.root_id == "a"
        assert set(restored.versions) == {"a", "b"}


class TestSandboxVersionManager:
    def test_fork_creates_version(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        version = manager.fork(fresh_sandbox, label="baseline")
        assert version.id in manager.tree.versions
        assert manager.current_version_id == version.id
        assert version.label == "baseline"
        assert version.sandbox_dict["name"] == "test_sandbox"

    def test_fork_tracks_parent(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        first = manager.fork(fresh_sandbox, label="first")
        second = manager.fork(fresh_sandbox, label="second")
        assert second.parent_id == first.id
        assert manager.tree.get_children(first.id) == [second.id]

    def test_simulate_runs_rounds(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        version = manager.fork(fresh_sandbox, label="baseline")
        results = manager.simulate(version.id, rounds=2, rng_seed=42)
        assert len(results) == 2
        assert len(version.results) == 2
        assert "coherence_score" in version.metrics
        assert version.simulation_round >= 2

    def test_simulate_unknown_version_raises(self) -> None:
        manager = SandboxVersionManager(max_versions=4)
        with pytest.raises(ValueError, match="version unknown not found"):
            manager.simulate("unknown", rounds=1)

    def test_compare_returns_winner(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        a = manager.fork(fresh_sandbox, label="a")
        b = manager.fork(fresh_sandbox, label="b")
        manager.simulate(a.id, rounds=1, rng_seed=1)
        manager.simulate(b.id, rounds=1, rng_seed=2)
        result = manager.compare(a.id, b.id)
        assert result["winner_id"] in (a.id, b.id)
        assert "score_a" in result
        assert "score_b" in result

    def test_compare_missing_version_raises(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        a = manager.fork(fresh_sandbox, label="a")
        with pytest.raises(ValueError, match="both versions must exist"):
            manager.compare(a.id, "missing")

    def test_merge_restores_live_state(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        version = manager.fork(fresh_sandbox, label="baseline")
        original_round = fresh_sandbox.simulation_round
        manager.simulate(version.id, rounds=3, rng_seed=42)
        manager.merge(fresh_sandbox, version.id)
        assert fresh_sandbox.simulation_round == original_round + 3
        assert version.status == "merged"
        assert manager.current_version_id == version.id

    def test_discard_marks_abandoned(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        version = manager.fork(fresh_sandbox, label="baseline")
        manager.discard(version.id)
        assert version.status == "abandoned"

    def test_commit_marks_committed(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        version = manager.fork(fresh_sandbox, label="baseline")
        manager.commit(version.id)
        assert version.status == "committed"

    def test_max_versions_enforcement(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=3)
        versions = [manager.fork(fresh_sandbox, label=f"v{i}") for i in range(5)]
        assert len(manager.tree.versions) <= 3
        # Current version plus committed/merged ancestors are kept.
        assert versions[-1].id in manager.tree.versions

    def test_serialization_roundtrip(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        version = manager.fork(fresh_sandbox, label="baseline")
        manager.simulate(version.id, rounds=1, rng_seed=7)
        restored = SandboxVersionManager.from_dict(manager.to_dict())
        assert restored.max_versions == 4
        assert restored.current_version_id == version.id
        assert version.id in restored.tree.versions
        assert restored.tree.versions[version.id].results


class TestSandboxForkHandlers:
    def test_handle_fork_emits_event(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        fresh_sandbox._version_manager = manager
        router = BusRouter()
        fresh_sandbox.register(router)
        fresh_sandbox._handle_fork({"label": "test_fork"})
        assert manager.current_version_id is not None
        messages = router.flush()
        assert any(m.topic == "data.sandbox.version.forked" for m in messages)

    def test_handle_merge_emits_event(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        fresh_sandbox._version_manager = manager
        version = manager.fork(fresh_sandbox, label="baseline")
        router = BusRouter()
        fresh_sandbox.register(router)
        fresh_sandbox._handle_version_merge({"version_id": version.id})
        assert version.status == "merged"
        assert any(m.topic == "data.sandbox.version.merged" for m in router.flush())

    def test_handle_discard_emits_event(self, fresh_sandbox: MentalSandbox) -> None:
        manager = SandboxVersionManager(max_versions=4)
        fresh_sandbox._version_manager = manager
        version = manager.fork(fresh_sandbox, label="baseline")
        router = BusRouter()
        fresh_sandbox.register(router)
        fresh_sandbox._handle_version_discard({"version_id": version.id})
        assert version.status == "abandoned"
        assert any(m.topic == "data.sandbox.version.discarded" for m in router.flush())
