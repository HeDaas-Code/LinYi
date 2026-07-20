"""Tests for the attachment theory extension module."""

from __future__ import annotations

from src.novelist_brain.attachment import (
    AttachmentModule,
    AttachmentState,
    AttachmentStyle,
    TargetAttachment,
    _evaluate_style,
)
from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage


def _make_attachment() -> AttachmentModule:
    router = BusRouter()
    module = AttachmentModule(name="attachment")
    module.register(router)
    module.init({"identity": {"traits": {"神经质": 0.5}}})
    return module


def test_evaluate_style_secure() -> None:
    assert _evaluate_style(0.8, 0.1, 0.5) == AttachmentStyle.SECURE


def test_evaluate_style_anxious() -> None:
    # Negative dominates with high intensity -> anxious.
    assert _evaluate_style(0.1, 0.6, 0.5) == AttachmentStyle.ANXIOUS


def test_evaluate_style_avoidant() -> None:
    # Negative dominates with low intensity -> avoidant.
    assert _evaluate_style(0.05, 0.3, 0.2) == AttachmentStyle.AVOIDANT


def test_evaluate_style_disorganized() -> None:
    # Both affects high and similar -> disorganized.
    assert _evaluate_style(0.5, 0.5, 0.6) == AttachmentStyle.DISORGANIZED


def test_initial_state_default_avoidant() -> None:
    module = _make_attachment()
    assert module._state_data.overall == AttachmentStyle.AVOIDANT


def test_neuroticism_biases_anxious() -> None:
    router = BusRouter()
    module = AttachmentModule(name="attachment")
    module.register(router)
    module.init({"identity": {"traits": {"神经质": 0.9}}})
    assert module._state_data.overall == AttachmentStyle.ANXIOUS


def test_low_neuroticism_biases_secure() -> None:
    router = BusRouter()
    module = AttachmentModule(name="attachment")
    module.register(router)
    module.init({"identity": {"traits": {"神经质": 0.1}}})
    assert module._state_data.overall == AttachmentStyle.SECURE


def test_relationship_delta_creates_target() -> None:
    module = _make_attachment()
    module.on_bus_message(
        BusMessage(
            source="social_input",
            topic="data.social.relationship.delta",
            payload={
                "target_id": "npc_cafe_owner",
                "target_name": "咖啡馆老板",
                "delta": 0.2,
            },
        )
    )
    assert "npc_cafe_owner" in module._state_data.targets
    target = module._state_data.targets["npc_cafe_owner"]
    assert target.target_name == "咖啡馆老板"
    assert target.positive_affect > 0


def test_positive_delta_leads_to_secure() -> None:
    module = _make_attachment()
    for _ in range(10):
        module.on_bus_message(
            BusMessage(
                source="social_input",
                topic="data.social.relationship.delta",
                payload={
                    "target_id": "npc_cafe_owner",
                    "target_name": "咖啡馆老板",
                    "delta": 0.5,
                },
            )
        )
    target = module._state_data.targets["npc_cafe_owner"]
    assert target.style == AttachmentStyle.SECURE


def test_negative_delta_leads_to_avoidant_or_anxious() -> None:
    module = _make_attachment()
    for _ in range(10):
        module.on_bus_message(
            BusMessage(
                source="social_input",
                topic="data.social.relationship.delta",
                payload={
                    "target_id": "npc_landlord",
                    "target_name": "房东",
                    "delta": -0.5,
                },
            )
        )
    target = module._state_data.targets["npc_landlord"]
    assert target.style in (AttachmentStyle.AVOIDANT, AttachmentStyle.ANXIOUS)


def test_mixed_signals_lead_to_disorganized() -> None:
    module = _make_attachment()
    for delta in [0.5, -0.5, 0.5, -0.5, 0.5, -0.5]:
        module.on_bus_message(
            BusMessage(
                source="social_input",
                topic="data.social.relationship.delta",
                payload={
                    "target_id": "npc_parent",
                    "target_name": "父亲",
                    "delta": delta,
                },
            )
        )
    target = module._state_data.targets["npc_parent"]
    assert target.style == AttachmentStyle.DISORGANIZED


def test_tick_decays_inactive_targets() -> None:
    module = _make_attachment()
    module.on_bus_message(
        BusMessage(
            source="social_input",
            topic="data.social.relationship.delta",
            payload={
                "target_id": "npc_cafe_owner",
                "target_name": "咖啡馆老板",
                "delta": 0.05,
            },
        )
    )
    initial_intensity = module._state_data.targets["npc_cafe_owner"].intensity
    for _ in range(50):
        module.tick(_tick_delta())
    # Weak bond should be forgotten after many ticks of decay.
    assert "npc_cafe_owner" not in module._state_data.targets


def test_overall_style_computed_from_targets() -> None:
    module = _make_attachment()
    # Create a strong anxious bond.
    for _ in range(10):
        module.on_bus_message(
            BusMessage(
                source="social_input",
                topic="data.social.relationship.delta",
                payload={
                    "target_id": "npc_landlord",
                    "target_name": "房东",
                    "delta": -0.5,
                },
            )
        )
    module.tick(_tick_delta())
    assert module._state_data.overall == AttachmentStyle.ANXIOUS


def test_serialization_roundtrip() -> None:
    module = _make_attachment()
    module.on_bus_message(
        BusMessage(
            source="social_input",
            topic="data.social.relationship.delta",
            payload={
                "target_id": "npc_cafe_owner",
                "target_name": "咖啡馆老板",
                "delta": 0.5,
            },
        )
    )
    snapshot = module.to_dict()
    restored = AttachmentModule(name="attachment")
    restored.from_dict(snapshot)
    assert "npc_cafe_owner" in restored._state_data.targets
    assert restored._state_data.targets["npc_cafe_owner"].style == AttachmentStyle.SECURE


def test_metadata_declares_dependency() -> None:
    meta = AttachmentModule.metadata()
    assert meta["name"] == "attachment"
    assert "social_input" in meta["dependencies"]
    assert meta["category"] == "cognitive"


def _tick_delta():
    from src.novelist_brain.models import GlobalContext, TickDelta

    return TickDelta(
        absolute_time=0.0,
        delta_ms=1000.0,
        phase="social",
        global_context=GlobalContext(
            tick=0,
            absolute_time=0.0,
            phase="social",
            active_network=None,
            budget_warning=False,
        ),
    )


if __name__ == "__main__":
    test_evaluate_style_secure()
    test_evaluate_style_anxious()
    test_evaluate_style_avoidant()
    test_evaluate_style_disorganized()
    test_initial_state_default_avoidant()
    test_neuroticism_biases_anxious()
    test_low_neuroticism_biases_secure()
    test_relationship_delta_creates_target()
    test_positive_delta_leads_to_secure()
    test_negative_delta_leads_to_avoidant_or_anxious()
    test_mixed_signals_lead_to_disorganized()
    test_tick_decays_inactive_targets()
    test_overall_style_computed_from_targets()
    test_serialization_roundtrip()
    test_metadata_declares_dependency()
    print("attachment tests passed")