"""Native Office / CSV parsers (DOCX, PPTX, XLSX, CSV).

XLSX and CSV are always handled here — never via OCR.
DOCX/PPTX provide a deterministic native path and Docling fallback source.
"""

from __future__ import annotations

import csv
import logging
from pathlib import Path
from typing import Any, Optional

from document_processing.exceptions import (
    CorruptedFileError,
    EmptyDocumentError,
    InvalidOfficeDocumentError,
)
from document_processing.parsers.docling_parser import (
    DoclingParseResult,
    ParsedElement,
    ParsedPicture,
    ParsedTable,
)

logger = logging.getLogger(__name__)


class OfficeParser:
    """Native extraction for Office and tabular documents."""

    def parse(self, file_path: str | Path, file_type: str) -> DoclingParseResult:
        path = Path(file_path)
        kind = file_type.upper()
        logger.info("Native office parser: type=%s file=%s", kind, path.name)

        if kind == "DOCX":
            return self.parse_docx(path)
        if kind == "PPTX":
            return self.parse_pptx(path)
        if kind == "XLSX":
            return self.parse_xlsx(path)
        if kind == "CSV":
            return self.parse_csv(path)
        raise InvalidOfficeDocumentError(
            f"OfficeParser does not support type {kind}.",
            details={"file_type": kind},
        )

    def parse_docx(self, path: Path) -> DoclingParseResult:
        try:
            from docx import Document
            from docx.table import Table as DocxTable
            from docx.text.paragraph import Paragraph
        except ImportError as exc:
            raise InvalidOfficeDocumentError(
                "python-docx is required for DOCX parsing.",
                details={"reason": "ImportError"},
            ) from exc

        try:
            document = Document(str(path))
        except Exception as exc:
            raise InvalidOfficeDocumentError(
                "The DOCX document appears invalid or corrupted.",
                details={"filename": path.name, "reason": type(exc).__name__},
            ) from exc

        parsed = DoclingParseResult(page_count=1)
        md_parts: list[str] = []

        # Walk body in order (paragraphs + tables)
        for block in document.element.body:
            tag = block.tag.split("}")[-1]
            if tag == "p":
                para = Paragraph(block, document)
                text = (para.text or "").strip()
                if not text:
                    continue
                style = (para.style.name if para.style is not None else "") or ""
                if style.startswith("Heading"):
                    level = "".join(ch for ch in style if ch.isdigit()) or "1"
                    label = "TITLE" if level == "1" else "SECTION_HEADER"
                    md_parts.append("#" * int(level) + f" {text}")
                else:
                    label = "PARAGRAPH"
                    md_parts.append(text)
                parsed.elements.append(
                    ParsedElement(
                        label=label,
                        text=text,
                        page_no=1,
                        metadata={"style": style} if style else {},
                    )
                )
            elif tag == "tbl":
                table = DocxTable(block, document)
                grid = [
                    [(cell.text or "").strip() for cell in row.cells]
                    for row in table.rows
                ]
                headers = grid[0] if grid else []
                parsed.tables.append(
                    ParsedTable(
                        page_no=1,
                        grid=grid,
                        metadata={"headers": headers, "source": "python-docx"},
                    )
                )
                parsed.elements.append(
                    ParsedElement(
                        label="TABLE",
                        text=f"table[{len(parsed.tables)}]",
                        page_no=1,
                        metadata={"table_index": len(parsed.tables) - 1},
                    )
                )
                if grid:
                    md_parts.append(
                        "| "
                        + " | ".join(headers)
                        + " |\n| "
                        + " | ".join("---" for _ in headers)
                        + " |"
                    )
                    for row in grid[1:]:
                        md_parts.append("| " + " | ".join(row) + " |")

        # Embedded images (relationships)
        image_count = 0
        try:
            for rel in document.part.rels.values():
                reltype = getattr(rel, "reltype", "") or ""
                if "image" in reltype:
                    image_count += 1
                    parsed.pictures.append(
                        ParsedPicture(
                            page_no=1,
                            caption=None,
                            metadata={"reltype": reltype, "embedded": True},
                        )
                    )
                    parsed.elements.append(
                        ParsedElement(
                            label="PICTURE",
                            text="",
                            page_no=1,
                            metadata={"embedded": True},
                        )
                    )
        except Exception:
            logger.debug("DOCX image probe failed", exc_info=True)

        parsed.markdown = "\n\n".join(md_parts)
        parsed.plain_text = "\n".join(
            e.text for e in parsed.elements if e.text and e.label != "TABLE"
        )
        parsed.raw_warnings = []
        if image_count:
            parsed.raw_warnings.append(f"embedded_images={image_count}")

        if not parsed.plain_text.strip() and not parsed.tables:
            raise EmptyDocumentError(
                "The DOCX document has no extractable content.",
                details={"filename": path.name},
            )
        return parsed

    def parse_pptx(self, path: Path) -> DoclingParseResult:
        try:
            from pptx import Presentation
            from pptx.enum.shapes import MSO_SHAPE_TYPE
        except ImportError as exc:
            raise InvalidOfficeDocumentError(
                "python-pptx is required for PPTX parsing.",
                details={"reason": "ImportError"},
            ) from exc

        try:
            prs = Presentation(str(path))
        except Exception as exc:
            raise InvalidOfficeDocumentError(
                "The PPTX document appears invalid or corrupted.",
                details={"filename": path.name, "reason": type(exc).__name__},
            ) from exc

        parsed = DoclingParseResult(page_count=len(prs.slides))
        md_parts: list[str] = []
        text_parts: list[str] = []

        for slide_idx, slide in enumerate(prs.slides, start=1):
            slide_texts: list[str] = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        text = "".join(run.text for run in para.runs).strip()
                        if not text:
                            text = (para.text or "").strip()
                        if not text:
                            continue
                        label = "TITLE" if shape == slide.shapes.title else "PARAGRAPH"
                        parsed.elements.append(
                            ParsedElement(
                                label=label,
                                text=text,
                                page_no=slide_idx,
                                metadata={"slide": slide_idx},
                            )
                        )
                        slide_texts.append(text)

                if shape.has_table:
                    table = shape.table
                    grid = [
                        [(cell.text or "").strip() for cell in row.cells]
                        for row in table.rows
                    ]
                    headers = grid[0] if grid else []
                    parsed.tables.append(
                        ParsedTable(
                            page_no=slide_idx,
                            grid=grid,
                            metadata={
                                "headers": headers,
                                "slide": slide_idx,
                                "source": "python-pptx",
                            },
                        )
                    )
                    parsed.elements.append(
                        ParsedElement(
                            label="TABLE",
                            text=f"table[{len(parsed.tables)}]",
                            page_no=slide_idx,
                            metadata={"slide": slide_idx},
                        )
                    )

                if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                    parsed.pictures.append(
                        ParsedPicture(
                            page_no=slide_idx,
                            metadata={"embedded": True, "slide": slide_idx},
                        )
                    )
                    parsed.elements.append(
                        ParsedElement(
                            label="PICTURE",
                            text="",
                            page_no=slide_idx,
                            metadata={"embedded": True, "slide": slide_idx},
                        )
                    )

            if slide_texts:
                md_parts.append(f"## Slide {slide_idx}\n\n" + "\n\n".join(slide_texts))
                text_parts.append("\n".join(slide_texts))

        parsed.markdown = "\n\n".join(md_parts)
        parsed.plain_text = "\n\n".join(text_parts)
        if parsed.page_count == 0:
            parsed.page_count = 1
        if not parsed.plain_text.strip() and not parsed.tables:
            raise EmptyDocumentError(
                "The PPTX document has no extractable content.",
                details={"filename": path.name},
            )
        return parsed

    def parse_xlsx(self, path: Path) -> DoclingParseResult:
        try:
            from openpyxl import load_workbook
        except ImportError as exc:
            raise InvalidOfficeDocumentError(
                "openpyxl is required for XLSX parsing.",
                details={"reason": "ImportError"},
            ) from exc

        try:
            wb = load_workbook(str(path), data_only=True, read_only=True)
        except Exception as exc:
            raise InvalidOfficeDocumentError(
                "The XLSX document appears invalid or corrupted.",
                details={"filename": path.name, "reason": type(exc).__name__},
            ) from exc

        parsed = DoclingParseResult()
        md_parts: list[str] = []
        text_parts: list[str] = []

        try:
            sheet_names = list(wb.sheetnames)
            for sheet_idx, sheet_name in enumerate(sheet_names, start=1):
                ws = wb[sheet_name]
                rows: list[list[str]] = []
                for row in ws.iter_rows(values_only=True):
                    cells = [
                        "" if cell is None else str(cell).strip() for cell in row
                    ]
                    if any(cells):
                        rows.append(cells)

                parsed.elements.append(
                    ParsedElement(
                        label="SECTION_HEADER",
                        text=sheet_name,
                        page_no=sheet_idx,
                        metadata={"sheet_name": sheet_name, "sheet_index": sheet_idx},
                    )
                )

                if rows:
                    headers = rows[0]
                    parsed.tables.append(
                        ParsedTable(
                            page_no=sheet_idx,
                            caption=sheet_name,
                            grid=rows,
                            metadata={
                                "headers": headers,
                                "sheet_name": sheet_name,
                                "sheet_index": sheet_idx,
                                "source": "openpyxl",
                            },
                        )
                    )
                    parsed.elements.append(
                        ParsedElement(
                            label="TABLE",
                            text=sheet_name,
                            page_no=sheet_idx,
                            metadata={
                                "sheet_name": sheet_name,
                                "table_index": len(parsed.tables) - 1,
                            },
                        )
                    )
                    md_parts.append(f"## {sheet_name}")
                    md_parts.append(
                        "| "
                        + " | ".join(headers)
                        + " |\n| "
                        + " | ".join("---" for _ in headers)
                        + " |"
                    )
                    for row in rows[1:]:
                        # pad/truncate to header width for markdown
                        padded = row + [""] * max(0, len(headers) - len(row))
                        md_parts.append(
                            "| " + " | ".join(padded[: len(headers)]) + " |"
                        )
                    text_parts.append(
                        sheet_name
                        + "\n"
                        + "\n".join("\t".join(r) for r in rows)
                    )
                else:
                    md_parts.append(f"## {sheet_name}\n\n_(empty sheet)_")

            parsed.page_count = max(1, len(sheet_names))
            parsed.markdown = "\n\n".join(md_parts)
            parsed.plain_text = "\n\n".join(text_parts)
            parsed.title = sheet_names[0] if sheet_names else None
        finally:
            wb.close()

        if not parsed.tables and not parsed.plain_text.strip():
            raise EmptyDocumentError(
                "The XLSX workbook has no extractable content.",
                details={"filename": path.name},
            )
        return parsed

    def parse_csv(self, path: Path) -> DoclingParseResult:
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as fh:
                sample = fh.read(4096)
                fh.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
                except csv.Error:
                    dialect = csv.excel
                reader = csv.reader(fh, dialect)
                rows = [[(c or "").strip() for c in row] for row in reader]
        except UnicodeDecodeError:
            try:
                with path.open("r", encoding="latin-1", newline="") as fh:
                    reader = csv.reader(fh)
                    rows = [[(c or "").strip() for c in row] for row in reader]
            except Exception as exc:
                raise CorruptedFileError(
                    "The CSV file could not be decoded.",
                    details={"filename": path.name, "reason": type(exc).__name__},
                ) from exc
        except Exception as exc:
            raise CorruptedFileError(
                "The CSV file appears corrupted or unreadable.",
                details={"filename": path.name, "reason": type(exc).__name__},
            ) from exc

        # drop fully empty rows
        rows = [r for r in rows if any(r)]
        if not rows:
            raise EmptyDocumentError(
                "The CSV file is empty.",
                details={"filename": path.name},
            )

        headers = rows[0]
        parsed = DoclingParseResult(page_count=1)
        parsed.tables.append(
            ParsedTable(
                page_no=1,
                caption=path.stem,
                grid=rows,
                metadata={
                    "headers": headers,
                    "sheet_name": path.stem,
                    "source": "csv",
                },
            )
        )
        parsed.elements.append(
            ParsedElement(
                label="TABLE",
                text=path.stem,
                page_no=1,
                metadata={"table_index": 0},
            )
        )
        md = (
            "| "
            + " | ".join(headers)
            + " |\n| "
            + " | ".join("---" for _ in headers)
            + " |"
        )
        for row in rows[1:]:
            padded = row + [""] * max(0, len(headers) - len(row))
            md += "\n| " + " | ".join(padded[: len(headers)]) + " |"
        parsed.markdown = md
        parsed.plain_text = "\n".join("\t".join(r) for r in rows)
        return parsed
