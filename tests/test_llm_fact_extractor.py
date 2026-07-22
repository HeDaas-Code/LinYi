# -*- coding: utf-8 -*-
"""Tests for LLMFactExtractor."""
from __future__ import annotations

import time
from typing import Any

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.llm import LLMService
from src.novelist_brain.llm_fact_extractor import (
    TOPIC_FACT_EXTRACTED,
    ExtractedFact,
    LLMFactExtractor,
)
from src.novelist_brain.models import OCCharacterSheet
from src.novelist_brain.oc_character_system import OCCharacterSystem
from src.novelist_brain.reader_profile import ReaderProfile


class _FakeLLM(LLMService):
    """LLM service that returns a canned JSON fact list."""

    def __init__(self, response: str) -> None:
        super().__init__()
        self._response = response

    def complete(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 256,
    ) -> str:
        return self._response

    def embed(self, text: str) -> list[float]:
        return [0.0] * 8


def _build_extractor(
    router: BusRouter,
    reader: ReaderProfile | None,
    oc_system: OCCharacterSystem | None,
    llm: LLMService | None = None,
    **cfg_overrides: Any,
) -> LLMFactExtractor:
    extractor = LLMFactExtractor(name="llm_fact_extractor")
    if reader is not None:
        reader.register(router)
    if oc_system is not None:
        oc_system.register(router)
    extractor.register(router)
    cfg = {
        "reader_enabled": True,
        "oc_enabled": True,
        "llm_enabled": True,
        "min_chars": 10,
        "max_buffer_turns": 2,
        "cooldown_seconds": 0.0,
        "max_facts_per_run": 5,
        "llm_temperature": 0.2,
        "llm_max_tokens": 400,
    }
    cfg.update(cfg_overrides)
    extractor.init(
        {
            "llm_service": llm,
            "reader_profile_instance": reader,
            "oc_character_system_instance": oc_system,
            "llm_fact_extractor": cfg,
        }
    )
    router.flush()
    return extractor


