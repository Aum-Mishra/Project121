# Document Processing & OCR Module – Integration Guide

Hand this file to the RAG teammate. Follow the steps **in order**.

---

## 1. Module Overview

**What it does:** Converts a user file (or local URL/HTML path) into structured JSON + Markdown.

**Where it fits:**

```
User File/URL
    → Document Processing + OCR (THIS MODULE)
    → Structured DocumentResult
    → Your RAG Pipeline (chunk → BGE-M3 → vector DB → retrieve → LLM)
```

**Boundary:** This module stops **before** embedding, vector DB, retrieval, and LLM answering.  
You must **not** re-implement Docling/OCR here — consume `DocumentResult` only.

| Item | Value |
|------|--------|
| Package folder | `document_processing/` |
| Public imports | `DocumentProcessor`, `DocumentResult`, `DocumentProcessingError` |
| FastAPI app | `document_processing.api.app:app` |
| CLI | `process_document.py` |

---

## 2. Supported Inputs

| Format | Processing |
|--------|------------|
| PDF (digital / scanned / mixed) | Docling on digital pages; RapidOCR on scanned pages |
| DOCX, PPTX | Native Office parser |
| XLSX, CSV | Native tables (**never OCR**) |
| TXT | Native text |
| Markdown, HTML | Native markup parsers |
| PNG (also JPG/TIFF/BMP/WEBP) | RapidOCR; optional SmolVLM |
| Local path / `file://` / optional HTTP(S) | `process_url()` — network **off** by default |

---

## 3. Integration Interface

You can integrate in **two ways**. Prefer **A** inside the same Python process; use **B** if RAG runs as a separate service.

### A) Python (in-process)

```python
from document_processing import DocumentProcessor, DocumentResult

processor = DocumentProcessor(use_ocr=True, use_smolvlm=False)

# Step: process uploaded file path
result: DocumentResult = processor.process(saved_file_path)

# Or local HTML / URL input
# result = processor.process_url(r"E:\path\to\file.html")

# Step: convert to plain dict for your pipeline
payload = result.to_rag_payload()   # same as result.model_dump(mode="json")
```

**Constructor flags**

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `use_ocr` | `True` | Enable RapidOCR |
| `use_smolvlm` | `False` | Optional local VLM fallback |
| `ocr_confidence_threshold` | `0.5` | OCR score floor |

**Error handling (important)**  
`process()` / `process_url()` usually **do not raise**. Check the result:

1. Read `result.processing_status` → `"success"` | `"partial"` | `"failed"`
2. If `"failed"` → read `result.error.code` and `result.error.message`
3. Common codes: `UNSUPPORTED_FILE_TYPE`, `EMPTY_DOCUMENT`, `CORRUPTED_FILE`, `INVALID_OFFICE_DOCUMENT`, `URL_FETCH_ERROR`, `INTERNAL_ERROR`

### B) HTTP API (FastAPI)

| Step | Endpoint | Method |
|------|----------|--------|
| Health check | `/api/documents/health` | `GET` |
| Process document | `/api/documents/process` | `POST` |

**Request:** `multipart/form-data`

| Field | Required? | Default | Description |
|-------|-----------|---------|-------------|
| `file` | Yes (or `url`) | — | Uploaded document |
| `url` | Yes (or `file`) | — | Local path / URL |
| `use_ocr` | No | `true` | Enable OCR |
| `use_smolvlm` | No | `false` | Enable SmolVLM |
| `allow_url_network` | No | `false` | Allow outbound HTTP(S) |

**Response**

- Body = full `DocumentResult` JSON
- `200` = not failed (`success` or `partial`)
- `422` = `processing_status == "failed"` (still returns JSON with `error`)
- `400` = missing `file` and `url`
- `413` = file larger than `max_upload_bytes` (default 50 MB)

---

## 4. Output Contract

### Example JSON (abbreviated)

