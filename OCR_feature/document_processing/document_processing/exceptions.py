"""Structured exceptions for the document processing module."""

from __future__ import annotations

from typing import Any, Optional


class DocumentProcessingError(Exception):
    """Base error with a stable machine-readable code."""

    code: str = "DOCUMENT_PROCESSING_ERROR"
    http_status: int = 400

    def __init__(
        self,
        message: str,
        *,
        code: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        if code is not None:
            self.code = code
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.details:
            payload["details"] = self.details
        return payload


class UnsupportedFileTypeError(DocumentProcessingError):
    code = "UNSUPPORTED_FILE_TYPE"
    http_status = 415


class InvalidInputPathError(DocumentProcessingError):
    code = "INVALID_INPUT_PATH"
    http_status = 400


class EmptyDocumentError(DocumentProcessingError):
    code = "EMPTY_DOCUMENT"
    http_status = 422


class CorruptedFileError(DocumentProcessingError):
    code = "CORRUPTED_FILE"
    http_status = 422


class CorruptedPDFError(CorruptedFileError):
    code = "CORRUPTED_PDF"


class CorruptedImageError(CorruptedFileError):
    code = "CORRUPTED_IMAGE"


class InvalidOfficeDocumentError(CorruptedFileError):
    code = "INVALID_OFFICE_DOCUMENT"


class DoclingFailureError(DocumentProcessingError):
    code = "DOCLING_FAILURE"
    http_status = 500


class OCRFailureError(DocumentProcessingError):
    code = "OCR_FAILURE"
    http_status = 500


class VisionFailureError(DocumentProcessingError):
    code = "VISION_FAILURE"
    http_status = 500


class MissingModelError(DocumentProcessingError):
    code = "MISSING_MODEL"
    http_status = 503


class GPUUnavailableError(DocumentProcessingError):
    code = "GPU_UNAVAILABLE"
    http_status = 503
