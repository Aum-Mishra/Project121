"""OCR package — RapidOCR engine."""

from document_processing.ocr.rapidocr_engine import (
    OCRLine,
    OCRPageResult,
    RapidOCREngine,
    quad_to_xyxy,
)

__all__ = [
    "OCRLine",
    "OCRPageResult",
    "RapidOCREngine",
    "quad_to_xyxy",
]
