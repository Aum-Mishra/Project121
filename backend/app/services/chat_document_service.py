import asyncio
import os
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.db.database import SessionLocal
from app.db.models import ChatDocument, DocumentStatus
from app.rag.chat_vector_store import chat_vector_store
from app.rag.chunker import chunk_text
from app.rag.embeddings import get_embeddings_batch
from app.rag.ocr_adapter import ocr_adapter, OCRProcessingFailed, OCRServiceUnavailable
from app.services.chat_attachment_service import _summarize, parse_to_text

logger = get_logger(__name__)

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")

RUNNING_STATUSES = {
    DocumentStatus.PROCESSING,
    DocumentStatus.OCR,
    DocumentStatus.CHUNKING,
    DocumentStatus.EMBEDDING,
    DocumentStatus.INDEXING,
}


def sanitize_filename(name: str) -> str:
    base = os.path.basename(name or "upload.bin")
    cleaned = _SAFE_NAME.sub("_", base).strip("._")
    return cleaned or "upload.bin"


def _ext_of(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lstrip(".").lower() or "bin"


class ChatDocumentService:
    """Lifecycle + persistence for chat-scoped documents.

    Every method takes the authoritative (company_id, user_id, conversation_id)
    scope, which is resolved server-side from the Conversation row - never from
    client-supplied values.
    """

    def __init__(self, db: Optional[Session] = None):
        self.db = db

    def _session(self) -> Session:
        return self.db or SessionLocal()

    @staticmethod
    def _close(session: Session, owned: bool) -> None:
        if owned:
            session.close()

    @staticmethod
    def _store_dir(company_id: str, user_id: int, conversation_id: str) -> str:
        d = Path(settings.chat_doc_upload_dir_path) / company_id / str(user_id) / conversation_id
        d.mkdir(parents=True, exist_ok=True)
        return str(d)

    def save_upload(
        self,
        conversation_id: str,
        company_id: str,
        user_id: int,
        filename: str,
        content: bytes,
    ) -> Dict[str, Any]:
        ext = _ext_of(filename)
        if f".{ext}" not in settings.ocr_supported_extensions:
            raise ValueError(
                f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(settings.ocr_supported_extensions))}"
            )
        if len(content) > settings.ocr_max_upload_bytes:
            raise ValueError(f"File exceeds the {settings.ocr_max_upload_bytes // (1024 * 1024)} MB upload limit")
        if not content:
            raise ValueError("Empty file")

        document_id = str(uuid.uuid4())
        safe = sanitize_filename(filename)
        saved_path = os.path.join(self._store_dir(company_id, user_id, conversation_id), f"{document_id}_{safe}")
        with open(saved_path, "wb") as f:
            f.write(content)

        preview_text = ""
        try:
            preview_text = parse_to_text(saved_path, ext)
        except Exception as e:
            logger.warning("chat_doc_preview_failed", ext=ext, error=str(e))

        summary = _summarize(preview_text, filename) if preview_text else f"(No readable text extracted for .{ext})"

        row = ChatDocument(
            document_id=document_id,
            company_id=company_id,
            user_id=user_id,
            conversation_id=conversation_id,
            filename=filename,
            file_size=len(content),
            file_type=ext,
            file_path=saved_path,
            status=DocumentStatus.UPLOADING,
            ocr_used=False,
            preview=preview_text[:2000],
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)

        logger.info(
            "chat_doc_uploaded",
            document_id=document_id,
            conversation_id=conversation_id,
            ext=ext,
            size=len(content),
        )
        return self.serialize(row, preview=summary, content_excerpt=(preview_text or "")[:300])

    def get_document(self, conversation_id: str, company_id: str, user_id: int, document_id: str) -> Optional[ChatDocument]:
        return self.db.query(ChatDocument).filter(
            ChatDocument.document_id == document_id,
            ChatDocument.company_id == company_id,
            ChatDocument.user_id == user_id,
            ChatDocument.conversation_id == conversation_id,
        ).first()

    def list_documents(self, conversation_id: str, company_id: str, user_id: int) -> List[ChatDocument]:
        return self.db.query(ChatDocument).filter(
            ChatDocument.company_id == company_id,
            ChatDocument.user_id == user_id,
            ChatDocument.conversation_id == conversation_id,
        ).order_by(ChatDocument.created_at.asc()).all()

    def has_ready_documents(self, conversation_id: str, company_id: str, user_id: int) -> bool:
        return self.db.query(ChatDocument.id).filter(
            ChatDocument.company_id == company_id,
            ChatDocument.user_id == user_id,
            ChatDocument.conversation_id == conversation_id,
            ChatDocument.status == DocumentStatus.READY,
            ChatDocument.chunk_count > 0,
        ).first() is not None

    def delete_document(self, conversation_id: str, company_id: str, user_id: int, document_id: str) -> bool:
        row = self.get_document(conversation_id, company_id, user_id, document_id)
        if not row:
            return False
        try:
            chat_vector_store.delete_document(company_id, user_id, conversation_id, document_id)
        except Exception as e:
            logger.warning("chat_doc_vector_delete_failed", document_id=document_id, error=str(e))
        if row.file_path and os.path.isfile(row.file_path):
            try:
                os.remove(row.file_path)
            except OSError as e:
                logger.warning("chat_doc_file_remove_failed", document_id=document_id, error=str(e))
        self.db.delete(row)
        self.db.commit()
        logger.info("chat_doc_deleted", document_id=document_id, conversation_id=conversation_id)
        return True

    def delete_conversation_documents(self, conversation_id: str, company_id: str, user_id: int) -> int:
        rows = self.list_documents(conversation_id, company_id, user_id)
        deleted = 0
        for row in rows:
            if self.delete_document(conversation_id, company_id, user_id, row.document_id):
                deleted += 1
        if rows:
            try:
                chat_vector_store.delete_conversation(company_id, user_id, conversation_id)
            except Exception as e:
                logger.warning("chat_doc_vector_conversation_delete_failed", error=str(e))
        return deleted

    def serialize(
        self,
        doc: ChatDocument,
        preview: Optional[str] = None,
        content_excerpt: Optional[str] = None,
    ) -> Dict[str, Any]:
        status = doc.status.value if isinstance(doc.status, DocumentStatus) else str(doc.status)
        return {
            "document_id": doc.document_id,
            "attachment_id": doc.document_id,
            "filename": doc.filename,
            "ext": doc.file_type or "",
            "size": doc.file_size or 0,
            "summary": preview or doc.preview or "",
            "content_excerpt": content_excerpt,
            "page_count": doc.page_count,
            "chunk_count": doc.chunk_count,
            "status": status,
            "ocr_used": bool(doc.ocr_used),
            "created_at": str(doc.created_at),
            "updated_at": str(doc.updated_at),
        }

    async def process_document(self, document_id: str) -> None:
        db = self._session()
        owned = self.db is None
        try:
            row = db.query(ChatDocument).filter(ChatDocument.document_id == document_id).first()
            if not row:
                logger.warning("chat_doc_not_found_for_processing", document_id=document_id)
                return
            if row.status in RUNNING_STATUSES or row.status == DocumentStatus.READY:
                return
            self._set_status(db, row, DocumentStatus.PROCESSING)

            company_id, user_id, conversation_id = row.company_id, row.user_id, row.conversation_id
            ext = (row.file_type or "txt").lower()
            path = Path(row.file_path or "").resolve()
            if not path.is_file():
                self._fail(db, row, "Uploaded file is missing on disk")
                return
            filename = sanitize_filename(row.filename)

            self._set_status(db, row, DocumentStatus.OCR)
            ocr_used = False
            page_count = 0
            try:
                result = await ocr_adapter.process_file(str(path), filename)
                status_val = result.get("processing_status")
                error_info = result.get("error")
                if status_val == "failed" or error_info:
                    message = (error_info or {}).get("message") or (
                        result.get("error_message") or "OCR processing failed"
                    )
                    self._fail(db, row, message)
                    return
                text = result.get("full_text") or ""
                ocr_used = bool((result.get("processing_metadata") or {}).get("ocr_used", False))
                page_count = (result.get("metadata") or {}).get("page_count") or 0
            except OCRServiceUnavailable as e:
                logger.warning(
                    "chat_doc_ocr_service_unavailable_falling_back_to_legacy",
                    document_id=document_id,
                    error=str(e),
                )
                text = parse_to_text(str(path), ext)
                result = {}
            except OCRProcessingFailed as e:
                self._fail(db, row, str(e))
                return

            if not text or not text.strip():
                self._fail(db, row, "No readable text could be extracted from the document")
                return

            row.ocr_used = ocr_used
            row.page_count = page_count
            self._set_status(db, row, DocumentStatus.CHUNKING)
            pages_raw = result.get("pages") or []
            page_tagged: list = []
            if isinstance(pages_raw, list) and pages_raw:
                for p in pages_raw:
                    if not isinstance(p, dict):
                        continue
                    page_text = (p.get("text") or "").strip()
                    if not page_text:
                        continue
                    page_no = int(p.get("page_number") or 0) or 0
                    page_tagged.extend((c, page_no) for c in chunk_text(page_text))
            if not page_tagged:
                page_tagged = [(c, 0) for c in chunk_text(text)]
            if len(page_tagged) > settings.chat_doc_max_chunks:
                page_tagged = page_tagged[: settings.chat_doc_max_chunks]
            if not page_tagged:
                self._fail(db, row, "Document produced no usable text chunks")
                return

            self._set_status(db, row, DocumentStatus.EMBEDDING)
            try:
                embeddings = await get_embeddings_batch([c for c, _ in page_tagged])
            except Exception as e:
                self._fail(db, row, f"Embedding generation failed: {e}")
                return

            self._set_status(db, row, DocumentStatus.INDEXING)
            payload_chunks = [
                {
                    "content": page_tagged[i][0],
                    "chunk_id": f"{document_id}-{i}",
                    "page_number": page_tagged[i][1],
                    "filename": filename,
                    "file_type": row.file_type,
                    "ocr_used": ocr_used,
                    "embedding": embeddings[i],
                }
                for i in range(len(page_tagged))
            ]
            try:
                count = chat_vector_store.upsert_chunks(
                    company_id, user_id, conversation_id, document_id, payload_chunks
                )
            except Exception as e:
                self._fail(db, row, f"Vector indexing failed: {e}")
                return

            row.chunk_count = count
            row.error_message = None
            row.status = DocumentStatus.READY
            db.commit()
            db.refresh(row)
            logger.info(
                "chat_doc_ready",
                document_id=document_id,
                chunks=count,
                ocr_used=ocr_used,
                conversation_id=conversation_id,
            )
        except Exception as e:
            logger.error("chat_doc_process_failed", document_id=document_id, error=str(e))
            if "row" in locals() and row:
                try:
                    self._fail(db, row, str(e))
                except Exception:
                    pass
        finally:
            self._close(db, owned)

    @staticmethod
    def _set_status(db: Session, row: ChatDocument, status: DocumentStatus) -> None:
        row.status = status
        db.commit()
        db.refresh(row)

    @staticmethod
    def _fail(db: Session, row: ChatDocument, message: str) -> None:
        row.status = DocumentStatus.ERROR
        row.error_message = str(message)[:1000]
        db.commit()
        logger.warning("chat_doc_error", document_id=row.document_id, error=message)


def trigger_chat_document_processing(document_id: str) -> None:
    """Fire the background OCR->chunk->embed->index pipeline.

    Uses its own DB session/event loop so it survives the request lifecycle and
    works from both async and sync call contexts.
    """
    async def _run() -> None:
        await ChatDocumentService().process_document(document_id)

    try:
        asyncio.get_running_loop()
        asyncio.create_task(_run())
    except RuntimeError:
        asyncio.run(_run())