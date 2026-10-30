"""Backward-compatible gateway facade.

Historically this module contained the Ollama/Gemini provider implementations.
Provider selection and all network calls now live in :mod:`backend.ai_provider`
so that every AI feature (chat, RAG, agents, document generation, coding)
shares one routing layer.  The public ``gateway_instance`` API is unchanged.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from . import ai_provider
from .config import APP_MODE


class LLMGateway:
    """Thin facade over :mod:`backend.ai_provider` (kept for compatibility)."""

    def __init__(self) -> None:
        self.mode = APP_MODE

    # -- introspection -------------------------------------------------------
    @property
    def provider(self) -> str:
        return ai_provider.PROVIDER

    def status(self) -> Dict[str, Any]:
        return ai_provider.status()

    def _get_model_for_task(self, task: str) -> str:
        return ai_provider.model_for_task(task)

    # -- inference -----------------------------------------------------------
    def generate(
        self,
        messages: List[Dict[str, str]],
        task: str = "reasoning",
        stream: bool = False,
        temperature: float = 0.7,
        model_override: Optional[str] = None,
        json_mode: bool = False,
    ) -> Any:
        return ai_provider.generate(
            messages,
            task=task,
            stream=stream,
            temperature=temperature,
            model_override=model_override,
            json_mode=json_mode,
        )

    def embed(self, text: str, model_override: Optional[str] = None) -> List[float]:
        return ai_provider.embed(text, model_override=model_override)


gateway_instance = LLMGateway()
