"""Main entry point for the novelist brain prototype.

This script assembles all modules, runs a full daily cycle from 00:00 to
24:00, and prints the resulting novel paragraphs together with runtime
statistics.  It uses the OpenAI-compatible LLM endpoint when configured
via ``--llm-base-url`` / ``--llm-api-key`` / ``--llm-model`` (or via
environment variables ``OPENAI_BASE_URL`` / ``OPENAI_API_KEY``), and
falls back to :class:`MockLLMService` when no configuration is provided.
"""

from __future__ import annotations

import argparse
import datetime
import os
import sys
from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.persistence import PersistenceManager
from src.novelist_brain.cen import CentralExecutiveNetwork
from src.novelist_brain.clock import Clock
from src.novelist_brain.creation_executive import CreationExecutive
from src.novelist_brain.dmn import DefaultModeNetwork
from src.novelist_brain.dynamics import Dynamics
from src.novelist_brain.identity import IdentityCore, IdentityProfile
from src.novelist_brain.llm import LLMService, MockLLMService, create_llm_service
from src.novelist_brain.memory import MemorySystem
from src.novelist_brain.metabolism import Metabolism
from src.novelist_brain.models import BusMessage, TickDelta
from src.novelist_brain.novel_output import NovelOutput
from src.novelist_brain.personal_input import PersonalInput
from src.novelist_brain.salience_network import SalienceNetwork
from src.novelist_brain.sandbox import MentalSandbox
from src.novelist_brain.social_input import SocialInput


# Each tick advances the clock by 30 minutes.  24h / 30m = 48 ticks.
TICK_DURATION_MINUTES = 30
MAX_TICKS = (24 * 60) // TICK_DURATION_MINUTES

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
    clock: Clock,
    llm_service: LLMService,
) -> dict[str, Any]:
    """Assemble the shared agent context passed to every module."""
    identity_profile = {
        "name": "the Novelist",
        "pen_name": "quiet_observer",
        "values": ["truth", "empathy", "beauty", "freedom"],
        "traits": {
            "openness": 0.8,
            "introversion": 0.7,
            "neuroticism": 0.5,
            "conscientiousness": 0.6,
        },
        "interests": ["urban life", "memory", "loneliness", "time"],
        "self_narrative": (
            "I am a quiet observer who turns ordinary moments into fiction."
        ),
        "voice_signature": {},
    }

    context = {
        "bus": router,
        "clock": clock,
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
                    "genre": "literary fiction",
                    "tone": "melancholic",
                    "setting": "an unnamed city at dawn",
                },
                "rules": [
                    "actions have emotional consequences",
                    "randomness shapes fate",
                ],
                "current_state": {"time": "morning", "mood": "quiet"},
            },
        },
        "creation": {
            "seed": 42,
            "style_profile": {
                "default_setting": "the quiet apartment",
                "default_protagonist": "the writer",
                "default_time": "morning",
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
        context["identity"] = identity_data.get("profile", context["identity"])

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


def run_day(
    load_path: str | None = None,
    save_path: str = "agent_state.json",
    llm_service: LLMService | None = None,
) -> None:
    """Run the novelist brain through one full daily cycle."""
    print("=" * 60)
    print("小说家大脑原型 v1 — 启动")
    print("=" * 60)

    router = BusRouter()
    clock = Clock(
        start_hour=0.0,
        tick_duration_ms=TICK_DURATION_MINUTES * 60 * 1000.0,
    )
    if llm_service is None:
        llm_service = MockLLMService(seed=42)
    context = build_context(router, clock, llm_service)

    saved_state: dict[str, Any] | None = None
    if load_path is not None:
        print(f"正在从 {load_path} 加载状态...")
        saved_state = PersistenceManager.load(load_path)
        context = _apply_loaded_context(context, saved_state)

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

    # Deliver initialization-time messages (identity constraints, etc.).
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

    print(f"运行周期: 00:00 - 24:00, 每 tick {TICK_DURATION_MINUTES} 分钟, 共 {MAX_TICKS} ticks")
    print("-" * 60)

    previous_phase: str | None = None
    for _ in range(MAX_TICKS):
        # 1. Advance the clock; this also queues the phase-change event.
        deltas = clock.advance(1)
        delta = deltas[0]

        phase_changed = delta.phase != previous_phase
        previous_phase = delta.phase

        # 2. Every module advances by one tick.
        for module in modules:
            module.tick(delta)

        # 3. Route all queued messages.
        delivered = router.flush()

        # Logging: phase header + important events + state snapshot.
        if phase_changed:
            print(f"\n>>> [{format_hour(clock.hour)}] 进入阶段: {delta.phase}")

        events: list[str] = []
        for message in delivered:
            summary = summarize_message(message)
            if summary:
                events.append(f"  • {message.source}/{message.topic}: {summary}")

        if events:
            print(f"[{format_hour(clock.hour)}] active={sn.state.custom.get('last_network', '?')} "
                  f"energy={metabolism.resources.energy:.1f}")
            for event in events:
                print(event)

    # Drain any remaining messages so the feedback loop fully closes.
    for _ in range(5):
        if not router.flush():
            break

    print("\n" + "=" * 60)
    print("一天结束 — 小说手稿")
    print("=" * 60)

    novel_output = next(m for m in modules if isinstance(m, NovelOutput))
    memory_system = next(m for m in modules if isinstance(m, MemorySystem))
    dynamics = next(m for m in modules if isinstance(m, Dynamics))

    if not novel_output.paragraphs:
        print("(本周期未生成小说段落)")
    else:
        for idx, paragraph in enumerate(novel_output.paragraphs, start=1):
            print(f"\n--- 段落 {idx} ---\n")
            print(paragraph)

    print("\n" + "=" * 60)
    print("运行统计")
    print("=" * 60)
    print(f"总 tick 数: {clock.tick}")
    print(f"最终阶段: {clock.phase}")
    print(f"当前活跃网络: {sn.state.custom.get('last_network', '?')}")
    print(f"代谢状态: energy={metabolism.resources.energy:.1f}, "
          f"compute={metabolism.resources.compute_budget:.1f}, "
          f"time={metabolism.resources.time_currency:.1f}, "
          f"social={metabolism.resources.social_capital:.1f}")
    print(f"记忆: fragments={memory_system.get_state()['fragment_count']}, "
          f"traces={memory_system.get_state()['trace_count']}, "
          f"consolidations={memory_system.state.custom['consolidation_runs']}")
    print(f"小说产出: paragraphs={len(novel_output.paragraphs)}, "
          f"published={novel_output.get_state()['published_count']}")
    print(f"动力系统 habit strengths: {dynamics.dynamics.habit_strengths}")

    agent_state = {
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
    PersistenceManager.save(agent_state, save_path)
    print(f"\n状态已保存至 {save_path}")

    # Return a non-zero exit code if no paragraph was produced.
    if not novel_output.paragraphs:
        print("\n错误: 未生成任何小说段落。", file=sys.stderr)
        sys.exit(1)

    print("\n运行成功: 小说家大脑完成了一天周期并输出了小说段落。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="小说家大脑原型 v1")
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
        help="运行前加载状态的路径",
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
    service = _make_llm_service(args)
    run_day(
        load_path=args.load_path,
        save_path=args.save_path,
        llm_service=service,
    )
