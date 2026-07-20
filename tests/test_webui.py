"""Tests for the WebUI dashboard layer."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import CharacterProjection, ModuleState, TickDelta, TraitVector, WorldModel
from src.novelist_brain.module import Module
from src.novelist_brain.sandbox import MentalSandbox
from src.novelist_brain.web import create_app, get_provider
from src.novelist_brain.web.bus_spy import BusSpy


@pytest.fixture
def client() -> TestClient:
    provider = get_provider()
    provider.register(router=BusRouter(), modules={}, context={})
    return TestClient(create_app())


@pytest.fixture
def populated_client() -> TestClient:
    router = BusRouter()
    sandbox = MentalSandbox(name="mental_sandbox", llm_service=None, min_rounds=1, max_rounds=5)
    sandbox.register(router)
    sandbox._world_model = WorldModel(
        name="test_world",
        ontology={"genre": "test"},
        rules=["rule1"],
        current_state={"time": "morning"},
    )
    sandbox._current_scene = sandbox._create_default_scene()
    sandbox._characters.append(
        CharacterProjection(id="p1", name="Lin", archetype="observer", traits=TraitVector())
    )
    sandbox._rebuild_character_sheets()

    provider = get_provider()
    provider.register(
        router=router,
        modules={"mental_sandbox": sandbox},
        context={"config": {"webui": {"enabled": True}}},
    )
    spy = BusSpy(capacity=50)
    spy.attach(router)
    router.publish(source="test", topic="event.clock.phase.changed", channel="event", payload={"phase": "morning"})
    router.flush()
    return TestClient(create_app())


class TestWebUIBasics:
    def test_health(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_index(self, client: TestClient) -> None:
        response = client.get("/")
        assert response.status_code == 200
        assert "脑中世界" in response.text

    def test_static_css(self, client: TestClient) -> None:
        response = client.get("/static/dashboard.css")
        assert response.status_code == 200

    def test_static_js(self, client: TestClient) -> None:
        response = client.get("/static/dashboard.js")
        assert response.status_code == 200


class TestWebUIEndpoints:
    def test_snapshot(self, populated_client: TestClient) -> None:
        response = populated_client.get("/api/snapshot")
        assert response.status_code == 200
        data = response.json()
        assert "modules" in data
        assert "mental_sandbox" in data["modules"]

    def test_sandbox_world(self, populated_client: TestClient) -> None:
        response = populated_client.get("/api/sandbox/world")
        assert response.status_code == 200
        assert response.json()["name"] == "test_world"

    def test_sandbox_characters(self, populated_client: TestClient) -> None:
        response = populated_client.get("/api/sandbox/characters")
        assert response.status_code == 200
        assert "p1" in response.json()

    def test_bus_events(self, populated_client: TestClient) -> None:
        response = populated_client.get("/api/bus/events")
        assert response.status_code == 200
        events = response.json()
        assert any(e["topic"] == "event.clock.phase.changed" for e in events)

    def test_control_endpoint(self, populated_client: TestClient) -> None:
        response = populated_client.post("/api/control/control.sandbox.build", json={"reset": True})
        assert response.status_code == 200
        assert response.json()["ok"] is True

    def test_module_not_found(self, client: TestClient) -> None:
        response = client.get("/api/modules/nonexistent")
        assert response.status_code == 404


class DummyModule(Module):
    """Minimal module whose get_state returns a plain ModuleState."""

    def init(self, context: dict[str, object]) -> None:
        pass

    def on_bus_message(self, message: object) -> None:
        pass

    def tick(self, delta: TickDelta) -> None:
        pass

    def get_state(self) -> ModuleState:
        return ModuleState(active=True, energy_cost=0.1, last_tick=1.0)


class TestModuleStateSerialization:
    def test_module_state_in_snapshot(self) -> None:
        provider = get_provider()
        provider.register(
            router=BusRouter(),
            modules={"dummy": DummyModule(name="dummy")},
            context={},
        )
        client = TestClient(create_app())
        response = client.get("/api/snapshot")
        assert response.status_code == 200
        modules = response.json()["modules"]
        assert "dummy" in modules
        assert modules["dummy"].get("active") is True
        assert modules["dummy"].get("energy_cost") == 0.1
