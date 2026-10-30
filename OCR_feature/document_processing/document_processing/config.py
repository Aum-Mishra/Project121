"""Configuration for the document processing module."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ProcessorConfig:
    """Runtime configuration for DocumentProcessor.

    Defaults keep OCR enabled and SmolVLM opt-in (lazy-loaded later).
    """

    use_ocr: bool = True
    use_smolvlm: bool = False
    ocr_confidence_threshold: float = 0.5
    # When average page text density falls below this, treat page as scanned.
    scanned_text_density_threshold: float = 20.0
    max_preview_chars: int = 500
    log_document_content: bool = False
    smolvlm_model_id: str = "HuggingFaceTB/SmolVLM-500M-Instruct"
    smolvlm_device: Optional[str] = None  # None = auto (cuda if available)
    temp_dir: Optional[str] = None

    # URL input (Phase 8+)
    allow_url_network: bool = False  # offline-safe default
    max_url_bytes: int = 10 * 1024 * 1024
    url_timeout_s: float = 15.0
    max_upload_bytes: int = 50 * 1024 * 1024

    # Internal feature flags used during phased rollout
    enable_docling: bool = True
    enable_rapidocr: bool = True  # Phase 2+
    enable_vision: bool = False  # Phase 6+


DEFAULT_CONFIG = ProcessorConfig()


SUPPORTED_EXTENSIONS: dict[str, str] = {
    ".pdf": "PDF",
    ".png": "IMAGE",
    ".jpg": "IMAGE",
    ".jpeg": "IMAGE",
    ".tif": "IMAGE",
    ".tiff": "IMAGE",
    ".bmp": "IMAGE",
    ".webp": "IMAGE",
    ".docx": "DOCX",
    ".pptx": "PPTX",
    ".xlsx": "XLSX",
    ".csv": "CSV",
    ".txt": "TXT",
    ".md": "MARKDOWN",
    ".markdown": "MARKDOWN",
    ".html": "HTML",
    ".htm": "HTML",
}


MIME_TO_INTERNAL: dict[str, str] = {
    "application/pdf": "PDF",
    "image/png": "IMAGE",
    "image/jpeg": "IMAGE",
    "image/tiff": "IMAGE",
    "image/bmp": "IMAGE",
    "image/webp": "IMAGE",
    "image/x-ms-bmp": "IMAGE",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "text/csv": "CSV",
    "application/csv": "CSV",
    "text/plain": "TXT",
    "text/markdown": "MARKDOWN",
    "text/html": "HTML",
    "application/xhtml+xml": "HTML",
}


# filetype (libmagic-like) short names → internal type
FILETYPE_TO_INTERNAL: dict[str, str] = {
    "pdf": "PDF",
    "png": "IMAGE",
    "jpg": "IMAGE",
    "jpeg": "IMAGE",
    "tif": "IMAGE",
    "tiff": "IMAGE",
    "bmp": "IMAGE",
    "webp": "IMAGE",
}
