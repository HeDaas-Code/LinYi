"""Evaluation & Observability System (EOS) for the novelist brain.

EOS is a non-invasive mirror: it subscribes to the main bus, aggregates events
into metrics over sliding windows, and emits evaluation reports and control
recommendations when thresholds are crossed or phases end.

This implementation follows Design.md section 19. It is intentionally decoupled
from module internals: every signal comes from ``BusMessage`` objects that flow
through the router.
"""

from __future__ import annotations

import math
import statistics
import time
import uuid
from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Literal

from src.novelist_brain.models import BusMessage, ModuleState, TickDelta
from src.novelist_brain.module import Module


MetricCategory = Literal["creative", "cognitive", "social"]
ThresholdDirection = Literal["above", "below", "both"]


def _now_ms() -> int:
    return int(time.time() * 1000)


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _sigmoid(value: float, k: float = 0.5, mid: float = 0.0) -> float:
    try:
        return 1.0 / (1.0 + math.exp(-k * (value - mid)))
    except OverflowError:
        return 0.0 if value < 0 else 1.0


def _get(payload: Any, key: str, default: Any = None) -> Any:
    """Return ``payload[key]`` or ``getattr(payload, key)`` or ``default``."""
    if payload is None:
        return default
    if isinstance(payload, dict):
        return payload.get(key, default)
    return getattr(payload, key, default)


@dataclass
class MetricThreshold:
    """Threshold configuration for a metric."""

    warning: float = 0.0
    critical: float = 0.0
    direction: ThresholdDirection = "below"

    def severity(self, value: float) -> Literal["normal", "warning", "critical"]:
        """Return the severity level for a given value."""
        if self.direction == "below":
            if value <= self.critical:
                return "critical"
            if value <= self.warning:
                return "warning"
        elif self.direction == "above":
            if value >= self.critical:
                return "critical"
            if value >= self.warning:
                return "warning"
        elif self.direction == "both":
            dist_warning = abs(value - self.warning)
            dist_critical = abs(value - self.critical)
            if dist_critical <= 0.05 or dist_warning <= 0.05:
                return "critical" if dist_critical <= dist_warning else "warning"
        return "normal"


@dataclass
class Metric:
    """Atomic observability metric."""

    id: str
    name: str
    category: MetricCategory
    value: float
    timestamp: int
    window: dict[str, int]
    source: str
    tags: list[str] = field(default_factory=list)
    raw_value: Any = None
    unit: str = "normalized"
    threshold: MetricThreshold | None = None

    def severity(self) -> Literal["normal", "warning", "critical"]:
        if self.threshold is None:
            return "normal"
        return self.threshold.severity(self.value)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "value": round(self.value, 4),
            "timestamp": self.timestamp,
            "window": self.window,
            "source": self.source,
            "tags": self.tags,
            "raw_value": self.raw_value,
            "unit": self.unit,
            "threshold": {
                "warning": self.threshold.warning,
                "critical": self.threshold.critical,
                "direction": self.threshold.direction,
            }
            if self.threshold
            else None,
            "severity": self.severity(),
        }


@dataclass
class EvaluationReport:
    """A snapshot evaluation produced by EOS."""

    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: int = field(default_factory=_now_ms)
    trigger: str = "tick"
    metrics: list[Metric] = field(default_factory=list)
    alerts: list[dict[str, Any]] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "trigger": self.trigger,
            "metrics": [m.to_dict() for m in self.metrics],
            "alerts": self.alerts,
            "recommendations": self.recommendations,
            "summary": self.summary,
        }


class MetricCollector(ABC):
    """Base class for event-driven metric collectors."""

    def __init__(
        self,
        collector_id: str,
        target_metrics: list[str],
        event_topics: list[str],
    ) -> None:
        self.id = collector_id
        self.target_metrics = list(target_metrics)
        self.event_topics = list(event_topics)
        self._events: list[BusMessage] = []

    @abstractmethod
    def ingest(self, event: BusMessage) -> None:
        """Process a single bus message."""
        ...

    @abstractmethod
    def aggregate(self, window: dict[str, int]) -> list[Metric]:
        """Aggregate ingested events into metrics for the given window."""
        ...

    def reset(self) -> None:
        """Clear accumulated events for the current window."""
        self._events.clear()

    def accepts(self, topic: str) -> bool:
        return topic in self.event_topics


