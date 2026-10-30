# Installation Guide — Document Processing Module

This guide installs everything needed for the ApexPetro document-processing
feature into a **local Python virtual environment**.

All processing stays on-premise. No cloud AI APIs are required.

---

## 1. Prerequisites

- Windows 10/11 (this project path is Windows-oriented)
- Python **3.11+** (project was verified with 3.13)
- Optional GPU: NVIDIA GPU + recent CUDA drivers (recommended for SmolVLM)

Check Python:

```powershell
python --version
```

---

## 2. Create / activate the virtual environment

```powershell
cd E:\SIH\PS117\OCR_feature\document_processing

# Create venv (skip if .venv already exists)
python -m venv .venv

# Activate (PowerShell)
.\.venv\Scripts\Activate.ps1

# If activation is blocked once:
# Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Confirm you are inside the venv:

```powershell
python -c "import sys; print(sys.executable)"
# Expect: ...\document_processing\.venv\Scripts\python.exe
```

---

## 3. Install core dependencies (required)

From `document_processing\` with the venv **activated**:

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

This installs:

| Package | Purpose |
|---------|---------|
| `docling` | Digital document layout / PDF structure |
| `rapidocr` | Local OCR |
| `onnxruntime` | OCR inference runtime |
| `pydantic` | `DocumentResult` schema |
| `filetype` | MIME / type detection |
| `pillow` | Image loading |
| `python-docx` / `python-pptx` / `openpyxl` / `pandas` | Native Office + CSV |
| `fastapi` / `uvicorn` / `python-multipart` | API |
| `pytest` / `httpx` | Tests |

### Optional: GPU-accelerated OCR (ONNX)

Default `onnxruntime` uses CPU. For CUDA OCR:

```powershell
pip uninstall -y onnxruntime
pip install onnxruntime-gpu
```

Only do this if your CUDA / cuDNN versions match the [ONNX Runtime CUDA requirements](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html).  
**Core document processing works fine on CPU without this.**

---

## 4. Install SmolVLM (optional visual fallback)

SmolVLM is **optional**. Primary extraction is Docling + RapidOCR.  
Enable SmolVLM only when you want visual fallback for handwriting / drawings / charts / photos.

### 4.1 Important rule

If this venv **already has a working CUDA PyTorch**, do **not** reinstall torch blindly.

Check first:

```powershell
python -c "import torch; print(torch.__version__, 'cuda=', torch.cuda.is_available())"
```

- If that prints a version and `cuda=True` → skip torch install; only ensure `transformers` / `accelerate`.
- If import fails → install torch as below.

### 4.2 Install PyTorch (only if missing)

Pick the wheel that matches your CUDA from https://pytorch.org/get-started/locally/

Example (CUDA 12.x — adjust if needed):

```powershell
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
```

CPU-only fallback (slower; OK for demos):

```powershell
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

### 4.3 Install Hugging Face stack

```powershell
pip install "transformers>=4.45.0" "accelerate>=0.30.0"
```

### 4.4 First-time model download (local cache)

SmolVLM model ID used by the module:

`HuggingFaceTB/SmolVLM-500M-Instruct`

Download / verify once (needs network **only for first download**; afterward runs offline from cache):

```powershell
python -c @"
from transformers import AutoProcessor, AutoModelForImageTextToText
import torch
MODEL = 'HuggingFaceTB/SmolVLM-500M-Instruct'
print('Loading processor...')
p = AutoProcessor.from_pretrained(MODEL)
print('Loading model...')
dtype = torch.float16 if torch.cuda.is_available() else torch.float32
m = AutoModelForImageTextToText.from_pretrained(MODEL, torch_dtype=dtype)
device = 'cuda' if torch.cuda.is_available() else 'cpu'
m = m.to(device)
print('SmolVLM OK on', device)
"@
```

Or use the existing smoke script if present:

```powershell
python .\.venv\test_smolvlm.py
```

### 4.5 Enable SmolVLM at runtime

CLI:

```powershell
python process_document.py ".\path\to\image.png" --use-smolvlm --output .\out
```

API form field:

- `use_smolvlm=true`

If SmolVLM is unavailable, the pipeline still works with OCR/Docling only.

---

## 5. Verify installation

