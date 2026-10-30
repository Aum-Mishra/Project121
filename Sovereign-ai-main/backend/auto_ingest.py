import os
import re
import json
import csv
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor
from qdrant_client.http.models import PointStruct
from .vector_store import client, ensure_collection, VECTOR_COLLECTION
from .gateway import gateway_instance

_INGEST_LOCK = threading.Lock()
DATASET_DIR_NAME = "MRPL_Dataset_v3"
_CHUNK_SIZE = 1400
_CHUNK_OVERLAP = 180
_MAX_CHUNKS_PER_FILE = 2000
_TABLE_ROW_CAP = 1500
_EMBED_WORKERS = 3
_SKIP_DIRS = {"TEST_DATA"}

_EXTENSIONS = (
    ".json", ".jsonl", ".yaml", ".yml", ".csv", ".md", ".txt",
    ".xlsx", ".pdf", ".docx", ".pptx", ".parquet",
)

_TYPE_BY_SUFFIX = {
    ".yaml": "Specification", ".yml": "Specification",
    ".xlsx": "Spreadsheet", ".parquet": "Dataset", ".csv": "Spreadsheet",
    ".pdf": "PDF", ".docx": "Document", ".pptx": "Presentation",
    ".json": "Dataset", ".jsonl": "Dataset", ".md": "Document", ".txt": "Document",
}


def resolve_dataset_dir():
    candidates = [
        os.path.join(os.getcwd(), DATASET_DIR_NAME),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), DATASET_DIR_NAME),
        os.path.join("..", DATASET_DIR_NAME),
        DATASET_DIR_NAME,
    ]
    for p in candidates:
        if os.path.isdir(p):
            return p
    return None


def determine_access_roles(path: str) -> list[str]:
    path_lower = path.lower()
    if "hr" in path_lower or "human_factors" in path_lower:
        return ["ADMIN", "HR"]
    return ["ADMIN", "ENGINEER"]


def _windowize(text: str) -> list[str]:
    text = re.sub(r"\r\n", "\n", text or "")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) <= _CHUNK_SIZE:
        return [text] if text else []

    paras = [p for p in re.split(r"\n+", text) if p.strip()]
    windows = []
    buf = ""
    for para in paras:
        if buf and len(buf) + len(para) + 1 > _CHUNK_SIZE:
            windows.append(buf)
            buf = para[-_CHUNK_OVERLAP:] + "\n" + para if len(para) > _CHUNK_SIZE else para
        else:
            buf = f"{buf}\n{para}" if buf else para
        while len(buf) > _CHUNK_SIZE:
            windows.append(buf[:_CHUNK_SIZE])
            buf = buf[_CHUNK_SIZE - _CHUNK_OVERLAP:]
    if buf:
        windows.append(buf)

    result = []
    for w in windows:
        w = w.strip()
        if len(w) >= 8:
            result.append(w)
    return result