class LLMCollector(MetricCollector):
    """Collects metrics around LLM invocations."""

    # Number of historical latency samples used to adapt thresholds.
    _LATENCY_HISTORY_MAX = 200
    # Minimum samples before switching from fixed to dynamic thresholds.
    _LATENCY_HISTORY_MIN = 10

    def __init__(self) -> None:
        super().__init__(
            collector_id="llm_collector",
            target_metrics=["llm_calls_per_hour", "llm_avg_latency_ms", "llm_failure_rate", "llm_roi"],
            event_topics=["llm.call.completed", "llm.call.failed", "data.novel.paragraph"],
        )
        self._call_count = 0
        self._failure_count = 0
        self._latencies: list[float] = []
        self._latency_history: deque[float] = deque(maxlen=self._LATENCY_HISTORY_MAX)
        self._input_tokens = 0
        self._output_tokens = 0
        self._downstream_consumers: dict[str, int] = {}

    def ingest(self, event: BusMessage) -> None:
        self._events.append(event)
        payload = event.payload or {}
        topic = event.topic
        if topic == "llm.call.completed":
            self._call_count += 1
            latency = _get(payload, "latency_ms", 0)
            if isinstance(latency, (int, float)):
                self._latencies.append(float(latency))
            self._input_tokens += int(_get(payload, "input_tokens", 0) or 0)
            self._output_tokens += int(_get(payload, "output_tokens", 0) or 0)
            consumer = _get(payload, "downstream_use", "unknown")
            self._downstream_consumers[consumer] = self._downstream_consumers.get(consumer, 0) + 1
        elif topic == "llm.call.failed":
            self._call_count += 1
            self._failure_count += 1

    def _latency_threshold(self) -> MetricThreshold:
        """Return latency threshold, adapting to historical API speed.

        When enough samples exist, the threshold is derived from the historical
        mean plus one/two standard deviations. This prevents a consistently slow
        but stable API from spamming critical alerts, while still catching sudden
        latency spikes.
        """
        if len(self._latency_history) < self._LATENCY_HISTORY_MIN:
            return MetricThreshold(warning=0.9, critical=0.98, direction="above")

        hist_mean = statistics.mean(self._latency_history)
        hist_std = statistics.stdev(self._latency_history) if len(self._latency_history) > 1 else 0.0

        # If the API is very stable, a std of zero would make warning equal
        # critical. Use a small relative floor so thresholds still separate.
        min_std = max(hist_mean * 0.1, 100.0)
        hist_std = max(hist_std, min_std)

        # Convert back to seconds for the sigmoid that normalises latency.
        warning_seconds = (hist_mean + hist_std) / 1000.0
        critical_seconds = (hist_mean + 2 * hist_std) / 1000.0

        # Clamp so extremely slow baselines do not disable alerts entirely.
        warning_value = _clamp(_sigmoid(warning_seconds, k=1.0), 0.75, 0.99)
        critical_value = _clamp(_sigmoid(critical_seconds, k=1.0), 0.85, 0.999)

        return MetricThreshold(warning=warning_value, critical=critical_value, direction="above")

    def aggregate(self, window: dict[str, int]) -> list[Metric]:
        duration_hours = max(1, (window["end"] - window["start"]) / 3600000.0)
        metrics: list[Metric] = []

        calls_per_hour = self._call_count / duration_hours
        metrics.append(
            Metric(
                id="llm_calls_per_hour",
                name="LLM 每小时调用次数",
                category="cognitive",
                value=_clamp(_sigmoid(calls_per_hour, k=0.1), 0.0, 1.0),
                raw_value={"calls": self._call_count, "per_hour": round(calls_per_hour, 2)},
                unit="count/hour",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["llm", "cost"],
                threshold=MetricThreshold(warning=0.7, critical=0.9, direction="above"),
            )
        )

        avg_latency = statistics.mean(self._latencies) if self._latencies else 0.0
        latency_threshold = self._latency_threshold()
        metrics.append(
            Metric(
                id="llm_avg_latency_ms",
                name="LLM 平均延迟",
                category="cognitive",
                value=_clamp(_sigmoid(avg_latency / 1000.0, k=1.0), 0.0, 1.0),
                raw_value={"avg_ms": round(avg_latency, 1), "samples": len(self._latencies)},
                unit="ms",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["llm", "latency"],
                threshold=latency_threshold,
            )
        )
        # Update rolling history with the current window average so that future
        # thresholds are based on past behaviour, not the current window.
        if self._latencies:
            self._latency_history.append(avg_latency)

        failure_rate = self._failure_count / max(1, self._call_count)
        metrics.append(
            Metric(
                id="llm_failure_rate",
                name="LLM 失败率",
                category="cognitive",
                value=_clamp(failure_rate, 0.0, 1.0),
                raw_value={"failures": self._failure_count, "calls": self._call_count},
                unit="ratio",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["llm", "reliability"],
                threshold=MetricThreshold(warning=0.3, critical=0.5, direction="above"),
            )
        )

        # ROI proxy: downstream consumers per call. In the future this can be
        # weighted by the actual narrative value of the produced content.
        roi = sum(self._downstream_consumers.values()) / max(1, self._call_count)
        metrics.append(
            Metric(
                id="llm_roi",
                name="LLM 投入产出比",
                category="cognitive",
                value=_clamp(_sigmoid(roi - 1.0, k=1.0), 0.0, 1.0),
                raw_value={"downstream_consumptions": self._downstream_consumers, "calls": self._call_count},
                unit="ratio",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["llm", "efficiency"],
                threshold=MetricThreshold(warning=0.15, critical=0.05, direction="below"),
            )
        )

        return metrics

    def reset(self) -> None:
        super().reset()
        self._call_count = 0
        self._failure_count = 0
        self._latencies.clear()
        self._input_tokens = 0
        self._output_tokens = 0
        self._downstream_consumers.clear()


