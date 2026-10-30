import os

# 1. Update config.py
with open("backend/config.py", "r") as f:
    config_content = f.read()

if "LLM_MODE" not in config_content:
    config_content += """

# Gateway Configuration
LLM_MODE = os.getenv("LLM_MODE", "local")
CLOUD_ENABLED = os.getenv("CLOUD_ENABLED", "false").lower() == "true"

LOCAL_ROUTER_MODEL = os.getenv("LOCAL_ROUTER_MODEL", "qwen2.5:3b")
LOCAL_REASONING_MODEL = os.getenv("LOCAL_REASONING_MODEL", "qwen2.5:7b")
LOCAL_CODER_MODEL = os.getenv("LOCAL_CODER_MODEL", "qwen2.5-coder:7b")
LOCAL_EMBEDDING_MODEL = os.getenv("LOCAL_EMBEDDING_MODEL", "bge-m3:latest")
LOCAL_API_BASE = os.getenv("LOCAL_API_BASE", "http://localhost:11434")
"""
    with open("backend/config.py", "w") as f:
        f.write(config_content)

# 2. Create gateway.py
gateway_content = """import os
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
            response = requests.post(url, json=payload, stream=stream, timeout=60)
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
                user_prompt += f"{m['role']}: {m['content']}\\n"
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
"""
with open("backend/gateway.py", "w") as f:
    f.write(gateway_content)

# 3. Refactor llm_provider.py to use Gateway
llm_provider_content = """import json
from .gateway import gateway_instance
from .config import EMBEDDING_MODEL, GEMINI_MODEL

def get_embedding(text: str) -> list[float]:
    \"\"\"
    Maintains existing signature for vector_store.py/chat_pipeline.py.
    Routes through the gateway using the 'embedding' task.
    \"\"\"
    return gateway_instance.embed(text)

def generate_response(prompt: str, system_instruction: str = None, task: str = "reasoning") -> str:
    \"\"\"
    Maintains existing signature but routes through the gateway.
    Pass 'task' to allow the gateway to route to 3B, 7B, or Coder when in local mode.
    \"\"\"
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    
    return gateway_instance.generate(messages, task=task, stream=False)
"""
with open("backend/llm_provider.py", "w") as f:
    f.write(llm_provider_content)

# 4. Patch chat_pipeline.py to use task="routing"
with open("backend/chat_pipeline.py", "r") as f:
    chat_content = f.read()

chat_content = chat_content.replace(
    'response = generate_response(prompt, system_instruction="You are a strict JSON-only classifier.")',
    'response = generate_response(prompt, system_instruction="You are a strict JSON-only classifier.", task="routing")'
)

# 5. Make sure the coding intent is routed explicitly if needed (currently it just returns the plan).
# We can just leave the final_answer generation as reasoning (the default) unless intent == coding, but right now coding redirects.

with open("backend/chat_pipeline.py", "w") as f:
    f.write(chat_content)
