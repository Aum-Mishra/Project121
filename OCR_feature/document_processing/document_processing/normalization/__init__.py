"""Normalization package."""

from document_processing.normalization.normalizer import (
    append_tables_to_markdown,
    failed_result,
    mark_native_pages,
    merge_ocr_into_page,
    normalize_docling_result,
    normalize_ocr_pages,
    rebuild_document_text,
    replace_page_with_ocr,
    table_to_markdown,
)

__all__ = [
    "normalize_docling_result",
    "normalize_ocr_pages",
    "merge_ocr_into_page",
    "replace_page_with_ocr",
    "mark_native_pages",
    "rebuild_document_text",
    "append_tables_to_markdown",
    "table_to_markdown",
    "failed_result",
]
