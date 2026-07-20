"""Tests for social provenance in memory traces (Design.md §16.8)."""

from __future__ import annotations

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.memory import MemorySystem
from src.novelist_brain.models import (
    BusMessage,
    Fragment,
    GlobalContext,
    SocialTrace,
    TickDelta,
    Trace,
)


def _make_memory() -> MemorySystem:
    router = BusRouter()
    memory = MemorySystem(name="memory_system")
    memory.register(router)
    memory.init({})
    return memory


def _social_fragment_payload(
    fragment: Fragment,
    space_id: str = "cafe",
    dialogue_mode: str = "surface",
    gaze_pressure: float = 0.3,
    relationship_delta: dict | None = None,
) -> dict:
    return {
        "fragment": fragment,
        "encounter": {
            "space_id": space_id,
            "dialogue_mode": dialogue_mode,
            "gaze_pressure": gaze_pressure,
            "relationship_delta": relationship_delta or {},
        },
    }


def test_social_trace_created_from_social_fragment() -> None:
    memory = _make_memory()
    fragment = Fragment(
        content="咖啡店老板提起老街改造。",
        source="social",
        tags=["social", "cafe", "change"],
        salience=0.8,
        valence=0.2,
        arousal=0.4,
    )

    # Fragment arrives via the legacy channel and is queued.
    memory.on_bus_message(
        BusMessage(source="social_input", topic="fragment.social.new", payload=fragment)
    )
    # Rich social context arrives via the new channel.
    memory.on_bus_message(
        BusMessage(
            source="social_input",
            topic="data.social.fragment",
            payload=_social_fragment_payload(
                fragment,
                space_id="cafe",
                dialogue_mode="probe",
                gaze_pressure=0.4,
                relationship_delta={
                    "target_id": "npc_cafe_owner",
                    "target_name": "咖啡店老板",
                    "delta": 0.1,
                },
            ),
        )
    )

    memory.tick(_tick_delta())

    traces = list(memory.traces.values())
    assert len(traces) == 1
    trace = traces[0]
    assert isinstance(trace, SocialTrace)
    assert trace.space_id == "cafe"
    assert trace.dialogue_mode == "probe"
    assert trace.gaze_pressure == 0.4
    assert trace.relationship_delta.get("target_id") == "npc_cafe_owner"
    assert trace.relationship_delta.get("delta") == 0.1


def test_non_social_fragment_creates_plain_trace() -> None:
    memory = _make_memory()
    fragment = Fragment(
        content="清晨醒来，窗外有雾，一种强烈的孤独感涌上心头。",
        source="personal",
        tags=["personal", "morning", "fog"],
        salience=0.9,
        valence=-0.5,
        arousal=0.7,
    )

    memory.on_bus_message(
        BusMessage(source="personal_input", topic="fragment.personal.new", payload=fragment)
    )
    memory.tick(_tick_delta())

    traces = list(memory.traces.values())
    assert len(traces) == 1
    assert isinstance(traces[0], Trace)
    assert not isinstance(traces[0], SocialTrace)


def test_social_trace_roundtrip() -> None:
    memory = _make_memory()
    fragment = Fragment(
        content="邻居抱怨漏水。",
        source="social",
        tags=["social", "home", "conflict"],
        salience=0.9,
        valence=-0.3,
        arousal=0.6,
    )
    memory.on_bus_message(
        BusMessage(source="social_input", topic="fragment.social.new", payload=fragment)
    )
    memory.on_bus_message(
        BusMessage(
            source="social_input",
            topic="data.social.fragment",
            payload=_social_fragment_payload(
                fragment,
                space_id="home",
                dialogue_mode="surface",
                gaze_pressure=0.5,
            ),
        )
    )
    memory.tick(_tick_delta())

    state = memory.to_dict()
    restored = MemorySystem(name="memory_system")
    restored.from_dict(state)

    traces = list(restored.traces.values())
    assert len(traces) == 1
    trace = traces[0]
    assert isinstance(trace, SocialTrace)
    assert trace.space_id == "home"
    assert trace.dialogue_mode == "surface"
    assert trace.gaze_pressure == 0.5


def test_social_provenance_preserved_across_roundtrip() -> None:
    memory = _make_memory()
    fragment = Fragment(
        content="广场上有人拉二胡。",
        source="social",
        tags=["social", "square", "music"],
        salience=0.6,
        valence=0.3,
        arousal=0.3,
    )
    memory.on_bus_message(
        BusMessage(source="social_input", topic="data.social.fragment", payload=_social_fragment_payload(fragment))
    )

    state = memory.to_dict()
    restored = MemorySystem(name="memory_system")
    restored.from_dict(state)

    assert fragment.id in restored._social_provenance
    assert restored._social_provenance[fragment.id]["space_id"] == "cafe"


def _tick_delta() -> TickDelta:
    return TickDelta(
        absolute_time=1_000_000.0,
        delta_ms=60_000.0,
        phase="social",
        global_context=GlobalContext(
            tick=1,
            absolute_time=1_000_000.0,
            phase="social",
            active_network="dmn",
        ),
    )