def test_reader_heuristic_extraction_with_mock_llm() -> None:
    """Fallback heuristic extracts reader self-disclosure facts."""
    router = BusRouter()
    reader = ReaderProfile(name="reader_profile")
    # Mock LLM forces heuristic path.
    from src.novelist_brain.llm import MockLLMService

    extractor = _build_extractor(
        router,
        reader,
        None,
        llm=MockLLMService(seed=1),
    )

    router.publish(
        source="ui",
        topic="control.fact.extract",
        channel="control",
        payload={
            "target_type": "reader",
            "text": "我叫小A，我喜欢喝拿铁。我住在上海。",
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    assert "name" in reader.profile.known_facts or "like" in reader.profile.known_facts
    assert any("上海" in v for v in reader.profile.known_facts.values())


def test_oc_heuristic_extraction_from_town_event(tmp_path: Any) -> None:
    """Town event summary for a known OC yields OC facts."""
    router = BusRouter()
    oc_system = OCCharacterSystem(name="oc_character_system")
    oc_system.init(
        {
            "novel_v2": {
                "novel_id": "test_novel",
                "oc_registry_dir": str(tmp_path),
            },
        }
    )
    sheet = OCCharacterSheet(character_id="oc_001", name="苏晚")
    oc_system._sheets["oc_001"] = sheet

    extractor = _build_extractor(
        router,
        None,
        oc_system,
        llm=None,
    )

    router.publish(
        source="oc_town_engine",
        topic="data.oc.town.event",
        channel="data",
        payload={
            "character_id": "oc_001",
            "summary": "苏晚喜欢雨后的街道，她住在老城区。",
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    facts = sheet.known_facts
    assert any("雨后" in v or "街道" in v for v in facts.values()) or "like" in facts
    assert any("老城区" in v for v in facts.values()) or "location" in facts


def test_llm_json_parsing() -> None:
    """JSON returned by a real LLM is parsed into facts."""
    router = BusRouter()
    reader = ReaderProfile(name="reader_profile")
    fake_llm = _FakeLLM(
        '[{"key": "喜欢的饮料", "value": "美式咖啡"}, '
        '{"key": "职业", "value": "插画师"}]'
    )
    extractor = _build_extractor(router, reader, None, llm=fake_llm)

    router.publish(
        source="ui",
        topic="control.fact.extract",
        channel="control",
        payload={
            "target_type": "reader",
            "text": "我最近总在咖啡馆画稿，只喝美式。",
        },
        priority=5,
        ttl=3,
    )
    router.flush()
    delivered = router.flush()  # capture messages emitted during processing

    assert reader.profile.known_facts.get("职业") == "插画师"
    assert reader.profile.known_facts.get("喜欢的饮料") == "美式咖啡"
    extracted_events = [m for m in delivered if m.topic == TOPIC_FACT_EXTRACTED]
    assert len(extracted_events) == 1
    assert extracted_events[0].payload["count"] == 2


def test_deduplication_against_existing_facts() -> None:
    """Facts already present are not duplicated."""
    router = BusRouter()
    reader = ReaderProfile(name="reader_profile")

    fake_llm = _FakeLLM('[{"key": "饮品偏好", "value": "美式咖啡"}]')
    extractor = _build_extractor(router, reader, None, llm=fake_llm)

    reader.set_fact("喜欢的饮料", "美式咖啡")
    router.flush()

    router.publish(
        source="ui",
        topic="control.fact.extract",
        channel="control",
        payload={
            "target_type": "reader",
            "text": "我还是喜欢喝美式咖啡。",
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    values = list(reader.profile.known_facts.values())
    assert values.count("美式咖啡") == 1


def test_cooldown_blocks_repeated_extraction() -> None:
    """Second flush within cooldown window is skipped."""
    router = BusRouter()
    reader = ReaderProfile(name="reader_profile")
    extractor = _build_extractor(
        router,
        reader,
        None,
        llm=None,
        cooldown_seconds=3600.0,
    )

    router.publish(
        source="ui",
        topic="event.reader.interaction",
        channel="event",
        payload={"content": "我叫小A，我喜欢喝拿铁。"},
        priority=5,
        ttl=3,
    )
    router.flush()
    assert len(reader.profile.known_facts) > 0

    router.publish(
        source="ui",
        topic="event.reader.interaction",
        channel="event",
        payload={"content": "我今年二十五岁，住在杭州。"},
        priority=5,
        ttl=3,
    )
    router.flush()

    # Cooldown should block the second flush; age/location not extracted yet.
    assert "age" not in reader.profile.known_facts
    assert not any("杭州" in v for v in reader.profile.known_facts.values())


def test_explicit_oc_control_extract(tmp_path: Any) -> None:
    """control.fact.extract with target_type=oc writes OC facts."""
    router = BusRouter()
    oc_system = OCCharacterSystem(name="oc_character_system")
    oc_system.init(
        {
            "novel_v2": {
                "novel_id": "test_oc",
                "oc_registry_dir": str(tmp_path),
            },
        }
    )
    sheet = OCCharacterSheet(character_id="oc_002", name="陆沉")
    oc_system._sheets["oc_002"] = sheet

    fake_llm = _FakeLLM('[{"key": "身份", "value": "古董店店主"}]')
    extractor = _build_extractor(router, None, oc_system, llm=fake_llm)

    router.publish(
        source="ui",
        topic="control.fact.extract",
        channel="control",
        payload={
            "target_type": "oc",
            "target_id": "oc_002",
            "text": "陆沉是这条街上最古老的古董店店主。",
        },
        priority=5,
        ttl=3,
    )
    router.flush()

    assert sheet.known_facts.get("身份") == "古董店店主"


def test_oc_set_fact_respects_immutable_facts(tmp_path: Any) -> None:
    """OC set_fact refuses to overwrite immutable facts."""
    oc_system = OCCharacterSystem(name="oc_character_system")
    oc_system.init(
        {
            "novel_v2": {
                "novel_id": "test_immutable",
                "oc_registry_dir": str(tmp_path),
            },
        }
    )
    sheet = OCCharacterSheet(
        character_id="oc_003",
        name="叶清",
        immutable_facts=["左肩有旧伤"],
    )
    oc_system._sheets["oc_003"] = sheet

    assert oc_system.set_fact("oc_003", "左肩有旧伤", "战斗中留下的疤痕") is False
    assert "左肩有旧伤" not in sheet.known_facts

    assert oc_system.set_fact("oc_003", "喜欢的茶", "龙井") is True
    assert sheet.known_facts.get("喜欢的茶") == "龙井"


def test_serialization_preserves_buffers() -> None:
    """to_dict / from_dict preserves configuration and buffered text."""
    extractor = LLMFactExtractor(name="llm_fact_extractor")
    extractor._reader_buffer = [("我叫小A。", time.time())]
    extractor._oc_buffer["oc_001"] = [("苏晚喜欢雨。", time.time())]
    extractor._last_run["reader"] = time.time() - 10

    data = extractor.to_dict()
    restored = LLMFactExtractor(name="llm_fact_extractor")
    restored.from_dict(data)

    assert restored._reader_enabled == extractor._reader_enabled
    assert any(item[0] == "我叫小A。" for item in restored._reader_buffer)
    assert restored._oc_buffer.get("oc_001") and any(
        item[0] == "苏晚喜欢雨。" for item in restored._oc_buffer["oc_001"]
    )
    assert "reader" in restored._last_run


def test_extracted_fact_dataclass() -> None:
    """ExtractedFact serialization round-trips."""
    fact = ExtractedFact(
        target_type="reader",
        target_id="default_reader",
        key="name",
        value="小A",
        confidence=0.9,
        source_text="我叫小A。",
    )
    assert fact.to_dict()["key"] == "name"
    assert fact.to_dict()["value"] == "小A"
