"""URL / local HTML input tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from document_processing.config import ProcessorConfig
from document_processing.models import ProcessingStatus
from document_processing.parsers.url_fetcher import UrlFetchError, fetch_url_content
from document_processing.processor import DocumentProcessor

pytestmark = pytest.mark.unit


def test_local_path_as_url_input(fixtures_dir: Path):
    html = fixtures_dir / "sample.html"
    assert html.exists()
    fetched = fetch_url_content(str(html), allow_network=False)
    assert fetched.internal_type == "HTML"
    assert fetched.local_path == html.resolve()


def test_network_blocked_by_default():
    with pytest.raises(UrlFetchError) as exc:
        fetch_url_content("https://example.com/page.html", allow_network=False)
    assert exc.value.code == "URL_FETCH_ERROR"


def test_ssrf_private_blocked():
    with pytest.raises(UrlFetchError):
        fetch_url_content("http://127.0.0.1/secret", allow_network=True)


def test_process_local_html_via_url(fixtures_dir: Path):
    html = fixtures_dir / "sample.html"
    config = ProcessorConfig(allow_url_network=False, use_smolvlm=False)
    result = DocumentProcessor(config=config).process_url(str(html))
    assert result.processing_status in {ProcessingStatus.SUCCESS, ProcessingStatus.PARTIAL}
    assert "url_input" in result.processing_metadata.processing_route
