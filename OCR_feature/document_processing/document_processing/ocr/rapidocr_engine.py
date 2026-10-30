"""RapidOCR + ONNX Runtime engine (lazy-loaded, reusable)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional, Union

from document_processing.exceptions import CorruptedImageError, OCRFailureError

logger = logging.getLogger(__name__)

ImageInput = Union[str, Path, bytes, Any]  # Any covers numpy arrays / PIL


@dataclass
class OCRLine:
    """Single OCR line/region — mirrors the stable contract fields."""

    text: str
    confidence: Optional[float] = None
    bbox: Optional[list[float]] = None  # [x1, y1, x2, y2]
    page_number: Optional[int] = None
    source: str = "rapidocr"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class OCRPageResult:
    page_number: int
    lines: list[OCRLine] = field(default_factory=list)
    full_text: str = ""
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    engine: str = "rapidocr"
    elapsed_ms: Optional[float] = None

    @property
    def mean_confidence(self) -> Optional[float]:
        scores = [ln.confidence for ln in self.lines if ln.confidence is not None]
        if not scores:
            return None
        return sum(scores) / len(scores)


def quad_to_xyxy(box: Any) -> Optional[list[float]]:
    """Convert a 4-point polygon to axis-aligned [x1, y1, x2, y2]."""
    if box is None:
        return None
    try:
        points = list(box)
        if len(points) == 0:
            return None
        # Flat [x1,y1,x2,y2,...] with 8 values
        if len(points) == 4 and not hasattr(points[0], "__len__"):
            return [float(points[0]), float(points[1]), float(points[2]), float(points[3])]
        if len(points) == 8 and not hasattr(points[0], "__len__"):
            xs = [float(points[i]) for i in range(0, 8, 2)]
            ys = [float(points[i]) for i in range(1, 8, 2)]
            return [min(xs), min(ys), max(xs), max(ys)]
        xs = [float(p[0]) for p in points]
        ys = [float(p[1]) for p in points]
        return [min(xs), min(ys), max(xs), max(ys)]
    except Exception:
        return None


class RapidOCREngine:
    """Lazy-loaded RapidOCR wrapper.

    The underlying ONNX models are initialized once and reused.
    """

    def __init__(
        self,
        *,
        text_score: Optional[float] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> None:
        self._engine = None
        self._text_score = text_score
        self._params = params

    @property
    def is_loaded(self) -> bool:
        return self._engine is not None

    def _get_engine(self):
        if self._engine is None:
            try:
                from rapidocr import RapidOCR
            except ImportError as exc:
                raise OCRFailureError(
                    "RapidOCR is not installed in the environment.",
                    details={"reason": "ImportError"},
                ) from exc
            logger.info("Initializing RapidOCR engine (ONNX Runtime)")
            try:
                self._engine = RapidOCR(params=self._params)
            except Exception as exc:
                raise OCRFailureError(
                    "Failed to initialize RapidOCR.",
                    details={"reason": type(exc).__name__},
                ) from exc
        return self._engine

    def extract(
        self,
        image: ImageInput,
        page_number: Optional[int] = 1,
        *,
        min_confidence: Optional[float] = None,
    ) -> OCRPageResult:
        """Run OCR on an image path, bytes, PIL image, or numpy array."""
        page_no = 1 if page_number is None else int(page_number)
        width, height = self._probe_dimensions(image)

        try:
            engine = self._get_engine()
            kwargs: dict[str, Any] = {}
            if self._text_score is not None:
                kwargs["text_score"] = self._text_score
            content = self._prepare_input(image)
            logger.info("RapidOCR processing page %s", page_no)
            raw = engine(content, **kwargs) if kwargs else engine(content)
        except OCRFailureError:
            raise
        except Exception as exc:
            name = type(exc).__name__
            msg = str(exc).lower()
            if "image" in msg or "decode" in msg or "open" in msg:
                raise CorruptedImageError(
                    "The image appears corrupted or unreadable.",
                    details={"page_number": page_no, "reason": name},
                ) from exc
            raise OCRFailureError(
                "OCR failed while processing the image.",
                details={"page_number": page_no, "reason": name},
            ) from exc

        lines = self._parse_output(raw, page_no=page_no, min_confidence=min_confidence)
        full_text = "\n".join(ln.text for ln in lines if ln.text).strip()
        elapsed_ms = None
        try:
            elapse = getattr(raw, "elapse", None)
            if elapse is not None:
                elapsed_ms = float(elapse) * 1000.0
        except Exception:
            elapsed_ms = None

        return OCRPageResult(
            page_number=page_no,
            lines=lines,
            full_text=full_text,
            image_width=width,
            image_height=height,
            engine="rapidocr",
            elapsed_ms=elapsed_ms,
        )

    def extract_many(
        self,
        images: list[ImageInput],
        *,
        start_page: int = 1,
        min_confidence: Optional[float] = None,
    ) -> list[OCRPageResult]:
        """OCR a sequence of page images, preserving page numbers."""
        results: list[OCRPageResult] = []
        for idx, image in enumerate(images):
            results.append(
                self.extract(
                    image,
                    page_number=start_page + idx,
                    min_confidence=min_confidence,
                )
            )
        return results

    def _prepare_input(self, image: ImageInput) -> Any:
        if isinstance(image, Path):
            if not image.exists():
                raise CorruptedImageError(
                    "Image path does not exist.",
                    details={"path": image.name},
                )
            return str(image)
        if isinstance(image, str):
            return image
        if isinstance(image, (bytes, bytearray)):
            return bytes(image)
        # PIL Image
        if hasattr(image, "convert") and hasattr(image, "size"):
            import numpy as np

            return np.asarray(image.convert("RGB"))
        return image

    def _probe_dimensions(self, image: ImageInput) -> tuple[Optional[int], Optional[int]]:
        try:
            from PIL import Image

            if isinstance(image, (str, Path)):
                with Image.open(image) as im:
                    return int(im.width), int(im.height)
            if hasattr(image, "size") and not hasattr(image, "shape"):
                w, h = image.size
                return int(w), int(h)
            if hasattr(image, "shape"):
                # numpy HWC
                shape = image.shape
                if len(shape) >= 2:
                    return int(shape[1]), int(shape[0])
        except Exception:
            logger.debug("Unable to probe image dimensions", exc_info=True)
        return None, None

    def _parse_output(
        self,
        raw: Any,
        *,
        page_no: int,
        min_confidence: Optional[float],
    ) -> list[OCRLine]:
        if raw is None:
            return []

        boxes = getattr(raw, "boxes", None)
        txts = getattr(raw, "txts", None)
        scores = getattr(raw, "scores", None)

        # Empty detection
        if txts is None:
            # Some versions return empty RapidOCROutput
            return []

        lines: list[OCRLine] = []
        n = len(txts)
        for i in range(n):
            text = str(txts[i]).strip() if txts[i] is not None else ""
            if not text:
                continue

            confidence: Optional[float] = None
            if scores is not None and i < len(scores) and scores[i] is not None:
                try:
                    confidence = float(scores[i])
                except (TypeError, ValueError):
                    confidence = None  # never fabricate

            if min_confidence is not None and confidence is not None:
                if confidence < min_confidence:
                    continue

            bbox = None
            if boxes is not None and i < len(boxes):
                bbox = quad_to_xyxy(boxes[i])

            lines.append(
                OCRLine(
                    text=text,
                    confidence=confidence,
                    bbox=bbox,
                    page_number=page_no,
                    source="rapidocr",
                )
            )
        return lines
