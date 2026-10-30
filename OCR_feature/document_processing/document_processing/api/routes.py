"""FastAPI routes for document processing (Phase 8)."""

from __future__ import annotations

import logging
import re
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from document_processing.config import ProcessorConfig
from document_processing.models import DocumentResult
from document_processing.processor import DocumentProcessor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize_filename(name: str) -> str:
    base = Path(name or "upload.bin").name
    cleaned = _SAFE_NAME.sub("_", base).strip("._")
    return cleaned or "upload.bin"


def _get_processor(
    use_ocr: bool = True,
    use_smolvlm: bool = False,
    allow_url_network: bool = False,
) -> DocumentProcessor:
    config = ProcessorConfig(
        use_ocr=use_ocr,
        use_smolvlm=use_smolvlm,
        enable_vision=use_smolvlm,
        allow_url_network=allow_url_network,
    )
    return DocumentProcessor(config=config)


@router.post("/process", response_model=DocumentResult)
async def process_document(
    file: Optional[UploadFile] = File(default=None),
    url: Optional[str] = Form(default=None),
    use_ocr: bool = Form(default=True),
    use_smolvlm: bool = Form(default=False),
    allow_url_network: bool = Form(default=False),
) -> JSONResponse:
    """Process an uploaded file or URL into a normalized DocumentResult.

    multipart/form-data:
      - file: document upload (preferred)
      - url: optional HTTP(S)/file/local path (network off by default)
      - use_ocr / use_smolvlm / allow_url_network: processing flags
    """
    if file is None and not url:
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_INPUT", "message": "Provide a file or url."},
        )

    processor = _get_processor(
        use_ocr=use_ocr,
        use_smolvlm=use_smolvlm,
        allow_url_network=allow_url_network,
    )

    if file is not None:
        safe_name = _sanitize_filename(file.filename or "upload.bin")
        max_bytes = processor.config.max_upload_bytes
        data = await file.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail={
                    "code": "FILE_TOO_LARGE",
                    "message": "Uploaded file exceeds size limit.",
                    "details": {"max_bytes": max_bytes},
                },
            )
        suffix = Path(safe_name).suffix or ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix="upload_") as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)
        try:
            # Preserve sanitized name in result via a sibling copy name hint
            named = tmp_path.with_name(safe_name)
            if named != tmp_path:
                try:
                    named.write_bytes(data)
                    process_path = named
                except OSError:
                    process_path = tmp_path
            else:
                process_path = tmp_path
            result = processor.process(process_path)
            result.filename = safe_name
            result.source = safe_name
        finally:
            for p in {tmp_path, tmp_path.with_name(safe_name)}:
                try:
                    if p.exists():
                        p.unlink()
                except OSError:
                    pass
        status = 200 if result.processing_status.value != "failed" else 422
        return JSONResponse(status_code=status, content=result.model_dump(mode="json"))

    # URL path
    result = processor.process_url(url or "")
    status = 200 if result.processing_status.value != "failed" else 422
    return JSONResponse(status_code=status, content=result.model_dump(mode="json"))


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "module": "document_processing"}
