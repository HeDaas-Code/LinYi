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

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.persistence import PersistenceManager, dataclass_to_dict
from src.novelist_brain.cen import CentralExecutiveNetwork
from src.novelist_brain.clock import Clock, RealTimeClock
from src.novelist_brain.creation_executive import CreationExecutive
from src.novelist_brain.dmn import DefaultModeNetwork
from src.novelist_brain.dynamics import Dynamics
from src.novelist_brain.identity import IdentityCore, LinYiProfile
from src.novelist_brain.llm import LLMService, MockLLMService, create_llm_service
from src.novelist_brain.memory import MemorySystem
from src.novelist_brain.metabolism import Metabolism
from src.novelist_brain.models import BusMessage, TickDelta
from src.novelist_brain.novel_output import NovelOutput
from src.novelist_brain.personal_input import PersonalInput
from src.novelist_brain.salience_network import SalienceNetwork
from src.novelist_brain.sandbox import MentalSandbox
from src.novelist_brain.scheduler import DailyScheduler
from src.novelist_brain.social_input import SocialInput


# Default LLM configuration. Override via CLI flags or environment variables.
DEFAULT_LLM_BASE_URL = "http://117.72.106.189:3000/v1"
DEFAULT_LLM_API_KEY = "sk-PGqpNXJDiZt6LcrHIZJuLVBdoaQa4GGcWCrfDQhcfOzz4VT8"
DEFAULT_LLM_MODEL = "MiniMax-M3"


IMPORTANT_TOPICS: set[str] = {
    "event.clock.phase.changed",
    "control.network.switch",
    "control.sandbox.build",
    "control.sandbox.simulate",
    "data.memory.trace.created",
    "data.sandbox.narrative.ready",
    "data.novel.paragraph",
    "event.novel.paragraph.published",
    "control.metabolism.budget.exhausted",
}


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
) -> dict[str, Any]:
    """Assemble the shared agent context passed to every module."""
    # Use the identity core to provide 林逸's stable personality constraints.
    identity_core = IdentityCore(name="identity_core")
    identity_profile = identity_core.get_constraints()

    context = {
        "bus": router,
        "clock": clock,
        "scheduler": scheduler,
        "llm_service": llm_service,
        "identity": identity_profile,
        "metabolism": {
            "energy": 80.0,
            "compute_budget": 80.0,
            "time_currency": 80.0,
            "social_capital": 50.0,
        },
        "dynamics": {},
        "memory": {
            "working_memory_capacity": 20,
            "consolidation_threshold": 0.35,
            "min_tag_overlap": 2,
        },
        "sandbox": {
            "min_rounds": 3,
            "max_rounds": 6,
            "seed": 42,
            "world": {
                "name": "脑中世界",
                "ontology": {
                    "genre": "严肃文学",
                    "tone": "忧郁",
                    "setting": "黎明中无名的城市",
                },
                "rules": [
                    "行动有情感后果",
                    "随机性塑造命运",
                ],
                "current_state": {"time": "清晨", "mood": "安静"},
            },
        },
        "creation": {
            "seed": 42,
            "style_profile": {
                "default_setting": "安静的公寓",
                "default_protagonist": "林逸",
                "default_time": "清晨",
                "identity": identity_profile,
            },
        },
        "novel": {"title": "脑中世界纪事"},
    }
    return context


def _apply_loaded_context(
    context: dict[str, Any], state: dict[str, Any]
) -> dict[str, Any]:
    """Overlay default agent context with values recovered from a saved state."""
    modules = state.get("modules", {})

    identity_data = modules.get("identity_core", {})
    if identity_data:
        loaded_profile = identity_data.get("profile", {})
        # Only keep the saved identity if it is the canonical LinYi profile;
        # otherwise fall back to the freshly built default so old states are
        # migrated automatically.
        if isinstance(loaded_profile, dict) and loaded_profile.get("name") == "林逸":
            context["identity"] = loaded_profile
        elif isinstance(loaded_profile, LinYiProfile) and loaded_profile.name == "林逸":
            context["identity"] = dataclass_to_dict(loaded_profile)

    metabolism_data = modules.get("metabolism", {})
    if metabolism_data:
        context["metabolism"] = metabolism_data.get("resources", context["metabolism"])

    memory_data = modules.get("memory_system", {})
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
            }
        )

    sn_data = modules.get("salience_network", {})
    if sn_data:
        context["salience_network"] = {
            "energy": sn_data.get("energy", 80.0),
            "last_network": sn_data.get("last_network", "dmn"),
        }

    sandbox_data = modules.get("mental_sandbox", {})
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

    creation_data = modules.get("creation_executive", {})
    if creation_data:
        context["creation"].update(
            {
                "seed": creation_data.get("seed", context["creation"]["seed"]),
                "style_profile": creation_data.get("style_profile", {}),
                "focus_stack": creation_data.get("focus_stack", []),
            }
        )

    novel_data = modules.get("novel_output", {})
    if novel_data:
        context["novel"].update(
            {
                "title": novel_data.get("title", context["novel"]["title"]),
                "world_settings": novel_data.get("world_settings", {}),
            }
        )

    dynamics_data = modules.get("dynamics", {})
    if dynamics_data:
        context["dynamics"] = dynamics_data.get("dynamics", context["dynamics"])

    cen_data = modules.get("central_executive_network", {})
    if cen_data:
        context["goals"] = cen_data.get("goal_stack", [])

    return context