```json
{
  "document_id": "a1b2c3...",
  "filename": "P-102_Maintenance_Notes.txt",
  "file_type": "txt",
  "source": "P-102_Maintenance_Notes.txt",
  "processing_status": "success",
  "metadata": { "page_count": 1, "detected_mime": "text/plain" },
  "pages": [
    {
      "page_number": 1,
      "text": "...",
      "elements": [{ "type": "paragraph", "text": "...", "source": "native" }],
      "tables": [],
      "images": []
    }
  ],
  "full_text": "...main plain text...",
  "markdown": "...main markdown text...",
  "tables": [
    {
      "page_number": 1,
      "headers": ["Date", "Parameter", "Value", "Unit", "Status"],
      "rows": [["2026-03-07", "DE vibration", "5.6", "mm/s", "High"]],
      "source": "native"
    }
  ],
  "processing_metadata": {
    "ocr_used": false,
    "vision_used": false,
    "processing_route": ["file_detection", "native_text", "normalization"],
    "warnings": []
  },
  "error": null
}
```

### Map fields into your RAG stack

| Your step | Take from DocumentResult |
|-----------|--------------------------|
| 1. Chunking | **`markdown`** if non-empty, else **`full_text`**. Optional: chunk each `pages[].text` separately |
| 2. BGE-M3 embed | The chunk strings from step 1 (+ optional table text) |
| 3. Vector DB | Store vectors + metadata: `document_id`, `filename`, `file_type`, `page_number`, `source`, `ocr_used` |
| 4. Structured facts | Keep **`tables[]`** (`headers`, `rows`) for exact values/units |
| 5. RAG answer | Your retrieval + Qwen — **not** this module |

**Main content fields:** `full_text`, `markdown`

---

## 5. Integration Steps

Follow these numbered steps end-to-end.

### Step 1 — Get the module

1. Copy / clone the folder `document_processing` into your monorepo (or keep this path).
2. Working directory for all commands below:

```powershell
cd E:\SIH\PS117\OCR_feature\document_processing
```

### Step 2 — Create virtual environment

```powershell
python --version
# Need Python 3.11+

python -m venv .venv
.\.venv\Scripts\Activate.ps1

# If activation is blocked:
# Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Confirm venv:

```powershell
python -c "import sys; print(sys.executable)"
# Must show: ...\document_processing\.venv\Scripts\python.exe
```

### Step 3 — Install dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Optional SmolVLM (only if you need visual fallback):

```powershell
# Do NOT reinstall torch if CUDA torch already works
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"

# If torch/transformers missing, see requirements.md
pip install "transformers>=4.45.0" "accelerate>=0.30.0"
```

### Step 4 — Verify the module loads

```powershell
python -c "from document_processing import DocumentProcessor, DocumentResult; print('OK')"
```

### Step 5 — Smoke-test one file (CLI)

```powershell
python process_document.py `
  "..\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\09_TXT\P-102_Maintenance_Notes.txt" `
  --output .\out_smoke `
  --verbose
```

**Check:**

1. Terminal shows `status : success`
2. Files exist: `.\out_smoke\output.json`, `.\out_smoke\output.md`
3. JSON contains non-empty `full_text` / `markdown`

### Step 6 — Start the API

```powershell
# venv still activated
uvicorn document_processing.api.app:app --host 127.0.0.1 --port 8000
```

Leave this terminal open. In a browser:

- Swagger UI: http://127.0.0.1:8000/docs  
- Health: http://127.0.0.1:8000/api/documents/health  

Expect health JSON: `{ "status": "ok", "module": "document_processing" }`

### Step 7 — Call the API from your RAG service

**Option 7a — Swagger upload**

1. Open http://127.0.0.1:8000/docs  
2. Open `POST /api/documents/process` → **Try it out**  
3. Choose a file → set `use_ocr=true`, `use_smolvlm=false`  
4. Execute → copy the JSON response  

**Option 7b — PowerShell curl**

```powershell
curl -X POST "http://127.0.0.1:8000/api/documents/process" `
  -F "file=@E:\SIH\PS117\OCR_feature\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\09_TXT\P-102_Maintenance_Notes.txt" `
  -F "use_ocr=true" `
  -F "use_smolvlm=false"
```

**Option 7c — Python client (from your RAG app)**

```python
import httpx

with open(r"E:\path\to\upload.pdf", "rb") as f:
    resp = httpx.post(
        "http://127.0.0.1:8000/api/documents/process",
        files={"file": ("upload.pdf", f, "application/pdf")},
        data={"use_ocr": "true", "use_smolvlm": "false"},
        timeout=300.0,
    )
