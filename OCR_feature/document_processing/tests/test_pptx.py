"""PPTX native extraction tests (Phase 5)."""

from __future__ import annotations

from pathlib import Path

import pytest

from document_processing.models import ProcessingStatus
from document_processing.processor import DocumentProcessor

pytestmark = pytest.mark.integration


def test_pptx_native_extraction(fixtures_dir: Path):
    path = fixtures_dir / "phase5_sample.pptx"
    if not path.exists():
        path = fixtures_dir / "sample.pptx"
    assert path.exists()
    result = DocumentProcessor(use_ocr=True, use_smolvlm=False).process(path)
    assert result.processing_status in {ProcessingStatus.SUCCESS, ProcessingStatus.PARTIAL}
    assert result.file_type == "pptx"
    assert "office_native" in result.processing_metadata.processing_route
    assert result.processing_metadata.ocr_used is False
    assert result.full_text.strip() or result.tables or result.metadata.page_count >= 1
