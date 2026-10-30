import json
from .gateway import gateway_instance
from .config import EMBEDDING_MODEL, GEMINI_MODEL

def get_embedding(text: str) -> list[float]:
    """
    Maintains existing signature for vector_store.py/chat_pipeline.py.
    Routes through the gateway using the 'embedding' task.
    """
    return gateway_instance.embed(text)

def generate_response(prompt: str, system_instruction: str = None, task: str = "reasoning") -> str:
    """
    Maintains existing signature but routes through the gateway.
    Pass 'task' to allow the gateway to route to 3B, 7B, or Coder when in local mode.
    """
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    
    return gateway_instance.generate(messages, task=task, stream=False)
