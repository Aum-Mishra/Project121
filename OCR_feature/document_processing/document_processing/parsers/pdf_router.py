"""PDF page analysis and rendering for digital / scanned / mixed routing."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from document_processing.exceptions import CorruptedPDFError

logger = logging.getLogger(__name__)


@dataclass
class PageClassification:
    page_number: int  # 1-based
    char_count: int
    needs_ocr: bool
    mode: str  # "native" | "ocr"


@dataclass
class PdfAnalysis:
    page_count: int
    pages: list[PageClassification] = field(default_factory=list)
    document_kind: str = "digital"  # digital | scanned | mixed

    @property
    def ocr_page_numbers(self) -> list[int]:
        return [p.page_number for p in self.pages if p.needs_ocr]

    @property
    def native_page_numbers(self) -> list[int]:
        return [p.page_number for p in self.pages if not p.needs_ocr]


def _open_pdf(path: Path):
    try:
        import pypdfium2 as pdfium
    except ImportError as exc:
        raise CorruptedPDFError(
            "pypdfium2 is required for PDF page analysis.",
            details={"reason": "ImportError"},
        ) from exc
    try:
        return pdfium.PdfDocument(str(path))
    except Exception as exc:
        raise CorruptedPDFError(
            "The PDF appears corrupted or unreadable.",
            details={"filename": path.name, "reason": type(exc).__name__},
        ) from exc


def get_page_char_count(page: Any) -> int:
    try:
        textpage = page.get_textpage()
        try:
            text = textpage.get_text_bounded() or ""
        finally:
            textpage.close()
        return len(text.strip())
    except Exception:
        logger.debug("Failed to read native text from PDF page", exc_info=True)
        return 0


def analyze_pdf_pages(
    file_path: str | Path,
    *,
    density_threshold: float = 20.0,
) -> PdfAnalysis:
    """Classify each PDF page as native-extractable or OCR-required.

    Uses the embedded text layer (pypdfium2), not OCR. Pages at or below
    ``density_threshold`` characters are treated as scanned/image pages.
    """
    path = Path(file_path)
    doc = _open_pdf(path)
    try:
        page_count = len(doc)
        pages: list[PageClassification] = []
        for idx in range(page_count):
            page_number = idx + 1
            chars = get_page_char_count(doc[idx])
            needs_ocr = chars <= density_threshold
            mode = "ocr" if needs_ocr else "native"
            pages.append(
                PageClassification(
                    page_number=page_number,
                    char_count=chars,
                    needs_ocr=needs_ocr,
                    mode=mode,
                )
            )
            logger.info(
                "Page %s: %s extraction (native_chars=%s)",
                page_number,
                mode,
                chars,
            )
    finally:
        doc.close()

    if not pages:
        kind = "digital"
    elif all(p.needs_ocr for p in pages):
        kind = "scanned"
    elif any(p.needs_ocr for p in pages):
        kind = "mixed"
    else:
        kind = "digital"

    logger.info("PDF classified as %s (%s pages)", kind, len(pages))
    return PdfAnalysis(page_count=len(pages), pages=pages, document_kind=kind)


def render_pdf_page(
    file_path: str | Path,
    page_number: int,
    *,
    scale: float = 2.0,
) -> Any:
    """Render a 1-based PDF page to a PIL Image for OCR."""
    path = Path(file_path)
    if page_number < 1:
        raise CorruptedPDFError(
            "Invalid PDF page number.",
            details={"page_number": page_number},
        )
    doc = _open_pdf(path)
    try:
        if page_number > len(doc):
            raise CorruptedPDFError(
                "PDF page number out of range.",
                details={"page_number": page_number, "page_count": len(doc)},
            )
        page = doc[page_number - 1]
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil()
        return image.convert("RGB")
    except CorruptedPDFError:
        raise
    except Exception as exc:
        raise CorruptedPDFError(
            "Failed to render PDF page for OCR.",
            details={"page_number": page_number, "reason": type(exc).__name__},
        ) from exc
    finally:
        doc.close()


def render_pdf_pages(
    file_path: str | Path,
    page_numbers: list[int],
    *,
    scale: float = 2.0,
) -> dict[int, Any]:
    """Render multiple pages in one document open (more efficient)."""
    path = Path(file_path)
    if not page_numbers:
        return {}
    doc = _open_pdf(path)
    rendered: dict[int, Any] = {}
    try:
        count = len(doc)
        for page_number in page_numbers:
            if page_number < 1 or page_number > count:
                raise CorruptedPDFError(
                    "PDF page number out of range.",
                    details={"page_number": page_number, "page_count": count},
                )
            page = doc[page_number - 1]
            image = page.render(scale=scale).to_pil().convert("RGB")
            rendered[page_number] = image
            logger.info("Rendered PDF page %s for OCR", page_number)
    finally:
        doc.close()
    return rendered
