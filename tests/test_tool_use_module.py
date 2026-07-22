# -*- coding: utf-8 -*-
"""Tests for ToolUseModule."""
from __future__ import annotations

from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage
from src.novelist_brain.tool_use_module import (
    TOPIC_TOOL_FAILED,
    TOPIC_TOOL_REFRESH,
    TOPIC_TOOL_REGISTRY,
    TOPIC_TOOL_REQUEST,
    TOPIC_TOOL_RESULT,
    ToolUseModule,
)


def _module(
    router: BusRouter, tmp_path: Any, **overrides: Any
) -> ToolUseModule:
    module = ToolUseModule(name="tool_use")
    module.register(router)
    context = {
        "tools": {
            "allowed_paths": [str(tmp_path)],
            "enable_scripts": True,
            "script_timeout": 5.0,
            "max_output_length": 500,
            "search_max_results": 10,
            **overrides,
        }
    }
    module.init(context)
    return module


def _collect(router: BusRouter) -> list[BusMessage]:
    """Flush the router and return all messages delivered in this batch."""
    return router.flush()


def test_registry_broadcast_on_init(tmp_path: Any) -> None:
    router = BusRouter()
    _module(router, tmp_path)

    delivered = _collect(router)
    assert len(delivered) == 1
    assert delivered[0].topic == TOPIC_TOOL_REGISTRY
    tool_names = {t["name"] for t in delivered[0].payload["tools"]}
    assert "read_file" in tool_names
    assert "list_directory" in tool_names
    assert "search_notes" in tool_names
    assert "run_read_only_script" in tool_names


def test_refresh_registry_request(tmp_path: Any) -> None:
    router = BusRouter()
    _module(router, tmp_path)
    _collect(router)

    router.publish(
        source="test",
        topic=TOPIC_TOOL_REFRESH,
        channel="control",
        payload={},
        priority=5,
        ttl=3,
    )
    _collect(router)
    delivered = _collect(router)
    registry_msgs = [m for m in delivered if m.topic == TOPIC_TOOL_REGISTRY]
    assert len(registry_msgs) == 1


def test_read_file_success(tmp_path: Any) -> None:
    router = BusRouter()
    _module(router, tmp_path)
    _collect(router)

    file_path = tmp_path / "note.txt"
    file_path.write_text("line one\nline two\nline three\n", encoding="utf-8")

    router.publish(
        source="test",
        topic=TOPIC_TOOL_REQUEST,
        channel="control",
        payload={
            "tool_call_id": "call-1",
            "tool": "read_file",
            "arguments": {"path": str(file_path), "offset": 1, "limit": 1},
        },
        priority=5,
        ttl=3,
    )
    _collect(router)
    delivered = _collect(router)

    result_msgs = [m for m in delivered if m.topic == TOPIC_TOOL_RESULT]
    assert len(result_msgs) == 1
    payload = result_msgs[0].payload
    assert payload["tool_call_id"] == "call-1"
    assert payload["tool"] == "read_file"
    assert payload["output"]["returned_lines"] == 1
    assert payload["output"]["content"] == "line two\n"


def test_read_file_outside_allowed_root_fails(tmp_path: Any) -> None:
    router = BusRouter()
    _module(router, tmp_path)
    _collect(router)

    router.publish(
        source="test",
        topic=TOPIC_TOOL_REQUEST,
        channel="control",
        payload={
            "tool_call_id": "call-2",
            "tool": "read_file",
            "arguments": {"path": "../secret.txt"},
        },
        priority=5,
        ttl=3,
    )
    _collect(router)
    delivered = _collect(router)

    fail_msgs = [m for m in delivered if m.topic == TOPIC_TOOL_FAILED]
    assert len(fail_msgs) == 1
    assert "outside allowed" in fail_msgs[0].payload["error"]


def test_list_directory_success(tmp_path: Any) -> None:
    router = BusRouter()
    _module(router, tmp_path)
    _collect(router)

    (tmp_path / "alpha.txt").write_text("a", encoding="utf-8")
    (tmp_path / "beta").mkdir()

    router.publish(
        source="test",
        topic=TOPIC_TOOL_REQUEST,
        channel="control",
        payload={
            "tool_call_id": "call-3",
            "tool": "list_directory",
            "arguments": {"path": str(tmp_path)},
        },
        priority=5,
        ttl=3,
    )
    _collect(router)
    delivered = _collect(router)

    result_msgs = [m for m in delivered if m.topic == TOPIC_TOOL_RESULT]
    assert len(result_msgs) == 1
    entries = {
        e["name"]: e["type"]
        for e in result_msgs[0].payload["output"]["entries"]
    }
    assert entries.get("alpha.txt") == "file"
    assert entries.get("beta") == "directory"


