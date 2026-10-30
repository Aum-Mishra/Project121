"""Phase 4 — multi-format image OCR (PNG/JPG/TIFF/BMP/WEBP)."""

from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from document_processing.detectors.file_detector import detect_file_type
from document_processing.models import ElementType, ProcessingStatus, SourceEngine
from document_processing.parsers.image_loader import load_image_for_ocr
from document_processing.processor import DocumentProcessor

pytestmark = pytest.mark.unit

_PHRASE = "PHASE4 IMAGE OCR"


def _make_text_image(path: Path, fmt: str, size=(520, 140)) -> Path:
    img = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(img)
    draw.text((20, 50), _PHRASE, fill="black")
    save_kwargs: dict = {}
    if fmt.upper() == "JPEG":
        save_kwargs["quality"] = 95
    if fmt.upper() == "TIFF":
        # Pillow uses TIFF
        img.save(path, format="TIFF", **save_kwargs)
    else:
        img.save(path, format=fmt.upper() if fmt.upper() != "JPG" else "JPEG", **save_kwargs)
    return path


@pytest.fixture(scope="module")
def image_format_fixtures(fixtures_dir: Path) -> dict[str, Path]:
    mapping = {
        "png": fixtures_dir / "phase4_text.png",
        "jpeg": fixtures_dir / "phase4_text.jpg",
        "tiff": fixtures_dir / "phase4_text.tiff",
        "bmp": fixtures_dir / "phase4_text.bmp",
        "webp": fixtures_dir / "phase4_text.webp",
    }
    _make_text_image(mapping["png"], "PNG")
    _make_text_image(mapping["jpeg"], "JPEG")
    _make_text_image(mapping["tiff"], "TIFF")
    _make_text_image(mapping["bmp"], "BMP")
    _make_text_image(mapping["webp"], "WEBP")
    return mapping


@pytest.fixture(scope="module")
def blank_image(fixtures_dir: Path) -> Path:
    path = fixtures_dir / "phase4_blank.png"
    Image.new("RGB", (200, 80), "white").save(path)
    return path


@pytest.fixture(scope="module")
def multipage_tiff(fixtures_dir: Path) -> Path:
    path = fixtures_dir / "phase4_multi.tiff"
    frames = []
    for i, text in enumerate(["FRAME ONE OCR", "FRAME TWO OCR"], start=1):
        img = Image.new("RGB", (480, 120), "white")
        ImageDraw.Draw(img).text((20, 40), text, fill="black")
        frames.append(img)
    frames[0].save(
        path,
        format="TIFF",
        save_all=True,
        append_images=frames[1:],
    )
    return path


@pytest.mark.parametrize("fmt", ["png", "jpeg", "tiff", "bmp", "webp"])
def test_detect_image_formats(image_format_fixtures: dict[str, Path], fmt: str):
    result = detect_file_type(image_format_fixtures[fmt])
    assert result.internal_type == "IMAGE"


@pytest.mark.parametrize("fmt", ["png", "jpeg", "bmp", "webp"])
def test_load_image_formats(image_format_fixtures: dict[str, Path], fmt: str):
    loaded = load_image_for_ocr(image_format_fixtures[fmt])
    assert loaded.frame_count == 1
    assert loaded.width > 0 and loaded.height > 0
    assert loaded.frames[0].image.mode == "RGB"


def test_load_tiff(image_format_fixtures: dict[str, Path]):
    loaded = load_image_for_ocr(image_format_fixtures["tiff"])
    assert loaded.format == "TIFF"
    assert loaded.frame_count >= 1


def test_ocr_jpeg_preserves_metadata(image_format_fixtures: dict[str, Path]):
    path = image_format_fixtures["jpeg"]
    result = DocumentProcessor(use_ocr=True, use_smolvlm=False).process(path)

    assert result.processing_status == ProcessingStatus.SUCCESS
    assert result.file_type == "image"
    assert result.processing_metadata.ocr_used is True
    assert result.processing_metadata.ocr_engine == "rapidocr"
    assert result.processing_metadata.vision_used is False
    assert "image_load" in result.processing_metadata.processing_route
    assert "rapidocr" in result.processing_metadata.processing_route

    assert result.metadata.extra.get("image", {}).get("format") in {"JPEG", "JPG"}
    assert result.pages[0].images[0].width
    assert result.pages[0].images[0].height
    assert result.pages[0].images[0].metadata.get("ocr_engine") == "rapidocr"

    upper = result.full_text.upper()
    assert "PHASE4" in upper or "IMAGE" in upper or "OCR" in upper

    els = [e for e in result.pages[0].elements if e.type == ElementType.OCR_TEXT]
    assert els
    assert any(e.bbox is not None for e in els)
    assert any(e.confidence is not None for e in els)
    assert all(e.source == SourceEngine.RAPIDOCR for e in els)


def test_ocr_png_and_bmp(image_format_fixtures: dict[str, Path]):
    processor = DocumentProcessor(use_ocr=True)
    for key in ("png", "bmp"):
        result = processor.process(image_format_fixtures[key])
        assert result.processing_metadata.ocr_used is True
        assert result.full_text
        assert result.processing_status == ProcessingStatus.SUCCESS


def test_blank_image_partial(blank_image: Path):
    result = DocumentProcessor(use_ocr=True).process(blank_image)
    assert result.processing_status == ProcessingStatus.PARTIAL
    assert "no_ocr_text_detected" in result.processing_metadata.warnings
    assert result.processing_metadata.ocr_used is True
    assert result.processing_metadata.vision_used is False


def test_multipage_tiff_page_association(multipage_tiff: Path):
    loaded = load_image_for_ocr(multipage_tiff)
    assert loaded.frame_count == 2

    result = DocumentProcessor(use_ocr=True).process(multipage_tiff)
    assert result.metadata.page_count == 2
    assert len(result.pages) == 2
    assert result.pages[0].page_number == 1
    assert result.pages[1].page_number == 2
    # At least one frame should yield OCR text
    assert result.full_text
    assert result.processing_metadata.ocr_engine == "rapidocr"


def test_corrupt_image_still_structured(fixtures_dir: Path):
    path = fixtures_dir / "corrupt_phase4.jpg"
    path.write_bytes(b"\xff\xd8\xffnot-jpeg")
    result = DocumentProcessor(use_ocr=True).process(path)
    assert result.processing_status == ProcessingStatus.FAILED
    assert result.error is not None
    assert result.error.code in {"CORRUPTED_IMAGE", "OCR_FAILURE", "INTERNAL_ERROR"}