def create_modules(llm_service: LLMService) -> list[Any]:
    """Instantiate all functional modules in the required order."""
    return [
        IdentityCore(name="identity_core"),
        Metabolism(name="metabolism"),
        Dynamics(name="dynamics"),
        MemorySystem(name="memory_system"),
        PersonalInput(name="personal_input", seed=42),
        SocialInput(name="social_input", seed=42),
        SalienceNetwork(name="salience_network"),
        DefaultModeNetwork(name="default_mode_network"),
        CentralExecutiveNetwork(name="central_executive_network"),
        MentalSandbox(name="mental_sandbox", llm_service=llm_service),
        CreationExecutive(name="creation_executive", llm_service=llm_service, seed=42),
        NovelOutput(name="novel_output"),
    ]


def _make_llm_service(args: argparse.Namespace) -> LLMService:
    """Build the LLM service from CLI args + environment."""
    base_url = args.llm_base_url or os.getenv("OPENAI_BASE_URL")
    api_key = args.llm_api_key or os.getenv("OPENAI_API_KEY")
    model = args.llm_model or os.getenv("OPENAI_MODEL")

    if args.use_mock or (not base_url and not api_key):
        # No LLM configured: use the mock.
        return MockLLMService(seed=42)

    config: dict[str, Any] = {
        "base_url": base_url,
        "api_key": api_key,
        "model": model or "gpt-3.5-turbo",
        "temperature": 0.75,
        "max_tokens": 4096,
        "timeout": 180.0,
    }
    service = create_llm_service(config)
    print(
        f"使用 LLM: model={config['model']}, base_url={config['base_url']}"
    )
    return service


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
) -> None:
    """Run the novelist brain as a resident agent loop."""
    print("=" * 60)
    print("小说家大脑 Agent v2 — 常驻循环启动")
    print("=" * 60)

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
    context = build_context(router, clock, llm_service, scheduler=scheduler)

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

    modules = create_modules(llm_service)

    if saved_state is not None:
        for module in modules:
            module_data = saved_state.get("modules", {}).get(module.name)
            if module_data is not None:
                module.from_dict(module_data, llm_service=llm_service)

    # Register every module to the router first so subscriptions exist.
    for module in modules:
        module.register(router)

    # Initialize every module with the shared context.
    for module in modules:
        module.init(context)

    # Deliver initialization-time messages.
    router.flush()

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
        PersistenceManager.save_incremental(
            _build_agent_state(clock, modules), save_path, event_type=event_type
        )

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

            # Route all queued messages.
            delivered = router.flush()

            # Phase boundary: print header and save incremental state.
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
                snapshot_path = PersistenceManager.rotate(
                    save_path, _build_agent_state(clock, modules)
                )
                if snapshot_path:
                    print(f"  新的一天，已创建快照: {snapshot_path}")

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

    final_state = _build_agent_state(clock, modules)
    snapshot_path = PersistenceManager.rotate(save_path, final_state)
    if snapshot_path:
        print(f"\n完整状态已旋转为快照: {snapshot_path}")
    else:
        PersistenceManager.save(final_state, save_path)
        print(f"\n完整状态已保存至 {save_path}")


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
        "--llm-base-url",
        type=str,
        default=DEFAULT_LLM_BASE_URL,
        help="OpenAI 兼容 LLM 的 base URL",
    )
    parser.add_argument(
        "--llm-api-key",
        type=str,
        default=DEFAULT_LLM_API_KEY,
        help="OpenAI 兼容 LLM 的 API key",
    )
    parser.add_argument(
        "--llm-model",
        type=str,
        default=DEFAULT_LLM_MODEL,
        help="LLM 模型名 (默认: MiniMax-M3)",
    )
    parser.add_argument(
        "--use-mock",
        action="store_true",
        help="强制使用 MockLLMService，不调用真实 LLM",
    )
    args = parser.parse_args()

    tick_interval_seconds = args.tick_interval_seconds
    if tick_interval_seconds is None:
        tick_interval_seconds = 1.0 if args.fast_forward else 60.0

    service = _make_llm_service(args)
    run_agent(
        load_path=args.load_path,
        save_path=args.save_path,
        tick_interval_seconds=tick_interval_seconds,
        days=args.days,
        fast_forward=args.fast_forward,
        llm_service=service,
    )
