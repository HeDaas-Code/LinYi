"""Main entry point for the novelist brain agent.

本脚本组装所有模块并运行一个常驻 Agent 循环，由 :class:`RealTimeClock` 驱动。
默认行为是与真实世界时间同步：每真实分钟推进一 tick，系统启动后持续运行，
不会在一天结束后退出。小说家林逸在白天生活、观察、积累记忆，晚上 19:00-23:00
进入创作阶段写作。

仅当显式传入 ``--fast-forward`` / ``--tick-interval-seconds`` / ``--days N``
时才进入压缩测试模式，用于快速验证多日行为。

真实 LLM 通过 ``--llm-base-url`` / ``--llm-api-key`` / ``--llm-model``（或环境变量
``OPENAI_BASE_URL`` / ``OPENAI_API_KEY``）配置；未配置时回退到 :class:`MockLLMService`。
"""

from __future__ import annotations

import argparse
import datetime
import os
import sys
import time
from typing import Any

from dataclasses import asdict

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.attachment import AttachmentModule
from src.novelist_brain.chapter_manager import ChapterManager
from src.novelist_brain.circuit_breaker import CircuitBreaker
from src.novelist_brain.config import (
    ConfigRegistry,
    FaultConfig,
    NovelistConfig,
    build_llm_config_dict,
    load_config,
)
from src.novelist_brain.continuity_auditor import ContinuityAuditor
from src.novelist_brain.persistence import PersistenceManager, SnapshotStore, dataclass_to_dict
from src.novelist_brain.cen import CentralExecutiveNetwork
from src.novelist_brain.clock import Clock, RealTimeClock
from src.novelist_brain.creation_executive import CreationExecutive
from src.novelist_brain.dmn import DefaultModeNetwork
from src.novelist_brain.dynamics import Dynamics
from src.novelist_brain.eos import (
    CreativeCollector,
    EvaluationObservabilitySystem,
    LLMCollector,
    MemoryCollector,
    MetabolismCollector,
    NetworkCollector,
    SandboxCollector,
    SocialCollector,
)
from src.novelist_brain.fault import AgentError, ErrorType, Severity
from src.novelist_brain.identity import IdentityCore, LinYiProfile
from src.novelist_brain.llm import (
    LLMService,
    MockLLMService,
    ResilientLLMService,
    create_llm_service,
)
from src.novelist_brain.memory import MemorySystem
from src.novelist_brain.recovery import FaultManager, RecoveryManager
from src.novelist_brain.metabolism import Metabolism
from src.novelist_brain.models import BusMessage, StoryBible, TickDelta, WorldStateContract
from src.novelist_brain.module_registry import ModuleRegistry
from src.novelist_brain.novel_output import NovelOutput
from src.novelist_brain.oc_character_system import OCCharacterSystem
from src.novelist_brain.personal_input import PersonalInput
from src.novelist_brain.planner import Planner
from src.novelist_brain.quality_engine import QualityEngine
from src.novelist_brain.salience_network import SalienceNetwork
from src.novelist_brain.sandbox import MentalSandbox
from src.novelist_brain.sandbox_versioning import SandboxVersionManager
from src.novelist_brain.scheduler import DailyScheduler
from src.novelist_brain.self_timeline import SelfTimeline
from src.novelist_brain.social_input import SocialInput
from src.novelist_brain.transaction import TransactionManager
from src.novelist_brain.trpg_rulebook import Rulebook
from src.novelist_brain.topics import ALL_TOPICS, REFACTOR_V2_TOPICS
from src.novelist_brain.world_state import (
    WorldStateStore,
    load_or_create_world_state,
)
from src.novelist_brain.world_visual_debugger import WorldVisualDebugger


IMPORTANT_TOPICS: set[str] = set(ALL_TOPICS)


def format_hour(hour: float) -> str:
    """Return an HH:MM representation of a floating hour."""
    h = int(hour)
    m = int((hour - h) * 60)
    return f"{h:02d}:{m:02d}"


def summarize_message(message: BusMessage) -> str | None:
    """Return a short human-readable summary for important messages."""
    topic = message.topic
    payload = message.payload or {}

    if topic == "event.clock.phase.changed":
        return f"phase -> {payload.get('phase')}"
    if topic == "control.network.switch":
        return (
            f"network switch -> {payload.get('target_network')} "
            f"({payload.get('reason')})"
        )
    if topic == "control.sandbox.build":
        trace_count = len(payload.get("traces", []))
        return f"sandbox build ({trace_count} traces)"
    if topic == "control.sandbox.simulate":
        return f"sandbox simulate (round hint {payload.get('round_hint')})"
    if topic == "data.memory.trace.created":
        trace = payload.get("trace")
        if trace is not None:
            role = getattr(trace, "narrative_role", "?")
            return f"trace created [{role}]"
        return "trace created"
    if topic == "data.sandbox.narrative.ready":
        metrics = payload.get("depth_metrics", {})
        return f"narrative ready (round {payload.get('simulation_round')}, metrics {metrics})"
    if topic == "data.novel.paragraph":
        paragraph = str(payload.get("paragraph", ""))
        return f"novel paragraph generated ({len(paragraph)} chars, {len(paragraph.split())} words)"
    if topic == "event.novel.paragraph.published":
        return f"novel paragraph published [#{payload.get('index', -1) + 1}]"
    if topic == "control.metabolism.budget.exhausted":
        return "metabolism exhausted warning"
    return None


