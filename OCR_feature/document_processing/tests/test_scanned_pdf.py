"""Phase 3 — scanned PDF via RapidOCR with page association."""

from __future__ import annotations

from pathlib import Path

import pytest

from document_processing.models import ElementType, ProcessingStatus, SourceEngine
from document_processing.processor import DocumentProcessor

pytestmark = pytest.mark.unit


def test_scanned_pdf_invokes_rapidocr(fixtures_dir: Path):
    path = fixtures_dir / "scanned_hello.pdf"
    result = DocumentProcessor(use_ocr=True, use_smolvlm=False).process(path)

    assert result.file_type == "pdf"
    assert result.processing_status in {
        ProcessingStatus.SUCCESS,
        ProcessingStatus.PARTIAL,
    }
    assert result.metadata.extra.get("pdf_kind") == "scanned"
    assert result.processing_metadata.ocr_used is True
    assert result.processing_metadata.ocr_engine == "rapidocr"
    assert "rapidocr" in result.processing_metadata.processing_route
    assert "pdf_scanned" in result.processing_metadata.processing_route

    assert result.pages
    assert result.pages[0].page_number == 1
    assert result.pages[0].metadata.get("extraction_mode") == "ocr"
    assert result.pages[0].metadata.get("provenance") == "rapidocr"

    assert result.full_text
    # OCR should recover the printed fixture phrase (allowing OCR noise)
    upper = result.full_text.upper()
    assert "SCAN" in upper or "OCR" in upper or "TEXT" in upper

    ocr_els = [
        el
        for el in result.pages[0].elements
        if el.source == SourceEngine.RAPIDOCR and el.type == ElementType.OCR_TEXT
    ]
    assert ocr_els
    assert any(el.confidence is not None for el in ocr_els)
    assert any(el.bbox is not None for el in ocr_els)


def test_scanned_pdf_ocr_disabled(fixtures_dir: Path):
    path = fixtures_dir / "scanned_hello.pdf"
    result = DocumentProcessor(use_ocr=False).process(path)
    assert result.processing_metadata.ocr_used is False
    assert "rapidocr" not in result.processing_metadata.processing_route
