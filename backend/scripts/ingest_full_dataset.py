"""Idempotent full-corpus ingestion for ApexPetro_Sovereign_Dataset_v3.

Walks the entire dataset (all knowledge content, excluding TEST_DATA / tools /
templates / repo report PDFs) and registers + chunks + embeds every supported
file into the existing SQLite DB and the Qdrant ``apexpetro_knowledge``
collection without destroying any existing company data.

Idempotency / update model
--------------------------
* Every file maps to a deterministic ``document_id`` (registry id if the file
  is listed in ``metadata/document_registry.json``, else a stable path-derived
  id), so re-runs target the same rows.
* A content hash of the raw file is stored in ``Document.doc_metadata``.
* On re-run:
    - unchanged file + READY document  -> skipped (no re-embedding, no dups)
    - changed file / missing chunks    -> the document's old chunks and old
      Qdrant points are deleted, then the file is re-processed from scratch.
* Company/tenant isolation is preserved (company_id = settings.company_id).

Format support
--------------
* PDF (fitz), DOCX (python-docx), XLSX (openpyxl), PPTX (python-pptx)
* TXT / MD / JSON / JSONL / YAML / YML / CSV -> rendered structured text
* Parquet -> aggregated per (year, asset) into compact statistical summaries
  (bounded chunk count) instead of embedding every time-series row.

Usage:  python scripts/ingest_full_dataset.py [--data PATH] [--dry-run] [--limit N]
"""
import asyncio
import csv
import hashlib
import io
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import yaml
from qdrant_client.models import PointStruct

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.db.database import SessionLocal
from app.db.models import Document, DocumentChunk, DocumentClassification, DocumentStatus, DocumentType
from app.rag.chunker import chunk_pages, count_tokens
from app.rag.doc_metadata import derive_document_metadata, extract_asset_ids
from app.rag.embeddings import get_embeddings_batch
from app.rag.vector_store import vector_store

logger = get_logger(__name__)

# Bump this when ingestion logic / metadata extraction changes so already-hashed
# documents are reprocessed with the new logic on the next run.
PROCESSOR_VERSION = 4

# Top-level relative path prefixes that are NOT company knowledge content.
EXCLUDED_PREFIXES = (
    "TEST_DATA",
    "TEST_DATA_REMOVE_LATER",
    "tools",
    "templates",
)
# Individual repo/meta report PDFs at the dataset root that duplicate the
# synthetic corpus and are not navigation content.
EXCLUDED_ROOT_FILES = {
    "ApexPetro_Dataset_Expansion_Full_Report.pdf",
    "ApexPetro_Industrial_Intelligence_Dataset_Report.pdf",
    "README.md",
}

SUPPORTED_SUFFIXES = {
    ".pdf", ".docx", ".xlsx", ".pptx",
    ".txt", ".md", ".json", ".jsonl", ".yaml", ".yml", ".csv",
    ".parquet",
}

FILE_TYPE_MAP = {
    ".pdf": DocumentType.PDF,
    ".docx": DocumentType.DOCX,
    ".xlsx": DocumentType.XLSX,
    ".pptx": DocumentType.PPTX,
    ".txt": DocumentType.TXT,
    ".md": DocumentType.TXT,
    ".json": DocumentType.OTHER,
    ".jsonl": DocumentType.OTHER,
    ".yaml": DocumentType.OTHER,
    ".yml": DocumentType.OTHER,
    ".csv": DocumentType.OTHER,
    ".parquet": DocumentType.OTHER,
}


# --------------------------------------------------------------------------- #
# Stable document identity
# --------------------------------------------------------------------------- #
def _slugify(relpath: str) -> str:
    base = relpath.rsplit(".", 1)[0]
    base = base.replace("\\", "/")
    base = "".join(ch if (ch.isalnum() or ch in "_-") else "_" for ch in base)
    base = base.strip("_")
    # Qdrant/DB document_id unique; cap length with a short hash when needed.
    if len(base) <= 80:
        return base
    h = hashlib.sha1(relpath.encode()).hexdigest()[:10]
    return f"{base[:69]}_{h}"


