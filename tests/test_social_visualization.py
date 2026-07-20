"""Tests for the social-space visualization export."""

from __future__ import annotations

import json

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage, GlobalContext, TickDelta
from src.novelist_brain.social_input import SocialInput
from src.novelist_brain.social_models import DEFAULT_SPACES, GazePressure, Relationship


def _make_tick_delta(phase: str = "social", tick: int = 1) -> TickDelta:
    return TickDelta(
        absolute_time=tick * 1000.0,
        delta_ms=1000.0,
        phase=phase,
        global_context=GlobalContext(
            tick=tick,
            absolute_time=tick * 1000.0,
            phase=phase,
            active_network=None,
            budget_warning=False,
        ),
    )


def _make_social_input() -> SocialInput:
    router = BusRouter()
    social = SocialInput(name="social_input", seed=42)
    social.register(router)
    context = {
        "identity": {
            "traits": {"开放性": 0.8, "内倾性": 0.7, "神经质": 0.5},
            "interests": ["城市", "雨"],
        },
        "social": {
            "starting_space": "home",
            "starting_role": "recluse",
            "starting_social_energy": 100.0,
            "fatigue_rate": 1.2,
        },
    }
    social.init(context)
    return social


def test_visualize_state_is_json_serializable() -> None:
    social = _make_social_input()
    view = social.visualize_state()
    # Should not raise and should produce a non-empty string.
    text = json.dumps(view, ensure_ascii=False)
    assert isinstance(text, str)
    assert len(text) > 0


def test_visualize_state_contains_current_space_and_role() -> None:
    social = _make_social_input()
    view = social.visualize_state()

    assert view["module"] == "social_input"
    assert view["current"]["space"]["id"] == "home"
    assert view["current"]["role"]["id"] == "recluse"
    assert view["current"]["social_energy"] == 100.0
    assert "accumulated_gaze_load" in view["current"]
    assert "energy_ratio" in view["current"]
    assert "space_gaze" in view["current"]


def test_visualize_state_includes_spaces_and_roles_catalogs() -> None:
    social = _make_social_input()
    view = social.visualize_state()

    space_ids = {s["id"] for s in view["spaces"]}
    role_ids = {r["id"] for r in view["roles"]}

    assert "home" in space_ids
    assert "town_square" in space_ids
    assert "recluse" in role_ids
    assert "observer" in role_ids
    assert view["summary"]["spaces_count"] == len(view["spaces"])
    assert view["summary"]["roles_count"] == len(view["roles"])


def test_visualize_state_includes_relationships_and_gaze() -> None:
    social = _make_social_input()
    social._state_data.relationships["t1"] = Relationship(
        target_id="t1", target_name="邻居", type="acquaintance", intensity=0.3
    )
    social._state_data.accumulated_gaze_load = 0.35

    view = social.visualize_state()

    # Default NPCs are seeded on init, so the total count includes them.
    assert view["summary"]["relationship_count"] == len(
        social._state_data.relationships
    )
    t1_rel = next(
        (r for r in view["relationships"] if r["target_id"] == "t1"), None
    )
    assert t1_rel is not None
    assert t1_rel["target_name"] == "邻居"
    assert view["current"]["accumulated_gaze_load"] == 0.35


def test_visualize_state_respects_limits_and_history_flag() -> None:
    social = _make_social_input()
    social._state_data.gaze_pressures = [
        GazePressure(source=f"g{i}", norm="一般社会注视", intensity=0.1, internalized=False)
        for i in range(10)
    ]

    full = social.visualize_state(max_gaze=5)
    assert len(full["gaze_pressures"]) == 5
    assert full["gaze_pressures"][0]["source"] == "g5"

    no_history = social.visualize_state(include_history=False)
    for rel in no_history["relationships"]:
        assert "history" not in rel


def test_control_social_export_emits_data_event() -> None:
    router = BusRouter()
    social = SocialInput(name="social_input", seed=42)
    social.register(router)
    context = {
        "identity": {"traits": {"开放性": 0.8}},
        "social": {
            "starting_space": "cafe",
            "starting_role": "regular",
            "starting_social_energy": 80.0,
        },
    }
    social.init(context)

    captured: list[BusMessage] = []
    original_route = router.route

    def capturing_route(message: BusMessage):
        captured.append(message)
        return original_route(message)

    router.route = capturing_route  # type: ignore[method-assign]

    router.publish(
        source="test",
        topic="control.social.export",
        channel="control",
        payload={"include_history": True, "max_encounters": 10},
        priority=5,
        ttl=3,
    )
    router.flush()
    # The export handler emits a data.social.export message that is queued for
    # the next routing cycle, so flush once more to deliver it.
    router.flush()

    export_messages = [m for m in captured if m.topic == "data.social.export"]
    assert len(export_messages) == 1
    payload = export_messages[0].payload
    assert isinstance(payload, dict)
    assert payload["current"]["space"]["id"] == "cafe"
    assert payload["current"]["role"]["id"] == "regular"
    assert payload["summary"]["spaces_count"] == len(DEFAULT_SPACES)


def test_visualize_state_after_roundtrip() -> None:
    router = BusRouter()
    social = SocialInput(name="social_input", seed=42)
    social.register(router)
    context = {
        "identity": {"traits": {"开放性": 0.8}},
        "social": {"starting_space": "cafe", "starting_role": "regular", "starting_social_energy": 80.0},
    }
    social.init(context)
    social.tick(_make_tick_delta(phase="social"))

    snapshot = social.to_dict()
    restored = SocialInput(name="social_input", seed=42)
    restored.register(router)
    restored.from_dict(snapshot)

    original_view = social.visualize_state()
    restored_view = restored.visualize_state()

    assert restored_view["current"]["space"]["id"] == original_view["current"]["space"]["id"]
    assert restored_view["current"]["role"]["id"] == original_view["current"]["role"]["id"]
    assert restored_view["current"]["social_energy"] == original_view["current"]["social_energy"]
    assert restored_view["summary"]["spaces_count"] == original_view["summary"]["spaces_count"]


if __name__ == "__main__":
    test_visualize_state_is_json_serializable()
    test_visualize_state_contains_current_space_and_role()
    test_visualize_state_includes_spaces_and_roles_catalogs()
    test_visualize_state_includes_relationships_and_gaze()
    test_visualize_state_respects_limits_and_history_flag()
    test_control_social_export_emits_data_event()
    test_visualize_state_after_roundtrip()
    print("social visualization tests passed")
