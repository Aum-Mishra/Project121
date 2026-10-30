"""Normalize internal parse results into the stable DocumentResult contract."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any, Optional

from document_processing.detectors.file_detector import DetectionResult
from document_processing.models import (
    DocumentElement,
    DocumentMetadata,
    DocumentResult,
    ElementType,
    ErrorInfo,
    ImageData,
    PageResult,
    ProcessingMetadata,
    ProcessingStatus,
    SourceEngine,
    TableCell,
    TableData,
)
from document_processing.ocr.rapidocr_engine import OCRPageResult
from document_processing.parsers.docling_parser import DoclingParseResult

logger = logging.getLogger(__name__)

_LABEL_TO_ELEMENT: dict[str, ElementType] = {
    "TITLE": ElementType.TITLE,
    "SECTION_HEADER": ElementType.HEADING,
    "PARAGRAPH": ElementType.PARAGRAPH,
    "TEXT": ElementType.PARAGRAPH,
    "LIST_ITEM": ElementType.LIST_ITEM,
    "TABLE": ElementType.TABLE,
    "PICTURE": ElementType.IMAGE,
    "CODE": ElementType.CODE,
    "FORMULA": ElementType.FORMULA,
    "CAPTION": ElementType.CAPTION,
    "FOOTNOTE": ElementType.FOOTNOTE,
    "PAGE_HEADER": ElementType.HEADER,
    "PAGE_FOOTER": ElementType.FOOTER,
    "HANDWRITTEN_TEXT": ElementType.OCR_TEXT,
}


def _map_element_type(label: str) -> ElementType:
    return _LABEL_TO_ELEMENT.get(label.upper(), ElementType.OTHER)


def _table_from_parsed(table, source: SourceEngine = SourceEngine.DOCLING) -> TableData:
    headers: list[str] = []
    rows: list[list[str]] = list(table.grid or [])
    meta_headers = (table.metadata or {}).get("headers")
    if meta_headers and isinstance(meta_headers, list):
        headers = [str(h) for h in meta_headers]

    cells: list[TableCell] = []
    for r_idx, row in enumerate(rows):
        for c_idx, value in enumerate(row):
            cells.append(TableCell(row=r_idx, col=c_idx, text=str(value)))

    return TableData(
        page_number=table.page_no,
        caption=table.caption,
        headers=headers,
        rows=rows,
        cells=cells,
        bbox=table.bbox,
        source=source,
        metadata=dict(table.metadata or {}),
    )


def normalize_docling_result(
    *,
    file_path: str | Path,
    detection: DetectionResult,
    parsed: DoclingParseResult,
    processing_route: Optional[list[str]] = None,
    document_id: Optional[str] = None,
    elapsed_ms: Optional[float] = None,
) -> DocumentResult:
    """Convert DoclingParseResult → DocumentResult."""
    path = Path(file_path)
    route = list(processing_route or ["file_detection", "docling", "normalization"])

    page_map: dict[int, PageResult] = {}

    def ensure_page(num: int) -> PageResult:
        if num not in page_map:
            page_map[num] = PageResult(page_number=num)
        return page_map[num]

    # Elements
    for el in parsed.elements:
        page_no = el.page_no if el.page_no is not None else 1
        page = ensure_page(page_no)
        element = DocumentElement(
            type=_map_element_type(el.label),
            text=el.text or None,
            bbox=el.bbox,
            confidence=None,  # Docling does not provide OCR-style confidence
            source=SourceEngine.DOCLING,
            metadata=dict(el.metadata or {}),
        )
        page.elements.append(element)
        if el.text:
            if page.text:
                page.text += "\n" + el.text
            else:
                page.text = el.text

    # Tables
    normalized_tables: list[TableData] = []
    for t in parsed.tables:
        nt = _table_from_parsed(t)
        normalized_tables.append(nt)
        page_no = t.page_no if t.page_no is not None else 1
        ensure_page(page_no).tables.append(nt)

    # Pictures
    for pic in parsed.pictures:
        page_no = pic.page_no if pic.page_no is not None else 1
        ensure_page(page_no).images.append(
            ImageData(
                page_number=page_no,
                caption=pic.caption,
                bbox=pic.bbox,
                source=SourceEngine.DOCLING,
                metadata=dict(pic.metadata or {}),
            )
        )

    # Ensure at least one page shell when Docling reports pages but no items
    page_count = parsed.page_count or (max(page_map.keys()) if page_map else 0)
    if page_count > 0:
        for i in range(1, page_count + 1):
            ensure_page(i)
    elif not page_map and (parsed.plain_text or parsed.markdown):
        ensure_page(1)
        page_map[1].text = parsed.plain_text or parsed.markdown

    pages = [page_map[k] for k in sorted(page_map.keys())]

    full_text = parsed.plain_text.strip()
    if not full_text:
        full_text = "\n\n".join(p.text for p in pages if p.text).strip()

    markdown = parsed.markdown.strip()
    if not markdown and full_text:
        markdown = full_text

    file_size = None
    try:
        file_size = path.stat().st_size
    except OSError:
        pass

    status = ProcessingStatus.SUCCESS
    if not full_text and not normalized_tables and not any(p.images for p in pages):
        # Empty content is still a successful parse of an empty-ish doc;
        # EmptyDocumentError is raised by the processor when appropriate.
        status = ProcessingStatus.SUCCESS

    logger.info("Normalization completed")

    result = DocumentResult(
        document_id=document_id or uuid.uuid4().hex,
        filename=path.name,
        file_type=detection.internal_type.lower(),
        source=path.name,
        processing_status=status,
        metadata=DocumentMetadata(
            page_count=page_count or len(pages),
            title=parsed.title,
            detected_mime=detection.mime_type,
            file_size_bytes=file_size,
            extra={
                "detection_confidence": detection.confidence,
                "detection_notes": list(detection.notes),
            },
        ),
        pages=pages,
        full_text=full_text,
        markdown=markdown,
        tables=normalized_tables,
        processing_metadata=ProcessingMetadata(
            ocr_used=False,
            vision_used=False,
            ocr_engine=None,
            vision_model=None,
            processing_route=route,
            warnings=list(parsed.raw_warnings),
            elapsed_ms=elapsed_ms,
        ),
        error=None,
    )
    append_tables_to_markdown(result)
    return result


def normalize_ocr_pages(
    *,
    file_path: str | Path,
    detection: DetectionResult,
    ocr_pages: list[OCRPageResult],
    processing_route: Optional[list[str]] = None,
    document_id: Optional[str] = None,
    elapsed_ms: Optional[float] = None,
    warnings: Optional[list[str]] = None,
    image_metadata: Optional[dict[str, Any]] = None,
) -> DocumentResult:
    """Convert RapidOCR page results → DocumentResult."""
    path = Path(file_path)
    route = list(processing_route or ["file_detection", "rapidocr", "normalization"])
    pages: list[PageResult] = []
    img_meta = dict(image_metadata or {})

    for ocr_page in ocr_pages:
        elements = [
            DocumentElement(
                type=ElementType.OCR_TEXT,
                text=line.text,
                bbox=line.bbox,
                confidence=line.confidence,  # None when engine omitted it
                source=SourceEngine.RAPIDOCR,
                metadata=dict(line.metadata or {}),
            )
            for line in ocr_page.lines
        ]
        image_entry_meta = {
            "ocr_engine": ocr_page.engine,
            "line_count": len(ocr_page.lines),
            "mean_confidence": ocr_page.mean_confidence,
        }
        if img_meta:
            image_entry_meta.update(
                {
                    k: v
                    for k, v in img_meta.items()
                    if k in {"format", "dpi", "frame_count"}
                }
            )
        page = PageResult(
            page_number=ocr_page.page_number,
            text=ocr_page.full_text,
            elements=elements,
            tables=[],
            images=[
                ImageData(
                    page_number=ocr_page.page_number,
                    width=ocr_page.image_width,
                    height=ocr_page.image_height,
                    ocr_text=ocr_page.full_text or None,
                    source=SourceEngine.RAPIDOCR,
                    metadata=image_entry_meta,
                )
            ],
            metadata={
                "ocr_engine": ocr_page.engine,
                "mean_confidence": ocr_page.mean_confidence,
                "extraction_mode": "ocr",
                "provenance": "rapidocr",
            },
        )
        pages.append(page)

    if not pages:
        pages = [PageResult(page_number=1, text="")]

    full_text = "\n\n".join(p.text for p in pages if p.text).strip()
    markdown = full_text

    file_size = None
    try:
        file_size = path.stat().st_size
    except OSError:
        pass

    status = (
        ProcessingStatus.SUCCESS
        if full_text
        else ProcessingStatus.PARTIAL
    )

    logger.info("Normalization completed")

    extra = {
        "detection_confidence": detection.confidence,
        "detection_notes": list(detection.notes),
    }
    if img_meta:
        extra["image"] = img_meta

    return DocumentResult(
        document_id=document_id or uuid.uuid4().hex,
        filename=path.name,
        file_type=detection.internal_type.lower(),
        source=path.name,
        processing_status=status,
        metadata=DocumentMetadata(
            page_count=len(pages),
            detected_mime=detection.mime_type,
            file_size_bytes=file_size,
            extra=extra,
        ),
        pages=pages,
        full_text=full_text,
        markdown=markdown,
        tables=[],
        processing_metadata=ProcessingMetadata(
            ocr_used=True,
            vision_used=False,
            ocr_engine="rapidocr",
            vision_model=None,
            processing_route=route,
            warnings=list(warnings or []),
            elapsed_ms=elapsed_ms,
        ),
        error=None,
    )


def merge_ocr_into_page(page: PageResult, ocr_page: OCRPageResult) -> PageResult:
    """Append OCR lines onto an existing page (used by mixed-PDF Phase 3)."""
    for line in ocr_page.lines:
        page.elements.append(
            DocumentElement(
                type=ElementType.OCR_TEXT,
                text=line.text,
                bbox=line.bbox,
                confidence=line.confidence,
                source=SourceEngine.RAPIDOCR,
                metadata=dict(line.metadata or {}),
            )
        )
    if ocr_page.full_text:
        page.text = (
            f"{page.text}\n{ocr_page.full_text}".strip()
            if page.text
            else ocr_page.full_text
        )
    page.metadata["ocr_engine"] = ocr_page.engine
    page.metadata["ocr_mean_confidence"] = ocr_page.mean_confidence
    return page


def replace_page_with_ocr(page: PageResult, ocr_page: OCRPageResult) -> PageResult:
    """Replace page text/elements with OCR while preserving tables.

    Used for scanned pages so RapidOCR is the text provenance, not Docling's
    optional internal OCR.
    """
    preserved_tables = list(page.tables)
    ocr_elements = [
        DocumentElement(
            type=ElementType.OCR_TEXT,
            text=line.text,
            bbox=line.bbox,
            confidence=line.confidence,
            source=SourceEngine.RAPIDOCR,
            metadata=dict(line.metadata or {}),
        )
        for line in ocr_page.lines
    ]
    page.elements = ocr_elements
    page.text = ocr_page.full_text
    page.tables = preserved_tables
    page.images = [
        ImageData(
            page_number=ocr_page.page_number,
            width=ocr_page.image_width,
            height=ocr_page.image_height,
            ocr_text=ocr_page.full_text or None,
            source=SourceEngine.RAPIDOCR,
            metadata={
                "ocr_engine": ocr_page.engine,
                "line_count": len(ocr_page.lines),
                "mean_confidence": ocr_page.mean_confidence,
            },
        )
    ]
    page.metadata["extraction_mode"] = "ocr"
    page.metadata["provenance"] = "rapidocr"
    page.metadata["ocr_engine"] = ocr_page.engine
    page.metadata["ocr_mean_confidence"] = ocr_page.mean_confidence
    return page


def mark_native_pages(result: DocumentResult, native_page_numbers: list[int]) -> None:
    native_set = set(native_page_numbers)
    for page in result.pages:
        if page.page_number in native_set:
            page.metadata.setdefault("extraction_mode", "native")
            page.metadata.setdefault("provenance", "docling")


def table_to_markdown(table: TableData) -> str:
    """Render a TableData as a GitHub-flavored Markdown table."""
    headers = list(table.headers) if table.headers else []
    rows = list(table.rows or [])
    if not headers and rows:
        headers = [str(c) for c in rows[0]]
        body = rows[1:]
    else:
        body = rows[1:] if rows and headers and rows[0] == headers else rows
        if not headers and not body:
            return ""
        if not headers:
            width = max((len(r) for r in body), default=0)
            headers = [f"col_{i + 1}" for i in range(width)]

    width = len(headers)
    lines = [
        "| " + " | ".join(str(h) for h in headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in body:
        padded = [str(c) for c in row] + [""] * max(0, width - len(row))
        lines.append("| " + " | ".join(padded[:width]) + " |")
    caption = f"**{table.caption}**\n\n" if table.caption else ""
    return caption + "\n".join(lines)


def append_tables_to_markdown(result: DocumentResult) -> DocumentResult:
    """Ensure document-level tables appear in markdown when not already present."""
    if not result.tables:
        return result
    md = result.markdown or ""
    # Heuristic: if markdown already has a pipe-table, leave it alone
    if "|" in md and "---" in md:
        return result
    blocks = [md.strip()] if md.strip() else []
    for table in result.tables:
        block = table_to_markdown(table)
        if block:
            blocks.append(block)
    result.markdown = "\n\n".join(blocks).strip()
    return result


def rebuild_document_text(result: DocumentResult) -> DocumentResult:
    """Recompute full_text / markdown from page texts after OCR merges."""
    parts = [p.text for p in result.pages if p.text and p.text.strip()]
    if parts:
        result.full_text = "\n\n".join(parts).strip()
    if result.processing_metadata.ocr_used:
        result.markdown = result.full_text
    elif not result.markdown.strip():
        result.markdown = result.full_text
    append_tables_to_markdown(result)
    return result


def failed_result(
    *,
    file_path: str | Path,
    file_type: str,
    code: str,
    message: str,
    document_id: Optional[str] = None,
    details: Optional[dict] = None,
    route: Optional[list[str]] = None,
) -> DocumentResult:
    path = Path(file_path)
    return DocumentResult(
        document_id=document_id or uuid.uuid4().hex,
        filename=path.name if path.name else "unknown",
        file_type=file_type.lower() if file_type else "unknown",
        source=path.name if path.name else None,
        processing_status=ProcessingStatus.FAILED,
        metadata=DocumentMetadata(),
        pages=[],
        full_text="",
        markdown="",
        tables=[],
        processing_metadata=ProcessingMetadata(
            processing_route=list(route or ["error"]),
        ),
        error=ErrorInfo(code=code, message=message, details=details or {}),
    )