def _sample_indices(total: int, cap: int):
    if total <= cap:
        return list(range(total))
    step = total / cap
    idx = {int(i * step) for i in range(cap)}
    tail_start = max(0, total - cap // 3)
    idx.update(range(tail_start, total))
    return sorted(idx)


def _row_to_text(header, row_values) -> str:
    parts = []
    for i, v in enumerate(row_values):
        if v is None or v == "":
            continue
        h = header[i] if i < len(header) else f"col{i}"
        vs = str(v)
        if vs.strip() and vs.lower() not in ("nan", "nat", "<na>"):
            parts.append(f"{h}: {vs}")
    return " | ".join(parts)


def _serialize_json(value) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _json_to_items(data) -> list[str]:
    if isinstance(data, dict):
        items = []
        for key, val in data.items():
            if isinstance(val, list) and val and all(isinstance(x, dict) for x in val):
                items.extend(_serialize_json(x) for x in val)
            else:
                items.append(f"{key}: {_serialize_json(val)}")
        return items
    if isinstance(data, list):
        return [_serialize_json(x) for x in data]
    return [str(data)]


def _table_chunks(path: str, suffix: str, base_payload: dict):
    chunks = []
    name = os.path.basename(path)

    if suffix == ".xlsx":
        import openpyxl
        wb = openpyxl.load_workbook(path, data_only=True)
        try:
            for ws in wb.worksheets:
                rows = list(ws.iter_rows(values_only=True))
                header = [str(c) for c in rows[0]] if rows else []
                body = rows[1:] if rows else []
                label = ws.title or "Sheet"
                for i in _sample_indices(len(body), _TABLE_ROW_CAP):
                    txt = _row_to_text(header, body[i])
                    if txt:
                        chunks.append((txt, {**base_payload, "document_name": f"{name} - {label}"}))
        finally:
            wb.close()
        return chunks

    if suffix == ".parquet":
        import pyarrow.parquet as pq
        table = pq.read_table(path)
        header = [str(c) for c in table.column_names]
        n = table.num_rows
        for i in _sample_indices(n, _TABLE_ROW_CAP):
            row = tuple(table.column(j)[i].as_py() for j in range(table.num_columns))
            txt = _row_to_text(header, list(row))
            if txt:
                chunks.append((txt, base_payload))
        return chunks

    if suffix == ".csv":
        with open(path, "r", encoding="utf-8", errors="ignore", newline="") as f:
            reader = csv.reader(f)
            data = list(reader)
        header = data[0] if data else []
        body = data[1:] if data else []
        for i in _sample_indices(len(body), _TABLE_ROW_CAP):
            txt = _row_to_text(header, body[i])
            if txt:
                chunks.append((txt, base_payload))
        return chunks

    return chunks


def _extract_text(path: str, suffix: str) -> list[tuple[str, dict]]:
    name = os.path.basename(path)
    base = {
        "document_name": name,
        "type": _TYPE_BY_SUFFIX.get(suffix, "Document"),
        "access_roles": determine_access_roles(path),
        "path": os.path.relpath(path),
        "extension": suffix.lstrip("."),
    }

    if suffix in (".json", ".jsonl"):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f) if suffix == ".json" else [json.loads(line) for line in f if line.strip()]
        items = _json_to_items(data)
        if len(items) > _MAX_CHUNKS_PER_FILE:
            items = [items[i] for i in _sample_indices(len(items), _MAX_CHUNKS_PER_FILE)]
        result = []
        for it in items:
            result.extend((w, dict(base)) for w in _windowize(it))
        return result

    if suffix in (".md", ".txt", ".yaml", ".yml"):
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        return [(w, dict(base)) for w in _windowize(text)]

    if suffix == ".pdf":
        import pypdf
        reader = pypdf.PdfReader(path)
        result = []
        for n, page in enumerate(reader.pages, start=1):
            try:
                txt = page.extract_text() or ""
            except Exception:
                txt = ""
            for w in _windowize(txt):
                result.append((w, {**base, "document_name": f"{name} - Page {n}", "page": n}))
        return result

    if suffix == ".docx":
        import docx
        d = docx.Document(path)
        parts = [p.text for p in d.paragraphs if p.text]
        result = []
        for w in _windowize("\n".join(parts)):
            result.append((w, dict(base)))
        return result

    if suffix == ".pptx":
        from pptx import Presentation
        prs = Presentation(path)
        parts = []
        for n, slide in enumerate(prs.slides, start=1):
            slide_texts = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    t = shape.text_frame.text.strip()
                    if t:
                        slide_texts.append(t)
            if slide_texts:
                parts.append(f"[Slide {n}]\n" + "\n".join(slide_texts))
        result = []
        for w in _windowize("\n\n".join(parts)):
            if w.strip():
                result.append((w, dict(base)))
        return result

    if suffix in (".xlsx", ".parquet", ".csv"):
        return _table_chunks(path, suffix, base)

    return []


def _file_to_chunks(path: str) -> list[tuple[str, dict]]:
    suffix = os.path.splitext(path)[1].lower()
    try:
        chunks = _extract_text(path, suffix)
    except Exception as e:
        print(f"[auto_ingest] Failed to parse {path}: {e}")
        return []
    return chunks[:_MAX_CHUNKS_PER_FILE]


def _wipe_collection(target_collection: str):
    try:
        client.delete_collection(collection_name=target_collection)
        print(f"[auto_ingest] Deleted collection '{target_collection}' for full re-ingest.")
    except Exception as e:
        print(f"[auto_ingest] Collection delete failed (ignored): {e}")


def _upsert_batch(target_collection: str, points: list):
    if not points:
        return
    try:
        client.upsert(collection_name=target_collection, points=points, wait=True)
    except Exception as e:
        print(f"[auto_ingest] Upsert batch ({len(points)} points) failed: {e}")


