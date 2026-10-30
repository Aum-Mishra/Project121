"""Compatibility shim for the Coding Agent's LLM client.

The actual provider routing lives in :mod:`app.llm_provider` (Ollama in local
mode, Nebius Token Factory in cloud mode).  The public functions here are kept
unchanged so ``engine.py`` / ``supervisor.py`` did not need to change.
"""
from typing import Any, Optional

from app import llm_provider
from app.llm_provider import ModelUnavailableError  # re-exported

__all__ = [
    "ModelUnavailableError",
    "list_models",
    "model_is_ready",
    "generate",
    "agenerate",
]


def list_models() -> list:
    return llm_provider.list_models()


def model_is_ready(model: str) -> bool:
    return model in list_models()


def generate(
    model: str,
    prompt: str,
    system: Optional[str] = None,
    format_json: bool = False,
    options: Optional[dict] = None,
    timeout_s: int = 240,
) -> str:
    return llm_provider.generate(
        model,
        prompt,
        system=system,
        format_json=format_json,
        options=options,
        timeout_s=timeout_s,
    )


async def agenerate(
    model: str,
    prompt: str,
    system: Optional[str] = None,
    format_json: bool = False,
    options: Optional[dict] = None,
    timeout_s: int = 60,
) -> str:
    import asyncio
    return await asyncio.to_thread(
        generate, model, prompt, system, format_json, options, timeout_s
    )
