"""WorldVisualDebugger — world snapshot / diff / COC replay data interface.

Per ``docs/系统重构方案_v1.md`` §5.4 / §9.5 (Stage 5, Task 5.1), this
module exposes three read-only debug topics consumed by the visual
front-end (Web SocialView extension, CLI tools):

1. ``data.debug.world.snapshot`` — full world snapshot (geography /
   factions / rules / characters + relationships) emitted on every world
   state update. The last ``max_snapshots`` (default 10) snapshots are
   buffered in memory + persisted to ``debug_state/{novel_id}.json`` so
   the diff interface can compare any two versions.
2. ``data.debug.world.diff`` — set-difference + field-level diff between
   two buffered snapshots, emitted on demand via
   ``control.debug.world.diff_request``.
3. ``data.debug.narrative.replay`` — COC simulation replay (dice rolls
   + narrative impact) assembled from ``data.sandbox.skill_check.result``
   events and published when ``data.sandbox.narrative.ready`` fires.

Subscribes to (per ``topics.py`` REFACTOR_V2_TOPICS):

- ``control.module.init`` — init handshake (no-op; real init in
  :meth:`init`).
- ``data.sandbox.world.updated`` — refresh cached ``WorldStateContract``
  + emit snapshot (SubTask 5.1.1).
- ``data.oc.evolved`` — refresh cached ``OCCharacterSheet`` registry +
  emit snapshot (SubTask 5.1.1).
- ``control.debug.world.diff_request`` — trigger diff computation
  (SubTask 5.1.2).
- ``data.sandbox.skill_check.result`` — accumulate skill-check results
  for the current simulation round (SubTask 5.1.3).
- ``data.sandbox.narrative.ready`` — finalize + emit replay, then clear
  the accumulator (SubTask 5.1.3).

Publishes:

- ``data.debug.world.snapshot`` — full world snapshot per update.
- ``data.debug.world.diff`` — diff between two snapshots.
- ``data.debug.narrative.replay`` — COC simulation replay.

Persistence: ``debug_state/{novel_id}.json`` via
:meth:`PersistenceManager.save_atomic` (§3.2.2 atomic strategy).

Note on field names (per ``models.py``): ``WorldStateContract.geography``
and ``WorldStateContract.factions`` are ``dict[str, Any]`` (NOT lists),
``WorldStateContract.rules`` is ``list[WorldRule]`` and
``WorldStateContract.version`` is ``int``. ``OCCharacterSheet.relationships``
is ``dict[str, Relationship]``. The spec template's
``[location.to_dict() for location in world_contract.geography]`` is
adapted to dict-iteration form below.
"""

from __future__ import annotations

import datetime
import json
import os
import uuid
from typing import Any

