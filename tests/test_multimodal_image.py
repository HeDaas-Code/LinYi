"""Tests for multimodal image input support."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.config import MultimodalConfig, NovelistConfig, _config_from_dict
from src.novelist_brain.llm import (
    LLMCallError,
    MockLLMService,
    OpenAILLMService,
    _extract_image_urls,
)
from src.novelist_brain.memory_store import HybridMemoryStore
from src.novelist_brain.models import BusMessage, Fragment
from src.novelist_brain.personal_input import PersonalInput


SAMPLE_IMAGE_URL = "https://example.com/rainy-window.jpg"


def test_fragment_supports_image_url() -> None:
    fragment = Fragment(
        content="雨夜窗前的空椅子",
        source="multimodal",
        modality="image",
        image_url=SAMPLE_IMAGE_URL,
        tags=["图像", "雨夜"],
    )
    assert fragment.modality == "image"
    assert fragment.source == "multimodal"
    assert fragment.image_url == SAMPLE_IMAGE_URL


def test_fragment_image_roundtrip_via_dict() -> None:
    fragment = Fragment(
        content="一盏旧台灯",
        source="multimodal",
        modality="image",
        image_url="https://example.com/lamp.jpg",
        tags=["图像", "旧物"],
    )
    data = {
        "id": fragment.id,
        "content": fragment.content,
        "source": fragment.source,
        "modality": fragment.modality,
        "valence": fragment.valence,
        "arousal": fragment.arousal,
        "salience": fragment.salience,
        "timestamp": fragment.timestamp,
        "tags": fragment.tags,
        "embedding": fragment.embedding,
        "image_url": fragment.image_url,
    }
    restored = Fragment(**data)
    assert restored.modality == "image"
    assert restored.image_url == "https://example.com/lamp.jpg"


def test_extract_image_urls_from_context() -> None:
    assert _extract_image_urls(None) == []
    assert _extract_image_urls({}) == []
    assert _extract_image_urls({"image_url": SAMPLE_IMAGE_URL}) == [SAMPLE_IMAGE_URL]
    assert _extract_image_urls({"image_urls": [SAMPLE_IMAGE_URL, "https://x/y.jpg"]}) == [
        SAMPLE_IMAGE_URL,
        "https://x/y.jpg",
    ]


def test_mock_llm_returns_chinese_for_image_input() -> None:
    service = MockLLMService(seed=42)
    result = service.complete("描述这张图", context={"image_url": SAMPLE_IMAGE_URL})
    assert "图" in result or "图像" in result or "画面" in result


def test_openai_service_builds_multimodal_messages() -> None:
    service = OpenAILLMService(
        base_url="http://localhost:9999/v1",
        api_key="test-key",
        model="vision-model",
    )
    messages = [
        {"role": "system", "content": "你是一个小说家。"},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "描述这张图"},
                {"type": "image_url", "image_url": {"url": SAMPLE_IMAGE_URL}},
            ],
        },
    ]
    fake_response = {
        "choices": [
            {
                "message": {
                    "content": "窗外的雨把街道洗成一幅未完成的水彩。",
                }
            }
        ]
    }
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(fake_response).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        result = service.complete(
            "描述这张图", context={"image_url": SAMPLE_IMAGE_URL}
        )

    assert "水彩" in result
    call_args = mock_urlopen.call_args
    req = call_args[0][0]
    sent_body = json.loads(req.data)
    assert sent_body["model"] == "vision-model"
    user_msg = sent_body["messages"][-1]
    assert user_msg["role"] == "user"
    assert isinstance(user_msg["content"], list)
    assert user_msg["content"][0]["type"] == "text"
    assert user_msg["content"][1]["type"] == "image_url"
    assert user_msg["content"][1]["image_url"]["url"] == SAMPLE_IMAGE_URL


def test_openai_service_multimodal_empty_image_url_is_text_only() -> None:
    service = OpenAILLMService(
        base_url="http://localhost:9999/v1",
        api_key="test-key",
        model="vision-model",
    )
    fake_response = {
        "choices": [{"message": {"content": "一段纯文本回答。"}}]
    }
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(fake_response).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        result = service.complete("你好")

    assert "纯文本回答" in result
    req = mock_urlopen.call_args[0][0]
    sent_body = json.loads(req.data)
    user_msg = sent_body["messages"][-1]
    assert user_msg["content"] == "你好"


class _CaptureModule:
    """Minimal module used to capture emitted messages in tests."""

    def __init__(self, name: str = "capture") -> None:
        self.name = name
        self.subscriptions = ["fragment.personal.new"]
        self.received: list[BusMessage] = []
        self.state = type("State", (), {"active": True})()

    def on_bus_message(self, message: BusMessage) -> None:
        self.received.append(message)


def test_personal_input_emits_fragment_for_image() -> None:
    router = BusRouter()
    personal = PersonalInput(name="personal_input")
    personal.register(router)
    personal.init({})

    capture = _CaptureModule("capture")
    router.subscribe(capture)

    personal.on_bus_message(
        BusMessage(
            source="test",
            topic="data.multimodal.image.new",
            channel="data",
            payload={
                "image_url": SAMPLE_IMAGE_URL,
                "description": "雨夜窗前的台灯",
                "valence": -0.1,
                "arousal": 0.3,
                "salience": 0.6,
                "tags": ["雨夜", "窗", "台灯"],
            },
        )
    )
    router.flush()

    assert len(capture.received) == 1
    fragment = capture.received[0].payload
    assert isinstance(fragment, Fragment)
    assert fragment.modality == "image"
    assert fragment.source == "multimodal"
    assert fragment.image_url == SAMPLE_IMAGE_URL
    assert fragment.content == "雨夜窗前的台灯"
    assert fragment.salience == pytest.approx(0.6)
    assert "雨夜" in fragment.tags


def test_personal_input_ignores_invalid_image_payload() -> None:
    router = BusRouter()
    personal = PersonalInput(name="personal_input")
    personal.register(router)
    personal.init({})

    capture = _CaptureModule("capture")
    router.subscribe(capture)

    personal.on_bus_message(
        BusMessage(
            source="test",
            topic="data.multimodal.image.new",
            channel="data",
            payload={"description": "没有图片 URL"},
        )
    )
    personal.on_bus_message(
        BusMessage(
            source="test",
            topic="data.multimodal.image.new",
            channel="data",
            payload=None,
        )
    )
    router.flush()

    assert len(capture.received) == 0


def test_multimodal_config_defaults_to_image_only() -> None:
    cfg = MultimodalConfig()
    assert cfg.enabled is True
    assert cfg.supported_modalities == ["image"]
    assert cfg.vision_model is None
    assert cfg.max_image_size_bytes == 5_000_000


def test_config_from_dict_parses_multimodal() -> None:
    cfg = _config_from_dict(
        {
            "multimodal": {
                "enabled": False,
                "supported_modalities": ["image"],
                "vision_model": "gpt-4o",
                "max_image_size_bytes": 2_000_000,
            }
        }
    )
    assert isinstance(cfg, NovelistConfig)
    assert cfg.multimodal.enabled is False
    assert cfg.multimodal.vision_model == "gpt-4o"
    assert cfg.multimodal.max_image_size_bytes == 2_000_000


def test_hybrid_memory_store_persists_image_fragment() -> None:
    store = HybridMemoryStore(":memory:")
    fragment = Fragment(
        content="空椅子在角落等待",
        source="multimodal",
        modality="image",
        image_url="https://example.com/chair.jpg",
        tags=["图像", "空椅子"],
    )
    store.save_fragment(fragment)

    loaded = store.get_fragment(fragment.id)
    assert loaded is not None
    assert loaded.modality == "image"
    assert loaded.source == "multimodal"
    assert loaded.image_url == "https://example.com/chair.jpg"


def test_memory_system_receives_image_fragment() -> None:
    from src.novelist_brain.memory import MemorySystem

    router = BusRouter()
    memory = MemorySystem(name="memory_system")
    memory.register(router)
    memory.init({})

    fragment = Fragment(
        content="雨夜街道",
        source="multimodal",
        modality="image",
        image_url="https://example.com/street.jpg",
        tags=["图像", "雨夜"],
    )
    # PersonalInput converts multimodal image events to fragment.personal.new,
    # which MemorySystem is already subscribed to.
    memory.on_bus_message(
        BusMessage(
            source="test",
            topic="fragment.personal.new",
            channel="data",
            payload=fragment,
        )
    )

    assert fragment.id in memory.fragments
    assert memory.fragments[fragment.id].modality == "image"
