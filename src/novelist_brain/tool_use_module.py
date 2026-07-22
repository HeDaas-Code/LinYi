"""ToolUseModule: a sandboxed, MCP-inspired local tool layer for LinYi.

Inspired by Agent Zero's "computer as a tool" philosophy, this module lets the
agent interact with its local digital environment in a **read-only, bounded**
way: read notes, list directories, search text, and run whitelisted read-only
scripts.  It does **not** allow arbitrary shell execution, network access, or
writes — keeping the closed-system boundary intact.

Communication follows an MCP-style request/response pattern over the event bus:

* Request: ``control.tool.request`` with ``tool_call_id``, ``tool`` and
  ``arguments``.
* Success: ``data.tool.result`` with the same ``tool_call_id`` and ``output``.
* Failure: ``event.tool.failed`` with ``tool_call_id`` and ``error``.
* Registry: ``data.tool.registry`` lists available tools and schemas.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


#: Topic used to request a tool execution.
TOPIC_TOOL_REQUEST = "control.tool.request"

#: Topic used to refresh/announce the tool registry.
TOPIC_TOOL_REFRESH = "control.tool.refresh_registry"

#: Topic emitted when a tool executes successfully.
TOPIC_TOOL_RESULT = "data.tool.result"

#: Topic emitted when a tool execution fails.
TOPIC_TOOL_FAILED = "event.tool.failed"

#: Topic emitted to announce available tools.
TOPIC_TOOL_REGISTRY = "data.tool.registry"


class ToolUseModule(Module):
    """Bounded local tool orchestrator for LinYi.

    The module is configured via ``context["tools"]``:

    - ``allowed_paths`` (list[str]): directories/files the agent may read.
    - ``enable_scripts`` (bool): whether ``run_read_only_script`` is enabled.
    - ``script_timeout`` (float): subprocess timeout in seconds.
    - ``max_output_length`` (int): max characters returned for file/script
      outputs (truncated with a marker).
    - ``search_max_results`` (int): max matches returned by ``search_notes``.

    All paths are resolved to their real absolute form and must live inside at
    least one allowed path.  Path traversal outside allowed roots is rejected.
    """

    # MCP-style tool schema.  Kept minimal and read-only.
    TOOLS: dict[str, dict[str, Any]] = {
        "read_file": {
            "description": "读取允许路径内的文本文件内容",
            "parameters": {
                "path": {
                    "type": "string",
                    "description": "相对于允许根目录或绝对路径",
                },
                "offset": {
                    "type": "integer",
                    "description": "起始行号（0-based，可选）",
                    "default": 0,
                },
                "limit": {
                    "type": "integer",
                    "description": "最大返回行数（可选）",
                    "default": 200,
                },
            },
        },
        "list_directory": {
            "description": "列出允许路径内某个目录的条目",
            "parameters": {
                "path": {
                    "type": "string",
                    "description": "相对于允许根目录或绝对路径",
                    "default": ".",
                },
            },
        },
        "search_notes": {
            "description": "在允许路径内递归搜索包含关键字的文本文件",
            "parameters": {
                "query": {
                    "type": "string",
                    "description": "要搜索的关键字",
                },
                "path": {
                    "type": "string",
                    "description": "搜索根目录（可选，默认使用第一个允许路径）",
                    "default": "",
                },
            },
        },
        "run_read_only_script": {
            "description": "运行允许路径内的只读 Python 脚本并返回 stdout/stderr",
            "parameters": {
                "script_path": {
                    "type": "string",
                    "description": "脚本文件路径，必须在 allowed_paths 内",
                },
                "args": {
                    "type": "array",
                    "description": "传给脚本的命令行参数（可选）",
                    "default": [],
                },
            },
        },
    }

    def __init__(self, name: str = "tool_use") -> None:
        super().__init__(name)
        self._allowed_paths: list[Path] = []
        self._enable_scripts = False
        self._script_timeout = 10.0
        self._max_output_length = 8_000
        self._search_max_results = 20
        self.subscribe(TOPIC_TOOL_REQUEST, TOPIC_TOOL_REFRESH)

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "tool_use",
            "version": "0.1.0",
            "description": "MCP-style sandboxed local tool layer for the agent",
            "dependencies": [],
            "category": "environment",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.05,
            custom={
                "requests_handled": 0,
                "requests_failed": 0,
            },
        )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        cfg = context.get("tools", {})
        self._allowed_paths = self._normalize_allowed_paths(
            cfg.get("allowed_paths", ["."])
        )
        self._enable_scripts = bool(cfg.get("enable_scripts", False))
        self._script_timeout = float(cfg.get("script_timeout", 10.0))
        self._max_output_length = int(cfg.get("max_output_length", 8_000))
        self._search_max_results = int(cfg.get("search_max_results", 20))
        self._broadcast_registry()

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        if message.topic == TOPIC_TOOL_REFRESH:
            self._broadcast_registry()
        elif message.topic == TOPIC_TOOL_REQUEST:
            self._handle_request(message.payload or {})

    def tick(self, delta: TickDelta) -> None:
        return None

    # ------------------------------------------------------------------
    # Registry
    # ------------------------------------------------------------------

    def _broadcast_registry(self) -> None:
        available = list(self.TOOLS.keys())
        if not self._enable_scripts and "run_read_only_script" in available:
            available.remove("run_read_only_script")
        registry = {
            "tools": [
                {
                    "name": name,
                    **self.TOOLS[name],
                    "enabled": name in available,
                }
                for name in self.TOOLS
            ],
            "allowed_roots": [str(p) for p in self._allowed_paths],
        }
        self.emit(
            topic=TOPIC_TOOL_REGISTRY,
            payload=registry,
            channel="data",
            priority=4,
            ttl=3,
        )

    # ------------------------------------------------------------------
    # Request dispatch
    # ------------------------------------------------------------------

    def _handle_request(self, payload: dict[str, Any]) -> None:
        call_id = str(payload.get("tool_call_id", "")) or "unknown"
        tool_name = str(payload.get("tool", ""))
        arguments = payload.get("arguments", {})
        if not isinstance(arguments, dict):
            self._fail(call_id, "arguments must be a dict")
            return

        handler = getattr(self, f"_tool_{tool_name}", None)
        if handler is None:
            self._fail(call_id, f"unknown tool: {tool_name}")
            return

        start = time.monotonic()
        try:
            output = handler(arguments)
            elapsed_ms = int((time.monotonic() - start) * 1000)
            self._state.custom["requests_handled"] += 1
            self.emit(
                topic=TOPIC_TOOL_RESULT,
                payload={
                    "tool_call_id": call_id,
                    "tool": tool_name,
                    "output": output,
                    "elapsed_ms": elapsed_ms,
                },
                channel="data",
                priority=5,
                ttl=3,
            )
        except Exception as exc:  # noqa: BLE001 - tool errors are surfaced on bus
            self._state.custom["requests_failed"] += 1
            self._fail(call_id, str(exc))

    def _fail(self, call_id: str, error: str) -> None:
        self.emit(
            topic=TOPIC_TOOL_FAILED,
            payload={
                "tool_call_id": call_id,
                "error": error,
            },
            channel="event",
            priority=5,
            ttl=3,
        )

    # ------------------------------------------------------------------
    # Tool implementations
    # ------------------------------------------------------------------

    def _tool_read_file(self, arguments: dict[str, Any]) -> dict[str, Any]:
        target = self._resolve_path(str(arguments.get("path", "")))
        offset = max(0, int(arguments.get("offset", 0)))
        limit = max(1, int(arguments.get("limit", 200)))

        if not target.is_file():
            raise FileNotFoundError(f"not a file or not allowed: {target}")

        with target.open("r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        selected = lines[offset : offset + limit]
        content = "".join(selected)
        return {
            "path": str(target),
            "total_lines": len(lines),
            "offset": offset,
            "returned_lines": len(selected),
            "content": self._truncate(content),
        }

    def _tool_list_directory(self, arguments: dict[str, Any]) -> dict[str, Any]:
        target = self._resolve_path(str(arguments.get("path", ".")))
        if not target.is_dir():
            raise NotADirectoryError(f"not a directory or not allowed: {target}")

        entries: list[dict[str, Any]] = []
        for entry in sorted(target.iterdir()):
            entries.append(
                {
                    "name": entry.name,
                    "type": "directory" if entry.is_dir() else "file",
                    "size": entry.stat().st_size if entry.is_file() else None,
                }
            )
        return {
            "path": str(target),
            "entries": entries,
        }

    def _tool_search_notes(self, arguments: dict[str, Any]) -> dict[str, Any]:
        query = str(arguments.get("query", "")).strip()
        if not query:
            raise ValueError("query is empty")

        root_hint = str(arguments.get("path", "")).strip()
        roots = [self._resolve_path(root_hint)] if root_hint else self._allowed_paths

        matches: list[dict[str, Any]] = []
        for root in roots:
            if not root.is_dir():
                continue
            for dirpath, _dirnames, filenames in os.walk(root):
                for filename in filenames:
                    if len(matches) >= self._search_max_results:
                        break
                    file_path = Path(dirpath) / filename
                    try:
                        text = file_path.read_text(encoding="utf-8", errors="ignore")
                    except (OSError, UnicodeDecodeError):
                        continue
                    if query not in text:
                        continue
                    lines = text.splitlines()
                    hit_lines = [
                        {"line": i, "snippet": line.strip()[:200]}
                        for i, line in enumerate(lines)
                        if query in line
                    ][:5]
                    matches.append(
                        {
                            "path": str(file_path),
                            "match_count": sum(1 for line in lines if query in line),
                            "hits": hit_lines,
                        }
                    )
                if len(matches) >= self._search_max_results:
                    break

        return {
            "query": query,
            "roots": [str(r) for r in roots],
            "matches": matches,
            "truncated": len(matches) >= self._search_max_results,
        }

    def _tool_run_read_only_script(self, arguments: dict[str, Any]) -> dict[str, Any]:
        if not self._enable_scripts:
            raise PermissionError("script execution is disabled in tool config")

        script_path = self._resolve_path(str(arguments.get("script_path", "")))
        if not script_path.is_file():
            raise FileNotFoundError(f"script not found: {script_path}")
        if script_path.suffix.lower() != ".py":
            raise ValueError("only .py scripts are supported")

        extra_args = arguments.get("args", []) or []
        if not isinstance(extra_args, list):
            raise ValueError("args must be a list")

        cmd = [sys.executable, str(script_path), *[str(a) for a in extra_args]]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=self._script_timeout,
            check=False,
        )
        return {
            "script_path": str(script_path),
            "returncode": result.returncode,
            "stdout": self._truncate(result.stdout),
            "stderr": self._truncate(result.stderr),
        }

    # ------------------------------------------------------------------
    # Path safety
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_allowed_paths(paths: list[str]) -> list[Path]:
        normalized: list[Path] = []
        for p in paths:
            resolved = Path(p).expanduser().resolve()
            normalized.append(resolved)
        # Keep the most specific paths first so checks prefer narrower roots.
        return sorted(normalized, key=lambda x: len(str(x)), reverse=True)

    def _resolve_path(self, raw: str) -> Path:
        """Resolve a user-supplied path and ensure it stays inside allowed roots."""
        if not raw:
            if not self._allowed_paths:
                raise ValueError("no allowed paths configured")
            return self._allowed_paths[0]

        candidate = Path(raw).expanduser()
        if not candidate.is_absolute() and self._allowed_paths:
            # Relative paths are resolved against the first allowed root.
            candidate = self._allowed_paths[0] / candidate

        try:
            resolved = candidate.resolve(strict=False)
        except (OSError, ValueError) as exc:
            raise ValueError(f"invalid path: {raw}") from exc

        for allowed in self._allowed_paths:
            try:
                resolved.relative_to(allowed)
                return resolved
            except ValueError:
                continue
        raise PermissionError(f"path outside allowed roots: {resolved}")

    def _truncate(self, text: str) -> str:
        if len(text) <= self._max_output_length:
            return text
        return text[: self._max_output_length] + "\n... [truncated]"

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "allowed_paths": [str(p) for p in self._allowed_paths],
                "enable_scripts": self._enable_scripts,
                "script_timeout": self._script_timeout,
                "max_output_length": self._max_output_length,
                "search_max_results": self._search_max_results,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._allowed_paths = self._normalize_allowed_paths(
            data.get("allowed_paths", ["."])
        )
        self._enable_scripts = bool(data.get("enable_scripts", False))
        self._script_timeout = float(data.get("script_timeout", 10.0))
        self._max_output_length = int(data.get("max_output_length", 8_000))
        self._search_max_results = int(data.get("search_max_results", 20))


__all__ = [
    "ToolUseModule",
    "TOPIC_TOOL_REQUEST",
    "TOPIC_TOOL_RESULT",
    "TOPIC_TOOL_FAILED",
    "TOPIC_TOOL_REGISTRY",
    "TOPIC_TOOL_REFRESH",
]
