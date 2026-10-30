"""Stable Pydantic data contract consumed by the RAG pipeline.

Internal engines (Docling / RapidOCR / SmolVLM) must not leak into this schema.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ProcessingStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


class ElementType(str, Enum):
    TITLE = "title"
    HEADING = "heading"
    PARAGRAPH = "paragraph"
    LIST_ITEM = "list_item"
    TABLE = "table"
    IMAGE = "image"
    CODE = "code"
    FORMULA = "formula"
    CAPTION = "caption"
    FOOTNOTE = "footnote"
    HEADER = "header"
    FOOTER = "footer"
    OCR_TEXT = "ocr_text"
    VISUAL_INTERPRETATION = "visual_interpretation"
    OTHER = "other"


class SourceEngine(str, Enum):
    DOCLING = "docling"
    RAPIDOCR = "rapidocr"
    SMOLVLM = "smolvlm"
    NATIVE = "native"
    UNKNOWN = "unknown"


class BBox(BaseModel):
    """Axis-aligned bounding box in document page coordinates [x1, y1, x2, y2]."""

    x1: float
    y1: float
    x2: float
    y2: float

    def as_list(self) -> list[float]:
        return [self.x1, self.y1, self.x2, self.y2]

    @classmethod
    def from_xyxy(
        cls, values: Optional[list[float] | tuple[float, float, float, float]]
    ) -> Optional["BBox"]:
        if values is None or len(values) != 4:
            return None
        return cls(x1=float(values[0]), y1=float(values[1]), x2=float(values[2]), y2=float(values[3]))


class DocumentElement(BaseModel):
    type: ElementType = ElementType.OTHER
    text: Optional[str] = None
    bbox: Optional[list[float]] = Field(
        default=None,
        description="[x1, y1, x2, y2] or null when unavailable",
    )
    confidence: Optional[float] = Field(
        default=None,
        description="Engine confidence in [0, 1]; null when unknown (never fabricated)",
    )
    source: SourceEngine = SourceEngine.UNKNOWN
    metadata: dict[str, Any] = Field(default_factory=dict)


class TableCell(BaseModel):
    row: int
    col: int
    text: str = ""
    row_span: int = 1
    col_span: int = 1


class TableData(BaseModel):
    page_number: Optional[int] = None
    caption: Optional[str] = None
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    cells: list[TableCell] = Field(default_factory=list)
    bbox: Optional[list[float]] = None
    source: SourceEngine = SourceEngine.DOCLING
    metadata: dict[str, Any] = Field(default_factory=dict)


class ImageData(BaseModel):
    page_number: Optional[int] = None
    caption: Optional[str] = None
    bbox: Optional[list[float]] = None
    width: Optional[int] = None
    height: Optional[int] = None
    ocr_text: Optional[str] = None
    visual_description: Optional[str] = None
    source: SourceEngine = SourceEngine.DOCLING
    metadata: dict[str, Any] = Field(default_factory=dict)


class PageResult(BaseModel):
    page_number: int
    text: str = ""
    elements: list[DocumentElement] = Field(default_factory=list)
    tables: list[TableData] = Field(default_factory=list)
    images: list[ImageData] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentMetadata(BaseModel):
    page_count: int = 0
    title: Optional[str] = None
    author: Optional[str] = None
    language: Optional[str] = None
    detected_mime: Optional[str] = None
    file_size_bytes: Optional[int] = None
    extra: dict[str, Any] = Field(default_factory=dict)


class ProcessingMetadata(BaseModel):
    ocr_used: bool = False
    vision_used: bool = False
    ocr_engine: Optional[str] = None
    vision_model: Optional[str] = None
    processing_route: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    elapsed_ms: Optional[float] = None


class ErrorInfo(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class DocumentResult(BaseModel):
    """Normalized document output — the only contract the RAG layer should depend on."""

    document_id: str
    filename: str
    file_type: str
    source: Optional[str] = Field(
        default=None,
        description="Input source identifier (filename or safe URL); never an absolute local path",
    )
    processing_status: ProcessingStatus
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)
    pages: list[PageResult] = Field(default_factory=list)
    full_text: str = ""
    markdown: str = ""
    tables: list[TableData] = Field(default_factory=list)
    processing_metadata: ProcessingMetadata = Field(default_factory=ProcessingMetadata)
    error: Optional[ErrorInfo] = None

    def to_rag_payload(self) -> dict[str, Any]:
        """Convenience dict for teammates who prefer plain JSON."""
        return self.model_dump(mode="json")
