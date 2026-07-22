"""OCTownEngine: autonomous social simulation for original characters.

Inspired by ai-town's agent architecture, this module gives the novel's OCs a
persistent social life: they move between spaces, start conversations, form
relationships and occasionally reflect on shared history.  Events are published
to the bus as ``data.oc.town.event`` so that :class:`SelfTimeline` and
:class:`MemorySystem` can record them.

The implementation is deliberately LLM-free at the base layer.  Deterministic
rules drive day-to-day behaviour; downstream generators can subscribe to the
town event stream and rewrite summaries with an LLM when quality or novelty
matter.
"""

from __future__ import annotations

import random
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from src.novelist_brain.models import (
    BusMessage,
    ModuleState,
    OCCharacterSheet,
    Relationship,
    TickDelta,
)
from src.novelist_brain.module import Module
from src.novelist_brain.persistence import dataclass_to_dict, reconstruct_dataclass


#: Topic emitted when something happens inside the OC town.
TOPIC_TOWN_EVENT = "data.oc.town.event"

#: Topic used to inject an external event (e.g. from the reader or story bible).
TOPIC_INJECT_EVENT = "control.oc.town.inject_event"

#: Topic emitted when an OC synthesizes a higher-level reflection.
TOPIC_TOWN_REFLECTION = "data.oc.town.reflection"

#: Default spaces where OCs can hang out.  Callers can override via context.
DEFAULT_SPACES: tuple[str, ...] = (
    "公寓客厅",
    "街角咖啡馆",
    "旧书店",
    "河边步道",
    "深夜便利店",
)

#: Low-stakes conversation topics used by the deterministic generator.
CONVERSATION_TOPICS: tuple[str, ...] = (
    "天气",
    "昨晚的梦",
    "一个共同的回忆",
    "各自的烦恼",
    "未来的计划",
    "刚读到的一句话",
    "街角新开的店",
)


@dataclass
class OCAgentRuntime:
    """Mutable runtime state for a single OC agent."""

    character_id: str
    name: str = ""
    location: str = ""
    activity: str = "idle"
    mood: str = "平静"
    energy: float = 100.0
    current_goal: str = ""
    last_action_at: float = 0.0
    last_conversation_with: str = ""
    conversation_cooldown_seconds: float = 300.0


@dataclass
class OCSocialMemoryEntry:
    """One social memory entry owned by a specific agent."""

    entry_id: str
    agent_id: str
    target_id: str
    kind: str  # relationship | conversation | reflection
    content: str
    importance: float = 0.5
    timestamp: float = 0.0
    embedding: list[float] = field(default_factory=list)
    reflected: bool = False
    source_entry_ids: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        # Backward compatibility: old snapshots may omit these fields.
        if self.reflected is None:
            self.reflected = False
        if self.source_entry_ids is None:
            self.source_entry_ids = []


