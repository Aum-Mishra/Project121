import json
from typing import Literal, Dict, Any
from app.llm.ollama_client import ollama_client
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

TaskType = Literal["reasoning", "coding", "classification", "embedding", "general"]


class ModelRouter:
    def __init__(self):
        self.router_model = settings.router_model
        self.primary_model = settings.primary_model
        self.coding_model = settings.coding_model
        self.fallback_model = settings.primary_model

    ROUTER_SYSTEM_PROMPT = """You are a model router for an industrial AI workbench.
Your task is to classify the user's request and select the appropriate model.

Available models:
- qwen2.5:7b (reasoning) - General reasoning, document analysis, technical questions, summarization
- qwen2.5-coder:7b (coding) - Code generation, debugging, calculations, Python scripts
- qwen2.5:3b (router) - Classification, routing, lightweight tasks
- bge-m3 (embedding) - Embeddings only, not for chat

Respond with ONLY a JSON object:
{
  "task_type": "reasoning|coding|classification|embedding|general",
  "model": "model_name",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}"""

    ROUTER_EXAMPLES = [
        {"input": "What is the maximum operating pressure for P-102?", "output": {"task_type": "reasoning", "model": "qwen2.5:7b", "confidence": 0.95, "reason": "Technical question requiring document retrieval and reasoning"}},
        {"input": "Write Python code to calculate pressure deviation", "output": {"task_type": "coding", "model": "qwen2.5-coder:7b", "confidence": 0.98, "reason": "Code generation task"}},
        {"input": "Classify this document as SOP or Manual", "output": {"task_type": "classification", "model": "qwen2.5:3b", "confidence": 0.9, "reason": "Simple classification task"}},
        {"input": "Analyze the latest P-102 inspection and draft an approval note", "output": {"task_type": "reasoning", "model": "qwen2.5:7b", "confidence": 0.92, "reason": "Multi-step reasoning with document generation"}},
    ]

    def _build_router_prompt(self, query: str) -> str:
        examples = "\n".join(
            f'User: {ex["input"]}\nAssistant: {json.dumps(ex["output"])}'
            for ex in self.ROUTER_EXAMPLES
        )
        return f"""{self.ROUTER_SYSTEM_PROMPT}

Examples:
{examples}

User: {query}
Assistant:"""

    async def route(self, query: str) -> Dict[str, Any]:
        try:
            prompt = self._build_router_prompt(query)
            response = await ollama_client.generate(
                model=self.router_model,
                prompt=prompt,
                options={"temperature": 0.1, "top_p": 0.9},
                format="json",
            )
            result = json.loads(response.get("response", "{}"))
            result["model"] = result.get("model", self.primary_model)
            return result
        except Exception as e:
            logger.warning("router_failed_using_fallback", error=str(e), query=query[:100])
            return self._fallback_route(query)

    def _fallback_route(self, query: str) -> Dict[str, Any]:
        query_lower = query.lower()
        coding_keywords = ["code", "python", "script", "calculate", "function", "debug", "algorithm"]
        classification_keywords = ["classify", "categorize", "type", "category", "label"]

        if any(kw in query_lower for kw in coding_keywords):
            return {
                "task_type": "coding",
                "model": self.coding_model,
                "confidence": 0.7,
                "reason": "Fallback: detected coding keywords",
            }
        elif any(kw in query_lower for kw in classification_keywords):
            return {
                "task_type": "classification",
                "model": self.router_model,
                "confidence": 0.7,
                "reason": "Fallback: detected classification keywords",
            }
        else:
            return {
                "task_type": "reasoning",
                "model": self.primary_model,
                "confidence": 0.7,
                "reason": "Fallback: default to reasoning model",
            }

    def pick(self, task: str, explicit_model: str = None) -> str:
        if explicit_model:
            return explicit_model
        task_lower = (task or "").lower()
        if task_lower in ("coding", "code", "python", "script", "calculation"):
            return self.coding_model
        if task_lower in ("classification", "router", "fast-path", "intent", "lightweight"):
            return self.router_model
        return self.primary_model

    def deterministic_route(self, query: str, explicit_model: str = None) -> Dict[str, Any]:
        if explicit_model:
            return {"task_type": "general", "model": explicit_model, "confidence": 1.0, "reason": "Explicit model selection"}
        return self._fallback_route(query)


model_router = ModelRouter()