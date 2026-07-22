"""Tests for MemorySystem integration with the SQLite hybrid store."""

from __future__ import annotations

import tempfile

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.memory import MemorySystem
from src.novelist_brain.memory_store import HybridMemoryStore
from src.novelist_brain.models import Fragment


def test_memory_system_uses_store_for_fragments_and_traces() -> None:
    router = BusRouter()
    store = HybridMemoryStore(":memory:")
    memory = MemorySystem(
        name="memory_system", store=store, enable_fragment_gate=False
    )
    memory.register(router)
    memory.init({})

    # Inject fragments with shared tags so consolidation creates a trace.
    for i in range(4):
        memory._receive_fragment(
            Fragment(
                content=f"片段 {i}",
                source="personal",
                modality="event",
                valence=0.5,
                arousal=0.6,
                salience=0.8,
                timestamp=float(i * 1000),
                tags=["主题"],
            )
        )

    assert store.fragment_count() == 4
    assert memory._state.custom["fragment_count"] == 4

    memory._run_consolidation({"current_time_ms": 5000.0, "reason": "test"})
    assert store.trace_count() >= 1
    assert memory._state.custom["trace_count"] >= 1

    # Graph edges should connect fragments to the trace.
    trace_id = next(iter(memory._traces))
    neighbors = store.get_neighbors(trace_id, direction="incoming")
    assert any(edge_type == "fragment_to_trace" for _, edge_type, _ in neighbors)


def test_memory_system_opens_store_from_context() -> None:
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as tmp:
        path = tmp.name

    router = BusRouter()
    memory = MemorySystem(name="memory_system")
    memory.register(router)
    memory.init(
        {
            "memory": {
                "backend": "sqlite",
                "db_path": path,
                "embedding_dim": 3,
            }
        }
    )

    assert memory._store is not None
    memory._receive_fragment(
        Fragment(content="来自上下文", source="personal", tags=["x"])
    )
    assert memory._store.fragment_count() == 1
    memory._store.close()
