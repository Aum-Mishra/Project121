"""Phase 3 — mixed digital + scanned PDF page provenance."""

from __future__ import annotations

from pathlib import Path

import pytest

from document_processing.models import ProcessingStatus, SourceEngine
from document_processing.processor import DocumentProcessor

pytestmark = pytest.mark.unit


def test_mixed_pdf_page_level_routing(fixtures_dir: Path):
    path = fixtures_dir / "mixed_hello.pdf"
    result = DocumentProcessor(use_ocr=True, use_smolvlm=False).process(path)

    assert result.file_type == "pdf"
    assert result.processing_status in {
        ProcessingStatus.SUCCESS,
        ProcessingStatus.PARTIAL,
    }
    assert result.metadata.extra.get("pdf_kind") == "mixed"
    assert result.metadata.page_count == 2
    assert len(result.pages) == 2
    assert result.processing_metadata.ocr_used is True
    assert result.processing_metadata.ocr_engine == "rapidocr"
    assert "pdf_mixed" in result.processing_metadata.processing_route
    assert "rapidocr" in result.processing_metadata.processing_route

    page1, page2 = result.pages[0], result.pages[1]
    assert page1.page_number == 1
    assert page2.page_number == 2

    assert page1.metadata.get("extraction_mode") == "native"
    assert page2.metadata.get("extraction_mode") == "ocr"
    assert page2.metadata.get("provenance") == "rapidocr"

    # Page 2 should carry RapidOCR elements
    assert any(el.source == SourceEngine.RAPIDOCR for el in page2.elements)

    # Combined document should include both streams when extractable
    assert result.full_text
    modes = result.metadata.extra.get("page_modes", {})
    assert modes.get("1") == "native"
    assert modes.get("2") == "ocr"