class MemoryCollector(MetricCollector):
    """Collects metrics about memory operations and trace health."""

    def __init__(self) -> None:
        super().__init__(
            collector_id="memory_collector",
            target_metrics=["fragment_inflow_rate", "trace_consolidation_efficiency", "retrieval_quality"],
            event_topics=[
                "data.memory.trace.created",
                "data.memory.fragment.stored",
                "data.memory.trace.query.result",
            ],
        )
        self._fragments_stored = 0
        self._traces_created = 0
        self._query_results: list[float] = []
        self._consolidation_gains: list[float] = []

    def ingest(self, event: BusMessage) -> None:
        self._events.append(event)
        payload = event.payload or {}
        if event.topic == "data.memory.fragment.stored":
            self._fragments_stored += int(_get(payload, "count", 1) or 1)
        elif event.topic == "data.memory.trace.created":
            self._traces_created += 1
            gain = _get(payload, "consolidation_gain")
            if isinstance(gain, (int, float)):
                self._consolidation_gains.append(float(gain))
        elif event.topic == "data.memory.trace.query.result":
            relevance = _get(payload, "relevance_score")
            if isinstance(relevance, (int, float)):
                self._query_results.append(float(relevance))

    def aggregate(self, window: dict[str, int]) -> list[Metric]:
        duration_hours = max(1, (window["end"] - window["start"]) / 3600000.0)
        metrics: list[Metric] = []

        inflow = self._fragments_stored / duration_hours
        metrics.append(
            Metric(
                id="fragment_inflow_rate",
                name="Fragment 流入速率",
                category="cognitive",
                value=_clamp(_sigmoid(inflow / 10.0, k=0.5), 0.0, 1.0),
                raw_value={"fragments": self._fragments_stored, "per_hour": round(inflow, 2)},
                unit="count/hour",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["memory", "fragment"],
                threshold=MetricThreshold(warning=0.85, critical=0.95, direction="above"),
            )
        )

        efficiency = statistics.mean(self._consolidation_gains) if self._consolidation_gains else 0.5
        metrics.append(
            Metric(
                id="trace_consolidation_efficiency",
                name="Trace 巩固效率",
                category="cognitive",
                value=_clamp(efficiency, 0.0, 1.0),
                raw_value={
                    "traces": self._traces_created,
                    "gains": [round(g, 3) for g in self._consolidation_gains],
                },
                unit="ratio",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["memory", "trace"],
                threshold=MetricThreshold(warning=0.4, critical=0.25, direction="below"),
            )
        )

        rq = statistics.mean(self._query_results) if self._query_results else 0.5
        metrics.append(
            Metric(
                id="retrieval_quality",
                name="检索质量",
                category="cognitive",
                value=_clamp(rq, 0.0, 1.0),
                raw_value={"samples": len(self._query_results), "avg_relevance": round(rq, 3)},
                unit="ratio",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["memory", "retrieval"],
                threshold=MetricThreshold(warning=0.4, critical=0.25, direction="below"),
            )
        )

        return metrics

    def reset(self) -> None:
        super().reset()
        self._fragments_stored = 0
        self._traces_created = 0
        self._query_results.clear()
        self._consolidation_gains.clear()


class MetabolismCollector(MetricCollector):
    """Collects metabolic samples broadcast by the metabolism module."""

    def __init__(self) -> None:
        super().__init__(
            collector_id="metabolism_collector",
            target_metrics=["metabolic_balance_index", "energy_stability", "sleep_debt"],
            event_topics=["control.metabolism.budget.exhausted", "data.metabolism.state"],
        )
        self._energy_samples: list[float] = []
        self._time_currency_samples: list[float] = []
        self._exhaustion_events = 0

    def ingest(self, event: BusMessage) -> None:
        self._events.append(event)
        payload = event.payload or {}
        if event.topic == "data.metabolism.state":
            energy = _get(payload, "energy")
            if isinstance(energy, (int, float)):
                self._energy_samples.append(float(energy))
            time_currency = _get(payload, "time_currency")
            if isinstance(time_currency, (int, float)):
                self._time_currency_samples.append(float(time_currency))
        elif event.topic == "control.metabolism.budget.exhausted":
            self._exhaustion_events += 1

    def aggregate(self, window: dict[str, int]) -> list[Metric]:
        metrics: list[Metric] = []

        if self._energy_samples:
            avg_energy = statistics.mean(self._energy_samples)
            std_energy = statistics.stdev(self._energy_samples) if len(self._energy_samples) > 1 else 0.0
        else:
            avg_energy = 50.0
            std_energy = 0.0

        # MBI: high average energy and low volatility is good.
        mbi = (avg_energy / 100.0) * (1.0 - _clamp(std_energy / 50.0, 0.0, 1.0))
        metrics.append(
            Metric(
                id="metabolic_balance_index",
                name="代谢平衡指数",
                category="cognitive",
                value=_clamp(mbi, 0.0, 1.0),
                raw_value={
                    "avg_energy": round(avg_energy, 1),
                    "energy_std": round(std_energy, 2),
                    "exhaustion_events": self._exhaustion_events,
                },
                unit="normalized",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["metabolism", "health"],
                threshold=MetricThreshold(warning=0.35, critical=0.2, direction="below"),
            )
        )

        stability = 1.0 - _clamp(std_energy / 30.0, 0.0, 1.0)
        metrics.append(
            Metric(
                id="energy_stability",
                name="能量稳定性",
                category="cognitive",
                value=_clamp(stability, 0.0, 1.0),
                raw_value={"samples": len(self._energy_samples), "std": round(std_energy, 2)},
                unit="normalized",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["metabolism", "stability"],
                threshold=MetricThreshold(warning=0.4, critical=0.25, direction="below"),
            )
        )

        # Sleep debt proxy: inverted average time currency. If time currency is
        # consistently low, the agent is running a sleep deficit.
        avg_time_currency = statistics.mean(self._time_currency_samples) if self._time_currency_samples else 100.0
        avg_sleep_debt = max(0.0, 100.0 - avg_time_currency)
        metrics.append(
            Metric(
                id="sleep_debt",
                name="睡眠债",
                category="cognitive",
                value=_clamp(avg_sleep_debt / 100.0, 0.0, 1.0),
                raw_value={"avg_sleep_debt": round(avg_sleep_debt, 1), "samples": len(self._time_currency_samples)},
                unit="normalized",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["metabolism", "sleep"],
                threshold=MetricThreshold(warning=0.5, critical=0.75, direction="above"),
            )
        )

        return metrics

    def reset(self) -> None:
        super().reset()
        self._energy_samples.clear()
        self._time_currency_samples.clear()
        self._exhaustion_events = 0


