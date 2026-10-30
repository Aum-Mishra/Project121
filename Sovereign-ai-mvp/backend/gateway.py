import os
import json
import requests
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Generator, Optional
from .config import (
    LLM_MODE, CLOUD_ENABLED, LOCAL_API_BASE,
    LOCAL_ROUTER_MODEL, LOCAL_REASONING_MODEL, LOCAL_CODER_MODEL, LOCAL_EMBEDDING_MODEL,
    GEMINI_API_KEY, GEMINI_MODEL, EMBEDDING_MODEL
)

class ProviderInterface(ABC):
    @abstractmethod
    def generate(self, messages: List[Dict[str, str]], model: str, stream: bool = False, temperature: float = 0.7) -> Any:
        pass

    @abstractmethod
    def embed(self, text: str, model: str) -> List[float]:
        pass

class LocalProvider(ProviderInterface):
    def __init__(self):
        self.base_url = LOCAL_API_BASE

    def generate(self, messages: List[Dict[str, str]], model: str, stream: bool = False, temperature: float = 0.7) -> Any:
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": stream,
            "options": {"temperature": temperature}
        }
        
        try:
            response = requests.post(url, json=payload, stream=stream, timeout=300)
            response.raise_for_status()
            
            if stream:
                def generate_stream():
                    for line in response.iter_lines():
                        if line:
                            data = json.loads(line.decode('utf-8'))
                            if "message" in data and "content" in data["message"]:
                                yield data["message"]["content"]
                return generate_stream()
            else:
                return response.json().get("message", {}).get("content", "")
        except Exception as e:
            print(f"LocalProvider Error: {e}")
            raise Exception(f"Local model {model} failed: {e}")

    def embed(self, text: str, model: str) -> List[float]:
        url = f"{self.base_url}/api/embeddings"
        payload = {"model": model, "prompt": text}
        try:
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            return response.json().get("embedding", [])
        except Exception as e:
            print(f"LocalProvider Embedding Error: {e}")
            raise Exception(f"Local embedding {model} failed: {e}")

class CloudProvider(ProviderInterface):
    def __init__(self):
        if not GEMINI_API_KEY:
            raise Exception("GEMINI_API_KEY is not set but cloud mode is requested.")
        from google import genai
        from google.genai import types
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        self.types = types

    def _convert_messages(self, messages: List[Dict[str, str]]) -> str:
        # Simplified conversion for Gemini
        system_instruction = None
        user_prompt = ""
        for m in messages:
            if m["role"] == "system":
                system_instruction = m["content"]
            else:
                user_prompt += f"{m['role']}: {m['content']}\n"
        return system_instruction, user_prompt

    def generate(self, messages: List[Dict[str, str]], model: str, stream: bool = False, temperature: float = 0.7) -> Any:
        sys_inst, prompt = self._convert_messages(messages)
        config = self.types.GenerateContentConfig(
            system_instruction=sys_inst,
            temperature=temperature,
        )
        try:
            if stream:
                response = self.client.models.generate_content_stream(model=model, contents=prompt, config=config)
                def generate_stream():
                    for chunk in response:
                        yield chunk.text
                return generate_stream()
            else:
                response = self.client.models.generate_content(model=model, contents=prompt, config=config)
                return response.text
        except Exception as e:
            print(f"CloudProvider Error: {e}")
            raise Exception(f"Cloud model {model} failed: {e}")

    def embed(self, text: str, model: str) -> List[float]:
        config = self.types.EmbedContentConfig(output_dimensionality=768)
        try:
            result = self.client.models.embed_content(model=model, contents=text, config=config)
            return result.embeddings[0].values
        except Exception as e:
            print(f"CloudProvider Embedding Error: {e}")
            raise Exception(f"Cloud embedding {model} failed: {e}")

class LLMGateway:
    def __init__(self):
        self.mode = LLM_MODE.lower()
        if self.mode == "cloud" and not CLOUD_ENABLED:
            print("Warning: Cloud mode requested but CLOUD_ENABLED=false. Falling back to local.")
            self.mode = "local"
            
        self.local_provider = LocalProvider()
        self.cloud_provider = CloudProvider() if self.mode == "cloud" else None
        
    def _get_provider(self) -> ProviderInterface:
        return self.cloud_provider if self.mode == "cloud" else self.local_provider

    def _get_model_for_task(self, task: str) -> str:
        if self.mode == "cloud":
            if task == "embedding":
                return EMBEDDING_MODEL
            return GEMINI_MODEL
            
        # Local routing logic
        if task == "routing":
            return LOCAL_ROUTER_MODEL
        elif task == "coding":
            return LOCAL_CODER_MODEL
        elif task == "embedding":
            return LOCAL_EMBEDDING_MODEL
        else:
            return LOCAL_REASONING_MODEL # default reasoning

    def generate(self, messages: List[Dict[str, str]], task: str = "reasoning", stream: bool = False, temperature: float = 0.7, model_override: str = None) -> Any:
        provider = self._get_provider()
        model = model_override or self._get_model_for_task(task)
        return provider.generate(messages, model, stream, temperature)

    def embed(self, text: str, model_override: str = None) -> List[float]:
        provider = self._get_provider()
        model = model_override or self._get_model_for_task("embedding")
        return provider.embed(text, model)

gateway_instance = LLMGateway()
