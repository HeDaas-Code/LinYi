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
# Production Vue 3 bundle produced by ``src/webui`` (Vite builds into here,
# see ``src/webui/vite.config.ts``). When present, the dashboard serves the
# new SPA from this directory; otherwise we fall back to the legacy
# templates/index.html single-page dashboard.
_VUE_DIST_DIR = _STATIC_DIR / "dist"


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
        # NovelOutput exposes public ``paragraphs`` / ``title`` (no underscore).
        # Earlier code read ``_paragraphs`` / ``_title`` which never exist,
        # so the endpoint always returned an empty manuscript.
        paragraphs = list(getattr(novel, "paragraphs", []) or [])
        title = getattr(novel, "title", "未命名")
        author_name = getattr(novel, "author_name", "林逸")
        version = int(getattr(novel, "version", 0) or 0)
        world_settings = getattr(novel, "world_settings", {}) or {}
        latest_paragraph = paragraphs[-1] if paragraphs else None
        return _json_response(
            {
                "title": title,
                "author_name": author_name,
                "version": version,
                "paragraphs": paragraphs,
                "paragraph_count": len(paragraphs),
                "published_count": len(paragraphs),
                "latest_paragraph": latest_paragraph,
                "world_settings": world_settings,
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


# ---------------------------------------------------------------------------
# Phase 1 WebUI refactor endpoints (audit-driven redesign).
#
# These endpoints back the new Vue 3 dashboard introduced in
# ``docs/WEBUI-REFACTOR.md`` Phase 1: identity profile, daily schedule,
# topbar state. They live alongside the legacy endpoints above so the old
# single-page dashboard keeps working while the Vue app is rolled out.
# ---------------------------------------------------------------------------


def _module_to_dict(module: Any) -> dict[str, Any] | None:
    """Best-effort serialization of a module's full state for the WebUI."""
    if module is None:
        return None
    if hasattr(module, "to_dict"):
        try:
            return module.to_dict()
        except Exception:
            pass
    try:
        state = module.get_state()
    except Exception:
        return None
    if hasattr(state, "to_dict"):
        return state.to_dict()
    if hasattr(state, "__dataclass_fields__"):
        return dataclass_to_dict(state)
    if isinstance(state, dict):
        return dict(state)
    return {}


@api_router.get("/identity")
def api_identity() -> JSONResponse:
    """Return LinYiProfile + identity core runtime state (WebUI Phase 1)."""
    provider = get_provider()
    identity = provider.module("identity_core")
    if identity is None:
        raise HTTPException(status_code=404, detail="identity_core not registered")
    profile = getattr(identity, "_profile", None) or getattr(identity, "profile", None)
    profile_dict = dataclass_to_dict(profile) if profile is not None else {}
    constraints = {}
    try:
        constraints = identity.get_constraints() if hasattr(identity, "get_constraints") else {}
    except Exception:
        pass
    state = _module_to_dict(identity) or {}
    return _json_response(
        {
            "profile": profile_dict,
            "constraints": constraints,
            "state": state,
        }
    )


@api_router.get("/identity/history")
def api_identity_history() -> JSONResponse:
    """Return trait evolution history (WebUI Phase 1).

    IdentityCore does not yet record a trait history; we expose the endpoint
    with an empty list so the frontend can render the timeline component
    without crashing today and surface real data as soon as the backend
    starts tracking deltas.
    """
    provider = get_provider()
    identity = provider.module("identity_core")
    history = []
    if identity is not None:
        # Read an optional ``_trait_history`` field if a future IdentityCore
        # starts recording one; otherwise return an empty list.
        raw = getattr(identity, "_trait_history", None)
        if isinstance(raw, list):
            history = raw
    return _json_response({"history": history})


def _serialize_plan(plan: Any, clock: Any) -> dict[str, Any]:
    """Serialize a DailyPlan + current clock snapshot for the schedule view."""
    phases = []
    if plan is not None and hasattr(plan, "phases"):
        for phase in plan.phases:
            phases.append(
                {
                    "id": phase.id,
                    "phase_type": phase.phase_type,
                    "planned_start": phase.planned_start.strftime("%H:%M"),
                    "planned_end": phase.planned_end.strftime("%H:%M"),
                    "planned_start_minutes": phase.planned_start_minutes,
                    "planned_end_minutes": phase.planned_end_minutes,
                    "planned_duration_minutes": phase.planned_duration_minutes,
                    "min_duration_minutes": phase.min_duration_minutes,
                    "max_duration_minutes": phase.max_duration_minutes,
                    "energy_budget": phase.energy_budget,
                    "preferred_network": phase.preferred_network,
                }
            )
    current_phase_info = None
    if clock is not None and hasattr(clock, "current_phase_info"):
        info = clock.current_phase_info
        if info is not None:
            current_phase_info = {
                "id": info.id,
                "phase_type": info.phase_type,
                "planned_start": info.planned_start.strftime("%H:%M"),
                "planned_end": info.planned_end.strftime("%H:%M"),
                "preferred_network": info.preferred_network,
                "energy_budget": info.energy_budget,
            }
    return {
        "date": plan.date.isoformat() if plan is not None and hasattr(plan, "date") else None,
        "fallback": bool(getattr(plan, "fallback", False)) if plan is not None else False,
        "phases": phases,
        "current_phase_info": current_phase_info,
    }


@api_router.get("/schedule/today")
def api_schedule_today() -> JSONResponse:
    """Return today's daily plan + current clock snapshot (WebUI Phase 1)."""
    provider = get_provider()
    # The clock is exposed via the provider's context under "clock" (set by
    # main.py at startup). Fall back gracefully when the agent isn't running.
    clock = provider.context_value("clock")
    scheduler = provider.context_value("scheduler")
    plan = None
    if clock is not None and hasattr(clock, "daily_plan"):
        plan = clock.daily_plan
    if plan is None and scheduler is not None and hasattr(scheduler, "plan_day"):
        try:
            plan = scheduler.plan_day(provider.full_context())
        except Exception:
            plan = None
    schedule = _serialize_plan(plan, clock)
    clock_snapshot = {
        "tick": getattr(clock, "tick", 0) if clock is not None else 0,
        "hour": getattr(clock, "hour", 0.0) if clock is not None else 0.0,
        "phase": getattr(clock, "phase", "") if clock is not None else "",
        "absolute_time_ms": getattr(clock, "absolute_time_ms", 0.0) if clock is not None else 0.0,
        "now": clock.now().isoformat() if clock is not None and hasattr(clock, "now") else None,
        "is_fast_forward": bool(getattr(clock, "is_fast_forward", False)) if clock is not None else False,
        "tick_interval_seconds": getattr(clock, "tick_interval_seconds", 0.0) if clock is not None else 0.0,
    }
    # Energy history from metabolism for the schedule energy curve overlay.
    metabolism = provider.module("metabolism")
    energy_history = []
    if metabolism is not None:
        raw_history = getattr(metabolism, "_energy_history", None)
        if isinstance(raw_history, list):
            energy_history = list(raw_history)
        resources = getattr(metabolism, "resources", None)
        if resources is not None:
            clock_snapshot["energy"] = float(getattr(resources, "energy", 0.0))
    return _json_response(
        {
            "schedule": schedule,
            "clock": clock_snapshot,
            "energy_history": energy_history,
        }
    )


@api_router.get("/networks/state")
def api_networks_state() -> JSONResponse:
    """Return SN/DMN/CEN state + energy + alert count for the topbar."""
    provider = get_provider()
    sn = _module_to_dict(provider.module("salience_network")) or {}
    dmn = _module_to_dict(provider.module("dmn")) or {}
    cen = _module_to_dict(provider.module("central_executive_network")) or {}
    metabolism = _module_to_dict(provider.module("metabolism")) or {}

    # Topbar essentials: current phase, energy, mood, alert count.
    clock = provider.context_value("clock")
    phase = ""
    hour = 0.0
    if clock is not None:
        phase = getattr(clock, "phase", "") or ""
        hour = float(getattr(clock, "hour", 0.0) or 0.0)

    energy = 0.0
    resources = metabolism.get("resources") if isinstance(metabolism, dict) else None
    if isinstance(resources, dict):
        energy = float(resources.get("energy", 0.0) or 0.0)

    # Mood: metabolism does not store a mood; fall back to the LinYi
    # profile's baseline_mood so the topbar always has something to show.
    mood = None
    if isinstance(metabolism, dict):
        mood = metabolism.get("mood") or metabolism.get("baseline_mood")
    if mood is None:
        identity = provider.module("identity_core")
        if identity is not None:
            profile = getattr(identity, "_profile", None) or getattr(identity, "profile", None)
            if profile is not None and hasattr(profile, "baseline_mood"):
                bm = getattr(profile, "baseline_mood", None)
                if isinstance(bm, dict):
                    mood = bm

    # Active alert count from EOS, if available.
    # EOS.get_state() returns a flat dict with ``latest_report`` (which
    # itself contains ``alerts``); earlier code mistakenly looked for
    # ``custom.alerts`` which never exists.
    eos = provider.module("eos")
    alert_count = 0
    if eos is not None:
        try:
            eos_state = eos.get_state()
            if isinstance(eos_state, dict):
                latest = eos_state.get("latest_report")
                if isinstance(latest, dict):
                    alerts = latest.get("alerts")
                    if isinstance(alerts, list):
                        alert_count = len(alerts)
        except Exception:
            alert_count = 0

    return _json_response(
        {
            "phase": phase,
            "hour": hour,
            "energy": energy,
            "mood": mood,
            "alert_count": alert_count,
            "networks": {
                "sn": sn,
                "dmn": dmn,
                "cen": cen,
            },
            "metabolism": metabolism,
        }
    )


# ---------------------------------------------------------------------------
# Phase 2 WebUI refactor endpoints.
#
# These back the 网络状态 detail panels, 日记·反思 view, EOS 观测台 history,
# and 记忆宫殿 list/timeline. Each is intentionally narrow so the Vue app
# can fetch only what a given view needs rather than parsing the full
# /api/snapshot payload.
# ---------------------------------------------------------------------------


def _fragment_to_dict(fragment: Any) -> dict[str, Any]:
    """Serialize a Fragment for the WebUI."""
    if fragment is None:
        return {}
    if hasattr(fragment, "to_dict"):
        return fragment.to_dict()
    if hasattr(fragment, "__dataclass_fields__"):
        return dataclass_to_dict(fragment)
    if isinstance(fragment, dict):
        return dict(fragment)
    return {}


def _trace_to_dict(trace: Any) -> dict[str, Any]:
    """Serialize a Trace for the WebUI."""
    if trace is None:
        return {}
    if hasattr(trace, "to_dict"):
        return trace.to_dict()
    if hasattr(trace, "__dataclass_fields__"):
        return dataclass_to_dict(trace)
    if isinstance(trace, dict):
        return dict(trace)
    return {}


@api_router.get("/dmn/reflections")
def api_dmn_reflections(limit: int = 20) -> JSONResponse:
    """Return the DMN reflection buffer (WebUI Phase 2: 日记·反思).

    The DMN keeps at most ~20 reflection Fragments in a FIFO buffer. We
    return them newest-first so the Vue timeline can render top-down.
    """
    provider = get_provider()
    dmn = provider.module("dmn")
    if dmn is None:
        return _json_response({"reflections": [], "mood_estimate": None})
    buffer = getattr(dmn, "_reflection_buffer", None)
    items: list[dict[str, Any]] = []
    if isinstance(buffer, list):
        # Newest first; clamp to requested limit.
        for fragment in reversed(buffer[-limit:]):
            items.append(_fragment_to_dict(fragment))
    # DMN exposes an internal _estimate_mood() helper that computes a
    # {valence, arousal} snapshot from recent reflections + dreams.
    mood_estimate = None
    estimate = getattr(dmn, "_estimate_mood", None)
    if callable(estimate):
        try:
            mood_estimate = estimate()
        except Exception:
            mood_estimate = None
    return _json_response({"reflections": items, "mood_estimate": mood_estimate})


@api_router.get("/eos/reports")
def api_eos_reports(limit: int = 20) -> JSONResponse:
    """Return recent EOS evaluation reports (WebUI Phase 2: EOS 观测台).

    EOS keeps the last ~20 EvaluationReport instances in a deque. We expose
    them newest-first so the Vue timeline can render report history with
    their metrics + alerts.
    """
    provider = get_provider()
    eos = provider.module("eos")
    if eos is None:
        return _json_response({"reports": []})
    reports: list[dict[str, Any]] = []
    raw = getattr(eos, "_recent_reports", None)
    if isinstance(raw, list) or hasattr(raw, "__iter__"):
        try:
            items = list(raw)
        except Exception:
            items = []
        # Newest first
        for report in reversed(items[-limit:]):
            if hasattr(report, "to_dict"):
                reports.append(report.to_dict())
            elif isinstance(report, dict):
                reports.append(dict(report))
    return _json_response({"reports": reports})


@api_router.get("/memory/fragments")
def api_memory_fragments(
    limit: int = 100,
    source: str | None = None,
    sort: str = "recency",
) -> JSONResponse:
    """Return recent memory fragments (WebUI Phase 2: 记忆宫殿).

    Query params:
      - ``limit``    : max items (default 100, capped at 500)
      - ``source``   : filter by Fragment.source (personal/social/dream/...)
      - ``sort``     : ``recency`` (default) | ``salience`` | ``valence``
    """
    provider = get_provider()
    memory = provider.module("memory_system")
    if memory is None:
        return _json_response({"fragments": [], "total": 0})
    limit = max(1, min(int(limit), 500))
    fragments_map = getattr(memory, "_fragments", None)
    if not isinstance(fragments_map, dict):
        return _json_response({"fragments": [], "total": 0})

    items: list[Any] = list(fragments_map.values())
    if source:
        items = [f for f in items if getattr(f, "source", None) == source]
    if sort == "salience":
        items.sort(key=lambda f: getattr(f, "salience", 0.0), reverse=True)
    elif sort == "valence":
        items.sort(key=lambda f: getattr(f, "valence", 0.0), reverse=True)
    else:
        items.sort(key=lambda f: getattr(f, "timestamp", 0.0), reverse=True)
    items = items[:limit]
    return _json_response(
        {
            "fragments": [_fragment_to_dict(f) for f in items],
            "total": len(fragments_map),
        }
    )


@api_router.get("/memory/traces")
def api_memory_traces(
    limit: int = 100,
    role: str | None = None,
    sort: str = "importance",
) -> JSONResponse:
    """Return recent memory traces (WebUI Phase 2: 记忆宫殿).

    Query params:
      - ``limit`` : max items (default 100, capped at 500)
      - ``role``  : filter by Trace.narrative_role (setting/character/...)
      - ``sort``  : ``importance`` (default) | ``recency`` | ``relevance``
    """
    provider = get_provider()
    memory = provider.module("memory_system")
    if memory is None:
        return _json_response({"traces": [], "total": 0})
    limit = max(1, min(int(limit), 500))
    traces_map = getattr(memory, "_traces", None)
    if not isinstance(traces_map, dict):
        return _json_response({"traces": [], "total": 0})

    items: list[Any] = list(traces_map.values())
    if role:
        items = [t for t in items if getattr(t, "narrative_role", None) == role]
    if sort == "recency":
        items.sort(key=lambda t: getattr(t, "recency", 0.0), reverse=True)
    elif sort == "relevance":
        items.sort(key=lambda t: getattr(t, "relevance", 0.0), reverse=True)
    else:
        items.sort(key=lambda t: getattr(t, "importance", 0.0), reverse=True)
    items = items[:limit]
    return _json_response(
        {
            "traces": [_trace_to_dict(t) for t in items],
            "total": len(traces_map),
        }
    )


# ---------------------------------------------------------------------------
# Phase 3-5 WebUI refactor endpoints.
#
# /api/social/state — full social world snapshot (Phase 3: 社会空间)
# /api/sandbox/state — full sandbox snapshot (Phase 4: 脑中世界)
# /api/sandbox/narrative — narrative lines / current scene (Phase 4)
# /api/sandbox/projections — character projections (Phase 4)
# /api/bus/events is already exposed above; Phase 5 bus view uses it directly.
# ---------------------------------------------------------------------------


@api_router.get("/social/state")
def api_social_state() -> JSONResponse:
    """Return the full social world snapshot (WebUI Phase 3: 社会空间).

    Calls ``SocialInput.visualize_state()`` which returns spaces, roles,
    NPCs, relationships, gaze pressures, recent encounters, and current
    space/role as a single JSON-serializable dict.
    """
    provider = get_provider()
    social = provider.module("social_input")
    if social is None:
        return _json_response({})
    try:
        if hasattr(social, "visualize_state"):
            data = social.visualize_state()
            if isinstance(data, dict):
                return _json_response(data)
        # Fallback: serialize via to_dict()
        return _json_response(social.to_dict() if hasattr(social, "to_dict") else {})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.get("/social/npcs/{npc_id}")
def api_social_npc_detail(npc_id: str) -> JSONResponse:
    """Return a single NPC's metadata + runtime relationship + counters.

    WebUI Phase 3 NPC details panel (#22). Calls ``SocialInput.get_npc()``.
    """
    provider = get_provider()
    social = provider.module("social_input")
    if social is None:
        raise HTTPException(status_code=404, detail="social_input not registered")
    if not hasattr(social, "get_npc"):
        raise HTTPException(status_code=501, detail="get_npc not implemented")
    try:
        data = social.get_npc(npc_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if data is None:
        raise HTTPException(status_code=404, detail=f"npc {npc_id} not found")
    return _json_response(data)


@api_router.get("/social/npcs/{npc_id}/history")
def api_social_npc_history(npc_id: str, limit: int = 50) -> JSONResponse:
    """Return recent encounters involving the given NPC, newest first.

    WebUI Phase 3 dialogue history viewer (#22). Calls
    ``SocialInput.get_npc_encounters()``. Only encounters with a
    ``relationship_delta.target_id`` matching the NPC are returned —
    eavesdrop/intrusion encounters cannot be attributed to a single NPC.
    """
    provider = get_provider()
    social = provider.module("social_input")
    if social is None:
        raise HTTPException(status_code=404, detail="social_input not registered")
    if not hasattr(social, "get_npc_encounters"):
        raise HTTPException(status_code=501, detail="get_npc_encounters not implemented")
    try:
        data = social.get_npc_encounters(npc_id, limit=max(1, min(limit, 200)))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return _json_response({"npc_id": npc_id, "encounters": data, "count": len(data)})


@api_router.get("/social/encounters/{encounter_id}")
def api_social_encounter(encounter_id: str) -> JSONResponse:
    """Return a single encounter by id (WebUI Phase 3 #22).

    Calls ``SocialInput.get_encounter()``. Returns 404 when the encounter is
    no longer in the in-memory buffer (which keeps the most recent 50).
    """
    provider = get_provider()
    social = provider.module("social_input")
    if social is None:
        raise HTTPException(status_code=404, detail="social_input not registered")
    if not hasattr(social, "get_encounter"):
        raise HTTPException(status_code=501, detail="get_encounter not implemented")
    try:
        data = social.get_encounter(encounter_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if data is None:
        raise HTTPException(status_code=404, detail=f"encounter {encounter_id} not found")
    return _json_response(data)


@api_router.get("/sandbox/state")
def api_sandbox_state() -> JSONResponse:
    """Return the full mental sandbox state (WebUI Phase 4: 脑中世界).

    Uses ``MentalSandbox.to_dict()`` which includes world_model, characters,
    current_scene, narrative_lines, character_sheets, version_manager, and
    depth_metrics. This is a large payload, so the Vue view polls it on a
    slower cadence than the topbar.
    """
    provider = get_provider()
    sandbox = provider.module("mental_sandbox")
    if sandbox is None:
        return _json_response({})
    try:
        return _json_response(sandbox.to_dict() if hasattr(sandbox, "to_dict") else {})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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

    # Serve the built Vue 3 SPA from ``static/dist`` when available. The SPA
    # uses hash-based routing (``createWebHashHistory``) so we only need to
    # return ``index.html`` for the root path; Vite emits hashed asset files
    # under ``/static/dist/assets/*`` which the StaticFiles mount above
    # already serves.
    vue_dist_available = _VUE_DIST_DIR.exists() and (_VUE_DIST_DIR / "index.html").exists()
    if vue_dist_available:
        app.mount(
            "/assets",
            StaticFiles(directory=str(_VUE_DIST_DIR / "assets")),
            name="vue-assets",
        )

    app.include_router(api_router)
    app.include_router(ws_router)

    @app.get("/")
    async def index() -> HTMLResponse:
        # Prefer the new Vue 3 SPA when the build is present; fall back to
        # the legacy single-page dashboard otherwise.
        if vue_dist_available:
            return FileResponse(str(_VUE_DIST_DIR / "index.html"), media_type="text/html")
        return HTMLResponse(content=_load_static_html("index.html"))

    @app.get("/health")
    async def health() -> JSONResponse:
        return _json_response({"status": "ok"})

    return app