class SandboxCollector(MetricCollector):
    """Collects metrics from the mental sandbox / TRPG simulation."""

    def __init__(self) -> None:
        super().__init__(
            collector_id="sandbox_collector",
            target_metrics=["narrative_yield", "scene_tension", "character_autonomy"],
            event_topics=[
                "data.sandbox.narrative.ready",
                "sandbox.event",
                "data.sandbox.character.action",
            ],
        )
        self._narrative_yields: list[float] = []
        self._tension_deltas: list[float] = []
        self._autonomy_scores: list[float] = []

    def ingest(self, event: BusMessage) -> None:
        self._events.append(event)
        payload = event.payload or {}
        if event.topic == "data.sandbox.narrative.ready":
            y = _get(payload, "narrative_yield")
            if isinstance(y, (int, float)):
                self._narrative_yields.append(float(y))
        elif event.topic == "sandbox.event":
            td = _get(payload, "tension_delta")
            if isinstance(td, (int, float)):
                self._tension_deltas.append(float(td))
        elif event.topic == "data.sandbox.character.action":
            a = _get(payload, "autonomy_score")
            if isinstance(a, (int, float)):
                self._autonomy_scores.append(float(a))

    def aggregate(self, window: dict[str, int]) -> list[Metric]:
        metrics: list[Metric] = []

        ny = statistics.mean(self._narrative_yields) if self._narrative_yields else 0.0
        metrics.append(
            Metric(
                id="narrative_yield",
                name="叙事产出比",
                category="creative",
                value=_clamp(ny, 0.0, 1.0),
                raw_value={"events": len(self._narrative_yields), "avg_yield": round(ny, 3)},
                unit="ratio",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["sandbox", "creative"],
                threshold=MetricThreshold(warning=0.35, critical=0.2, direction="below")
                if self._narrative_yields
                else None,
            )
        )

        tension = statistics.mean(self._tension_deltas) if self._tension_deltas else 0.0
        metrics.append(
            Metric(
                id="scene_tension",
                name="场景张力",
                category="creative",
                value=_clamp(0.5 + tension, 0.0, 1.0),
                raw_value={"events": len(self._tension_deltas), "avg_delta": round(tension, 3)},
                unit="normalized",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["sandbox", "tension"],
                threshold=MetricThreshold(warning=0.85, critical=0.95, direction="above"),
            )
        )

        autonomy = statistics.mean(self._autonomy_scores) if self._autonomy_scores else 0.5
        metrics.append(
            Metric(
                id="character_autonomy",
                name="角色自主性",
                category="creative",
                value=_clamp(autonomy, 0.0, 1.0),
                raw_value={"samples": len(self._autonomy_scores), "avg_autonomy": round(autonomy, 3)},
                unit="ratio",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["sandbox", "character"],
                threshold=MetricThreshold(warning=0.4, critical=0.25, direction="below"),
            )
        )

        return metrics

    def reset(self) -> None:
        super().reset()
        self._narrative_yields.clear()
        self._tension_deltas.clear()
        self._autonomy_scores.clear()


