"""Docling-backed document parsing (primary structure/layout engine)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from document_processing.exceptions import CorruptedFileError, DoclingFailureError

logger = logging.getLogger(__name__)


@dataclass
class ParsedElement:
    label: str
    text: str
    page_no: Optional[int] = None
    bbox: Optional[list[float]] = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedTable:
    page_no: Optional[int] = None
    caption: Optional[str] = None
    grid: list[list[str]] = field(default_factory=list)
    bbox: Optional[list[float]] = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedPicture:
    page_no: Optional[int] = None
    caption: Optional[str] = None
    bbox: Optional[list[float]] = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class DoclingParseResult:
    """Internal Docling parse output (not exposed to RAG)."""

    elements: list[ParsedElement] = field(default_factory=list)
    tables: list[ParsedTable] = field(default_factory=list)
    pictures: list[ParsedPicture] = field(default_factory=list)
    markdown: str = ""
    plain_text: str = ""
    page_count: int = 0
    title: Optional[str] = None
    raw_warnings: list[str] = field(default_factory=list)


def _bbox_to_xyxy(bbox: Any) -> Optional[list[float]]:
    if bbox is None:
        return None
    try:
        # Docling BoundingBox: l, t, r, b
        return [float(bbox.l), float(bbox.t), float(bbox.r), float(bbox.b)]
    except Exception:
        return None


def _first_prov(item: Any) -> tuple[Optional[int], Optional[list[float]]]:
    prov = getattr(item, "prov", None) or []
    if not prov:
        return None, None
    p0 = prov[0]
    page_no = getattr(p0, "page_no", None)
    bbox = _bbox_to_xyxy(getattr(p0, "bbox", None))
    return page_no, bbox


class DoclingParser:
    """Thin wrapper around Docling DocumentConverter.

    Keeps Docling types inside this module so callers never import docling.
    """

    def __init__(self) -> None:
        self._converter = None

    def _get_converter(self):
        if self._converter is None:
            from docling.document_converter import DocumentConverter

            logger.info("Initializing Docling DocumentConverter")
            self._converter = DocumentConverter()
        return self._converter

    def parse(self, file_path: str | Path) -> DoclingParseResult:
        path = Path(file_path)
        logger.info("Processing document with Docling: %s", path.name)

        try:
            converter = self._get_converter()
            result = converter.convert(str(path))
        except Exception as exc:
            msg = str(exc).lower()
            if "corrupt" in msg or "invalid" in msg or "cannot open" in msg:
                raise CorruptedFileError(
                    "The document appears corrupted or unreadable.",
                    details={"filename": path.name},
                ) from exc
            raise DoclingFailureError(
                "Docling failed to process the document.",
                details={"filename": path.name, "reason": type(exc).__name__},
            ) from exc

        doc = result.document
        parsed = DoclingParseResult()

        try:
            parsed.page_count = int(doc.num_pages()) if hasattr(doc, "num_pages") else 0
        except Exception:
            parsed.page_count = 0

        try:
            parsed.markdown = doc.export_to_markdown() or ""
        except Exception:
            parsed.markdown = ""
            parsed.raw_warnings.append("markdown_export_failed")

        try:
            if hasattr(doc, "export_to_text"):
                parsed.plain_text = doc.export_to_text() or ""
            elif hasattr(doc, "export_to_plaintext"):
                parsed.plain_text = doc.export_to_plaintext() or ""
        except Exception:
            parsed.plain_text = ""
            parsed.raw_warnings.append("text_export_failed")

        name = getattr(doc, "name", None)
        if isinstance(name, str) and name.strip():
            parsed.title = name.strip()

        self._extract_items(doc, parsed)

        if parsed.page_count == 0 and parsed.elements:
            pages = {e.page_no for e in parsed.elements if e.page_no is not None}
            parsed.page_count = max(pages) if pages else 1

        logger.info(
            "Docling extraction complete: pages=%s elements=%s tables=%s",
            parsed.page_count,
            len(parsed.elements),
            len(parsed.tables),
        )
        return parsed

    def _extract_items(self, doc: Any, parsed: DoclingParseResult) -> None:
        from docling_core.types.doc import DocItemLabel, PictureItem, TableItem, TextItem

        try:
            iterator = doc.iterate_items()
        except Exception as exc:
            raise DoclingFailureError(
                "Docling failed while iterating document items.",
                details={"reason": type(exc).__name__},
            ) from exc

        for item, _level in iterator:
            page_no, bbox = _first_prov(item)
            label = getattr(getattr(item, "label", None), "name", None) or str(
                getattr(item, "label", "OTHER")
            )

            if isinstance(item, TableItem) or label == DocItemLabel.TABLE.name:
                grid: list[list[str]] = []
                try:
                    # Prefer export_to_dataframe when available
                    if hasattr(item, "export_to_dataframe"):
                        df = item.export_to_dataframe(doc=doc)
                        grid = df.fillna("").astype(str).values.tolist()
                        headers = [str(c) for c in df.columns.tolist()]
                        # If columns are default RangeIndex, keep as first row already in values
                        meta = {"headers": headers}
                    elif hasattr(item, "data") and getattr(item.data, "grid", None):
                        raw_grid = item.data.grid
                        for row in raw_grid:
                            grid.append(
                                [
                                    (getattr(cell, "text", None) or str(cell) or "")
                                    for cell in row
                                ]
                            )
                        meta = {}
                    else:
                        meta = {}
                except Exception:
                    grid = []
                    meta = {"table_extract_warning": True}

                caption = None
                if hasattr(item, "caption_text"):
                    try:
                        caption = item.caption_text(doc=doc)
                    except Exception:
                        caption = None

                parsed.tables.append(
                    ParsedTable(
                        page_no=page_no,
                        caption=caption,
                        grid=grid,
                        bbox=bbox,
                        metadata=meta,
                    )
                )
                # Also record a lightweight element reference
                parsed.elements.append(
                    ParsedElement(
                        label="TABLE",
                        text=caption or f"table[{len(parsed.tables)}]",
                        page_no=page_no,
                        bbox=bbox,
                        metadata={"table_index": len(parsed.tables) - 1},
                    )
                )
                continue

            if isinstance(item, PictureItem) or label == DocItemLabel.PICTURE.name:
                caption = None
                if hasattr(item, "caption_text"):
                    try:
                        caption = item.caption_text(doc=doc)
                    except Exception:
                        caption = None
                parsed.pictures.append(
                    ParsedPicture(page_no=page_no, caption=caption, bbox=bbox)
                )
                parsed.elements.append(
                    ParsedElement(
                        label="PICTURE",
                        text=caption or "",
                        page_no=page_no,
                        bbox=bbox,
                    )
                )
                continue

            text = ""
            if isinstance(item, TextItem) or hasattr(item, "text"):
                text = getattr(item, "text", None) or getattr(item, "orig", None) or ""
            text = text.strip() if isinstance(text, str) else ""
            if not text and label not in {"PICTURE", "TABLE"}:
                continue

            parsed.elements.append(
                ParsedElement(
                    label=label,
                    text=text,
                    page_no=page_no,
                    bbox=bbox,
                )
            )
