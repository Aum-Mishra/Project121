"""End-to-end ApexPetro corpus processing + ground-truth validation."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from document_processing.models import ProcessingStatus
from document_processing.processor import DocumentProcessor

pytestmark = pytest.mark.integration

CORPUS_ROOT = Path(r"E:\SIH\PS117\OCR_feature\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus")


# Critical P-102 facts that must survive extraction with units intact
CRITICAL_FACTS = [
    "P-102",
    "315",  # kW
    "1485",  # RPM
    "475",  # design flow
    "4.5",  # vibration limit
    "5.6",  # high vibration
    "3.9",  # post-maintenance
    "438",  # low flow
]


def _normalize_text(text: str) -> str:
    text = text.replace("\u00b3", "3").replace("³", "3")
    text = text.replace("\u00b0", "deg").replace("°", "deg")
    text = re.sub(r"\s+", " ", text)
    return text


@pytest.fixture(scope="module")
def corpus_dir() -> Path:
    assert CORPUS_ROOT.is_dir(), f"Missing corpus at {CORPUS_ROOT}"
    return CORPUS_ROOT


@pytest.fixture(scope="module")
def processor() -> DocumentProcessor:
    return DocumentProcessor(use_ocr=True, use_smolvlm=False)


@pytest.fixture(scope="module")
def ground_truth(corpus_dir: Path) -> dict:
    path = corpus_dir / "17_Ground_Truth" / "P-102_Ground_Truth.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _corpus_file(corpus_dir: Path, *parts: str) -> Path:
    path = corpus_dir.joinpath(*parts)
    assert path.exists(), f"Missing corpus file: {path}"
    return path


@pytest.mark.parametrize(
    "rel_parts,expect_ocr,min_chars",
    [
        (("01_Digital_PDF", "P-102_Operating_and_Inspection_Report.pdf"), False, 50),
        (("02_Scanned_PDF", "P-102_Scanned_Inspection_Record.pdf"), True, 20),
        (("03_Mixed_PDF", "P-102_Mixed_Inspection_and_Maintenance_Report.pdf"), None, 20),
        (("04_Images", "P-102_Inspection_Nameplate_and_Readings.png"), True, 5),
        (("05_DOCX", "P-102_Maintenance_Inspection_Report.docx"), False, 50),
        (("06_PPTX", "ApexPetro_P-102_Management_Briefing.pptx"), False, 20),
        (("07_XLSX", "P-102_Historical_Inspection_Data.xlsx"), False, 20),
        (("08_CSV", "P-102_Inspection_History.csv"), False, 20),
        (("09_TXT", "P-102_Maintenance_Notes.txt"), False, 50),
        (("10_Markdown", "P-102_Operating_Procedure.md"), False, 50),
        (("11_HTML", "P-102_Engineering_Guidance.html"), False, 50),
        (("12_Handwritten", "P-102_Handwritten_Inspection_Note.png"), True, 0),
        (("13_Engineering_Drawing", "P-102_Pump_Bay_2_Engineering_Drawing.png"), True, 0),
        (("14_Charts", "P-102_Vibration_Trend_Chart.png"), True, 0),
        (("15_Photographs", "P-102_Coupling_Alignment_Inspection.png"), True, 0),
    ],
)
def test_corpus_category(
    corpus_dir: Path,
    processor: DocumentProcessor,
    rel_parts,
    expect_ocr,
    min_chars,
):
    path = _corpus_file(corpus_dir, *rel_parts)
    result = processor.process(path)
    assert result.processing_status in {
        ProcessingStatus.SUCCESS,
        ProcessingStatus.PARTIAL,
    }, f"{path.name} failed: {result.error}"
    assert result.error is None
    if expect_ocr is True:
        assert result.processing_metadata.ocr_used is True
    elif expect_ocr is False:
        assert result.processing_metadata.ocr_used is False
    combined = (result.full_text or "") + "\n" + (result.markdown or "")
    assert len(combined.strip()) >= min_chars


def test_url_local_html(corpus_dir: Path):
    path = _corpus_file(
        corpus_dir, "16_URL_Test", "P-102_Internal_Engineering_Knowledge.html"
    )
    result = DocumentProcessor(use_ocr=False, use_smolvlm=False).process_url(str(path))
    assert result.processing_status in {
        ProcessingStatus.SUCCESS,
        ProcessingStatus.PARTIAL,
    }
    assert "P-102" in result.full_text or "P-102" in result.markdown


def test_xlsx_and_csv_never_ocr(corpus_dir: Path, processor: DocumentProcessor):
    xlsx = processor.process(
        _corpus_file(corpus_dir, "07_XLSX", "P-102_Historical_Inspection_Data.xlsx")
    )
    csv = processor.process(
        _corpus_file(corpus_dir, "08_CSV", "P-102_Inspection_History.csv")
    )
    assert xlsx.processing_metadata.ocr_used is False
    assert csv.processing_metadata.ocr_used is False
    assert len(xlsx.tables) >= 1
    assert len(csv.tables) >= 1


def test_ground_truth_values_in_digital_sources(
    corpus_dir: Path, processor: DocumentProcessor, ground_truth: dict
):
    """Validate critical P-102 facts from strong digital sources."""
    sources = [
        _corpus_file(corpus_dir, "01_Digital_PDF", "P-102_Operating_and_Inspection_Report.pdf"),
        _corpus_file(corpus_dir, "05_DOCX", "P-102_Maintenance_Inspection_Report.docx"),
        _corpus_file(corpus_dir, "08_CSV", "P-102_Inspection_History.csv"),
        _corpus_file(corpus_dir, "09_TXT", "P-102_Maintenance_Notes.txt"),
        _corpus_file(corpus_dir, "10_Markdown", "P-102_Operating_Procedure.md"),
    ]
    blob = ""
    for path in sources:
        result = processor.process(path)
        assert result.processing_status != ProcessingStatus.FAILED
        blob += "\n" + _normalize_text(result.full_text) + "\n" + _normalize_text(result.markdown)
        for table in result.tables:
            for row in table.rows:
                blob += " " + " ".join(row)

    asset = ground_truth["asset_metadata"]
    assert asset["asset_id"] in blob
    assert str(asset["motor_power_kw"]) in blob
    assert str(asset["speed_rpm"]) in blob
    assert str(asset["design_flow_m3h"]) in blob

    incident = ground_truth["march_2026_vibration_incident"]
    assert str(incident["initial_reading_mm_s"]) in blob
    assert str(incident["post_maintenance_reading_mm_s"]) in blob
    assert str(incident["applicable_limit_mm_s"]) in blob

    # Ensure decimal values were not collapsed (5.6 must not become 56 alone as substitute)
    assert re.search(r"\b5\.6\b", blob)
    assert re.search(r"\b3\.9\b", blob)
    assert re.search(r"\b4\.5\b", blob)
    assert re.search(r"\b438\b", blob)

    for fact in CRITICAL_FACTS:
        assert fact in blob, f"Missing ground-truth fact: {fact}"