```powershell
cd E:\SIH\PS117\OCR_feature\document_processing
.\.venv\Scripts\Activate.ps1

python -c "from document_processing import DocumentProcessor; print('core OK')"
python process_document.py "tests\fixtures\sample.txt" --output .\out_smoke

# Optional vision check
python -c "import torch; print('cuda', torch.cuda.is_available())"
```

Unit tests (fast):

```powershell
pytest tests -m unit -q
```

Full ApexPetro corpus:

```powershell
python run_corpus_tests.py
```

---

## 6. How to view results (one file at a time)

### Option A — CLI (recommended)

Process **one file**, print a summary in the terminal, and write JSON + Markdown:

```powershell
cd E:\SIH\PS117\OCR_feature\document_processing
.\.venv\Scripts\Activate.ps1

# Example: digital PDF from the corpus
python process_document.py `
  "..\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\01_Digital_PDF\P-102_Operating_and_Inspection_Report.pdf" `
  --output .\out_one `
  --verbose
```

Terminal shows:

- detected type
- processing route
- OCR / VLM used
- page / table / image counts
- status + warnings
- text preview
- paths to output files

Open the written files:

```powershell
notepad .\out_one\output.json
notepad .\out_one\output.md
```

More examples:

```powershell
# PNG OCR
python process_document.py "..\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\04_Images\P-102_Inspection_Nameplate_and_Readings.png" --output .\out_img

# DOCX
python process_document.py "..\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\05_DOCX\P-102_Maintenance_Inspection_Report.docx" --output .\out_docx

# Local URL-test HTML
python process_document.py --url "..\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\16_URL_Test\P-102_Internal_Engineering_Knowledge.html" --output .\out_url

# With SmolVLM fallback
python process_document.py "..\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\12_Handwritten\P-102_Handwritten_Inspection_Note.png" --use-smolvlm --output .\out_hw
```

Useful flags:

| Flag | Meaning |
|------|---------|
| `--output DIR` | Where to write `output.json` / `output.md` |
| `--verbose` / `-v` | Debug logs |
| `--no-ocr` | Disable RapidOCR |
| `--use-smolvlm` | Enable local VLM fallback |
| `--no-json` / `--no-markdown` | Skip writing that format |

### Option B — FastAPI upload (one file via HTTP)

Start the server:

```powershell
cd E:\SIH\PS117\OCR_feature\document_processing
.\.venv\Scripts\Activate.ps1
uvicorn document_processing.api.app:app --host 127.0.0.1 --port 8000
```

Then either:

1. Open Swagger UI: http://127.0.0.1:8000/docs  
   → `POST /api/documents/process` → **Try it out** → upload a file → Execute  
   → JSON result appears in the response body

2. Or use curl:

```powershell
curl -X POST "http://127.0.0.1:8000/api/documents/process" `
  -F "file=@E:\SIH\PS117\OCR_feature\ApexPetro_Test_Corpus\ApexPetro_Test_Corpus\09_TXT\P-102_Maintenance_Notes.txt" `
  -F "use_ocr=true" `
  -F "use_smolvlm=false"
```

### Option C — Corpus batch results already generated

If you previously ran the corpus runners, summaries are here:

- `document_processing\corpus_results_final.json`
- `document_processing\corpus_results_native.json`
- `document_processing\corpus_results_ocr.json`

Those are **status summaries**, not full extracted text. For full text of one file, use **Option A** (`output.json` / `output.md`).

---

## 7. Dependency files in this repo

| File | Role |
|------|------|
| `requirements.txt` | Pip package list (install with `pip install -r`) |
| `requirements.md` | This human install + usage guide |
| `README.md` | Architecture / API / testing overview |

---

## 8. Troubleshooting

| Issue | Fix |
|-------|-----|
| `Activate.ps1` blocked | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Docling first run very slow | Normal — models load once; later runs are faster |
| RapidOCR CUDA warnings | CPU works; install `onnxruntime-gpu` only if CUDA matches |
| SmolVLM OOM on GPU | Use smaller batch / close other GPU apps / run without `--use-smolvlm` |
| Network blocked for HF model | Pre-download on a machine with network, copy HF cache, or skip VLM |

---

## 9. What not to install

Do **not** add cloud OCR/LLM SDKs for this module (no OpenAI / Google Vision / Azure Document Intelligence required).

RAG packages (BGE-M3, vector DB, Qwen serving) belong to the **other team** — not this module.
