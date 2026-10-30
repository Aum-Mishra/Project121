"""FastAPI endpoint tests (Phase 8)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from document_processing.api.app import create_app

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


def test_health(client: TestClient):
    resp = client.get("/api/documents/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_process_upload_txt(client: TestClient, fixtures_dir: Path):
    path = fixtures_dir / "sample.txt"
    with path.open("rb") as fh:
        resp = client.post(
            "/api/documents/process",
            files={"file": ("sample.txt", fh, "text/plain")},
            data={"use_ocr": "true", "use_smolvlm": "false"},
        )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["file_type"] == "txt"
    assert payload["processing_status"] == "success"
    assert "Plain text fixture" in payload["full_text"]


def test_process_missing_input(client: TestClient):
    resp = client.post("/api/documents/process", data={})
    assert resp.status_code == 400