class SocialCollector(MetricCollector):
    """Collects social adaptation metrics."""

    def __init__(self) -> None:
        super().__init__(
            collector_id="social_collector",
            target_metrics=["social_health", "gaze_load", "social_fragment_quality"],
            event_topics=[
                "data.social.fragment",
                "data.social.gaze",
                "fragment.social.new",
                "data.social.state",
                "data.identity.updated",
            ],
        )
        self._gaze_pressures: list[float] = []
        self._fragment_qualities: list[float] = []
        self._identity_updates = 0

    def ingest(self, event: BusMessage) -> None:
        self._events.append(event)
        payload = event.payload or {}
        if event.topic in ("data.social.gaze", "data.social.state"):
            intensity = _get(payload, "intensity") or _get(payload, "gaze_pressure")
            if isinstance(intensity, (int, float)):
                self._gaze_pressures.append(float(intensity))
        elif event.topic in ("data.social.fragment", "fragment.social.new"):
            quality = _get(payload, "quality") or _get(payload, "salience", 0.5)
            if isinstance(quality, (int, float)):
                self._fragment_qualities.append(float(quality))
        elif event.topic == "data.identity.updated":
            self._identity_updates += 1

    def aggregate(self, window: dict[str, int]) -> list[Metric]:
        metrics: list[Metric] = []

        exposure = statistics.mean(self._gaze_pressures) if self._gaze_pressures else 0.0
        quality = statistics.mean(self._fragment_qualities) if self._fragment_qualities else 0.5
        # Balance proxy: fewer identity updates per social event means healthier boundaries.
        social_health = (
            0.35 * (1.0 - _clamp(exposure, 0.0, 1.0))
            + 0.35 * _clamp(quality, 0.0, 1.0)
            + 0.30 * (1.0 - _clamp(self._identity_updates / max(1, len(self._fragment_qualities)), 0.0, 1.0))
        )
        metrics.append(
            Metric(
                id="social_health",
                name="社交健康度",
                category="social",
                value=_clamp(social_health, 0.0, 1.0),
                raw_value={
                    "exposure": round(exposure, 3),
                    "quality": round(quality, 3),
                    "identity_updates": self._identity_updates,
                },
                unit="normalized",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["social", "health"],
                threshold=MetricThreshold(warning=0.4, critical=0.25, direction="below"),
            )
        )

        metrics.append(
            Metric(
                id="gaze_load",
                name="凝视承压值",
                category="social",
                value=_clamp(exposure, 0.0, 1.0),
                raw_value={"samples": len(self._gaze_pressures), "avg_intensity": round(exposure, 3)},
                unit="normalized",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["social", "gaze"],
                threshold=MetricThreshold(warning=0.6, critical=0.8, direction="above"),
            )
        )

        metrics.append(
            Metric(
                id="social_fragment_quality",
                name="社会碎片质量",
                category="social",
                value=_clamp(quality, 0.0, 1.0),
                raw_value={"samples": len(self._fragment_qualities), "avg_quality": round(quality, 3)},
                unit="normalized",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["social", "fragment"],
                threshold=MetricThreshold(warning=0.4, critical=0.25, direction="below"),
            )
        )

        return metrics

    def reset(self) -> None:
        super().reset()
        self._gaze_pressures.clear()
        self._fragment_qualities.clear()
        self._identity_updates = 0


class NetworkCollector(MetricCollector):
    """Collects cognitive-health metrics about network switching and phases."""

    def __init__(self) -> None:
        super().__init__(
            collector_id="network_collector",
            target_metrics=["network_switch_frequency", "dmn_activation", "cen_activation"],
            event_topics=[
                "control.network.switch",
                "control.network.dmn.active",
                "control.network.cen.active",
            ],
        )
        self._switches = 0
        self._dmn_ticks = 0
        self._cen_ticks = 0

    def ingest(self, event: BusMessage) -> None:
        self._events.append(event)
        if event.topic == "control.network.switch":
            self._switches += 1
        elif event.topic == "control.network.dmn.active":
            self._dmn_ticks += 1
        elif event.topic == "control.network.cen.active":
            self._cen_ticks += 1

    def aggregate(self, window: dict[str, int]) -> list[Metric]:
        duration_hours = max(1, (window["end"] - window["start"]) / 3600000.0)
        metrics: list[Metric] = []

        nsf = self._switches / duration_hours
        metrics.append(
            Metric(
                id="network_switch_frequency",
                name="网络切换频率",
                category="cognitive",
                value=_clamp(_sigmoid(nsf, k=0.3), 0.0, 1.0),
                raw_value={"switches": self._switches, "per_hour": round(nsf, 2)},
                unit="count/hour",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["network", "switching"],
                threshold=MetricThreshold(warning=0.7, critical=0.85, direction="above"),
            )
        )

        total = max(1, self._dmn_ticks + self._cen_ticks)
        # Activation ratios within a single window are not actionable on their
        # own; a network can legitimately be inactive for a window. Keep the
        # metric for dashboards but do not emit threshold-based alerts.
        metrics.append(
            Metric(
                id="dmn_activation",
                name="DMN 激活占比",
                category="cognitive",
                value=_clamp(self._dmn_ticks / total, 0.0, 1.0),
                raw_value={"dmn_ticks": self._dmn_ticks, "cen_ticks": self._cen_ticks},
                unit="ratio",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["network", "dmn"],
                threshold=None,
            )
        )

        metrics.append(
            Metric(
                id="cen_activation",
                name="CEN 激活占比",
                category="cognitive",
                value=_clamp(self._cen_ticks / total, 0.0, 1.0),
                raw_value={"cen_ticks": self._cen_ticks, "dmn_ticks": self._dmn_ticks},
                unit="ratio",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["network", "cen"],
                threshold=None,
            )
        )

        return metrics

    def reset(self) -> None:
        super().reset()
        self._switches = 0
        self._dmn_ticks = 0
        self._cen_ticks = 0