from src.novelist_brain.models import (
    BusMessage,
    ModuleState,
    OCCharacterSheet,
    Relationship,
    TickDelta,
    WorldStateContract,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import PersistenceManager


# ---------------------------------------------------------------------------
# Topic string literals (matches ``topics.py`` REFACTOR_V2_TOPICS; the
# ``control.module.init`` / ``control.debug.world.diff_request`` literals
# are shared with other modules / not yet registered in topics.py).
# ---------------------------------------------------------------------------

_TOPIC_MODULE_INIT = "control.module.init"
_TOPIC_WORLD_UPDATED = "data.sandbox.world.updated"
_TOPIC_OC_EVOLVED = "data.oc.evolved"
_TOPIC_DIFF_REQUEST = "control.debug.world.diff_request"
_TOPIC_SKILL_CHECK_RESULT = "data.sandbox.skill_check.result"
_TOPIC_NARRATIVE_READY = "data.sandbox.narrative.ready"

_TOPIC_DEBUG_WORLD_SNAPSHOT = "data.debug.world.snapshot"
_TOPIC_DEBUG_WORLD_DIFF = "data.debug.world.diff"
_TOPIC_DEBUG_NARRATIVE_REPLAY = "data.debug.narrative.replay"


# Default cap for the in-memory snapshot ring buffer. The spec defaults
# to 10 (SubTask 5.1.1).
_DEFAULT_MAX_SNAPSHOTS = 10

# Defensive caps for the replay accumulator (long-running simulations).
_MAX_BUFFERED_SKILL_CHECKS = 500


def _now_iso() -> str:
    """Return a UTC ISO-8601 timestamp string."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _to_dict(item: Any) -> Any:
    """Coerce a dataclass / dict / scalar into a JSON-friendly dict / value."""
    if item is None:
        return None
    if hasattr(item, "to_dict"):
        try:
            return item.to_dict()
        except Exception:
            pass
    if isinstance(item, dict):
        return dict(item)
    return item


def _dict_entry_with_key(key: str, value: Any) -> dict[str, Any]:
    """Flatten a ``{key: value}`` map entry into a dict that carries the key.

    ``WorldStateContract.geography`` and ``factions`` are
    ``dict[str, Any]``. Values may themselves be dicts (Faction-like) or
    plain scalars (legacy string-only entries). This helper preserves the
    key under ``"key"`` while merging the dict value's fields on top so
    downstream consumers (front-end, diff) can identify each entry.
    """
    if isinstance(value, dict):
        entry: dict[str, Any] = {"key": key}
        entry.update(value)
        return entry
    return {"key": key, "value": value}


def _entry_id(entry: Any, *, fallback_keys: tuple[str, ...] = ("key",)) -> str:
    """Return a stable identifier for a snapshot entry.

    Used by the diff algorithm: geography / factions identify by ``key``
    (the dict key preserved by :func:`_dict_entry_with_key`); rules
    identify by ``rule_id``; characters by ``character_id``. Falls back
    to ``str(entry)`` so diff never crashes on unexpected shapes.
    """
    if isinstance(entry, dict):
        for k in fallback_keys:
            v = entry.get(k)
            if v is not None and isinstance(v, str):
                return v
            if v is not None:
                return str(v)
    return str(entry)


def _relationship_to_dict(rel: Any) -> dict[str, Any]:
    """Coerce a ``Relationship`` (or dict) into a JSON-friendly dict."""
    if isinstance(rel, Relationship):
        return rel.to_dict() if hasattr(rel, "to_dict") else {
            "target_id": rel.target_id,
            "target_name": rel.target_name,
            "type": rel.type,
            "intensity": rel.intensity,
            "trust": rel.trust,
            "history": list(rel.history),
        }
    return _to_dict(rel)


def _character_to_dict(sheet: OCCharacterSheet) -> dict[str, Any]:
    """Project an ``OCCharacterSheet`` into the snapshot shape required by
    SubTask 5.1.1.

    Only the fields needed for the world-graph visualization are emitted
    (``character_id`` / ``name`` / ``archetype`` / ``relationships``);
    the full sheet is not dumped to keep snapshots small.
    """
    relationships: list[dict[str, Any]] = []
    rels = getattr(sheet, "relationships", {}) or {}
    if isinstance(rels, dict):
        for _target_id, rel in rels.items():
            relationships.append(_relationship_to_dict(rel))
    elif isinstance(rels, list):
        for rel in rels:
            relationships.append(_relationship_to_dict(rel))
    return {
        "character_id": sheet.character_id,
        "name": sheet.name,
        "archetype": sheet.archetype,
        "relationships": relationships,
    }


class WorldVisualDebugger(Module):
    """Read-only visual-debugging data interface for the world + COC loop.

    State:
        - ``novel_id``: str (defaults to ``"linyi_default"``)
        - ``max_snapshots``: ring-buffer cap (defaults to 10)
        - ``debug_state_dir``: root directory for snapshot buffer files
          (defaults to ``"debug_state"``)
        - ``_world_contract``: most recently observed ``WorldStateContract``
        - ``_character_registry``: ``dict[character_id, OCCharacterSheet]``
          used to populate the ``characters`` field of each snapshot
        - ``_snapshots``: ring buffer of the last ``max_snapshots``
          snapshot payloads (oldest first)
        - ``_current_skill_checks``: skill-check results accumulated
          since the last ``data.sandbox.narrative.ready``
    """

    def __init__(
        self,
        name: str = "world_visual_debugger",
        novel_id: str = "linyi_default",
        max_snapshots: int = _DEFAULT_MAX_SNAPSHOTS,
        debug_state_dir: str = "debug_state",
    ) -> None:
        super().__init__(name)
        self._novel_id: str = novel_id
        # Clamp to >= 2 so a diff between two snapshots is always possible.
        self._max_snapshots: int = max(2, int(max_snapshots))
        self._debug_state_dir: str = debug_state_dir
        self._state_path: str = os.path.join(
            debug_state_dir, f"{novel_id}.json"
        )

        # Truth sources (populated by init() / refreshed by bus events).
        self._world_contract: WorldStateContract | None = None
        self._character_registry: dict[str, OCCharacterSheet] = {}

        # Snapshot ring buffer (oldest first; trimmed to ``_max_snapshots``).
        self._snapshots: list[dict[str, Any]] = []

        # Replay accumulator (SubTask 5.1.3).
        self._current_skill_checks: list[dict[str, Any]] = []

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "world_visual_debugger",
            "version": "0.1.0",
            "description": (
                "Visual debugging interface: world snapshot / diff + "
                "COC simulation replay for the front-end SocialView"
            ),
            "dependencies": [],
            "category": "novel_debug",
        }

    def _initial_state(self) -> ModuleState:
        # NOTE: ``self._novel_id`` is NOT yet set when the parent ``Module``
        # constructor calls this method (it runs before our ``__init__``
        # body assigns ``self._novel_id``). Subscriptions are registered
        # here per SubTask 5.1.1 / 5.1.2 / 5.1.3.
        self.subscribe(
            _TOPIC_MODULE_INIT,
            _TOPIC_WORLD_UPDATED,
            _TOPIC_OC_EVOLVED,
            _TOPIC_DIFF_REQUEST,
            _TOPIC_SKILL_CHECK_RESULT,
            _TOPIC_NARRATIVE_READY,
        )
        return ModuleState(
            active=True,
            energy_cost=0.05,
            custom={
                "snapshots_emitted": 0,
                "diffs_emitted": 0,
                "replays_emitted": 0,
                "buffered_snapshots": 0,
                "novel_id": "linyi_default",
            },
        )

    # ------------------------------------------------------------------
    # Lifecycle (Module interface)
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        """Initialize from agent context.

        Expected context keys (all optional):

        - ``novel_v2``: ``{'novel_id': str, 'debug_state_dir': str}`` —
          overrides the constructor defaults if present.
        - ``world_contract``: ``WorldStateContract | dict | None`` —
          initial world truth source.
        - ``character_registry``: ``dict[str, OCCharacterSheet | dict]``
          — initial OC registry.
        """
        novel_v2 = context.get("novel_v2", {}) or {}
        if not isinstance(novel_v2, dict):
            novel_v2 = {}
        if novel_v2.get("novel_id"):
            self._novel_id = str(novel_v2["novel_id"])
        if novel_v2.get("debug_state_dir"):
            self._debug_state_dir = str(novel_v2["debug_state_dir"])
        self._state_path = os.path.join(
            self._debug_state_dir, f"{self._novel_id}.json"
        )

        # Initial world contract (optional — may also arrive via bus).
        wc = context.get("world_contract")
        self._world_contract = self._coerce_world_contract(wc)

        # Initial character registry (optional — may also arrive via bus).
        cr = context.get("character_registry")
        if isinstance(cr, dict):
            for cid, sheet in cr.items():
                coerced = self._coerce_character_sheet(sheet)
                if coerced is not None:
                    self._character_registry[str(cid)] = coerced

        # Load persisted snapshot buffer.
        self._load_state()
        self._state.custom["novel_id"] = self._novel_id
        self._state.custom["buffered_snapshots"] = len(self._snapshots)
        self._state.custom.setdefault("snapshots_emitted", 0)
        self._state.custom.setdefault("diffs_emitted", 0)
        self._state.custom.setdefault("replays_emitted", 0)

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        payload = message.payload
        if topic == _TOPIC_MODULE_INIT:
            self._handle_module_init(payload)
        elif topic == _TOPIC_WORLD_UPDATED:
            self._handle_world_updated(payload)
        elif topic == _TOPIC_OC_EVOLVED:
            self._handle_oc_evolved(payload)
        elif topic == _TOPIC_DIFF_REQUEST:
            self._handle_diff_request(payload)
        elif topic == _TOPIC_SKILL_CHECK_RESULT:
            self._handle_skill_check_result(payload)
        elif topic == _TOPIC_NARRATIVE_READY:
            self._handle_narrative_ready(payload)

    def tick(self, delta: TickDelta) -> None:
        """Advance bookkeeping (currently stateless per tick)."""
        self._state.last_tick = delta.absolute_time

    def shutdown(self) -> None:
        """Persist state and deactivate the debugger.

        Not part of the :class:`Module` abstract interface but provided
        as a standard lifecycle hook (per Task 5.1 implementation
        requirements, mirroring ``QualityEngine.shutdown``).
        """
        self._save_state()
        self._state.active = False

    # ------------------------------------------------------------------
    # Bus handlers
    # ------------------------------------------------------------------

    def _handle_module_init(self, payload: Any) -> None:
        """Init handshake — already initialized via :meth:`init`."""
        # No-op: the debugger initializes from agent context in ``init()``.
        # Subscribing to ``control.module.init`` keeps the debugger aware
        # of lifecycle signals without requiring additional action here.
        return

    def _handle_world_updated(self, payload: Any) -> None:
        """Refresh the cached ``WorldStateContract`` and emit a snapshot.

        Payload shape (from sandbox.py / planner.py):
        ``{world_contract: WorldStateContract | dict | None, ...}``.
        """
        if not isinstance(payload, dict):
            return
        wc = payload.get("world_contract") or payload.get("contract")
        coerced = self._coerce_world_contract(wc)
        if coerced is not None:
            self._world_contract = coerced
        # Emit a snapshot regardless — even if the world_contract was not
        # refreshed (e.g. legacy ``world_model`` payload), the snapshot
        # captures the latest known state so the front-end can refresh.
        self._emit_snapshot()

    def _handle_oc_evolved(self, payload: Any) -> None:
        """Refresh a single OC sheet and emit a snapshot (SubTask 5.1.1).

        Payload shape (from oc_character_system.py):
        ``{character_id: str, sheet: OCCharacterSheet | dict | None,
        evolution: str, ...}``.
        """
        if not isinstance(payload, dict):
            return
        character_id = payload.get("character_id")
        if not character_id or not isinstance(character_id, str):
            return
        sheet = payload.get("sheet")
        coerced = self._coerce_character_sheet(sheet)
        if coerced is not None:
            self._character_registry[character_id] = coerced
        # Emit a snapshot so the relationship graph reflects the
        # evolved character (per SubTask 5.1.1 — OC evolution triggers
        # snapshot publication).
        self._emit_snapshot()

    def _handle_diff_request(self, payload: Any) -> None:
        """Compute and publish a diff between two buffered snapshots.

        Payload shape (suggested):
        ``{from_version: str | int | None, to_version: str | int | None,
        from_snapshot_id: str | None, to_snapshot_id: str | None}``.

        Defaults: ``from`` = second-newest snapshot, ``to`` = newest
        snapshot (i.e. the most recent transition).
        """
        if not isinstance(payload, dict):
            payload = {}
        from_snap = self._select_snapshot(
            payload.get("from_version"),
            payload.get("from_snapshot_id"),
            offset_from_newest=1,
        )
        to_snap = self._select_snapshot(
            payload.get("to_version"),
            payload.get("to_snapshot_id"),
            offset_from_newest=0,
        )
        if from_snap is None or to_snap is None:
            # Not enough buffered snapshots to diff — silently no-op so
            # the bus is not polluted with error events.
            return
        self._emit_diff(from_snap, to_snap)

    def _handle_skill_check_result(self, payload: Any) -> None:
        """Accumulate a skill-check result for the current replay round."""
        if not isinstance(payload, dict):
            return
        self._current_skill_checks.append(dict(payload))
        # Cap to avoid unbounded growth in misbehaving simulations.
        if len(self._current_skill_checks) > _MAX_BUFFERED_SKILL_CHECKS:
            # Drop the oldest entries to keep the most recent context.
            overflow = len(self._current_skill_checks) - _MAX_BUFFERED_SKILL_CHECKS
            del self._current_skill_checks[:overflow]

    def _handle_narrative_ready(self, payload: Any) -> None:
        """Finalize + publish a COC replay, then clear the accumulator."""
        if not isinstance(payload, dict):
            # Nothing to replay — reset accumulator defensively.
            self._current_skill_checks.clear()
            return
        self._emit_replay(payload)
        # SubTask 5.1.3: clear the accumulator after each simulation round.
        self._current_skill_checks.clear()

    # ------------------------------------------------------------------
    # SubTask 5.1.1: snapshot emission
    # ------------------------------------------------------------------

    def _build_snapshot(self) -> dict[str, Any] | None:
        """Build a snapshot payload from the cached world + characters.

        Returns ``None`` if no ``WorldStateContract`` is cached yet
        (e.g. before any ``data.sandbox.world.updated`` event has
        arrived). In that case :meth:`_emit_snapshot` skips emission.
        """
        wc = self._world_contract
        if wc is None:
            return None

        geography_entries = [
            _dict_entry_with_key(k, v)
            for k, v in (wc.geography or {}).items()
        ]
        faction_entries = [
            _dict_entry_with_key(k, v)
            for k, v in (wc.factions or {}).items()
        ]
        rule_entries = [_to_dict(r) for r in (wc.rules or [])]
        character_entries = [
            _character_to_dict(sheet)
            for sheet in self._character_registry.values()
        ]

        return {
            "novel_id": self._novel_id,
            "snapshot_id": uuid.uuid4().hex,
            "timestamp": _now_iso(),
            "geography": geography_entries,
            "factions": faction_entries,
            "characters": character_entries,
            "rules": rule_entries,
            "version": str(wc.version),
        }

    def _emit_snapshot(self) -> None:
        """Build, buffer, persist and publish a world snapshot."""
        snapshot = self._build_snapshot()
        if snapshot is None:
            return
        # Append to the ring buffer and trim to ``_max_snapshots``.
        self._snapshots.append(snapshot)
        if len(self._snapshots) > self._max_snapshots:
            del self._snapshots[: len(self._snapshots) - self._max_snapshots]
        self._state.custom["buffered_snapshots"] = len(self._snapshots)
        self._state.custom["snapshots_emitted"] = (
            self._state.custom.get("snapshots_emitted", 0) + 1
        )
        self._save_state()
        self._emit(
            topic=_TOPIC_DEBUG_WORLD_SNAPSHOT,
            payload=snapshot,
            channel="data",
        )

    # ------------------------------------------------------------------
    # SubTask 5.1.2: diff computation + emission
    # ------------------------------------------------------------------

    def _select_snapshot(
        self,
        version: Any,
        snapshot_id: Any,
        *,
        offset_from_newest: int,
    ) -> dict[str, Any] | None:
        """Pick a snapshot from the buffer by version / id / offset.

        Resolution order:

        1. ``snapshot_id`` — match ``snapshot_id`` field exactly.
        2. ``version`` — match the ``version`` field (string comparison
           after str()-coercion).
        3. Fallback — ``offset_from_newest`` (0 = newest, 1 =
           second-newest, ...).

        Returns ``None`` if the buffer is empty or the requested
        snapshot cannot be found.
        """
        if not self._snapshots:
            return None
        if snapshot_id is not None and isinstance(snapshot_id, str):
            for snap in self._snapshots:
                if snap.get("snapshot_id") == snapshot_id:
                    return snap
        if version is not None:
            v_str = str(version)
            for snap in self._snapshots:
                if str(snap.get("version", "")) == v_str:
                    return snap
        idx = len(self._snapshots) - 1 - offset_from_newest
        if idx < 0 or idx >= len(self._snapshots):
            return None
        return self._snapshots[idx]

    def _emit_diff(
        self,
        from_snap: dict[str, Any],
        to_snap: dict[str, Any],
    ) -> None:
        """Compute a set-difference + field-level diff and publish it.

        Diff algorithm (per SubTask 5.1.2):

        - For each section (``geography`` / ``factions`` / ``rules`` /
          ``characters``): build id → entry maps for both snapshots.
        - ``added``   = ids present in ``to`` but not ``from``.
        - ``removed`` = ids present in ``from`` but not ``to``.
        - ``modified`` = ids present in both whose serialized form
          differs (field-level comparison via JSON dumps with sorted
          keys).
        """
        sections: tuple[tuple[str, tuple[str, ...]], ...] = (
            ("geography", ("key",)),
            ("factions", ("key", "faction_id")),
            ("rules", ("rule_id",)),
            ("characters", ("character_id",)),
        )

        added: dict[str, list[Any]] = {}
        removed: dict[str, list[Any]] = {}
        modified: dict[str, list[Any]] = {}

        for section, id_keys in sections:
            from_entries = from_snap.get(section, []) or []
            to_entries = to_snap.get(section, []) or []
            from_map = {
                _entry_id(e, fallback_keys=id_keys): e
                for e in from_entries
                if isinstance(e, dict)
            }
            to_map = {
                _entry_id(e, fallback_keys=id_keys): e
                for e in to_entries
                if isinstance(e, dict)
            }
            from_ids = set(from_map.keys())
            to_ids = set(to_map.keys())

            added[section] = [to_map[i] for i in sorted(to_ids - from_ids)]
            removed[section] = [
                from_map[i] for i in sorted(from_ids - to_ids)
            ]
            modified[section] = []
            for mid in sorted(from_ids & to_ids):
                f_json = json.dumps(
                    from_map[mid], ensure_ascii=False, sort_keys=True
                )
                t_json = json.dumps(
                    to_map[mid], ensure_ascii=False, sort_keys=True
                )
                if f_json != t_json:
                    modified[section].append(
                        {
                            "id": mid,
                            "from": from_map[mid],
                            "to": to_map[mid],
                        }
                    )

        diff_payload = {
            "novel_id": self._novel_id,
            "from_version": str(from_snap.get("version", "")),
            "to_version": str(to_snap.get("version", "")),
            "from_snapshot_id": from_snap.get("snapshot_id"),
            "to_snapshot_id": to_snap.get("snapshot_id"),
            "timestamp": _now_iso(),
            "added": added,
            "removed": removed,
            "modified": modified,
        }
        self._state.custom["diffs_emitted"] = (
            self._state.custom.get("diffs_emitted", 0) + 1
        )
        self._save_state()
        self._emit(
            topic=_TOPIC_DEBUG_WORLD_DIFF,
            payload=diff_payload,
            channel="data",
        )

    # ------------------------------------------------------------------
    # SubTask 5.1.3: COC replay emission
    # ------------------------------------------------------------------

    def _emit_replay(self, ready_payload: dict[str, Any]) -> None:
        """Build and publish a COC simulation replay payload.

        Replay rounds are sourced from the ``narrative_lines`` list (one
        entry per round, per CEN's scenario-driven flow). When the
        payload omits ``narrative_lines`` but includes a single
        ``narrative_line``, that line is wrapped into a one-element
        list. As a final fallback, the locally-accumulated
        ``_current_skill_checks`` buffer is packaged as a single round
        with the round number taken from ``simulation_round``.
        """
        narrative_lines: list[Any] = []
        if isinstance(ready_payload.get("narrative_lines"), list):
            narrative_lines = [
                nl for nl in ready_payload["narrative_lines"]
                if isinstance(nl, dict)
            ]
        if not narrative_lines and isinstance(
            ready_payload.get("narrative_line"), dict
        ):
            narrative_lines = [ready_payload["narrative_line"]]

        rounds: list[dict[str, Any]] = []
        for idx, nl in enumerate(narrative_lines):
            round_no = nl.get("round")
            if round_no is None:
                round_no = idx + 1
            try:
                round_int = int(round_no)
            except (TypeError, ValueError):
                round_int = idx + 1
            nl_checks = nl.get("skill_checks") or []
            if not isinstance(nl_checks, list):
                nl_checks = []
            rounds.append({
                "round": round_int,
                "skill_checks": [_to_dict(c) for c in nl_checks],
                "narrative_impact": nl.get("narration")
                or nl.get("narrative_impact")
                or nl.get("source")
                or "",
            })

        if not rounds and self._current_skill_checks:
            # Fallback: package the buffered skill checks as a single
            # round so the replay still carries the simulation history.
            sim_round = ready_payload.get("simulation_round")
            try:
                round_int = int(sim_round) if sim_round is not None else 1
            except (TypeError, ValueError):
                round_int = 1
            rounds.append({
                "round": round_int,
                "skill_checks": [
                    _to_dict(c) for c in self._current_skill_checks
                ],
                "narrative_impact": "",
            })

        # ``final_narrative`` is taken from the last narrative_line's
        # ``narration`` field if present; otherwise ``None``.
        final_narrative: str | None = None
        if rounds:
            last_impact = rounds[-1].get("narrative_impact")
            if isinstance(last_impact, str) and last_impact:
                final_narrative = last_impact

        simulation_round = ready_payload.get("simulation_round")
        try:
            simulation_round_int = (
                int(simulation_round) if simulation_round is not None else 0
            )
        except (TypeError, ValueError):
            simulation_round_int = 0

        chapter_index = ready_payload.get("chapter_index")
        if chapter_index is not None:
            try:
                chapter_index = int(chapter_index)
            except (TypeError, ValueError):
                chapter_index = None

        scenario_id = ready_payload.get("scenario_id")
        if not isinstance(scenario_id, str) and scenario_id is not None:
            scenario_id = str(scenario_id)

        replay_payload = {
            "novel_id": self._novel_id,
            "replay_id": uuid.uuid4().hex,
            "timestamp": _now_iso(),
            "chapter_index": chapter_index,
            "scenario_id": scenario_id,
            "rounds": rounds,
            "final_narrative": final_narrative,
            "simulation_round": simulation_round_int,
        }
        self._state.custom["replays_emitted"] = (
            self._state.custom.get("replays_emitted", 0) + 1
        )
        self._save_state()
        self._emit(
            topic=_TOPIC_DEBUG_NARRATIVE_REPLAY,
            payload=replay_payload,
            channel="data",
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _coerce_world_contract(self, raw: Any) -> WorldStateContract | None:
        """Coerce a raw payload into a :class:`WorldStateContract`.

        Accepts a ``WorldStateContract`` (returned as-is) or a ``dict``
        (passed through ``WorldStateContract.from_dict``). ``None`` /
        malformed values yield ``None``.
        """
        if raw is None:
            return None
        if isinstance(raw, WorldStateContract):
            return raw
        if isinstance(raw, dict):
            try:
                return WorldStateContract.from_dict(raw)
            except Exception:
                return None
        return None

    def _coerce_character_sheet(
        self, raw: Any
    ) -> OCCharacterSheet | None:
        """Coerce a raw payload into an :class:`OCCharacterSheet`."""
        if raw is None:
            return None
        if isinstance(raw, OCCharacterSheet):
            return raw
        if isinstance(raw, dict):
            try:
                return OCCharacterSheet.from_dict(raw)
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
        """Load persisted snapshot buffer from ``self._state_path``.

        Missing / corrupt files are treated as empty state — the debugger
        starts fresh rather than crashing. Only the snapshot ring buffer
        is persisted; transient accumulators (``_current_skill_checks``)
        are intentionally not restored.
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
        raw_snapshots = data.get("snapshots", []) or []
        if isinstance(raw_snapshots, list):
            self._snapshots = [
                dict(s) for s in raw_snapshots if isinstance(s, dict)
            ]
        # Trim to the configured cap in case the persisted buffer was
        # written with a larger cap.
        if len(self._snapshots) > self._max_snapshots:
            del self._snapshots[: len(self._snapshots) - self._max_snapshots]
        counters = data.get("counters", {}) or {}
        if isinstance(counters, dict):
            for key, value in counters.items():
                self._state.custom[key] = value

    def _save_state(self) -> None:
        """Persist the snapshot buffer to ``self._state_path`` atomically.

        Uses :meth:`PersistenceManager.save_atomic` (§3.2.2) so readers
        never see a half-written file.
        """
        if not self._state_path:
            return
        data = {
            "novel_id": self._novel_id,
            "snapshots": list(self._snapshots),
            "counters": {
                "snapshots_emitted": self._state.custom.get(
                    "snapshots_emitted", 0
                ),
                "diffs_emitted": self._state.custom.get("diffs_emitted", 0),
                "replays_emitted": self._state.custom.get(
                    "replays_emitted", 0
                ),
                "buffered_snapshots": len(self._snapshots),
            },
            "saved_at": _now_iso(),
        }
        try:
            PersistenceManager.save_atomic(data, self._state_path)
        except OSError:
            # Persistence failures must not crash the debug pipeline.
            pass

    # ------------------------------------------------------------------
    # Module serialization (to_dict / from_dict / get_state)
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """Return a serializable snapshot of the debugger's full state."""
        base = super().to_dict()
        base.update({
            "novel_id": self._novel_id,
            "max_snapshots": self._max_snapshots,
            "debug_state_dir": self._debug_state_dir,
            "state_path": self._state_path,
            "world_contract": (
                self._world_contract.to_dict()
                if self._world_contract is not None
                else None
            ),
            "character_registry": {
                cid: sheet.to_dict()
                for cid, sheet in self._character_registry.items()
            },
            "snapshots": list(self._snapshots),
        })
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        """Restore debugger state from a snapshot produced by :meth:`to_dict`."""
        super().from_dict(data, **kwargs)
        self._novel_id = str(data.get("novel_id", self._novel_id))
        try:
            self._max_snapshots = max(
                2, int(data.get("max_snapshots", self._max_snapshots))
            )
        except (TypeError, ValueError):
            pass
        self._debug_state_dir = str(
            data.get("debug_state_dir", self._debug_state_dir)
        )
        self._state_path = str(
            data.get("state_path")
            or os.path.join(
                self._debug_state_dir, f"{self._novel_id}.json"
            )
        )
        self._world_contract = self._coerce_world_contract(
            data.get("world_contract")
        )
        cr = data.get("character_registry", {}) or {}
        self._character_registry = {}
        if isinstance(cr, dict):
            for cid, sheet in cr.items():
                coerced = self._coerce_character_sheet(sheet)
                if coerced is not None:
                    self._character_registry[str(cid)] = coerced
        snapshots = data.get("snapshots", []) or []
        if isinstance(snapshots, list):
            self._snapshots = [
                dict(s) for s in snapshots if isinstance(s, dict)
            ]
        self._state.custom.setdefault("novel_id", self._novel_id)

    def get_state(self) -> ModuleState:
        """Return the current module state with refreshed counters."""
        self._state.custom["novel_id"] = self._novel_id
        self._state.custom["buffered_snapshots"] = len(self._snapshots)
        return self._state
