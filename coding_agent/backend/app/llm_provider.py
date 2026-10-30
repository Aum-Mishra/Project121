"""Centralized AI provider for the isolated Coding Agent.

Mirrors the workbench router so the coding agent uses the same deployment mode:

* ``APP_MODE=local``  -> Ollama (``settings.ollama_base_url`` + ``coding_model``)
* ``APP_MODE=cloud``  -> Nebius Token Factory (NVIDIA Nemotron), OpenAI-compatible

No cross-provider fallback: cloud mode never calls Ollama.
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

import requests

from app.config import settings


class ModelUnavailableError(RuntimeError):
    pass


def mode() -> str:
    m = (settings.app_mode or "local").strip().lower()
    return m if m in ("local", "cloud") else "local"


def provider_name() -> str:
    return "nebius" if mode() == "cloud" else "ollama"


def provider_label() -> str:
    return (
        "Nebius Token Factory (NVIDIA Nemotron)"
        if mode() == "cloud"
        else "Ollama (Local)"
    )


def active_model(model: Optional[str] = None) -> str:
    if mode() == "cloud":
        # Ignore Ollama-style tags; always resolve to a Nebius model id.
        if model and (":" not in model) and not model.startswith(("qwen", "bge")):
            return model
        return settings.nebius_coder_model or settings.nebius_model
    return model or settings.coding_model


def _log(msg: str) -> None:
    print(f"[coding-agent:{provider_name()}] {msg}", flush=True)


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.nebius_api_key}",
        "Content-Type": "application/json",
    }


def _nebius_generate(
    model: str,
    prompt: str,
    system: Optional[str],
    format_json: bool,
    temperature: float,
    timeout_s: int,
) -> str:
    if not settings.nebius_api_key:
        raise ModelUnavailableError(
            "NEBIUS_API_KEY is not set — cloud mode requires a Nebius Token "
            "Factory key. No Ollama fallback is used in cloud mode."
        )
    messages: List[Dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    if format_json:
        payload["response_format"] = {"type": "json_object"}
    try:
        r = requests.post(
            settings.nebius_base_url.rstrip("/") + "/chat/completions",
            json=payload,
            headers=_headers(),
            timeout=timeout_s or settings.nebius_timeout_s,
        )
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"] or ""
    except Exception as e:  # noqa: BLE001
        raise ModelUnavailableError(f"Nebius model {model} failed: {e}") from e


def _ollama_generate(
    model: str,
    prompt: str,
    system: Optional[str],
    format_json: bool,
    temperature: float,
    timeout_s: int,
) -> str:
    payload: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature},
    }
    if system:
        payload["system"] = system
    if format_json:
        payload["format"] = "json"
    try:
        r = requests.post(
            settings.ollama_base_url.rstrip("/") + "/api/generate",
            json=payload,
            timeout=timeout_s,
        )
        r.raise_for_status()
        return r.json().get("response", "") or ""
    except Exception as e:  # noqa: BLE001
        raise ModelUnavailableError(f"Ollama model {model} failed: {e}") from e


def generate(
    model: str,
    prompt: str,
    system: Optional[str] = None,
    format_json: bool = False,
    options: Optional[dict] = None,
    timeout_s: int = 240,
) -> str:
    resolved = active_model(model)
    temperature = float((options or {}).get("temperature", 0.2))
    started = time.monotonic()
    _log(f"generate model={resolved} json={format_json}")
    try:
        if mode() == "cloud":
            out = _nebius_generate(resolved, prompt, system, format_json, temperature, timeout_s)
        else:
            out = _ollama_generate(resolved, prompt, system, format_json, temperature, timeout_s)
    except ModelUnavailableError as e:
        _log(f"FAILED model={resolved} in {(time.monotonic()-started):.2f}s: {e}")
        raise
    _log(f"OK model={resolved} in {(time.monotonic()-started):.2f}s chars={len(out)}")
    return out


def list_models() -> list:
    if mode() == "cloud":
        if not settings.nebius_api_key:
            raise ModelUnavailableError(
                "NEBIUS_API_KEY is not set (cloud mode)."
            )
        try:
            r = requests.get(
                settings.nebius_base_url.rstrip("/") + "/models",
                headers=_headers(),
                timeout=10,
            )
            r.raise_for_status()
            return [m.get("id", "") for m in r.json().get("data", [])]
        except Exception as e:  # noqa: BLE001
            raise ModelUnavailableError(f"Cannot list Nebius models: {e}") from e

    try:
        r = requests.get(settings.ollama_base_url.rstrip("/") + "/api/tags", timeout=5)
        r.raise_for_status()
        return [m["name"] for m in r.json().get("models", [])]
    except Exception as e:  # noqa: BLE001
        raise ModelUnavailableError(
            f"Cannot reach Ollama at {settings.ollama_base_url}: {e}"
        ) from e


def status() -> Dict[str, Any]:
    return {
        "mode": mode(),
        "provider": provider_name(),
        "provider_label": provider_label(),
        "model": active_model(),
        "base_url": settings.nebius_base_url if mode() == "cloud" else settings.ollama_base_url,
        "api_key_configured": bool(settings.nebius_api_key) if mode() == "cloud" else True,
    }
