"""File type detection using extension, MIME, and magic bytes."""

from __future__ import annotations

import logging
import mimetypes
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import filetype

from document_processing.config import (
    FILETYPE_TO_INTERNAL,
    MIME_TO_INTERNAL,
    SUPPORTED_EXTENSIONS,
)
from document_processing.exceptions import InvalidInputPathError, UnsupportedFileTypeError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DetectionResult:
    internal_type: str
    extension: str
    mime_type: Optional[str]
    magic_type: Optional[str]
    confidence: str  # "high" | "medium" | "low"
    notes: tuple[str, ...] = ()


# ZIP-based Office Open XML signatures (PK..) need content inspection
_OOXML_INTERNAL = {
    "word/": "DOCX",
    "ppt/": "PPTX",
    "xl/": "XLSX",
}


def _read_prefix(path: Path, nbytes: int = 64) -> bytes:
    with path.open("rb") as fh:
        return fh.read(nbytes)


def _detect_ooxml(path: Path) -> Optional[str]:
    """Distinguish DOCX/PPTX/XLSX via ZIP package parts."""
    try:
        if not zipfile.is_zipfile(path):
            return None
        with zipfile.ZipFile(path) as zf:
            names = zf.namelist()
            for prefix, itype in _OOXML_INTERNAL.items():
                if any(n.startswith(prefix) for n in names):
                    return itype
            # Content Types fallback
            if "[Content_Types].xml" in names:
                with zf.open("[Content_Types].xml") as ct:
                    data = ct.read(4096).decode("utf-8", errors="ignore").lower()
                if "wordprocessingml" in data:
                    return "DOCX"
                if "presentationml" in data:
                    return "PPTX"
                if "spreadsheetml" in data:
                    return "XLSX"
    except Exception:
        logger.debug("OOXML probe failed for %s", path.name, exc_info=True)
    return None


def _detect_textish(path: Path, prefix: bytes) -> Optional[str]:
    """Best-effort detection for CSV / Markdown / HTML / plain text."""
    ext = path.suffix.lower()
    if ext in SUPPORTED_EXTENSIONS and SUPPORTED_EXTENSIONS[ext] in {
        "CSV",
        "TXT",
        "MARKDOWN",
        "HTML",
    }:
        return SUPPORTED_EXTENSIONS[ext]

    try:
        sample = prefix + path.read_bytes()[len(prefix) : len(prefix) + 4096]
        text = sample.decode("utf-8")
    except (UnicodeDecodeError, OSError):
        return None

    lowered = text.lstrip().lower()
    if lowered.startswith("<!doctype html") or lowered.startswith("<html"):
        return "HTML"
    if path.suffix.lower() in {".md", ".markdown"} or lowered.startswith("# "):
        return "MARKDOWN"
    # crude CSV: multiple commas on first non-empty line
    first_line = next((ln for ln in text.splitlines() if ln.strip()), "")
    if first_line.count(",") >= 2 and "\x00" not in first_line:
        return "CSV"
    if text.isprintable() or "\n" in text:
        return "TXT"
    return None


def detect_file_type(file_path: str | Path) -> DetectionResult:
    """Detect internal document type; raise on missing/unsupported files."""
    path = Path(file_path)

    if ".." in path.parts:
        raise InvalidInputPathError(
            "Path traversal is not allowed.",
            details={"path": str(path)},
        )
    if not path.exists():
        raise InvalidInputPathError(
            f"Input path does not exist: {path.name}",
            details={"path": str(path)},
        )
    if not path.is_file():
        raise InvalidInputPathError(
            "Input path is not a file.",
            details={"path": str(path)},
        )
    if path.stat().st_size == 0:
        # Still detect type if possible; empty handling is processor's job
        pass

    ext = path.suffix.lower()
    ext_type = SUPPORTED_EXTENSIONS.get(ext)

    mime_guess, _ = mimetypes.guess_type(str(path))
    mime_type = MIME_TO_INTERNAL.get(mime_guess or "")

    magic_name: Optional[str] = None
    magic_type: Optional[str] = None
    try:
        kind = filetype.guess(str(path))
        if kind is not None:
            magic_name = kind.extension
            magic_type = FILETYPE_TO_INTERNAL.get(kind.extension)
            if magic_type is None and kind.mime:
                magic_type = MIME_TO_INTERNAL.get(kind.mime)
    except Exception:
        logger.debug("filetype.guess failed for %s", path.name, exc_info=True)

    prefix = b""
    try:
        prefix = _read_prefix(path)
    except OSError as exc:
        raise InvalidInputPathError(
            "Unable to read input file.",
            details={"reason": str(exc)},
        ) from exc

    # PDF magic
    if prefix.startswith(b"%PDF"):
        magic_type = "PDF"
        magic_name = magic_name or "pdf"

    ooxml = None
    if prefix.startswith(b"PK"):
        ooxml = _detect_ooxml(path)
        if ooxml:
            magic_type = ooxml

    textish = None
    if magic_type is None and ooxml is None:
        textish = _detect_textish(path, prefix)

    # Resolve with precedence: magic/OOXML > extension > mime > textish
    candidates = [
        ("magic", magic_type),
        ("extension", ext_type),
        ("mime", mime_type),
        ("text", textish),
    ]
    notes: list[str] = []
    resolved: Optional[str] = None
    source = "unknown"
    for label, value in candidates:
        if value:
            resolved = value
            source = label
            break

    if resolved is None:
        raise UnsupportedFileTypeError(
            "The supplied file type is not supported.",
            details={"extension": ext or None, "mime": mime_guess},
        )

    # Conflict: extension says IMAGE but magic says PDF (etc.)
    if ext_type and magic_type and ext_type != magic_type:
        notes.append(
            f"extension={ext_type} disagrees with magic={magic_type}; using {source}"
        )
        logger.info(
            "File type mismatch for %s: extension=%s magic=%s; resolved=%s via %s",
            path.name,
            ext_type,
            magic_type,
            resolved,
            source,
        )

    confidence = "high" if source in {"magic", "extension"} and not notes else "medium"
    if source in {"mime", "text"}:
        confidence = "low"

    logger.info("Detected file type: %s (via %s)", resolved, source)

    return DetectionResult(
        internal_type=resolved,
        extension=ext,
        mime_type=mime_guess,
        magic_type=magic_name,
        confidence=confidence,
        notes=tuple(notes),
    )


def assert_supported(detection: DetectionResult) -> None:
    if detection.internal_type == "UNKNOWN":
        raise UnsupportedFileTypeError(
            "The supplied file type is not supported.",
        )
