"""FastAPI web dashboard for the novelist brain agent.

The dashboard exposes REST endpoints for modules, memory, sandbox, novel output,
EOS metrics and configuration, plus a WebSocket endpoint for live updates.  It is
intended to be started in a background thread by ``main.py``.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from src.novelist_brain.persistence import dataclass_to_dict
from src.novelist_brain.web.state_provider import get_provider
from src.novelist_brain.web.websocket import broadcast_update, ws_router


_HERE = Path(__file__).resolve().parent
_STATIC_DIR = _HERE / "static"
_TEMPLATES_DIR = _HERE / "templates"


def _load_static_html(name: str) -> str:
    path = _TEMPLATES_DIR / name
    if path.exists():
        return path.read_text(encoding="utf-8")
    return f"<!-- template {name} not found -->"


def _json_response(data: Any) -> JSONResponse:
    return JSONResponse(content=json.loads(json.dumps(data, ensure_ascii=False, default=str)))


api_router = APIRouter(prefix="/api")


@api_router.get("/snapshot")
def api_snapshot() -> JSONResponse:
    return _json_response(get_provider().snapshot())


@api_router.get("/modules")
def api_modules() -> JSONResponse:
    return _json_response(get_provider().module_states())


@api_router.get("/modules/{name}")
def api_module(name: str) -> JSONResponse:
    module = get_provider().module(name)
    if module is None:
        raise HTTPException(status_code=404, detail=f"module {name} not found")
    try:
        state = module.get_state()
        return _json_response(state.to_dict() if hasattr(state, "to_dict") else dict(state))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.get("/bus/events")
def api_bus_events(limit: int = 50) -> JSONResponse:
    provider = get_provider()
    router = provider.router
    if router is None:
        return _json_response([])
    # Recent events are captured by the bus spy attached to the router.
    spy = getattr(router, "_web_ui_spy", None)
    if spy is None:
        return _json_response([])
    return _json_response(spy.recent(limit))


@api_router.get("/memory/graph")
def api_memory_graph() -> JSONResponse:
    provider = get_provider()
    memory = provider.module("memory_system")
    if memory is None or not hasattr(memory, "export_graph"):
        return _json_response({"nodes": [], "edges": []})
    try:
        return _json_response(memory.export_graph())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.get("/sandbox/world")
def api_sandbox_world() -> JSONResponse:
    provider = get_provider()
    sandbox = provider.module("mental_sandbox")
    if sandbox is None:
        raise HTTPException(status_code=404, detail="sandbox not found")
    try:
        world = sandbox.world_model
        if world is None:
            return _json_response({})
        return _json_response(
            world.to_dict() if hasattr(world, "to_dict") else dataclass_to_dict(world)
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.get("/sandbox/characters")
def api_sandbox_characters() -> JSONResponse:
    provider = get_provider()
    sandbox = provider.module("mental_sandbox")
    if sandbox is None:
        raise HTTPException(status_code=404, detail="sandbox not found")
    try:
        sheets = getattr(sandbox, "_character_sheets", {})
        return _json_response(
            {
                cid: (
                    sheet.to_dict()
                    if hasattr(sheet, "to_dict")
                    else dataclass_to_dict(sheet)
                )
                for cid, sheet in sheets.items()
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.get("/sandbox/versions")
def api_sandbox_versions() -> JSONResponse:
    provider = get_provider()
    sandbox = provider.module("mental_sandbox")
    if sandbox is None:
        raise HTTPException(status_code=404, detail="sandbox not found")
    vm = getattr(sandbox, "_version_manager", None)
    if vm is None:
        return _json_response({"current": None, "versions": []})
    return _json_response(vm.to_dict())


@api_router.get("/novel/manuscript")
def api_novel_manuscript() -> JSONResponse:
    provider = get_provider()
    novel = provider.module("novel_output")
    if novel is None:
        raise HTTPException(status_code=404, detail="novel output not found")
    try:
        paragraphs = getattr(novel, "_paragraphs", [])
        return _json_response(
            {
                "title": getattr(novel, "_title", "未命名"),
                "paragraphs": paragraphs,
                "paragraph_count": len(paragraphs),
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.get("/eos/metrics")
def api_eos_metrics() -> JSONResponse:
    provider = get_provider()
    eos = provider.module("eos")
    if eos is None:
        raise HTTPException(status_code=404, detail="eos not found")
    try:
        state = eos.get_state()
        return _json_response(state.to_dict() if hasattr(state, "to_dict") else dict(state))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.get("/config")
def api_config() -> JSONResponse:
    cfg = get_provider().context_value("config")
    if cfg is None:
        return _json_response({})
    try:
        return _json_response(cfg.to_dict() if hasattr(cfg, "to_dict") else dict(cfg))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.post("/config")
async def api_update_config(request: Request) -> JSONResponse:
    payload = await request.json()
    # For safety, updates are applied only to the in-memory config object.
    cfg = get_provider().context_value("config")
    if cfg is None:
        raise HTTPException(status_code=404, detail="config not found")
    for section, values in payload.items():
        if hasattr(cfg, section) and isinstance(values, dict):
            section_obj = getattr(cfg, section)
            for key, value in values.items():
                if hasattr(section_obj, key):
                    setattr(section_obj, key, value)
    await broadcast_update({"topic": "config.updated", "payload": payload})
    return _json_response({"ok": True})


@api_router.post("/control/{topic}")
async def api_control(topic: str, request: Request) -> JSONResponse:
    """Emit a control message onto the bus (e.g. sandbox.build, sandbox.simulate)."""
    provider = get_provider()
    router = provider.router
    if router is None:
        raise HTTPException(status_code=503, detail="bus not available")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    router.publish(
        source="web_ui",
        topic=topic,
        channel="control",
        payload=payload,
        priority=7,
        ttl=5,
    )
    router.flush()
    await broadcast_update({"topic": topic, "payload": payload})
    return _json_response({"ok": True, "topic": topic})


def create_app() -> FastAPI:
    @asynccontextmanager
    async def _lifespan(app: FastAPI) -> Any:
        async def _broadcast_loop() -> None:
            while True:
                try:
                    await broadcast_update(get_provider().snapshot())
                except Exception:
                    pass
                await asyncio.sleep(2.0)

        task = asyncio.create_task(_broadcast_loop())
        yield
        task.cancel()

    app = FastAPI(
        title="Novelist Brain Dashboard",
        version="0.1.0",
        lifespan=_lifespan,
    )

    if _STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

    app.include_router(api_router)
    app.include_router(ws_router)

    @app.get("/")
    async def index() -> HTMLResponse:
        return HTMLResponse(content=_load_static_html("index.html"))

    @app.get("/health")
    async def health() -> JSONResponse:
        return _json_response({"status": "ok"})

    return app
