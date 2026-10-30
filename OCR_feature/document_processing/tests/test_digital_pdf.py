"""Phase 1/3 — digital PDF via Docling; OCR must NOT run unnecessarily."""

from __future__ import annotations

from pathlib import Path

import pytest

from document_processing.models import ProcessingStatus, SourceEngine
from document_processing.processor import DocumentProcessor

pytestmark = pytest.mark.unit


def test_digital_pdf_docling_extraction(digital_pdf_path: Path):
    processor = DocumentProcessor(use_ocr=True, use_smolvlm=False)
    result = processor.process(digital_pdf_path)

    assert result.processing_status in {
        ProcessingStatus.SUCCESS,
        ProcessingStatus.PARTIAL,
    }
    assert result.file_type == "pdf"
    assert result.document_id
    assert result.filename == digital_pdf_path.name
    assert result.metadata.extra.get("pdf_kind") == "digital"
    assert result.processing_metadata.ocr_used is False
    assert result.processing_metadata.vision_used is False
    assert "docling" in result.processing_metadata.processing_route
    assert "file_detection" in result.processing_metadata.processing_route
    assert "pdf_digital" in result.processing_metadata.processing_route

    # Prefer native extraction (no OCR engine stamped)
    assert result.processing_metadata.ocr_engine is None

    assert result.metadata.page_count >= 1
    assert len(result.pages) >= 1
    assert result.pages[0].page_number == 1
    assert result.pages[0].metadata.get("extraction_mode") == "native"

    assert isinstance(result.full_text, str)
    assert isinstance(result.markdown, str)

    if result.pages[0].elements:
        sources = {el.source for el in result.pages[0].elements}
        assert SourceEngine.DOCLING in sources or SourceEngine.NATIVE in sources

    # OCR must not be unnecessarily invoked for digital PDFs
    assert "rapidocr" not in result.processing_metadata.processing_route


def test_digital_pdf_rag_contract_fields(digital_pdf_path: Path):
    result = DocumentProcessor().process(digital_pdf_path)
    payload = result.to_rag_payload()
    for key in (
        "document_id",
        "filename",
        "file_type",
        "processing_status",
        "metadata",
        "pages",
        "full_text",
        "markdown",
        "processing_metadata",
    ):
        assert key in payload