class CreativeCollector(MetricCollector):
    """Collects creative output metrics from DMN, CEN and the novel output path."""

    def __init__(self) -> None:
        super().__init__(
            collector_id="creative_collector",
            target_metrics=["idea_abundance", "literarization_ratio", "narrative_coherence"],
            event_topics=[
                "event.dmn.insight",
                "data.novel.paragraph",
                "event.novel.paragraph.published",
                "data.sandbox.narrative.ready",
                "data.cen.idea",
                "data.dmn.state",
                "data.cen.plan",
            ],
        )
        self._ideas: list[dict[str, float]] = []
        self._paragraphs_generated = 0
        self._paragraphs_published = 0
        self._narratives_ready = 0

    def ingest(self, event: BusMessage) -> None:
        self._events.append(event)
        payload = event.payload or {}
        if event.topic in ("event.dmn.insight", "data.cen.idea", "data.dmn.state", "data.cen.plan"):
            self._ideas.append(
                {
                    "salience": float(_get(payload, "salience", 0.5) or 0.5),
                    "novelty": float(_get(payload, "novelty", 0.5) or 0.5),
                }
            )
        elif event.topic == "data.novel.paragraph":
            self._paragraphs_generated += 1
        elif event.topic == "event.novel.paragraph.published":
            self._paragraphs_published += 1
        elif event.topic == "data.sandbox.narrative.ready":
            self._narratives_ready += 1

    def aggregate(self, window: dict[str, int]) -> list[Metric]:
        duration_hours = max(1, (window["end"] - window["start"]) / 3600000.0)
        metrics: list[Metric] = []

        idea_count = len(self._ideas)
        avg_salience = statistics.mean([i["salience"] for i in self._ideas]) if self._ideas else 0.0
        avg_novelty = statistics.mean([i["novelty"] for i in self._ideas]) if self._ideas else 0.0
        raw_ia = (idea_count / duration_hours) * (0.5 * avg_salience + 0.5 * avg_novelty)
        metrics.append(
            Metric(
                id="idea_abundance",
                name="灵感丰度",
                category="creative",
                value=_clamp(_sigmoid(raw_ia, k=0.5), 0.0, 1.0),
                raw_value={
                    "ideas": idea_count,
                    "per_hour": round(idea_count / duration_hours, 2),
                    "avg_salience": round(avg_salience, 3),
                    "avg_novelty": round(avg_novelty, 3),
                },
                unit="normalized",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["creative", "dmn", "idea"],
                threshold=MetricThreshold(warning=0.3, critical=0.15, direction="below"),
            )
        )

        lr = (
            self._paragraphs_published / max(1, self._narratives_ready)
            if self._narratives_ready
            else 0.0
        )
        metrics.append(
            Metric(
                id="literarization_ratio",
                name="文学化比率",
                category="creative",
                value=_clamp(lr, 0.0, 1.0),
                raw_value={
                    "published": self._paragraphs_published,
                    "narratives_ready": self._narratives_ready,
                },
                unit="ratio",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["creative", "output"],
                threshold=MetricThreshold(warning=0.4, critical=0.2, direction="below")
                if self._narratives_ready
                else None,
            )
        )

        # Narrative coherence proxy: published paragraphs per generated paragraph.
        nc = (
            self._paragraphs_published / max(1, self._paragraphs_generated)
            if self._paragraphs_generated
            else 0.0
        )
        metrics.append(
            Metric(
                id="narrative_coherence",
                name="叙事连贯性",
                category="creative",
                value=_clamp(nc, 0.0, 1.0),
                raw_value={
                    "published": self._paragraphs_published,
                    "generated": self._paragraphs_generated,
                },
                unit="ratio",
                timestamp=window["end"],
                window=window,
                source=self.id,
                tags=["creative", "narrative"],
                threshold=MetricThreshold(warning=0.5, critical=0.3, direction="below")
                if self._paragraphs_generated
                else None,
            )
        )

        return metrics

    def reset(self) -> None:
        super().reset()
        self._ideas.clear()
        self._paragraphs_generated = 0
        self._paragraphs_published = 0
        self._narratives_ready = 0