resp.raise_for_status()
doc = resp.json()  # DocumentResult dict
```

### Step 8 — Parse the response in your RAG code

```python
def handoff_to_rag(doc: dict) -> None:
    # 1) Fail fast
    if doc.get("processing_status") == "failed":
        err = doc.get("error") or {}
        raise RuntimeError(f"{err.get('code')}: {err.get('message')}")

    # 2) Main text for chunking / BGE-M3
    text = (doc.get("markdown") or doc.get("full_text") or "").strip()
    if not text:
        raise RuntimeError("No extractable text for RAG")

    # 3) Optional structured tables
    tables = doc.get("tables") or []

    # 4) Metadata for vector store
    meta = {
        "document_id": doc["document_id"],
        "filename": doc["filename"],
        "file_type": doc["file_type"],
        "page_count": doc.get("metadata", {}).get("page_count"),
        "ocr_used": doc.get("processing_metadata", {}).get("ocr_used"),
    }

    # 5) YOUR pipeline only from here:
    # chunks = your_chunker(text)
    # vectors = bge_m3.encode(chunks)
    # vector_db.upsert(vectors, meta)
    # ... retrieve → LLM answer
```

### Step 9 — Wire into your existing upload flow

1. User uploads file in **your** UI / API.  
2. Your backend either:  
   - saves temp file → `DocumentProcessor().process(path)`, or  
   - forwards multipart to `POST http://127.0.0.1:8000/api/documents/process`.  
3. On success → chunk + BGE-M3 + vector DB.  
4. On failure → return `error.code` / `error.message` to the user.  
5. Never call cloud OCR/LLM for this step.

---

## 6. Execution / Testing

### Quick command cheat-sheet

```powershell
cd E:\SIH\PS117\OCR_feature\document_processing
.\.venv\Scripts\Activate.ps1

# Install (once)
python -m pip install -r requirements.txt

# CLI one file
python process_document.py "..\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\04_Images\P-102_Inspection_Nameplate_and_Readings.png" --output .\out_img

# Start API
uvicorn document_processing.api.app:app --host 127.0.0.1 --port 8000

# Health
curl http://127.0.0.1:8000/api/documents/health

# Full corpus (optional)
python run_corpus_tests.py
```

### How to know it works

| Check | Pass criteria |
|-------|----------------|
| Import | `from document_processing import DocumentProcessor` succeeds |
| CLI | `status : success` + `output.json` has text |
| Health | `"status": "ok"` |
| Process API | JSON with `processing_status` and `full_text`/`markdown` |
| RAG handoff | Your code reads `markdown`/`full_text` and embeds chunks |

---

## 7. Integration Notes

1. OCR is **local/offline** (RapidOCR + ONNX). No cloud AI required.  
2. Do **not** duplicate document processing inside the RAG module.  
3. Preserve page / table / provenance metadata in the vector store when useful.  
4. SmolVLM is optional; primary pipeline works with `use_smolvlm=false`.  
5. URL outbound network is disabled by default (`allow_url_network=false`).  
6. Config is code flags / `ProcessorConfig` — **not** environment variables:  
   `use_ocr`, `use_smolvlm`, `allow_url_network`, `max_upload_bytes`, `smolvlm_model_id`.  
7. First Docling/PDF run can be slow (model load); later runs are faster.  
8. More install detail: `requirements.md`. Architecture overview: `README.md`.

---

## 8. Integration Checklist

- [ ] Python 3.11+ installed  
- [ ] `.venv` created and activated  
- [ ] `pip install -r requirements.txt` completed  
- [ ] `DocumentProcessor` imports successfully  
- [ ] CLI smoke test writes `output.json` / `output.md`  
- [ ] `uvicorn` starts; `/api/documents/health` returns ok  
- [ ] `POST /api/documents/process` accepts a file and returns JSON  
- [ ] `processing_status` checked; failures handled via `error`  
- [ ] `markdown` / `full_text` extracted for chunking  
- [ ] Chunks passed to **BGE-M3**  
- [ ] Vectors + metadata stored in vector DB  
- [ ] RAG retrieval + LLM receive the data correctly  

---

## Module Boundary

```
Document/File
   ↓
My Document Processing + OCR Module
   ↓
Structured Document Output (DocumentResult)
   ↓
Teammate's BGE-M3 Embeddings
   ↓
Vector Database
   ↓
RAG Retrieval
   ↓
LLM Answer
```
