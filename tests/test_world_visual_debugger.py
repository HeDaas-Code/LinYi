"""Unit tests for ``WorldVisualDebugger`` (SubTask 5.4.1).

Covers the three read-only debug topics published by the visual debugger:

1. ``data.debug.world.snapshot`` — emitted on ``data.sandbox.world.updated``
   and ``data.oc.evolved`` (SubTask 5.1.1).
2. ``data.debug.world.diff`` — emitted on ``control.debug.world.diff_request``
   (SubTask 5.1.2).
3. ``data.debug.narrative.replay`` — assembled from
   ``data.sandbox.skill_check.result`` events and emitted on
   ``data.sandbox.narrative.ready`` (SubTask 5.1.3).

The tests follow the actual ``world_visual_debugger.py`` implementation. Per
``models.py``:

- ``WorldStateContract.geography`` / ``factions`` are ``dict[str, Any]``
  (NOT lists).
- ``WorldStateContract.rules`` is ``list[WorldRule]`` and ``version`` is ``int``.
- ``OCCharacterSheet.relationships`` is ``dict[str, Relationship]``.
- ``Faction`` exposes ``faction_id`` / ``name`` / ``description`` / ``power``
  / ``influence`` / ``relations``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import (
    BusMessage,
    Faction,
    OCCharacterSheet,
    Relationship,
    WorldRule,
    WorldStateContract,
)
from src.novelist_brain.world_visual_debugger import WorldVisualDebugger


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


def _publish(
    router: BusRouter,
    *,
    topic: str,
    payload: Any,
    channel: str = "data",
) -> None:
    router.publish(source="test", topic=topic, channel=channel, payload=payload)


def _make_world_contract(
    novel_id: str = "test_novel",
    *,
    version: int = 1,
    geography: dict[str, Any] | None = None,
    factions: dict[str, Any] | None = None,
    rules: list[WorldRule] | None = None,
) -> WorldStateContract:
    """Build a minimal ``WorldStateContract`` for tests.

    ``geography`` / ``factions`` are ``dict[str, Any]`` per ``models.py``;
    faction values are serialized ``Faction`` dicts so the diff algorithm
    can identify them by both ``key`` and ``faction_id``.
    """
    return WorldStateContract(
        novel_id=novel_id,
        genre="test_genre",
        tone="test_tone",
        geography=geography
        if geography is not None
        else {"loc_a": {"name": "Location A", "type": "city"}},
        factions=factions
        if factions is not None
        else {
            "fac_a": Faction(
                faction_id="fac_a",
                name="Faction A",
                power=0.5,
            ).to_dict(),
        },
        rules=rules
        if rules is not None
        else [WorldRule(rule_id="rule_a", statement="Rule A")],
        version=version,
    )


def _make_character_sheet(
    character_id: str = "char_a",
    name: str = "Character A",
    archetype: str = "protagonist",
) -> OCCharacterSheet:
    return OCCharacterSheet(
        character_id=character_id,
        name=name,
        archetype=archetype,
        relationships={
            "char_b": Relationship(
                target_id="char_b",
                target_name="Character B",
                type="ally",
                intensity=0.8,
                trust=0.7,
            ),
        },
    )


def _make_debugger(
    router: BusRouter,
    tmp_path: Path,
    *,
    novel_id: str = "test_novel",
    max_snapshots: int = 10,
) -> WorldVisualDebugger:
    """Build a ``WorldVisualDebugger`` with state dir isolated under ``tmp_path``."""
    debug_state_dir = str(tmp_path / "debug_state")
    dbg = WorldVisualDebugger(
        novel_id=novel_id,
        max_snapshots=max_snapshots,
        debug_state_dir=debug_state_dir,
    )
    dbg.register(router)
    dbg.init(
        {
            "novel_v2": {
                "novel_id": novel_id,
                "debug_state_dir": debug_state_dir,
            },
        }
    )
    return dbg


def _publish_world_updated(
    router: BusRouter,
    *,
    novel_id: str = "test_novel",
    world_contract: WorldStateContract | None = None,
    update_reason: str = "test",
) -> None:
    # Default to a minimal WorldStateContract so the debugger caches it and
    # emits a snapshot. ``_build_snapshot`` returns None when the cached
    # ``_world_contract`` is None, which would skip emission entirely.
    if world_contract is None:
        world_contract = _make_world_contract(novel_id=novel_id)
    _publish(
        router,
        topic="data.sandbox.world.updated",
        payload={
            "novel_id": novel_id,
            "world_contract": world_contract.to_dict(),
            "update_reason": update_reason,
            "timestamp": "2026-01-01T00:00:00",
        },
    )


def _publish_oc_evolved(
    router: BusRouter,
    *,
    character_id: str = "char_a",
    sheet: OCCharacterSheet | None = None,
    evolution: str = "test_evolution",
) -> None:
    _publish(
        router,
        topic="data.oc.evolved",
        payload={
            "novel_id": "test_novel",
            "character_id": character_id,
            "sheet": sheet.to_dict() if sheet is not None else None,
            "evolution": evolution,
        },
    )


def _publish_diff_request(
    router: BusRouter,
    *,
    payload: Any = None,
) -> None:
    if payload is None:
        payload = {}
    _publish(
        router,
        topic="control.debug.world.diff_request",
        payload=payload,
        channel="control",
    )


def _find_messages(messages: list[BusMessage], topic: str) -> list[BusMessage]:
    return [m for m in messages if m.topic == topic]


# ---------------------------------------------------------------------------
# Class 1: Lifecycle
# ---------------------------------------------------------------------------


class TestWorldVisualDebuggerLifecycle:
    def test_init_default(self) -> None:
        dbg = WorldVisualDebugger()
        assert dbg._novel_id == "linyi_default"
        assert dbg._max_snapshots == 10
        assert dbg._debug_state_dir == "debug_state"
        assert dbg._state_path == os.path.join(
            "debug_state", "linyi_default.json"
        )
        assert dbg._world_contract is None
        assert dbg._character_registry == {}
        assert dbg._snapshots == []
        assert dbg._current_skill_checks == []
        # Counters initialized by _initial_state() (called by Module.__init__).
        assert dbg._state.custom["snapshots_emitted"] == 0
        assert dbg._state.custom["diffs_emitted"] == 0
        assert dbg._state.custom["replays_emitted"] == 0
        assert dbg._state.custom["buffered_snapshots"] == 0
        assert dbg._state.custom["novel_id"] == "linyi_default"

    def test_init_with_custom_novel_id(self) -> None:
        dbg = WorldVisualDebugger(
            novel_id="my_novel",
            max_snapshots=5,
            debug_state_dir="/tmp/ds",
        )
        assert dbg._novel_id == "my_novel"
        assert dbg._max_snapshots == 5
        assert dbg._debug_state_dir == "/tmp/ds"
        assert dbg._state_path == os.path.join("/tmp/ds", "my_novel.json")

    def test_subscriptions_registered(self) -> None:
        dbg = WorldVisualDebugger()
        # Subscriptions are registered in _initial_state() (invoked by the
        # parent Module.__init__), not in the WorldVisualDebugger.__init__ body.
        assert "control.module.init" in dbg.subscriptions
        assert "data.sandbox.world.updated" in dbg.subscriptions
        assert "data.oc.evolved" in dbg.subscriptions
        assert "control.debug.world.diff_request" in dbg.subscriptions
        assert "data.sandbox.skill_check.result" in dbg.subscriptions
        assert "data.sandbox.narrative.ready" in dbg.subscriptions
        assert len(dbg.subscriptions) == 6

    def test_shutdown_persists_state(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        _publish_world_updated(router)
        _drain(router)
        dbg.shutdown()

        state_file = tmp_path / "debug_state" / "test_novel.json"
        assert state_file.is_file()
        with open(state_file, encoding="utf-8") as f:
            data = json.load(f)
        assert data["novel_id"] == "test_novel"
        assert len(data["snapshots"]) == 1
        assert data["counters"]["snapshots_emitted"] == 1
        assert data["counters"]["buffered_snapshots"] == 1
        # shutdown() deactivates the debugger.
        assert dbg._state.active is False


# ---------------------------------------------------------------------------
# Class 2: World snapshot (SubTask 5.1.1)
# ---------------------------------------------------------------------------


class TestWorldSnapshot:
    def test_snapshot_published_on_world_updated(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        _publish_world_updated(router)
        delivered = _drain(router)

        snapshots = _find_messages(delivered, "data.debug.world.snapshot")
        assert len(snapshots) == 1
        assert snapshots[0].channel == "data"
        assert snapshots[0].payload["novel_id"] == "test_novel"
        assert dbg._state.custom["snapshots_emitted"] == 1
        assert dbg._state.custom["buffered_snapshots"] == 1

    def test_snapshot_published_on_oc_evolved(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        # Seed the world_contract first so _build_snapshot doesn't return None.
        _publish_world_updated(router)
        _drain(router)
        # Now publish oc_evolved with a character sheet.
        _publish_oc_evolved(router, sheet=_make_character_sheet())
        delivered = _drain(router)

        snapshots = _find_messages(delivered, "data.debug.world.snapshot")
        assert len(snapshots) == 1
        # The evolved character should appear in the snapshot's characters list.
        chars = snapshots[0].payload["characters"]
        assert len(chars) == 1
        assert chars[0]["character_id"] == "char_a"
        assert chars[0]["name"] == "Character A"
        assert chars[0]["archetype"] == "protagonist"
        # Verify the relationship was serialized.
        assert len(chars[0]["relationships"]) == 1
        rel = chars[0]["relationships"][0]
        assert rel["target_id"] == "char_b"
        assert rel["type"] == "ally"
        assert rel["intensity"] == 0.8
        assert rel["trust"] == 0.7

    def test_snapshot_payload_structure(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        wc = _make_world_contract()
        _publish_world_updated(router, world_contract=wc)
        delivered = _drain(router)

        snapshots = _find_messages(delivered, "data.debug.world.snapshot")
        assert len(snapshots) == 1
        payload = snapshots[0].payload
        assert payload["novel_id"] == "test_novel"
        assert isinstance(payload["snapshot_id"], str)
        assert len(payload["snapshot_id"]) > 0
        assert payload["timestamp"]
        # geography: dict[str, Any] → flattened to list of dicts with "key".
        assert isinstance(payload["geography"], list)
        assert len(payload["geography"]) == 1
        assert payload["geography"][0]["key"] == "loc_a"
        assert payload["geography"][0]["name"] == "Location A"
        assert payload["geography"][0]["type"] == "city"
        # factions: dict[str, Any] → flattened to list of dicts with "key".
        assert isinstance(payload["factions"], list)
        assert len(payload["factions"]) == 1
        assert payload["factions"][0]["key"] == "fac_a"
        assert payload["factions"][0]["faction_id"] == "fac_a"
        assert payload["factions"][0]["name"] == "Faction A"
        # rules: list[WorldRule] → list of dicts.
        assert isinstance(payload["rules"], list)
        assert len(payload["rules"]) == 1
        assert payload["rules"][0]["rule_id"] == "rule_a"
        assert payload["rules"][0]["statement"] == "Rule A"
        # characters: empty (no OC sheets registered yet).
        assert payload["characters"] == []
        # version: str(wc.version).
        assert payload["version"] == "1"

    def test_snapshot_ring_buffer_keeps_max_snapshots(
        self, tmp_path: Path
    ) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path, max_snapshots=3)
        # Publish 5 world.updated events → 5 snapshots, but ring buffer caps
        # at 3 (oldest-first ordering, trimmed to the configured cap).
        for i in range(5):
            _publish_world_updated(
                router,
                world_contract=_make_world_contract(version=i + 1),
            )
            _drain(router)

        # The ring buffer should only keep the last 3 snapshots.
        assert len(dbg._snapshots) == 3
        # Versions retained: 3, 4, 5 (oldest-first ordering).
        assert [s["version"] for s in dbg._snapshots] == ["3", "4", "5"]
        assert dbg._state.custom["buffered_snapshots"] == 3
        # All 5 emissions were counted.
        assert dbg._state.custom["snapshots_emitted"] == 5

    def test_snapshot_persisted_to_disk(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        _publish_world_updated(router)
        _drain(router)

        state_file = tmp_path / "debug_state" / "test_novel.json"
        assert state_file.is_file()
        with open(state_file, encoding="utf-8") as f:
            data = json.load(f)
        assert data["novel_id"] == "test_novel"
        assert len(data["snapshots"]) == 1
        assert data["snapshots"][0]["novel_id"] == "test_novel"
        assert data["snapshots"][0]["version"] == "1"
        assert data["counters"]["snapshots_emitted"] == 1
        assert data["counters"]["buffered_snapshots"] == 1
        assert data["saved_at"]


# ---------------------------------------------------------------------------
# Class 3: World diff (SubTask 5.1.2)
# ---------------------------------------------------------------------------


class TestWorldDiff:
    def test_diff_request_triggers_diff(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        # Publish two world.updated events to buffer two snapshots.
        _publish_world_updated(
            router,
            world_contract=_make_world_contract(version=1),
        )
        _drain(router)
        _publish_world_updated(
            router,
            world_contract=_make_world_contract(version=2),
        )
        _drain(router)
        assert len(dbg._snapshots) == 2

        # Request a diff (defaults to second-newest vs newest).
        _publish_diff_request(router)
        delivered = _drain(router)

        diffs = _find_messages(delivered, "data.debug.world.diff")
        assert len(diffs) == 1
        assert diffs[0].channel == "data"
        assert diffs[0].payload["novel_id"] == "test_novel"
        assert dbg._state.custom["diffs_emitted"] == 1

    def test_diff_identifies_added_items(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        # Snapshot 1 (version=1): base world.
        _publish_world_updated(
            router,
            world_contract=_make_world_contract(
                version=1,
                geography={"loc_a": {"name": "Location A", "type": "city"}},
                factions={
                    "fac_a": Faction(
                        faction_id="fac_a", name="Faction A"
                    ).to_dict(),
                },
                rules=[WorldRule(rule_id="rule_a", statement="Rule A")],
            ),
        )
        _drain(router)
        # Snapshot 2 (version=2): add a new geography entry.
        _publish_world_updated(
            router,
            world_contract=_make_world_contract(
                version=2,
                geography={
                    "loc_a": {"name": "Location A", "type": "city"},
                    "loc_b": {"name": "Location B", "type": "forest"},
                },
                factions={
                    "fac_a": Faction(
                        faction_id="fac_a", name="Faction A"
                    ).to_dict(),
                },
                rules=[WorldRule(rule_id="rule_a", statement="Rule A")],
            ),
        )
        _drain(router)

        _publish_diff_request(router)
        delivered = _drain(router)

        diffs = _find_messages(delivered, "data.debug.world.diff")
        assert len(diffs) == 1
        payload = diffs[0].payload
        assert len(payload["added"]["geography"]) == 1
        assert payload["added"]["geography"][0]["key"] == "loc_b"
        assert payload["added"]["geography"][0]["name"] == "Location B"
        assert payload["added"]["factions"] == []
        assert payload["added"]["rules"] == []
        assert payload["added"]["characters"] == []
        assert payload["removed"] == {
            "geography": [],
            "factions": [],
            "rules": [],
            "characters": [],
        }
        assert payload["modified"] == {
            "geography": [],
            "factions": [],
            "rules": [],
            "characters": [],
        }

    def test_diff_identifies_removed_items(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        _publish_world_updated(
            router,
            world_contract=_make_world_contract(
                version=1,
                geography={
                    "loc_a": {"name": "Location A", "type": "city"},
                    "loc_b": {"name": "Location B", "type": "forest"},
                },
                factions={
                    "fac_a": Faction(
                        faction_id="fac_a", name="Faction A"
                    ).to_dict(),
                },
                rules=[
                    WorldRule(rule_id="rule_a", statement="Rule A"),
                    WorldRule(rule_id="rule_b", statement="Rule B"),
                ],
            ),
        )
        _drain(router)
        _publish_world_updated(
            router,
            world_contract=_make_world_contract(
                version=2,
                geography={"loc_a": {"name": "Location A", "type": "city"}},
                factions={
                    "fac_a": Faction(
                        faction_id="fac_a", name="Faction A"
                    ).to_dict(),
                },
                rules=[WorldRule(rule_id="rule_a", statement="Rule A")],
            ),
        )
        _drain(router)

        _publish_diff_request(router)
        delivered = _drain(router)

        diffs = _find_messages(delivered, "data.debug.world.diff")
        assert len(diffs) == 1
        payload = diffs[0].payload
        assert len(payload["removed"]["geography"]) == 1
        assert payload["removed"]["geography"][0]["key"] == "loc_b"
        assert len(payload["removed"]["rules"]) == 1
        assert payload["removed"]["rules"][0]["rule_id"] == "rule_b"
        assert payload["added"] == {
            "geography": [],
            "factions": [],
            "rules": [],
            "characters": [],
        }
        assert payload["modified"] == {
            "geography": [],
            "factions": [],
            "rules": [],
            "characters": [],
        }

    def test_diff_identifies_modified_items(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        _publish_world_updated(
            router,
            world_contract=_make_world_contract(
                version=1,
                geography={"loc_a": {"name": "Location A", "type": "city"}},
                factions={
                    "fac_a": Faction(
                        faction_id="fac_a", name="Faction A", power=0.5
                    ).to_dict(),
                },
                rules=[WorldRule(rule_id="rule_a", statement="Rule A")],
            ),
        )
        _drain(router)
        _publish_world_updated(
            router,
            world_contract=_make_world_contract(
                version=2,
                geography={
                    "loc_a": {"name": "Location A (renamed)", "type": "city"}
                },
                factions={
                    "fac_a": Faction(
                        faction_id="fac_a", name="Faction A", power=0.9
                    ).to_dict(),
                },
                rules=[
                    WorldRule(rule_id="rule_a", statement="Rule A (revised)")
                ],
            ),
        )
        _drain(router)

        _publish_diff_request(router)
        delivered = _drain(router)

        diffs = _find_messages(delivered, "data.debug.world.diff")
        assert len(diffs) == 1
        payload = diffs[0].payload
        # All three sections (geography / factions / rules) have modified
        # entries because their serialized form changed.
        assert len(payload["modified"]["geography"]) == 1
        assert payload["modified"]["geography"][0]["id"] == "loc_a"
        assert (
            payload["modified"]["geography"][0]["from"]["name"] == "Location A"
        )
        assert (
            payload["modified"]["geography"][0]["to"]["name"]
            == "Location A (renamed)"
        )
        assert len(payload["modified"]["factions"]) == 1
        assert payload["modified"]["factions"][0]["from"]["power"] == 0.5
        assert payload["modified"]["factions"][0]["to"]["power"] == 0.9
        assert len(payload["modified"]["rules"]) == 1
        assert (
            payload["modified"]["rules"][0]["from"]["statement"] == "Rule A"
        )
        assert (
            payload["modified"]["rules"][0]["to"]["statement"]
            == "Rule A (revised)"
        )
        assert payload["added"] == {
            "geography": [],
            "factions": [],
            "rules": [],
            "characters": [],
        }
        assert payload["removed"] == {
            "geography": [],
            "factions": [],
            "rules": [],
            "characters": [],
        }

    def test_diff_insufficient_snapshots(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        # Only one snapshot buffered.
        _publish_world_updated(router)
        _drain(router)
        assert len(dbg._snapshots) == 1

        _publish_diff_request(router)
        delivered = _drain(router)

        # No diff should be emitted — the source silently no-ops so the bus
        # is not polluted with error events when < 2 snapshots are buffered.
        assert not _find_messages(delivered, "data.debug.world.diff")
        assert dbg._state.custom["diffs_emitted"] == 0


# ---------------------------------------------------------------------------
# Class 4: Narrative replay (SubTask 5.1.3)
# ---------------------------------------------------------------------------


class TestNarrativeReplay:
    def test_skill_check_result_accumulated(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        assert dbg._current_skill_checks == []

        _publish(
            router,
            topic="data.sandbox.skill_check.result",
            payload={
                "character_id": "char_a",
                "skill": "fight",
                "roll": 45,
                "result": "success",
            },
        )
        _drain(router)
        assert len(dbg._current_skill_checks) == 1
        assert dbg._current_skill_checks[0]["skill"] == "fight"

        _publish(
            router,
            topic="data.sandbox.skill_check.result",
            payload={
                "character_id": "char_b",
                "skill": "stealth",
                "roll": 80,
                "result": "failure",
            },
        )
        _drain(router)
        assert len(dbg._current_skill_checks) == 2
        assert dbg._current_skill_checks[1]["character_id"] == "char_b"

    def test_narrative_ready_triggers_replay(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        # Accumulate two skill checks.
        _publish(
            router,
            topic="data.sandbox.skill_check.result",
            payload={
                "character_id": "char_a",
                "skill": "fight",
                "result": "success",
            },
        )
        _publish(
            router,
            topic="data.sandbox.skill_check.result",
            payload={
                "character_id": "char_b",
                "skill": "stealth",
                "result": "failure",
            },
        )
        _drain(router)
        assert len(dbg._current_skill_checks) == 2

        # Trigger narrative.ready with no narrative_lines → the fallback
        # path packages the buffered skill checks as a single round.
        _publish(
            router,
            topic="data.sandbox.narrative.ready",
            payload={
                "novel_id": "test_novel",
                "simulation_round": 1,
                "chapter_index": 5,
                "scenario_id": "scn_001",
            },
        )
        delivered = _drain(router)

        replays = _find_messages(delivered, "data.debug.narrative.replay")
        assert len(replays) == 1
        assert replays[0].channel == "data"
        payload = replays[0].payload
        assert payload["novel_id"] == "test_novel"
        assert payload["simulation_round"] == 1
        assert payload["chapter_index"] == 5
        assert payload["scenario_id"] == "scn_001"
        # Fallback path: single round containing both buffered skill checks.
        assert len(payload["rounds"]) == 1
        assert payload["rounds"][0]["round"] == 1
        assert len(payload["rounds"][0]["skill_checks"]) == 2
        # No narration source → empty narrative_impact.
        assert payload["rounds"][0]["narrative_impact"] == ""
        assert payload["final_narrative"] is None
        assert dbg._state.custom["replays_emitted"] == 1

    def test_replay_payload_structure(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        # Use narrative_lines to exercise the primary path.
        _publish(
            router,
            topic="data.sandbox.narrative.ready",
            payload={
                "novel_id": "test_novel",
                "simulation_round": 2,
                "chapter_index": 3,
                "scenario_id": "scn_002",
                "narrative_lines": [
                    {
                        "round": 1,
                        "skill_checks": [
                            {
                                "character_id": "char_a",
                                "roll": 30,
                                "result": "success",
                            },
                        ],
                        "narration": "Round 1 narration",
                    },
                    {
                        "round": 2,
                        "skill_checks": [
                            {
                                "character_id": "char_b",
                                "roll": 70,
                                "result": "failure",
                            },
                        ],
                        "narration": "Round 2 narration",
                    },
                ],
            },
        )
        delivered = _drain(router)

        replays = _find_messages(delivered, "data.debug.narrative.replay")
        assert len(replays) == 1
        payload = replays[0].payload
        assert payload["novel_id"] == "test_novel"
        assert isinstance(payload["replay_id"], str)
        assert len(payload["replay_id"]) > 0
        assert payload["timestamp"]
        assert payload["chapter_index"] == 3
        assert payload["scenario_id"] == "scn_002"
        assert payload["simulation_round"] == 2
        assert len(payload["rounds"]) == 2
        assert payload["rounds"][0]["round"] == 1
        assert len(payload["rounds"][0]["skill_checks"]) == 1
        assert payload["rounds"][0]["skill_checks"][0]["character_id"] == "char_a"
        assert payload["rounds"][0]["narrative_impact"] == "Round 1 narration"
        assert payload["rounds"][1]["round"] == 2
        assert payload["rounds"][1]["narrative_impact"] == "Round 2 narration"
        # final_narrative is the last round's narrative_impact.
        assert payload["final_narrative"] == "Round 2 narration"

    def test_replay_buffer_cleared_after_publish(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        _publish(
            router,
            topic="data.sandbox.skill_check.result",
            payload={
                "character_id": "char_a",
                "result": "success",
            },
        )
        _drain(router)
        assert len(dbg._current_skill_checks) == 1

        _publish(
            router,
            topic="data.sandbox.narrative.ready",
            payload={"novel_id": "test_novel", "simulation_round": 1},
        )
        _drain(router)

        # The accumulator must be cleared after the replay is published.
        assert dbg._current_skill_checks == []

    def test_replay_with_no_skill_checks(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        assert dbg._current_skill_checks == []

        # Publish narrative.ready with no narrative_lines and no buffered
        # skill checks → replay is still emitted with empty rounds.
        _publish(
            router,
            topic="data.sandbox.narrative.ready",
            payload={"novel_id": "test_novel", "simulation_round": 1},
        )
        delivered = _drain(router)

        replays = _find_messages(delivered, "data.debug.narrative.replay")
        assert len(replays) == 1
        payload = replays[0].payload
        assert payload["rounds"] == []
        assert payload["final_narrative"] is None
        assert payload["simulation_round"] == 1
        assert dbg._state.custom["replays_emitted"] == 1


# ---------------------------------------------------------------------------
# Class 5: Payload format
# ---------------------------------------------------------------------------


class TestPayloadFormat:
    def test_snapshot_has_required_fields(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        _publish_world_updated(router)
        delivered = _drain(router)

        snapshots = _find_messages(delivered, "data.debug.world.snapshot")
        assert len(snapshots) == 1
        payload = snapshots[0].payload
        # All required fields per SubTask 5.1.1.
        for field in (
            "novel_id",
            "snapshot_id",
            "timestamp",
            "geography",
            "factions",
            "characters",
            "rules",
            "version",
        ):
            assert field in payload, f"missing field: {field}"
        assert isinstance(payload["geography"], list)
        assert isinstance(payload["factions"], list)
        assert isinstance(payload["characters"], list)
        assert isinstance(payload["rules"], list)
        assert isinstance(payload["version"], str)

    def test_diff_has_required_fields(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        # Two snapshots for diff.
        _publish_world_updated(
            router, world_contract=_make_world_contract(version=1)
        )
        _drain(router)
        _publish_world_updated(
            router, world_contract=_make_world_contract(version=2)
        )
        _drain(router)

        _publish_diff_request(router)
        delivered = _drain(router)

        diffs = _find_messages(delivered, "data.debug.world.diff")
        assert len(diffs) == 1
        payload = diffs[0].payload
        for field in (
            "novel_id",
            "from_version",
            "to_version",
            "from_snapshot_id",
            "to_snapshot_id",
            "timestamp",
            "added",
            "removed",
            "modified",
        ):
            assert field in payload, f"missing field: {field}"
        # Each diff section must enumerate all four sub-sections.
        for section in ("geography", "factions", "rules", "characters"):
            assert section in payload["added"]
            assert section in payload["removed"]
            assert section in payload["modified"]
        assert payload["from_version"] == "1"
        assert payload["to_version"] == "2"
        assert payload["from_snapshot_id"] is not None
        assert payload["to_snapshot_id"] is not None

    def test_replay_has_required_fields(self, tmp_path: Path) -> None:
        router = BusRouter()
        dbg = _make_debugger(router, tmp_path)
        _publish(
            router,
            topic="data.sandbox.narrative.ready",
            payload={
                "novel_id": "test_novel",
                "simulation_round": 1,
                "chapter_index": 1,
                "scenario_id": "scn_001",
                "narrative_lines": [
                    {
                        "round": 1,
                        "skill_checks": [{"roll": 50}],
                        "narration": "narration text",
                    },
                ],
            },
        )
        delivered = _drain(router)

        replays = _find_messages(delivered, "data.debug.narrative.replay")
        assert len(replays) == 1
        payload = replays[0].payload
        for field in (
            "novel_id",
            "replay_id",
            "timestamp",
            "chapter_index",
            "scenario_id",
            "rounds",
            "final_narrative",
            "simulation_round",
        ):
            assert field in payload, f"missing field: {field}"
        assert isinstance(payload["rounds"], list)
        assert len(payload["rounds"]) == 1
        round_payload = payload["rounds"][0]
        for field in ("round", "skill_checks", "narrative_impact"):
            assert field in round_payload
        assert round_payload["narrative_impact"] == "narration text"
        assert payload["final_narrative"] == "narration text"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