def _load_registry(data_path: Path) -> Dict[str, Dict[str, Any]]:
    """doc registry path (normalised) -> registry entry (document_id, owner, ...)."""
    reg_path = data_path / "metadata" / "document_registry.json"
    if not reg_path.exists():
        return {}
    try:
        raw = json.loads(reg_path.read_text())
    except Exception:
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    for entry in raw.get("documents", []) or []:
        p = (entry.get("path") or "").replace("\\", "/").lstrip("/")
        out.setdefault(p, entry)
    return out


def resolve_document_id(relpath: str, registry: Dict[str, Dict[str, Any]]) -> str:
    norm = relpath.replace("\\", "/")
    entry = registry.get(norm)
    if entry and entry.get("document_id"):
        return entry["document_id"]
    return _slugify(norm)


# --------------------------------------------------------------------------- #
# Content hashing
# --------------------------------------------------------------------------- #
def _file_content_hash(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


# --------------------------------------------------------------------------- #
# Parsers (structured -> list of "pages" with text, page_number, section)
# --------------------------------------------------------------------------- #
def _parse_pdf(file_path: Path) -> List[Dict[str, Any]]:
    import fitz
    doc = fitz.open(file_path)
    pages = []
    for page_num, page in enumerate(doc):
        text = page.get_text()
        pages.append({
            "page_number": page_num + 1,
            "text": text,
            "has_text": len(text.strip()) > 0,
        })
    doc.close()
    return pages


def _parse_docx(file_path: Path) -> List[Dict[str, Any]]:
    import docx
    doc = docx.Document(str(file_path))
    full_text = "\n".join([p.text for p in doc.paragraphs])
    return [{
        "page_number": 1,
        "text": full_text,
        "has_text": bool(full_text.strip()),
    }]


# Bounds keep the corpus high-value instead of exploding the vector index with
# raw rows of large time-series/tabular files.
_MAX_CSV_ROWS = 1200
_MAX_JSONL_GROUPS = 30
_MAX_JSON_RECORDS = 300
_MAX_XLSX_ROWS_PER_SHEET = 1500


def _group_records(rows: List[Dict[str, Any]], cols: List[str]) -> List[List[Dict[str, Any]]]:
    """Split dict-rows into bounded groups keyed by year (Timestamp/Date) when
    available, else a categorical column, else a single global group."""
    year_keys = [c for c in ("Timestamp", "Date", "Event_Timestamp", "Inspection_Date") if c in cols]
    cat_keys = [c for c in ("Asset_ID", "Unit", "Category", "Severity", "Event_Category") if c in cols]

    def _year_of(r):
        for k in year_keys:
            v = r.get(k)
            if v is None:
                continue
            m = re.search(r"(20\d{2})", str(v))
            if m:
                return m.group(1)
        return None

    def _key_of(r):
        parts = []
        if year_keys:
            y = _year_of(r)
            if y:
                parts.append(y)
        for k in cat_keys[:1]:
            v = r.get(k)
            if v is not None and str(v).strip():
                parts.append(str(v))
        return " | ".join(parts) if parts else None

    groups: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        k = _key_of(row) or "ALL"
        groups.setdefault(k, []).append(row)
    # Cap number of groups to keep the chunk count bounded.
    ordered = list(groups.items())
    ordered.sort(key=lambda kv: (-len(kv[1]), kv[0]))
    if len(ordered) > _MAX_JSONL_GROUPS:
        kept = ordered[:_MAX_JSONL_GROUPS - 1]
        rest = [r for _, g in ordered[_MAX_JSONL_GROUPS - 1:] for r in g]
        if rest:
            kept.append(("Other", rest))
        ordered = kept
    return [rows for _, rows in ordered]


def _rows_to_text(rows: List[Dict[str, Any]], max_records: Optional[int] = None) -> str:
    lines = []
    for i, r in enumerate(rows):
        if max_records is not None and i >= max_records:
            lines.append(f"... ({len(rows) - max_records} more records omitted)")
            break
        lines.append(" | ".join(f"{k}= {v}" for k, v in r.items() if v is not None))
    return "\n".join(lines)


def _parse_xlsx(file_path: Path) -> List[Dict[str, Any]]:
    import openpyxl
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    pages = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append([str(c) if c is not None else "" for c in row])
        useful = [r for r in rows if any(r)]
        total = len(useful)
        if total > _MAX_XLSX_ROWS_PER_SHEET:
            useful = useful[:_MAX_XLSX_ROWS_PER_SHEET]
            rows_text = "\n".join(["\t".join(r) for r in useful])
            rows_text += f"\n... ({total - _MAX_XLSX_ROWS_PER_SHEET} more rows omitted; {total} total)"
        else:
            rows_text = "\n".join(["\t".join(r) for r in useful])
        pages.append({
            "page_number": len(pages) + 1,
            "text": rows_text,
            "has_text": bool(rows_text.strip()),
            "section": sheet_name,
        })
    wb.close()
    return pages


def _parse_pptx(file_path: Path) -> List[Dict[str, Any]]:
    from pptx import Presentation
    prs = Presentation(str(file_path))
    pages = []
    for i, slide in enumerate(prs.slides):
        texts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    if para.text:
                        texts.append(para.text)
            if getattr(shape, "has_table", False):
                for row in shape.table.rows:
                    cells = [c.text for c in row.cells]
                    texts.append(" | ".join(cells))
        pages.append({
            "page_number": i + 1,
            "text": "\n".join(texts),
            "has_text": bool(texts),
        })
    return pages


def _parse_txt(file_path: Path) -> List[Dict[str, Any]]:
    text = file_path.read_text(encoding="utf-8", errors="ignore")
    return [{
        "page_number": 1,
        "text": text,
        "has_text": bool(text.strip()),
    }]


def _render_structured(data: Any, indent: int = 0) -> str:
    """Render nested JSON/YAML data into compact 'key: value' lines."""
    pad = "  " * indent
    if isinstance(data, dict):
        lines = []
        for k, v in data.items():
            if isinstance(v, (dict, list)):
                lines.append(f"{pad}{k}:")
                lines.append(_render_structured(v, indent + 1).rstrip("\n"))
            else:
                lines.append(f"{pad}{k}: {v if v is not None else ''}")
        return "\n".join(lines) + "\n"
    if isinstance(data, list):
        lines = []
        for item in data:
            if isinstance(item, (dict, list)):
                lines.append(_render_structured(item, indent).rstrip("\n"))
            else:
                lines.append(f"{pad}- {item}")
        return "\n".join(lines) + "\n"
    return f"{pad}{data}\n"


def _parse_json(file_path: Path) -> List[Dict[str, Any]]:
    try:
        data = json.loads(file_path.read_text(encoding="utf-8", errors="ignore"))
    except Exception as e:
        return [{"page_number": 1, "text": f"JSON parse error: {e}", "has_text": True}]
    # Bound very large arrays (relationship graphs, scenario lists) so a single
    # file cannot flood the index with thousands of chunks.
    if isinstance(data, list) and len(data) > _MAX_JSON_RECORDS:
        text_lines = [f"Total records: {len(data)}"]
        text_lines.append(_rows_to_text(data[:_MAX_JSON_RECORDS]) if all(isinstance(r, dict) for r in data[:10])
                          else _render_structured(data[:_MAX_JSON_RECORDS]))
        text = "\n".join(text_lines) + "\n... (truncated)"
    else:
        text = _render_structured(data)
    return [{"page_number": 1, "text": text, "has_text": bool(text.strip())}]


def _parse_jsonl(file_path: Path) -> List[Dict[str, Any]]:
    records = []
    with open(file_path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except Exception:
                records.append({"raw": line})

    if len(records) > _MAX_JSONL_GROUPS * 20:
        groups = _group_records(records, list(records[0].keys()) if records else [])
        pages = []
        for grp in groups:
            n = len(grp)
            head = {
                k: v for k, v in grp[0].items() if k in ("Timestamp", "Event_ID", "Unit", "Asset_ID", "Category")
            }
            text_lines = [f"Group: {grp[0].get('Timestamp', '')} | {grp[0].get('Asset_ID', '')} | {grp[0].get('Category', '')}",
                          f"Records: {n}", "Sample:"]
            text_lines.append(_rows_to_text(grp, max_records=10))
            pages.append({
                "page_number": len(pages) + 1,
                "text": "\n".join(text_lines),
                "has_text": True,
                "section": "Aggregated events",
            })
        return pages

    text = "\n".join(_render_structured(r).rstrip("\n") for r in records)
    return [{"page_number": 1, "text": text, "has_text": bool(text.strip())}]


def _parse_structured_text(file_path: Path, kind: str) -> List[Dict[str, Any]]:
    if kind == "json":
        return _parse_json(file_path)
    if kind == "jsonl":
        return _parse_jsonl(file_path)
    if kind in ("yaml", "yml"):
        try:
            data = yaml.safe_load(file_path.read_text(encoding="utf-8", errors="ignore"))
            text = _render_structured(data if data is not None else "")
            return [{"page_number": 1, "text": text, "has_text": bool(text.strip())}]
        except Exception as e:
            return [{"page_number": 1, "text": f"YAML parse error: {e}", "has_text": True}]
    if kind == "csv":
        rows = []
        with open(file_path, encoding="utf-8", errors="ignore", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row:
                    rows.append({k: v for k, v in row.items()})
        if len(rows) > _MAX_CSV_ROWS:
            cols = list(rows[0].keys()) if rows else []
            groups = _group_records(rows, cols)
            pages = []
            for grp in groups:
                n = len(grp)
                text_lines = [
                    f"File: {file_path.stem.replace('_', ' ').title()}",
                    f"Segment: {grp[0].get('Timestamp', '')} | {grp[0].get('Asset_ID', '')} | {grp[0].get('Category', '')}",
                    f"Records: {n}",
                    "Sample:",
                ]
                text_lines.append(_rows_to_text(grp, max_records=12))
                pages.append({
                    "page_number": len(pages) + 1,
                    "text": "\n".join(text_lines),
                    "has_text": True,
                    "section": "Aggregated",
                })
            return pages
        text = "\n".join("\t".join(str(v) for v in r.values()) for r in rows)
        return [{"page_number": 1, "text": text, "has_text": bool(text.strip())}]
    return _parse_txt(file_path)


def _aggregate_parquet(file_path: Path, max_sections: int = 40) -> List[Dict[str, Any]]:
    """Summarise a parquet time-series into bounded per-group statistical chunks."""
    import pandas as pd

    df = pd.read_parquet(file_path)
    if df.empty:
        return [{"page_number": 1, "text": "Parquet file is empty.", "has_text": True}]

    name = file_path.stem.replace("_", " ").title()
    cols = [c for c in df.columns]
    numeric_cols = [c for c in df.columns if df[c].dtype.kind in "ifb" and df[c].notna().sum() > 0]

    # Choose grouping columns if present.
    group_cols = [c for c in ("Asset_ID", "Unit", "Component", "Inspection_Point_ID", "Measurement_Point") if c in df.columns]
    year_col = "Timestamp" if "Timestamp" in df.columns else None

    if year_col is not None and group_cols:
        df["_year"] = pd.to_datetime(df[year_col], errors="coerce").dt.year
        group = df.groupby(group_cols + ["_year"])
    elif year_col is not None:
        df["_year"] = pd.to_datetime(df[year_col], errors="coerce").dt.year
        group = df.groupby("_year")
    elif group_cols:
        group = df.groupby(group_cols)
    else:
        df["_g"] = 1
        group = df.groupby("_g")

    sections: List[str] = []
    for keys, sub in group:
        if len(sections) >= max_sections:
            break
        if not isinstance(keys, tuple):
            keys = (keys,)
        head = ", ".join(str(k) for k in keys if k == k)  # ignore NaN
        sub_num = sub[numeric_cols] if numeric_cols else sub
        lines = [f"File: {name}", f"Segment: {head}", f"Records: {len(sub)}"]
        if numeric_cols:
            stats = sub[numeric_cols].agg(["min", "mean", "max"]).round(3)
            for col in numeric_cols:
                r = stats[col]
                lines.append(
                    f"{col}: min={r['min']}, mean={r['mean']}, max={r['max']}"
                )
        # Latest few rows as concrete examples (bounded).
        recent = sub.tail(5)
        for _, row in recent.iterrows():
            parts = []
            for c in cols[:8]:
                v = row[c]
                if v is not None and v == v:
                    parts.append(f"{c}= {v}")
            lines.append("; ".join(parts))
        sections.append("\n".join(lines) + "\n")

    if not sections:
        return [{"page_number": 1, "text": _render_structured(df.head(20).to_dict("records")),
                 "has_text": True}]

    pages = []
    for i, text in enumerate(sections):
        pages.append({
            "page_number": i + 1,
            "text": text,
            "has_text": True,
            "section": f"Aggregated {name}",
        })
    return pages


def parse_file_for_ingest(file_path: Path) -> List[Dict[str, Any]]:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return _parse_pdf(file_path)
    if suffix == ".docx":
        return _parse_docx(file_path)
    if suffix == ".xlsx":
        return _parse_xlsx(file_path)
    if suffix == ".pptx":
        return _parse_pptx(file_path)
    if suffix == ".json":
        return _parse_structured_text(file_path, "json")
    if suffix == ".jsonl":
        return _parse_structured_text(file_path, "jsonl")
    if suffix in (".yaml", ".yml"):
        return _parse_structured_text(file_path, "yaml")
    if suffix == ".csv":
        return _parse_structured_text(file_path, "csv")
    if suffix == ".parquet":
        return _aggregate_parquet(file_path)
    return _parse_txt(file_path)


# --------------------------------------------------------------------------- #
# Page-level semantic enrichment
# --------------------------------------------------------------------------- #
_ASSET_COUNT_RE = re.compile(r"(?i)\b(P|PT|TT|LT|FT|V|T|E|C|F|M|R|B|D|K)-?\s?(\d{2,3})\b")


def _page_assets(text: str) -> List[str]:
    """Most-frequent asset id(s) mentioned in a page (deterministic)."""
    counts: Dict[str, int] = {}
    order: List[str] = []
    for m in _ASSET_COUNT_RE.finditer(text or ""):
        asset = f"{m.group(1).upper()}-{int(m.group(2))}"
        if asset not in counts:
            counts[asset] = 0
            order.append(asset)
        counts[asset] += 1
    ranked = sorted(order, key=lambda a: (-counts[a], order.index(a)))
    return ranked[:3]


def _page_year(text: str) -> Optional[int]:
    m = re.search(r"\b(20\d{2})\b", text or "")
    if not m:
        return None
    y = int(m.group(1))
    if 1980 <= y <= 2100:
        return y
    return None


def _enrich_pages(pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attach 'assets' and 'year' to structured pages from their content so the
    per-chunk metadata (and Qdrant payload) carries a usable asset/year."""
    for page in pages:
        text = page.get("text", "")
        assets = _page_assets(text)
        if assets:
            page["assets"] = assets
        year = _page_year(text)
        if year:
            page["year"] = year
    return pages


def _chunk_pages_with_page_meta(pages: List[Dict[str, Any]], doc_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Build chunks and fold per-page asset/year into each chunk's metadata."""
    chunks = chunk_pages(pages, doc_metadata=doc_metadata)
    for page in pages:
        page_num = page.get("page_number", 0)
        assets = page.get("assets") or []
        year = page.get("year")
        for c in chunks:
            if c.get("page_number") != page_num:
                continue
            if assets:
                c["metadata"]["asset_id"] = assets[0]
                c["metadata"]["asset_ids"] = assets
            if year:
                c["metadata"]["year"] = year
    return chunks


# --------------------------------------------------------------------------- #
# DB helpers
# --------------------------------------------------------------------------- #
def _delete_document_chunks(db, doc: Document) -> None:
    for chunk in doc.chunks:
        if chunk.id is not None:
            try:
                vector_store.delete_by_document(doc.document_id, doc.company_id)
                break
            except Exception:
                break
    db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).delete(synchronize_session=False)
    db.commit()


async def _embed_chunks(pages: List[Dict[str, Any]], doc_metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
    chunks = _chunk_pages_with_page_meta(pages, doc_metadata)
    if not chunks:
        return []
    texts = [c["content"] for c in chunks]
    embeddings = await get_embeddings_batch(texts)
    for c, e in zip(chunks, embeddings):
        c["embedding"] = e
    return chunks


def _upsert_document(
    db,
    doc: Document,
    chunks: List[Dict[str, Any]],
    company_id: str,
) -> int:
    """Persist chunk rows (point id = chunk db id) and push Qdrant points."""
    derived = derive_document_metadata(doc)
    db_objs = []
    for c in chunks:
        db_objs.append(DocumentChunk(
            document_id=doc.id,
            chunk_index=c["chunk_index"],
            content=c["content"],
            page_number=c["page_number"],
            section=c.get("section"),
            token_count=c.get("token_count", count_tokens(c["content"])),
            embedding=c["embedding"],
            chunk_metadata=c["metadata"],
        ))
    db.add_all(db_objs)
    db.flush()

    points = []
    for db_chunk, c in zip(db_objs, chunks):
        meta = c.get("metadata") or {}
        # Per-chunk asset/year/metadata (from page-level enrichment) wins over
        # the doc-level derived values, per-page section retained too.
        payload = {
            "company_id": company_id,
            "document_id": doc.document_id,
            "document_name": doc.file_name,
            "chunk_id": db_chunk.id,
            "page_number": db_chunk.page_number,
            "section": db_chunk.section or (meta or {}).get("section"),
            "file_type": getattr(doc.file_type, "value", doc.file_type),
            "classification": getattr(doc.classification, "value", doc.classification),
            "asset_id": meta.get("asset_id") if meta.get("asset_id") else derived.get("asset_id"),
            "document_type": meta.get("document_type") or derived.get("document_type"),
            "year": meta.get("year") if meta.get("year") else derived.get("year"),
            "department": derived.get("department"),
            "owner": derived.get("owner"),
            "revision": derived.get("revision"),
            "source_folder": derived.get("source_folder"),
            "content": db_chunk.content,
        }
        points.append(PointStruct(
            id=db_chunk.id,
            vector=c["embedding"],
            payload=payload,
        ))
    if points:
        vector_store.upsert_points(points, vector_size=1024)
    db.commit()
    return len(db_objs)


# --------------------------------------------------------------------------- #
# Main ingestion
# --------------------------------------------------------------------------- #
def discover_files(data_path: Path) -> List[Path]:
    files = []
    for p in sorted(data_path.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(data_path).as_posix()
        if rel.split("/")[0] in EXCLUDED_PREFIXES:
            continue
        if "/" not in rel and (p.name in EXCLUDED_ROOT_FILES):
            continue
        if p.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        files.append(p)
    return files


async def ingest_file(db, file_path: Path, data_path: Path, registry: Dict[str, Dict[str, Any]],
                      company_id: str, dry_run: bool,
                      counters: Dict[str, int]) -> Dict[str, Any]:
    relpath = file_path.relative_to(data_path).as_posix()
    document_id = resolve_document_id(relpath, registry)
    file_size = file_path.stat().st_size
    file_hash = _file_content_hash(file_path)
    file_type = FILE_TYPE_MAP.get(file_path.suffix.lower(), DocumentType.OTHER)
    classification = DocumentClassification.CONFIDENTIAL

    from app.db.models import Document as DocumentModel

    doc = db.query(DocumentModel).filter(
        DocumentModel.document_id == document_id,
        DocumentModel.company_id == company_id,
    ).first()

    # Determine intended action first so dry-run never mutates anything.
    existing_hash = (doc.doc_metadata or {}).get("content_hash") if doc else None
    existing_ready = doc is not None and (
        doc.status == DocumentStatus.READY and doc.chunks and len(doc.chunks) > 0
    )

    # Determine intended action first so dry-run never mutates anything.
    existing_hash = (doc.doc_metadata or {}).get("content_hash") if doc else None
    existing_version = (doc.doc_metadata or {}).get("processor_version") if doc else None
    existing_ready = doc is not None and (
        doc.status == DocumentStatus.READY and doc.chunks and len(doc.chunks) > 0
    )

    if doc is not None:
        if existing_ready and existing_version == PROCESSOR_VERSION and (
                existing_hash == file_hash or (not existing_hash and file_hash)):
            # Unchanged + current processor logic -> true no-op.
            if not existing_hash:
                if doc.doc_metadata is None:
                    doc.doc_metadata = {}
                doc.doc_metadata["content_hash"] = file_hash
                db.commit()
            counters["skipped_unchanged"] += 1
            return {"file": relpath, "document_id": document_id, "action": "skipped",
                    "reason": "unchanged"}
        is_new = False
    else:
        is_new = True

    if dry_run:
        action = "would_ingest" if is_new else "would_reprocess"
        counters["skipped_unchanged" if False else "processed"] += 1
        return {"file": relpath, "document_id": document_id, "action": action}

    if is_new:
        reg = registry.get(relpath) or {}
        doc = DocumentModel(
            document_id=document_id,
            company_id=company_id,
            file_name=file_path.name,
            file_path=str(file_path),
            file_type=file_type,
            file_size=file_size,
            classification=classification,
            status=DocumentStatus.PROCESSING,
            owner=reg.get("owner"),
            revision=reg.get("revision"),
            source_path=relpath,
            doc_metadata={"content_hash": file_hash, "processor_version": PROCESSOR_VERSION},
        )
        db.add(doc)
        db.flush()
        db.commit()
    else:
        # Reprocess changed / incomplete document: remove old chunks + points.
        _delete_document_chunks(db, doc)
        doc.file_size = file_size
        doc.file_path = str(file_path)
        doc.file_type = file_type
        doc.classification = classification
        if doc.doc_metadata is None:
            doc.doc_metadata = {}
        doc.doc_metadata["content_hash"] = file_hash
        doc.doc_metadata["processor_version"] = PROCESSOR_VERSION
        doc.status = DocumentStatus.PROCESSING
        db.commit()

    # Parse -> chunk -> embed
    try:
        pages = _enrich_pages(parse_file_for_ingest(file_path))
        doc_meta = {
            "company_id": company_id,
            "document_id": document_id,
            "file_name": file_path.name,
            "classification": classification.value,
        }
        derived = derive_document_metadata(doc)
        doc_meta.update({k: v for k, v in derived.items() if v is not None})

        if not any(p.get("has_text", False) for p in pages) and not any(p.get("text", "").strip() for p in pages):
            raise ValueError("No text extracted")
        chunks = await _embed_chunks(pages, doc_meta)
        if not chunks:
            raise ValueError("No chunks produced")
        n = _upsert_document(db, doc, chunks, company_id)
        doc.status = DocumentStatus.READY
        from datetime import datetime
        doc.indexed_at = datetime.utcnow()
        db.commit()
        counters["processed"] += 1
        return {"file": relpath, "document_id": document_id, "action": "ingested" if is_new else "reprocessed",
                "chunks": n}
    except Exception as e:
        doc.status = DocumentStatus.ERROR
        doc.error_message = str(e)[:500]
        db.commit()
        counters["failed"] += 1
        return {"file": relpath, "document_id": document_id, "action": "failed", "error": str(e)[:300]}


async def main(data_path: Path, dry_run: bool = False, limit: Optional[int] = None) -> None:
    data_path = data_path.resolve()
    if not data_path.exists():
        print(f"Data path not found: {data_path}")
        return

    db = SessionLocal()
    company_id = settings.company_id
    vector_store.create_collection(vector_size=1024)

    files = discover_files(data_path)
    if limit:
        files = files[:limit]
    registry = _load_registry(data_path)

    print(f"Discovered {len(files)} files under {data_path}")
    counters = {
        "discovered": len(files),
        "processed": 0,
        "ingested": 0,
        "reprocessed": 0,
        "skipped_unchanged": 0,
        "failed": 0,
    }
    results = []
    try:
        for idx, fp in enumerate(files, 1):
            r = await ingest_file(db, fp, data_path, registry, company_id, dry_run, counters)
            results.append(r)
            if r.get("action") == "ingested":
                counters["ingested"] += 1
            elif r.get("action") == "reprocessed":
                counters["reprocessed"] += 1
            if idx % 20 == 0:
                print(f"  ... {idx}/{len(files)}", flush=True)
    finally:
        db.close()

    print("\n================ INGESTION SUMMARY ================")
    print(f"Discovered files          : {counters['discovered']}")
    print(f"Processed (ingested/update): {counters['processed']}")
    print(f"  - newly ingested        : {counters['ingested']}")
    print(f"  - reprocessed (changed) : {counters['reprocessed']}")
    print(f"Skipped (unchanged)       : {counters['skipped_unchanged']}")
    print(f"Failed                    : {counters['failed']}")
    print("===================================================")

    failed = [r for r in results if r.get("action") == "failed"]
    if failed:
        print("\nFailed files:")
        for r in failed:
            print(f"  - {r['file']}: {r.get('error')}")


if __name__ == "__main__":
    configure_logging()
    import argparse
    parser = argparse.ArgumentParser(description="Ingest full ApexPetro dataset")
    parser.add_argument("--data", type=str,
                        default=str(Path(__file__).resolve().parent.parent.parent / "ApexPetro_Sovereign_Dataset_v3"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    asyncio.run(main(Path(args.data), dry_run=args.dry_run, limit=args.limit))
