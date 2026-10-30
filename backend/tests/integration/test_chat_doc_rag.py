"""16 integration tests: chat-scoped document OCR + isolated vector RAG.

Requires the backend at http://localhost:8000 (new chat-document code) and the
standalone OCR service at http://127.0.0.1:8001. Anything uploaded to a chat
must be retrievable ONLY from that chat/user and must NEVER leak into another
chat, another user, or the permanent company RAG collection.
"""
import io
import json
import time
import uuid

import httpx
import pytest
import fitz
from docx import Document
from openpyxl import Workbook
from pptx import Presentation
from PIL import Image, ImageDraw, ImageFont

from app.rag.chat_vector_store import chat_vector_store
from qdrant_client.models import FieldCondition, Filter, MatchValue

BASE = "http://localhost:8000"
SEED_EMAIL = "arjun.mehta@apexpetro.com"
SEED_PASSWORD = "apexpetro2026"
PH = "APEL-PRIVATE-CHAT-928374"
THRESHOLD = "28.5"
NOTE_A = (
    "OPERATOR FIELD NOTE\n"
    "Identifier: APEL-PRIVATE-CHAT-928374\n"
    "Emergency shutdown threshold: 28.5 bara\n"
    "Notify plant control immediately on trip."
).encode()
COMPARE_X = ("PACKING REPORTS SET A\nIdentifier ITG-COMPARE-X-001\nPacking A pressure limit: 12.5 bar").encode()
COMPARE_Y = ("PACKING REPORTS SET B\nIdentifier ITG-COMPARE-Y-002\nPacking B pressure limit: 17.0 bar").encode()


