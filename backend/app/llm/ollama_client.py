import asyncio
import httpx
from typing import List, Dict, Any, Optional, AsyncGenerator
from app.core.config import settings
from app.core.logging import get_logger
from app.core.exceptions import OllamaConnectionError, ModelUnavailableError

logger = get_logger(__name__)


class OllamaClient:
    def __init__(self, base_url: str = None):
        self.base_url = base_url or settings.ollama_base_url
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0))

    async def close(self):
        await self.client.aclose()

    async def list_models(self) -> List[Dict[str, Any]]:
        try:
            resp = await self.client.get(f"{self.base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            return data.get("models", [])
        except httpx.ConnectError as e:
            logger.error("ollama_connection_failed", error=str(e))
            raise OllamaConnectionError({"error": str(e)})
        except Exception as e:
            logger.error("ollama_list_models_failed", error=str(e))
            raise

    async def is_model_available(self, model_name: str) -> bool:
        models = await self.list_models()
        return any(m.get("name") == model_name for m in models)

    async def generate(
        self,
        model: str,
        prompt: str,
        system: str = None,
        template: str = None,
        context: List[int] = None,
        stream: bool = False,
        options: Dict[str, Any] = None,
        format: str = None,
    ) -> Dict[str, Any] | AsyncGenerator[Dict[str, Any], None]:
        if not await self.is_model_available(model):
            raise ModelUnavailableError(model)

        payload = {
            "model": model,
            "prompt": prompt,
            "stream": stream,
        }
        if system:
            payload["system"] = system
        if template:
            payload["template"] = template
        if context:
            payload["context"] = context
        if options:
            payload["options"] = options
        if format:
            payload["format"] = format

        try:
            if stream:
                return self._stream_generate(payload)
            else:
                resp = await self.client.post(f"{self.base_url}/api/generate", json=payload)
                resp.raise_for_status()
                return resp.json()
        except httpx.ConnectError as e:
            logger.error("ollama_connection_failed", error=str(e))
            raise OllamaConnectionError({"error": str(e)})
        except Exception as e:
            logger.error("ollama_generate_failed", model=model, error=str(e))
            raise

    async def _stream_generate(self, payload: Dict[str, Any]) -> AsyncGenerator[Dict[str, Any], None]:
        async with self.client.stream("POST", f"{self.base_url}/api/generate", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.strip():
                    import json
                    yield json.loads(line)

    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        stream: bool = False,
        options: Dict[str, Any] = None,
        format: str = None,
    ) -> Dict[str, Any] | AsyncGenerator[Dict[str, Any], None]:
        if not await self.is_model_available(model):
            raise ModelUnavailableError(model)

        payload = {
            "model": model,
            "messages": messages,
            "stream": stream,
        }
        if options:
            payload["options"] = options
        if format:
            payload["format"] = format

        try:
            if stream:
                return self._stream_chat(payload)
            else:
                resp = await self.client.post(f"{self.base_url}/api/chat", json=payload)
                resp.raise_for_status()
                return resp.json()
        except httpx.ConnectError as e:
            logger.error("ollama_connection_failed", error=str(e))
            raise OllamaConnectionError({"error": str(e)})
        except Exception as e:
            logger.error("ollama_chat_failed", model=model, error=str(e))
            raise

    async def _stream_chat(self, payload: Dict[str, Any]) -> AsyncGenerator[Dict[str, Any], None]:
        async with self.client.stream("POST", f"{self.base_url}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.strip():
                    import json
                    yield json.loads(line)

    async def embeddings(self, model: str, prompt: str) -> List[float]:
        if not await self.is_model_available(model):
            raise ModelUnavailableError(model)

        try:
            resp = await self.client.post(
                f"{self.base_url}/api/embeddings",
                json={"model": model, "prompt": prompt},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("embedding", [])
        except httpx.ConnectError as e:
            logger.error("ollama_connection_failed", error=str(e))
            raise OllamaConnectionError({"error": str(e)})
        except Exception as e:
            logger.error("ollama_embeddings_failed", model=model, error=str(e))
            raise

    async def pull_model(self, model: str) -> AsyncGenerator[Dict[str, Any], None]:
        async with self.client.stream("POST", f"{self.base_url}/api/pull", json={"name": model}) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.strip():
                    import json
                    yield json.loads(line)


ollama_client = OllamaClient()