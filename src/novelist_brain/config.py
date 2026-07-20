"""Unified configuration management for the novelist brain.

Configuration is layered in three priorities (low to high):

1. Built-in defaults (``default.config.json`` or hard-coded fallbacks).
2. User config file: ``novelist.config.json`` or ``novelist.config.yaml``.
3. Environment variables: ``NOVELIST_*``.

CLI flags still override LLM parameters for one-shot convenience.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from typing import Any

from src.novelist_brain.fault import RetryPolicy


CONFIG_VERSION = "2.1.0"


def _deep_merge(base: Any, overlay: Any) -> Any:
    """Recursively merge ``overlay`` into ``base``.

    Dicts are merged deeply; lists and scalars are replaced by ``overlay``.
    """
    if not isinstance(base, dict) or not isinstance(overlay, dict):
        return overlay
    merged = dict(base)
    for key, value in overlay.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


@dataclass
class IdentityConfig:
    """Core personality configuration (change rarely)."""

    name: str = "林逸"
    pen_name: str = "静观者"
    values: list[str] = field(
        default_factory=lambda: ["真实", "共情", "美", "孤独", "自由", "耐心"]
    )
    traits: dict[str, float] = field(
        default_factory=lambda: {
            "开放性": 0.88,
            "内倾性": 0.78,
            "神经质": 0.55,
            "尽责性": 0.62,
            "敏感性": 0.82,
        }
    )
    interests: list[str] = field(
        default_factory=lambda: [
            "城市边缘人",
            "记忆",
            "雨",
            "旧物",
            "未说出口的话",
            "凌晨的便利店",
            "窗边的光线",
        ]
    )
    self_narrative: str = (
        "我叫林逸，笔名静观者。我在人群边缘写字，相信那些被忽略的瞬间里藏着真正的小说。"
        "我习惯早起，喝一杯不加糖的黑咖啡，在窗边坐到城市苏醒。白天我观察、散步、与人保持"
        "礼貌的距离，因为太近会让我失语。晚上七点后，我开始写作——不是因为我有灵感，而是"
        "因为我已经用一整天收集到了足够的沉默。我害怕被世界看见，又害怕它完全忽略我；"
        "这种矛盾是我小说的燃料。"
    )
    rhythm_preferences: dict[str, Any] = field(
        default_factory=lambda: {
            "preferred_writing_hours": [19, 23],
            "sleep_start": 0,
            "wake_up": 6,
            "peak_energy": 21,
            "meal_times": [7, 12, 19],
        }
    )
    integrity_score: float = 1.0
    voice_signature: dict[str, Any] = field(
        default_factory=lambda: {
            "sentence_rhythm": "中短句为主，偶尔拖长，像呼吸",
            "sensory_bias": "视觉与听觉优先，触觉谨慎",
            "emotional_register": "克制、内省、有节制的忧郁",
            "favorite_images": ["雨", "窗", "旧台灯", "空椅子", "末班车"],
        }
    )
    internal_conflict: str = (
        "林逸想要靠近世界以收集它，又害怕被它看见；他相信孤独里才有真正的小说，"
        "却又在孤独中怀疑这是否只是借口。"
    )
    habits: dict[str, Any] = field(
        default_factory=lambda: {
            "morning": "六点醒来，黑咖啡，窗边静坐二十分钟",
            "daytime": "散步、观察、在便签上记下一句话",
            "evening": "七点后写作，十一点前结束",
            "night": "睡前重读当天写的一段，然后关掉台灯",
            "quirks": ["收集旧车票", "在雨天出门", "避免 eye contact"],
        }
    )
    anchors: dict[str, Any] = field(
        default_factory=lambda: {
            "home": "城中老小区一间朝西的出租屋",
            "objects": ["旧台灯", "磨破边的笔记本", "黑咖啡杯", "窗台的绿萝"],
            "places": ["凌晨的便利店", "旧书店二楼", "河边的栏杆"],
        }
    )
    current_novel: dict[str, Any] = field(
        default_factory=lambda: {
            "title": "脑中世界纪事",
            "theme": "一个在城市边缘观察他人的人，如何慢慢被自己的观察改变",
            "protagonist": "林逸自身的投射",
            "setting": "黎明中无名的城市",
        }
    )
    childhood_memory: str = (
        "小时候住在南方小城，外婆总在雨天把椅子搬到门口看雨。"
        "她说雨是天空在写字，人要安静才能读懂。"
    )
    baseline_mood: dict[str, float] = field(
        default_factory=lambda: {"valence": 0.1, "arousal": 0.3, "dominance": 0.4}
    )
    voice: str = "third_person_limited"


@dataclass
class PhysiologyConfig:
    """Physiological constraints and circadian parameters."""

    max_energy: float = 100.0
    sleep_cycle_hours: float = 7.5
    circadian_rhythm: list[dict[str, Any]] = field(
        default_factory=lambda: [
            {"phase": "deep_night", "energy_factor": 0.2, "creativity_factor": 0.4},
            {"phase": "morning", "energy_factor": 0.9, "creativity_factor": 0.7},
            {"phase": "incubation", "energy_factor": 0.8, "creativity_factor": 0.85},
            {"phase": "social", "energy_factor": 0.75, "creativity_factor": 0.5},
            {"phase": "simulation", "energy_factor": 0.7, "creativity_factor": 0.9},
            {"phase": "reflection", "energy_factor": 0.6, "creativity_factor": 0.8},
            {"phase": "creation", "energy_factor": 0.65, "creativity_factor": 0.95},
        ]
    )
    metabolism_rates: dict[str, float] = field(
        default_factory=lambda: {
            "rest": 0.5,
            "thinking": 2.0,
            "social": 3.0,
            "creation": 4.0,
        }
    )
    recovery_rates: dict[str, float] = field(
        default_factory=lambda: {
            "sleep": 8.0,
            "nap": 4.0,
            "leisure": 2.0,
        }
    )


@dataclass
class CreativityConfig:
    """Stylistic and creative-process parameters."""

    prose_style: dict[str, Any] = field(
        default_factory=lambda: {
            "density": 0.65,
            "lyricism": 0.55,
            "dialogue_ratio": 0.30,
            "paragraph_max_sentences": 6,
        }
    )
    genre_weights: dict[str, float] = field(
        default_factory=lambda: {"literary": 0.6, "realism": 0.3, "magical_realism": 0.1}
    )
    taboo_words: list[str] = field(default_factory=lambda: ["显然", "突然", "不得不说"])
    foreshadowing_strategy: str = "thematic"
    revision_threshold: float = 0.6


@dataclass
class SocialConfig:
    """Social simulation parameters (Design.md §16)."""

    social_radius: int = 12
    intimacy_thresholds: dict[str, float] = field(
        default_factory=lambda: {
            "stranger": 0.0,
            "acquaintance": 0.2,
            "friend": 0.5,
            "intimate": 0.8,
        }
    )
    fatigue_rate: float = 1.2
    starting_space: str = "home"
    starting_role: str = "recluse"
    starting_social_energy: float = 100.0
    platform_rules: list[dict[str, Any]] = field(
        default_factory=lambda: [
            {
                "platform": "town_square",
                "max_daily_interactions": 5,
                "topic_whitelist": ["literature", "daily_life"],
            }
        ]
    )
    spaces: list[dict[str, Any]] | None = None
    roles: list[dict[str, Any]] | None = None
    npcs: list[dict[str, Any]] | None = None


@dataclass
class MemoryConfig:
    """Memory system configuration (Design.md §8 / §14).

    The default ``backend`` is ``memory`` for backward compatibility with
    existing tests.  Production deployments should set ``backend`` to
    ``sqlite`` and provide a ``db_path`` to enable the local-database-first
    hybrid store (vector + graph + time-series + document).
    """

    backend: str = "memory"  # "memory" | "sqlite"
    db_path: str = "memory_store.sqlite"
    embedding_dim: int = 1536
    min_tag_overlap: int = 2
    consolidation_threshold: float = 0.35
    working_memory_capacity: int = 20


@dataclass
class MultimodalConfig:
    """Multimodal input configuration (Design.md §8 / §14).

    Currently only image inputs are supported; audio and sensor inputs are
    explicitly out of scope.  Vision capabilities rely on the LLM provider's
    native multimodal support (OpenAI-compatible ``image_url`` messages).
    """

    enabled: bool = True
    supported_modalities: list[str] = field(default_factory=lambda: ["image"])
    vision_model: str | None = None
    max_image_size_bytes: int = 5_000_000


@dataclass
class TRPGConfig:
    """Mental sandbox / TRPG rule configuration (Design.md §17)."""

    rule_system: str = "COC"
    rulebook_path: str | None = None
    embedded_rulebook: dict[str, Any] = field(default_factory=dict)
    success_levels: dict[str, float] = field(
        default_factory=lambda: {
            "critical_success": 0.05,
            "success": 0.5,
            "failure": 1.0,
            "critical_failure": 0.96,
        }
    )
    character_sheet_template: dict[str, Any] = field(
        default_factory=lambda: {
            "attributes": ["str", "con", "dex", "int", "pow", "app", "edu", "siz"],
            "skill_slots": 12,
        }
    )
    world_rules: list[dict[str, str]] = field(
        default_factory=lambda: [
            {"name": "行动有情感后果", "description": "每个选择都会在世界模型中留下情绪痕迹。"},
            {"name": "随机性塑造命运", "description": "骰子判定引入不可预测性，意外即灵感。"},
        ]
    )
    max_rounds_per_scene: int = 8
    enable_gm: bool = True
    sanity_enabled: bool = True
    enable_ab_fork: bool = True


@dataclass
class LLMConfig:
    """LLM provider and runtime parameters."""

    default_model: str = "gpt-3.5-turbo"
    fallback_model: str = ""
    providers: list[dict[str, str]] = field(
        default_factory=lambda: [
            {
                "name": "openai",
                "api_key_env": "OPENAI_API_KEY",
                "base_url": "",
            }
        ]
    )
    temperature: float = 0.75
    max_tokens: int = 4096
    timeout: float = 180.0
    retry_policy: dict[str, Any] = field(
        default_factory=lambda: {"max_retries": 2, "backoff_ms": 500}
    )
    token_budgets: dict[str, float] = field(
        default_factory=lambda: {
            "sandbox": 0.35,
            "creation": 0.30,
            "memory": 0.15,
            "dmn": 0.10,
            "cen": 0.08,
            "sn": 0.02,
        }
    )
    response_format_default: str = "text"
    use_mock: bool = False
    embedding_model: str = "text-embedding-3-small"

    def active_provider(self) -> dict[str, str] | None:
        """Return the first provider that has an API key available."""
        for provider in self.providers:
            api_key_env = provider.get("api_key_env", "OPENAI_API_KEY")
            if os.getenv(api_key_env):
                return provider
        return None


@dataclass
class PersistenceConfig:
    """State persistence and retention policy."""

    backend: str = "file"
    connection_string: str = ""
    snapshot_interval: int = 100
    delta_log_path: str = ""
    retention: dict[str, Any] = field(
        default_factory=lambda: {
            "fragments": {"ttl": 604800, "max_count": 5000},
            "traces": {"min_importance": 0.1, "max_count": 2000},
            "logs": {"ttl": 2592000},
            "sandbox_versions": {"max_count": 50, "keep_committed": True},
            "snapshots": {"max_count": 10},
            "emergency_snapshots": {"max_count": 5},
        }
    )


@dataclass
class EOSConfig:
    """Evaluation & Observability System parameters."""

    enabled: bool = True
    evaluation_interval_ticks: int = 6
    report_on_phase_change: bool = True
    sampling_rates: dict[str, float] = field(
        default_factory=lambda: {
            "event.clock.tick": 1.0,
            "data.memory.fragment.stored": 1.0,
            "data.memory.trace.created": 1.0,
            "control.network.switch": 1.0,
        }
    )
    threshold_rules: list[dict[str, Any]] = field(
        default_factory=lambda: [
            {
                "metric_id": "metabolic_balance_index",
                "condition": "below",
                "threshold": 0.25,
                "severity": "critical",
                "action": "request_recovery",
                "cooldown_ms": 300000,
            },
            {
                "metric_id": "gaze_load",
                "condition": "above",
                "threshold": 0.75,
                "severity": "warning",
                "action": "switch_network",
                "cooldown_ms": 300000,
            },
            {
                "metric_id": "llm_failure_rate",
                "condition": "above",
                "threshold": 0.3,
                "severity": "warning",
                "action": "pause_module",
                "cooldown_ms": 600000,
            },
        ]
    )


@dataclass
class FaultConfig:
    """Fault handling and self-healing configuration (Design.md §20)."""

    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)
    auto_recover: bool = True
    safe_mode_on_critical_identity: bool = True
    safe_mode_on_persistence_failure: bool = True
    max_concurrent_recoveries: int = 3
    recovery_history_size: int = 50

    def to_dict(self) -> dict[str, Any]:
        """Serialize fault configuration to a plain dict."""
        return {
            "retry_policy": self.retry_policy.to_dict(),
            "auto_recover": self.auto_recover,
            "safe_mode_on_critical_identity": self.safe_mode_on_critical_identity,
            "safe_mode_on_persistence_failure": self.safe_mode_on_persistence_failure,
            "max_concurrent_recoveries": self.max_concurrent_recoveries,
            "recovery_history_size": self.recovery_history_size,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FaultConfig:
        """Restore fault configuration from a plain dict."""
        retry_data = data.get("retry_policy")
        retry_policy = (
            RetryPolicy.from_dict(retry_data)
            if isinstance(retry_data, dict)
            else RetryPolicy()
        )
        return cls(
            retry_policy=retry_policy,
            auto_recover=bool(data.get("auto_recover", True)),
            safe_mode_on_critical_identity=bool(
                data.get("safe_mode_on_critical_identity", True)
            ),
            safe_mode_on_persistence_failure=bool(
                data.get("safe_mode_on_persistence_failure", True)
            ),
            max_concurrent_recoveries=int(
                data.get("max_concurrent_recoveries", 3)
            ),
            recovery_history_size=int(data.get("recovery_history_size", 50)),
        )


@dataclass
class WebUIConfig:
    """Dashboard configuration (Design.md §22)."""

    enabled: bool = True
    host: str = "127.0.0.1"
    port: int = 8080
    refresh_interval_ms: int = 2000


@dataclass
class NovelistConfig:
    """Root configuration object matching Design.md section 21."""

    version: str = CONFIG_VERSION
    source: str = "built-in"
    core: IdentityConfig = field(default_factory=IdentityConfig)
    physiology: PhysiologyConfig = field(default_factory=PhysiologyConfig)
    creativity: CreativityConfig = field(default_factory=CreativityConfig)
    social: SocialConfig = field(default_factory=SocialConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    multimodal: MultimodalConfig = field(default_factory=MultimodalConfig)
    trpg: TRPGConfig = field(default_factory=TRPGConfig)
    llm: LLMConfig = field(default_factory=LLMConfig)
    persistence: PersistenceConfig = field(default_factory=PersistenceConfig)
    eos: EOSConfig = field(default_factory=EOSConfig)
    fault: FaultConfig = field(default_factory=FaultConfig)
    webui: WebUIConfig = field(default_factory=WebUIConfig)
    plugin_directory: str | None = None


HOT_RELOADABLE_PATHS: set[str] = {
    "llm.temperature",
    "llm.max_tokens",
    "llm.timeout",
    "llm.retry_policy",
    "llm.token_budgets",
    "llm.response_format_default",
    "creativity.prose_style",
    "creativity.foreshadowing_strategy",
    "creativity.revision_threshold",
    "creativity.taboo_words",
    "social.social_radius",
    "social.fatigue_rate",
    "social.intimacy_thresholds",
    "trpg.success_levels",
    "trpg.max_rounds_per_scene",
    "trpg.world_rules",
    "persistence.retention",
    "persistence.snapshot_interval",
    "eos.enabled",
    "eos.evaluation_interval_ticks",
    "eos.report_on_phase_change",
    "eos.sampling_rates",
    "eos.threshold_rules",
    "fault.retry_policy",
    "fault.auto_recover",
    "fault.max_concurrent_recoveries",
    "fault.recovery_history_size",
    "webui.refresh_interval_ms",
}

RESTART_REQUIRED_PATHS: set[str] = {
    "core",
    "physiology",
    "persistence.backend",
    "persistence.connection_string",
}


class ConfigRegistry:
    """Holds the merged configuration and exposes dotted-path access.

    This is a minimal implementation of the ``ConfigRegistry`` interface
    described in Design.md section 21.4. Subscriptions and hot-reload are
    stubbed but ready to be wired into the agent loop later.
    """

    def __init__(self, config: NovelistConfig | None = None) -> None:
        self._config = config if config is not None else NovelistConfig()
        self._subscribers: dict[str, list[Any]] = {}

    @property
    def config(self) -> NovelistConfig:
        return self._config

    def get(self, path: str, default: Any = None) -> Any:
        """Read a value by dotted path, e.g. ``llm.temperature``."""
        parts = path.split(".")
        value: Any = self._config
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            else:
                value = getattr(value, part, None)
            if value is None:
                return default
        return value

    def get_config(self) -> NovelistConfig:
        """Return a snapshot of the full configuration tree."""
        return self._config

    def to_dict(self) -> dict[str, Any]:
        """Serialize the full configuration to a plain dict."""
        return asdict(self._config)

    def subscribe(self, path: str, handler: Any) -> None:
        """Register a callback for changes to ``path``."""
        self._subscribers.setdefault(path, []).append(handler)

    def is_hot_reloadable(self, path: str) -> bool:
        """Return whether ``path`` can be updated without a restart."""
        for hot in HOT_RELOADABLE_PATHS:
            if path == hot or path.startswith(hot + "."):
                return True
        return False

    def requires_restart(self, path: str) -> bool:
        """Return whether changing ``path`` requires an agent restart."""
        for restart in RESTART_REQUIRED_PATHS:
            if path == restart or path.startswith(restart + "."):
                return True
        return False


def _load_yaml(path: str) -> dict[str, Any]:
    """Load YAML if PyYAML is installed, otherwise raise."""
    try:
        import yaml
    except ImportError as exc:
        raise ImportError(
            "PyYAML is required to load YAML config files. "
            "Install it or use JSON config files."
        ) from exc
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_config_file(path: str) -> dict[str, Any]:
    """Load either JSON or YAML based on extension."""
    if path.endswith((".yaml", ".yml")):
        return _load_yaml(path)
    return _load_json(path)


def _apply_env_overrides(raw: dict[str, Any]) -> dict[str, Any]:
    """Apply a small, explicit set of NOVELIST_* environment variables."""
    overrides: dict[str, Any] = {}

    def set_path(path: str, value: Any) -> None:
        parts = path.split(".")
        node = overrides
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = value

    if os.getenv("NOVELIST_LLM_BASE_URL"):
        set_path("llm.providers.0.base_url", os.getenv("NOVELIST_LLM_BASE_URL"))
    if os.getenv("NOVELIST_LLM_API_KEY"):
        # The API key is stored in an env variable, never written to config files.
        set_path("llm.providers.0.api_key_env", "NOVELIST_LLM_API_KEY")
    if os.getenv("NOVELIST_LLM_MODEL"):
        set_path("llm.default_model", os.getenv("NOVELIST_LLM_MODEL"))
    if os.getenv("NOVELIST_LLM_TEMPERATURE"):
        set_path("llm.temperature", float(os.getenv("NOVELIST_LLM_TEMPERATURE")))
    if os.getenv("NOVELIST_LLM_MAX_TOKENS"):
        set_path("llm.max_tokens", int(os.getenv("NOVELIST_LLM_MAX_TOKENS")))
    if os.getenv("NOVELIST_LLM_TIMEOUT"):
        set_path("llm.timeout", float(os.getenv("NOVELIST_LLM_TIMEOUT")))
    if os.getenv("NOVELIST_LLM_USE_MOCK"):
        set_path("llm.use_mock", os.getenv("NOVELIST_LLM_USE_MOCK").lower() in ("1", "true", "yes"))
    if os.getenv("NOVELIST_CORE_NAME"):
        set_path("core.name", os.getenv("NOVELIST_CORE_NAME"))
    if os.getenv("NOVELIST_PERSISTENCE_SAVE_PATH"):
        set_path("persistence.connection_string", os.getenv("NOVELIST_PERSISTENCE_SAVE_PATH"))

    return _deep_merge(raw, overrides)


def _build_fault_config(values: Any) -> FaultConfig:
    """Build a ``FaultConfig`` from a plain dict, converting ``retry_policy``."""
    if not isinstance(values, dict):
        return FaultConfig()
    retry_data = values.get("retry_policy")
    retry = (
        RetryPolicy.from_dict(retry_data)
        if isinstance(retry_data, dict)
        else RetryPolicy()
    )
    known = {f.name for f in FaultConfig.__dataclass_fields__.values()}
    kwargs = {k: v for k, v in values.items() if k in known and k != "retry_policy"}
    kwargs["retry_policy"] = retry
    return FaultConfig(**kwargs)


def _config_from_dict(data: dict[str, Any]) -> NovelistConfig:
    """Build a ``NovelistConfig`` from a plain dict, ignoring unknown keys."""
    data = dict(data)
    data.pop("version", None)
    data.pop("source", None)

    def build(cls: type, values: Any) -> Any:
        if not isinstance(values, dict):
            return cls()
        known = {f.name for f in cls.__dataclass_fields__.values()}
        return cls(**{k: v for k, v in values.items() if k in known})

    return NovelistConfig(
        version=data.get("version", CONFIG_VERSION),
        source=data.get("source", ""),
        core=build(IdentityConfig, data.get("core")),
        physiology=build(PhysiologyConfig, data.get("physiology")),
        creativity=build(CreativityConfig, data.get("creativity")),
        social=build(SocialConfig, data.get("social")),
        memory=build(MemoryConfig, data.get("memory")),
        multimodal=build(MultimodalConfig, data.get("multimodal")),
        trpg=build(TRPGConfig, data.get("trpg")),
        llm=build(LLMConfig, data.get("llm")),
        persistence=build(PersistenceConfig, data.get("persistence")),
        eos=build(EOSConfig, data.get("eos")),
        fault=_build_fault_config(data.get("fault")),
        webui=build(WebUIConfig, data.get("webui")),
    )


def load_config(
    config_path: str | None = None,
    project_root: str | None = None,
) -> ConfigRegistry:
    """Load layered configuration and return a ``ConfigRegistry``.

    Parameters
    ----------
    config_path:
        Explicit user config file. If ``None``, ``novelist.config.json`` or
        ``novelist.config.yaml`` in the project root is used when present.
    project_root:
        Directory containing ``main.py`` and the default config files.
        Defaults to the parent of this file's parent.
    """
    if project_root is None:
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # 1. Start with built-in defaults.
    raw: dict[str, Any] = {}
    default_json = os.path.join(project_root, "default.config.json")
    default_yaml = os.path.join(project_root, "default.config.yaml")
    if os.path.isfile(default_json):
        raw = _load_json(default_json)
    elif os.path.isfile(default_yaml):
        raw = _load_yaml(default_yaml)

    # 2. Merge user config file.
    user_path = config_path
    if user_path is None:
        json_path = os.path.join(project_root, "novelist.config.json")
        yaml_path = os.path.join(project_root, "novelist.config.yaml")
        if os.path.isfile(json_path):
            user_path = json_path
        elif os.path.isfile(yaml_path):
            user_path = yaml_path

    if user_path and os.path.isfile(user_path):
        user_raw = _load_config_file(user_path)
        raw["source"] = user_path
        raw = _deep_merge(raw, user_raw)

    # 3. Apply environment variable overrides.
    raw = _apply_env_overrides(raw)

    config = _config_from_dict(raw)
    if not config.source and user_path:
        config.source = user_path
    elif not config.source:
        config.source = "built-in"

    return ConfigRegistry(config)


def build_llm_config_dict(config: NovelistConfig) -> dict[str, Any]:
    """Convert the LLM layer of the config into the dict expected by ``create_llm_service``."""
    provider = config.llm.active_provider()
    api_key: str | None = None
    base_url: str | None = None
    if provider:
        api_key_env = provider.get("api_key_env", "OPENAI_API_KEY")
        api_key = os.getenv(api_key_env)
        base_url = provider.get("base_url") or ""

    return {
        "use_mock": config.llm.use_mock,
        "model": config.llm.default_model,
        "api_key": api_key,
        "base_url": base_url,
        "embedding_model": config.llm.embedding_model,
        "temperature": config.llm.temperature,
        "max_tokens": config.llm.max_tokens,
        "timeout": config.llm.timeout,
    }