class ObservabilityBus:
    """Secondary bus dedicated to EOS; reads from the main bus, does not control it."""

    def __init__(self, collectors: list[MetricCollector] | None = None) -> None:
        self.id = f"observability_bus_{uuid.uuid4().hex[:6]}"
        self._collectors: list[MetricCollector] = list(collectors) if collectors else []
        self._sampling_rates: dict[str, float] = {}
        self._event_log: deque[BusMessage] = deque(maxlen=5000)
        self._counter = 0

    @property
    def collectors(self) -> list[MetricCollector]:
        return list(self._collectors)

    def add_collector(self, collector: MetricCollector) -> None:
        self._collectors.append(collector)

    def set_sampling_rate(self, topic: str, rate: float) -> None:
        """Set sampling rate in [0, 1] for a topic."""
        self._sampling_rates[topic] = _clamp(rate, 0.0, 1.0)

    def on_main_bus_message(self, message: BusMessage) -> None:
        """Receive a message from the main bus and route to collectors."""
        import random

        self._event_log.append(message)
        rate = self._sampling_rates.get(message.topic, 1.0)
        if rate < 1.0 and random.random() > rate:
            return
        for collector in self._collectors:
            if collector.accepts(message.topic):
                collector.ingest(message)

    def evaluate(self, trigger: str = "tick", window: dict[str, int] | None = None) -> EvaluationReport:
        """Aggregate all collectors into an evaluation report."""
        now = _now_ms()
        if window is None:
            window = {"start": now - 3600000, "end": now}
        metrics: list[Metric] = []
        for collector in self._collectors:
            metrics.extend(collector.aggregate(window))
        return EvaluationReport(
            timestamp=now,
            trigger=trigger,
            metrics=metrics,
        )

    def reset_collectors(self) -> None:
        for collector in self._collectors:
            collector.reset()

    def export_events(self, max_count: int = 100) -> list[dict[str, Any]]:
        """Export recent raw events as plain dicts for offline analysis."""
        return [
            {
                "id": m.id,
                "timestamp": m.timestamp,
                "source": m.source,
                "topic": m.topic,
                "channel": m.channel,
            }
            for m in list(self._event_log)[-max_count:]
        ]


class Dashboard:
    """Read-only view of EOS metrics for external operators."""

    def __init__(self, observability_bus: ObservabilityBus) -> None:
        self.id = f"dashboard_{uuid.uuid4().hex[:6]}"
        self._bus = observability_bus
        self._last_report: EvaluationReport | None = None
        self._history: deque[Metric] = deque(maxlen=2000)

    def refresh(self, metrics: list[Metric]) -> None:
        self._history.extend(metrics)

    def render(self) -> dict[str, Any]:
        report = self._last_report
        latest: dict[str, Metric] = {}
        for metric in self._history:
            latest[metric.id] = metric
        return {
            "dashboard_id": self.id,
            "metric_count": len(latest),
            "metrics": {mid: m.to_dict() for mid, m in latest.items()},
            "last_report": report.to_dict() if report else None,
        }

    def export_report(self) -> EvaluationReport:
        if self._last_report is None:
            self._last_report = self._bus.evaluate(trigger="manual")
        return self._last_report

    def set_last_report(self, report: EvaluationReport) -> None:
        self._last_report = report


