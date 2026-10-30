"""Normalization / schema unit tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from document_processing.detectors.file_detector import DetectionResult
from document_processing.models import ElementType, ProcessingStatus, SourceEngine, TableData
from document_processing.normalization.normalizer import (
    normalize_docling_result,
    table_to_markdown,
)
from document_processing.parsers.docling_parser import (
    DoclingParseResult,
    ParsedElement,
    ParsedTable,
)
from document_processing.processor import DocumentProcessor

pytestmark = pytest.mark.unit


def test_normalize_preserves_pages_and_tables():
    detection = DetectionResult(
        internal_type="PDF",
        extension=".pdf",
        mime_type="application/pdf",
        magic_type="pdf",
        confidence="high",
    )
    parsed = DoclingParseResult(
        elements=[
            ParsedElement(label="TITLE", text="Report", page_no=1, bbox=[1, 2, 3, 4]),
            ParsedElement(label="PARAGRAPH", text="Body text", page_no=1),
            ParsedElement(label="PARAGRAPH", text="Page two", page_no=2),
        ],
        tables=[
            ParsedTable(
                page_no=1,
                caption="T1",
                grid=[["A", "B"], ["1", "2"]],
                metadata={"headers": ["A", "B"]},
            )
        ],
        markdown="# Report\n\nBody text",
        plain_text="Report\nBody text\nPage two",
        page_count=2,
        title="Report",
    )
    result = normalize_docling_result(
        file_path=Path("report.pdf"),
        detection=detection,
        parsed=parsed,
    )
    assert result.processing_status == ProcessingStatus.SUCCESS
    assert result.metadata.page_count == 2
    assert len(result.pages) == 2
    assert result.pages[0].elements[0].type == ElementType.TITLE
    assert result.pages[0].elements[0].source == SourceEngine.DOCLING
    assert result.pages[0].elements[0].bbox == [1, 2, 3, 4]
    assert result.pages[0].elements[0].confidence is None
    assert len(result.tables) == 1
    assert result.tables[0].rows == [["A", "B"], ["1", "2"]]
    assert "Report" in result.full_text
    assert result.markdown.startswith("# Report")
    assert result.source == "report.pdf"


def test_table_to_markdown_preserves_cells():
    md = table_to_markdown(
        TableData(
            headers=["Parameter", "Reading", "Unit"],
            rows=[
                ["Parameter", "Reading", "Unit"],
                ["DE vibration", "5.6", "mm/s"],
            ],
        )
    )
    assert "DE vibration" in md
    assert "5.6" in md
    assert "mm/s" in md
    assert "|" in md


def test_plain_text_native_route(fixtures_dir: Path):
    result = DocumentProcessor().process(fixtures_dir / "sample.txt")
    assert result.processing_status == ProcessingStatus.SUCCESS
    assert result.file_type == "txt"
    assert "Plain text fixture" in result.full_text
    assert result.processing_metadata.ocr_used is False
    assert "native_text" in result.processing_metadata.processing_route


def test_unsupported_returns_structured_error(fixtures_dir: Path):
    result = DocumentProcessor().process(fixtures_dir / "not_supported.exe")
    assert result.processing_status == ProcessingStatus.FAILED
    assert result.error is not None
    assert result.error.code == "UNSUPPORTED_FILE_TYPE"


def test_empty_document_structured_error(fixtures_dir: Path):
    result = DocumentProcessor().process(fixtures_dir / "empty.txt")
    assert result.processing_status == ProcessingStatus.FAILED
    assert result.error is not None
    assert result.error.code == "EMPTY_DOCUMENT"


def test_normalize_ocr_pages_preserves_metadata(fixtures_dir: Path):
    from document_processing.normalization.normalizer import normalize_ocr_pages
    from document_processing.ocr.rapidocr_engine import OCRLine, OCRPageResult

    detection = DetectionResult(
        internal_type="IMAGE",
        extension=".png",
        mime_type="image/png",
        magic_type="png",
        confidence="high",
    )
    ocr = OCRPageResult(
        page_number=1,
        lines=[
            OCRLine(
                text="TAG-01",
                confidence=0.91,
                bbox=[1.0, 2.0, 3.0, 4.0],
                page_number=1,
            )
        ],
        full_text="TAG-01",
        image_width=100,
        image_height=50,
    )
    result = normalize_ocr_pages(
        file_path=fixtures_dir / "sample.txt",
        detection=detection,
        ocr_pages=[ocr],
    )
    assert result.processing_metadata.ocr_used is True
    assert result.processing_metadata.ocr_engine == "rapidocr"
    el = result.pages[0].elements[0]
    assert el.text == "TAG-01"
    assert el.confidence == 0.91
    assert el.bbox == [1.0, 2.0, 3.0, 4.0]
    assert el.source.value == "rapidocr"
