"""Run OCR-heavy ApexPetro corpus categories only."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from document_processing.models import ProcessingStatus
from document_processing.processor import DocumentProcessor

CORPUS = Path(r"E:\SIH\PS117\OCR_feature\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus")
OCR_CATS = [
    "02_Scanned_PDF",
    "03_Mixed_PDF",
    "04_Images",
    "12_Handwritten",
    "13_Engineering_Drawing",
    "14_Charts",
    "15_Photographs",
]


def main() -> int:
    proc = DocumentProcessor(use_ocr=True, use_smolvlm=False)
    rows = []
    for name in OCR_CATS:
        folder = CORPUS / name
        path = next(p for p in folder.iterdir() if p.is_file())
        print(f"{name} ...", flush=True)
        t0 = time.perf_counter()
        result = proc.process(path)
        ms = (time.perf_counter() - t0) * 1000
        ok = result.processing_status != ProcessingStatus.FAILED
        row = {
            "category": name,
            "file": path.name,
            "status": "PASS" if ok else "FAIL",
            "processing_status": result.processing_status.value,
            "ocr_used": result.processing_metadata.ocr_used,
            "pages": result.metadata.page_count,
            "tables": len(result.tables),
            "chars": len(result.full_text or ""),
            "warnings": result.processing_metadata.warnings,
            "error": result.error.model_dump() if result.error else None,
            "elapsed_ms": round(ms, 1),
            "preview": (result.full_text or "")[:200].replace("\n", " "),
        }
        rows.append(row)
        print(
            f"  {row['status']} ocr={row['ocr_used']} chars={row['chars']} "
            f"({row['elapsed_ms']} ms)",
            flush=True,
        )

    summary = {
        "pass": sum(1 for x in rows if x["status"] == "PASS"),
        "fail": sum(1 for x in rows if x["status"] == "FAIL"),
    }
    out = {"categories": rows, "summary": summary}
    Path("corpus_results_ocr.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("SUMMARY", summary)
    return 0 if summary["fail"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
