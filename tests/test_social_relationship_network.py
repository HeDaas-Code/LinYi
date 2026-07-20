"""Tests for the social relationship network deepening."""

from __future__ import annotations

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import GlobalContext, TickDelta
from src.novelist_brain.social_input import SocialInput
from src.novelist_brain.social_models import (
    DEFAULT_NPCS,
    Relationship,
    SocialNPC,
    SocialSpace,
)


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
            "starting_space": "cafe",
            "starting_role": "regular",
            "starting_social_energy": 100.0,
        },
    }
    social.init(context)
    return social


def test_default_npcs_loaded() -> None:
    social = _make_social_input()
    assert len(social._npcs) == len(DEFAULT_NPCS)
    assert "npc_cafe_owner" in social._npcs
    assert social._npcs["npc_cafe_owner"].name == "咖啡馆老板"


def test_visualize_state_includes_npcs() -> None:
    social = _make_social_input()
    view = social.visualize_state()
    assert view["summary"]["npcs_count"] == len(DEFAULT_NPCS)
    npc_ids = {n["id"] for n in view["npcs"]}
    assert "npc_cafe_owner" in npc_ids


def test_repeated_npc_encounter_updates_same_relationship() -> None:
    social = _make_social_input()
    # Force a chance encounter with a specific NPC by constructing it manually.
    from src.novelist_brain.social_models import RelationshipDelta, SocialCost

    npc_id = "npc_cafe_owner"
    npc = social._npcs[npc_id]

    def emit_with_npc(delta: float) -> None:
        encounter = social._generate_encounter("social", 0.0)
        if encounter is None:
            # If no encounter generated, create a synthetic one tied to the NPC.
            from src.novelist_brain.social_models import SocialEncounter
            encounter = SocialEncounter(
                space_id="cafe",
                encounter_type="chance",
                participants=[npc.name],
                dialogue_mode="surface",
                content="简短的寒暄",
                valence=0.1,
                arousal=0.2,
                salience=0.4,
                gaze_pressure=0.2,
                cost=SocialCost(energy_drain=1.0, attention_drain=0.1, emotional_exposure=0.1),
                timestamp=0.0,
                tags=["社交", "咖啡馆"],
                relationship_delta=RelationshipDelta(
                    target_id=npc_id,
                    target_name=npc.name,
                    type="acquaintance",
                    delta=delta,
                ),
            )
        else:
            # Override target to the NPC to ensure stability.
            encounter.relationship_delta = RelationshipDelta(
                target_id=npc_id,
                target_name=npc.name,
                type="acquaintance",
                delta=delta,
            )
        social._emit_encounter(encounter)

    emit_with_npc(0.1)
    assert npc_id in social._state_data.relationships
    first_intensity = social._state_data.relationships[npc_id].intensity
    first_trust = social._state_data.relationships[npc_id].trust

    emit_with_npc(0.08)
    rel = social._state_data.relationships[npc_id]
    assert rel.intensity > first_intensity
    assert rel.trust > first_trust
    assert rel.history[-1].startswith("chance") or rel.history[-1].startswith("reunion")


def test_relationship_type_changes_with_intensity() -> None:
    social = _make_social_input()
    rel = Relationship(target_id="npc_cafe_owner", target_name="咖啡馆老板", intensity=0.0)
    social._state_data.relationships["npc_cafe_owner"] = rel

    rel.intensity = 0.05
    rel.type = social._relationship_type_from_intensity(rel.intensity)
    assert rel.type == "stranger"

    rel.intensity = 0.15
    rel.type = social._relationship_type_from_intensity(rel.intensity)
    assert rel.type == "acquaintance"

    rel.intensity = 0.35
    rel.type = social._relationship_type_from_intensity(rel.intensity)
    assert rel.type == "friend"

    rel.intensity = -0.15
    rel.type = social._relationship_type_from_intensity(rel.intensity)
    assert rel.type == "rival"


def test_relationship_decay_over_ticks() -> None:
    social = _make_social_input()
    rel = Relationship(target_id="npc_cafe_owner", target_name="咖啡馆老板", intensity=0.3, trust=0.3)
    social._state_data.relationships["npc_cafe_owner"] = rel

    # Evolve directly to avoid encounter side effects in this unit test.
    for _ in range(20):
        social._evolve_relationships(in_private=False)
    assert social._state_data.relationships["npc_cafe_owner"].intensity < 0.3


