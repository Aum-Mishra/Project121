import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "models/text-embedding-004")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./knovia.db")
VECTOR_DB_PATH = os.getenv("VECTOR_DB_PATH", "./backend/storage/qdrant")
VECTOR_COLLECTION = os.getenv("VECTOR_COLLECTION", "mrpl_knowledge_local")
DOCUMENT_STORAGE_PATH = os.getenv("DOCUMENT_STORAGE_PATH", "./backend/storage/documents")
ARTIFACT_STORAGE_PATH = os.getenv("ARTIFACT_STORAGE_PATH", "./backend/storage/artifacts")

os.makedirs(VECTOR_DB_PATH, exist_ok=True)
os.makedirs(DOCUMENT_STORAGE_PATH, exist_ok=True)
os.makedirs(ARTIFACT_STORAGE_PATH, exist_ok=True)


# ── Deployment mode ─────────────────────────────────────────────────────────
# APP_MODE=local  -> Ollama (installed local models)
# APP_MODE=cloud  -> Nebius Token Factory (NVIDIA Nemotron), OpenAI-compatible.
# LLM_MODE is kept as a backward-compatible alias.
APP_MODE = os.getenv("APP_MODE", os.getenv("LLM_MODE", "local")).strip().lower()
if APP_MODE not in ("local", "cloud"):
    APP_MODE = "local"
LLM_MODE = APP_MODE  # legacy name used by vector_store.py
CLOUD_ENABLED = APP_MODE == "cloud"

LOCAL_ROUTER_MODEL = os.getenv("LOCAL_ROUTER_MODEL", "qwen2.5:3b")
LOCAL_REASONING_MODEL = os.getenv("LOCAL_REASONING_MODEL", "qwen2.5:7b")
LOCAL_CODER_MODEL = os.getenv("LOCAL_CODER_MODEL", "qwen2.5-coder:7b")
LOCAL_EMBEDDING_MODEL = os.getenv("LOCAL_EMBEDDING_MODEL", "bge-m3:latest")
LOCAL_API_BASE = os.getenv("LOCAL_API_BASE", "http://localhost:11434")

# ── Nebius Token Factory (cloud mode) ───────────────────────────────────────
# OpenAI-compatible endpoint. Credentials stay server-side only.
NEBIUS_API_KEY = (
    os.getenv("NEBIUS_API_KEY")
    or os.getenv("NEBIUS_TOKEN")
    or os.getenv("NEBIUS_KEY")
    or ""
)
NEBIUS_BASE_URL = os.getenv(
    "NEBIUS_BASE_URL",
    os.getenv("NEBIUS_ENDPOINT", "https://api.tokenfactory.us-central1.nebius.com/v1"),
)
NEBIUS_MODEL = os.getenv("NEBIUS_MODEL", "nvidia/nemotron-3-super-120b-a12b")
NEBIUS_ROUTER_MODEL = os.getenv("NEBIUS_ROUTER_MODEL", NEBIUS_MODEL)
NEBIUS_CODER_MODEL = os.getenv("NEBIUS_CODER_MODEL", NEBIUS_MODEL)
# Embeddings are optional on Nebius; when unset, cloud retrieval uses the
# deterministic lexical index (never local/Ollama embeddings).
NEBIUS_EMBEDDING_MODEL = os.getenv("NEBIUS_EMBEDDING_MODEL", "")
try:
    NEBIUS_TIMEOUT = int(os.getenv("NEBIUS_TIMEOUT", "600"))
except ValueError:
    NEBIUS_TIMEOUT = 600


# ── Coding Agent service (isolated re-implementation of the `coding_agent`
#    backend at <project-root>/coding_agent). The chat coding phase drives this
#    service over HTTP; if it cannot be reached or started it falls back to the
#    in-process generator in coding_engine.
CODING_AGENT_URL = os.getenv("CODING_AGENT_URL", "http://127.0.0.1:8002")

# The `coding_agent/backend` folder hosting the uvicorn app.
CODING_AGENT_BACKEND_DIR = os.getenv(
    "CODING_AGENT_BACKEND_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "..", "coding_agent", "backend"),
)

# Interpreter used to launch the coding-agent service. Prefer the root
# `backend/ai` venv which ships the `openhands` dependency the service imports.
CODING_AGENT_PYTHON = os.getenv(
    "CODING_AGENT_PYTHON",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "..", "backend", "ai", "bin", "python"),
)

# Coding projects live under <artifacts parent>/code_projects (same as before).
CODE_PROJECTS_PATH = os.getenv(
    "CODE_PROJECTS_PATH",
    os.path.join(os.path.dirname(ARTIFACT_STORAGE_PATH), "code_projects"),
)

# Chat-originated coding tasks auto-approve the sandbox permission bucket so the
# chat never blocks indefinitely; hard security (blocked commands, no network,
# path confinement) is enforced by the service regardless.
CA_CHAT_AUTO_APPROVE = os.getenv("CA_CHAT_AUTO_APPROVE", "1") not in ("0", "false", "False")