class EvaluationObservabilitySystem(Module):
    """EOS module: non-invasive mirror of the novelist brain."""

    @classmethod
    def metadata(cls) -> dict[str, Any]:
        return {
            "name": "eos",
            "version": "1.0.0",
            "description": "Evaluation and observability system for the novelist brain.",
            "dependencies": [],
            "category": "observability",
        }

    def __init__(
        self,
        name: str = "eos",
        observability_bus: ObservabilityBus | None = None,
        dashboard: Dashboard | None = None,
        evaluation_interval_ticks: int = 6,
        report_on_phase_change: bool = True,
    ) -> None:
        super().__init__(name)
        self._obs_bus = observability_bus or ObservabilityBus()
        self._dashboard = dashboard or Dashboard(self._obs_bus)
        self._evaluation_interval_ticks = max(1, evaluation_interval_ticks)
        self._report_on_phase_change = report_on_phase_change
        self._tick_count = 0
        self._last_phase: str | None = None
        self._window_start: int = _now_ms()
        self._recent_reports: deque[EvaluationReport] = deque(maxlen=20)
        self._threshold_rules: list[dict[str, Any]] = []
        self._suppress_until: dict[str, int] = {}

        # EOS does not subscribe to individual topics through the router.  The
        # main agent loop feeds every delivered BusMessage into
        # ``on_bus_message`` manually so that observation is complete and
        # non-invasive (EOS never modifies routing behaviour).

    def _initial_state(self) -> ModuleState:
        return ModuleState(
            active=True,
            energy_cost=0.05,
            custom={
                "reports_generated": 0,
                "alerts_generated": 0,
                "last_report_id": None,
            },
        )

    def add_collector(self, collector: MetricCollector) -> None:
        self._obs_bus.add_collector(collector)

    def add_threshold_rule(self, rule: dict[str, Any]) -> None:
        """Add a threshold rule that may emit control recommendations.

        Expected keys: metric_id, condition (above/below), threshold,
        duration_ms, severity, action, cooldown_ms.
        """
        self._threshold_rules.append(rule)

    def init(self, context: dict[str, Any]) -> None:
        eos_config = context.get("eos", {})
        self._evaluation_interval_ticks = eos_config.get(
            "evaluation_interval_ticks", self._evaluation_interval_ticks
        )
        self._report_on_phase_change = eos_config.get(
            "report_on_phase_change", self._report_on_phase_change
        )
        for rule in eos_config.get("threshold_rules", []):
            self.add_threshold_rule(rule)
        for topic, rate in eos_config.get("sampling_rates", {}).items():
            self._obs_bus.set_sampling_rate(topic, rate)

    def on_bus_message(self, message: BusMessage) -> None:
        if not self._state.active:
            return
        # EOS is a passive observer; it never modifies other modules' state.
        self._obs_bus.on_main_bus_message(message)

    def tick(self, delta: TickDelta) -> None:
        if not self._state.active:
            return

        self._tick_count += 1
        current_phase = delta.phase
        phase_changed = current_phase != self._last_phase
        self._last_phase = current_phase

        should_evaluate = self._tick_count % self._evaluation_interval_ticks == 0
        trigger = "tick"
        if phase_changed and self._report_on_phase_change:
            should_evaluate = True
            trigger = f"phase_change:{current_phase}"

        if should_evaluate:
            self._evaluate(trigger)

    def _evaluate(self, trigger: str) -> None:
        now = _now_ms()
        window = {"start": self._window_start, "end": now}
        report = self._obs_bus.evaluate(trigger=trigger, window=window)
        self._window_start = now

        alerts: list[dict[str, Any]] = []
        recommendations: list[str] = []
        for metric in report.metrics:
            if metric.severity() != "normal":
                alerts.append(
                    {
                        "metric_id": metric.id,
                        "metric_name": metric.name,
                        "severity": metric.severity(),
                        "value": metric.value,
                        "threshold": metric.threshold,
                    }
                )
            self._maybe_apply_threshold_rules(metric, alerts, recommendations)

        report.alerts = alerts
        report.recommendations = recommendations
        if alerts:
            self._state.custom["alerts_generated"] += len(alerts)
            # Publish a non-invasive control recommendation. Modules may choose
            # to react; EOS does not enforce.
            self.emit(
                topic="control.eos.recommendation",
                channel="control",
                payload={
                    "report_id": report.id,
                    "alerts": alerts,
                    "recommendations": recommendations,
                    "trigger": trigger,
                },
                priority=5,
                ttl=3,
            )

        report.summary = self._summarize_report(report)
        self._recent_reports.append(report)
        self._dashboard.refresh(report.metrics)
        self._dashboard.set_last_report(report)
        self._state.custom["reports_generated"] += 1
        self._state.custom["last_report_id"] = report.id

        # Reset collectors after aggregation so the next window is clean.
        self._obs_bus.reset_collectors()

    def _maybe_apply_threshold_rules(
        self,
        metric: Metric,
        alerts: list[dict[str, Any]],
        recommendations: list[str],
    ) -> None:
        now = _now_ms()
        for rule in self._threshold_rules:
            if rule.get("metric_id") != metric.id:
                continue
            cooldown = rule.get("cooldown_ms", 60000)
            key = f"{metric.id}:{rule.get('action')}"
            if now < self._suppress_until.get(key, 0):
                continue
            condition = rule.get("condition")
            threshold = rule.get("threshold", 0.0)
            triggered = False
            if condition == "above" and metric.value >= threshold:
                triggered = True
            elif condition == "below" and metric.value <= threshold:
                triggered = True
            if not triggered:
                continue
            self._suppress_until[key] = now + cooldown
            recommendations.append(
                f"{metric.name} ({metric.id}) {condition} {threshold}; "
                f"建议动作: {rule.get('action')}"
            )
            alerts.append(
                {
                    "metric_id": metric.id,
                    "rule": rule,
                    "value": metric.value,
                    "severity": rule.get("severity", "warning"),
                }
            )

    def _summarize_report(self, report: EvaluationReport) -> str:
        if not report.metrics:
            return "EOS: 当前窗口无指标。"
        by_category: dict[str, list[float]] = {}
        for metric in report.metrics:
            by_category.setdefault(metric.category, []).append(metric.value)
        avg_by_category = {
            cat: round(statistics.mean(values), 3) for cat, values in by_category.items()
        }
        alert_count = len(report.alerts)
        summary = f"EOS [{report.trigger}]: 指标={len(report.metrics)}, 告警={alert_count}"
        if avg_by_category:
            summary += f", 分类均值={avg_by_category}"
        return summary

    def latest_report(self) -> EvaluationReport | None:
        return self._recent_reports[-1] if self._recent_reports else None

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        latest = self.latest_report()
        base.update(
            {
                "evaluation_interval_ticks": self._evaluation_interval_ticks,
                "reports_generated": self._state.custom.get("reports_generated", 0),
                "alerts_generated": self._state.custom.get("alerts_generated", 0),
                "last_report_id": self._state.custom.get("last_report_id"),
                "latest_report": latest.to_dict() if latest else None,
            }
        )
        return base

    def get_state(self) -> dict[str, Any]:
        latest = self.latest_report()
        return {
            "active": self._state.active,
            "reports_generated": self._state.custom.get("reports_generated", 0),
            "alerts_generated": self._state.custom.get("alerts_generated", 0),
            "last_report_id": self._state.custom.get("last_report_id"),
            "latest_report": latest.to_dict() if latest else None,
            "dashboard": self._dashboard.render(),
        }