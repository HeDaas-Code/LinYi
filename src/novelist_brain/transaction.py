"""Lightweight transaction support for the novelist brain.

Design.md §14.7 要求关键操作具备事务边界。这里提供一个不依赖外部存储
的事务管理器：在事务开始时捕获相关模块的 ``to_dict()`` 快照，事务失败
时通过 ``from_dict()`` 回滚，成功时丢弃快照。

支持的事务粒度：
- **模块级**：单个模块内的一次操作。
- **网络级**：DMN / CEN / SN 等网络模块的联合状态。
- **全局**：一次 tick 内所有模块的整体状态。
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any


@dataclass
class Operation:
    """A single operation inside a transaction."""

    module: str
    op_type: str
    payload: Any = None


class Transaction:
    """A transaction snapshot for a set of modules.

    The snapshot is captured lazily when a module is first touched via
    ``touch()`` or eagerly when ``begin()`` is called with ``eager=True``.
    """

    def __init__(
        self,
        tx_id: str,
        modules: dict[str, Any],
        context: dict[str, Any],
        start_tick: int = 0,
    ) -> None:
        self.id = tx_id
        self.modules = modules
        self.context = context
        self.start_tick = start_tick
        self.operations: list[Operation] = []
        self._snapshots: dict[str, dict[str, Any]] = {}
        self._committed = False
        self._rolled_back = False

    def touch(self, module_name: str) -> None:
        """Record a snapshot of ``module_name`` if not already captured."""
        if module_name in self._snapshots:
            return
        module = self.modules.get(module_name)
        if module is None:
            raise KeyError(f"Unknown module: {module_name}")
        self._snapshots[module_name] = module.to_dict()

    def record(self, module_name: str, op_type: str, payload: Any = None) -> None:
        """Record an operation and ensure the module snapshot exists."""
        self.touch(module_name)
        self.operations.append(
            Operation(module=module_name, op_type=op_type, payload=payload)
        )

    def commit(self) -> None:
        """Commit the transaction and discard snapshots."""
        if self._committed or self._rolled_back:
            return
        self._committed = True
        self._snapshots.clear()

    def rollback(self) -> list[str]:
        """Restore all touched modules from their snapshots.

        Returns the list of module names that were restored. Modules whose
        ``from_dict`` raises an exception are skipped and reported via the
        bus if a router is available.
        """
        if self._committed or self._rolled_back:
            return []
        self._rolled_back = True

        llm_service = self.context.get("llm_service")
        restored: list[str] = []
        for module_name, snapshot in self._snapshots.items():
            module = self.modules.get(module_name)
            if module is None:
                continue
            try:
                if llm_service is not None:
                    module.from_dict(snapshot, llm_service=llm_service)
                else:
                    module.from_dict(snapshot)
                restored.append(module_name)
            except Exception as exc:
                self._emit_rollback_failed(module_name, exc)
        self._snapshots.clear()
        return restored

    def _emit_rollback_failed(self, module_name: str, exc: Exception) -> None:
        router = self.context.get("bus")
        if router is None:
            return
        router.publish(
            source="transaction_manager",
            topic="control.transaction.rollback_failed",
            channel="control",
            payload={
                "transaction_id": self.id,
                "module": module_name,
                "error": str(exc),
            },
            priority=9,
            ttl=10,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "start_tick": self.start_tick,
            "committed": self._committed,
            "rolled_back": self._rolled_back,
            "operations": [
                {"module": op.module, "op_type": op.op_type, "payload": op.payload}
                for op in self.operations
            ],
            "snapshots": list(self._snapshots.keys()),
        }


class TransactionManager:
    """Coordinates transactions across modules.

    ``TransactionManager`` is intentionally thin: it does not intercept the bus.
    Callers (typically ``main.py`` or a recovery primitive) explicitly
    ``begin()`` a transaction around a critical operation and ``commit()`` or
    ``rollback()`` when done.
    """

    def __init__(
        self,
        modules: list[Any],
        context: dict[str, Any],
    ) -> None:
        self._modules = {module.name: module for module in modules}
        self._context = context
        self._active: Transaction | None = None
        self._history: list[Transaction] = []

    @property
    def active(self) -> Transaction | None:
        return self._active

    def begin(
        self,
        tx_id: str | None = None,
        eager: bool = False,
        start_tick: int = 0,
    ) -> Transaction:
        """Start a new transaction.

        If ``eager=True``, snapshots all modules immediately (global tick-level
        transaction). Otherwise snapshots are captured lazily as modules are
        touched.
        """
        if self._active is not None:
            raise RuntimeError(
                f"Transaction {self._active.id} is already active"
            )
        tx = Transaction(
            tx_id or f"tx-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
            self._modules,
            self._context,
            start_tick=start_tick,
        )
        if eager:
            for name in self._modules:
                tx.touch(name)
        self._active = tx
        return tx

    def commit(self) -> None:
        """Commit the active transaction and archive it."""
        if self._active is None:
            raise RuntimeError("No active transaction to commit")
        self._active.commit()
        self._history.append(self._active)
        self._active = None

    def rollback(self) -> list[str]:
        """Rollback the active transaction and archive it."""
        if self._active is None:
            raise RuntimeError("No active transaction to rollback")
        restored = self._active.rollback()
        self._history.append(self._active)
        self._active = None
        return restored

    def in_transaction(self) -> bool:
        return self._active is not None

    def get_history(self, limit: int = 10) -> list[Transaction]:
        return self._history[-limit:]

    def to_dict(self) -> dict[str, Any]:
        return {
            "active": self._active.to_dict() if self._active else None,
            "history_count": len(self._history),
            "history": [tx.to_dict() for tx in self._history[-5:]],
        }