"""WebSocket endpoint for pushing live dashboard updates.

Clients connect to ``/ws`` and receive a JSON snapshot immediately, followed by
periodic refreshes of module states, EOS metrics, and important bus events.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.novelist_brain.web.state_provider import get_provider


ws_router = APIRouter()


class ConnectionManager:
    """Simple manager for active WebSocket connections."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        if not self._connections:
            return
        payload = json.dumps(message, ensure_ascii=False, default=str)
        # Snapshot the set so disconnects during iteration are safe.
        for connection in list(self._connections):
            try:
                await connection.send_text(payload)
            except Exception:
                self._connections.discard(connection)


manager = ConnectionManager()


def _build_snapshot() -> dict[str, Any]:
    provider = get_provider()
    snapshot = provider.snapshot()
    snapshot["type"] = "snapshot"
    return snapshot


@ws_router.websocket("/ws")
async def dashboard_websocket(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        await websocket.send_json(_build_snapshot())
        while True:
            # Keep the connection alive and push periodic updates.
            # Clients may send "ping" or a refresh request.
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=2.0)
            except asyncio.TimeoutError:
                raw = None

            if raw in (None, "ping"):
                await websocket.send_json({"type": "pong"})
            elif raw == "snapshot":
                await websocket.send_json(_build_snapshot())
            else:
                await websocket.send_json({"type": "echo", "data": raw})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


async def broadcast_update(message: dict[str, Any]) -> None:
    """Broadcast an arbitrary update to all connected clients."""
    await manager.broadcast({"type": "update", "payload": message})
