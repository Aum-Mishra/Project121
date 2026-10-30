"""Unit tests for the chat-scoped document pipeline (OCR integration)."""
import os
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.database import Base
from app.db.models import DocumentStatus
from app.rag.chat_vector_store import chat_vector_store
from app.services.chat_document_service import ChatDocumentService, sanitize_filename


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def tmp_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "chat_doc_upload_dir", str(tmp_path))
    return tmp_path


@pytest.fixture()
def service(db):
    return ChatDocumentService(db)


class TestSanitize:
    def test_keeps_simple_names(self):
        assert sanitize_filename("note.txt") == "note.txt"

    def test_strips_directory_traversal(self):
        assert sanitize_filename("../../etc/passwd") == "passwd"

    def test_replaces_unsafe_characters(self):
        name = sanitize_filename("a b/c*d?.pdf")
        assert "/" not in name and "?" not in name and "*" not in name
        assert name.endswith(".pdf")

    def test_empty_falls_back(self):
        assert sanitize_filename("") == "upload.bin"


class TestValidation:
    def test_rejects_unsupported_extension(self, db, tmp_upload_dir):
        svc = ChatDocumentService(db)
        with pytest.raises(ValueError, match="Unsupported file type"):
            svc.save_upload("conv-X", "apexpetro", 1, "malware.exe", b"x" * 10)

    def test_rejects_empty_file(self, db, tmp_upload_dir):
        svc = ChatDocumentService(db)
        with pytest.raises(ValueError, match="Empty file"):
            svc.save_upload("conv-X", "apexpetro", 1, "empty.txt", b"")

    def test_rejects_oversized_file(self, db, tmp_upload_dir, monkeypatch):
        monkeypatch.setattr(settings, "ocr_max_upload_bytes", 10)
        svc = ChatDocumentService(db)
        with pytest.raises(ValueError, match="upload limit"):
            svc.save_upload("conv-X", "apexpetro", 1, "big.txt", b"x" * 11)


class TestUploadAndScope:
    def test_txt_upload_returns_sync_preview(self, service, tmp_upload_dir):
        res = service.save_upload(
            "conv-A", "apexpetro", 1, "note.txt", b"operating pressure limit 40 bar"
        )
        assert res["attachment_id"] == res["document_id"]
        assert res["ext"] == "txt"
        assert "40 bar" in res["summary"]
        assert res["status"] == "UPLOADING"

    def test_list_is_chat_scoped(self, service, tmp_upload_dir):
        service.save_upload("conv-A", "apexpetro", 1, "a.txt", b"alpha 40 bar")
        service.save_upload("conv-A", "apexpetro", 1, "b.txt", b"beta")
        assert len(service.list_documents("conv-A", "apexpetro", 1)) == 2
        assert service.list_documents("conv-B", "apexpetro", 1) == []
        assert service.list_documents("conv-A", "apexpetro", 999) == []

    def test_delete_only_matches_exact_scope(self, service, tmp_upload_dir):
        res = service.save_upload("conv-A", "apexpetro", 1, "a.txt", b"x")
        doc_id = res["document_id"]
        assert service.delete_document("conv-A", "apexpetro", 999, doc_id) is False
        assert service.delete_document("conv-B", "apexpetro", 1, doc_id) is False
        assert service.delete_document("conv-A", "apexpetro", 1, doc_id) is True
        assert service.get_document("conv-A", "apexpetro", 1, doc_id) is None

    def test_scope_index_covers_all_fields(self):
        from app.db.models import ChatDocument
        scope = next(i for i in ChatDocument.__table__.indexes if i.name == "ix_chat_documents_scope")
        assert [c.name for c in scope.columns] == ["company_id", "user_id", "conversation_id"]


class _FakeClient:
    """Fake qdrant client that records the Filter objects used in calls."""

    def __init__(self):
        self.calls = []
        self.points = []

    def query_points(self, *, collection_name, query, query_filter, limit, score_threshold, with_payload):
        self.calls.append({"kind": "search", "filter": query_filter})
        return SimpleNamespace(points=[])

    def upsert(self, *, collection_name, points):
        self.calls.append({"kind": "upsert", "points": points})

    def count(self, *, collection_name, count_filter):
        self.calls.append({"kind": "count", "filter": count_filter})
        return SimpleNamespace(count=3)

    def delete(self, *, collection_name, points_selector):
        self.calls.append({"kind": "delete", "filter": points_selector})


