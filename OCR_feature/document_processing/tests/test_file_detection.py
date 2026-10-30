"""Unit tests for file type detection."""

from __future__ import annotations

from pathlib import Path

import pytest

from document_processing.detectors.file_detector import detect_file_type
from document_processing.exceptions import InvalidInputPathError, UnsupportedFileTypeError

pytestmark = pytest.mark.unit


def test_detect_pdf(fixtures_dir: Path):
    result = detect_file_type(fixtures_dir / "digital_hello.pdf")
    assert result.internal_type == "PDF"


def test_detect_docx(fixtures_dir: Path):
    result = detect_file_type(fixtures_dir / "sample.docx")
    assert result.internal_type == "DOCX"


def test_detect_csv(fixtures_dir: Path):
    result = detect_file_type(fixtures_dir / "sample.csv")
    assert result.internal_type == "CSV"


def test_detect_markdown(fixtures_dir: Path):
    result = detect_file_type(fixtures_dir / "sample.md")
    assert result.internal_type == "MARKDOWN"


def test_detect_html(fixtures_dir: Path):
    result = detect_file_type(fixtures_dir / "sample.html")
    assert result.internal_type == "HTML"


def test_detect_txt(fixtures_dir: Path):
    result = detect_file_type(fixtures_dir / "sample.txt")
    assert result.internal_type == "TXT"


def test_magic_overrides_misleading_extension(fixtures_dir: Path):
    result = detect_file_type(fixtures_dir / "pdf_as_txt.txt")
    assert result.internal_type == "PDF"
    assert any("disagrees" in n for n in result.notes) or result.confidence in {
        "high",
        "medium",
    }


def test_unsupported_exe(fixtures_dir: Path):
    with pytest.raises(UnsupportedFileTypeError) as exc:
        detect_file_type(fixtures_dir / "not_supported.exe")
    assert exc.value.code == "UNSUPPORTED_FILE_TYPE"


def test_missing_path(fixtures_dir: Path):
    with pytest.raises(InvalidInputPathError):
        detect_file_type(fixtures_dir / "does_not_exist.pdf")