def run_auto_ingest(force=False, limit=None, paths=None):
    """Ingests every folder/format of the MRPL dataset into Qdrant.

    Covers json/jsonl/yaml/csv/md/txt plus xlsx, pdf, docx, pptx and parquet
    with windowed chunking and sampled large tables. Rebuilds the collection
    from scratch when force=True; when paths=<list of basenames> only those
    files are ingested (incremental top-up, no wipe)."""
    with _INGEST_LOCK:
        target_collection = VECTOR_COLLECTION
        # Never attempt to embed when the active provider cannot serve
        # embeddings (e.g. cloud mode without NEBIUS_EMBEDDING_MODEL). Lexical
        # retrieval still covers the dataset; this also avoids thousands of
        # pointless failing calls at startup.
        try:
            from .ai_provider import embeddings_available, MODE as AI_MODE
            if not embeddings_available():
                print("[auto_ingest] Active provider has no embedding model; "
                      "skipping vector ingest (lexical retrieval remains available).")
                return {"ingested": 0, "collection": target_collection, "points": 0}
            if AI_MODE == "cloud" and os.getenv("CLOUD_AUTO_INGEST", "0").lower() not in ("1", "true", "yes"):
                # Embedding the whole corpus through a remote API at startup is
                # slow and billable. Cloud mode therefore uses lexical retrieval
                # unless the operator explicitly opts in.
                print("[auto_ingest] Cloud auto-ingest disabled (set CLOUD_AUTO_INGEST=1 "
                      "with NEBIUS_EMBEDDING_MODEL to enable vector indexing).")
                return {"ingested": 0, "collection": target_collection, "points": 0}
        except Exception as e:  # noqa: BLE001
            print(f"[auto_ingest] Embedding availability check failed: {e}")
        print(f"[auto_ingest] Ensuring collection '{target_collection}' ...")
        ensure_collection(target_collection)

        try:
            existing = client.count(collection_name=target_collection).count
        except Exception as e:
            print(f"[auto_ingest] Count failed: {e}")
            existing = 0

        dataset_dir = resolve_dataset_dir()
        if not dataset_dir:
            print("[auto_ingest] CRITICAL: Dataset directory not found. Skipping ingest.")
            return {"ingested": 0, "collection": target_collection, "points": existing}

        if force:
            _wipe_collection(target_collection)
            ensure_collection(target_collection)
            existing = 0
        elif existing > 0 and not paths:
            print(f"[auto_ingest] Collection '{target_collection}' already has {existing} points. Skipping ingest.")
            return {"ingested": 0, "collection": target_collection, "points": existing}

        files = []
        visited_dirs = set()
        for root, dirs, names in os.walk(dataset_dir):
            dirs[:] = [d for d in dirs if d not in _SKIP_DIRS]
            for d in dirs:
                visited_dirs.add(d)
            for name in sorted(names):
                if name.lower().endswith(_EXTENSIONS):
                    files.append(os.path.join(root, name))
        files.sort()

        if paths:
            wanted = {os.path.basename(p) for p in paths}
            files = [f for f in files if os.path.basename(f) in wanted]
            print(f"[auto_ingest] Incremental top-up: ingesting {len(files)} files: {sorted(os.path.basename(f) for f in files)}")
        else:
            print(f"[auto_ingest] Found {len(files)} dataset files across {len(visited_dirs)} folders: {sorted(visited_dirs)}")

        plans = []
        total_chunks = 0
        for path in files:
            chunks = _file_to_chunks(path)
            total_chunks += len(chunks)
            plans.append((path, chunks))
        print(f"[auto_ingest] Extracted {total_chunks} chunks total. Embedding with {_EMBED_WORKERS} workers ...")

        def embed_one(args):
            text, payload = args
            try:
                vector = gateway_instance.embed(text)
                return PointStruct(id=str(uuid.uuid4()), vector=vector, payload={"text": text, **payload})
            except Exception as e:
                print(f"[auto_ingest] Embedding failed for '{payload.get('document_name')}': {e}")
                return None

        points = []
        ingested = 0
        skipped = 0
        tasks = []
        queued = 0
        for _path, chunks in plans:
            for text, payload in chunks:
                if limit is not None and queued >= limit:
                    break
                tasks.append((text, payload))
                queued += 1
            if limit is not None and queued >= limit:
                break

        with ThreadPoolExecutor(max_workers=_EMBED_WORKERS) as pool:
            for result in pool.map(embed_one, tasks):
                if result is None:
                    skipped += 1
                    continue
                points.append(result)
                if len(points) >= 64:
                    _upsert_batch(target_collection, points)
                    ingested += len(points)
                    points = []
                    if ingested % 256 == 0:
                        print(f"[auto_ingest] Ingested {ingested} chunks...")

        _upsert_batch(target_collection, points)
        ingested += len(points)
        total = client.count(collection_name=target_collection).count
        print(f"[auto_ingest] Done: ingested {ingested} chunks ({skipped} failed) -> collection has {total} points.")
        return {"ingested": ingested, "collection": target_collection, "points": total}


def start_auto_ingest_background(force=False):
    t = threading.Thread(target=run_auto_ingest, kwargs={"force": force}, daemon=True)
    t.start()