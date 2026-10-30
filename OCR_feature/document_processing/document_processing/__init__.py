"""Document Processing Module — stable public API for RAG integration."""

from document_processing.models import DocumentResult
from document_processing.processor import DocumentProcessor
from document_processing.exceptions import DocumentProcessingError

__all__ = [
    "DocumentProcessor",
    "DocumentResult",
    "DocumentProcessingError",
]

__version__ = "0.1.0"
