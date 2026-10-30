"""Image loading / validation for OCR (PNG, JPG, TIFF, BMP, WEBP)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from document_processing.exceptions import CorruptedImageError, EmptyDocumentError

logger = logging.getLogger(__name__)

SUPPORTED_IMAGE_FORMATS = frozenset({"PNG", "JPEG", "JPG", "TIFF", "BMP", "WEBP", "MPO"})


@dataclass
class ImageFrame:
    """One raster frame ready for OCR (RGB PIL image)."""

    image: Any  # PIL.Image.Image
    page_number: int
    width: int
    height: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class LoadedImage:
    path: Path
    format: str
    mode: str
    width: int
    height: int
    frame_count: int
    frames: list[ImageFrame] = field(default_factory=list)
    dpi: Optional[tuple[float, float]] = None
    extra: dict[str, Any] = field(default_factory=dict)


def _normalize_format(fmt: Optional[str]) -> str:
    if not fmt:
        return "UNKNOWN"
    upper = fmt.upper()
    if upper == "JPG":
        return "JPEG"
    return upper


def load_image_for_ocr(file_path: str | Path, *, max_frames: int = 50) -> LoadedImage:
    """Open and validate an image; return RGB frame(s) for RapidOCR.

    Multi-frame TIFF/WEBP: each frame becomes a page (capped by max_frames).
    Ordinary single-frame images yield one page.
    """
    path = Path(file_path)
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError as exc:
        raise CorruptedImageError(
            "Pillow is required for image processing.",
            details={"reason": "ImportError"},
        ) from exc

    try:
        img = Image.open(path)
        img.load()
    except UnidentifiedImageError as exc:
        raise CorruptedImageError(
            "The image appears corrupted or unreadable.",
            details={"filename": path.name, "reason": "UnidentifiedImageError"},
        ) from exc
    except OSError as exc:
        raise CorruptedImageError(
            "The image appears corrupted or unreadable.",
            details={"filename": path.name, "reason": type(exc).__name__},
        ) from exc

    fmt = _normalize_format(img.format)
    # Extension fallback when PIL format is missing
    if fmt == "UNKNOWN":
        ext = path.suffix.lower().lstrip(".")
        mapping = {
            "png": "PNG",
            "jpg": "JPEG",
            "jpeg": "JPEG",
            "tif": "TIFF",
            "tiff": "TIFF",
            "bmp": "BMP",
            "webp": "WEBP",
        }
        fmt = mapping.get(ext, "UNKNOWN")

    if fmt not in SUPPORTED_IMAGE_FORMATS and fmt != "UNKNOWN":
        # Still attempt OCR for exotic PIL formats that opened successfully
        logger.info("Unusual image format %s — attempting OCR anyway", fmt)

    original_mode = img.mode
    width, height = img.size
    if width <= 0 or height <= 0:
        raise CorruptedImageError(
            "The image has invalid dimensions.",
            details={"filename": path.name, "width": width, "height": height},
        )

    dpi = None
    try:
        dpi_info = img.info.get("dpi")
        if dpi_info and len(dpi_info) >= 2:
            dpi = (float(dpi_info[0]), float(dpi_info[1]))
    except Exception:
        dpi = None

    frames: list[ImageFrame] = []
    n_frames = getattr(img, "n_frames", 1) or 1
    n_frames = min(int(n_frames), max_frames)

    for idx in range(n_frames):
        try:
            if n_frames > 1:
                img.seek(idx)
                img.load()
            frame = img.convert("RGB")
            # Copy so subsequent seek does not mutate prior frames
            frame = frame.copy()
        except Exception as exc:
            raise CorruptedImageError(
                "Failed to decode an image frame.",
                details={
                    "filename": path.name,
                    "frame": idx,
                    "reason": type(exc).__name__,
                },
            ) from exc

        fw, fh = frame.size
        frames.append(
            ImageFrame(
                image=frame,
                page_number=idx + 1,
                width=fw,
                height=fh,
                metadata={"source_format": fmt, "frame_index": idx},
            )
        )

    img.close()

    if not frames:
        raise EmptyDocumentError(
            "The image contains no readable frames.",
            details={"filename": path.name},
        )

    logger.info(
        "Loaded image format=%s size=%sx%s frames=%s",
        fmt,
        width,
        height,
        len(frames),
    )

    return LoadedImage(
        path=path,
        format=fmt,
        mode="RGB",
        width=width,
        height=height,
        frame_count=len(frames),
        frames=frames,
        dpi=dpi,
        extra={"original_mode": original_mode},
    )
