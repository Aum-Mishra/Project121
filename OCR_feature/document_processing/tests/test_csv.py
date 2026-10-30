"""CSV native extraction tests (Phase 5) — never OCR."""

from __future__ import annotations

from pathlib import Path

import pytest

from document_processing.models import ProcessingStatus, SourceEngine
from document_processing.processor import DocumentProcessor

pytestmark = pytest.mark.unit


def test_csv_native_table(fixtures_dir: Path):
    path = fixtures_dir / "phase5_sample.csv"
    if not path.exists():
        path = fixtures_dir / "sample.csv"
    assert path.exists()
    result = DocumentProcessor(use_ocr=False, use_smolvlm=False).process(path)
    assert result.processing_status == ProcessingStatus.SUCCESS
    assert result.file_type == "csv"
    assert "office_native" in result.processing_metadata.processing_route
    assert result.processing_metadata.ocr_used is False
    assert len(result.tables) == 1
    assert result.tables[0].source == SourceEngine.NATIVE
    assert result.tables[0].headers or result.tables[0].rows
    assert "|" in result.markdown