def build_context(
    router: BusRouter,
    clock: Clock | RealTimeClock,
    llm_service: LLMService,
    scheduler: DailyScheduler | None = None,
    config_registry: ConfigRegistry | None = None,
    identity_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble the shared agent context passed to every module.

    Values are taken from the unified configuration system when available and
    fall back to the historical hard-coded defaults for backward compatibility.
    """
    cfg = config_registry.config if config_registry is not None else NovelistConfig()
    if identity_profile is None:
        identity_profile = asdict(cfg.core)

    max_energy = cfg.physiology.max_energy
    initial_energy = max_energy * 0.8

    world_rules = [
        rule["name"] if isinstance(rule, dict) else str(rule)
        for rule in cfg.trpg.world_rules
    ] or [
        "行动有情感后果",
        "随机性塑造命运",
    ]

    if cfg.trpg.rulebook_path:
        rulebook = Rulebook.from_file(cfg.trpg.rulebook_path)
    elif cfg.trpg.embedded_rulebook:
        rulebook = Rulebook(cfg.trpg.embedded_rulebook)
    else:
        rulebook = Rulebook()

    context = {
        "bus": router,
        "clock": clock,
        "scheduler": scheduler,
        "llm_service": llm_service,
        "config": cfg,
        "identity": identity_profile,
        "metabolism": {
            "energy": initial_energy,
            "compute_budget": initial_energy,
            "time_currency": initial_energy,
            "social_capital": 50.0,
            "max_energy": max_energy,
        },
        "dynamics": {},
        "memory": {
            "working_memory_capacity": cfg.memory.working_memory_capacity,
            "consolidation_threshold": cfg.memory.consolidation_threshold,
            "min_tag_overlap": cfg.memory.min_tag_overlap,
            "backend": cfg.memory.backend,
            "db_path": cfg.memory.db_path,
            "embedding_dim": cfg.memory.embedding_dim,
        },
        "sandbox": {
            "min_rounds": max(1, cfg.trpg.max_rounds_per_scene // 2),
            "max_rounds": cfg.trpg.max_rounds_per_scene,
            "seed": 42,
            "rulebook": rulebook,
            "enable_ab_fork": cfg.trpg.enable_ab_fork,
            "ab_max_rounds": max(1, cfg.trpg.max_rounds_per_scene // 3),
            "max_versions": 8,
            "version_manager": SandboxVersionManager(max_versions=8)
            if cfg.trpg.enable_ab_fork
            else None,
            "world": {
                "name": "脑中世界",
                "ontology": {
                    "genre": "严肃文学",
                    "tone": "忧郁",
                    "setting": cfg.core.current_novel.get(
                        "setting", "黎明中无名的城市"
                    ),
                },
                "rules": world_rules,
                "current_state": {"time": "清晨", "mood": "安静"},
            },
        },
        "creation": {
            "seed": 42,
            "style_profile": {
                "default_setting": "安静的公寓",
                "default_protagonist": cfg.core.name,
                "default_time": "清晨",
                "identity": identity_profile,
                "taboo_words": cfg.creativity.taboo_words,
                "foreshadowing_strategy": cfg.creativity.foreshadowing_strategy,
            },
        },
        "social": {
            "starting_space": cfg.social.starting_space,
            "starting_role": cfg.social.starting_role,
            "starting_social_energy": cfg.social.starting_social_energy,
            "fatigue_rate": cfg.social.fatigue_rate,
            "spaces": cfg.social.spaces,
            "roles": cfg.social.roles,
            "npcs": cfg.social.npcs,
        },
        "novel": {"title": cfg.core.current_novel.get("title", "脑中世界纪事")},
        "eos": {
            "enabled": cfg.eos.enabled,
            "evaluation_interval_ticks": cfg.eos.evaluation_interval_ticks,
            "report_on_phase_change": cfg.eos.report_on_phase_change,
            "sampling_rates": cfg.eos.sampling_rates,
            "threshold_rules": cfg.eos.threshold_rules,
        },
        "fault": cfg.fault.to_dict(),
        "modules": [],
        "persistence": None,
    }

    # v2 novel source layer (Task 1.5.2 / 1.6.2)
    novel_v2_cfg = getattr(cfg, "novel_v2", None)
    if novel_v2_cfg is None:
        # Fallback to default v2 config (cfg may be a plain dict in tests)
        novel_v2_cfg_dict = {
            "novel_id": "linyi_default",
            "story_bible_dir": "story_bible",
            "world_state_dir": "world_state",
            "chapter_dir": "chapters",
            "oc_registry_dir": "oc_registry",
        }
    else:
        novel_v2_cfg_dict = (
            novel_v2_cfg if isinstance(novel_v2_cfg, dict)
            else asdict(novel_v2_cfg) if hasattr(novel_v2_cfg, "__dataclass_fields__")
            else {"novel_id": str(novel_v2_cfg)}
        )
    context["novel_v2"] = novel_v2_cfg_dict
    return context


def _coerce_module_dict(value: Any) -> dict[str, Any]:
    """Coerce a loaded module state to a plain dict.

    Handles both dict (the normal JSON-loaded case) and dataclass instances,
    which may appear when state is reconstructed via ``reconstruct_dataclass``
    upstream or passed in by tests. Centralizing the dict/dataclass handling
    here means the rest of ``_apply_loaded_context`` can use ``.get()``
    uniformly without per-field ``isinstance`` checks (audit finding #10).
    """
    if isinstance(value, dict):
        return value
    coerced = dataclass_to_dict(value)
    if isinstance(coerced, dict):
        return coerced
    return {}


def _apply_loaded_context(
    context: dict[str, Any], state: dict[str, Any]
) -> dict[str, Any]:
    """Overlay default agent context with values recovered from a saved state.

    Each module's saved state is normalized to a dict via
    ``_coerce_module_dict`` so the function works whether the caller passed in
    raw JSON-loaded dicts or reconstructed dataclass instances.
    """
    modules = state.get("modules", {})

    # Normalize all module states up-front so the field accesses below can
    # assume plain dicts.
    identity_data = _coerce_module_dict(modules.get("identity_core", {}))
    metabolism_data = _coerce_module_dict(modules.get("metabolism", {}))
    memory_data = _coerce_module_dict(modules.get("memory_system", {}))
    sn_data = _coerce_module_dict(modules.get("salience_network", {}))
    sandbox_data = _coerce_module_dict(modules.get("mental_sandbox", {}))
    creation_data = _coerce_module_dict(modules.get("creation_executive", {}))
    novel_data = _coerce_module_dict(modules.get("novel_output", {}))
    dynamics_data = _coerce_module_dict(modules.get("dynamics", {}))
    cen_data = _coerce_module_dict(modules.get("central_executive_network", {}))

    if identity_data:
        loaded_profile = _coerce_module_dict(identity_data.get("profile", {}))
        # Only keep the saved identity if it is the canonical LinYi profile;
        # otherwise fall back to the freshly built default so old states are
        # migrated automatically.
        if loaded_profile.get("name") == "林逸":
            context["identity"] = loaded_profile

    if metabolism_data:
        resources = _coerce_module_dict(
            metabolism_data.get("resources", context["metabolism"])
        )
        if resources:
            context["metabolism"] = resources

    if memory_data:
        context["memory"].update(
            {
                "working_memory_capacity": memory_data.get(
                    "working_memory_capacity", context["memory"]["working_memory_capacity"]
                ),
                "consolidation_threshold": memory_data.get(
                    "consolidation_threshold", context["memory"]["consolidation_threshold"]
                ),
                "min_tag_overlap": memory_data.get(
                    "min_tag_overlap", context["memory"]["min_tag_overlap"]
                ),
                # Keep the configured backend/path from the current config rather than
                # whatever was saved in the snapshot, so users can switch backends.
                "backend": context["memory"].get("backend", "memory"),
                "db_path": context["memory"].get("db_path", "memory_store.sqlite"),
                "embedding_dim": context["memory"].get("embedding_dim", 1536),
            }
        )

    if sn_data:
        context["salience_network"] = {
            "energy": sn_data.get("energy", 80.0),
            "last_network": sn_data.get("last_network", "dmn"),
        }

    if sandbox_data:
        context["sandbox"].update(
            {
                "min_rounds": sandbox_data.get("min_rounds", context["sandbox"]["min_rounds"]),
                "max_rounds": sandbox_data.get("max_rounds", context["sandbox"]["max_rounds"]),
                "seed": sandbox_data.get("seed", context["sandbox"]["seed"]),
                "world": sandbox_data.get("world_model", context["sandbox"]["world"]),
                "depth_thresholds": sandbox_data.get("depth_thresholds", {}),
            }
        )

    if creation_data:
        context["creation"].update(
            {
                "seed": creation_data.get("seed", context["creation"]["seed"]),
                "style_profile": creation_data.get("style_profile", {}),
                "focus_stack": creation_data.get("focus_stack", []),
            }
        )

    if novel_data:
        context["novel"].update(
            {
                "title": novel_data.get("title", context["novel"]["title"]),
                "world_settings": novel_data.get("world_settings", {}),
            }
        )

    if dynamics_data:
        dynamics_value = _coerce_module_dict(
            dynamics_data.get("dynamics", context["dynamics"])
        )
        if dynamics_value:
            context["dynamics"] = dynamics_value

    if cen_data:
        context["goals"] = cen_data.get("goal_stack", [])

    return context


def create_modules(
    llm_service: LLMService,
    identity_core: IdentityCore | None = None,
    config: NovelistConfig | None = None,
) -> list[Any]:
    """Instantiate all functional modules in dependency order.

    Module instantiation is delegated to a :class:`ModuleRegistry` so that the
    agent can be extended without modifying this function: new modules can be
    registered explicitly or discovered from a plugin directory.
    """
    if identity_core is None:
        identity_core = IdentityCore(name="identity_core")

    eos_enabled = config.eos.enabled if config is not None else True
    fault_config = config.fault if config is not None else FaultConfig()

    registry = ModuleRegistry()
    # Core / physiology.
    registry.register(Metabolism, factory_options={"name": "metabolism"})
    registry.register(Dynamics, factory_options={"name": "dynamics"})
    # Memory.
    registry.register(MemorySystem, factory_options={"name": "memory_system"})
    registry.register(SelfTimeline, factory_options={"name": "self_timeline"})
    # Input.
    registry.register(PersonalInput, factory_options={"name": "personal_input", "seed": 42})
    registry.register(SocialInput, factory_options={"name": "social_input", "seed": 42})
    # Psychological extension modules (demonstrate §10 extensibility).
    registry.register(AttachmentModule, factory_options={"name": "attachment"})
    # Cognitive networks.
    registry.register(SalienceNetwork, factory_options={"name": "salience_network"})
    registry.register(DefaultModeNetwork, factory_options={"name": "default_mode_network"})
    registry.register(CentralExecutiveNetwork, factory_options={"name": "central_executive_network"})
    # Simulation / creation.
    registry.register(MentalSandbox, factory_options={"name": "mental_sandbox", "llm_service": llm_service})
    registry.register(CreationExecutive, factory_options={"name": "creation_executive", "llm_service": llm_service, "seed": 42})
    registry.register(NovelOutput, factory_options={"name": "novel_output"})
    # v2 OC character system (registered via register_agent so it can be
    # instantiated with novel_v2 config + llm_service without changing
    # the registry's class-based API).
    registry.register_agent(
        "oc_character_system",
        lambda name, **kw: OCCharacterSystem(name=name),
        dependencies=["mental_sandbox"],  # OC world-fit check needs world_contract
        category="novel_source",
        description="OC character registry with COC sheet generation",
    )
    # v2 chapter structure & planning layer (Task 2.6)
    registry.register_agent(
        "chapter_manager",
        lambda name, **kw: ChapterManager(
            name=name,
            novel_id=kw.get("novel_id", "linyi_default"),
            chapters_dir=kw.get("chapters_dir", "chapters"),
            max_versions=kw.get("max_versions", 20),
        ),
        dependencies=["novel_output"],  # replaces NovelOutput's flat paragraph list
        category="novel_source",
        description="卷/章/段三级结构与版本控制",
    )
    registry.register_agent(
        "planner",
        lambda name, **kw: Planner(
            name=name,
            llm_service=kw.get("llm_service"),
        ),
        dependencies=["mental_sandbox"],  # Planner consumes sandbox's narrative.ready
        category="novel_source",
        description="章节意图规划与四线编织",
        factory_options={"llm_service": llm_service},
    )
    # v2 continuity audit & quality closure layer (Task 4.4)
    registry.register_agent(
        "continuity_auditor",
        lambda name, **kw: ContinuityAuditor(
            name=name,
            novel_id=kw.get("novel_id", "linyi_default"),
        ),
        dependencies=["novel_output", "chapter_manager"],  # audits published paragraphs
        category="novel_audit",
        description="六维连续性审计（OOC/设定/时间线/伏笔/文风/节奏）",
    )
    registry.register_agent(
        "quality_engine",
        lambda name, **kw: QualityEngine(
            name=name,
            novel_id=kw.get("novel_id", "linyi_default"),
        ),
        dependencies=["continuity_auditor"],  # subscribes to data.novel.audit.issues
        category="novel_audit",
        description="质量闭环引擎：严重度分级派发与自动修订",
    )
    # v2 visual debugging data interface (Stage 5 Task 5.1) — exposes world
    # snapshot / diff / COC replay topics for the WebUI SocialView and CLI
    # tools. No upstream dependencies; reads world/OC state from the bus.
    registry.register_agent(
        "world_visual_debugger",
        lambda name, **kw: WorldVisualDebugger(name=name),
        dependencies=[],
        category="debug",
        description="可视化调试接口：世界快照/diff + COC 推演回放",
    )
    # Resilience.
    registry.register(FaultManager, factory_options={"name": "fault_manager"})
    registry.register(RecoveryManager, factory_options={"name": "recovery_manager", "config": fault_config})
    # Observability.
    registry.register(EvaluationObservabilitySystem, factory_options={"name": "eos"})

    # Discover optional user plugins from the configured plugin directory.
    plugin_dir = config.plugin_directory if config is not None else None
    if plugin_dir:
        registry.discover(plugin_dir)

    modules: list[Any] = [identity_core]
    modules.extend(registry.instantiate())

    eos = next((m for m in modules if isinstance(m, EvaluationObservabilitySystem)), None)
    if eos is not None and eos_enabled:
        eos.add_collector(LLMCollector())
        eos.add_collector(MemoryCollector())
        eos.add_collector(MetabolismCollector())
        eos.add_collector(SandboxCollector())
        eos.add_collector(SocialCollector())
        eos.add_collector(NetworkCollector())
        eos.add_collector(CreativeCollector())

    return modules


def _start_webui(
    router: BusRouter,
    modules: list[Any],
    context: dict[str, Any],
    cfg: NovelistConfig,
    clock: Any,
    scheduler: Any,
) -> Any | None:
    """Start the FastAPI dashboard in a background thread when enabled."""
    if not cfg.webui.enabled:
        return None

    try:
        import uvicorn
        from src.novelist_brain.web import create_app, get_provider
        from src.novelist_brain.web.bus_spy import BusSpy
    except ImportError as exc:
        print(f"WebUI 未启动：缺少依赖 ({exc})")
        return None

    provider = get_provider()
    provider.register(
        router=router,
        modules={module.name: module for module in modules},
        context=context,
        runtime={"clock": clock, "scheduler": scheduler},
    )

    spy = BusSpy(capacity=200)
    spy.attach(router)

    app = create_app()

    import threading

    def _run() -> None:
        uvicorn.run(
            app,
            host=cfg.webui.host,
            port=cfg.webui.port,
            log_level="warning",
            access_log=False,
        )

    thread = threading.Thread(target=_run, name="webui", daemon=True)
    thread.start()
    print(
        f"WebUI 已启动: http://{cfg.webui.host}:{cfg.webui.port}"
    )
    return thread


def _make_llm_service(
    args: argparse.Namespace,
    config_registry: ConfigRegistry | None = None,
) -> LLMService:
    """Build the LLM service from config, CLI args, and environment variables."""
    cfg = config_registry.config if config_registry is not None else NovelistConfig()
    service_config = build_llm_config_dict(cfg)

    # CLI flags override config/env values for one-shot convenience.
    if args.use_mock:
        service_config["use_mock"] = True
    if args.llm_base_url is not None:
        service_config["base_url"] = args.llm_base_url
    if args.llm_api_key is not None:
        service_config["api_key"] = args.llm_api_key
    if args.llm_model is not None:
        service_config["model"] = args.llm_model

    service = create_llm_service(service_config)
    model = service_config.get("model", "mock")
    base_url = service_config.get("base_url") or "(env)"
    print(f"使用 LLM: model={model}, base_url={base_url}")
    return service


def _wrap_llm_service(
    router: BusRouter,
    service: LLMService,
    cfg: NovelistConfig,
) -> ResilientLLMService:
    """Wrap the raw LLM service with retry, circuit breaker and fault publishing."""

    def fault_publisher(error: AgentError) -> None:
        router.publish(
            source="llm_service",
            topic="control.fault.error",
            channel="control",
            payload={"error": error.to_dict()},
            priority=9,
            ttl=5,
        )

    def event_publisher(msg: dict[str, Any]) -> None:
        router.publish(
            source=msg["payload"]["source"],
            topic=msg["topic"],
            channel=msg["channel"],
            payload=msg["payload"],
            priority=5,
            ttl=3,
        )

    retry_policy = cfg.fault.retry_policy
    return ResilientLLMService(
        primary=service,
        fallback=MockLLMService(seed=42),
        circuit_breaker=CircuitBreaker(
            service="llm",
            failure_threshold=max(1, retry_policy.max_attempts),
            recovery_timeout_ms=30000,
            half_open_max_calls=2,
        ),
        max_retries=max(0, retry_policy.max_attempts - 1),
        base_delay_ms=retry_policy.base_delay_ms,
        fault_publisher=fault_publisher,
        event_publisher=event_publisher,
        source="llm_service",
    )


def _build_agent_state(clock: RealTimeClock, modules: list[Any]) -> dict[str, Any]:
    """Assemble the current agent state snapshot."""
    return {
        "version": 1,
        "saved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "clock": {
            "tick": clock.tick,
            "absolute_time_ms": clock.absolute_time_ms,
            "hour": clock.hour,
            "phase": clock.phase,
        },
        "modules": {module.name: module.to_dict() for module in modules},
    }


def run_day(
    load_path: str | None = None,
    save_path: str = "agent_state.json",
    llm_service: LLMService | None = None,
) -> None:
    """Backward-compatible test helper that runs one compressed day.

    该函数仅作为测试辅助保留，用于快速验证单日生活-创作-睡眠闭环。
    它委托给 :func:`run_agent` 并以 fast-forward 模式运行一天。
    小说家的真实执行路径是常驻 Agent 循环，不会随一天结束而退出。
    """
    print("[run_day] 调用测试辅助：以 fast-forward 模式运行一天。")
    run_agent(
        load_path=load_path,
        save_path=save_path,
        tick_interval_seconds=1.0,
        days=1,
        fast_forward=True,
        llm_service=llm_service,
    )


def run_agent(
    load_path: str | None = None,
    save_path: str = "agent_state.json",
    tick_interval_seconds: float = 60.0,
    days: int | None = None,
    fast_forward: bool = False,
    llm_service: LLMService | None = None,
    config_registry: ConfigRegistry | None = None,
    legacy_mode: bool = False,
) -> None:
    """Run the novelist brain as a resident agent loop."""
    if config_registry is None:
        config_registry = load_config()
    cfg = config_registry.config

    print("=" * 60)
    print("小说家大脑 Agent v2 — 常驻循环启动")
    print("=" * 60)
    print(f"配置来源: {cfg.source}")

    router = BusRouter()
    scheduler = DailyScheduler()
    scheduler_context: dict[str, Any] = {}
    if fast_forward:
        # Compressed testing mode: each simulated tick covers 30 minutes so
        # that a full day passes in 48 ticks. The real wall-clock interval
        # between ticks is controlled by --tick-interval-seconds (default 1.0s).
        # Start at midnight so the phase sequence is deterministic and aligns
        # with the daily rhythm template.
        sim_seconds_per_tick = 1800.0
        start_time = datetime.datetime.combine(
            datetime.date.today(), datetime.time(0, 0)
        )
    else:
        sim_seconds_per_tick = tick_interval_seconds
        start_time = None
    clock = RealTimeClock(
        tick_interval_seconds=tick_interval_seconds,
        sim_seconds_per_tick=sim_seconds_per_tick,
        start_time=start_time,
        fast_forward=fast_forward,
        scheduler=scheduler,
        scheduler_context=scheduler_context,
    )
    if llm_service is None:
        llm_service = MockLLMService(seed=42)

    # Wrap the LLM service so that failures are retried, circuit-broken and
    # published on the control bus for the fault/recovery managers.
    llm_service = _wrap_llm_service(router, llm_service, cfg)
    print(f"LLM 已启用 resilience: retries={cfg.fault.retry_policy.max_attempts}, "
          f"circuit_threshold={cfg.fault.retry_policy.max_attempts}")

    identity_profile = asdict(cfg.core)
    identity_core = IdentityCore(
        name="identity_core",
        profile=LinYiProfile(**identity_profile),
    )
    context = build_context(
        router,
        clock,
        llm_service,
        scheduler=scheduler,
        config_registry=config_registry,
        identity_profile=identity_profile,
    )

    # Feed runtime metabolism/identity/dynamics into the scheduler so that
    # fallback plans can be triggered when resources are low.
    scheduler_context.update(
        {
            "metabolism": context.get("metabolism", {}),
            "identity": context.get("identity", {}),
            "dynamics": context.get("dynamics", {}),
        }
    )

    # Effective load path: explicit flag, legacy file, snapshot+delta bundle,
    # or none.  PersistenceManager.load handles legacy files and the new
    # snapshot+delta layout transparently.
    effective_load_path = load_path or save_path
    legacy_exists = os.path.isfile(effective_load_path)
    snapshot_exists = os.path.isfile(f"{effective_load_path}.latest")
    delta_exists = os.path.isfile(f"{effective_load_path}.deltas.jsonl")

    saved_state: dict[str, Any] | None = None
    if legacy_exists or snapshot_exists or delta_exists:
        print(f"正在从 {effective_load_path} 加载状态...")
        saved_state = PersistenceManager.load(effective_load_path)
        context = _apply_loaded_context(context, saved_state)
    else:
        print(f"状态文件 {effective_load_path} 不存在，以空白状态启动。")

    # === v2 novel source layer loading (Task 1.4 / 1.9) ===
    novel_v2 = context.get("novel_v2", {})
    novel_id = novel_v2.get("novel_id", "linyi_default")
    world_state_dir = novel_v2.get("world_state_dir", "world_state")
    story_bible_dir = novel_v2.get("story_bible_dir", "story_bible")

    if not legacy_mode:
        # Auto-detect v1 state and warn (Task 1.9)
        if saved_state is not None:
            state_version = saved_state.get("version", 1)
            if state_version < 2:
                print(
                    "WARNING: 检测到 v1 状态文件。建议运行 "
                    "`python tools/migrate_state_v1_to_v2.py` "
                    "迁移到 v2 格式以启用全部新功能。"
                    "当前将以兼容模式运行（v1 数据可用，v2 数据为空）。"
                )
                # Don't auto-migrate; let user run the script manually

        # Load or create WorldStateContract
        ws_store = WorldStateStore(base_dir=world_state_dir, novel_id=novel_id)
        try:
            world_contract = load_or_create_world_state(
                ws_store, novel_id,
                genre="严肃文学",  # fallback values
                tone="忧郁",
            )
            context["world_contract"] = world_contract
            print(f"WorldStateContract 已加载: version={world_contract.version}")
        except Exception as exc:
            print(f"WARNING: 加载 WorldStateContract 失败，将使用 v1 fallback: {exc}")
            context["world_contract"] = None

        # Load StoryBible if it exists
        sb_path = os.path.join(story_bible_dir, f"{novel_id}.json")
        if os.path.isfile(sb_path):
            try:
                import json as _json
                with open(sb_path, "r", encoding="utf-8") as f:
                    sb_data = _json.load(f)
                story_bible = StoryBible.from_dict(sb_data)
                context["story_bible"] = story_bible
                print(f"StoryBible 已加载: {sb_path}")
            except Exception as exc:
                print(f"WARNING: 加载 StoryBible 失败: {exc}")
                context["story_bible"] = None
        else:
            print(f"StoryBible 文件不存在（{sb_path}），sandbox 将仅使用 world_contract")
            context["story_bible"] = None
    else:
        # Legacy mode: don't load v2 artifacts; sandbox will use v1 fallback path
        print("LEGACY MODE: 跳过 v2 数据加载，sandbox 将使用硬编码 default world")
        context["world_contract"] = None
        context["story_bible"] = None

    modules = create_modules(llm_service, identity_core=identity_core, config=cfg)

    # Provide the full module list, a bound snapshot store, and a transaction
    # manager to recovery logic and the main tick loop.
    context["modules"] = modules
    sandbox_module = next(
        (m for m in modules if isinstance(m, MentalSandbox)), None
    )
    if sandbox_module is not None:
        context["sandbox"]["sandbox_module"] = sandbox_module
    context["persistence"] = SnapshotStore(save_path)
    transaction_manager = TransactionManager(modules, context)
    context["transaction_manager"] = transaction_manager

    if saved_state is not None:
        for module in modules:
            module_data = saved_state.get("modules", {}).get(module.name)
            if module_data is not None:
                module.from_dict(module_data, llm_service=llm_service)

    # Register every module to the router first so subscriptions exist.
    for module in modules:
        module.register(router)

    # Initialize every module with the shared context.
    # Each init is wrapped in a configurable timeout (default 30s per §3.2.3)
    # so a single misbehaving module cannot block system startup. The
    # timeout can be overridden via ``core.module_init_timeout`` in the
    # config; if absent, the default is used. ``<= 0`` skips the wrapper.
    module_init_timeout = float(
        getattr(cfg.core, "module_init_timeout", 30.0)
        if cfg is not None
        else 30.0
    )
    for module in modules:
        module.init_with_timeout(context, timeout_seconds=module_init_timeout)

    # Deliver initialization-time messages.
    router.flush()

    # Start the optional web dashboard in a background thread.
    _start_webui(router, modules, context, cfg, clock, scheduler)

    # Start the day in DMN so dreaming/incubation can happen.
    router.publish(
        source="main",
        topic="control.network.dmn.active",
        channel="control",
        payload={"reason": "initial_activation"},
        priority=8,
        ttl=5,
    )
    router.flush()

    # Make the clock announce each phase change on the event bus.
    def on_clock_tick(delta: TickDelta) -> None:
        router.publish(
            source="clock",
            topic="event.clock.phase.changed",
            channel="event",
            payload={
                "phase": delta.phase,
                "tick": delta.global_context.tick,
                "hour": clock.hour,
            },
            priority=6,
            ttl=2,
        )

    clock.on_tick(on_clock_tick)

    sn = next(m for m in modules if isinstance(m, SalienceNetwork))
    metabolism = next(m for m in modules if isinstance(m, Metabolism))
    eos = next(m for m in modules if isinstance(m, EvaluationObservabilitySystem))

    identity = context.get("identity", {})
    author_name = identity.get("name", "林逸")
    pen_name = identity.get("pen_name", "静观者")
    self_narrative = identity.get(
        "self_narrative",
        "我是一个在人群边缘写字的人。我相信那些被忽略的瞬间里藏着真正的小说。",
    )
    print(f"{author_name}（{pen_name}）已苏醒。自我叙事：{self_narrative}")

    if fast_forward:
        print(
            f"【测试模式】tick 间隔: {tick_interval_seconds}s，"
            f"每 tick 推进 30 分钟模拟时间，当前模拟时间: {clock.now().strftime('%Y-%m-%d %H:%M:%S')}"
        )
        if days is not None:
            print(f"计划运行模拟天数: {days}")
    else:
        print(
            f"【常驻模式】tick 间隔: {tick_interval_seconds}s，"
            f"与现实时间同步运行。当前真实时间: {clock.now().strftime('%Y-%m-%d %H:%M:%S')}"
        )
        print("系统将无限期运行，按 Ctrl+C 退出。")
    print("-" * 60)

    start_time = clock.now()
    previous_phase: str | None = None
    previous_date = start_time.date()
    tick_count = 0
    min_ticks = 3 if days == 0 else 1

    def _persist_for_event(event_type: str) -> None:
        try:
            PersistenceManager.save_incremental(
                _build_agent_state(clock, modules), save_path, event_type=event_type
            )
        except Exception as exc:
            emergency_path = PersistenceManager.emergency_snapshot(
                _build_agent_state(clock, modules),
                save_path,
                reason=f"persist_failed_{event_type}",
            )
            router.publish(
                source="persistence",
                topic="control.fault.error",
                channel="control",
                payload={
                    "error": AgentError(
                        source="persistence",
                        topic="control.fault.error",
                        type=ErrorType.PERSISTENCE_FAILURE,
                        severity=Severity.CRITICAL,
                        message=f"Incremental persistence failed: {exc}",
                        payload={"emergency_path": emergency_path},
                    ).to_dict()
                },
                priority=10,
                ttl=10,
            )
            router.flush()

    try:
        last_real_time = datetime.datetime.now()
        while True:
            delta = clock.advance(1)
            if delta is None:
                elapsed = (datetime.datetime.now() - last_real_time).total_seconds()
                remaining = max(0.0, clock.tick_interval_seconds - elapsed)
                time.sleep(remaining)
                continue

            # Synchronize our tracker with the clock's internal tick boundary.
            last_real_time += datetime.timedelta(seconds=clock.tick_interval_seconds)
            tick_count += 1

            phase_changed = delta.phase != previous_phase
            previous_phase = delta.phase

            # Every module advances by one tick.
            for module in modules:
                module.tick(delta)

            # Route all queued messages inside a tick-level transaction so
            # that a failure during message handling rolls back all module
            # states to the start of the tick.
            transaction_manager.begin(start_tick=clock.tick, eager=True)
            try:
                delivered = router.flush()
            except Exception as exc:
                restored = transaction_manager.rollback()
                router.publish(
                    source="transaction_manager",
                    topic="control.fault.error",
                    channel="control",
                    payload={
                        "error": AgentError(
                            source="transaction_manager",
                            topic="control.fault.error",
                            type=ErrorType.MODULE_EXCEPTION,
                            severity=Severity.HIGH,
                            message=f"Tick transaction failed: {exc}",
                            payload={"restored_modules": restored},
                        ).to_dict()
                    },
                    priority=9,
                    ttl=5,
                )
                router.flush()
                delivered = []
            else:
                transaction_manager.commit()

            # Feed all delivered messages to EOS for non-invasive observation.
            for message in delivered:
                eos.on_bus_message(message)

            if phase_changed:
                timestamp = clock.now().strftime("%Y-%m-%d %H:%M")
                phase_info = clock.current_phase_info
                network = phase_info.preferred_network if phase_info else "?"
                print(
                    f"\n=== [{timestamp}] 林逸（{pen_name}）| "
                    f"阶段: {delta.phase}（{network}）==="
                )
                _persist_for_event("phase_boundary")

            events: list[str] = []
            critical_event: str | None = None
            eos_report_printed: bool = False
            for message in delivered:
                summary = summarize_message(message)
                if summary:
                    events.append(f"  • {message.source}/{message.topic}: {summary}")
                # Capture critical lifecycle events for immediate persistence.
                if message.topic == "event.novel.paragraph.published":
                    critical_event = "novel_paragraph_published"
                elif message.topic == "data.identity.updated":
                    critical_event = "identity_updated"
                elif message.topic == "data.sandbox.narrative.ready":
                    critical_event = "narrative_ready"
                elif message.topic == "control.eos.recommendation" and not eos_report_printed:
                    payload = message.payload or {}
                    alerts = payload.get("alerts", [])
                    recommendations = payload.get("recommendations", [])
                    if alerts or recommendations:
                        events.append(
                            f"  • eos/control.eos.recommendation: 告警={len(alerts)}, 建议={len(recommendations)}"
                        )
                        for rec in recommendations[:3]:
                            events.append(f"      → {rec}")
                    eos_report_printed = True

            if critical_event is not None:
                _persist_for_event(critical_event)

            if events:
                print(
                    f"[{format_hour(clock.hour)}] "
                    f"active={sn.state.custom.get('last_network', '?')} "
                    f"energy={metabolism.resources.energy:.1f}"
                )
                for event in events:
                    print(event)

            # Day boundary: rotate the snapshot so the delta log does not grow
            # indefinitely during a long-running agent.
            current_date = clock.now().date()
            if current_date != previous_date:
                previous_date = current_date
                try:
                    snapshot_path = PersistenceManager.rotate(
                        save_path, _build_agent_state(clock, modules)
                    )
                    if snapshot_path:
                        print(f"  新的一天，已创建快照: {snapshot_path}")
                except Exception as exc:
                    emergency_path = PersistenceManager.emergency_snapshot(
                        _build_agent_state(clock, modules),
                        save_path,
                        reason="rotate_failed",
                    )
                    router.publish(
                        source="persistence",
                        topic="control.fault.error",
                        channel="control",
                        payload={
                            "error": AgentError(
                                source="persistence",
                                topic="control.fault.error",
                                type=ErrorType.PERSISTENCE_FAILURE,
                                severity=Severity.CRITICAL,
                                message=f"Snapshot rotation failed: {exc}",
                                payload={"emergency_path": emergency_path},
                            ).to_dict()
                        },
                        priority=10,
                        ttl=10,
                    )
                    router.flush()

                # Retention pruning runs in its own try/except so it still
                # executes when rotate() failed — otherwise old snapshots and
                # emergency dumps would accumulate without bound during a
                # long-running agent (audit finding #9).
                try:
                    removed = PersistenceManager.apply_retention(
                        save_path, cfg.persistence.retention
                    )
                    if removed:
                        print(
                            f"  retention: 已清理 {len(removed)} 个旧快照/急诊文件"
                        )
                except Exception as exc:
                    router.publish(
                        source="persistence",
                        topic="control.fault.error",
                        channel="control",
                        payload={
                            "error": AgentError(
                                source="persistence",
                                topic="control.fault.error",
                                type=ErrorType.PERSISTENCE_FAILURE,
                                severity=Severity.LOW,
                                message=f"Retention pruning failed: {exc}",
                                payload={},
                            ).to_dict()
                        },
                        priority=4,
                        ttl=3,
                    )
                    router.flush()

            # In fast-forward mode, honor the requested wall-clock pacing so
            # the compressed run remains observable and debuggable.
            if clock.is_fast_forward and clock.tick_interval_seconds > 0:
                time.sleep(clock.tick_interval_seconds)

            elapsed_days = (clock.now() - start_time).total_seconds() / 86400.0
            if (
                days is not None
                and tick_count >= min_ticks
                and elapsed_days >= days
            ):
                print(f"\n已达到运行天数限制 ({days} 天)，优雅退出。")
                break
    except KeyboardInterrupt:
        print("\n\n捕获到 Ctrl+C，保存完整快照后退出...")

    # Drain any remaining messages so the feedback loop fully closes.
    for _ in range(5):
        if not router.flush():
            break

    novel_output = next(m for m in modules if isinstance(m, NovelOutput))
    memory_system = next(m for m in modules if isinstance(m, MemorySystem))
    dynamics = next(m for m in modules if isinstance(m, Dynamics))

    print("\n" + "=" * 60)
    print(f"{novel_output.author_name} 小说手稿 — {novel_output.title or '未命名'}")
    print("=" * 60)

    if not novel_output.paragraphs:
        print("(当前未生成小说段落)")
    else:
        for idx, paragraph in enumerate(novel_output.paragraphs, start=1):
            print(f"\n--- 段落 {idx} ---\n")
            print(paragraph)

    print("\n" + "=" * 60)
    print("运行统计")
    print("=" * 60)
    print(f"总 tick 数: {clock.tick}")
    print(f"当前真实时间: {clock.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"当前阶段: {clock.phase}")
    print(f"当前活跃网络: {sn.state.custom.get('last_network', '?')}")
    print(
        f"代谢状态: energy={metabolism.resources.energy:.1f}, "
        f"compute={metabolism.resources.compute_budget:.1f}, "
        f"time={metabolism.resources.time_currency:.1f}, "
        f"social={metabolism.resources.social_capital:.1f}"
    )
    print(
        f"记忆: fragments={memory_system.get_state()['fragment_count']}, "
        f"traces={memory_system.get_state()['trace_count']}, "
        f"consolidations={memory_system.state.custom['consolidation_runs']}"
    )
    print(
        f"小说产出: paragraphs={len(novel_output.paragraphs)}, "
        f"published={novel_output.get_state()['published_count']}"
    )
    print(f"动力系统 habit strengths: {dynamics.dynamics.habit_strengths}")

    eos_state = eos.get_state()
    print(
        f"EOS: reports={eos_state['reports_generated']}, "
        f"alerts={eos_state['alerts_generated']}, "
        f"last_report={eos_state['last_report_id'] or 'none'}"
    )

    fault_manager = next(
        (m for m in modules if isinstance(m, FaultManager)), None
    )
    recovery_manager = next(
        (m for m in modules if isinstance(m, RecoveryManager)), None
    )
    if fault_manager is not None:
        fm_state = fault_manager.get_state()
        print(
            f"故障管理: faults_assessed={fm_state.get('faults_assessed', 0)}, "
            f"fault_count={fm_state.get('fault_count', 0)}"
        )
    if recovery_manager is not None:
        rm_state = recovery_manager.get_state()
        print(
            f"恢复管理: dispatched={rm_state.get('actions_dispatched', 0)}, "
            f"succeeded={rm_state.get('actions_succeeded', 0)}, "
            f"failed={rm_state.get('actions_failed', 0)}, "
            f"safe_mode={rm_state.get('safe_mode', False)}"
        )

    final_state = _build_agent_state(clock, modules)
    try:
        snapshot_path = PersistenceManager.rotate(save_path, final_state)
        if snapshot_path:
            print(f"\n完整状态已旋转为快照: {snapshot_path}")
        else:
            PersistenceManager.save(final_state, save_path)
            print(f"\n完整状态已保存至 {save_path}")
    except Exception as exc:
        emergency_path = PersistenceManager.emergency_snapshot(
            final_state, save_path, reason="final_save_failed"
        )
        print(
            f"\n最终持久化失败: {exc}\n"
            f"已写入急诊快照: {emergency_path}"
        )
        router.publish(
            source="persistence",
            topic="control.fault.error",
            channel="control",
            payload={
                "error": AgentError(
                    source="persistence",
                    topic="control.fault.error",
                    type=ErrorType.PERSISTENCE_FAILURE,
                    severity=Severity.CRITICAL,
                    message=f"Final persistence failed: {exc}",
                    payload={"emergency_path": emergency_path},
                ).to_dict()
            },
            priority=10,
            ttl=10,
        )
        router.flush()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="小说家大脑 Agent v2")
    parser.add_argument(
        "--save-path",
        type=str,
        default="agent_state.json",
        help="运行结束后保存状态的路径 (默认: agent_state.json)",
    )
    parser.add_argument(
        "--load-path",
        type=str,
        default=None,
        help="运行前加载状态的路径 (默认: 若 agent_state.json 存在则加载)",
    )
    parser.add_argument(
        "--tick-interval-seconds",
        type=float,
        default=None,
        help=(
            "相邻 tick 之间的真实秒数。默认与现实同步：1 tick = 60 真实秒 = 1 模拟分钟，"
            "系统将常驻运行。仅在与 --fast-forward 联用时才进入压缩测试模式。"
        ),
    )
    parser.add_argument(
        "--fast-forward",
        action="store_true",
        help="【仅测试】压缩模拟时间，每 tick 推进 30 分钟，便于快速验证多日闭环",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="【仅测试】运行 N 个模拟天后退出；不传则常驻运行",
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="配置文件路径 (默认: novelist.config.json / novelist.config.yaml)",
    )
    parser.add_argument(
        "--llm-base-url",
        type=str,
        default=None,
        help="OpenAI 兼容 LLM 的 base URL (覆盖配置文件)",
    )
    parser.add_argument(
        "--llm-api-key",
        type=str,
        default=None,
        help="OpenAI 兼容 LLM 的 API key (覆盖配置文件)",
    )
    parser.add_argument(
        "--llm-model",
        type=str,
        default=None,
        help="LLM 模型名 (覆盖配置文件)",
    )
    parser.add_argument(
        "--use-mock",
        action="store_true",
        help="强制使用 MockLLMService，不调用真实 LLM",
    )
    parser.add_argument(
        "--disable-webui",
        action="store_true",
        help="禁用 WebUI 仪表盘",
    )
    parser.add_argument(
        "--webui-port",
        type=int,
        default=None,
        help="WebUI 监听端口 (覆盖配置文件)",
    )
    parser.add_argument(
        "--legacy-mode",
        action="store_true",
        help=(
            "降级模式：跳过 v2 真源层（WorldStateContract/StoryBible/OCCharacterSystem）"
            "加载，sandbox 将使用硬编码 default world。用于兼容旧 state 文件或调试。"
        ),
    )
    args = parser.parse_args()

    tick_interval_seconds = args.tick_interval_seconds
    if tick_interval_seconds is None:
        tick_interval_seconds = 1.0 if args.fast_forward else 60.0

    config_registry = load_config(config_path=args.config)
    if args.disable_webui:
        config_registry.config.webui.enabled = False
    if args.webui_port is not None:
        config_registry.config.webui.port = args.webui_port
    service = _make_llm_service(args, config_registry=config_registry)
    run_agent(
        load_path=args.load_path,
        save_path=args.save_path,
        tick_interval_seconds=tick_interval_seconds,
        days=args.days,
        fast_forward=args.fast_forward,
        llm_service=service,
        config_registry=config_registry,
        legacy_mode=args.legacy_mode,
    )
