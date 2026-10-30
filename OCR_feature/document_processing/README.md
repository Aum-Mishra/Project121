# Document Processing Module

On-premise document intelligence for the **ApexPetro Refining Complex** sovereign AI workbench.

This module converts files and safe URL inputs into a stable **`DocumentResult`** (JSON + Markdown) for the downstream RAG team. **It stops before RAG** — no embeddings, chunking, vector DB, or Qwen answer generation.

## Purpose

- Process digital documents (PDF, DOCX, PPTX, XLSX, CSV, TXT, Markdown, HTML)
- OCR scanned/image content with **RapidOCR + ONNX Runtime**
- Route digital / scanned / mixed PDFs at page level
- Optional local **SmolVLM** fallback for difficult visuals
- Normalize into a Pydantic schema with tables, provenance, and warnings

## Architecture

```
File / URL
    → Input validation & type detection
    → Docling (digital) / OfficeParser (DOCX/PPTX/XLSX/CSV) / RapidOCR (images & scanned pages)
    → Quality assessment
    → Optional local SmolVLM (if enabled and needed)
    → Normalization → DocumentResult JSON + Markdown
    → [RAG boundary — other team]
```

## Supported inputs

| Category | Formats |
|----------|---------|
| Documents | PDF, DOCX, PPTX, XLSX, CSV, TXT, Markdown, HTML |
| Images | PNG (primary); JPG/TIFF/BMP/WEBP also supported |
| Scanned | Scanned PDF, mixed PDF |
| Visual | Handwritten / engineering drawing / chart / photograph PNG |
| URL | Local path, `file://`, optional HTTP(S) (network off by default) |

**XLSX and CSV are never sent through OCR.**

## Stack

- **Docling** — native layout / digital documents
- **RapidOCR + ONNX Runtime** — local OCR
- **python-docx / python-pptx / openpyxl** — native Office & tabular
- **SmolVLM** (optional) — local visual fallback only
- **FastAPI + Pydantic** — API and schema
- **No cloud AI APIs**

## OCR routing

RapidOCR is invoked when:

1. Input is an image, or
2. A PDF page has insufficient native text (scanned / mixed pages)

Digital PDF pages keep native Docling text. Mixed PDFs combine native + OCR per page.

## VLM fallback

SmolVLM is **opt-in** (`--use-smolvlm` / `use_smolvlm=true`).

It runs only when quality heuristics decide OCR/native output is insufficient (empty/short/low-confidence image OCR). If SmolVLM is unavailable, the primary pipeline still works.

## Output schema (`DocumentResult`)

Key fields:

- `document_id`, `filename`, `file_type`, `source`
- `processing_status`: `success` | `partial` | `failed`
- `metadata` (page_count, mime, size, extras)
- `pages[]` → `elements[]` (type, text, bbox, confidence, source)
- `tables[]` (headers, rows, cells, page, provenance)
- `full_text`, `markdown`
- `processing_metadata` (ocr_used, vision_used, route, warnings, elapsed_ms)
- `error` (structured on failure)

Provenance sources: `docling`, `rapidocr`, `smolvlm`, `native`.

## CLI

```powershell
cd E:\SIH\PS117\OCR_feature\document_processing
.\.venv\Scripts\Activate.ps1

python process_document.py "..\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\01_Digital_PDF\P-102_Operating_and_Inspection_Report.pdf"
python process_document.py "..\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\04_Images\P-102_Inspection_Nameplate_and_Readings.png" --output .\out -v
python process_document.py --url "..\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\16_URL_Test\P-102_Internal_Engineering_Knowledge.html"
```

Options: `--output`, `--json` / `--no-json`, `--markdown` / `--no-markdown`, `--verbose`, `--no-ocr`, `--use-smolvlm`, `--allow-url-network`.

## FastAPI

```powershell
uvicorn document_processing.api.app:app --host 127.0.0.1 --port 8000
```

### `POST /api/documents/process`

`multipart/form-data`:

- `file` — upload
- `url` — optional local/HTTP(S) input
- `use_ocr` (default true)
- `use_smolvlm` (default false)
- `allow_url_network` (default false)

### `GET /api/documents/health`

## Testing

```powershell
cd E:\SIH\PS117\OCR_feature\document_processing
.\.venv\Scripts\Activate.ps1

pytest tests -m unit -q
pytest tests -m integration -q
pytest tests/test_apexpetro_corpus.py -q
```

## ApexPetro corpus

Authoritative fixtures live in:

`E:\SIH\PS117\OCR_feature\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\`

Each numbered folder is one input category (01 Digital PDF … 17 Ground Truth).

### Corpus runner

```powershell
cd E:\SIH\PS117\OCR_feature\document_processing
.\.venv\Scripts\Activate.ps1

# All categories (includes OCR — slower)
python run_corpus_tests.py

# Native/digital only (fast)
python run_corpus_tests.py --skip-ocr
```

Ground truth: `17_Ground_Truth/P-102_Ground_Truth.json` (P-102 Feed Transfer Pump facts).

## Security

- No cloud LLM/OCR uploads
- Filename sanitization on API uploads
- Temp files + size limits
- URL network disabled by default; SSRF blocks for private/loopback hosts
- Structured errors without leaking absolute paths to clients when possible

## RAG integration

Downstream teammates should consume:

1. `DocumentResult.model_dump(mode="json")` or `to_rag_payload()`
2. `markdown` / `full_text` for chunking
3. `tables` for structured fields
4. Per-element `source`, `bbox`, `confidence`, page numbers for provenance

Do **not** import Docling/RapidOCR internals in the RAG layer.

## Limitations

- Handwriting / drawings / charts / photos may be incomplete without VLM
- SmolVLM quality depends on local GPU and model availability
- Network URL fetch is intentionally off for sovereign deployments
- Engineering drawing understanding remains shallow

## Future improvements

- Stronger local VLM / handwriting models
- Advanced table reconstruction
- Confidence-based routing policies
- Deeper P&ID / drawing symbol understanding
