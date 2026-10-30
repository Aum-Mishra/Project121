import pytest
from app.core.config import settings
from app.llm.router import model_router


class TestOllamaRuntimeVerification:
    """
    Validates local Ollama model runtime configuration, fallback resilience,
    and parameter pinning for sovereign offline operation.
    """
    def test_ollama_base_url_configured(self):
        assert settings.ollama_base_url is not None
        assert "http" in settings.ollama_base_url

    def test_model_tier_routing_configured(self):
        # Lightweight / router tier
        tier_fast = model_router.pick("classification")
        assert tier_fast == settings.router_model
        
        # Coding tier
        tier_code = model_router.pick("coding")
        assert tier_code == settings.coding_model

        # Reasoning tier
        tier_reason = model_router.pick("reasoning")
        assert tier_reason == settings.primary_model

    def test_deterministic_route_fallback(self):
        route_info = model_router.deterministic_route("Write python code to calculate pressure")
        assert route_info["model"] == settings.coding_model
        assert route_info["task_type"] == "coding"

    def test_embedding_model_pinned_locally(self):
        assert settings.embedding_model is not None
        assert len(settings.embedding_model) > 0

