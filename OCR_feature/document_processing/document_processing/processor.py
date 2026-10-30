"""High-level DocumentProcessor — the RAG integration boundary."""

from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path
from typing import Optional, Union

from document_processing.config import ProcessorConfig
from document_processing.detectors.file_detector import DetectionResult, detect_file_type
from document_processing.exceptions import (
    DocumentProcessingError,
    EmptyDocumentError,
    UnsupportedFileTypeError,
)
from document_processing.models import (
    DocumentElement,
    DocumentMetadata,
    DocumentResult,
    ElementType,
    PageResult,
    ProcessingMetadata,
    ProcessingStatus,
    SourceEngine,
)
from document_processing.normalization.normalizer import (
    failed_result,
    mark_native_pages,
    normalize_docling_result,
    normalize_ocr_pages,
    rebuild_document_text,
    replace_page_with_ocr,
)
from document_processing.ocr.rapidocr_engine import RapidOCREngine
from document_processing.parsers.docling_parser import DoclingParser
from document_processing.parsers.office_parser import OfficeParser
from document_processing.parsers.pdf_router import analyze_pdf_pages, render_pdf_pages

logger = logging.getLogger(__name__)

_DOCLING_TYPES: set[str] = set()  # reserved; HTML/MD use native parsers
_NATIVE_TEXT_DOC_TYPES = {"HTML", "MARKDOWN"}
_OFFICE_TYPES = {"DOCX", "PPTX", "XLSX", "CSV"}
_TEXT_TYPES = {"TXT"}
_IMAGE_TYPES = {"IMAGE"}
_PDF_TYPES = {"PDF"}