def test_search_notes(tmp_path: Any) -> None:
    router = BusRouter()
    _module(router, tmp_path)
    _collect(router)

    (tmp_path / "a.txt").write_text("rainy morning\n", encoding="utf-8")
    (tmp_path / "b.txt").write_text("sunny afternoon\n", encoding="utf-8")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "c.txt").write_text("rainy evening\n", encoding="utf-8")

    router.publish(
        source="test",
        topic=TOPIC_TOOL_REQUEST,
        channel="control",
        payload={
            "tool_call_id": "call-4",
            "tool": "search_notes",
            "arguments": {"query": "rainy"},
        },
        priority=5,
        ttl=3,
    )
    _collect(router)
    delivered = _collect(router)

    result_msgs = [m for m in delivered if m.topic == TOPIC_TOOL_RESULT]
    assert len(result_msgs) == 1
    output = result_msgs[0].payload["output"]
    assert output["query"] == "rainy"
    assert len(output["matches"]) == 2


def test_run_read_only_script(tmp_path: Any) -> None:
    router = BusRouter()
    script_path = tmp_path / "hello.py"
    script_path.write_text("print('hello from tool')\n", encoding="utf-8")

    _module(router, tmp_path, enable_scripts=True)
    _collect(router)

    router.publish(
        source="test",
        topic=TOPIC_TOOL_REQUEST,
        channel="control",
        payload={
            "tool_call_id": "call-5",
            "tool": "run_read_only_script",
            "arguments": {"script_path": str(script_path)},
        },
        priority=5,
        ttl=3,
    )
    _collect(router)
    delivered = _collect(router)

    result_msgs = [m for m in delivered if m.topic == TOPIC_TOOL_RESULT]
    assert len(result_msgs) == 1
    output = result_msgs[0].payload["output"]
    assert output["returncode"] == 0
    assert "hello from tool" in output["stdout"]


def test_run_script_disabled_by_config(tmp_path: Any) -> None:
    router = BusRouter()
    _module(router, tmp_path, enable_scripts=False)
    _collect(router)

    script_path = tmp_path / "noop.py"
    script_path.write_text("print('noop')\n", encoding="utf-8")

    router.publish(
        source="test",
        topic=TOPIC_TOOL_REQUEST,
        channel="control",
        payload={
            "tool_call_id": "call-6",
            "tool": "run_read_only_script",
            "arguments": {"script_path": str(script_path)},
        },
        priority=5,
        ttl=3,
    )
    _collect(router)
    delivered = _collect(router)

    fail_msgs = [m for m in delivered if m.topic == TOPIC_TOOL_FAILED]
    assert len(fail_msgs) == 1
    assert "disabled" in fail_msgs[0].payload["error"]


def test_unknown_tool_fails(tmp_path: Any) -> None:
    router = BusRouter()
    _module(router, tmp_path)
    _collect(router)

    router.publish(
        source="test",
        topic=TOPIC_TOOL_REQUEST,
        channel="control",
        payload={
            "tool_call_id": "call-7",
            "tool": "delete_everything",
            "arguments": {},
        },
        priority=5,
        ttl=3,
    )
    _collect(router)
    delivered = _collect(router)

    fail_msgs = [m for m in delivered if m.topic == TOPIC_TOOL_FAILED]
    assert len(fail_msgs) == 1
    assert "unknown tool" in fail_msgs[0].payload["error"]


def test_serialization_roundtrip(tmp_path: Any) -> None:
    router = BusRouter()
    module = _module(router, tmp_path, enable_scripts=True)
    data = module.to_dict()
    module2 = ToolUseModule(name="tool_use")
    module2.from_dict(data)

    assert [str(p) for p in module2._allowed_paths] == [str(tmp_path)]
    assert module2._enable_scripts is True
    assert module2._script_timeout == 5.0
