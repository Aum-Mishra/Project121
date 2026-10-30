import os
import requests

# Switchable LLM Provider Abstraction
# Currently set to 'local'. Can be switched to 'api' later.
LLM_MODE = os.environ.get("LLM_MODE", "local")

def _generate_local(prompt: str, system_instruction: str = "") -> str:
    """Local provider implementation using Ollama"""
    payload = {
        "model": "qwen2.5:7b",
        "prompt": f"{system_instruction}\n\n{prompt}",
        "stream": False,
        "options": {"temperature": 0.1}
    }
    try:
        response = requests.post("http://localhost:11434/api/generate", json=payload, timeout=60)
        response.raise_for_status()
        return response.json().get("response", "")
    except Exception as e:
        return f"Local LLM Error: {e}"

def _generate_api(prompt: str, system_instruction: str = "") -> str:
    """Cloud API provider implementation"""
    # API key remains server-side.
    api_key = os.environ.get("CLOUD_API_KEY", "")
    # ... implementation for cloud API ...
    return "Cloud API response (Not yet configured)"

def generate_response(prompt: str, system_instruction: str = "", task: str = "general") -> str:
    """
    Main interface for the frontend to call.
    Abstracts away the underlying provider.
    """
    if LLM_MODE == "local":
        return _generate_local(prompt, system_instruction)
    elif LLM_MODE == "api":
        return _generate_api(prompt, system_instruction)
    else:
        raise ValueError(f"Unknown LLM_MODE: {LLM_MODE}")
