"""State persistence helpers for the novelist brain prototype.

This module provides a small PersistenceManager plus JSON encoding/decoding
utilities that know how to serialize ``datetime``, ``UUID`` and dataclass
instances.  A generic dataclass reconstructor is also exported so that modules
can rebuild their internal dataclass state from plain dictionaries.

Persistence strategy
--------------------
The manager supports both full snapshots and incremental deltas:

* ``save(path)`` writes a standalone full snapshot to ``path``.
* ``save_snapshot(state, path)`` writes a timestamped snapshot to
  ``<path>.snapshots/`` and records the latest snapshot in ``<path>.latest``.
* ``save_incremental(state, path, event_type)`` appends a small delta record
  to ``<path>.deltas.jsonl``.
* ``load(path)`` loads the latest snapshot (or a legacy ``path`` file) and
  replays any deltas found in ``<path>.deltas.jsonl``.
* ``rotate(path)`` creates a new snapshot from the current full state and
  clears the delta log.

This snapshot+delta design lets a long-running agent survive crashes: on
restart it resumes from the last snapshot plus the deltas written since then.
"""

from __future__ import annotations

import datetime
import json
import os
import types
import uuid
from dataclasses import asdict, fields, is_dataclass
from typing import Any, Literal, TypeVar, Union, get_args, get_origin, get_type_hints

T = TypeVar("T")


def dataclass_to_dict(obj: Any) -> Any:
    """Recursively convert a dataclass instance to a plain dictionary.

    Non-dataclass values are returned unchanged.
    """
    if is_dataclass(obj) and not isinstance(obj, type):
        return asdict(obj)
    return obj


def reconstruct_dataclass(cls: type[T], data: Any) -> T | None:
    """Rebuild a dataclass instance from a plain dictionary.

    The function follows type hints recursively, so nested dataclasses,
    lists of dataclasses and ``Optional`` dataclasses are restored correctly.
    """
    if data is None:
        return None
    if not is_dataclass(cls):
        return data  # type: ignore[return-value]

    hints = get_type_hints(cls)
    kwargs: dict[str, Any] = {}
    for field in fields(cls):
        name = field.name
        value = data.get(name)
        ftype = hints.get(name, field.type)
        kwargs[name] = _reconstruct_value(ftype, value)
    return cls(**kwargs)


def _reconstruct_value(ftype: Any, value: Any) -> Any:
    """Reconstruct a single value according to its declared type hint."""
    if value is None:
        return None

    origin = get_origin(ftype)
    args = get_args(ftype)

    if is_dataclass(ftype):
        return reconstruct_dataclass(ftype, value)

    if origin is list or origin is tuple or origin is set:
        element_type = args[0] if args else Any
        return [_reconstruct_value(element_type, item) for item in value]

    if origin is dict:
        return dict(value)

    if origin is Union or origin is types.UnionType:
        return _reconstruct_union(args, value)

    # ``Literal[...]`` types: validate against the allowed literal values when
    # possible, otherwise accept the value as-is. Using ``origin is Literal``
    # avoids relying on CPython-specific ``str(origin)`` representations that
    # may change across Python versions (the previous ``str(origin).startswith``
    # check was fragile on 3.12+).
    if origin is Literal:
        allowed = {a for a in args if not isinstance(a, type)}
        if not allowed or value in allowed:
            return value
        # Unknown literal value: fall back to the first allowed value to keep
        # the dataclass constructor happy rather than raising.
        first = next(iter(allowed), value)
        return first

    return value


def _reconstruct_union(args: tuple[Any, ...], value: Any) -> Any:
    """Reconstruct a value whose type is a union (typically ``Optional``)."""
    if value is None and type(None) in args:
        return None

    dataclass_args = [arg for arg in args if is_dataclass(arg)]
    if isinstance(value, dict) and dataclass_args:
        # All current union types in the codebase have at most one dataclass
        # candidate (e.g. ``Scene | None``).  Pick the first match.
        return reconstruct_dataclass(dataclass_args[0], value)

    return value


