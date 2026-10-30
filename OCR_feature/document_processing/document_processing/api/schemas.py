"""API schemas — identical to the core DocumentResult contract."""

from document_processing.models import DocumentResult, ErrorInfo, ProcessingStatus

__all__ = ["DocumentResult", "ErrorInfo", "ProcessingStatus"]
