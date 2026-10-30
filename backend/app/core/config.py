from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = "development"
    company_id: str = "apexpetro"

    ollama_base_url: str = "http://localhost:11434"
    primary_model: str = "qwen2.5:7b"
    coding_model: str = "qwen2.5-coder:7b"
    router_model: str = "qwen2.5:3b"
    embedding_model: str = "bge-m3:latest"

    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "apexpetro_knowledge"

    # Retrieval relevance controls — the goal is high relevance over high volume.
    retrieval_default_limit: int = 8
    retrieval_min_semantic_score: float = 0.40
    retrieval_min_keyword_score: float = 0.5
    retrieval_max_chars: int = 2000
    summarization_max_chunks: int = 40
    summarization_target_chars: int = 8000

    database_url: str = "sqlite:///./data/runtime/workbench.db"

    # --- OCR service (isolated local FastAPI service from OCR_feature) ---
    ocr_service_url: str = "http://127.0.0.1:8001"
    ocr_service_timeout_s: float = 600.0
    ocr_supported_extensions: List[str] = [
        ".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp",
        ".docx", ".pptx", ".xlsx", ".csv", ".txt", ".md", ".markdown", ".html", ".htm",
    ]
    ocr_max_upload_bytes: int = 50 * 1024 * 1024

    # --- Chat-scoped document RAG (isolated from permanent company RAG) ---
    chat_doc_collection: str = "apexpetro_chat_documents"
    chat_doc_embedding_size: int = 1024
    chat_doc_max_chunks: int = 250
    chat_doc_retrieval_limit: int = 8
    chat_doc_retrieval_min_score: float = 0.25
    chat_doc_upload_dir: str = "./chat_uploads"

    @property
    def chat_doc_upload_dir_path(self) -> Path:
        return Path(self.chat_doc_upload_dir).resolve()

    company_data_path: str = "../ApexPetro_Sovereign_Dataset_v3"
    test_data_enabled: bool = False

    offline_mode: bool = True
    allow_external_network: bool = False

    host: str = "0.0.0.0"
    port: int = 8000

    log_level: str = "INFO"

    @property
    def company_data_dir(self) -> Path:
        return Path(self.company_data_path).resolve()

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def allowed_models(self) -> List[str]:
        return [self.primary_model, self.coding_model, self.router_model, self.embedding_model]


settings = Settings()