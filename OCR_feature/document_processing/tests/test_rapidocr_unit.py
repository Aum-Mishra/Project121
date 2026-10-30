"""Unit helpers for RapidOCR geometry / parsing (no model required)."""

from __future__ import annotations

import pytest

from document_processing.ocr.rapidocr_engine import OCRLine, OCRPageResult, quad_to_xyxy

pytestmark = pytest.mark.unit


def test_quad_to_xyxy_from_points():
    box = [[10, 20], [40, 20], [40, 50], [10, 50]]
    assert quad_to_xyxy(box) == [10.0, 20.0, 40.0, 50.0]


def test_quad_to_xyxy_none():
    assert quad_to_xyxy(None) is None


def test_ocr_page_mean_confidence_ignores_nulls():
    page = OCRPageResult(
        page_number=1,
        lines=[
            OCRLine(text="a", confidence=0.8),
            OCRLine(text="b", confidence=None),
            OCRLine(text="c", confidence=1.0),
        ],
        full_text="a\nb\nc",
    )
    assert page.mean_confidence == pytest.approx(0.9)


def test_ocr_page_mean_confidence_all_null():
    page = OCRPageResult(
        page_number=1,
        lines=[OCRLine(text="a", confidence=None)],
        full_text="a",
    )
    assert page.mean_confidence is None
