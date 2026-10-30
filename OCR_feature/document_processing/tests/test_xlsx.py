"""XLSX native extraction tests (Phase 5) — never OCR."""

from __future__ import annotations

from pathlib import Path

import pytest

from document_processing.models import ProcessingStatus, SourceEngine
from document_processing.processor import DocumentProcessor

pytestmark = pytest.mark.integration


def test_xlsx_native_tables(fixtures_dir: Path):
    path = fixtures_dir / "phase5_sample.xlsx"
    if not path.exists():
        path = fixtures_dir / "sample.xlsx"
    assert path.exists()
    result = DocumentProcessor(use_ocr=True, use_smolvlm=False).process(path)
    assert result.processing_status == ProcessingStatus.SUCCESS
    assert result.file_type == "xlsx"
    assert "office_native" in result.processing_metadata.processing_route
    assert result.processing_metadata.ocr_used is False
    assert len(result.tables) >= 1
    assert result.tables[0].source == SourceEngine.NATIVE
    assert "|" in result.markdown  # markdown table preserved
