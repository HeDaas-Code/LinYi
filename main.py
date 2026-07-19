"""Main entry point for the novelist brain prototype.

This script assembles all modules, runs a full daily cycle from 00:00 to
24:00, and prints the resulting novel paragraphs together with runtime
statistics.  It uses only the built-in MockLLMService and requires no
external API keys.
"""

from __future__ import annotations

import sys
from typing import Any

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.cen import CentralExecutiveNetwork
from src.novelist_brain.clock import Clock
from src.novelist_brain.creation_executive import CreationExecutive
from src.novelist_brain.dmn import DefaultModeNetwork
from src.novelist_brain.dynamics import Dynamics
from src.novelist_brain.identity import IdentityCore, IdentityProfile
from src.novelist_brain.llm import MockLLMService
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
    llm_service: MockLLMService,
) -> dict[str, Any]:
    """Assemble the shared agent context passed to every module."""
    identity_profile = {
        "name": "novelist",
        "pen_name": "",
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

    return {
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
        "creation": {"seed": 42},
        "novel": {"title": "脑中世界纪事"},
    }


def create_modules(llm_service: MockLLMService) -> list[Any]:
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


def run_day() -> None:
    """Run the novelist brain through one full daily cycle."""
    print("=" * 60)
    print("小说家大脑原型 v1 — 启动")
    print("=" * 60)

    router = BusRouter()
    clock = Clock(
        start_hour=0.0,
        tick_duration_ms=TICK_DURATION_MINUTES * 60 * 1000.0,
    )
    llm_service = MockLLMService(seed=42)
    context = build_context(router, clock, llm_service)

    modules = create_modules(llm_service)

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

    # Return a non-zero exit code if no paragraph was produced.
    if not novel_output.paragraphs:
        print("\n错误: 未生成任何小说段落。", file=sys.stderr)
        sys.exit(1)

    print("\n运行成功: 小说家大脑完成了一天周期并输出了小说段落。")


if __name__ == "__main__":
    run_day()