class DocumentProcessor:
    """Process documents into a stable DocumentResult for RAG consumption.

    Phase 1: file detection → Docling → normalization.
    Phase 2: RapidOCR for images (lazy-loaded, reusable).
    Phase 3: digital / scanned / mixed PDF page routing.
    Phase 4: multi-format image load (PNG/JPG/TIFF/BMP/WEBP).
    Phase 5: native Office/CSV parsers + stable DocumentResult.
    Phase 6: optional local SmolVLM visual fallback.
    """

    def __init__(
        self,
        use_ocr: bool = True,
        use_smolvlm: bool = False,
        ocr_confidence_threshold: float = 0.5,
        config: Optional[ProcessorConfig] = None,
    ) -> None:
        if config is not None:
            self.config = config
        else:
            self.config = ProcessorConfig(
                use_ocr=use_ocr,
                use_smolvlm=use_smolvlm,
                ocr_confidence_threshold=ocr_confidence_threshold,
                enable_vision=use_smolvlm,
            )
        self._docling: Optional[DoclingParser] = None
        self._office: Optional[OfficeParser] = None
        self._ocr_engine: Optional[RapidOCREngine] = None
        self._vision_engine = None

    def _get_docling(self) -> DoclingParser:
        if self._docling is None:
            self._docling = DoclingParser()
        return self._docling

    def _get_office(self) -> OfficeParser:
        if self._office is None:
            self._office = OfficeParser()
        return self._office

    def _get_ocr(self) -> RapidOCREngine:
        if self._ocr_engine is None:
            self._ocr_engine = RapidOCREngine(
                text_score=self.config.ocr_confidence_threshold,
            )
        return self._ocr_engine

    def _get_vision(self):
        if self._vision_engine is None:
            from document_processing.vision.smolvlm_engine import VisionEngine

            self._vision_engine = VisionEngine(
                model_id=self.config.smolvlm_model_id,
                device=self.config.smolvlm_device,
            )
        return self._vision_engine

    def process(self, file_path: Union[str, Path]) -> DocumentResult:
        """Process a document and return the normalized DocumentResult."""
        started = time.perf_counter()
        document_id = uuid.uuid4().hex
        path = Path(file_path)
        route: list[str] = []
        detection: Optional[DetectionResult] = None

        try:
            detection = detect_file_type(path)
            route.append("file_detection")
            logger.info("Detected file type: %s", detection.internal_type)

            if detection.internal_type == "UNKNOWN":
                raise UnsupportedFileTypeError(
                    "The supplied file type is not supported.",
                )

            if path.stat().st_size == 0:
                raise EmptyDocumentError(
                    "The document is empty.",
                    details={"filename": path.name},
                )

            if (
                detection.internal_type in _IMAGE_TYPES
                and self.config.use_ocr
                and self.config.enable_rapidocr
            ):
                return self._process_image_ocr(
                    path, detection, document_id, route, started
                )

            if detection.internal_type in _PDF_TYPES:
                return self._process_pdf(
                    path, detection, document_id, route, started
                )

            if detection.internal_type in _OFFICE_TYPES:
                return self._process_office(
                    path, detection, document_id, route, started
                )

            if detection.internal_type in _NATIVE_TEXT_DOC_TYPES:
                return self._process_html_or_markdown(
                    path, detection, document_id, route, started
                )

            if detection.internal_type in _DOCLING_TYPES and self.config.enable_docling:
                return self._process_with_docling(
                    path, detection, document_id, route, started
                )

            if detection.internal_type in _TEXT_TYPES:
                route.extend(["native_text", "normalization"])
                return self._process_plain_text(
                    path, detection, document_id, route, started
                )

            raise UnsupportedFileTypeError(
                "The supplied file type is not supported in the current phase.",
                details={"file_type": detection.internal_type},
            )

        except DocumentProcessingError as exc:
            logger.error(
                "Processing failed code=%s file=%s",
                exc.code,
                path.name,
            )
            detected_type = detection.internal_type if detection else "unknown"
            return failed_result(
                file_path=path,
                file_type=detected_type,
                code=exc.code,
                message=exc.message,
                document_id=document_id,
                details=exc.details,
                route=route + ["error"],
            )
        except Exception as exc:
            logger.exception("Unhandled processing error for %s", path.name)
            return failed_result(
                file_path=path,
                file_type=detection.internal_type if detection else "unknown",
                code="INTERNAL_ERROR",
                message="An internal error occurred while processing the document.",
                document_id=document_id,
                details={"reason": type(exc).__name__},
                route=route + ["error"],
            )

    def process_url(self, url: str) -> DocumentResult:
        """Process an HTTP(S) URL or a local file:// / path-like URL safely."""
        from document_processing.parsers.url_fetcher import fetch_url_content

        started = time.perf_counter()
        document_id = uuid.uuid4().hex
        route: list[str] = ["url_input"]
        try:
            fetched = fetch_url_content(
                url,
                allow_network=self.config.allow_url_network,
                max_bytes=self.config.max_url_bytes,
                timeout_s=self.config.url_timeout_s,
            )
            route.append(fetched.route_label)
            detection = DetectionResult(
                internal_type=fetched.internal_type,
                extension=fetched.extension,
                mime_type=fetched.mime_type,
                magic_type=None,
                confidence="medium",
                notes=("url_input",),
            )
            route.append("file_detection")
            path = fetched.local_path

            if detection.internal_type in _OFFICE_TYPES:
                result = self._process_office(
                    path, detection, document_id, route, started
                )
            elif detection.internal_type in _NATIVE_TEXT_DOC_TYPES:
                result = self._process_html_or_markdown(
                    path, detection, document_id, route, started
                )
            elif detection.internal_type in _DOCLING_TYPES and self.config.enable_docling:
                result = self._process_with_docling(
                    path, detection, document_id, route, started
                )
            elif detection.internal_type in _TEXT_TYPES:
                route.extend(["native_text", "normalization"])
                result = self._process_plain_text(
                    path, detection, document_id, route, started
                )
            elif detection.internal_type in _IMAGE_TYPES:
                result = self._process_image_ocr(
                    path, detection, document_id, route, started
                )
            elif detection.internal_type in _PDF_TYPES:
                result = self._process_pdf(
                    path, detection, document_id, route, started
                )
            else:
                raise UnsupportedFileTypeError(
                    "URL content type is not supported.",
                    details={"file_type": detection.internal_type},
                )

            result.source = fetched.source_label
            result.metadata.extra["url_source"] = fetched.source_label
            return result
        except DocumentProcessingError as exc:
            return failed_result(
                file_path=Path(url.split("/")[-1] or "url"),
                file_type="url",
                code=exc.code,
                message=exc.message,
                document_id=document_id,
                details=exc.details,
                route=route + ["error"],
            )
        except Exception as exc:
            logger.exception("URL processing failed")
            return failed_result(
                file_path=Path("url"),
                file_type="url",
                code="INTERNAL_ERROR",
                message="An internal error occurred while processing the URL.",
                document_id=document_id,
                details={"reason": type(exc).__name__},
                route=route + ["error"],
            )

    def _process_office(
        self,
        path: Path,
        detection: DetectionResult,
        document_id: str,
        route: list[str],
        started: float,
    ) -> DocumentResult:
        """Native Office/CSV path — XLSX/CSV never go through OCR."""
        route.append("office_native")
        logger.info(
            "Processing %s with native OfficeParser (no OCR)",
            detection.internal_type,
        )
        parsed = self._get_office().parse(path, detection.internal_type)
        # Mark provenance as native for tabular/office content
        for el in parsed.elements:
            el.metadata.setdefault("extraction_method", "native_text")
        for table in parsed.tables:
            table.metadata.setdefault("extraction_method", "table_extraction")
            table.metadata.setdefault("provenance", "office_native")

        route.append("normalization")
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        result = normalize_docling_result(
            file_path=path,
            detection=detection,
            parsed=parsed,
            processing_route=route,
            document_id=document_id,
            elapsed_ms=elapsed_ms,
        )
        # Override Docling source tags for native office extraction
        for page in result.pages:
            page.metadata.setdefault("extraction_mode", "native")
            page.metadata.setdefault("provenance", "office_native")
            for el in page.elements:
                if el.source == SourceEngine.DOCLING:
                    el.source = SourceEngine.NATIVE
            for table in page.tables:
                if table.source == SourceEngine.DOCLING:
                    table.source = SourceEngine.NATIVE
            for image in page.images:
                if image.source == SourceEngine.DOCLING:
                    image.source = SourceEngine.NATIVE
        for table in result.tables:
            if table.source == SourceEngine.DOCLING:
                table.source = SourceEngine.NATIVE

        result.processing_metadata.ocr_used = False
        result.processing_metadata.ocr_engine = None

        if (
            not result.full_text.strip()
            and not result.tables
            and not any(p.images for p in result.pages)
        ):
            result.processing_status = ProcessingStatus.PARTIAL
            result.processing_metadata.warnings.append("no_extractable_content")

        return result

    def _process_html_or_markdown(
        self,
        path: Path,
        detection: DetectionResult,
        document_id: str,
        route: list[str],
        started: float,
    ) -> DocumentResult:
        from document_processing.parsers.text_parsers import parse_html, parse_markdown

        route.append("native_markup")
        if detection.internal_type == "HTML":
            parsed = parse_html(path)
        else:
            parsed = parse_markdown(path)

        for el in parsed.elements:
            el.metadata.setdefault("extraction_method", "native_text")
        for table in parsed.tables:
            table.metadata.setdefault("extraction_method", "table_extraction")

        route.append("normalization")
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        result = normalize_docling_result(
            file_path=path,
            detection=detection,
            parsed=parsed,
            processing_route=route,
            document_id=document_id,
            elapsed_ms=elapsed_ms,
        )
        for page in result.pages:
            page.metadata.setdefault("extraction_mode", "native")
            page.metadata.setdefault("provenance", "native_markup")
            for el in page.elements:
                if el.source == SourceEngine.DOCLING:
                    el.source = SourceEngine.NATIVE
            for table in page.tables:
                if table.source == SourceEngine.DOCLING:
                    table.source = SourceEngine.NATIVE
        for table in result.tables:
            if table.source == SourceEngine.DOCLING:
                table.source = SourceEngine.NATIVE
        result.processing_metadata.ocr_used = False
        return result

    def _process_pdf(
        self,
        path: Path,
        detection: DetectionResult,
        document_id: str,
        route: list[str],
        started: float,
    ) -> DocumentResult:
        analysis = analyze_pdf_pages(
            path,
            density_threshold=self.config.scanned_text_density_threshold,
        )
        route.append(f"pdf_{analysis.document_kind}")
        logger.info(
            "PDF kind=%s pages=%s ocr_pages=%s",
            analysis.document_kind,
            analysis.page_count,
            analysis.ocr_page_numbers,
        )

        result: Optional[DocumentResult] = None
        if self.config.enable_docling:
            route.append("docling")
            logger.info("Processing document with Docling")
            parsed = self._get_docling().parse(path)
            result = normalize_docling_result(
                file_path=path,
                detection=detection,
                parsed=parsed,
                processing_route=list(route),
                document_id=document_id,
            )
        else:
            result = DocumentResult(
                document_id=document_id,
                filename=path.name,
                file_type="pdf",
                source=path.name,
                processing_status=ProcessingStatus.SUCCESS,
                metadata=DocumentMetadata(page_count=analysis.page_count),
                pages=[
                    PageResult(page_number=p.page_number)
                    for p in analysis.pages
                ],
                processing_metadata=ProcessingMetadata(processing_route=list(route)),
            )

        existing = {p.page_number for p in result.pages}
        for classification in analysis.pages:
            if classification.page_number not in existing:
                result.pages.append(PageResult(page_number=classification.page_number))
                existing.add(classification.page_number)
        result.pages.sort(key=lambda p: p.page_number)
        result.metadata.page_count = analysis.page_count
        result.metadata.extra["pdf_kind"] = analysis.document_kind
        result.metadata.extra["page_modes"] = {
            str(p.page_number): p.mode for p in analysis.pages
        }

        mark_native_pages(result, analysis.native_page_numbers)

        ocr_applied = False
        if (
            self.config.use_ocr
            and self.config.enable_rapidocr
            and analysis.ocr_page_numbers
        ):
            route.append("rapidocr")
            ocr_engine = self._get_ocr()
            rendered = render_pdf_pages(path, analysis.ocr_page_numbers, scale=2.0)
            for page_number in analysis.ocr_page_numbers:
                logger.info("Page %s: OCR required", page_number)
                logger.info("RapidOCR processing page %s", page_number)
                image = rendered[page_number]
                ocr_page = ocr_engine.extract(image, page_number=page_number)
                target = next(
                    (p for p in result.pages if p.page_number == page_number),
                    None,
                )
                if target is None:
                    target = PageResult(page_number=page_number)
                    result.pages.append(target)
                replace_page_with_ocr(target, ocr_page)
                ocr_applied = True

            result.pages.sort(key=lambda p: p.page_number)
            result.processing_metadata.ocr_used = True
            result.processing_metadata.ocr_engine = "rapidocr"
        elif analysis.document_kind == "digital":
            logger.info("Digital PDF — skipping OCR (native text available)")
            result.processing_metadata.ocr_used = False
            result.processing_metadata.ocr_engine = None
        elif not self.config.use_ocr:
            logger.info("OCR disabled — scanned pages not OCRed")
            result.processing_metadata.warnings.append("ocr_disabled_scanned_pages_skipped")

        route.append("normalization")
        result.processing_metadata.processing_route = list(route)
        rebuild_document_text(result)

        if self.config.use_smolvlm and self.config.enable_vision:
            result = self._maybe_apply_vlm(result, path, route, is_image=False)
        else:
            logger.info("SmolVLM disabled")

        elapsed_ms = (time.perf_counter() - started) * 1000.0
        result.processing_metadata.elapsed_ms = elapsed_ms

        if result.full_text.strip() or result.tables or any(p.images for p in result.pages):
            result.processing_status = ProcessingStatus.SUCCESS
        else:
            result.processing_status = ProcessingStatus.PARTIAL
            result.processing_metadata.warnings.append("no_extractable_content")

        if ocr_applied:
            result.processing_metadata.warnings = [
                w
                for w in result.processing_metadata.warnings
                if w != "ocr_available_not_auto_applied_to_docling_path"
            ]

        return result

    def _process_image_ocr(
        self,
        path: Path,
        detection: DetectionResult,
        document_id: str,
        route: list[str],
        started: float,
    ) -> DocumentResult:
        from document_processing.parsers.image_loader import load_image_for_ocr

        route.append("image_load")
        loaded = load_image_for_ocr(path)
        route.append("rapidocr")
        logger.info(
            "RapidOCR processing image: %s (format=%s frames=%s)",
            path.name,
            loaded.format,
            loaded.frame_count,
        )

        ocr_engine = self._get_ocr()
        ocr_pages = []
        for frame in loaded.frames:
            ocr_pages.append(
                ocr_engine.extract(
                    frame.image,
                    page_number=frame.page_number,
                    min_confidence=None,
                )
            )

        route.append("normalization")
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        warnings: list[str] = []

        image_metadata = {
            "format": loaded.format,
            "width": loaded.width,
            "height": loaded.height,
            "frame_count": loaded.frame_count,
            "dpi": list(loaded.dpi) if loaded.dpi else None,
            "ocr_engine": "rapidocr",
        }

        result = normalize_ocr_pages(
            file_path=path,
            detection=detection,
            ocr_pages=ocr_pages,
            processing_route=route,
            document_id=document_id,
            elapsed_ms=elapsed_ms,
            warnings=warnings,
            image_metadata=image_metadata,
        )
        if result.pages and result.pages[0].images:
            result.pages[0].images[0].width = (
                result.pages[0].images[0].width or loaded.width
            )
            result.pages[0].images[0].height = (
                result.pages[0].images[0].height or loaded.height
            )

        if not result.full_text.strip():
            result.processing_status = ProcessingStatus.PARTIAL
            result.processing_metadata.warnings.append("no_ocr_text_detected")

        # Phase 6: VLM fallback for difficult visual content
        if self.config.use_smolvlm and self.config.enable_vision:
            result = self._maybe_apply_vlm(
                result,
                path,
                route,
                is_image=True,
                pil_frames=[f.image for f in loaded.frames],
            )
        else:
            logger.info("SmolVLM disabled")

        result.processing_metadata.processing_route = list(route)
        result.processing_metadata.elapsed_ms = (time.perf_counter() - started) * 1000.0
        return result

    def _maybe_apply_vlm(
        self,
        result: DocumentResult,
        path: Path,
        route: list[str],
        *,
        is_image: bool,
        pil_frames: Optional[list] = None,
    ) -> DocumentResult:
        """Optional local VLM enrichment when OCR/native quality is insufficient."""
        from document_processing.vision.quality import needs_visual_fallback

        if not needs_visual_fallback(result, is_image=is_image):
            logger.info("VLM skipped — OCR/native quality sufficient")
            return result

        try:
            vision = self._get_vision()
            route.append("smolvlm")
            logger.info("Invoking local SmolVLM visual fallback")

            if pil_frames:
                for idx, image in enumerate(pil_frames, start=1):
                    analysis = vision.analyze_visual_content(
                        image,
                        context=f"Document page {idx} from {path.name}",
                    )
                    self._merge_vlm_into_result(result, analysis, page_number=idx)
            else:
                # For non-image inputs, only enrich when page images exist
                result.processing_metadata.warnings.append(
                    "vlm_no_renderable_frames_skipped"
                )
                return result

            result.processing_metadata.vision_used = True
            result.processing_metadata.vision_model = vision.model_id
            if result.full_text.strip() or any(
                el.type == ElementType.VISUAL_INTERPRETATION
                for p in result.pages
                for el in p.elements
            ):
                if result.processing_status == ProcessingStatus.PARTIAL:
                    result.processing_status = ProcessingStatus.SUCCESS
        except Exception as exc:
            logger.warning("SmolVLM fallback failed: %s", type(exc).__name__)
            result.processing_metadata.warnings.append(
                f"vlm_fallback_failed:{type(exc).__name__}"
            )
        return result

    def _merge_vlm_into_result(
        self,
        result: DocumentResult,
        analysis: dict,
        *,
        page_number: int,
    ) -> None:
        text = (analysis.get("text") or analysis.get("description") or "").strip()
        if not text:
            return
        page = next((p for p in result.pages if p.page_number == page_number), None)
        if page is None:
            page = PageResult(page_number=page_number)
            result.pages.append(page)
            result.pages.sort(key=lambda p: p.page_number)

        page.elements.append(
            DocumentElement(
                type=ElementType.VISUAL_INTERPRETATION,
                text=text,
                bbox=None,
                confidence=analysis.get("confidence"),
                source=SourceEngine.SMOLVLM,
                metadata={
                    "extraction_method": "image_extraction",
                    "model": analysis.get("model"),
                },
            )
        )
        if page.text:
            page.text = f"{page.text}\n{text}".strip()
        else:
            page.text = text
        for image in page.images:
            if not image.visual_description:
                image.visual_description = text
                image.source = SourceEngine.SMOLVLM

        rebuild_document_text(result)

    def _process_with_docling(
        self,
        path: Path,
        detection: DetectionResult,
        document_id: str,
        route: list[str],
        started: float,
    ) -> DocumentResult:
        route.append("docling")
        logger.info("Processing document with Docling")
        parsed = self._get_docling().parse(path)
        route.append("normalization")
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        result = normalize_docling_result(
            file_path=path,
            detection=detection,
            parsed=parsed,
            processing_route=route,
            document_id=document_id,
            elapsed_ms=elapsed_ms,
        )

        if self.config.use_smolvlm and self.config.enable_vision:
            result = self._maybe_apply_vlm(result, path, route, is_image=False)
        else:
            logger.info("SmolVLM disabled")

        if (
            not result.full_text.strip()
            and not result.tables
            and not any(p.images for p in result.pages)
        ):
            result.processing_status = ProcessingStatus.PARTIAL
            result.processing_metadata.warnings.append("no_extractable_content")

        return result

    def _process_plain_text(
        self,
        path: Path,
        detection: DetectionResult,
        document_id: str,
        route: list[str],
        started: float,
    ) -> DocumentResult:
        text = path.read_text(encoding="utf-8", errors="replace")
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        page = PageResult(
            page_number=1,
            text=text,
            elements=[
                DocumentElement(
                    type=ElementType.PARAGRAPH,
                    text=text,
                    bbox=None,
                    confidence=None,
                    source=SourceEngine.NATIVE,
                    metadata={"extraction_method": "native_text"},
                )
            ],
            metadata={"extraction_mode": "native", "provenance": "native_text"},
        )
        return DocumentResult(
            document_id=document_id,
            filename=path.name,
            file_type=detection.internal_type.lower(),
            source=path.name,
            processing_status=ProcessingStatus.SUCCESS
            if text.strip()
            else ProcessingStatus.PARTIAL,
            metadata=DocumentMetadata(
                page_count=1,
                detected_mime=detection.mime_type,
                file_size_bytes=path.stat().st_size,
            ),
            pages=[page],
            full_text=text,
            markdown=text,
            tables=[],
            processing_metadata=ProcessingMetadata(
                ocr_used=False,
                vision_used=False,
                processing_route=route,
                elapsed_ms=elapsed_ms,
            ),
        )