class OCTownAgent:
    """Wrapper around an OC character sheet plus runtime social state."""

    def __init__(self, sheet: OCCharacterSheet) -> None:
        self.sheet = sheet
        self.runtime = OCAgentRuntime(
            character_id=sheet.character_id,
            name=sheet.name or sheet.character_id,
            current_goal=sheet.current_goal or "度过今天",
        )
        self.social_memory: list[OCSocialMemoryEntry] = []

    def to_dict(self) -> dict[str, Any]:
        return {
            "sheet": dataclass_to_dict(self.sheet),
            "runtime": dataclass_to_dict(self.runtime),
            "social_memory": [
                dataclass_to_dict(entry) for entry in self.social_memory
            ],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "OCTownAgent":
        sheet_data = data.get("sheet", {})
        sheet = (
            OCCharacterSheet.from_dict(sheet_data)
            if isinstance(sheet_data, dict)
            else OCCharacterSheet(character_id=str(sheet_data))
        )
        agent = cls(sheet)
        runtime_data = data.get("runtime")
        if isinstance(runtime_data, dict):
            agent.runtime = reconstruct_dataclass(OCAgentRuntime, runtime_data)
        for entry_data in data.get("social_memory", []):
            if isinstance(entry_data, dict):
                agent.social_memory.append(
                    reconstruct_dataclass(OCSocialMemoryEntry, entry_data)
                )
        return agent

    def remember(
        self,
        target_id: str,
        kind: str,
        content: str,
        importance: float = 0.5,
        timestamp: float | None = None,
    ) -> OCSocialMemoryEntry:
        """Append a social memory entry for this agent."""
        entry = OCSocialMemoryEntry(
            entry_id=f"ocm_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}",
            agent_id=self.runtime.character_id,
            target_id=target_id,
            kind=kind,
            content=content,
            importance=max(0.0, min(1.0, float(importance))),
            timestamp=timestamp if timestamp is not None else time.time(),
        )
        self.social_memory.append(entry)
        return entry

    def memories_about(
        self,
        target_id: str,
        kind: str | None = None,
        limit: int = 5,
        now: float | None = None,
    ) -> list[OCSocialMemoryEntry]:
        """Return memories about ``target_id`` sorted by importance * recency.

        This is a lightweight, LLM-free retrieval inspired by ai-town's
        importance/recency/relevance scoring.  Relevance is omitted in the MVP
        because embeddings are not yet populated.
        """
        now = now if now is not None else time.time()
        candidates = [
            m
            for m in self.social_memory
            if m.target_id == target_id and (kind is None or m.kind == kind)
        ]
        if not candidates:
            return []

        half_life = 3600.0 * 6  # 6 hours

        def _score(entry: OCSocialMemoryEntry) -> float:
            age = max(0.0, now - entry.timestamp)
            recency = 0.5 ** (age / half_life)
            return entry.importance * recency

        candidates.sort(key=_score, reverse=True)
        return candidates[:limit]


class OCTownEngine(Module):
    """Drive the autonomous social life of a novel's original characters."""

    def __init__(self, name: str = "oc_town_engine") -> None:
        super().__init__(name)
        self._agents: dict[str, OCTownAgent] = {}
        self._spaces: set[str] = set(DEFAULT_SPACES)
        self._tick_interval_seconds = 60.0
        self._last_tick = 0.0
        self._rng = random.Random()
        self._reflection_threshold = 1.5
        self._reflection_window = 24.0 * 3600.0
        self.subscribe(
            "control.oc.town.init",
            TOPIC_INJECT_EVENT,
            "control.oc.create",
        )

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "oc_town_engine",
            "version": "0.1.0",
            "description": "OC autonomous social simulation inspired by ai-town",
            "dependencies": ["oc_character_system"],
            "category": "social",
        }

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.3,
            custom={
                "agents_count": 0,
                "events_published": 0,
                "conversations_count": 0,
                "reflections_count": 0,
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def register_agent(self, sheet: OCCharacterSheet) -> OCTownAgent:
        """Add an OC to the town simulation."""
        agent = OCTownAgent(sheet)
        # Scatter agents across spaces deterministically by name hash so tests
        # are stable while still feeling organic.
        if self._spaces:
            agent.runtime.location = self._space_for_name(agent.runtime.name)
        self._agents[sheet.character_id] = agent
        self._state.custom["agents_count"] = len(self._agents)
        return agent

    def unregister_agent(self, character_id: str) -> bool:
        """Remove an OC from the town simulation."""
        if character_id in self._agents:
            del self._agents[character_id]
            self._state.custom["agents_count"] = len(self._agents)
            return True
        return False

    def get_agent(self, character_id: str) -> OCTownAgent | None:
        return self._agents.get(character_id)

    def list_agents(self) -> list[OCTownAgent]:
        return list(self._agents.values())

    def inject_event(self, summary: str, extra: dict[str, Any] | None = None) -> None:
        """Publish an externally authored town event."""
        self._publish_event(
            kind="external",
            summary=summary,
            extra=extra or {},
        )

    # ------------------------------------------------------------------
    # Module lifecycle
    # ------------------------------------------------------------------

    def init(self, context: dict[str, Any]) -> None:
        """Load agents and spaces from context."""
        town_cfg = context.get("oc_town", {})
        spaces = town_cfg.get("spaces")
        if isinstance(spaces, (list, tuple, set)):
            self._spaces = set(str(s) for s in spaces)

        tick_interval = town_cfg.get("tick_interval_seconds")
        if isinstance(tick_interval, (int, float)) and tick_interval > 0:
            self._tick_interval_seconds = float(tick_interval)

        seed = town_cfg.get("seed")
        if isinstance(seed, int):
            self._rng = random.Random(seed)
        else:
            self._rng = random.Random()

        reflection_threshold = town_cfg.get("reflection_threshold")
        if isinstance(reflection_threshold, (int, float)) and reflection_threshold > 0:
            self._reflection_threshold = float(reflection_threshold)

        reflection_window = town_cfg.get("reflection_window")
        if isinstance(reflection_window, (int, float)) and reflection_window > 0:
            self._reflection_window = float(reflection_window)

        sheets = town_cfg.get("agents", [])
        for sheet_data in sheets:
            if isinstance(sheet_data, OCCharacterSheet):
                self.register_agent(sheet_data)
            elif isinstance(sheet_data, dict):
                self.register_agent(OCCharacterSheet.from_dict(sheet_data))

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        topic = message.topic
        payload = message.payload or {}

        if topic == "control.oc.create":
            sheet_data = payload.get("sheet")
            if isinstance(sheet_data, OCCharacterSheet):
                self.register_agent(sheet_data)
            elif isinstance(sheet_data, dict):
                self.register_agent(OCCharacterSheet.from_dict(sheet_data))
            return

        if topic == TOPIC_INJECT_EVENT:
            summary = payload.get("summary", "")
            if summary:
                self.inject_event(summary, payload.get("extra", {}))
            return

    def tick(self, delta: TickDelta) -> None:
        """Advance the town simulation if enough real time has passed."""
        now = delta.absolute_time
        if now - self._last_tick < self._tick_interval_seconds:
            return
        self._last_tick = now

        for agent in list(self._agents.values()):
            self._agent_tick(agent, now)

    # ------------------------------------------------------------------
    # Internal simulation
    # ------------------------------------------------------------------

    def _agent_tick(self, agent: OCTownAgent, now: float) -> None:
        # Deterministic MVP behaviour.  Probabilities are intentionally low so
        # the town feels slow and lived-in rather than chaotic.
        if self._rng.random() < 0.06:
            self._move_agent(agent)

        partner = self._find_conversation_partner(agent)
        if partner is not None and now - agent.runtime.last_action_at >= agent.runtime.conversation_cooldown_seconds:
            self._run_conversation(agent, partner, now)
            return

        if self._rng.random() < 0.02:
            self._reflect(agent, now)

    def _space_for_name(self, name: str) -> str:
        if not self._spaces:
            return ""
        names = sorted(self._spaces)
        idx = sum(ord(c) for c in name) % len(names)
        return names[idx]

    def _move_agent(self, agent: OCTownAgent) -> None:
        if not self._spaces or len(self._spaces) < 2:
            return
        current = agent.runtime.location
        choices = [s for s in self._spaces if s != current]
        if not choices:
            return
        new_location = self._rng.choice(choices)
        agent.runtime.location = new_location
        agent.runtime.activity = "移动"
        self._publish_event(
            kind="agent_moved",
            summary=f"{agent.runtime.name} 从 {current} 来到 {new_location}",
            extra={
                "agent_id": agent.runtime.character_id,
                "agent_name": agent.runtime.name,
                "from": current,
                "to": new_location,
            },
        )

    def _find_conversation_partner(self, agent: OCTownAgent) -> OCTownAgent | None:
        if agent.runtime.energy < 15.0:
            return None
        candidates = [
            other
            for other in self._agents.values()
            if other.runtime.character_id != agent.runtime.character_id
            and other.runtime.location == agent.runtime.location
            and other.runtime.energy >= 15.0
        ]
        if not candidates:
            return None
        # Prefer someone the agent has not spoken to recently.
        candidates.sort(
            key=lambda other: 0
            if other.runtime.character_id != agent.runtime.last_conversation_with
            else 1
        )
        # Only ~30% of eligible moments become conversations.
        if self._rng.random() < 0.30:
            return candidates[0]
        return None

    def _topic_from_memories(
        self,
        agent: OCTownAgent,
        partner: OCTownAgent,
        now: float,
    ) -> tuple[str, str]:
        """Pick a conversation topic influenced by the agent's memory of partner.

        Returns ``(topic, memory_hint)``.  If no relevant memory exists, the
        topic is chosen randomly and the hint is empty.
        """
        memories = agent.memories_about(
            partner.runtime.character_id, limit=3, now=now
        )
        if not memories:
            return self._rng.choice(CONVERSATION_TOPICS), ""

        top = memories[0]
        topic = self._match_topic(top.content)
        if topic is None:
            topic = self._rng.choice(CONVERSATION_TOPICS)
        hint = f"上次{top.content}" if top.content else ""
        return topic, hint

    @staticmethod
    def _match_topic(content: str) -> str | None:
        """Map a memory phrase back to one of the known conversation topics."""
        if any(k in content for k in ("梦", "梦见")):
            return "昨晚的梦"
        if any(k in content for k in ("烦恼", "焦虑", "担心")):
            return "各自的烦恼"
        if any(k in content for k in ("计划", "未来", "打算")):
            return "未来的计划"
        if any(k in content for k in ("书", "读到", "句子", "话")):
            return "刚读到的一句话"
        if any(k in content for k in ("天气", "下雨", "晴天", "雪", "风")):
            return "天气"
        if any(k in content for k in ("回忆", "记得", "曾经")):
            return "一个共同的回忆"
        if any(k in content for k in ("店", "新开", "街角")):
            return "街角新开的店"
        return None

    def _run_conversation(
        self,
        agent_a: OCTownAgent,
        agent_b: OCTownAgent,
        now: float,
    ) -> None:
        topic, memory_hint = self._topic_from_memories(agent_a, agent_b, now)
        location = agent_a.runtime.location or "某处"

        agent_a.runtime.last_conversation_with = agent_b.runtime.character_id
        agent_b.runtime.last_conversation_with = agent_a.runtime.character_id
        agent_a.runtime.last_action_at = now
        agent_b.runtime.last_action_at = now
        agent_a.runtime.activity = "交谈"
        agent_b.runtime.activity = "交谈"
        agent_a.runtime.energy = max(0.0, agent_a.runtime.energy - 5.0)
        agent_b.runtime.energy = max(0.0, agent_b.runtime.energy - 5.0)

        # Update relationship symmetrically in MVP.
        delta = round(self._rng.uniform(0.02, 0.08), 3)
        self._update_relationship(agent_a, agent_b, delta)

        if memory_hint:
            summary = (
                f"{agent_a.runtime.name} 想起 {memory_hint}，"
                f"和 {agent_b.runtime.name} 在 {location} 聊起 {topic}"
            )
        else:
            summary = (
                f"{agent_a.runtime.name} 和 {agent_b.runtime.name} "
                f"在 {location} 聊起了 {topic}"
            )

        # Record in social memory.
        agent_a.remember(
            target_id=agent_b.runtime.character_id,
            kind="conversation",
            content=f"与 {agent_b.runtime.name} 聊到 {topic}",
            importance=0.5,
            timestamp=now,
        )
        agent_b.remember(
            target_id=agent_a.runtime.character_id,
            kind="conversation",
            content=f"与 {agent_a.runtime.name} 聊到 {topic}",
            importance=0.5,
            timestamp=now,
        )

        # Trigger reflection if recent memories have accumulated enough weight.
        self.reflect_on_memories(agent_a, now)
        self.reflect_on_memories(agent_b, now)

        self._state.custom["conversations_count"] = (
            int(self._state.custom.get("conversations_count", 0)) + 1
        )
        self._publish_event(
            kind="conversation",
            summary=summary,
            extra={
                "agent_id": agent_a.runtime.character_id,
                "agent_name": agent_a.runtime.name,
                "partner_id": agent_b.runtime.character_id,
                "partner_name": agent_b.runtime.name,
                "topic": topic,
                "location": location,
                "relationship_delta": delta,
            },
        )

    def _reflect(self, agent: OCTownAgent, now: float) -> None:
        agent.runtime.last_action_at = now
        agent.runtime.activity = "沉思"
        reflection = self.reflect_on_memories(agent, now)
        if reflection is not None:
            return
        # Fallback: if no structured reflection was triggered, record a light
        # summary of the most recent memory so the agent still "has something
        # on its mind".
        memory = self._recent_memory_summary(agent)
        agent.remember(
            target_id="",
            kind="reflection",
            content=memory,
            importance=0.4,
            timestamp=now,
        )
        self._publish_event(
            kind="reflection",
            summary=f"{agent.runtime.name} 独自沉思：{memory}",
            extra={
                "agent_id": agent.runtime.character_id,
                "agent_name": agent.runtime.name,
                "memory": memory,
            },
        )

    def reflect_on_memories(
        self,
        agent: OCTownAgent,
        now: float | None = None,
    ) -> OCSocialMemoryEntry | None:
        """Synthesize a higher-level reflection when enough unreflected memories
        have accumulated.

        Inspired by the Generative Agents reflection loop, this gives OCs a
        sense of "having something on their mind" rather than just a flat list
        of observations.
        """
        now = now if now is not None else time.time()
        cutoff = now - self._reflection_window
        unreflected = [
            m for m in agent.social_memory
            if not m.reflected and m.timestamp >= cutoff
        ]
        total_importance = sum(m.importance for m in unreflected)
        if total_importance < self._reflection_threshold:
            return None

        insights = self._synthesize_reflections(agent, unreflected)
        content = "；".join(insights)
        source_ids = [m.entry_id for m in unreflected]

        reflection = agent.remember(
            target_id="",
            kind="reflection",
            content=content,
            importance=min(0.9, 0.45 + total_importance * 0.1),
            timestamp=now,
        )
        reflection.reflected = True
        reflection.source_entry_ids = source_ids

        for entry in unreflected:
            entry.reflected = True

        self._state.custom["reflections_count"] = (
            int(self._state.custom.get("reflections_count", 0)) + 1
        )
        self._publish_reflection_event(agent, reflection, insights, source_ids)
        return reflection

    def _synthesize_reflections(
        self,
        agent: OCTownAgent,
        entries: list[OCSocialMemoryEntry],
    ) -> list[str]:
        """Build a small list of insight phrases from unreflected memories."""
        insights: list[str] = []
        by_target: dict[str, list[OCSocialMemoryEntry]] = {}
        for entry in entries:
            if entry.target_id:
                by_target.setdefault(entry.target_id, []).append(entry)

        if by_target:
            sorted_targets = sorted(
                by_target.items(),
                key=lambda item: (sum(e.importance for e in item[1]), len(item[1])),
                reverse=True,
            )
            top_target, target_entries = sorted_targets[0]
            total_imp = sum(e.importance for e in target_entries)
            count = len(target_entries)
            other = self._agents.get(top_target)
            target_name = other.runtime.name if other is not None else top_target
            if count >= 2 and total_imp >= 1.0:
                insights.append(f"最近和 {target_name} 的互动很多，关系似乎在变化")
            else:
                insights.append(f"和 {target_name} 的那次交流让我印象深刻")

        kind_counts = Counter(e.kind for e in entries)
        if kind_counts.get("conversation", 0) >= 2:
            insights.append("最近聊了不少，也许该留一些时间独处")
        if kind_counts.get("reflection", 0) >= 2:
            insights.append("我一直在反复想同一些事情")

        if not insights:
            insights.append("最近发生了一些值得记住的事")

        return insights

    def _publish_reflection_event(
        self,
        agent: OCTownAgent,
        reflection: OCSocialMemoryEntry,
        insights: list[str],
        source_entry_ids: list[str],
    ) -> None:
        mentioned_targets = sorted(
            {m.target_id for m in agent.social_memory
             if m.entry_id in source_entry_ids and m.target_id}
        )
        self.emit(
            topic=TOPIC_TOWN_REFLECTION,
            payload={
                "kind": "reflection",
                "summary": f"{agent.runtime.name} 反思到：{reflection.content}",
                "timestamp": time.time(),
                "extra": {
                    "agent_id": agent.runtime.character_id,
                    "agent_name": agent.runtime.name,
                    "insights": insights,
                    "source_entry_ids": source_entry_ids,
                    "mentioned_targets": mentioned_targets,
                    "importance": reflection.importance,
                },
            },
            channel="data",
            priority=5,
            ttl=3,
        )
        self._state.custom["events_published"] = (
            int(self._state.custom.get("events_published", 0)) + 1
        )

    def _recent_memory_summary(self, agent: OCTownAgent) -> str:
        cutoff = time.time() - 24 * 3600
        recent = [m for m in agent.social_memory if m.timestamp >= cutoff]
        if not recent:
            return "最近没有特别的事发生"
        # Return the most recent conversation/reflection content.
        return recent[-1].content

    def _update_relationship(
        self,
        agent_a: OCTownAgent,
        agent_b: OCTownAgent,
        delta: float,
    ) -> None:
        for a, b in ((agent_a, agent_b), (agent_b, agent_a)):
            rel = a.sheet.relationships.get(b.runtime.character_id)
            if rel is None:
                rel = Relationship(
                    target_id=b.runtime.character_id,
                    target_name=b.runtime.name,
                    type="neutral",
                    intensity=0.0,
                    trust=0.0,
                    history=[],
                )
                a.sheet.relationships[b.runtime.character_id] = rel
            rel.intensity = max(-1.0, min(1.0, rel.intensity + delta))
            rel.trust = max(0.0, min(1.0, rel.trust + max(0.0, delta)))
            rel.history.append(f"{time.strftime('%m-%d %H:%M')} 互动 +{delta:.3f}")
            # Prevent unbounded history growth in long runs.
            if len(rel.history) > 50:
                rel.history = rel.history[-50:]

    def _publish_event(
        self,
        kind: str,
        summary: str,
        extra: dict[str, Any],
    ) -> None:
        self.emit(
            topic=TOPIC_TOWN_EVENT,
            payload={
                "kind": kind,
                "summary": summary,
                "timestamp": time.time(),
                "extra": extra,
            },
            channel="data",
            priority=5,
            ttl=3,
        )
        self._state.custom["events_published"] = (
            int(self._state.custom.get("events_published", 0)) + 1
        )

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        base.update(
            {
                "agents": [agent.to_dict() for agent in self._agents.values()],
                "spaces": sorted(self._spaces),
                "tick_interval_seconds": self._tick_interval_seconds,
                "last_tick": self._last_tick,
                "reflection_threshold": self._reflection_threshold,
                "reflection_window": self._reflection_window,
            }
        )
        return base

    def from_dict(self, data: dict[str, Any], **kwargs: Any) -> None:
        super().from_dict(data, **kwargs)
        self._spaces = set(data.get("spaces", DEFAULT_SPACES))
        self._tick_interval_seconds = float(
            data.get("tick_interval_seconds", 60.0)
        )
        self._last_tick = float(data.get("last_tick", 0.0))
        self._reflection_threshold = float(
            data.get("reflection_threshold", 1.5)
        )
        self._reflection_window = float(
            data.get("reflection_window", 24.0 * 3600.0)
        )
        self._agents = {
            agent.sheet.character_id: agent
            for agent in (
                OCTownAgent.from_dict(a) for a in data.get("agents", [])
            )
        }
        self._state.custom["agents_count"] = len(self._agents)


__all__ = [
    "OCTownEngine",
    "OCTownAgent",
    "OCAgentRuntime",
    "OCSocialMemoryEntry",
    "TOPIC_TOWN_EVENT",
    "TOPIC_INJECT_EVENT",
    "TOPIC_TOWN_REFLECTION",
]
