"""Tests for EOS metric thresholds and alert noise reduction."""

from __future__ import annotations

from src.novelist_brain.bus import BusRouter
from src.novelist_brain.eos import (
    CreativeCollector,
    EvaluationObservabilitySystem,
    LLMCollector,
    Metric,
    MetricThreshold,
    NetworkCollector,
    SandboxCollector,
)
from src.novelist_brain.models import BusMessage


def _msg(topic: str, payload: dict[str, object] | None = None) -> BusMessage:
    return BusMessage(source="test", topic=topic, channel="data", payload=payload or {})


def _severity(metric: Metric) -> str:
    return metric.severity()


def test_llm_metrics_no_alert_on_healthy_mock_operation() -> None:
    collector = LLMCollector()
    collector.ingest(_msg("llm.call.completed", {"latency_ms": 0.5, "input_tokens": 10, "output_tokens": 20}))
    collector.ingest(_msg("llm.call.completed", {"latency_ms": 0.3, "input_tokens": 5, "output_tokens": 15}))

    metrics = collector.aggregate({"start": 0, "end": 1000})
    severities = {m.id: _severity(m) for m in metrics}
    assert severities.get("llm_avg_latency_ms") == "normal"
    assert severities.get("llm_failure_rate") == "normal"


def test_llm_failure_rate_alerts_when_high() -> None:
    collector = LLMCollector()
    for _ in range(5):
        collector.ingest(_msg("llm.call.failed"))

    metrics = collector.aggregate({"start": 0, "end": 1000})
    failure_metric = next(m for m in metrics if m.id == "llm_failure_rate")
    assert _severity(failure_metric) == "critical"


def test_creative_metrics_no_alert_when_no_data() -> None:
    collector = CreativeCollector()
    metrics = collector.aggregate({"start": 0, "end": 1000})
    for metric in metrics:
        if metric.id in ("literarization_ratio", "narrative_coherence"):
            assert metric.threshold is None
            assert _severity(metric) == "normal"


def test_sandbox_metrics_no_alert_when_no_data() -> None:
    collector = SandboxCollector()
    metrics = collector.aggregate({"start": 0, "end": 1000})
    yield_metric = next(m for m in metrics if m.id == "narrative_yield")
    assert yield_metric.threshold is None
    assert _severity(yield_metric) == "normal"


def test_network_activation_metrics_no_alert() -> None:
    collector = NetworkCollector()
    collector.ingest(_msg("control.network.dmn.active"))
    metrics = collector.aggregate({"start": 0, "end": 1000})
    for metric in metrics:
        if metric.id in ("dmn_activation", "cen_activation"):
            assert metric.threshold is None
            assert _severity(metric) == "normal"


def test_metric_threshold_directions() -> None:
    below = MetricThreshold(warning=0.3, critical=0.15, direction="below")
    assert below.severity(0.1) == "critical"
    assert below.severity(0.25) == "warning"
    assert below.severity(0.5) == "normal"

    above = MetricThreshold(warning=0.3, critical=0.5, direction="above")
    assert above.severity(0.6) == "critical"
    assert above.severity(0.35) == "warning"
    assert above.severity(0.1) == "normal"


def test_eos_evaluation_does_not_spam_on_healthy_window() -> None:
    router = BusRouter()
    eos = EvaluationObservabilitySystem(name="eos")
    eos.register(router)
    eos.add_collector(LLMCollector())
    eos.add_collector(CreativeCollector())
    eos.add_collector(NetworkCollector())
    eos.add_collector(SandboxCollector())

    eos.init({
        "bus": router,
        "config": None,
        "eos": {
            "enabled": True,
            "evaluation_interval_ticks": 1,
            "report_on_phase_change": False,
            "sampling_rates": {},
            "threshold_rules": [],
        },
    })

    eos._evaluate("test")
    report = eos._recent_reports[-1]
    alert_metric_ids = {a.get("metric_id") for a in report.alerts}
    assert "llm_avg_latency_ms" not in alert_metric_ids
    assert "dmn_activation" not in alert_metric_ids
    assert "cen_activation" not in alert_metric_ids


def test_dynamic_latency_threshold_adapts_to_slow_api() -> None:
    """A consistently slow API should not keep firing latency alerts."""
    collector = LLMCollector()
    # Seed rolling history with past window averages around 4000 ms.
    collector._latency_history.extend([4000.0] * 12)

    # Current window is also around the historical mean.
    for _ in range(3):
        collector.ingest(_msg("llm.call.completed", {"latency_ms": 4100.0}))

    metrics = collector.aggregate({"start": 0, "end": 1000})
    latency_metric = next(m for m in metrics if m.id == "llm_avg_latency_ms")
    assert latency_metric.threshold is not None
    assert latency_metric.threshold.critical > 0.98
    assert _severity(latency_metric) == "normal"


def test_dynamic_latency_threshold_catches_spike() -> None:
    """A sudden latency spike should still trigger an alert."""
    collector = LLMCollector()
    # Seed rolling history with past window averages around 800 ms.
    collector._latency_history.extend([800.0] * 12)

    # Current window spikes to 5000 ms.
    for _ in range(3):
        collector.ingest(_msg("llm.call.completed", {"latency_ms": 5000.0}))

    metrics = collector.aggregate({"start": 0, "end": 1000})
    latency_metric = next(m for m in metrics if m.id == "llm_avg_latency_ms")
    assert _severity(latency_metric) == "critical"


if __name__ == "__main__":
    test_llm_metrics_no_alert_on_healthy_mock_operation()
    test_llm_failure_rate_alerts_when_high()
    test_creative_metrics_no_alert_when_no_data()
    test_sandbox_metrics_no_alert_when_no_data()
    test_network_activation_metrics_no_alert()
    test_metric_threshold_directions()
    test_eos_evaluation_does_not_spam_on_healthy_window()
    test_dynamic_latency_threshold_adapts_to_slow_api()
    test_dynamic_latency_threshold_catches_spike()
    print("eos threshold tests passed")
