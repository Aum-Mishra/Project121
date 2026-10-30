<div align="center">

# KNOVIA AI Workbench

### Sovereign On-Premise Agentic AI Workbench for Confidential Industrial Knowledge Work

An offline-first, provider-agnostic AI workbench that combines agentic chat, retrieval-augmented
generation, engineering analysis, document generation, approval workflows and a sandboxed coding
agent — running either entirely on local open-weight models or against NVIDIA Nemotron in the cloud.

**One codebase. Two deployment modes. No silent provider fallback.**

`APP_MODE=local` → Ollama &nbsp;•&nbsp; `APP_MODE=cloud` → NVIDIA Nemotron via Nebius Token Factory

</div>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick Start — Local Mode](#quick-start--local-mode)
- [Cloud Mode — NVIDIA Nemotron](#cloud-mode--nvidia-nemotron)
- [AI Provider Routing](#ai-provider-routing)
- [Configuration](#configuration)
- [Running the Services](#running-the-services)
- [API Reference](#api-reference)
- [Chat Streaming Contract](#chat-streaming-contract)
- [Coding Agent](#coding-agent)
- [RAG & Dataset](#rag--dataset)
- [Document Generation](#document-generation)
- [Security & Access Control](#security--access-control)
- [Models UI](#models-ui)
- [Verification & Testing](#verification--testing)
- [Troubleshooting](#troubleshooting)
- [Deployment Notes](#deployment-notes)
- [Limitations](#limitations)
- [Disclaimer](#disclaimer)

---

## Overview

KNOVIA AI is an enterprise knowledge-work platform built for confidential industrial operations.
It is demonstrated on a synthetic oil-and-gas company (**ApexPetro Energy / MRPL**) with assets,
SOPs, inspection records, maintenance history, HSE documents, HR data and vendor information.

The application lets a user ask a question such as:

> *"Compare the operating pressure and vibration of pump P-102 between 2024 and 2026, explain the
> change using the inspection data, and generate a management summary deck."*

and then:

1. Classifies intent and complexity,
2. Builds a visible execution plan,
3. Retrieves grounded evidence from the local document corpus,
4. Runs deterministic calculations and analysis,
5. Synthesizes a cited answer with the active LLM,
6. Generates charts and downloadable documents (DOCX / XLSX / PPTX / PDF / CSV),
7. Raises approvals when an anomaly or risky action is detected,
8. Optionally hands a coding request to the isolated Coding Agent, which writes and runs code in a
   sandbox and returns a downloadable project ZIP.

Every AI response reports **which provider and model actually served it**.

---

## Key Features

| Area | Capabilities |
| --- | --- |
| **Agentic Chat** | Streaming SSE pipeline with intent detection, plan cards, step-by-step execution, sourced answers, follow-ups and conversation history |
| **Hybrid RAG** | Qdrant vector search + deterministic lexical fallback, role-filtered retrieval, asset/entity detection, per-year and history-aware boosts |
| **Engineering Analysis** | Trend detection, baseline deltas, percentage change, limit checks, anomaly detection, charts, calculation envelopes |
| **Document Generation** | DOCX, XLSX, PPTX, PDF, CSV, Markdown, JSON and TXT from structured LLM output plus deterministic rendering |
| **Approvals Workflow** | Pending/approved/rejected approvals, chat-context auto-approval for sandboxed coding, audit-friendly records |
| **Projects & Artifacts** | Projects, project chats, generated artifacts, previews, downloads and persisted chat bindings |
| **Coding Agent** | Isolated FastAPI service that plans, writes, edits, runs and tests code in a confined workspace; ZIP download; per-command approvals; AI auto-fix |
| **Dual Deployment** | Fully local via Ollama, or cloud via Nebius Token Factory (OpenAI-compatible) serving NVIDIA Nemotron |
| **Provider Transparency** | `provider`, `provider_label`, `model` and `mode` included in every result; live `/api/ai/status` and `/api/ai/selftest` |
| **RBAC Personas** | Admin, Engineer and HR role scopes enforced on routes/pages and document retrieval |
| **Offline-First** | No external calls in local mode; credentials never leave the backend |
| **OpenAI-Compatible API** | `/v1/chat/completions` for external clients, routed through the same provider layer |

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser — React 19 + TypeScript + Vite + Tailwind CSS v4                    │
│  Dashboard · Workbench · Projects · Artifacts · Approvals · Models · Coding  │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │  /api  (Vite proxy in dev, same origin in prod)
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  FastAPI Workbench API  :8000                                                │
│                                                                              │
│  /api/chat (SSE) ──► chat_pipeline                                           │
│      ├── query_intelligence   intent · complexity · entities · scope gate    │
│      ├── vector_store         Qdrant semantic search · lexical fallback      │
│      ├── analysis             trends · deltas · limits · charts              │
│      ├── document_engine      document type · formats · task planning        │
│      ├── docgen               DOCX / XLSX / PPTX / PDF renderers             │
│      ├── approvals            anomaly + risky-action approval records        │
│      └── coding_gateway ──────HTTP──► Coding Agent :8002                     │
│                                                                              │
│  SQLite: projects · artifacts · approvals · employees · assets · inspections │
│  Qdrant: embedded local vector DB under backend/storage/qdrant               │
│  Static: serves the built frontend from dist/                                │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
                ┌───────────────┴────────────────┐
                ▼                                ▼
┌──────────────────────────────┐   ┌───────────────────────────────────────────┐
│  AI Provider Router          │   │  Coding Agent  :8002 (separate process)   │
│  backend/ai_provider.py      │   │  coding_agent/backend/app/llm_provider.py │
│                              │   │                                           │
│  local  → Ollama :11434      │   │  supervisor · workspace · sandbox         │
│  cloud  → Nebius Token       │   │  permission buckets · test runner         │
│           Factory (Nemotron) │   │  file tree · diff · ZIP · AI fix          │
└──────────────────────────────┘   └───────────────────────────────────────────┘
```

Both services resolve the **same `APP_MODE`** independently. The workbench passes the mode and all
provider credentials to the Coding Agent when it spawns it, and restarts a stale Coding Agent if it
detects a mode mismatch.

---

## Tech Stack

### Frontend

| Technology | Version / Role |
| --- | --- |
| React | 19 |
| TypeScript | 5.7 |
| Vite | 8 (dev server, build, proxy) |
| Tailwind CSS | v4 via `@tailwindcss/vite` |
| lucide-react | Icon system |
| PrismJS + react-simple-code-editor | Code display/editing |
| oxfmt | Formatting |

### Backend

| Technology | Version / Role |
| --- | --- |
| Python | 3.11+ (tested on 3.12) |
| FastAPI + Uvicorn | HTTP API, SSE streaming |
| SQLAlchemy + SQLite | Projects, artifacts, approvals, chat history |
| Qdrant (`qdrant-client`) | Local embedded vector store |
| requests / httpx | Ollama + Nebius + Coding Agent calls |
| pandas / matplotlib | Tabular analysis and chart rendering |
| python-docx / python-pptx / openpyxl | Office document generation |
| python-multipart | File uploads |

### AI

| Mode | Provider | Models |
| --- | --- | --- |
| `local` | Ollama | `qwen2.5:3b` (router), `qwen2.5:7b` (reasoning), `qwen2.5-coder:7b` (coding), `bge-m3` (embeddings) |
| `cloud` | Nebius Token Factory (OpenAI-compatible) | `nvidia/nemotron-3-super-120b-a12b` (configurable for router/coder) |

### Coding Agent

FastAPI service with its own SQLite database, workspace manager, command sandbox, permission
system, test runner and provider router. Optional OpenHands engine for diagnostics (disabled in
cloud mode because it is hard-wired to a local Ollama provider).

---

## Repository Layout

```text
Project121/
├── README.md                          ← this file
├── requirements.txt                   ← legacy/root Python dependencies
│
├── Sovereign-ai-main/                 ★ main application
│   ├── src/                           React UI (pages, components, data, services)
│   ├── backend/                       FastAPI workbench backend
│   │   ├── main.py                    API, static serving, SSE endpoint
│   │   ├── ai_provider.py             centralized local/cloud provider router
│   │   ├── chat_pipeline.py           agentic chat + retrieval + synthesis
│   │   ├── query_intelligence.py      intent, complexity, entities, scope
│   │   ├── vector_store.py            Qdrant + lexical retrieval
│   │   ├── auto_ingest.py             dataset ingestion/chunking
│   │   ├── docgen.py                  DOCX/XLSX/PPTX/PDF renderers
│   │   ├── document_engine.py         document planning and validation
│   │   ├── analysis.py                engineering analysis/calculations
│   │   ├── coding_gateway.py          lifecycle + proxy for Coding Agent
│   │   └── coding_engine.py           in-process coding fallback
│   ├── MRPL_Dataset_v3/               dataset shipped with the app (auto-ingest)
│   ├── docs/DEPLOYMENT_MODES.md       detailed local/cloud operations guide
│   ├── .env.example                   environment template
│   ├── package.json                   frontend dependencies/scripts
│   └── vite.config.ts                 Vite + proxy configuration
│
├── coding_agent/                      ★ isolated Coding Agent service
│   ├── backend/app/
│   │   ├── main.py                    REST/SSE routes
│   │   ├── supervisor.py              task workflow + repairs + tests
│   │   ├── engine.py                  deterministic code-generation engine
│   │   ├── llm_provider.py            local/cloud provider router
│   │   ├── sandbox.py                 confined command execution
│   │   ├── security.py                path validation + command policy
│   │   ├── permission.py              approval buckets
│   │   ├── workspace.py               project directory management
│   │   └── runner.py                  project run/log/input/stop
│   ├── backend/.env.example
│   └── tests/                         unit + integration tests
│
├── ApexPetro_Sovereign_Dataset_v3/    full synthetic industrial dataset
├── docs/                              architecture and implementation notes
├── backend/                           legacy backend; its `ai/` venv is used by the Coding Agent
├── Replicate Existing Design/         early UI prototype
├── Sovereign-ai-mvp/                  earlier MVP
├── 121/, 121-1/                       experiments
├── anomaly_inspection_feature/        anomaly-inspection prototype
├── OCR_feature/                       OCR prototype
├── sovereign_workbench_enhancement1/  UI enhancement prototype
└── Sovereign_AI_Workbench_Diverse_UI_Seed_Pack/
```

> The main product is **`Sovereign-ai-main/` + `coding_agent/`**. Everything else is supporting
> data, documentation, or an earlier prototype kept for reference.

---

## Prerequisites

| Requirement | Notes |
| --- | --- |
| **Python 3.11+** | 3.12 recommended |
| **Node.js 20+** | 22 recommended |
| **Ollama** | Required for local mode; must be running on `:11434` |
| **NVIDIA GPU** | Recommended for local models; CPU works but is slower |
| **NVIDIA Nemotron access** | Required only for cloud mode (API key from Nebius Token Factory) |
| **Git** | For cloning/updating |

Optional:

- A Qdrant server (`:6333`) if you prefer server mode over the embedded local store.
- OpenHands SDK in the Coding Agent interpreter for the experimental engine/probe.

---

## Quick Start — Local Mode

### 1. Clone the repository

```bash
git clone https://github.com/Aum-Mishra/Project121.git
cd Project121
```

### 2. Create the main backend environment

```bash
cd Sovereign-ai-main
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### 3. Install the frontend dependencies

```bash
npm install
```

### 4. Pull the local models

```bash
ollama pull qwen2.5:3b
ollama pull qwen2.5:7b
ollama pull qwen2.5-coder:7b
ollama pull bge-m3
```

> If `bge-m3` is not installed, the app still works: startup ingest is skipped and retrieval
> automatically falls back to deterministic lexical search.

### 5. Configure the environment

```bash
cp .env.example .env
```

The defaults are ready for local mode:

```dotenv
APP_MODE=local
LOCAL_API_BASE=http://localhost:11434
LOCAL_ROUTER_MODEL=qwen2.5:3b
LOCAL_REASONING_MODEL=qwen2.5:7b
LOCAL_CODER_MODEL=qwen2.5-coder:7b
LOCAL_EMBEDDING_MODEL=bge-m3:latest
```

> `.env` is git-ignored. Never commit real credentials.

### 6. Create the Coding Agent interpreter

The workbench launches the Coding Agent with the interpreter at `backend/ai/bin/python`
(configurable via `CODING_AGENT_PYTHON`). From the repository root:

```bash
python3 -m venv backend/ai
backend/ai/bin/pip install -r coding_agent/backend/requirements.txt
```

Optional OpenHands engine (only needed for the diagnostics probe / experimental engine):

```bash
# Install the OpenHands SDK into the same interpreter following its documentation.
# The default deterministic engine works without it.
```

### 7. Start the services

Use three terminals from the repository root.

**Terminal 1 — Workbench API**

```bash
cd Sovereign-ai-main
source venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

**Terminal 2 — Coding Agent** (optional but required for coding tasks)

```bash
cd coding_agent/backend
../../backend/ai/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8002
```

or simply:

```bash
cd coding_agent/backend
./run.sh
```

**Terminal 3 — Frontend dev server**

```bash
cd Sovereign-ai-main
npm run dev
```

Open **http://localhost:5173** (override with `PORT` if needed). Vite proxies `/api` to
`http://127.0.0.1:8000`.

### 8. Build/serve the frontend from the backend (optional)

```bash
cd Sovereign-ai-main
npm run build
```

The backend serves `dist/` automatically, so **http://localhost:8000** also works without Vite.

---

## Cloud Mode — NVIDIA Nemotron

Cloud mode routes **every** AI call to Nebius Token Factory. It never falls back to Ollama or any
local model. If the provider is unavailable, the request fails with a clear error (`503` on the
OpenAI-compatible endpoint).

### 1. Get a Nebius Token Factory API key

Create a key in the Nebius Token Factory console. Keep it **server-side only**.

### 2. Configure `Sovereign-ai-main/.env`

```dotenv
APP_MODE=cloud

NEBIUS_API_KEY=your-key-here
NEBIUS_BASE_URL=https://api.tokenfactory.us-central1.nebius.com/v1
NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b
NEBIUS_ROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b
NEBIUS_CODER_MODEL=nvidia/nemotron-3-super-120b-a12b

# Optional: enable remote embeddings with a Nebius embedding model id
# NEBIUS_EMBEDDING_MODEL=<embedding-model-id>
# CLOUD_AUTO_INGEST=1

NEBIUS_TIMEOUT=600
```

`NEBIUS_ENDPOINT` is accepted as an alias for `NEBIUS_BASE_URL`.

### 3. Restart both services

The Coding Agent inherits the mode and credentials from the workbench. If it is already running in
the other mode, the workbench detects the mismatch and restarts it automatically. A manual restart
is still the simplest path:

```bash
# stop old processes, then repeat the start commands from the local-mode section
```

### 4. Verify

```bash
curl http://127.0.0.1:8000/api/ai/status
curl -X POST http://127.0.0.1:8000/api/ai/selftest
curl http://127.0.0.1:8002/api/ai/status
```

`selftest` must return:

```json
{
  "ok": true,
  "provider": "nebius",
  "provider_label": "Nebius Token Factory (NVIDIA Nemotron)",
  "model": "nvidia/nemotron-3-super-120b-a12b"
}
```

### Cloud retrieval behaviour

- **No `NEBIUS_EMBEDDING_MODEL`** → deterministic lexical retrieval. No local embeddings are used.
- **`NEBIUS_EMBEDDING_MODEL` set, `CLOUD_AUTO_INGEST=0`** → embeddings available, but the corpus is
  not re-indexed automatically (avoids a slow, billable startup).
- **`NEBIUS_EMBEDDING_MODEL` + `CLOUD_AUTO_INGEST=1`** → opt-in remote vector indexing.
- Cloud vectors live in a **separate collection** (`<collection>_cloud`), so switching modes never
  wipes the local index.

### Switching back to local

Set `APP_MODE=local`, restore the local model variables, and restart both services. The local
Qdrant collection and its embeddings are untouched.

---

## AI Provider Routing

Routing is centralized in two small modules:

| Service | Router |
| --- | --- |
| Workbench (chat, RAG, agents, documents, coding gateway) | `Sovereign-ai-main/backend/ai_provider.py` |
| Coding Agent | `coding_agent/backend/app/llm_provider.py` |

Rules:

1. `APP_MODE` is the single source of truth (`LLM_MODE` is a backward-compatible alias).
2. `local` → only Ollama. `cloud` → only Nebius. There is **no cross-provider fallback**.
3. Ollama-style model IDs (`qwen2.5:7b`) are ignored in cloud mode; cloud IDs (`nvidia/...`) are
   ignored in local mode.
4. Failures raise `ProviderUnavailable` and are surfaced to the caller. Retrieval degrades to
   lexical search rather than silently switching models.
5. `backend/gateway.py` is kept as a thin compatibility facade for older imports.
6. The Coding Agent's OpenHands engine is disabled in cloud mode because it is hard-wired to
   litellm's Ollama provider.

---

## Configuration

### `Sovereign-ai-main/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_MODE` | `local` | `local` (Ollama) or `cloud` (Nebius) |
| `LLM_MODE` | — | Backward-compatible alias; `APP_MODE` wins |
| `LOCAL_API_BASE` | `http://localhost:11434` | Ollama base URL |
| `LOCAL_ROUTER_MODEL` | `qwen2.5:3b` | Classification/routing model |
| `LOCAL_REASONING_MODEL` | `qwen2.5:7b` | Chat/reasoning model |
| `LOCAL_CODER_MODEL` | `qwen2.5-coder:7b` | Coding model |
| `LOCAL_EMBEDDING_MODEL` | `bge-m3:latest` | Embedding model |
| `NEBIUS_API_KEY` | — | Cloud API key (server-side only) |
| `NEBIUS_BASE_URL` / `NEBIUS_ENDPOINT` | `https://api.tokenfactory.us-central1.nebius.com/v1` | OpenAI-compatible base URL |
| `NEBIUS_MODEL` | `nvidia/nemotron-3-super-120b-a12b` | Cloud reasoning model |
| `NEBIUS_ROUTER_MODEL` | `NEBIUS_MODEL` | Cloud routing model |
| `NEBIUS_CODER_MODEL` | `NEBIUS_MODEL` | Cloud coding model |
| `NEBIUS_EMBEDDING_MODEL` | empty | Optional cloud embedding model |
| `CLOUD_AUTO_INGEST` | `0` | `1` enables remote vector indexing |
| `NEBIUS_TIMEOUT` | `600` | Cloud request timeout (seconds) |
| `DATABASE_URL` | `sqlite:///./knovia.db` | Workbench database |
| `VECTOR_DB_PATH` | `./backend/storage/qdrant` | Embedded Qdrant path |
| `VECTOR_DB_URL` | `http://localhost:6333` | Optional Qdrant server URL |
| `VECTOR_COLLECTION` | `mrpl_knowledge` | Base collection name |
| `DOCUMENT_STORAGE_PATH` | `./backend/storage/documents` | Stored documents |
| `ARTIFACT_STORAGE_PATH` | `./backend/storage/artifacts` | Generated artifacts |
| `CODING_AGENT_URL` | `http://127.0.0.1:8002` | Coding Agent service URL |
| `CODING_AGENT_PYTHON` | `../backend/ai/bin/python` | Interpreter used to spawn it |
| `CA_CHAT_AUTO_APPROVE` | `1` | Auto-approve chat-originated sandbox permissions |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — | Legacy settings, not used by the active router |

### `coding_agent/backend/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_MODE` | `local` | Must match the workbench |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local model server |
| `CODING_MODEL` | `qwen2.5-coder:7b` | Local coding model |
| `NEBIUS_API_KEY` | — | Cloud key |
| `NEBIUS_BASE_URL` | Nebius default | Cloud endpoint |
| `NEBIUS_MODEL` / `NEBIUS_CODER_MODEL` | Nemotron default | Cloud models |
| `NEBIUS_TIMEOUT_S` | `600` | Cloud timeout |
| `SANDBOX_TIMEOUT_S` | `120` | Per-command sandbox timeout |
| `MAX_COMMAND_TIMEOUT_S` | `300` | Hard command cap |
| `ALLOW_NETWORK` | `false` | Network access inside the sandbox |
| `MAX_REPAIR_ATTEMPTS` | `3` | Auto-repair attempts |
| `OPENHANDS_ENABLED` | `true` | Experimental engine/probe |
| `OPENHANDS_TIMEOUT_S` | `240` | OpenHands timeout |
| `DATABASE_URL` | empty → `coding_agent/data/runtime/coding_agent.db` | Coding DB |
| `CODING_ROOT` | empty → `coding_agent/data/coding` | Workspace root |

---

## Running the Services

| Service | Port | Command |
| --- | --- | --- |
| Workbench API + static UI | `8000` | `cd Sovereign-ai-main && ./venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000` |
| Workbench API (dev reload) | `8000` | `cd Sovereign-ai-main && ./venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload` |
| Coding Agent | `8002` | `cd coding_agent/backend && ../../backend/ai/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8002` |
| Frontend dev (Vite) | `5173` | `cd Sovereign-ai-main && npm run dev` |
| Ollama | `11434` | `ollama serve` |
| Qdrant server (optional) | `6333` | `docker run -p 6333:6333 qdrant/qdrant` |

**Startup diagnostics** printed by the workbench include deployment mode, provider, and the models
used for routing, reasoning, coding and embeddings, plus the Qdrant collection and point count.

---

## API Reference

### Workbench (`:8000`)

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/system/health` | Lightweight health + active provider |
| `GET` | `/api/ai/status` | Mode, provider, models, embedding availability |
| `POST` | `/api/ai/selftest` | Real one-token inference call through the active provider |
| `POST` | `/api/chat` | Agentic chat (SSE stream) |
| `POST` | `/api/upload` | Upload documents for ingestion |
| `POST` | `/api/generate/docx` | Generate a DOCX |
| `POST` | `/api/generate/xlsx` | Generate an XLSX |
| `POST` | `/api/generate/pptx` | Generate a PPTX |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions |
| `POST` | `/api/ingest_local` | Re-index the dataset (ADMIN) |
| `POST` | `/api/documents/generate` | Template-based document generation |
| `GET` | `/api/artifacts` | List generated artifacts |
| `GET` | `/api/artifacts/{id}` | Artifact metadata |
| `GET` | `/api/artifacts/{id}/download` | Download artifact |
| `GET` | `/api/artifacts/{id}/preview` | Preview artifact |
| `GET` | `/api/approvals` | List approvals |
| `POST` | `/api/approvals` | Create approval |
| `POST` | `/api/approvals/{id}/approve` | Approve |
| `POST` | `/api/approvals/{id}/reject` | Reject |
| `GET` | `/api/projects` | List projects |
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/projects/{id}` | Project detail |
| `PATCH` | `/api/projects/{id}` | Update project |
| `GET/POST` | `/api/projects/{id}/chats` | List/create project chats |
| `GET` | `/api/knowledge/stats` | Collection statistics |
| `POST` | `/api/knowledge/search` | Direct hybrid knowledge search |
| `GET` | `/api/coding/{path}` | Proxy to the Coding Agent |
| `GET` | `/` | Serves the built frontend (`dist/`) |

### Coding Agent (`:8002`)

| Group | Endpoints |
| --- | --- |
| Diagnostics | `GET /api/health`, `GET /api/ai/status`, `GET /api/models` |
| Workspaces | `GET/POST /api/workspaces`, `POST /api/workspaces/inspect`, `GET /api/folders/browse` |
| Sessions | `POST/GET /api/sessions`, `GET/DELETE /api/sessions/{id}`, `POST /api/sessions/{id}/messages`, `POST /api/sessions/{id}/rename` |
| Tasks | `POST /api/tasks/generate`, `/api/tasks/new-project`, `/api/tasks/existing-project`, `GET /api/tasks`, `GET /api/tasks/{id}` |
| Events & approvals | `GET /api/tasks/{id}/events` (SSE), `POST /api/tasks/{id}/approve`, `/approve-all`, `/cancel` |
| Files | `GET /api/tasks/{id}/files`, `/file`, `/tree`, `/diff`, `/tests`, `/download`; `PUT /api/tasks/{id}/file` |
| Execution | `GET /api/tasks/{id}/executions`, `POST /api/tasks/{id}/run`, `GET /api/tasks/{id}/run/status`, `GET /api/tasks/{id}/run/{run_id}/logs`, `POST /api/tasks/{id}/run/{run_id}/input`, `POST /api/tasks/{id}/run/{run_id}/stop` |
| Repair | `POST /api/tasks/{id}/ai-fix` |
| Diagnostics probe | `POST /api/engine/openhands/probe` |

---

## Chat Streaming Contract

`POST /api/chat` returns `text/event-stream`:

```text
data: {"type":"status","message":"⟳ Processing your query..."}

data: {"type":"plan","data":{"intent":"...","complexity":"...","steps":[...]}}

data: {"type":"step_start","step_index":0}
data: {"type":"status","message":"✓ Retrieving evidence..."}
data: {"type":"step_complete","step_index":0}

data: {"type":"coding_redirect","coding":{...}}   # when the request is a coding task

data: {"type":"result", ...}
```

The final `result` event includes:

```json
{
  "type": "result",
  "provider": "nebius",
  "provider_label": "Nebius Token Factory (NVIDIA Nemotron)",
  "model": "nvidia/nemotron-3-super-120b-a12b",
  "mode": "cloud",
  "answer": "...",
  "sources": [],
  "findings": [],
  "charts": [],
  "files": [],
  "steps": [],
  "plan": {},
  "intent": "engineering_inquiry",
  "complexity": "MEDIUM",
  "analysis": {},
  "approval": {},
  "artifact": {},
  "created_docs": [],
  "coding": null
}
```

The UI renders the plan card, step timeline, citations, charts, generated documents and provider
label from this stream.

---

## Coding Agent

The Coding Agent is a **separate FastAPI service** with its own database and workspace root. The
workbench only talks to it over HTTP, which keeps code execution isolated from the chat process.

### Workflows

1. **Generated code** — produce a complete snippet/project from a natural-language request.
2. **New project** — scaffold a runnable project in a new workspace.
3. **Existing project** — inspect, edit and extend an authorized folder.
4. **Run & test** — execute the detected test/build command, stream logs, accept stdin, stop runs.
5. **AI fix** — attempt automatic repairs when tests fail.
6. **Download** — export the workspace as a ZIP.

### Safety model

- Writes are confined to the task's authorized workspace root (symlink-aware validation).
- Commands are classified into permission buckets. Risky buckets (network, installs, privilege
  escalation, paths outside the root) require explicit approval.
- The sandbox runs with a hard timeout, a capped environment and **no network by default**
  (`ALLOW_NETWORK=false`).
- Every task, permission decision, execution, file change and test result is persisted in SQLite.
- In cloud mode the OpenHands engine refuses to start, so no local model can be reached.

---

## RAG & Dataset

### Corpus

- `Sovereign-ai-main/MRPL_Dataset_v3/` — dataset used by the app's auto-ingest (default
  `DATASET_DIR_NAME=MRPL_Dataset_v3`).
- `ApexPetro_Sovereign_Dataset_v3/` — the full synthetic company package, including
  `company.json`, master specs, assets, SOPs, manuals, inspection and maintenance history, HSE,
  HR, vendors, projects and metadata.

The corpus is chunked into overlapping windows and embedded into Qdrant. On a full ingest the app
reports the number of files, folders, chunks and embedded points at startup.

### Retrieval pipeline

1. Entity extraction (asset tags such as `P-102`, `CDU-4`).
2. Vector search (when embeddings are available).
3. Lexical search fallback (always available).
4. Role filtering (`ADMIN` / `ENGINEER` / `HR`).
5. History, per-year and limit boosts based on the question.
6. Evidence assembly and grounded synthesis.

### Collections

| Mode | Collection |
| --- | --- |
| `local` | `mrpl_knowledge_local` |
| `cloud` | `mrpl_knowledge_cloud` |

The remote/cloud collection is intentionally separate so mode switching cannot wipe the local
index.

### Ingestion

- Automatic at startup when embeddings are available.
- Manual: `POST /api/ingest_local?force=true` (ADMIN).
- Cloud remote ingest is opt-in via `CLOUD_AUTO_INGEST=1`.

---

## Document Generation

Documents are generated from structured LLM output and rendered deterministically.

**Formats:** `docx`, `xlsx`, `pptx`, `pdf`, `csv`, `md`, `json`, `txt`

**Templates include:** approval note, technical review, inspection report, risk assessment,
management summary, engineering/equipment/maintenance/incident/investigation/audit/compliance/
safety reports, SOP procedure, operational/reliability/analysis/comparison/review reports,
meeting record, project report, data analytics, evidence report, knowledge reference and action
memo.

Generated files are stored under `backend/storage/artifacts/` (git-ignored) and exposed through
the artifacts API with download and preview endpoints.

---

## Security & Access Control

- **Personas / roles:** `ADMIN`, `ENGINEER`, `HR` (sent to the API via `X-User-Role`).
- **Page-level RBAC:** the frontend hides/disables pages the role cannot access.
- **Data-level scoping:** HR content is restricted to HR/Admin; engineering content to
  Engineer/Admin; Admin sees everything.
- **Classification levels:** PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED (dataset metadata).
- **Secrets:** provider keys live only in backend `.env` files; the browser never receives them.
- **Coding sandbox:** path confinement, command buckets, approvals, timeouts, network off by
  default.
- **Cloud isolation:** `APP_MODE=cloud` never calls Ollama and never falls back to a local model.
- **Audit-friendly persistence:** approvals, artifacts, coding tasks, executions and file changes
  are recorded in SQLite.

> The role header is a demo-friendly mechanism, not full authentication. Add real auth
> (OIDC/JWT/session) before production deployment.

---

## Models UI

The **Models** page reads `GET /api/ai/status`:

- **Local mode** — lists the configured Ollama models.
- **Cloud mode** — shows **only the NVIDIA Nemotron model** and a Nebius banner.
- The Workbench result card shows the actual `provider_label` and `model` returned by the backend.

---

## Verification & Testing

### Provider checks

```bash
curl http://127.0.0.1:8000/api/ai/status
curl -X POST http://127.0.0.1:8000/api/ai/selftest
curl http://127.0.0.1:8000/api/system/health
curl http://127.0.0.1:8002/api/ai/status
```

### Chat smoke test

```bash
curl -N -X POST http://127.0.0.1:8000/api/chat \
  -H 'Content-Type: application/json' \
  -H 'X-User-Role: ENGINEER' \
  -d '{"query":"What is the current operating pressure of pump P-102?","role":"ENGINEER"}'
```

### OpenAI-compatible endpoint

```bash
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"nvidia/nemotron-3-super-120b-a12b","messages":[{"role":"user","content":"hello"}]}'
```

### Coding Agent tests

```bash
cd coding_agent
../backend/ai/bin/python -m pytest tests/ -q   # requires pytest in that interpreter
```

### End-to-end prompt suite

See `Sovereign-ai-main/TEST_PROMPTS.md` for the full set of chat, analysis, document and coding
scenarios with expected results.

---

## Troubleshooting

| Symptom | Cause / Fix |
| --- | --- |
| `Ollama model ... 404 Not Found` | Local model not pulled. Run `ollama pull <model>`. |
| `Embeddings unavailable`, ingest skipped | Embedding model missing. Pull `bge-m3` or set `NEBIUS_EMBEDDING_MODEL` in cloud mode. |
| `ProviderUnavailable` / HTTP 503 | Active provider unreachable: check Ollama, key, base URL and timeout. |
| Cloud mode still lists local models | Stale frontend cache or Coding Agent in the wrong mode. Restart both services and hard-refresh. |
| Coding Agent unavailable (`503`) | Start `:8002` or verify `CODING_AGENT_PYTHON` points to a valid interpreter. |
| Qdrant `AlreadyLocked` | Only one process may open the embedded store. Stop the other backend. |
| Port already in use | Change `--port` (backend/coding) or `PORT` (Vite). |
| Coding tasks produce no code | Check `/tmp`/service logs; ensure the coding model is installed (local) or the cloud key is valid. |
| `git push` rejected for large files | Archives/runtime data are git-ignored. Do not force-add `*.zip`, venvs or storage. |
| Frontend shows old bundle after rebuild | Rebuild with `npm run build`; the backend serves `dist/` with `Cache-Control: no-store`. |

---

## Deployment Notes

- **Single-host:** run both FastAPI services and serve the built frontend from `:8000`.
- **Reverse proxy:** put Nginx/Caddy in front of `:8000`; keep `:8002` private.
- **Database:** SQLite is used for local/demo deployments. Switch `DATABASE_URL` to PostgreSQL for
  multi-user production and adjust SQLAlchemy drivers.
- **Qdrant:** embedded mode is single-process. Use a Qdrant server (`VECTOR_DB_URL`) for multiple
  backend replicas.
- **CORS:** the default configuration allows `*` for development. Restrict `allow_origins` in
  production.
- **Static frontend hosting:** `vercel.json` contains an SPA rewrite for hosting the built frontend
  separately, but the API must be deployed and proxied independently.
- **Secrets:** keep `.env` files out of git; inject them via your platform's secret manager.

---

## Limitations

- The dataset and company (**ApexPetro Energy / MRPL**) are **synthetic**.
- The role header is not authentication; add a real identity provider for production.
- Local inference speed depends heavily on GPU/VRAM. Complex queries can take 60–90 seconds on
  consumer hardware.
- Cloud mode without `NEBIUS_EMBEDDING_MODEL` uses lexical retrieval rather than embeddings.
- The OpenHands engine is optional/experimental and disabled in cloud mode.
- The repository also contains earlier prototypes and experiments; only `Sovereign-ai-main/` and
  `coding_agent/` are the active product.

---

## Disclaimer

All company names, asset tags, documents, measurements, incidents, employees and records in this
repository are **fictional** and exist solely to demonstrate the platform. Do not use this
software or its synthetic content for real industrial, HSE, engineering, financial, legal or
regulatory decisions.

---

<div align="center">

**KNOVIA AI Workbench** — built for confidential, sovereign industrial intelligence.

`APP_MODE=local` · `APP_MODE=cloud` · no silent fallback

</div>
