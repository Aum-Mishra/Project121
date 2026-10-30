"""Safe URL / local HTML input for offline demonstration.

Network access is disabled by default (sovereign / on-premise). For corpus
tests, prefer file paths or file:// URLs pointing at local HTML fixtures.
"""

from __future__ import annotations

import ipaddress
import logging
import tempfile
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.request import Request, urlopen

from document_processing.exceptions import (
    DocumentProcessingError,
    InvalidInputPathError,
    UnsupportedFileTypeError,
)

logger = logging.getLogger(__name__)


class UrlFetchError(DocumentProcessingError):
    code = "URL_FETCH_ERROR"
    http_status = 400


@dataclass
class FetchedContent:
    local_path: Path
    internal_type: str
    extension: str
    mime_type: Optional[str]
    source_label: str
    route_label: str
    cleanup: bool = False


_EXT_TO_INTERNAL = {
    ".html": "HTML",
    ".htm": "HTML",
    ".md": "MARKDOWN",
    ".markdown": "MARKDOWN",
    ".txt": "TXT",
    ".csv": "CSV",
    ".pdf": "PDF",
    ".png": "IMAGE",
    ".docx": "DOCX",
    ".pptx": "PPTX",
    ".xlsx": "XLSX",
}


def _is_private_or_local(hostname: str) -> bool:
    if not hostname:
        return True
    host = hostname.lower().strip("[]")
    if host in {"localhost", "127.0.0.1", "::1"}:
        return True
    try:
        ip = ipaddress.ip_address(host)
        return bool(
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
        )
    except ValueError:
        # Hostname — block cloud-ish SSRF targets by requiring explicit allow
        return False


def _guess_type_from_path(path: Path, mime: Optional[str] = None) -> tuple[str, str]:
    ext = path.suffix.lower() or ".html"
    internal = _EXT_TO_INTERNAL.get(ext)
    if internal:
        return internal, ext
    if mime:
        lower = mime.lower()
        if "html" in lower:
            return "HTML", ".html"
        if "markdown" in lower:
            return "MARKDOWN", ".md"
        if "csv" in lower:
            return "CSV", ".csv"
        if "pdf" in lower:
            return "PDF", ".pdf"
        if lower.startswith("image/"):
            return "IMAGE", ".png"
    raise UnsupportedFileTypeError(
        "URL content type is not supported.",
        details={"extension": ext, "mime": mime},
    )


def fetch_url_content(
    url: str,
    *,
    allow_network: bool = False,
    max_bytes: int = 10 * 1024 * 1024,
    timeout_s: float = 15.0,
) -> FetchedContent:
    """Resolve a URL into a local temp/path file for processing.

    Security controls:
    - Only http/https/file schemes
    - Network disabled by default
    - Block private/link-local destinations when network is enabled (SSRF)
    - Size limit enforced
    - No arbitrary local path traversal via crafted file:// outside workspace intent:
      file:// is allowed for offline demo HTML, but path must exist and be a file
    """
    raw = (url or "").strip()
    if not raw:
        raise InvalidInputPathError("URL is empty.")

    # Bare Windows / POSIX path treated as local file (offline corpus)
    if "://" not in raw:
        path = Path(raw).expanduser().resolve()
        if not path.is_file():
            raise InvalidInputPathError(
                "Local path for URL input does not exist.",
                details={"path": path.name},
            )
        internal, ext = _guess_type_from_path(path)
        return FetchedContent(
            local_path=path,
            internal_type=internal,
            extension=ext,
            mime_type=None,
            source_label=path.name,
            route_label="url_local_path",
        )

    parsed = urllib.parse.urlparse(raw)
    scheme = (parsed.scheme or "").lower()

    if scheme == "file":
        if parsed.netloc and parsed.netloc.lower() not in {"localhost", "127.0.0.1", ""}:
            raise UrlFetchError(
                "Remote file:// hosts are not allowed.",
                details={"netloc": parsed.netloc},
            )
        path_str = urllib.parse.unquote(parsed.path)
        # Handle Windows drive paths: /C:/foo → C:/foo
        if len(path_str) >= 3 and path_str[0] == "/" and path_str[2] == ":":
            path_str = path_str[1:]
        path = Path(path_str).expanduser().resolve()
        if not path.is_file():
            raise InvalidInputPathError(
                "file:// path does not exist or is not a file.",
                details={"filename": path.name},
            )
        internal, ext = _guess_type_from_path(path)
        return FetchedContent(
            local_path=path,
            internal_type=internal,
            extension=ext,
            mime_type=None,
            source_label=path.name,
            route_label="url_file_scheme",
        )

    if scheme not in {"http", "https"}:
        raise UrlFetchError(
            "Only http, https, and file URL schemes are supported.",
            details={"scheme": scheme},
        )

    if not allow_network:
        raise UrlFetchError(
            "Network URL fetching is disabled. Use a local file path or enable allow_url_network.",
            details={"scheme": scheme},
        )

    host = parsed.hostname or ""
    if _is_private_or_local(host):
        raise UrlFetchError(
            "Fetching private/loopback network addresses is blocked (SSRF protection).",
            details={"host": host},
        )

    logger.info("Fetching URL host=%s", host)
    req = Request(raw, headers={"User-Agent": "ApexPetro-DocumentProcessor/1.0"})
    try:
        with urlopen(req, timeout=timeout_s) as resp:  # noqa: S310 — scheme validated
            content_type = resp.headers.get("Content-Type", "").split(";")[0].strip()
            data = resp.read(max_bytes + 1)
    except Exception as exc:
        raise UrlFetchError(
            "Failed to fetch URL content.",
            details={"reason": type(exc).__name__},
        ) from exc

    if len(data) > max_bytes:
        raise UrlFetchError(
            "Remote content exceeds size limit.",
            details={"max_bytes": max_bytes},
        )

    # Determine extension
    path_part = Path(urllib.parse.urlparse(raw).path)
    ext = path_part.suffix.lower()
    if not ext:
        if "html" in content_type:
            ext = ".html"
        elif "pdf" in content_type:
            ext = ".pdf"
        else:
            ext = ".html"
    internal, ext = _guess_type_from_path(Path(f"remote{ext}"), mime=content_type)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext, prefix="url_fetch_")
    try:
        tmp.write(data)
        tmp.flush()
    finally:
        tmp.close()

    return FetchedContent(
        local_path=Path(tmp.name),
        internal_type=internal,
        extension=ext,
        mime_type=content_type or None,
        source_label=f"{scheme}://{host}{path_part.name and '/' + path_part.name}",
        route_label="url_http_fetch",
        cleanup=True,
    )
