"""Shared pytest fixtures and path setup."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

FIXTURES = Path(__file__).parent / "fixtures"


def _ensure_pdf_fixtures(fixtures_dir: Path) -> None:
    """Create small synthetic scanned/mixed PDFs if missing."""
    import pypdfium2 as pdfium
    from PIL import Image, ImageDraw

    scanned = fixtures_dir / "scanned_hello.pdf"
    if not scanned.exists():
        img = Image.new("RGB", (600, 200), "white")
        draw = ImageDraw.Draw(img)
        draw.text((30, 80), "SCANNED PAGE OCR TEXT", fill="black")
        img.save(scanned, "PDF", resolution=150.0)

    digital = fixtures_dir / "digital_hello.pdf"
    mixed = fixtures_dir / "mixed_hello.pdf"
    if digital.exists() and (not mixed.exists()):
        out = pdfium.PdfDocument.new()
        d1 = pdfium.PdfDocument(str(digital))
        d2 = pdfium.PdfDocument(str(scanned))
        try:
            out.import_pages(d1)
            out.import_pages(d2)
            out.save(str(mixed))
        finally:
            out.close()
            d1.close()
            d2.close()


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    _ensure_pdf_fixtures(FIXTURES)
    return FIXTURES


@pytest.fixture(scope="session")
def digital_pdf_path(fixtures_dir: Path) -> Path:
    path = fixtures_dir / "digital_hello.pdf"
    assert path.exists(), f"Missing fixture: {path}"
    return path


@pytest.fixture(scope="session")
def scanned_pdf_path(fixtures_dir: Path) -> Path:
    path = fixtures_dir / "scanned_hello.pdf"
    assert path.exists(), f"Missing fixture: {path}"
    return path


@pytest.fixture(scope="session")
def mixed_pdf_path(fixtures_dir: Path) -> Path:
    path = fixtures_dir / "mixed_hello.pdf"
    assert path.exists(), f"Missing fixture: {path}"
    return path


@pytest.fixture(scope="session")
def empty_txt_path(fixtures_dir: Path) -> Path:
    path = fixtures_dir / "empty.txt"
    path.write_text("", encoding="utf-8")
    return path
