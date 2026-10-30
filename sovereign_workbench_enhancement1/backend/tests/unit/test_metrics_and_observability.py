import pytest
from app.core.metrics import get_metrics_payload, AGENT_RUNS_COUNTER, SECURITY_EVENTS_COUNTER
from app.core.network_security import get_network_security_provider, LocalDockerSecurityProvider, CiliumHubbleSecurityProvider


class TestMetricsAndObservability:
    def test_prometheus_metrics_scrape(self):
        # Increment test metrics
        AGENT_RUNS_COUNTER.labels(status="completed").inc()
        SECURITY_EVENTS_COUNTER.labels(event_type="PROMPT_INJECTION_BLOCKED").inc()

        payload, content_type = get_metrics_payload()
        assert isinstance(payload, bytes)
        assert "text/plain" in content_type or "version=0.0.4" in content_type

        text_repr = payload.decode("utf-8")
        assert "sovereign_agent_runs_total" in text_repr
        assert "sovereign_security_events_total" in text_repr
        assert "sovereign_system_cpu_usage_percent" in text_repr
        assert "sovereign_system_memory_usage_bytes" in text_repr

    def test_local_docker_network_security_provider(self):
        provider = LocalDockerSecurityProvider()
        status = provider.check_status()
        assert status["provider"] == "docker_host_firewall"
        assert status["mode"] == "air_gapped_sovereign"
        assert "egress_traffic" in status
        assert status["external_ai_apis"] == "BLOCKED"
        assert len(status["allowed_destinations"]) >= 2

        manifest = provider.generate_policy_manifest()
        assert "internal: true" in manifest or "networks:" in manifest

    def test_cilium_hubble_network_security_provider(self):
        provider = CiliumHubbleSecurityProvider()
        status = provider.check_status()
        assert status["provider"] == "cilium_hubble_k8s"
        assert status["policy_enforcement"] == "CiliumNetworkPolicy"
        assert status["egress_default_deny"] is True

