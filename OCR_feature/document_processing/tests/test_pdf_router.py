"""Unit tests for PDF page classification / routing helpers."""

from __future__ import annotations

from pathlib import Path

import pytest

from document_processing.parsers.pdf_router import analyze_pdf_pages

pytestmark = pytest.mark.unit


def test_analyze_digital_pdf(fixtures_dir: Path):
    analysis = analyze_pdf_pages(fixtures_dir / "digital_hello.pdf", density_threshold=20)
    assert analysis.document_kind == "digital"
    assert analysis.page_count == 1
    assert analysis.pages[0].needs_ocr is False
    assert analysis.pages[0].mode == "native"
    assert analysis.pages[0].char_count > 20


def test_analyze_scanned_pdf(fixtures_dir: Path):
    path = fixtures_dir / "scanned_hello.pdf"
    assert path.exists()
    analysis = analyze_pdf_pages(path, density_threshold=20)
    assert analysis.document_kind == "scanned"
    assert analysis.ocr_page_numbers == [1]
    assert analysis.pages[0].needs_ocr is True


def test_analyze_mixed_pdf(fixtures_dir: Path):
    path = fixtures_dir / "mixed_hello.pdf"
    assert path.exists()
    analysis = analyze_pdf_pages(path, density_threshold=20)
    assert analysis.document_kind == "mixed"
    assert 1 in analysis.native_page_numbers
    assert 2 in analysis.ocr_page_numbers
