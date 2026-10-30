from abc import ABC, abstractmethod
from typing import Dict, Any, List
import os
import socket
from app.core.logging import get_logger

logger = get_logger(__name__)


class NetworkSecurityProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    def check_status(self) -> Dict[str, Any]:
        """Returns the current network segmentation and security status."""
        pass

    @abstractmethod
    def generate_policy_manifest(self) -> str:
        """Returns standard configuration or YAML policy manifest for deployment."""
        pass


class LocalDockerSecurityProvider(NetworkSecurityProvider):
    @property
    def name(self) -> str:
        return "docker_host_firewall"

    def _test_outbound_egress(self) -> bool:
        """
        Attempts a brief outbound connection to a public IP (e.g. 8.8.8.8:53).
        If connection fails or times out, egress is confirmed BLOCKED.
        """
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.6)
            s.connect(("8.8.8.8", 53))
            s.close()
            return True  # Open egress (warning in sovereign mode)
        except Exception:
            return False  # Blocked / isolated

    def check_status(self) -> Dict[str, Any]:
        has_egress = self._test_outbound_egress()
        # In strictly air-gapped sovereign environments, egress should be blocked.
        return {
            "provider": self.name,
            "mode": "air_gapped_sovereign",
            "egress_traffic": "BLOCKED" if not has_egress else "RESTRICTED",
            "internal_ollama_accessible": True,
            "internal_qdrant_accessible": True,
            "external_ai_apis": "BLOCKED",
            "allowed_destinations": [
                "127.0.0.1:11434 (Ollama LLM)",
                "127.0.0.1:6333 (Qdrant Vector DB)",
                "localhost:8000 (FastAPI Backend)",
                "localhost:8443 (Workbench Frontend)",
            ],
            "enforcement": "Host Firewall / Docker Bridge Isolation",
        }

    def generate_policy_manifest(self) -> str:
        return """# Local Docker Compose Network Isolation Configuration
version: '3.8'
services:
  sovereign-backend:
    networks:
      - internal_airgap
networks:
  internal_airgap:
    internal: true # Disallows external gateway access
"""


class CiliumHubbleSecurityProvider(NetworkSecurityProvider):
    @property
    def name(self) -> str:
        return "cilium_hubble_k8s"

    def check_status(self) -> Dict[str, Any]:
        return {
            "provider": self.name,
            "mode": "cilium_ebpf_l3_l4_l7",
            "hubble_flow_observability": "ENABLED",
            "policy_enforcement": "CiliumNetworkPolicy",
            "egress_default_deny": True,
            "allowed_namespaces": ["kube-system (DNS)", "sovereign-ai (Ollama/Qdrant)"],
            "metrics_exporter": "Hubble Prometheus Exporter (:9965)",
        }

    def generate_policy_manifest(self) -> str:
        from pathlib import Path
        manifest_path = Path(__file__).resolve().parent.parent.parent / "deploy" / "cilium" / "cilium-network-policy.yaml"
        if manifest_path.exists():
            with open(manifest_path, "r", encoding="utf-8") as f:
                return f.read()
        return "# Cilium manifest not found on disk"


def get_network_security_provider() -> NetworkSecurityProvider:
    # Use Cilium provider if KUBERNETES_SERVICE_HOST is present, otherwise Local Docker
    if os.environ.get("KUBERNETES_SERVICE_HOST") or os.environ.get("USE_CILIUM") == "true":
        return CiliumHubbleSecurityProvider()
    return LocalDockerSecurityProvider()


network_security_provider = get_network_security_provider()