@pytest.fixture()
def fake_store(monkeypatch):
    fake = _FakeClient()
    monkeypatch.setattr(chat_vector_store, "client", fake)
    return fake


def _filter_keys(f: "Filter") -> dict:
    return {cond.key: cond.match.value for cond in (f.must or [])}


class TestVectorStoreIsolation:
    def test_search_enforces_all_scope_fields(self, fake_store):
        chat_vector_store.search([0.1] * 8, "apexpetro", 7, "conv-Z")
        call = fake_store.calls[-1]
        keys = _filter_keys(call["filter"])
        assert keys["company_id"] == "apexpetro"
        assert keys["user_id"] == "7"
        assert keys["conversation_id"] == "conv-Z"

    def test_upsert_payloads_carry_scope_and_source(self, fake_store):
        chunks = [
            {
                "content": "hello world",
                "chunk_id": "doc-0",
                "page_number": 1,
                "filename": "a.pdf",
                "file_type": "pdf",
                "ocr_used": True,
                "embedding": [0.1] * 8,
            }
        ]
        chat_vector_store.upsert_chunks("apexpetro", 7, "conv-Z", "doc", chunks)
        payload = fake_store.calls[-1]["points"][0].payload
        assert payload["company_id"] == "apexpetro"
        assert payload["user_id"] == "7"
        assert payload["conversation_id"] == "conv-Z"
        assert payload["document_id"] == "doc"
        assert payload["source"] == "chat_upload"
        assert payload["ocr_used"] is True

    def test_delete_document_requires_document_id_plus_scope(self, fake_store):
        chat_vector_store.delete_document("apexpetro", 7, "conv-Z", "doc")
        call = fake_store.calls[-1]
        keys = _filter_keys(call["filter"])
        assert keys["company_id"] == "apexpetro"
        assert keys["user_id"] == "7"
        assert keys["conversation_id"] == "conv-Z"
        assert keys["document_id"] == "doc"

    def test_delete_conversation_scopes_everything(self, fake_store):
        chat_vector_store.delete_conversation("apexpetro", 7, "conv-Z")
        keys = _filter_keys(fake_store.calls[-1]["filter"])
        assert set(keys) == {"company_id", "user_id", "conversation_id"}


class TestStatusLifecycle:
    def test_status_enum_values_exist(self):
        expected = {"UPLOADING", "PROCESSING", "OCR", "CHUNKING", "EMBEDDING", "INDEXING", "READY", "ERROR"}
        assert {s.value for s in DocumentStatus} == expected

    async def test_running_status_skips_reprocessing_and_ocr(self, service, tmp_upload_dir, monkeypatch):
        from app.services import chat_document_service as svc_mod

        res = service.save_upload("conv-A", "apexpetro", 1, "a.txt", b"x")
        doc = service.get_document("conv-A", "apexpetro", 1, res["document_id"])
        assert doc.status == DocumentStatus.UPLOADING
        doc.status = DocumentStatus.PROCESSING
        service.db.commit()

        called = {"n": 0}

        async def fake_ocr(*args, **kwargs):
            called["n"] += 1
            return {}

        monkeypatch.setattr(svc_mod, "ocr_adapter", type("A", (), {"process_file": fake_ocr})())
        await service.process_document(doc.document_id)
        assert called["n"] == 0

    async def test_process_document_marks_error_when_file_missing(self, service, tmp_upload_dir):
        res = service.save_upload("conv-A", "apexpetro", 1, "a.txt", b"x")
        doc = service.get_document("conv-A", "apexpetro", 1, res["document_id"])
        assert os.path.isfile(doc.file_path)
        os.remove(doc.file_path)
        await service.process_document(doc.document_id)
        row = service.get_document("conv-A", "apexpetro", 1, res["document_id"])
        assert row.status == DocumentStatus.ERROR
        assert row.error_message