# ---------------------------------------------------------------- helpers
def _upload(client, headers, conv_id, filename, content, mime="application/octet-stream"):
    resp = client.post(
        "/api/chat/attachments",
        headers=headers,
        timeout=60.0,
        files={"file": (filename, content, mime)},
        data={"conversation_id": conv_id},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _wait_ready(client, headers, conv_id, document_id, timeout=300.0, step=2.0):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        resp = client.get(
            "/api/chat/attachments", headers=headers,
            params={"conversation_id": conv_id}, timeout=30.0,
        )
        assert resp.status_code == 200, resp.text
        match = next((a for a in resp.json()["attachments"] if a["document_id"] == document_id), None)
        assert match is not None, "uploaded document missing from attachment list"
        last = match
        if match["status"] == "READY":
            return match
        if match["status"] == "ERROR":
            raise AssertionError(f"document failed to process: {match}")
        time.sleep(step)
    raise AssertionError(f"timed out waiting for READY; last state={last}")


def _ask(client, headers, conv_id, query, timeout=300.0):
    resp = client.post(
        "/api/chat", headers=headers, timeout=timeout,
        json={"query": query, "conversation_id": conv_id},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _chat_evidence(body):
    return [e for e in body.get("evidence", []) if e.get("is_chat_document")]


def _store_count(company_id, user_id, conversation_id):
    f = Filter(must=[
        FieldCondition(key="company_id", match=MatchValue(value=company_id)),
        FieldCondition(key="user_id", match=MatchValue(value=str(user_id))),
        FieldCondition(key="conversation_id", match=MatchValue(value=conversation_id)),
    ])
    return chat_vector_store.count(f)


def _font(size=56):
    try:
        return ImageFont.load_default(size=size)
    except Exception:
        return ImageFont.load_default()


def _make_image_file(text):
    img = Image.new("RGB", (2400, 1500), (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.multiline_text((180, 240), text, font=_font(64), fill=(20, 20, 20), spacing=24)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_digital_pdf(text):
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_textbox(
        fitz.Rect(72, 72, 523, 400), text, fontsize=13, lineheight=1.6,
        fontname="helv",
    )
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def _make_scanned_pdf(text):
    png = _make_image_file(text)
    doc = fitz.open()
    page = doc.new_page(width=595, height=372)
    img = Image.open(io.BytesIO(png))
    w, h = img.size
    ratio = min(595 / w, 372 / h)
    tw, th = w * ratio, h * ratio
    page.insert_image(fitz.Rect(20, 20, 20 + tw, 20 + th), stream=png)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def _make_docx(text):
    doc = Document()
    doc.add_heading("Memo", level=0)
    doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _make_xlsx():
    wb = Workbook()
    ws = wb.active
    ws.title = "Limits"
    ws.cell(row=1, column=1, value="Record")
    ws.cell(row=2, column=1, value="XLSX-PROBE-222")
    ws.cell(row=3, column=1, value="Equipment")
    ws.cell(row=4, column=1, value="P-249 transfer pump")
    ws.cell(row=5, column=1, value="Cold seal design limit")
    ws.cell(row=6, column=1, value="10.2 bar")
    ws.cell(row=7, column=1, value="Test pressure")
    ws.cell(row=8, column=1, value="11.0 bar")
    ws.cell(row=9, column=1, value="Holding time")
    ws.cell(row=10, column=1, value="30 minutes")
    ws.cell(row=11, column=1, value="Result")
    ws.cell(row=12, column=1, value="Pass")
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _make_pptx(text):
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Design Review"
    slide.placeholders[1].text = text
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------- fixtures
@pytest.fixture(scope="module")
def client():
    return httpx.Client(base_url=BASE, timeout=60.0)


@pytest.fixture(scope="module")
def seed_user(client):
    resp = client.post(
        "/api/auth/login",
        json={"email": SEED_EMAIL, "password": SEED_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}, timeout=30.0)
    assert me.status_code == 200, me.text
    me = me.json()
    return {
        "headers": {"Authorization": f"Bearer {body['access_token']}"},
        "user_id": me["user_id"],
        "company_id": me["company_id"],
    }


@pytest.fixture(scope="module")
def headers(seed_user):
    return seed_user["headers"]


@pytest.fixture(scope="module")
def second_user(client):
    email = f"chat-doc-{uuid.uuid4().hex[:10]}@apexpetro.com"
    resp = client.post(
        "/api/auth/signup",
        json={"email": email, "password": "secret99", "full_name": "Isolation Tester", "role": "ENGINEER"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return {
        "email": email,
        "user_id": body["user_id"],
        "headers": {"Authorization": f"Bearer {body['access_token']}"},
    }


def _new_conversation(client, h):
    resp = client.post("/api/chat/conversations", headers=h, timeout=30.0)
    assert resp.status_code == 200, resp.text
    return resp.json()["conversation_id"]


@pytest.fixture(scope="module")
def conv_a(client, headers):
    return _new_conversation(client, headers)


@pytest.fixture(scope="module")
def conv_b(client, headers):
    return _new_conversation(client, headers)


@pytest.fixture(scope="module")
def conv_formats(client, headers):
    return _new_conversation(client, headers)


@pytest.fixture(scope="module")
def conv_compare(client, headers):
    return _new_conversation(client, headers)


@pytest.fixture(scope="module")
def user2_conv(second_user, client):
    return _new_conversation(client, second_user["headers"])


@pytest.fixture(scope="module")
def ready_txt(conv_a, client, headers):
    up = _upload(client, headers, conv_a, "field_note.txt", NOTE_A, "text/plain")
    ready = _wait_ready(client, headers, conv_a, up["document_id"])
    return {"upload": up, "ready": ready}


# ---------------------------------------------------------------- upload contract + pipeline
class TestUploadContract:
    def test_txt_returns_sync_preview_contract(self, ready_txt):
        up = ready_txt["upload"]
        assert up["document_id"] and up["attachment_id"] == up["document_id"]
        assert up["ext"] == "txt"
        assert up["status"] in ("UPLOADING", "PROCESSING", "OCR", "CHUNKING", "EMBEDDING", "INDEXING", "READY")
        assert (PH in (up.get("summary") or "")) or (PH in (up.get("content_excerpt") or ""))
        assert up.get("content_excerpt")

    def test_txt_pipeline_reaches_ready_and_indexed(self, ready_txt):
        r = ready_txt["ready"]
        assert r["status"] == "READY"
        assert r["chunk_count"] > 0
        assert r["page_count"] >= 0
        assert isinstance(r["ocr_used"], bool)


class TestFormatMatrix:
    FORMATS = [
        ("memo.docx", lambda: _make_docx("DOCX-PROBE-4242\nRelief valve setpoint 21.5 bar\nApprove before next run."), None, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("limits.xlsx", _make_xlsx, None, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("deck.pptx", lambda: _make_pptx("PPTX-PROBE-999\nFan trip limit 41.3 bar"), None, "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        ("digi.pdf", lambda: _make_digital_pdf("DIGITAL PDF PROBE\nIdentifier DIGI-PDF-555\nLine rating 40 bar\nRelief setpoint 33 bar"), None, "application/pdf"),
        ("scan.pdf", lambda: _make_scanned_pdf("SCANNED RECORD\nIdentifier SCAN-PDF-777\nOperator relief limit 27.4 bar"), True, "application/pdf"),
        ("image.png", lambda: _make_image_file("IMAGE NOTE\nIdentifier IMG-PROBE-888\nMaximum allowable 19.6 bar"), True, "image/png"),
    ]

    @pytest.mark.parametrize("filename,gen,expect_ocr,mime,_", [(n, g, o, m, i) for i, (n, g, o, m) in enumerate(FORMATS)], ids=[f[0] for f in FORMATS])
    def test_format_reaches_ready(self, filename, gen, expect_ocr, mime, _, conv_formats, client, headers):
        content = gen()
        up = _upload(client, headers, conv_formats, filename, content, mime)
        ready = _wait_ready(client, headers, conv_formats, up["document_id"], timeout=360.0)
        assert ready["status"] == "READY"
        assert ready["chunk_count"] > 0
        if expect_ocr is not None:
            assert ready["ocr_used"] is expect_ocr


# ---------------------------------------------------------------- isolation
class TestConversationIsolation:
    def test_chat_a_retrieves_private_identifier(self, ready_txt, conv_a, client, headers, seed_user):
        body = _ask(
            client, headers, conv_a,
            "In the note uploaded to this chat, what is the emergency shutdown threshold? "
            f"Reply with the number and any identifier code.",
        )
        chat = _chat_evidence(body)
        assert chat, "no chat-scoped evidence retrieved for the uploading chat"
        assert any(PH in (e.get("content") or "") for e in chat)
        assert THRESHOLD in body["answer"], body["answer"]
        assert _store_count(seed_user["company_id"], seed_user["user_id"], conv_a) >= ready_txt["ready"]["chunk_count"]

    def test_chat_b_isolated_from_private_identifier(self, conv_b, client, headers, seed_user):
        body = _ask(
            client, headers, conv_b,
            "In the note uploaded to this chat, what is the emergency shutdown threshold? "
            f"Reply with the number and any identifier code.",
        )
        chat = _chat_evidence(body)
        assert not any(PH in (e.get("content") or "") for e in chat), "private identifier leaked into another chat"
        assert THRESHOLD not in body["answer"], body["answer"]
        assert _store_count(seed_user["company_id"], seed_user["user_id"], conv_b) == 0

    def test_other_user_isolated_from_private_identifier(self, user2_conv, second_user, client):
        body = _ask(
            client, second_user["headers"], user2_conv,
            "In the note uploaded to this chat, what is the emergency shutdown threshold? "
            f"Reply with the number and any identifier code.",
        )
        chat = _chat_evidence(body)
        assert not any(PH in (e.get("content") or "") for e in chat), "private identifier leaked to another user"
        assert THRESHOLD not in body["answer"], body["answer"]

    def test_permanent_rag_excludes_chat_document(self, client):
        resp = client.post(
            "/api/knowledge/search", timeout=60.0,
            json={"query": f"What does identifier {PH} refer to?", "limit": 10},
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()["results"]
        leaked = [r for r in results if PH in (r.get("content") or "") or r.get("document_id", "").startswith("chat")]
        assert not leaked, f"chat document leaked into permanent RAG: {leaked}"


class TestAttachmentLifecycle:
    def test_attachments_scoped_and_delete_removes(self, conv_a, conv_b, client, headers):
        up = _upload(client, headers, conv_b, "b_scratch.txt", b"scratch scratch scratch", "text/plain")

        list_b = client.get("/api/chat/attachments", headers=headers, params={"conversation_id": conv_b}, timeout=30.0).json()
        assert any(a["document_id"] == up["document_id"] for a in list_b["attachments"])

        list_a = client.get("/api/chat/attachments", headers=headers, params={"conversation_id": conv_a}, timeout=30.0).json()
        assert all(a["document_id"] != up["document_id"] for a in list_a["attachments"]), "attachment visible across chats"

        resp = client.delete(
            f"/api/chat/attachments/{up['document_id']}", headers=headers,
            params={"conversation_id": conv_b}, timeout=30.0,
        )
        assert resp.status_code == 200, resp.text

        gone = client.get("/api/chat/attachments", headers=headers, params={"conversation_id": conv_b}, timeout=30.0).json()
        assert all(a["document_id"] != up["document_id"] for a in gone["attachments"])

        repeat = client.delete(
            f"/api/chat/attachments/{up['document_id']}", headers=headers,
            params={"conversation_id": conv_b}, timeout=30.0,
        )
        assert repeat.status_code == 404


# ---------------------------------------------------------------- chat behavior + regressions
class TestChatBehavior:
    def test_follow_up_still_uses_uploaded_document(self, ready_txt, conv_a, client, headers):
        first = _ask(client, headers, conv_a, "What emergency shutdown threshold is in the uploaded note?")
        assert THRESHOLD in first["answer"], first["answer"]

        follow = _ask(client, headers, conv_a, "In that same uploaded note, what identifier code should I quote?")
        chat = _chat_evidence(follow)
        assert chat, "follow-up lost access to the uploaded document"
        assert any(PH in (e.get("content") or "") for e in chat) or PH in follow["answer"]

    def test_compare_two_uploaded_reports(self, conv_compare, client, headers):
        up_x = _upload(client, headers, conv_compare, "packing_a.txt", COMPARE_X, "text/plain")
        up_y = _upload(client, headers, conv_compare, "packing_b.txt", COMPARE_Y, "text/plain")
        _wait_ready(client, headers, conv_compare, up_x["document_id"])
        _wait_ready(client, headers, conv_compare, up_y["document_id"])

        body = _ask(
            client, headers, conv_compare,
            "Compare the packing pressure limits in my two uploaded reports and name each document.",
        )
        chat_ids = {e.get("document_id") for e in _chat_evidence(body)}
        assert {up_x["document_id"], up_y["document_id"]} <= chat_ids, (
            f"expected both uploaded docs in evidence, got {chat_ids}"
        )


class TestRegressions:
    def test_auth_ownership_stream_and_permanent_rag(self, conv_a, user2_conv, second_user, client, headers):
        # 1. other user cannot read messages of an owned conversation
        resp = client.get(
            f"/api/chat/conversations/{conv_a}/messages",
            headers=second_user["headers"], timeout=30.0,
        )
        assert resp.status_code == 403

        # 2. other user cannot upload into an owned conversation
        resp = client.post(
            "/api/chat/attachments",
            headers=second_user["headers"], timeout=30.0,
            files={"file": ("x.txt", b"secret data", "text/plain")},
            data={"conversation_id": conv_a},
        )
        assert resp.status_code == 403

        # 3. anonymous legacy chat still works
        anon = client.post(
            "/api/chat", timeout=180.0,
            json={"query": "Hello, how can you help me?"},
        )
        assert anon.status_code == 200, anon.text
        assert anon.json()["answer"]

        # 4. conversation listing is per-user
        listing = client.get("/api/chat/conversations", headers=headers, timeout=30.0).json()
        assert all(c["conversation_id"] != user2_conv for c in listing["conversations"])

        # 5. permanent RAG still answers without touching chat documents
        rag = _ask(client, second_user["headers"], user2_conv, "What is the maximum operating pressure for pump P-102?")
        assert rag["evidence"], "permanent RAG returned no evidence"
        assert all(not e.get("is_chat_document") for e in rag["evidence"])
        assert rag["answer"].strip()

        # 6. streaming path emits run_completed with chat evidence
        with client.stream(
            "POST", "/api/chat/stream", headers=headers, timeout=300.0,
            json={"query": "What identifier is in the note I uploaded to this chat?", "conversation_id": conv_a},
        ) as r:
            assert r.status_code == 200
            completed = None
            for line in r.iter_lines():
                if not line or not line.startswith("data: "):
                    continue
                evt = json.loads(line[6:])
                if evt.get("event") == "run_completed":
                    completed = evt
        assert completed is not None, "stream never emitted run_completed"
        assert completed["answer"]
        assert any(e.get("is_chat_document") for e in completed["evidence"])
        assert "steps_status" in completed