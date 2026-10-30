"""Native HTML and Markdown parsers (offline-safe, no Docling required)."""

from __future__ import annotations

import logging
import re
from html.parser import HTMLParser
from pathlib import Path

from document_processing.exceptions import EmptyDocumentError
from document_processing.parsers.docling_parser import (
    DoclingParseResult,
    ParsedElement,
    ParsedTable,
)

logger = logging.getLogger(__name__)


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.elements: list[ParsedElement] = []
        self._capture = True
        self._skip_depth = 0
        self._buf: list[str] = []
        self._current_tag: str | None = None
        self._in_table = False
        self._table_rows: list[list[str]] = []
        self._row: list[str] = []
        self._cell_buf: list[str] = []
        self._in_cell = False
        self.tables: list[ParsedTable] = []
        self.title: str | None = None

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "title"}:
            self._flush_inline()
            self._current_tag = tag
            self._buf = []
        elif tag == "br":
            self._buf.append("\n")
        elif tag == "table":
            self._flush_inline()
            self._in_table = True
            self._table_rows = []
        elif tag == "tr" and self._in_table:
            self._row = []
        elif tag in {"td", "th"} and self._in_table:
            self._in_cell = True
            self._cell_buf = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "noscript"}:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth:
            return
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "title"}:
            text = " ".join("".join(self._buf).split()).strip()
            self._buf = []
            if text:
                if tag == "title":
                    self.title = text
                    label = "TITLE"
                elif tag.startswith("h"):
                    label = "TITLE" if tag == "h1" else "SECTION_HEADER"
                elif tag == "li":
                    label = "LIST_ITEM"
                else:
                    label = "PARAGRAPH"
                self.elements.append(
                    ParsedElement(label=label, text=text, page_no=1)
                )
            self._current_tag = None
        elif tag in {"td", "th"} and self._in_table:
            cell = " ".join("".join(self._cell_buf).split()).strip()
            self._row.append(cell)
            self._in_cell = False
            self._cell_buf = []
        elif tag == "tr" and self._in_table:
            if any(self._row):
                self._table_rows.append(self._row)
            self._row = []
        elif tag == "table" and self._in_table:
            if self._table_rows:
                headers = self._table_rows[0]
                self.tables.append(
                    ParsedTable(
                        page_no=1,
                        grid=self._table_rows,
                        metadata={"headers": headers, "source": "html_native"},
                    )
                )
            self._in_table = False
            self._table_rows = []

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._in_cell:
            self._cell_buf.append(data)
        elif self._current_tag:
            self._buf.append(data)

    def _flush_inline(self) -> None:
        pass


def parse_html(path: Path) -> DoclingParseResult:
    logger.info("Native HTML parser: %s", path.name)
    raw = path.read_text(encoding="utf-8", errors="replace")
    extractor = _HTMLTextExtractor()
    extractor.feed(raw)
    extractor.close()

    parsed = DoclingParseResult(
        elements=extractor.elements,
        tables=extractor.tables,
        page_count=1,
        title=extractor.title,
    )
    text_parts = [e.text for e in extractor.elements if e.text]
    parsed.plain_text = "\n".join(text_parts)
    md_parts: list[str] = []
    for e in extractor.elements:
        if e.label == "TITLE":
            md_parts.append(f"# {e.text}")
        elif e.label == "SECTION_HEADER":
            md_parts.append(f"## {e.text}")
        elif e.label == "LIST_ITEM":
            md_parts.append(f"- {e.text}")
        else:
            md_parts.append(e.text)
    for table in extractor.tables:
        headers = table.metadata.get("headers") or (table.grid[0] if table.grid else [])
        if headers:
            md_parts.append(
                "| "
                + " | ".join(str(h) for h in headers)
                + " |\n| "
                + " | ".join("---" for _ in headers)
                + " |"
            )
            for row in table.grid[1:]:
                padded = list(row) + [""] * max(0, len(headers) - len(row))
                md_parts.append("| " + " | ".join(padded[: len(headers)]) + " |")
    parsed.markdown = "\n\n".join(md_parts)

    if not parsed.plain_text.strip() and not parsed.tables:
        # Fallback: strip tags roughly
        stripped = re.sub(r"<[^>]+>", " ", raw)
        stripped = re.sub(r"\s+", " ", stripped).strip()
        if not stripped:
            raise EmptyDocumentError(
                "The HTML document has no extractable content.",
                details={"filename": path.name},
            )
        parsed.plain_text = stripped
        parsed.markdown = stripped
        parsed.elements = [
            ParsedElement(label="PARAGRAPH", text=stripped, page_no=1)
        ]
    return parsed


def parse_markdown(path: Path) -> DoclingParseResult:
    logger.info("Native Markdown parser: %s", path.name)
    raw = path.read_text(encoding="utf-8", errors="replace")
    if not raw.strip():
        raise EmptyDocumentError(
            "The Markdown document is empty.",
            details={"filename": path.name},
        )

    parsed = DoclingParseResult(page_count=1, markdown=raw, plain_text="")
    text_parts: list[str] = []
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            level = len(s) - len(s.lstrip("#"))
            text = s[level:].strip()
            label = "TITLE" if level <= 1 else "SECTION_HEADER"
            parsed.elements.append(
                ParsedElement(label=label, text=text, page_no=1)
            )
            text_parts.append(text)
        elif s.startswith(("- ", "* ", "+ ")):
            text = s[2:].strip()
            parsed.elements.append(
                ParsedElement(label="LIST_ITEM", text=text, page_no=1)
            )
            text_parts.append(text)
        elif s.startswith("|") and "---" not in s:
            # collect as paragraph; full table parse is best-effort
            cells = [c.strip() for c in s.strip("|").split("|")]
            text_parts.append("\t".join(cells))
            parsed.elements.append(
                ParsedElement(label="PARAGRAPH", text=" | ".join(cells), page_no=1)
            )
        else:
            parsed.elements.append(
                ParsedElement(label="PARAGRAPH", text=s, page_no=1)
            )
            text_parts.append(s)

    # Extract GFM tables
    rows: list[list[str]] = []
    in_table = False
    for line in raw.splitlines():
        s = line.strip()
        if s.startswith("|") and "|" in s[1:]:
            if re.match(r"^\|?\s*:?-{3,}", s):
                in_table = True
                continue
            cells = [c.strip() for c in s.strip("|").split("|")]
            rows.append(cells)
            in_table = True
        else:
            if in_table and rows:
                headers = rows[0]
                parsed.tables.append(
                    ParsedTable(
                        page_no=1,
                        grid=rows,
                        metadata={"headers": headers, "source": "markdown_native"},
                    )
                )
                rows = []
            in_table = False
    if rows:
        headers = rows[0]
        parsed.tables.append(
            ParsedTable(
                page_no=1,
                grid=rows,
                metadata={"headers": headers, "source": "markdown_native"},
            )
        )

    parsed.plain_text = "\n".join(text_parts)
    return parsed
