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
from typing import Any, TypeVar, Union, get_args, get_origin, get_type_hints

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

    if origin is not None and str(origin).startswith("typing.Literal"):
        return value

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

    @staticmethod
    def save(agent_state: dict[str, Any], path: str) -> None:
        """Serialize ``agent_state`` to ``path`` as a standalone JSON snapshot."""
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                agent_state,
                f,
                ensure_ascii=False,
                indent=2,
                cls=AgentStateEncoder,
            )

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
        """
        snapshot_dir = PersistenceManager._snapshot_dir(path)
        os.makedirs(snapshot_dir, exist_ok=True)

        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y%m%dT%H%M%S"
        )
        snapshot_path = os.path.join(snapshot_dir, f"snapshot_{timestamp}.json")

        PersistenceManager.save(agent_state, snapshot_path)

        latest_pointer = PersistenceManager._latest_pointer(path)
        with open(latest_pointer, "w", encoding="utf-8") as f:
            f.write(os.path.abspath(snapshot_path))

        return snapshot_path

    @staticmethod
    def save_incremental(
        agent_state: dict[str, Any], path: str, event_type: str = "phase_boundary"
    ) -> None:
        """Append a delta record to the incremental log.

        The delta stores the full module state plus metadata.  This is slightly
        larger than a minimal diff but keeps recovery simple and robust.
        """
        delta_log = PersistenceManager._delta_log(path)
        directory = os.path.dirname(delta_log)
        if directory:
            os.makedirs(directory, exist_ok=True)

        delta_record = {
            "version": agent_state.get("version", 1),
            "saved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "event_type": event_type,
            "clock": agent_state.get("clock", {}),
            "modules": agent_state.get("modules", {}),
        }

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

        return snapshot_path

    @staticmethod
    def load(path: str) -> dict[str, Any]:
        """Load the latest agent state.

        If ``path`` exists as a legacy standalone snapshot, load it directly.
        Otherwise load the snapshot referenced by ``<path>.latest`` and replay
        any deltas in ``<path>.deltas.jsonl``.
        """
        if os.path.isfile(path):
            # Legacy standalone snapshot.
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)

        latest_pointer = PersistenceManager._latest_pointer(path)
        snapshot_path: str | None = None
        if os.path.isfile(latest_pointer):
            with open(latest_pointer, "r", encoding="utf-8") as f:
                snapshot_path = f.read().strip()

        state: dict[str, Any] | None = None
        if snapshot_path and os.path.isfile(snapshot_path):
            with open(snapshot_path, "r", encoding="utf-8") as f:
                state = json.load(f)

        delta_log = PersistenceManager._delta_log(path)
        if os.path.isfile(delta_log):
            deltas = PersistenceManager._read_delta_log(delta_log)
            if deltas:
                if state is None:
                    # No snapshot yet but deltas exist; start from the first
                    # delta as a best-effort recovery.
                    state = deltas[0]
                # Apply later deltas on top.
                for delta in deltas[1:]:
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
        fields present in ``state`` but absent from ``delta``.
        """
        merged: dict[str, Any] = dict(state)
        delta_clock = delta.get("clock")
        if isinstance(delta_clock, dict):
            merged["clock"] = delta_clock
        delta_modules = delta.get("modules")
        if isinstance(delta_modules, dict):
            merged.setdefault("modules", {})
            for module_name, module_state in delta_modules.items():
                merged["modules"][module_name] = module_state
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
