"""Version-branching manager for the mental sandbox (A/B what-if simulation).

The manager takes snapshots of :class:`MentalSandbox`, forks multiple versions
from a common baseline, runs independent short simulations, compares their depth
metrics, and merges the winner back into the live sandbox.  All operations are
serializable so the version tree survives snapshot reloads.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from src.novelist_brain.bus import BusRouter

if TYPE_CHECKING:
    from src.novelist_brain.sandbox import MentalSandbox


@dataclass
class SandboxVersion:
    """One immutable-ish snapshot of the sandbox at a branching point."""

    id: str
    parent_id: str | None
    label: str
    created_at: float
    sandbox_dict: dict[str, Any]
    simulation_round: int = 0
    results: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)
    status: str = "draft"  # draft | committed | abandoned | merged

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "parent_id": self.parent_id,
            "label": self.label,
            "created_at": self.created_at,
            "sandbox_dict": self.sandbox_dict,
            "simulation_round": self.simulation_round,
            "results": list(self.results),
            "metrics": dict(self.metrics),
            "status": self.status,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SandboxVersion:
        return cls(
            id=data["id"],
            parent_id=data.get("parent_id"),
            label=data.get("label", "v"),
            created_at=data.get("created_at", time.time()),
            sandbox_dict=dict(data.get("sandbox_dict", {})),
            simulation_round=int(data.get("simulation_round", 0)),
            results=list(data.get("results", [])),
            metrics=dict(data.get("metrics", {})),
            status=data.get("status", "draft"),
        )


class VersionTree:
    """Tree of sandbox versions with parent/child relationships."""

    def __init__(self) -> None:
        self.versions: dict[str, SandboxVersion] = {}
        self.root_id: str | None = None
        self._children: dict[str, list[str]] = {}

    def add_version(self, version: SandboxVersion) -> None:
        self.versions[version.id] = version
        self._children.setdefault(version.id, [])
        if version.parent_id is None:
            self.root_id = version.id
        else:
            self._children.setdefault(version.parent_id, []).append(version.id)

    def get_lineage(self, version_id: str) -> list[str]:
        """Return ancestor IDs from root to version (inclusive)."""
        lineage: list[str] = []
        current = version_id
        while current is not None and current in self.versions:
            lineage.append(current)
            current = self.versions[current].parent_id
        lineage.reverse()
        return lineage

    def get_children(self, version_id: str) -> list[str]:
        return list(self._children.get(version_id, []))

    def prune(self, keep_ids: set[str]) -> list[str]:
        """Remove versions not in ``keep_ids`` and return removed IDs."""
        removed: list[str] = []
        for vid in list(self.versions):
            if vid not in keep_ids:
                removed.append(vid)
                del self.versions[vid]
                self._children.pop(vid, None)
        for parent_id, children in list(self._children.items()):
            self._children[parent_id] = [c for c in children if c in self.versions]
        return removed

    def to_dict(self) -> dict[str, Any]:
        return {
            "versions": {vid: v.to_dict() for vid, v in self.versions.items()},
            "root_id": self.root_id,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> VersionTree:
        tree = cls()
        versions_data = data.get("versions", {})
        for vid, vdata in versions_data.items():
            tree.add_version(SandboxVersion.from_dict(vdata))
        tree.root_id = data.get("root_id")
        return tree


class SandboxVersionManager:
    """Fork, simulate, compare and merge mental-sandbox versions."""

    def __init__(self, max_versions: int = 8) -> None:
        self.tree = VersionTree()
        self.current_version_id: str | None = None
        self.max_versions = max(max_versions, 2)

    def fork(
        self,
        source_sandbox: "MentalSandbox",
        label: str = "fork",
    ) -> SandboxVersion:
        """Create a new version from the current sandbox state."""
        parent_id = self.current_version_id
        version = SandboxVersion(
            id=str(uuid.uuid4())[:8],
            parent_id=parent_id,
            label=label,
            created_at=time.time(),
            sandbox_dict=source_sandbox.to_dict(),
            simulation_round=source_sandbox.simulation_round,
        )
        self.tree.add_version(version)
        self.current_version_id = version.id
        self._enforce_limit()
        return version

    def _enforce_limit(self) -> None:
        """Discard oldest non-current draft versions if over limit."""
        if len(self.tree.versions) <= self.max_versions:
            return
        current = self.current_version_id
        keep: set[str] = set()
        if current:
            keep.add(current)
        # Preserve important checkpoints regardless of age.
        for v in self.tree.versions.values():
            if v.status in ("merged", "committed"):
                keep.add(v.id)
        # Fill remaining slots with the most recent drafts.
        remaining = [
            (v.created_at, v.id)
            for v in self.tree.versions.values()
            if v.id not in keep and v.status not in ("abandoned",)
        ]
        remaining.sort(reverse=True)
        slots = self.max_versions - len(keep)
        for _, vid in remaining[:slots]:
            keep.add(vid)
        # Discard versions that are about to be pruned.
        for vid in set(self.tree.versions) - keep:
            self.discard(vid)
        self.tree.prune(keep)

    def simulate(
        self,
        version_id: str,
        rounds: int = 1,
        rng_seed: int | None = None,
    ) -> list[dict[str, Any]]:
        """Run ``rounds`` simulation steps on a version copy.

        The temporary sandbox is registered to a fresh router so emitted bus
        messages do not leak into the live system.  Narrative-ready evaluation
        is disabled during what-if simulation.
        """
        from src.novelist_brain.sandbox import MentalSandbox

        version = self.tree.versions.get(version_id)
        if version is None:
            raise ValueError(f"version {version_id} not found")

        temp = MentalSandbox(
            name=f"{version.label}_{version.id}",
            llm_service=None,
            min_rounds=1,
            max_rounds=rounds + 1,
        )
        router = BusRouter()
        temp.register(router)
        temp.from_dict(version.sandbox_dict, llm_service=temp._llm)

        if rng_seed is not None:
            temp._rng.seed(rng_seed)

        results: list[dict[str, Any]] = []
        for _ in range(max(1, rounds)):
            resolution = temp._simulate_round()
            results.append(resolution)

        version.results.extend(results)
        version.metrics = temp._compute_depth_metrics()
        version.sandbox_dict = temp.to_dict()
        version.simulation_round = temp.simulation_round
        return results

    def compare(self, version_a_id: str, version_b_id: str) -> dict[str, Any]:
        """Compare two versions and return the better one plus score breakdown."""
        a = self.tree.versions.get(version_a_id)
        b = self.tree.versions.get(version_b_id)
        if a is None or b is None:
            raise ValueError("both versions must exist")

        def score(version: SandboxVersion) -> float:
            m = version.metrics
            return (
                m.get("coherence_score", 0.0) * 0.35
                + m.get("character_development", 0.0) * 0.25
                + m.get("conflict_depth", 0.0) * 0.25
                + m.get("emotional_shift", 0.0) * 0.15
            )

        score_a = score(a)
        score_b = score(b)
        winner_id = version_a_id if score_a >= score_b else version_b_id
        return {
            "winner_id": winner_id,
            "score_a": round(score_a, 4),
            "score_b": round(score_b, 4),
            "metrics_a": dict(a.metrics),
            "metrics_b": dict(b.metrics),
        }

    def merge(self, target_sandbox: "MentalSandbox", version_id: str) -> None:
        """Restore the live sandbox from the selected version."""
        version = self.tree.versions.get(version_id)
        if version is None:
            raise ValueError(f"version {version_id} not found")
        target_sandbox.from_dict(version.sandbox_dict, llm_service=target_sandbox._llm)
        version.status = "merged"
        self.current_version_id = version_id

    def discard(self, version_id: str) -> None:
        version = self.tree.versions.get(version_id)
        if version is None:
            return
        version.status = "abandoned"

    def commit(self, version_id: str) -> None:
        version = self.tree.versions.get(version_id)
        if version is None:
            raise ValueError(f"version {version_id} not found")
        version.status = "committed"

    def prune(self) -> list[str]:
        """Remove abandoned versions that are not ancestors of current."""
        current = self.current_version_id
        keep: set[str] = set()
        if current:
            keep.update(self.tree.get_lineage(current))
        for v in self.tree.versions.values():
            if v.status in ("merged", "committed"):
                keep.add(v.id)
        return self.tree.prune(keep)

    def to_dict(self) -> dict[str, Any]:
        return {
            "tree": self.tree.to_dict(),
            "current_version_id": self.current_version_id,
            "max_versions": self.max_versions,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SandboxVersionManager:
        manager = cls(max_versions=data.get("max_versions", 8))
        manager.tree = VersionTree.from_dict(data.get("tree", {}))
        manager.current_version_id = data.get("current_version_id")
        return manager
