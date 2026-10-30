import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "models/text-embedding-004")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sovereign.db")
VECTOR_DB_PATH = os.getenv("VECTOR_DB_PATH", "./backend/storage/qdrant")
VECTOR_COLLECTION = os.getenv("VECTOR_COLLECTION", "mrpl_knowledge_local")
DOCUMENT_STORAGE_PATH = os.getenv("DOCUMENT_STORAGE_PATH", "./backend/storage/documents")
ARTIFACT_STORAGE_PATH = os.getenv("ARTIFACT_STORAGE_PATH", "./backend/storage/artifacts")

os.makedirs(VECTOR_DB_PATH, exist_ok=True)
os.makedirs(DOCUMENT_STORAGE_PATH, exist_ok=True)
os.makedirs(ARTIFACT_STORAGE_PATH, exist_ok=True)


# Gateway Configuration
LLM_MODE = os.getenv("LLM_MODE", "local")
CLOUD_ENABLED = os.getenv("CLOUD_ENABLED", "false").lower() == "true"

LOCAL_ROUTER_MODEL = os.getenv("LOCAL_ROUTER_MODEL", "qwen2.5:3b")
LOCAL_REASONING_MODEL = os.getenv("LOCAL_REASONING_MODEL", "qwen2.5:7b")
LOCAL_CODER_MODEL = os.getenv("LOCAL_CODER_MODEL", "qwen2.5-coder:7b")
LOCAL_EMBEDDING_MODEL = os.getenv("LOCAL_EMBEDDING_MODEL", "bge-m3:latest")
LOCAL_API_BASE = os.getenv("LOCAL_API_BASE", "http://localhost:11434")
