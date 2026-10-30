"""VLM quality / engine unit tests (Phase 6)."""

from __future__ import annotations

import pytest

from document_processing.models import (
    DocumentMetadata,
    DocumentResult,
    PageResult,
    ProcessingMetadata,
    ProcessingStatus,
)
from document_processing.vision.quality import needs_visual_fallback

pytestmark = pytest.mark.unit


def _result(text: str, status: ProcessingStatus = ProcessingStatus.SUCCESS, warnings=None):
    return DocumentResult(
        document_id="x",
        filename="img.png",
        file_type="image",
        processing_status=status,
        metadata=DocumentMetadata(page_count=1),
        pages=[PageResult(page_number=1, text=text)],
        full_text=text,
        markdown=text,
        processing_metadata=ProcessingMetadata(warnings=list(warnings or [])),
    )


def test_needs_fallback_when_no_ocr_text():
    r = _result("", status=ProcessingStatus.PARTIAL, warnings=["no_ocr_text_detected"])
    assert needs_visual_fallback(r, is_image=True) is True


def test_no_fallback_when_rich_ocr():
    r = _result("P-102 Feed Transfer Pump discharge pressure 18.4 bar normal reading")
    assert needs_visual_fallback(r, is_image=True) is False


def test_fallback_for_short_image_ocr():
    r = _result("ab")
    assert needs_visual_fallback(r, is_image=True) is True


@pytest.mark.integration
@pytest.mark.skip(reason="Optional GPU SmolVLM — enable manually with --use-smolvlm")
def test_smolvlm_live():
    assert False
