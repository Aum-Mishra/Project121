"""API / public contract stability tests (Phase 1 — schema only)."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from document_processing import DocumentProcessor, DocumentResult
from document_processing.api.schemas import DocumentResult as ApiDocumentResult
from document_processing.models import ProcessingStatus

pytestmark = pytest.mark.unit


def test_public_exports():
    assert DocumentProcessor is not None
    assert DocumentResult is not None


def test_api_schema_is_same_model():
    assert ApiDocumentResult is DocumentResult


def test_result_schema_roundtrip(fixtures_dir: Path):
    result = DocumentProcessor().process(fixtures_dir / "sample.md")
    assert result.processing_status in {
        ProcessingStatus.SUCCESS,
        ProcessingStatus.PARTIAL,
        ProcessingStatus.FAILED,
    }
    data = result.model_dump(mode="json")
    restored = DocumentResult.model_validate(data)
    assert restored.document_id == result.document_id
    assert restored.file_type == result.file_type


def test_invalid_status_rejected():
    with pytest.raises(ValidationError):
        DocumentResult(
            document_id="x",
            filename="f.pdf",
            file_type="pdf",
            processing_status="not-a-status",  # type: ignore[arg-type]
        )
