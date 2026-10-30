"""Centralized AI provider router.

Every AI call in the Knovia workbench goes through this module.  The active
provider is chosen once from ``APP_MODE``:

* ``APP_MODE=local``  -> Ollama (installed local models only)
* ``APP_MODE=cloud``  -> Nebius Token Factory, OpenAI-compatible API, serving
                         NVIDIA Nemotron models

There is deliberately **no cross-provider fallback**: cloud mode never talks to
Ollama, and local mode never calls the cloud API.  Failures are surfaced as
``ProviderUnavailable`` so callers can degrade to deterministic / lexical
behaviour without silently switching models.
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, Iterator, List, Optional

import requests

from .config import (
    APP_MODE,
    LOCAL_API_BASE,
    LOCAL_ROUTER_MODEL,
    LOCAL_REASONING_MODEL,
    LOCAL_CODER_MODEL,
    LOCAL_EMBEDDING_MODEL,
    NEBIUS_API_KEY,
    NEBIUS_BASE_URL,
    NEBIUS_MODEL,
    NEBIUS_ROUTER_MODEL,
    NEBIUS_CODER_MODEL,
    NEBIUS_EMBEDDING_MODEL,
    NEBIUS_TIMEOUT,
)


# ── Mode + identity ──────────────────────────────────────────────────────────

MODE = (APP_MODE or "local").strip().lower()
if MODE not in ("local", "cloud"):
    MODE = "local"

PROVIDER = "nebius" if MODE == "cloud" else "ollama"
PROVIDER_LABEL = (
    "Nebius Token Factory (NVIDIA Nemotron)" if MODE == "cloud" else "Ollama (Local)"
)


def _log(msg: str) -> None:
    print(f"[ai-provider:{PROVIDER}] {msg}", flush=True)


class ProviderError(RuntimeError):
    """Base class for provider failures."""


class ProviderUnavailable(ProviderError):
    """Raised when the configured provider cannot serve the request."""


# ── Providers ────────────────────────────────────────────────────────────────


class OllamaProvider:
    name = "ollama"

    def __init__(self, base_url: str = LOCAL_API_BASE):
        self.base_url = (base_url or "http://localhost:11434").rstrip("/")

    def generate(
        self,
        messages: List[Dict[str, str]],
        model: str,
        stream: bool = False,
        temperature: float = 0.7,
        json_mode: bool = False,
        timeout: int = 600,
    ) -> Any:
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": stream,
            "options": {"temperature": temperature},
        }
        if json_mode:
            payload["format"] = "json"
        try:
            response = requests.post(
                f"{self.base_url}/api/chat", json=payload, stream=stream, timeout=timeout
            )
            response.raise_for_status()
        except Exception as e:  # noqa: BLE001
            raise ProviderUnavailable(f"Ollama model {model} failed: {e}") from e

        if stream:
            def _iter() -> Iterator[str]:
                for line in response.iter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line.decode("utf-8"))
                    except Exception:  # noqa: BLE001
                        continue
                    content = (data.get("message") or {}).get("content")
                    if content:
                        yield content
            return _iter()

        try:
            return response.json().get("message", {}).get("content", "")
        except Exception as e:  # noqa: BLE001
            raise ProviderUnavailable(f"Bad Ollama response for {model}: {e}") from e

    def embed(self, text: str, model: str, timeout: int = 60) -> List[float]:
        # Ollama >= 0.2 exposes /api/embed; /api/embeddings is the legacy
        # single-prompt endpoint. Try the modern one first so embeddings keep
        # working across Ollama versions.
        try:
            response = requests.post(
                f"{self.base_url}/api/embed",
                json={"model": model, "input": text},
                timeout=timeout,
            )
            if response.status_code == 404:
                response = requests.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": model, "prompt": text},
                    timeout=timeout,
                )
            response.raise_for_status()
            data = response.json()
            if data.get("embeddings"):
                return data["embeddings"][0]
            return data.get("embedding", [])
        except Exception as e:  # noqa: BLE001
            raise ProviderUnavailable(f"Ollama embedding {model} failed: {e}") from e

    def list_models(self, timeout: int = 5) -> List[str]:
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=timeout)
            response.raise_for_status()
            return [m.get("name", "") for m in response.json().get("models", [])]
        except Exception as e:  # noqa: BLE001
            raise ProviderUnavailable(f"Cannot reach Ollama at {self.base_url}: {e}") from e


class NebiusProvider:
    """Nebius Token Factory — OpenAI-compatible chat completions.

    Configured exclusively through environment variables:
      NEBIUS_API_KEY, NEBIUS_BASE_URL, NEBIUS_MODEL,
      NEBIUS_ROUTER_MODEL, NEBIUS_CODER_MODEL, NEBIUS_EMBEDDING_MODEL,
      NEBIUS_TIMEOUT
    """

    name = "nebius"

    def __init__(
        self,
        api_key: str = NEBIUS_API_KEY,
        base_url: str = NEBIUS_BASE_URL,
        timeout: int = NEBIUS_TIMEOUT,
    ):
        self.api_key = api_key or ""
        self.base_url = (base_url or "https://api.tokenfactory.us-central1.nebius.com/v1").rstrip("/")
        self.timeout = timeout

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _require_key(self) -> None:
        if not self.api_key:
            raise ProviderUnavailable(
                "NEBIUS_API_KEY is not set — cloud mode requires a Nebius Token "
                "Factory key. No local/Ollama fallback is used in cloud mode."
            )

    def generate(
        self,
        messages: List[Dict[str, str]],
        model: str,
        stream: bool = False,
        temperature: float = 0.7,
        json_mode: bool = False,
        timeout: Optional[int] = None,
    ) -> Any:
        self._require_key()
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": stream,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=self._headers(),
                stream=stream,
                timeout=timeout or self.timeout,
            )
            if (
                response.status_code in (400, 422)
                and "response_format" in payload
            ):
                # Some deployments do not support structured-output parameters.
                # The prompt already asks for strict JSON, so retry once without
                # it rather than failing the request outright.
                _log("structured output rejected; retrying without response_format")
                payload.pop("response_format", None)
                response = requests.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=self._headers(),
                    stream=stream,
                    timeout=timeout or self.timeout,
                )
            response.raise_for_status()
        except Exception as e:  # noqa: BLE001
            raise ProviderUnavailable(f"Nebius model {model} failed: {e}") from e

        if stream:
            def _iter() -> Iterator[str]:
                for line in response.iter_lines():
                    if not line:
                        continue
                    text = line.decode("utf-8").strip()
                    if not text.startswith("data:"):
                        continue
                    chunk = text[len("data:"):].strip()
                    if chunk == "[DONE]":
                        break
                    try:
                        data = json.loads(chunk)
                    except Exception:  # noqa: BLE001
                        continue
                    for choice in data.get("choices", []):
                        content = (choice.get("delta") or {}).get("content")
                        if content:
                            yield content
            return _iter()

        try:
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:  # noqa: BLE001
            raise ProviderUnavailable(f"Bad Nebius response for {model}: {e}") from e

    def embed(self, text: str, model: str, timeout: Optional[int] = None) -> List[float]:
        self._require_key()
        if not model:
            raise ProviderUnavailable(
                "NEBIUS_EMBEDDING_MODEL is not configured; cloud mode does not "
                "use local embeddings. Retrieval will use lexical search."
            )
        try:
            response = requests.post(
                f"{self.base_url}/embeddings",
                json={"model": model, "input": text},
                headers=self._headers(),
                timeout=timeout or 60,
            )
            response.raise_for_status()
            return response.json()["data"][0]["embedding"]
        except Exception as e:  # noqa: BLE001
            raise ProviderUnavailable(f"Nebius embedding {model} failed: {e}") from e

    def list_models(self, timeout: int = 10) -> List[str]:
        self._require_key()
        try:
            response = requests.get(
                f"{self.base_url}/models", headers=self._headers(), timeout=timeout
            )
            response.raise_for_status()
            return [m.get("id", "") for m in response.json().get("data", [])]
        except Exception as e:  # noqa: BLE001
            raise ProviderUnavailable(f"Cannot list Nebius models: {e}") from e


_PROVIDER: Any = NebiusProvider() if MODE == "cloud" else OllamaProvider()


def _provider() -> Any:
    return _PROVIDER


# ── Model selection ──────────────────────────────────────────────────────────

_TASK_MODELS_LOCAL = {
    "routing": LOCAL_ROUTER_MODEL,
    "coding": LOCAL_CODER_MODEL,
    "coding_repair": LOCAL_CODER_MODEL,
    "embedding": LOCAL_EMBEDDING_MODEL,
    "reasoning": LOCAL_REASONING_MODEL,
}

_TASK_MODELS_CLOUD = {
    "routing": NEBIUS_ROUTER_MODEL or NEBIUS_MODEL,
    "coding": NEBIUS_CODER_MODEL or NEBIUS_MODEL,
    "coding_repair": NEBIUS_CODER_MODEL or NEBIUS_MODEL,
    "embedding": NEBIUS_EMBEDDING_MODEL,
    "reasoning": NEBIUS_MODEL,
}


def model_for_task(task: str = "reasoning") -> str:
    table = _TASK_MODELS_CLOUD if MODE == "cloud" else _TASK_MODELS_LOCAL
    if task == "embedding":
        # Never substitute a chat model for embeddings.
        return table.get("embedding") or ""
    return table.get(task) or table.get("reasoning") or ""


def _is_local_model_id(model: str) -> bool:
    """Ollama tags look like ``qwen2.5:7b`` / ``bge-m3:latest`` (colon, no slash
    namespace), while Nebius ids are ``nvidia/nemotron-...``.  In cloud mode we
    never allow a local tag to leak through as the model name."""
    m = (model or "").strip()
    if not m:
        return False
    if ":" in m:
        return True
    return m in set(_TASK_MODELS_LOCAL.values())


def _is_cloud_model_id(model: str) -> bool:
    """True for provider-namespaced ids such as ``nvidia/nemotron-...``.

    Used in local mode so a client that sends a cloud model id (for example to
    the OpenAI-compatible ``/v1/chat/completions`` endpoint) is transparently
    served by the configured local model instead of failing.
    """
    m = (model or "").strip()
    return bool(m) and "/" in m and ":" not in m


def resolve_model(task: str = "reasoning", model_override: Optional[str] = None) -> str:
    if MODE == "cloud":
        if model_override and not _is_local_model_id(model_override):
            return model_override
        return model_for_task(task)
    if model_override and not _is_cloud_model_id(model_override):
        return model_override
    return model_for_task(task)


_EMBED_AVAIL_CACHE: Dict[str, Any] = {"at": 0.0, "ok": None}


def _local_embedding_installed() -> bool:
    """Cheap (30 s cached) check that the local embedding model is installed.

    Avoids probing embeddings for every startup ingest when the model is
    missing, while still recovering automatically once it is pulled.
    """
    now = time.monotonic()
    if _EMBED_AVAIL_CACHE["ok"] is not None and now - _EMBED_AVAIL_CACHE["at"] < 30:
        return bool(_EMBED_AVAIL_CACHE["ok"])
    model = model_for_task("embedding")
    try:
        installed = _provider().list_models()
        base = model.split(":")[0]
        ok = bool(model) and any(
            name == model or name.split(":")[0] == base for name in installed
        )
    except Exception:  # noqa: BLE001
        ok = False
    _EMBED_AVAIL_CACHE.update({"at": now, "ok": ok})
    return ok


def embeddings_available() -> bool:
    if MODE == "cloud":
        return bool(NEBIUS_API_KEY and NEBIUS_EMBEDDING_MODEL)
    return _local_embedding_installed()


# ── Public API ───────────────────────────────────────────────────────────────


def generate(
    messages: List[Dict[str, str]],
    task: str = "reasoning",
    stream: bool = False,
    temperature: float = 0.7,
    model_override: Optional[str] = None,
    json_mode: bool = False,
) -> Any:
    model = resolve_model(task, model_override)
    started = time.monotonic()
    _log(f"generate task={task} model={model} stream={stream} json={json_mode}")
    try:
        result = _provider().generate(
            messages, model, stream=stream, temperature=temperature, json_mode=json_mode
        )
    except ProviderUnavailable as e:
        _log(f"FAILED task={task} model={model} in {(time.monotonic()-started):.2f}s: {e}")
        raise
    except Exception as e:  # noqa: BLE001
        _log(f"FAILED task={task} model={model} in {(time.monotonic()-started):.2f}s: {e}")
        raise ProviderUnavailable(f"{PROVIDER} model {model} failed: {e}") from e
    _log(f"OK task={task} model={model} in {(time.monotonic()-started):.2f}s")
    return result


def embed(text: str, model_override: Optional[str] = None) -> List[float]:
    model = resolve_model("embedding", model_override)
    started = time.monotonic()
    try:
        vector = _provider().embed(text, model)
    except ProviderUnavailable as e:
        _log(f"EMBED FAILED model={model or '(none)'} in {(time.monotonic()-started):.2f}s: {e}")
        raise
    _log(f"EMBED OK model={model} dim={len(vector)} in {(time.monotonic()-started):.2f}s")
    return vector


def list_models() -> List[str]:
    return _provider().list_models()


def status() -> Dict[str, Any]:
    """Machine-readable description of the active routing (safe to expose)."""
    return {
        "mode": MODE,
        "provider": PROVIDER,
        "provider_label": PROVIDER_LABEL,
        "model": model_for_task("reasoning"),
        "router_model": model_for_task("routing"),
        "coding_model": model_for_task("coding"),
        "embedding_model": model_for_task("embedding"),
        "embeddings_available": embeddings_available(),
        "api_key_configured": bool(NEBIUS_API_KEY) if MODE == "cloud" else True,
        "base_url": NEBIUS_BASE_URL if MODE == "cloud" else LOCAL_API_BASE,
    }


def selftest(prompt: str = "Reply with the single word: OK") -> Dict[str, Any]:
    """Perform a real inference call and report the provider/model used."""
    model = model_for_task("reasoning")
    started = time.monotonic()
    try:
        sample = generate(
            [{"role": "user", "content": prompt}],
            task="reasoning",
            stream=False,
            temperature=0.0,
        )
        return {
            "ok": True,
            "provider": PROVIDER,
            "provider_label": PROVIDER_LABEL,
            "model": model,
            "latency_ms": round((time.monotonic() - started) * 1000, 1),
            "sample": str(sample)[:200],
        }
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "provider": PROVIDER,
            "provider_label": PROVIDER_LABEL,
            "model": model,
            "latency_ms": round((time.monotonic() - started) * 1000, 1),
            "error": str(e),
        }
