from typing import Any, Dict, Optional

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class OCRServiceUnavailable(Exception):
    pass


class OCRProcessingFailed(Exception):
    pass


class OCRServiceAdapter:
    """Thin client for the isolated OCR/document-processing service (OCR_feature).

    The OCR module runs in its own venv/service (Option B) because the backend
    venv does not ship docling/rapidocr/onnxruntime and dependency conflicts must
    be isolated. This adapter is the ONLY code that talks to the service; when it
    is unreachable, callers may fall back to the legacy in-process extractors.
    """

    def __init__(self, base_url: Optional[str] = None, timeout_s: Optional[float] = None):
        self.base_url = (base_url or settings.ocr_service_url).rstrip("/")
        self.timeout_s = timeout_s or settings.ocr_service_timeout_s

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/api/documents/health")
                return resp.status_code == 200
        except Exception:
            return False

    async def process_file(self, path: str, filename: str) -> Dict[str, Any]:
        """Send a file to the OCR service and return the DocumentResult dict.

        Raises OCRServiceUnavailable when the service cannot be reached and
        OCRProcessingFailed when the service rejects the file.
        """
        try:
            with open(path, "rb") as f:
                files = {"file": (filename, f, "application/octet-stream")}
                data = {"use_ocr": "true", "use_smolvlm": "false"}
                async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                    resp = await client.post(
                        f"{self.base_url}/api/documents/process",
                        files=files,
                        data=data,
                    )
        except OSError as e:
            raise OCRProcessingFailed(f"File could not be read for OCR: {e}")
        except httpx.HTTPError as e:
            raise OCRServiceUnavailable(f"OCR service unreachable: {e}")

        try:
            payload = resp.json()
        except ValueError:
            payload = {}

        if resp.status_code not in (200, 422):
            raise OCRServiceUnavailable(
                f"OCR service error status={resp.status_code} body={resp.text[:300]}"
            )

        return payload or {}


ocr_adapter = OCRServiceAdapter()