class AgentStateEncoder(json.JSONEncoder):
    """JSON encoder that handles common non-JSON-native Python types."""

    def default(self, obj: Any) -> Any:
        if isinstance(obj, datetime.datetime):
            return obj.isoformat()
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if is_dataclass(obj) and not isinstance(obj, type):
            return asdict(obj)
        if isinstance(obj, set):
            return list(obj)
        if isinstance(obj, tuple):
            return list(obj)
        return super().default(obj)


class PersistenceManager:
    """Save and load agent state using snapshots and an incremental delta log."""

    # In-memory cache of the last state written via ``save_incremental`` (or
    # primed by ``rotate``), keyed by save path. Each entry stores the
    # canonical JSON-serialized form of the per-module state and the clock so
    # that subsequent incremental saves can compute a real diff without having
    # to re-read the delta log from disk. The cache is best-effort: if it is
    # missing (e.g. right after a process restart), the next ``save_incremental``
    # falls back to writing a full baseline delta, which is still correct.
    _baseline_cache: dict[str, dict[str, Any]] = {}

    @classmethod
    def _serialize_state(cls, state: Any) -> str:
        """Canonical JSON form used for diffing nested state structures.

        ``sort_keys=True`` ensures dict-key ordering does not cause spurious
        diffs. ``AgentStateEncoder`` normalizes dataclasses, datetimes, sets,
        tuples and UUIDs so comparisons are semantically meaningful.
        """
        return json.dumps(
            state,
            ensure_ascii=False,
            cls=AgentStateEncoder,
            sort_keys=True,
        )

    @classmethod
    def _update_baseline_cache(cls, path: str, agent_state: dict[str, Any]) -> None:
        """Refresh the in-memory baseline used to compute incremental deltas."""
        current_modules = agent_state.get("modules", {})
        current_clock = agent_state.get("clock", {})
        cls._baseline_cache[path] = {
            "modules": {
                name: cls._serialize_state(state)
                for name, state in current_modules.items()
            },
            "clock": cls._serialize_state(current_clock),
        }

    @staticmethod
    def save(agent_state: dict[str, Any], path: str) -> None:
        """Serialize ``agent_state`` to ``path`` as a standalone JSON snapshot.

        Writes to ``{path}.tmp`` first, then atomically renames to ``path``
        so readers never see a half-written file (§3.2.2). On POSIX this is
        a true atomic rename via :func:`os.replace`; on Windows
        :func:`os.replace` also atomically overwrites an existing file.
        """
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        tmp_path = f"{path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(
                agent_state,
                f,
                ensure_ascii=False,
                indent=2,
                cls=AgentStateEncoder,
            )
        os.replace(tmp_path, path)

    @staticmethod
    def save_atomic(data: dict[str, Any], path: str) -> None:
        """Atomically write JSON ``data`` to ``path``.

        Generic helper for modules that need atomic writes outside the
        snapshot pipeline. Same ``.tmp`` + :func:`os.replace` strategy as
        :meth:`save`.
        """
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        tmp_path = f"{path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, cls=AgentStateEncoder)
        os.replace(tmp_path, path)

    @staticmethod
    def _snapshot_dir(path: str) -> str:
        return f"{path}.snapshots"

    @staticmethod
    def _latest_pointer(path: str) -> str:
        return f"{path}.latest"

    @staticmethod
    def _delta_log(path: str) -> str:
        return f"{path}.deltas.jsonl"

    @staticmethod
    def save_snapshot(agent_state: dict[str, Any], path: str) -> str:
        """Write a timestamped snapshot and update the latest-snapshot pointer.

        Returns the absolute path of the written snapshot file.

        The snapshot file and the ``.latest`` pointer are both written
        via ``.tmp`` + :func:`os.replace` so a crash mid-write cannot leave
        a stale pointer referencing a missing snapshot (§3.2.2).
        """
        snapshot_dir = PersistenceManager._snapshot_dir(path)
        os.makedirs(snapshot_dir, exist_ok=True)

        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y%m%dT%H%M%S"
        )
        snapshot_path = os.path.join(snapshot_dir, f"snapshot_{timestamp}.json")

        PersistenceManager.save(agent_state, snapshot_path)

        latest_pointer = PersistenceManager._latest_pointer(path)
        tmp_pointer = f"{latest_pointer}.tmp"
        with open(tmp_pointer, "w", encoding="utf-8") as f:
            f.write(os.path.abspath(snapshot_path))
        os.replace(tmp_pointer, latest_pointer)

        return snapshot_path

    @staticmethod
    def save_incremental(
        agent_state: dict[str, Any], path: str, event_type: str = "phase_boundary"
    ) -> None:
        """Append a true delta record to the incremental log.

        Only modules whose serialized form differs from the previously saved
        baseline are written; ``clock`` is included only when it has changed.
        When no baseline is available (first save after startup, or right
        after ``rotate`` clears the log) the full state is written as the
        baseline delta so subsequent loads can reconstruct the agent.

        ``load`` already supports partial deltas via ``_apply_delta``, which
        overlays only the modules present in each record and leaves the rest
        of the snapshot untouched.
        """
        delta_log = PersistenceManager._delta_log(path)
        directory = os.path.dirname(delta_log)
        if directory:
            os.makedirs(directory, exist_ok=True)

        current_modules = agent_state.get("modules", {})
        current_clock = agent_state.get("clock", {})
        baseline = PersistenceManager._baseline_cache.get(path)

        if baseline is None:
            # No baseline yet: emit the full state as the baseline delta.
            delta_modules = dict(current_modules)
            delta_clock = current_clock
        else:
            baseline_modules = baseline.get("modules", {})
            delta_modules = {
                name: state
                for name, state in current_modules.items()
                if baseline_modules.get(name)
                != PersistenceManager._serialize_state(state)
            }
            baseline_clock = baseline.get("clock")
            current_clock_serialized = PersistenceManager._serialize_state(
                current_clock
            )
            delta_clock = (
                current_clock if baseline_clock != current_clock_serialized else None
            )

        delta_record: dict[str, Any] = {
            "version": agent_state.get("version", 1),
            "saved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "event_type": event_type,
        }
        if delta_clock is not None:
            delta_record["clock"] = delta_clock
        delta_record["modules"] = delta_modules

        # Refresh the baseline so the next call can diff against this one.
        PersistenceManager._update_baseline_cache(path, agent_state)

        with open(delta_log, "a", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    delta_record,
                    ensure_ascii=False,
                    cls=AgentStateEncoder,
                )
            )
            f.write("\n")

    @staticmethod
    def rotate(path: str, agent_state: dict[str, Any] | None = None) -> str | None:
        """Create a new snapshot from ``agent_state`` and clear the delta log.

        If ``agent_state`` is ``None``, the current state is reconstructed by
        loading the latest snapshot plus deltas first.

        Returns the new snapshot path, or ``None`` if no state could be loaded.
        """
        if agent_state is None:
            try:
                agent_state = PersistenceManager.load(path)
            except FileNotFoundError:
                return None

        snapshot_path = PersistenceManager.save_snapshot(agent_state, path)

        delta_log = PersistenceManager._delta_log(path)
        if os.path.exists(delta_log):
            os.remove(delta_log)

        # Prime the baseline cache from the rotated state so the next
        # ``save_incremental`` writes only true deltas instead of re-emitting
        # the full state as a new baseline.
        if isinstance(agent_state, dict):
            PersistenceManager._update_baseline_cache(path, agent_state)

        return snapshot_path

    @staticmethod
    def load(path: str) -> dict[str, Any]:
        """Load the latest agent state.

        If ``path`` exists as a legacy standalone snapshot, load it directly.
        Otherwise load the snapshot referenced by ``<path>.latest`` and replay
        any deltas in ``<path>.deltas.jsonl``.

        If ``<path>.latest`` is missing or points to a snapshot file that no
        longer exists (e.g. the file was lost in a crash mid-write, or the
        pointer is stale after a manual cleanup), fall back to the newest
        snapshot in ``<path>.snapshots/``. Only when no snapshot and no delta
        log exist at all is :class:`FileNotFoundError` raised.
        """
        if os.path.isfile(path):
            # Legacy standalone snapshot.
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)

        latest_pointer = PersistenceManager._latest_pointer(path)
        snapshot_path: str | None = None
        if os.path.isfile(latest_pointer):
            with open(latest_pointer, "r", encoding="utf-8") as f:
                candidate = f.read().strip()
            if candidate and os.path.isfile(candidate):
                snapshot_path = candidate
            # else: latest pointer is stale/empty -> fall through to fallback.

        # Fallback: if the latest pointer is missing or points to a
        # non-existent file, use the newest snapshot available. This makes
        # crash recovery robust against half-written pointer files.
        if snapshot_path is None:
            snapshots = PersistenceManager.list_snapshots(path)
            if snapshots:
                # ``list_snapshots`` returns sorted ascending by file name,
                # which corresponds to chronological order because the
                # snapshot filename is a UTC timestamp.
                snapshot_path = snapshots[-1]

        state: dict[str, Any] | None = None
        if snapshot_path and os.path.isfile(snapshot_path):
            with open(snapshot_path, "r", encoding="utf-8") as f:
                state = json.load(f)

        delta_log = PersistenceManager._delta_log(path)
        if os.path.isfile(delta_log):
            deltas = PersistenceManager._read_delta_log(delta_log)
            if deltas:
                if state is None:
                    # No snapshot yet but deltas exist: treat the first delta
                    # as the baseline (it must be a full-state baseline delta
                    # emitted by ``save_incremental`` when no prior baseline
                    # was cached) and apply the rest on top.
                    state = deltas[0]
                    deltas_to_apply = deltas[1:]
                else:
                    # Snapshot exists: every delta in the log is an
                    # incremental record that must be replayed on top of the
                    # snapshot. Skipping ``deltas[0]`` here would silently
                    # drop the first incremental save after the snapshot.
                    deltas_to_apply = deltas
                for delta in deltas_to_apply:
                    state = PersistenceManager._apply_delta(state, delta)

        if state is None:
            raise FileNotFoundError(f"No snapshot or delta log found for {path}")

        return state

    @staticmethod
    def verify(path: str) -> dict[str, Any]:
        """Verify the integrity of the persisted state for ``path``.

        Returns a report with ``valid``, ``errors``, ``snapshot_count`` and
        ``delta_count``. This does not guarantee semantic correctness, only
        structural recoverability.
        """
        errors: list[str] = []
        snapshot_count = 0
        delta_count = 0

        try:
            state = PersistenceManager.load(path)
        except Exception as exc:
            errors.append(f"load failed: {exc}")
            state = None

        if state is not None:
            for key in ("version", "saved_at", "clock", "modules"):
                if key not in state:
                    errors.append(f"missing top-level key: {key}")
            saved_at = state.get("saved_at")
            if saved_at:
                try:
                    datetime.datetime.fromisoformat(saved_at)
                except ValueError:
                    errors.append(f"invalid saved_at timestamp: {saved_at}")

        snapshot_count = len(PersistenceManager.list_snapshots(path))
        delta_log = PersistenceManager._delta_log(path)
        if os.path.isfile(delta_log):
            with open(delta_log, "r", encoding="utf-8") as f:
                delta_count = sum(1 for line in f if line.strip())

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "snapshot_count": snapshot_count,
            "delta_count": delta_count,
        }

    @staticmethod
    def emergency_snapshot(
        agent_state: dict[str, Any],
        path: str,
        reason: str = "emergency",
    ) -> str:
        """Write an emergency snapshot outside the normal rotation.

        Returns the path of the written emergency file.
        """
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)

        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y%m%dT%H%M%S"
        )
        emergency_path = f"{path}.emergency.{reason}.{timestamp}.json"

        with open(emergency_path, "w", encoding="utf-8") as f:
            json.dump(
                agent_state,
                f,
                ensure_ascii=False,
                indent=2,
                cls=AgentStateEncoder,
            )

        return emergency_path

    @staticmethod
    def apply_retention(
        path: str,
        retention_policy: dict[str, Any] | None = None,
    ) -> list[str]:
        """Prune old snapshots according to ``retention_policy``.

        Returns the list of removed files. Deltas are only cleared by
        ``rotate()``; this method focuses on snapshot history.
        """
        removed: list[str] = []
        retention_policy = retention_policy or {}
        snapshot_cfg = retention_policy.get("snapshots", {"max_count": 10})
        max_count = snapshot_cfg.get("max_count", 10)

        snapshots = PersistenceManager.list_snapshots(path)
        if len(snapshots) > max_count:
            for old_path in snapshots[: len(snapshots) - max_count]:
                try:
                    os.remove(old_path)
                    removed.append(old_path)
                except OSError:
                    pass

        emergency_cfg = retention_policy.get("emergency_snapshots", {"max_count": 5})
        emergency_max = emergency_cfg.get("max_count", 5)
        directory = os.path.dirname(path) or "."
        emergency_files = sorted(
            os.path.join(directory, name)
            for name in os.listdir(directory)
            if name.startswith(os.path.basename(path) + ".emergency.")
            and name.endswith(".json")
        )
        if len(emergency_files) > emergency_max:
            for old_path in emergency_files[: len(emergency_files) - emergency_max]:
                try:
                    os.remove(old_path)
                    removed.append(old_path)
                except OSError:
                    pass

        return removed

    @staticmethod
    def list_snapshots(path: str) -> list[str]:
        """Return absolute paths of all snapshot files for ``path``."""
        snapshot_dir = PersistenceManager._snapshot_dir(path)
        if not os.path.isdir(snapshot_dir):
            return []
        return sorted(
            os.path.join(snapshot_dir, name)
            for name in os.listdir(snapshot_dir)
            if name.startswith("snapshot_") and name.endswith(".json")
        )

    @staticmethod
    def _read_delta_log(delta_log: str) -> list[dict[str, Any]]:
        """Read all delta records from ``delta_log``."""
        deltas: list[dict[str, Any]] = []
        if not os.path.isfile(delta_log):
            return deltas
        with open(delta_log, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    deltas.append(json.loads(line))
                except json.JSONDecodeError:
                    # Skip corrupted lines rather than failing recovery.
                    continue
        return deltas

    @staticmethod
    def _apply_delta(
        state: dict[str, Any], delta: dict[str, Any]
    ) -> dict[str, Any]:
        """Merge ``delta`` into ``state``.

        The delta overwrites top-level clock/module data while preserving any
        fields present in ``state`` but absent from ``delta``. ``modules`` is
        shallow-copied so the caller's ``state`` dict is not mutated.
        """
        merged: dict[str, Any] = dict(state)
        delta_clock = delta.get("clock")
        if isinstance(delta_clock, dict):
            merged["clock"] = delta_clock
        delta_modules = delta.get("modules")
        if isinstance(delta_modules, dict):
            # Copy the existing modules dict so we don't mutate the snapshot
            # the caller passed in.
            merged_modules = dict(merged.get("modules") or {})
            for module_name, module_state in delta_modules.items():
                merged_modules[module_name] = module_state
            merged["modules"] = merged_modules
        merged["saved_at"] = delta.get("saved_at", merged.get("saved_at"))
        return merged


class SnapshotStore:
    """A path-bound persistence helper used by the recovery system.

    It exposes a small imperative interface so that ``RecoveryManager`` can
    request snapshot restores without knowing the agent's save path.
    """

    def __init__(self, path: str) -> None:
        self._path = path

    def restore_snapshot(self, snapshot_id: str | None = None) -> dict[str, Any]:
        """Load a snapshot by id, or the latest snapshot + deltas if omitted."""
        if snapshot_id:
            snapshot_dir = PersistenceManager._snapshot_dir(self._path)
            candidate = os.path.join(snapshot_dir, f"snapshot_{snapshot_id}.json")
            if os.path.isfile(candidate):
                with open(candidate, "r", encoding="utf-8") as f:
                    return json.load(f)
            # Fall back to the generic loader; the id may be a full timestamp.
            for snapshot_path in PersistenceManager.list_snapshots(self._path):
                if snapshot_id in os.path.basename(snapshot_path):
                    with open(snapshot_path, "r", encoding="utf-8") as f:
                        return json.load(f)
        return PersistenceManager.load(self._path)
