"""Tests for attachment style influence on social energy and network switching.

This verifies Design.md §10.1 end-to-end: a new theory module (attachment)
publishes control-bus messages that tune existing subsystems (social input
and salience network) without direct module coupling.
"""

from __future__ import annotations

from typing import Any

from src.novelist_brain.attachment import AttachmentModule, AttachmentStyle
from src.novelist_brain.bus import BusRouter
from src.novelist_brain.models import BusMessage, Fragment, TickDelta
from src.novelist_brain.module import Module
from src.novelist_brain.salience_network import SalienceNetwork
from src.novelist_brain.social_input import SocialInput


def _tick_delta(phase: str = "creation") -> TickDelta:
    return TickDelta(
        absolute_time=1_000_000.0,
        delta_ms=60_000.0,
        phase=phase,
        global_context=None,  # type: ignore[arg-type]
    )


class _SpyModule(Module):
    def __init__(self, name: str, topics: list[str]) -> None:
        super().__init__(name)
        self.subscribe(*topics)
        self.messages: list[BusMessage] = []

    def init(self, context: dict[str, Any]) -> None:
        pass

    def on_bus_message(self, message: BusMessage) -> None:
        if message.topic in self.subscriptions:
            self.messages.append(message)

    def tick(self, delta: TickDelta) -> None:
        pass


def test_attachment_emits_energy_budget() -> None:
    router = BusRouter()
    attachment = AttachmentModule(name="attachment")
    attachment.register(router)
    attachment.init({})

    from src.novelist_brain.attachment import TargetAttachment

    attachment._state_data.targets["landlord"] = TargetAttachment(
        target_id="landlord",
        target_name="房东",
        style=AttachmentStyle.AVOIDANT,
        intensity=0.6,
        positive_affect=0.05,
        negative_affect=0.55,
    )

    spy = _SpyModule("spy", ["control.social.energy.budget"])
    spy.register(router)

    attachment.tick(_tick_delta())
    router.flush()

    assert len(spy.messages) == 1
    payload = spy.messages[0].payload
    assert payload["source"] == "attachment"
    assert payload["style"] == "avoidant"
    assert payload["energy_cost_multiplier"] == 1.4


def test_social_input_adjusts_energy_cost_multiplier() -> None:
    router = BusRouter()
    social = SocialInput(name="social_input", seed=42)
    social.register(router)
    social.init({})

    router.publish(
        source="attachment",
        topic="control.social.energy.budget",
        channel="control",
        payload={
            "source": "attachment",
            "style": "anxious",
            "energy_cost_multiplier": 1.15,
        },
    )
    router.flush()

    assert social._energy_cost_multiplier == 1.15


def test_social_input_applies_energy_multiplier_to_encounter_cost() -> None:
    social = SocialInput(name="social_input", seed=42)
    social.init({})
    social._energy_cost_multiplier = 1.5

    # Force a valid space/role and deterministic generation.
    social._state_data.current_space_id = "cafe"
    social._state_data.current_role_id = "regular"

    # Patch RNG so the encounter is generated with a known template.
    original_social_table = social._social_table
    social._social_table = [
        {
            "content": "测试相遇",
            "encounter_type": "chance",
            "dialogue_mode": "surface",
            "valence": 0.0,
            "arousal": 0.3,
            "salience": 0.4,
            "tags": ["社交"],
        }
    ]

    # Force the encounter to be generated regardless of probability.
    social._rng.random = lambda: 0.0

    encounter = social._generate_encounter("social", 1_000_000.0)
    assert encounter is not None
    base_cost = SocialInput.BASE_ENERGY_COST
    # default role "regular" has energy_cost_multiplier 1.0; surface depth 1.0.
    assert encounter.cost.energy_drain == round(base_cost * 1.5, 3)

    # Restore table and RNG to avoid side effects in other tests.
    social._social_table = original_social_table
    social._rng = __import__("random").Random(social._seed)


def test_attachment_emits_network_preference() -> None:
    router = BusRouter()
    attachment = AttachmentModule(name="attachment")
    attachment.register(router)
    attachment.init({})

    from src.novelist_brain.attachment import TargetAttachment

    attachment._state_data.targets["social_environment"] = TargetAttachment(
        target_id="social_environment",
        target_name="社会环境",
        style=AttachmentStyle.ANXIOUS,
        intensity=0.5,
        positive_affect=0.1,
        negative_affect=0.5,
    )

    spy = _SpyModule("spy", ["control.network.preference"])
    spy.register(router)

    attachment.tick(_tick_delta())
    router.flush()

    assert len(spy.messages) == 1
    payload = spy.messages[0].payload
    assert payload["source"] == "attachment"
    assert payload["style"] == "anxious"
    assert payload["dmn_bias"] == 0.12
    assert payload["cen_bias"] == -0.05


def test_salience_network_adjusts_bias_from_preference() -> None:
    router = BusRouter()
    sn = SalienceNetwork(name="salience_network")
    sn.register(router)
    sn.init({})

    router.publish(
        source="attachment",
        topic="control.network.preference",
        channel="control",
        payload={
            "source": "attachment",
            "style": "avoidant",
            "dmn_bias": -0.08,
            "cen_bias": 0.1,
        },
    )
    router.flush()

    assert sn._dmn_bias == -0.08
    assert sn._cen_bias == 0.1


def test_salience_network_bias_changes_default_decision() -> None:
    sn = SalienceNetwork(name="salience_network")
    sn._energy = 80.0
    sn._phase = "morning"  # not DMN/CEN phase, so fallback score threshold applies.

    # Without bias, score 0.25 -> dmn.
    fragment_low = Fragment(
        content="低显著性片段",
        source="social",
        valence=0.0,
        arousal=0.0,
        salience=0.3,
    )
    assert sn._decide_network(fragment_low, score=0.25, phase="morning") == "dmn"

    # With strong CEN bias, same score crosses adjusted threshold -> cen.
    sn._cen_bias = 0.2
    sn._dmn_bias = 0.0
    assert sn._decide_network(fragment_low, score=0.25, phase="morning") == "cen"

    # With strong DMN bias, even a score that normally selects cen stays dmn.
    sn._cen_bias = 0.0
    sn._dmn_bias = 0.2
    assert sn._decide_network(fragment_low, score=0.45, phase="morning") == "dmn"


def test_end_to_end_attachment_influences_social_and_network() -> None:
    """Full bus-level integration: attachment -> social energy + network bias."""
    router = BusRouter()

    attachment = AttachmentModule(name="attachment")
    social = SocialInput(name="social_input", seed=42)
    sn = SalienceNetwork(name="salience_network")

    attachment.register(router)
    social.register(router)
    sn.register(router)

    social.init({})
    sn.init({})
    attachment.init({})

    from src.novelist_brain.attachment import TargetAttachment

    attachment._state_data.targets["cafe_owner"] = TargetAttachment(
        target_id="cafe_owner",
        target_name="咖啡馆老板",
        style=AttachmentStyle.AVOIDANT,
        intensity=0.5,
        positive_affect=0.1,
        negative_affect=0.5,
    )

    attachment.tick(_tick_delta())
    router.flush()

    # SocialInput should have received and applied the energy multiplier.
    assert social._energy_cost_multiplier == 1.4

    # SalienceNetwork should have received and applied the network biases.
    assert sn._dmn_bias == -0.08
    assert sn._cen_bias == 0.1
