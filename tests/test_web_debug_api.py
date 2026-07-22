"""Tests for the /debug/* endpoints (Stage 5 Task 5.4.2).

Exercises the three debug-data endpoints exposed by ``web/app.py``:

- ``GET /debug/world/snapshot``
- ``GET /debug/world/diff``
- ``GET /debug/narrative/replay``

Coverage:

- Success path (latest snapshot, two-snapshot diff, buffered replay).
- Empty-buffer edge cases (null snapshot, insufficient-snapshots diff,
  no-replay-available).
- ``503`` when ``WorldVisualDebugger`` is not registered on the provider.
- Explicit ``from_version`` / ``to_version`` selection for diffs.
- Diff correctness across ``added`` / ``removed`` / ``modified`` for
  every section (geography / factions / rules / characters).
- End-to-end ``snapshot → diff → replay`` flow.

Notes:
- The provider is a process-wide singleton (``get_provider()``). Tests
  mutate it directly (``_modules`` / ``_router``) because there is no
  public unregister API. The autouse fixture pops the
  ``world_visual_debugger`` entry before and after each test so tests
  remain independent.
- ``WorldVisualDebugger`` is constructed without calling ``init()`` so
  no file I/O happens. Snapshots are populated directly into
  ``debugger._snapshots`` to match the shape produced by
  ``_build_snapshot``.
- The replay endpoint reads the latest ``data.debug.narrative.replay``
  record from the ``BusSpy`` attached to the router. Tests attach a
  fresh ``BusSpy`` and publish the replay event via ``router.publish``.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.web import create_app, get_provider
from src.novelist_brain.web.bus_spy import BusSpy
from src.novelist_brain.world_visual_debugger import WorldVisualDebugger


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_snapshot(
    *,
    version: str = "1",
    novel_id: str = "linyi_default",
    geography: list[dict[str, Any]] | None = None,
    factions: list[dict[str, Any]] | None = None,
    rules: list[dict[str, Any]] | None = None,
    characters: list[dict[str, Any]] | None = None,
    snapshot_id: str | None = None,
    timestamp: str = "2026-01-01T00:00:00+00:00",
) -> dict[str, Any]:
    """Build a snapshot payload matching ``WorldVisualDebugger._build_snapshot``."""
    return {
        "novel_id": novel_id,
        "snapshot_id": snapshot_id or uuid.uuid4().hex,
        "timestamp": timestamp,
        "geography": list(geography or []),
        "factions": list(factions or []),
        "rules": list(rules or []),
        "characters": list(characters or []),
        "version": str(version),
    }


def _make_debugger(
    *,
    novel_id: str = "linyi_default",
    snapshots: list[dict[str, Any]] | None = None,
) -> WorldVisualDebugger:
    """Build a ``WorldVisualDebugger`` with the given pre-populated snapshots.

    Constructed without calling ``init()`` so no file I/O happens. The
    snapshot ring buffer is populated directly to match the shape
    produced by ``_build_snapshot``.
    """
    debugger = WorldVisualDebugger(
        name="world_visual_debugger",
        novel_id=novel_id,
    )
    debugger._snapshots = list(snapshots or [])
    return debugger


def _setup(
    *,
    debugger: WorldVisualDebugger | None = None,
    router: BusRouter | None = None,
) -> tuple[TestClient, BusRouter]:
    """Register state into the singleton provider and return a TestClient.

    Always replaces the router and either installs or removes the
    ``world_visual_debugger`` entry so tests are independent of one
    another (the provider is a process-wide singleton with no public
    unregister API).
    """
    provider = get_provider()
    if router is None:
        router = BusRouter()
    provider._router = router
    if debugger is not None:
        provider._modules["world_visual_debugger"] = debugger
    else:
        provider._modules.pop("world_visual_debugger", None)
    return TestClient(create_app()), router


def _attach_spy(router: BusRouter, capacity: int = 500) -> BusSpy:
    """Attach a fresh ``BusSpy`` to the given router and return it."""
    spy = BusSpy(capacity=capacity)
    assert spy.attach(router) is True
    return spy


def _publish_replay(
    router: BusRouter,
    payload: dict[str, Any],
) -> None:
    """Publish a ``data.debug.narrative.replay`` event on the router."""
    router.publish(
        source="world_visual_debugger",
        topic="data.debug.narrative.replay",
        channel="data",
        payload=payload,
    )
    router.flush()


@pytest.fixture(autouse=True)
def _isolate_debugger_module() -> Any:
    """Ensure no ``world_visual_debugger`` leaks between tests.

    The provider is a process-wide singleton shared with ``test_webui``.
    We only touch the ``world_visual_debugger`` key so unrelated modules
    (``mental_sandbox`` etc.) are left alone.
    """
    provider = get_provider()
    provider._modules.pop("world_visual_debugger", None)
    yield
    provider._modules.pop("world_visual_debugger", None)


# ---------------------------------------------------------------------------
# Snapshot endpoint
# ---------------------------------------------------------------------------


class TestDebugSnapshotEndpoint:
    def test_snapshot_returns_latest_snapshot(self) -> None:
        snap1 = _make_snapshot(version="1", snapshot_id="s1")
        snap2 = _make_snapshot(version="2", snapshot_id="s2")
        debugger = _make_debugger(snapshots=[snap1, snap2])
        client, _ = _setup(debugger=debugger)

        response = client.get("/debug/world/snapshot")

        assert response.status_code == 200
        data = response.json()
        assert data["snapshot"]["version"] == "2"
        assert data["snapshot"]["snapshot_id"] == "s2"
        assert data["novel_id"] == "linyi_default"

    def test_snapshot_returns_null_when_no_snapshots(self) -> None:
        debugger = _make_debugger(snapshots=[])
        client, _ = _setup(debugger=debugger)

        response = client.get("/debug/world/snapshot")

        assert response.status_code == 200
        data = response.json()
        assert data["snapshot"] is None
        assert data["message"] == "no snapshot available"
        assert data["novel_id"] == "linyi_default"

    def test_snapshot_includes_available_versions(self) -> None:
        snaps = [
            _make_snapshot(version=str(v), snapshot_id=f"s{v}")
            for v in (1, 2, 3)
        ]
        debugger = _make_debugger(snapshots=snaps)
        client, _ = _setup(debugger=debugger)

        response = client.get("/debug/world/snapshot")

        assert response.status_code == 200
        data = response.json()
        assert data["available_versions"] == ["1", "2", "3"]
        # Latest snapshot is the last one in the buffer.
        assert data["snapshot"]["version"] == "3"
        # Top-level timestamp mirrors the latest snapshot's timestamp.
        assert data["timestamp"] == snaps[-1]["timestamp"]

    def test_snapshot_503_when_module_not_registered(self) -> None:
        client, _ = _setup(debugger=None)

        response = client.get("/debug/world/snapshot")

        assert response.status_code == 503
        assert "world_visual_debugger" in response.json()["detail"]

    def test_snapshot_with_custom_novel_id(self) -> None:
        # Debugger keeps the default novel_id, but the request overrides
        # it via the ``novel_id`` query param.
        debugger = _make_debugger(novel_id="linyi_default", snapshots=[])
        client, _ = _setup(debugger=debugger)

        response = client.get("/debug/world/snapshot?novel_id=novel_xyz")

        assert response.status_code == 200
        data = response.json()
        assert data["novel_id"] == "novel_xyz"
        assert data["snapshot"] is None

    def test_snapshot_with_custom_novel_id_overrides_debugger_default(self) -> None:
        snap = _make_snapshot(version="1", novel_id="linyi_default")
        debugger = _make_debugger(novel_id="linyi_default", snapshots=[snap])
        client, _ = _setup(debugger=debugger)

        response = client.get("/debug/world/snapshot?novel_id=override_novel")

        assert response.status_code == 200
        data = response.json()
        # The endpoint reports the effective novel_id from the query
        # param, not the debugger's internal default.
        assert data["novel_id"] == "override_novel"
        assert data["snapshot"]["version"] == "1"


# ---------------------------------------------------------------------------
# Diff endpoint
# ---------------------------------------------------------------------------


class TestDebugDiffEndpoint:
    def test_diff_returns_diff_when_two_snapshots_exist(self) -> None:
        snap1 = _make_snapshot(
            version="1",
            snapshot_id="s1",
            geography=[{"key": "loc_a", "value": "town"}],
        )
        snap2 = _make_snapshot(
            version="2",
            snapshot_id="s2",
            geography=[
                {"key": "loc_a", "value": "city"},  # modified
                {"key": "loc_b", "value": "forest"},  # added
            ],
        )
        debugger = _make_debugger(snapshots=[snap1, snap2])
        client, _ = _setup(debugger=debugger)

        response = client.get("/debug/world/diff")

        assert response.status_code == 200
        data = response.json()
        assert data["from_version"] == "1"
        assert data["to_version"] == "2"
        assert data["from_snapshot_id"] == "s1"
        assert data["to_snapshot_id"] == "s2"
        assert data["novel_id"] == "linyi_default"
        # Diff payload always carries the four section keys.
        for section in ("geography", "factions", "rules", "characters"):
            assert section in data["added"]
            assert section in data["removed"]
            assert section in data["modified"]

    def test_diff_returns_message_when_insufficient_snapshots(self) -> None:
        debugger = _make_debugger(
            snapshots=[_make_snapshot(version="1", snapshot_id="s1")]
        )
        client, _ = _setup(debugger=debugger)

        response = client.get("/debug/world/diff")

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "insufficient snapshots for diff"
        # No diff payload fields when there are not enough snapshots.
        assert "from_version" not in data

    def test_diff_returns_message_when_no_snapshots(self) -> None:
        debugger = _make_debugger(snapshots=[])
        client, _ = _setup(debugger=debugger)

        response = client.get("/debug/world/diff")

        assert response.status_code == 200
        assert response.json()["message"] == "insufficient snapshots for diff"

    def test_diff_with_explicit_from_to_version(self) -> None:
        snaps = [
            _make_snapshot(version="1", snapshot_id="s1"),
            _make_snapshot(version="2", snapshot_id="s2"),
            _make_snapshot(version="3", snapshot_id="s3"),
        ]
        debugger = _make_debugger(snapshots=snaps)
        client, _ = _setup(debugger=debugger)

        # Default would be v2 → v3; explicit params select v1 → v3.
        response = client.get("/debug/world/diff?from_version=1&to_version=3")

        assert response.status_code == 200
        data = response.json()
        assert data["from_version"] == "1"
        assert data["to_version"] == "3"
        assert data["from_snapshot_id"] == "s1"
        assert data["to_snapshot_id"] == "s3"

    def test_diff_identifies_added_removed_modified(self) -> None:
        snap_from = _make_snapshot(
            version="1",
            snapshot_id="s1",
            geography=[
                {"key": "loc_a", "value": "town"},  # modified
                {"key": "loc_c", "value": "ruins"},  # removed
            ],
            rules=[{"rule_id": "r1", "text": "rule one"}],  # unchanged
            characters=[{"character_id": "c1", "name": "A"}],  # unchanged
        )
        snap_to = _make_snapshot(
            version="2",
            snapshot_id="s2",
            geography=[
                {"key": "loc_a", "value": "city"},  # modified
                {"key": "loc_b", "value": "forest"},  # added
            ],
            rules=[
                {"rule_id": "r1", "text": "rule one"},  # unchanged
                {"rule_id": "r2", "text": "rule two"},  # added
            ],
            characters=[
                {"character_id": "c1", "name": "A"},  # unchanged
                {"character_id": "c2", "name": "B"},  # added
            ],
        )
        debugger = _make_debugger(snapshots=[snap_from, snap_to])
        client, _ = _setup(debugger=debugger)

        response = client.get("/debug/world/diff")

        assert response.status_code == 200
        data = response.json()

        # Added: loc_b (geography), r2 (rules), c2 (characters).
        assert any(e.get("key") == "loc_b" for e in data["added"]["geography"])
        assert any(e.get("rule_id") == "r2" for e in data["added"]["rules"])
        assert any(
            e.get("character_id") == "c2" for e in data["added"]["characters"]
        )

        # Removed: loc_c (geography).
        assert any(e.get("key") == "loc_c" for e in data["removed"]["geography"])
        assert data["removed"]["rules"] == []
        assert data["removed"]["characters"] == []

        # Modified: loc_a (geography) only.
        assert any(m["id"] == "loc_a" for m in data["modified"]["geography"])
        loc_a_mod = next(
            m for m in data["modified"]["geography"] if m["id"] == "loc_a"
        )
        assert loc_a_mod["from"]["value"] == "town"
        assert loc_a_mod["to"]["value"] == "city"
        # r1 / c1 are unchanged → not present in modified.
        assert all(m["id"] != "r1" for m in data["modified"]["rules"])
        assert all(m["id"] != "c1" for m in data["modified"]["characters"])

    def test_diff_503_when_module_not_registered(self) -> None:
        client, _ = _setup(debugger=None)

        response = client.get("/debug/world/diff")

        assert response.status_code == 503
        assert "world_visual_debugger" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Replay endpoint
# ---------------------------------------------------------------------------


class TestDebugReplayEndpoint:
    def test_replay_returns_latest_replay(self) -> None:
        debugger = _make_debugger()
        client, router = _setup(debugger=debugger)
        _attach_spy(router)
        replay_payload = {
            "novel_id": "linyi_default",
            "replay_id": "r-001",
            "timestamp": "2026-01-01T00:00:00+00:00",
            "rounds": [
                {
                    "round": 1,
                    "skill_checks": [],
                    "narrative_impact": "winner",
                }
            ],
            "final_narrative": "winner",
            "simulation_round": 1,
        }
        _publish_replay(router, replay_payload)

        response = client.get("/debug/narrative/replay")

        assert response.status_code == 200
        data = response.json()
        # When a replay is buffered, the endpoint returns the payload
        # directly (NOT wrapped in {novel_id, replay, message}).
        assert data["replay_id"] == "r-001"
        assert data["final_narrative"] == "winner"
        assert data["rounds"][0]["narrative_impact"] == "winner"

    def test_replay_returns_latest_when_multiple_buffered(self) -> None:
        """The endpoint iterates newest-first and returns the latest match."""
        debugger = _make_debugger()
        client, router = _setup(debugger=debugger)
        _attach_spy(router)
        _publish_replay(
            router,
            {
                "novel_id": "linyi_default",
                "replay_id": "r-old",
                "rounds": [],
                "final_narrative": "old",
                "simulation_round": 0,
            },
        )
        _publish_replay(
            router,
            {
                "novel_id": "linyi_default",
                "replay_id": "r-new",
                "rounds": [],
                "final_narrative": "new",
                "simulation_round": 1,
            },
        )

        response = client.get("/debug/narrative/replay")

        assert response.status_code == 200
        data = response.json()
        assert data["replay_id"] == "r-new"
        assert data["final_narrative"] == "new"

    def test_replay_returns_null_when_no_replay(self) -> None:
        debugger = _make_debugger()
        client, router = _setup(debugger=debugger)
        _attach_spy(router)
        # Publish an unrelated event so the spy is non-empty but no
        # replay event is present.
        router.publish(
            source="test",
            topic="some.other.topic",
            channel="event",
            payload={"foo": "bar"},
        )
        router.flush()

        response = client.get("/debug/narrative/replay")

        assert response.status_code == 200
        data = response.json()
        assert data["replay"] is None
        assert data["message"] == "no replay available"
        assert data["novel_id"] == "linyi_default"

    def test_replay_returns_null_when_no_spy_attached(self) -> None:
        debugger = _make_debugger()
        client, router = _setup(debugger=debugger)
        # No spy attached → the endpoint cannot find any replay.

        response = client.get("/debug/narrative/replay")

        assert response.status_code == 200
        data = response.json()
        assert data["replay"] is None
        assert data["message"] == "no replay available"

    def test_replay_503_when_module_not_registered(self) -> None:
        client, _ = _setup(debugger=None)

        response = client.get("/debug/narrative/replay")

        assert response.status_code == 503
        assert "world_visual_debugger" in response.json()["detail"]

    def test_replay_with_custom_novel_id_no_replay(self) -> None:
        debugger = _make_debugger(novel_id="linyi_default")
        client, router = _setup(debugger=debugger)
        _attach_spy(router)

        response = client.get("/debug/narrative/replay?novel_id=novel_xyz")

        assert response.status_code == 200
        data = response.json()
        # Novel id falls back to the query param when no replay is buffered.
        assert data["novel_id"] == "novel_xyz"
        assert data["replay"] is None


# ---------------------------------------------------------------------------
# Integration: snapshot → diff → replay flow
# ---------------------------------------------------------------------------


class TestDebugEndpointIntegration:
    def test_snapshot_then_diff_flow(self) -> None:
        snap1 = _make_snapshot(
            version="1",
            snapshot_id="s1",
            geography=[{"key": "loc_a", "value": "town"}],
        )
        snap2 = _make_snapshot(
            version="2",
            snapshot_id="s2",
            geography=[{"key": "loc_a", "value": "city"}],
        )
        debugger = _make_debugger(snapshots=[snap1, snap2])
        client, _ = _setup(debugger=debugger)

        snap_response = client.get("/debug/world/snapshot")
        assert snap_response.status_code == 200
        snap_data = snap_response.json()
        assert snap_data["snapshot"]["version"] == "2"
        assert snap_data["available_versions"] == ["1", "2"]

        diff_response = client.get("/debug/world/diff")
        assert diff_response.status_code == 200
        diff_data = diff_response.json()
        assert diff_data["from_version"] == "1"
        assert diff_data["to_version"] == "2"
        assert any(
            m["id"] == "loc_a" for m in diff_data["modified"]["geography"]
        )

    def test_full_debug_flow_snapshot_diff_replay(self) -> None:
        snap1 = _make_snapshot(
            version="1",
            snapshot_id="s1",
            characters=[{"character_id": "c1", "name": "A"}],
        )
        snap2 = _make_snapshot(
            version="2",
            snapshot_id="s2",
            characters=[
                {"character_id": "c1", "name": "A"},  # unchanged
                {"character_id": "c2", "name": "B"},  # added
            ],
        )
        debugger = _make_debugger(snapshots=[snap1, snap2])
        client, router = _setup(debugger=debugger)
        _attach_spy(router)
        _publish_replay(
            router,
            {
                "novel_id": "linyi_default",
                "replay_id": "r-002",
                "timestamp": "2026-01-01T00:00:00+00:00",
                "rounds": [
                    {
                        "round": 1,
                        "skill_checks": [{"skill": "shoot", "result": "success"}],
                        "narrative_impact": "hit",
                    }
                ],
                "final_narrative": "hit",
                "simulation_round": 1,
            },
        )

        snap_resp = client.get("/debug/world/snapshot")
        assert snap_resp.status_code == 200
        assert snap_resp.json()["snapshot"]["version"] == "2"

        diff_resp = client.get("/debug/world/diff")
        assert diff_resp.status_code == 200
        diff_data = diff_resp.json()
        assert any(
            c.get("character_id") == "c2"
            for c in diff_data["added"]["characters"]
        )

        replay_resp = client.get("/debug/narrative/replay")
        assert replay_resp.status_code == 200
        replay_data = replay_resp.json()
        assert replay_data["replay_id"] == "r-002"
        assert replay_data["rounds"][0]["skill_checks"][0]["skill"] == "shoot"

    def test_diff_with_faction_section_uses_key_id(self) -> None:
        """Faction entries identify by ``key`` (then ``faction_id``)."""
        snap_from = _make_snapshot(
            version="1",
            factions=[{"key": "f1", "name": "Guild"}],
        )
        snap_to = _make_snapshot(
            version="2",
            factions=[
                {"key": "f1", "name": "Guild Renamed"},  # modified
                {"key": "f2", "name": "Order"},  # added
            ],
        )
        debugger = _make_debugger(snapshots=[snap_from, snap_to])
        client, _ = _setup(debugger=debugger)

        response = client.get("/debug/world/diff")

        assert response.status_code == 200
        data = response.json()
        assert any(
            e.get("key") == "f2" for e in data["added"]["factions"]
        )
        assert any(
            m["id"] == "f1" for m in data["modified"]["factions"]
        )
