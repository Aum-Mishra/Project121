from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
import psutil
from typing import Tuple

# Prometheus Metric Definitions
AGENT_RUNS_COUNTER = Counter(
    "sovereign_agent_runs_total",
    "Total number of agent execution runs",
    ["status"],
)

AGENT_DURATION_HISTOGRAM = Histogram(
    "sovereign_agent_execution_seconds",
    "Duration of agent runs in seconds",
    buckets=[0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0],
)

MODEL_INFERENCE_HISTOGRAM = Histogram(
    "sovereign_model_inference_seconds",
    "Time taken for local model generation",
    ["model"],
    buckets=[0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0],
)

RAG_RETRIEVALS_COUNTER = Counter(
    "sovereign_rag_retrievals_total",
    "Total number of RAG retrieval queries executed",
    ["status"],
)

SANDBOX_EXECUTIONS_COUNTER = Counter(
    "sovereign_sandbox_executions_total",
    "Total code sandbox execution attempts",
    ["status"],
)

SECURITY_EVENTS_COUNTER = Counter(
    "sovereign_security_events_total",
    "Security events detected by Sovereign Security Shield",
    ["event_type"],
)

DLP_VIOLATIONS_COUNTER = Counter(
    "sovereign_dlp_violations_total",
    "Data Loss Prevention violations redacted",
    ["rule"],
)

SYSTEM_CPU_GAUGE = Gauge(
    "sovereign_system_cpu_usage_percent",
    "Current host CPU utilization percentage",
)

SYSTEM_MEMORY_GAUGE = Gauge(
    "sovereign_system_memory_usage_bytes",
    "Current host RAM memory usage in bytes",
)


def update_system_telemetry() -> None:
    """Updates psutil system utilization gauges."""
    try:
        SYSTEM_CPU_GAUGE.set(psutil.cpu_percent(interval=None))
        mem = psutil.virtual_memory()
        SYSTEM_MEMORY_GAUGE.set(mem.used)
    except Exception:
        pass


def get_metrics_payload() -> Tuple[bytes, str]:
    """Scrapes all metrics and returns (metrics_bytes, content_type)."""
    update_system_telemetry()
    return generate_latest(), CONTENT_TYPE_LATEST

