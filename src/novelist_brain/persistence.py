"""State persistence helpers for the novelist brain prototype.

This module provides a small PersistenceManager plus JSON encoding/decoding
utilities that know how to serialize ``datetime``, ``UUID`` and dataclass
instances.  A generic dataclass reconstructor is also exported so that modules
can rebuild their internal dataclass state from plain dictionaries.
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
    """Save and load agent state snapshots as JSON files."""

    @staticmethod
    def save(agent_state: dict[str, Any], path: str) -> None:
        """Serialize ``agent_state`` to ``path`` as JSON."""
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
    def load(path: str) -> dict[str, Any]:
        """Load an agent state snapshot from ``path``."""
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
