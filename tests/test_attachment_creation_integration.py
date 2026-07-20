"""Tests for attachment style influence on creative tone (Design.md §10.1)."""

from __future__ import annotations

from typing import Any

from src.novelist_brain.attachment import AttachmentModule, AttachmentStyle
from src.novelist_brain.bus import BusRouter
from src.novelist_brain.creation_executive import CreationExecutive
from src.novelist_brain.models import BusMessage, TickDelta
from src.novelist_brain.module import Module


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


def test_attachment_emits_creative_tone_on_tick() -> None:
    router = BusRouter()
    attachment = AttachmentModule(name="attachment")
    attachment.register(router)
    attachment.init({})

    # Seed an anxious attachment target with enough intensity to matter.
    from src.novelist_brain.attachment import TargetAttachment

    attachment._state_data.targets["test_npc"] = TargetAttachment(
        target_id="test_npc",
        target_name="测试对象",
        style=AttachmentStyle.ANXIOUS,
        intensity=0.5,
        positive_affect=0.1,
        negative_affect=0.6,
    )

    spy = _SpyModule("spy", ["control.creative.tone"])
    spy.register(router)

    attachment.tick(_tick_delta())
    # Flush emitted messages through the router.
    router.flush()

    assert len(spy.messages) == 1
    payload = spy.messages[0].payload
    assert payload["source"] == "attachment"
    assert payload["style"] == "anxious"
    assert payload["tone"]["mood"] == "紧张而渴望"


def test_creation_executive_uses_attachment_tone_in_prompt() -> None:
    from src.novelist_brain import prompts

    identity = {
        "name": "林逸",
        "pen_name": "静观者",
        "values": ["真实", "共情"],
        "traits": {"开放性": 0.8},
        "self_narrative": "我是一个在人群边缘写字的人。",
    }
    narrative_line = {
        "scenes": [{"setting": "咖啡馆", "description": "下雨的傍晚", "emotional_tone": -0.2}],
        "conflicts": [],
        "foreshadowing": [],
    }
    tone = {
        "style": "avoidant",
        "intensity": 0.6,
        "tone": {
            "mood": "疏离而观察",
            "sentence_rhythm": "遥远，省略，景物多于情感",
            "thematic_bias": ["距离", "沉默", "自我保护"],
        },
    }

    system, _ = prompts.build_novel_paragraph_prompt(
        identity=identity,
        narrative_line=narrative_line,
        relevant_traces=[],
        previous_paragraph="",
        style_profile={},
        attachment_tone=tone,
    )

    assert "疏离而观察" in system
    assert "遥远，省略，景物多于情感" in system
    assert "距离" in system
    assert "自我保护" in system


def test_creation_executive_handles_creative_tone_message() -> None:
    creation = CreationExecutive(name="creation_executive")
    creation._handle_creative_tone({
        "source": "attachment",
        "style": "disorganized",
        "intensity": 0.7,
        "tone": {"mood": "断裂而矛盾"},
    })

    assert creation._attachment_tone is not None
    assert creation._attachment_tone["style"] == "disorganized"
    assert creation._attachment_tone["intensity"] == 0.7


def test_creation_executive_ignores_non_attachment_tone() -> None:
    creation = CreationExecutive(name="creation_executive")
    creation._handle_creative_tone({
        "source": "identity",
        "style": "secure",
        "intensity": 0.5,
        "tone": {"mood": "稳定"},
    })

    assert creation._attachment_tone is None


def test_attachment_tone_roundtrip() -> None:
    creation = CreationExecutive(name="creation_executive")
    creation._handle_creative_tone({
        "source": "attachment",
        "style": "anxious",
        "intensity": 0.4,
        "tone": {"mood": "紧张"},
    })

    state = creation.to_dict()
    restored = CreationExecutive(name="creation_executive")
    restored.from_dict(state)

    assert restored._attachment_tone == {
        "style": "anxious",
        "intensity": 0.4,
        "tone": {"mood": "紧张"},
    }
