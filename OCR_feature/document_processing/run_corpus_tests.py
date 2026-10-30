"""Process every ApexPetro_Test_Corpus category and report PASS/FAIL.

Usage:
  python run_corpus_tests.py
  python run_corpus_tests.py --skip-ocr   # digital/native only
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from document_processing.models import ProcessingStatus
from document_processing.processor import DocumentProcessor

CORPUS = Path(r"E:\SIH\PS117\OCR_feature\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus")

# Folder → whether OCR is expected (None = either)
CATEGORY_EXPECT = {
    "01_Digital_PDF": False,
    "02_Scanned_PDF": True,
    "03_Mixed_PDF": None,
    "04_Images": True,
    "05_DOCX": False,
    "06_PPTX": False,
    "07_XLSX": False,
    "08_CSV": False,
    "09_TXT": False,
    "10_Markdown": False,
    "11_HTML": False,
    "12_Handwritten": True,
    "13_Engineering_Drawing": True,
    "14_Charts": True,
    "15_Photographs": True,
    "16_URL_Test": False,
}

CRITICAL = ["P-102", "315", "1485", "475", "4.5", "5.6", "3.9", "438"]
OCR_HEAVY = {
    "02_Scanned_PDF",
    "03_Mixed_PDF",
    "04_Images",
    "12_Handwritten",
    "13_Engineering_Drawing",
    "14_Charts",
    "15_Photographs",
}


def _norm(text: str) -> str:
    text = text.replace("\u00b3", "3").replace("³", "3")
    text = text.replace("\u00b0", "deg").replace("°", "deg")
    return re.sub(r"\s+", " ", text)


def process_category(processor: DocumentProcessor, folder: Path) -> dict:
    files = [p for p in folder.iterdir() if p.is_file()]
    if not files:
        return {"category": folder.name, "status": "SKIPPED", "reason": "empty folder"}

    path = files[0]
    started = time.perf_counter()
    if folder.name == "16_URL_Test":
        result = processor.process_url(str(path))
    else:
        result = processor.process(path)
    elapsed = (time.perf_counter() - started) * 1000.0

    expect_ocr = CATEGORY_EXPECT.get(folder.name)
    ocr_ok = True
    if expect_ocr is True:
        ocr_ok = result.processing_metadata.ocr_used is True
    elif expect_ocr is False:
        ocr_ok = result.processing_metadata.ocr_used is False

    ok = result.processing_status != ProcessingStatus.FAILED and ocr_ok
    preview = _norm((result.full_text or "")[:240])

    return {
        "category": folder.name,
        "file": path.name,
        "status": "PASS" if ok else "FAIL",
        "processing_status": result.processing_status.value,
        "file_type": result.file_type,
        "ocr_used": result.processing_metadata.ocr_used,
        "vlm_used": result.processing_metadata.vision_used,
        "pages": result.metadata.page_count,
        "tables": len(result.tables),
        "images": sum(len(p.images) for p in result.pages),
        "chars": len(result.full_text or ""),
        "route": result.processing_metadata.processing_route,
        "warnings": result.processing_metadata.warnings,
        "error": result.error.model_dump() if result.error else None,
        "elapsed_ms": round(elapsed, 1),
        "preview": preview,
        "full_text": result.full_text or "",
        "markdown": result.markdown or "",
    }


def validate_ground_truth(rows: list[dict]) -> dict:
    gt_path = CORPUS / "17_Ground_Truth" / "P-102_Ground_Truth.json"
    gt = json.loads(gt_path.read_text(encoding="utf-8"))
    # Prefer digital/native sources for factual validation
    prefer = {
        "01_Digital_PDF",
        "05_DOCX",
        "07_XLSX",
        "08_CSV",
        "09_TXT",
        "10_Markdown",
        "11_HTML",
    }
    blob = ""
    for row in rows:
        if row.get("category") in prefer and row.get("status") == "PASS":
            blob += "\n" + _norm(row.get("full_text", ""))
            blob += "\n" + _norm(row.get("markdown", ""))

    found = {fact: bool(re.search(rf"\b{re.escape(fact)}\b", blob)) for fact in CRITICAL}
    # Decimal integrity
    decimal_ok = bool(re.search(r"\b5\.6\b", blob)) and bool(re.search(r"\b3\.9\b", blob))
    asset = gt["asset_metadata"]
    return {
        "status": "PASS" if all(found.values()) and decimal_ok else "FAIL",
        "facts_found": found,
        "decimal_integrity_ok": decimal_ok,
        "asset_id": asset["asset_id"],
        "motor_power_kw": asset["motor_power_kw"],
        "design_flow_m3h": asset["design_flow_m3h"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-ocr", action="store_true")
    parser.add_argument(
        "--out",
        default=str(ROOT / "corpus_test_results.json"),
    )
    args = parser.parse_args()

    if not CORPUS.is_dir():
        print(f"FAIL: corpus missing at {CORPUS}")
        return 2

    processor = DocumentProcessor(use_ocr=True, use_smolvlm=False)
    rows: list[dict] = []

    folders = sorted(
        [p for p in CORPUS.iterdir() if p.is_dir() and p.name != "17_Ground_Truth"]
    )
    print(f"Corpus: {CORPUS}")
    print(f"Categories: {len(folders)}")
    print("-" * 72)

    for folder in folders:
        if args.skip_ocr and folder.name in OCR_HEAVY:
            row = {
                "category": folder.name,
                "status": "SKIPPED",
                "reason": "skip-ocr",
            }
            rows.append(row)
            print(f"{folder.name:28} SKIPPED (ocr)")
            continue

        print(f"{folder.name:28} ...", end="", flush=True)
        try:
            row = process_category(processor, folder)
        except Exception as exc:
            row = {
                "category": folder.name,
                "status": "FAIL",
                "error": {"code": "EXCEPTION", "message": type(exc).__name__},
            }
        rows.append(row)
        print(
            f" {row['status']:7} type={row.get('file_type')} "
            f"ocr={row.get('ocr_used')} tables={row.get('tables')} "
            f"chars={row.get('chars')} ({row.get('elapsed_ms')} ms)"
        )

    gt = validate_ground_truth(rows)
    print("-" * 72)
    print(f"Ground-truth validation: {gt['status']}")
    print(f"  facts: {gt['facts_found']}")
    print(f"  decimal_integrity_ok: {gt['decimal_integrity_ok']}")

    summary = {
        "pass": sum(1 for r in rows if r.get("status") == "PASS"),
        "fail": sum(1 for r in rows if r.get("status") == "FAIL"),
        "skipped": sum(1 for r in rows if r.get("status") == "SKIPPED"),
    }
    print("-" * 72)
    print(f"SUMMARY pass={summary['pass']} fail={summary['fail']} skipped={summary['skipped']}")

    # Strip bulky text before writing summary file
    slim_rows = []
    for r in rows:
        slim = {k: v for k, v in r.items() if k not in {"full_text", "markdown"}}
        slim_rows.append(slim)

    out = {
        "corpus": str(CORPUS),
        "summary": summary,
        "ground_truth": gt,
        "categories": slim_rows,
    }
    out_path = Path(args.out)
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}")

    return 0 if summary["fail"] == 0 and gt["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