def test_weak_relationship_is_forgotten() -> None:
    social = _make_social_input()
    rel = Relationship(target_id="npc_cafe_owner", target_name="咖啡馆老板", intensity=0.02, trust=0.0)
    social._state_data.relationships["npc_cafe_owner"] = rel

    social._evolve_relationships(in_private=False)
    # After evolution the weak relationship should be removed.
    assert "npc_cafe_owner" not in social._state_data.relationships


def test_reunion_prefers_existing_relationship() -> None:
    social = _make_social_input()
    # Seed an existing positive relationship with the café owner.
    social._state_data.relationships["npc_cafe_owner"] = Relationship(
        target_id="npc_cafe_owner",
        target_name="咖啡馆老板",
        intensity=0.3,
        trust=0.2,
    )

    # Force many reunion target picks; most should return the existing NPC.
    space = social._current_space()
    assert space is not None
    hits = 0
    for _ in range(50):
        tid, name = social._pick_encounter_target(space, "reunion")
        if tid == "npc_cafe_owner":
            hits += 1
    assert hits > 25  # Should heavily favor the existing relationship.


def test_conflict_can_target_negative_relationship() -> None:
    social = _make_social_input()
    # Move to home where the landlord NPC can appear.
    social._state_data.current_space_id = "home"
    social._state_data.current_role_id = "recluse"
    social._state_data.relationships["npc_landlord"] = Relationship(
        target_id="npc_landlord",
        target_name="房东",
        intensity=-0.2,
        trust=-0.1,
    )

    space = social._current_space()
    assert space is not None
    negative_hits = 0
    for _ in range(50):
        tid, name = social._pick_encounter_target(space, "conflict")
        if tid == "npc_landlord":
            negative_hits += 1
    # Conflict has a 60% chance to pick a negative relationship when one exists.
    assert negative_hits > 10


def test_npc_config_overrides_defaults() -> None:
    custom_npc = SocialNPC(id="npc_custom", name="自定义角色", space_ids=["cafe"])
    social = SocialInput(name="social_input", npcs=[custom_npc], seed=42)
    context = {
        "identity": {"traits": {"开放性": 0.8}},
        "social": {"starting_space": "cafe", "starting_role": "regular"},
    }
    social.init(context)
    assert len(social._npcs) == 1
    assert "npc_custom" in social._npcs


def test_relationship_roundtrip_preserves_intensity_and_trust() -> None:
    social = _make_social_input()
    social._state_data.relationships["npc_cafe_owner"] = Relationship(
        target_id="npc_cafe_owner",
        target_name="咖啡馆老板",
        type="friend",
        intensity=0.35,
        trust=0.2,
        history=["chance: 寒暄"],
    )

    snapshot = social.to_dict()
    restored = SocialInput(name="social_input", seed=42)
    restored.from_dict(snapshot)

    rel = restored._state_data.relationships["npc_cafe_owner"]
    assert rel.intensity == 0.35
    assert rel.trust == 0.2
    assert rel.type == "friend"
    assert rel.history == ["chance: 寒暄"]


def test_encounter_target_respects_space() -> None:
    social = _make_social_input()
    space = social._spaces["cafe"]
    for _ in range(20):
        tid, name = social._pick_encounter_target(space, "chance")
        if tid in social._npcs:
            npc = social._npcs[tid]
            assert "cafe" in npc.space_ids


if __name__ == "__main__":
    test_default_npcs_loaded()
    test_visualize_state_includes_npcs()
    test_repeated_npc_encounter_updates_same_relationship()
    test_relationship_type_changes_with_intensity()
    test_relationship_decay_over_ticks()
    test_weak_relationship_is_forgotten()
    test_reunion_prefers_existing_relationship()
    test_conflict_can_target_negative_relationship()
    test_npc_config_overrides_defaults()
    test_relationship_roundtrip_preserves_intensity_and_trust()
    test_encounter_target_respects_space()
    print("social relationship network tests passed")
