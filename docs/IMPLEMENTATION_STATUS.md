# Sovereign AI Workbench — Implementation Status

> Live ledger. Updated after each phase. Honest labels only:
> `IMPLEMENTED` / `PARTIALLY IMPLEMENTED` / `NOT IMPLEMENTED` / `KNOWN LIMITATION`.

## Phase Map

| Phase | Area | Status |
|---|---|---|
| 0 | Repository audit | IMPLEMENTED |
| 1 | Backend foundation + DB | PARTIALLY IMPLEMENTED |
| 2 | Ollama model registry + capability routing | PARTIALLY IMPLEMENTED |
| 3 | File storage + document ingestion + classification | PARTIALLY IMPLEMENTED |
| 4 | OCR + multimodal extraction | PARTIALLY IMPLEMENTED |
| 5 | BGE-M3 + Qdrant RAG (hybrid) | IMPLEMENTED |
| 6 | Chat persistence + chat API | IMPLEMENTED |
| 7 | Fast path greetings/general queries | IMPLEMENTED (deterministic + LLM greeting fast path) |
| 8 | Agent router + planner + tools | PARTIALLY IMPLEMENTED |
| 9 | Data analysis + chart schema | PARTIALLY IMPLEMENTED (backend IMPLEMENTED, chart not persisted) |
| 10 | Coding agent + sandbox | IMPLEMENTED (coding_agent tool + /code/run + working UI) |
| 11 | Document generation + versioning | IMPLEMENTED (docx/xlsx/pptx/pdf via planner tool; versioning deferred to ph.13) |
| 12 | Approvals + lifecycle | IMPLEMENTED (chat-created approvals, auth, audit, working UI) |
| 13 | Artifacts + versions + download | IMPLEMENTED |
| 14 | Projects + tasks | PARTIALLY IMPLEMENTED |
| 15 | Frontend API integration (services/mock replacement) | IMPLEMENTED (Profile/ProjectDetail/DocumentViewer real API data; GPU claims corrected) |
| 16 | Security / offline verification | IMPLEMENTED (runnable `verify_offline.py`; honest egress result) |
| 17 | Full E2E + docs | IMPLEMENTED (78 tests pass; full E2E verified) |
| 18 | All-format exports + artifact versioning + chat file upload | IMPLEMENTED |

## Detailed Item Status

### Critical / High-priority items
- [x] Frontend `api.ts` attaches `Authorization: Bearer <token>` to every request
- [x] `POST /api/documents/upload` uses real pipeline (chunk/embed/index) without error
- [x] `POST /api/chat` non-streaming returns structured result
- [x] Orchestrator emits `tool_started`/`tool_completed` events; run_completed carries `documents_accessed` + `analysis`
- [x] Structured response envelope: `findings, metrics, charts, tables, recommendations`
- [x] Data-analysis module (`app/services/analysis_service.py` + `analyze_data` tool, local LLM + live DB facts)
- [x] Chart data schema → frontend renders charts (`components/AnalysisView.tsx`, dependency-free SVG)
- [x] Document generation wired to chat "create" intent: planner routes to `generate_document` tool, fills template sections from RAG evidence (local LLM + deterministic fallback), renders DOCX/XLSX/PPTX/PDF, persists Artifact row + file, streams `artifact_created` + `run_completed.artifacts`, downloadable via `/api/artifacts/{id}/download`, shown in chat as a generated-documents card
- [x] `documents/generate` REST route delegates to shared renderer (`app/services/file_document_generator.py`); no duplicate generators
- [x] `/api/artifacts` list fixed (datetime serialization) — previously 500 on any artifact row
- [x] Approvals full lifecycle: every chat-generated document creates a PENDING `Approval` (approval_id emitted in `run_completed.artifacts`); `GET/POST /api/approvals`, approve/reject use the authenticated user (`reviewed_by` = real reviewer id, 409 on non-pending); `requested_by_name`/`reviewed_by_name`/artifact summary in responses; AuditEvent rows written on approve/reject; UI has working Approve/Reject buttons with comment + linked-artifact download
- [x] Coding sandbox: planner routes code-intent queries to `coding_agent` tool (LLM emits a single stdlib Python script, executed by the hardened `CodeExecutorTool` in `python -I` with temp-dir cwd, per-process CPU/fs/file-descriptor rlimits, no injected network env); `/api/code/run` executes ad-hoc scripts (auth-required, timeout 1–60s, 422 on failure, writes `code.run` AuditEvent); UI Code Sandbox now triggers a real backend execution and renders stdout/exit/sandbox note
- [x] Global `WorkbenchException` handler added — unauthenticated/invalid-token requests on protected routes now return proper 401/403 instead of 500 (was also raw 500 on `/api/approvals`, `/api/code/run`, etc.)
- [x] Greeting fast path (`app/agents/greetings.py`): social/greeting/chitchat/thanks queries bypass the agent pipeline entirely (no router/tool/RAG/verifier); deterministic replies for common greetings, LLM-generated warm reply otherwise; subject hints (assets, documents, "what is", "create", etc.) correctly fall through to the full agent
- [x] Mock replacement in UI: ProfileScreen loads the real user (`/api/auth/me`: name/email/role) with role-derived permissions; ProjectDetailScreen receives the selected Project and loads real documents, tasks (project_id), artifacts, and approvals; DocumentViewerScreen renders the real selected document's metadata instead of a fabricated P-102 report; Sidebar/Profile/Security GPU claims corrected from fabricated "RTX A5000 / 24 GB" to the real "RTX 4050 / 6 GB"
- [x] Offline verification script (`backend/scripts/verify_offline.py`) runnable and accurate: fixes so it executes from any cwd (adds project root to `sys.path`); Qdrant health now uses `/livez` (was `/health` which returns 404); port scan parses `ss -tuln` columns correctly, treats only the local AI stack (uvicorn :8000, Vite :8443, Qdrant :6333/6334, Ollama :11434) as legitimate and ignores loopback system services; adds an active external-egress probe (`https://api.openai.com`, `anthropic.com`, `google.com`). Result honestly reports: (a) all local-services/AI-config/AI-code-path checks PASS, (b) the operator's workstation has general internet (egress probe reachable), i.e. the AI backend is local but the machine is not a fully air-gapped host — documented as a known limitation, not hidden
- [x] Tests added and passing: 39 pytest tests (`backend/tests/`) — unit tests for greetings classification/fast-path, planner intent routing (create-vs-code-vs-analysis-vs-search), coding-agent code-fence parsing, and the hardened code executor (run/timeout/stderr/empty/files); e2e smoke tests against the running backend (auth 401 guard, `/api/auth/me` seed user, `/api/code/run` live execution + anon rejection, offline-script smoke)
- [x] Security page accuracy fixed: `/api/security/status` Qdrant check now uses `/livez` and the DB check uses SQLAlchemy `text("SELECT 1")` — overall now correctly reports `secure` (was `degraded` due to two false-failing checks)
- [x] Document exports in 8 formats: `render_document` now emits DOCX/XLSX/PPTX/PDF/TXT/JSON/MD/CSV and template coverage expanded (approval_note/technical_review/inspection_report → all 8; risk_assessment → xlsx/csv/json/md/txt; management_summary → pptx/pdf/docx/md/txt/json). CSV fallback writes a `Field,Value` header; download endpoints add `text/csv`, `text/plain`, `text/markdown`, `application/json` media types. Planner detects format phrases ("in a sheet/make a ppt/as a pdf/in excel…") via expanded keyword sets + regex.
- [x] Follow-up artifact editing with versioning: new `update_artifact` tool (writes `version+1`, sets `parent_artifact_id`, falls back to the original artifact_id so v1 stays stable), new `convert_artifact` tool (new artifact in target format linked via `parent_artifact_id`); planner resolves the latest artifact from the conversation (`state.context["artifacts"]` seeded from prior COMPLETED runs, most recent first) and routes "expand/update <doc>" / "convert/turn <doc> into <fmt>" intents. Extracted content round-trips across formats via `extract_document_data` (docx sections, xlsx sheets, pptx slides, csv/md/json/txt, pdf text) so conversions preserve the original report body (verified docx→pdf keeps all sections).
- [x] Chat file upload: `POST /api/chat/attachments` accepts txt/csv/json/md/xlsx/docx/pptx (python-* extraction), images (pytesseract OCR), and pdf (pypdf); extracted text is indexed in-memory per conversation (`chat_attachment_service`, cap 20, chat-scoped, not added to permanent RAG by design) and appended to the run query as attachment context. Verified E2E: upload `vib.csv` then ask "highest reading for P-102 from my uploaded file" → answer 7.5 mm/s sourced from the file. Frontend Composer has attach button, per-file status chips (uploading/ready/error), remove, and auto-creates the conversation on first attach.
- [x] Artifacts screen overhaul: PreviewModal fetches `/api/artifacts/{id}/preview` (inline JSON/text for json/csv/txt/md, raw PDF, office text summaries), real download links, date-created grouping (Today/Yesterday/weekday/date), format/status tabs, and a `v{version}` badge with parent-artifact links; ArtifactResponse now exposes `version`, `parent_artifact_id`, `preview_url`.
- [x] Tests expanded: 78 pytest tests — `test_file_formats.py` (8 formats render, txt/json/md/csv content, extract round-trip), `test_doc_tools_and_attachments.py` (tool registration, chat attachment parsing txt/json/csv, chat-scoped isolation), planner follow-up-edit routing (update vs convert vs create), e2e ArtifactsAPI (version/preview fields, preview + download endpoints) and ChatAttachmentAPI (upload parses txt).
- [x] Full chat persistence (4-point requirement): per-message `sources` (citation/evidence), `artifacts` (generated-document download links), and `meta` (model / verified / analysis) persisted on the `messages` row and serialized by `GET /api/chat/conversations/{id}/messages` — sources and download links survive follow-up questions and close/reopen from History. Auto-title on the first message (`generate_title`, deterministic, no LLM call; verified: "Explain how our company's leave policy works" → "Company Leave Policy", "Create a report on Q3 sales performance" → "Q3 Sales Performance Report"); backfilled all 45 pre-existing conversations from their first user message. `PATCH /api/chat/conversations/{id}` renames (400 on empty), `DELETE /api/chat/conversations/{id}` deletes the conversation + cascade-messages + its agent runs (404 on repeat). Frontend: per-message collapsible `Sources (N) ▼` panel (default collapsed) with relevance bars + evidence drawer, per-message document cards with working download links (via `api.artifacts.downloadUrl`), History sidebar rename (inline input, Enter/save/blur) and delete (confirmation modal). Chat uploads remain chat-scoped but are now rebuildable after a backend restart from persisted message attachment metadata (`build_attachment_context` re-reads them).

## Phase 19 — Routing + necessity-driven retrieval hardening (15-case E2E matrix)

### Root causes (per problem) and the fix
- **Conversational/general questions went through RAG + planner** → new `app/agents/intent.py` classifies queries before any router/LLM:
  `CONVERSATIONAL` (greetings, "who are you", "what can you do", thanks, small talk) short-circuits — no router call, no tools, no RAG, no verifier
  (`app/agents/orchestrator.py` `_conversational_reply`, `run_completed` with zero evidence). Any subject hint (asset like P-102, "what is", "create", document words) still falls through to the full agent.
- **Retrieval wasn't necessity-driven** → `HybridRetriever.retrieve_with_metadata` (`app/rag/retriever.py`) now
  (a) gates keyword search to the semantic result set (`semantic_doc_ids`), (b) relevance-gates results (BM25 match OR semantic score ≥ `strong_sem` 0.50), (c) applies
  asset/document_type/classification/year/department/doc_ids filters with no silent over-serving — a filtered miss returns `[]` instead of unrelated docs,
  (d) groups the top hit per document (≤3 each). New settings `retrieval_min_semantic_score` (0.40) / `retrieval_min_keyword_score` (0.5) / `retrieval_max_chars` (2000).
- **Company/SOP/department data was not resolvable** → new `app/tools/company_info.py` (name `company_info`) answers company profile/assets/departments from the live DB;
  `app/tools/document_search.py` re-serves **year / department / doc_ids / content_limit** inputs and progressively relaxes filters (drop asset → type → year) instead of failing;
  per-company BM25 corpus (relative `min_score_ratio`, numpy `scores.tolist()` fix) in `app/rag/keyword_search.py`.
- **KB summarization / multi-doc comparison were weak** → `app/tools/summarize_documents.py` (name `summarize_documents`, deep retrieval up to `summarization_max_chunks`=40, per-document grouping);
  comparison plans step per year ("Search documents recorded in 2024" / "...2025"); plan steps no longer hardcode examples.
- **Complex multi-task queries failed** → `app/agents/planner.py` adds intent-aware `_complex_plan` composing company_info → search → summarize → generate_document; updated `_fallback_plan`,
  `_search_input`, `_search_step`; analysis/doc-creation routing is driven by the intent's task signals, not pinned keywords.
- **No-hallucination guard** → `_synthesize_answer` refuses to answer when RAG was required but evidence is empty (honest "not found in the knowledge base" message);
  evidence per source capped in synthesis (1200 chars), company-info JSON cap 1500, summarize cap 4000, synthesis `num_ctx` 16384, Ollama client timeout 120s → 300s.
- **Artifact download 500** → non-ASCII filename (em-dash from "Inspection Report — 2025") broke latin-1 `Content-Disposition`; download endpoint now sanitizes the filename.

### Other changes
- `app/services/document_service.py` ingest + `scripts/reindex_qdrant.py` now embed derived metadata (document_type/year/department/owner/revision) in chunk payload & Qdrant payload (250 chunks reindexed; `sop`×65, 2024×5 verified).
- `cat`egory constants + deterministic derivation in `app/rag/doc_metadata.py` (`derive_document_metadata`, asset regex extracts all assets, `extract_year`).
- `app/services/chat_service.py`: `run_failed` persists agent_run FAILED + error_message; `run_completed`/`run_failed` carry `steps_status`.
- Frontend `AgentStepView` now `{label, status: pending|running|completed|failed, error?}`; SSE client maps `plan_created`→pending, `tool_started`→running,
  `tool_completed`→completed/failed, and terminal `steps_status` on run_completed/run_failed; `api.ts` `ChatEvent` extended with step_index/success/steps_status/evidence fields.

### Tests + verification
- Tests: **150 passed** (92 → 150) in ~6.5 s. New `tests/unit/test_intent.py` (conversational/company/summarization/comparison/docgen/complex/knowledge),
  `tests/unit/test_doc_metadata.py`, `TestIntentAwarePlanning` in `test_planner.py` (per-year compare, summarize/company tools, SOP/department targeting, complex steps, no-hardcoded-calc regression).
- Live 15-case E2E via `/api/chat/stream` (SSE), all pass:
  - 5 conversational → fast-path-greeting, no tools/evidence
  - 3 company (profile / location / departments) → `company_info`, cited
  - SOP P-102 / maintenance-dept / max operating pressure → knowledge route + citations (`40 bar` from datasheet; P-102 "40 bar, design 50, PSV 47.5")
  - "Summarize … in 5 points" → `summarize_documents`, 3 docs, numbered points; "key findings 2024" → targets only APEL-INS-P102-2024
  - "Compare 2024 and 2025" → 4-step per-year plan, rows for both reports
  - Multi-task company + retrieve + create → 5-step complex plan, DOCX artifact persisted (v1), full cited answer
- Frontend `npx tsc --noEmit` clean; artifact download endpoint fixed (was 500).

### Known limitations
- Ollama `qwen2.5:7b` primary synthesis is slow on this hardware (single answer can take 1–3 min); timeouts raised to 300 s.
- Retrieval filter refinement is heuristic (asset → type → year); a fully typed knowledge plan covers the common cases.
- Summarization window (40 chunks / 8000 chars) bounds how large a single document summary can be.

## Phase 20 — Robust answer synthesis + guaranteed Pressure/Corrosion/Vibration chart

### Issue 1: "Error synthesizing answer" after successful execution
- **Root cause:** the final chat answer depended on a single `qwen2.5:7b` generation that occasionally timed out (client timeout 120s, later 300s) or failed with an empty error; on failure the orchestrator returned the literal string `Error synthesizing answer: ...`.
- **Fix (`app/agents/orchestrator.py`):**
  - Structured analysis results (summary, metrics, readings, percentage changes, risk level) are now injected **verbatim** into the synthesis prompt so the model answers with the already-generated figures.
  - On LLM failure or empty response the orchestrator falls back to `_fallback_synthesize`: a deterministic markdown answer assembled entirely from already-generated execution results (analysis summary/metrics/findings/charts/tables, evidence document list, generated artifact, risk level). It **never** emits `Error synthesizing answer`; with no content at all it returns the honest "couldn't find" message.

### Issue 2: "Pressure, Corrosion, and Vibration Levels" graph blank
- **Root cause:** the chart depended on whatever the analysis LLM produced (occasionally empty, or string values that the frontend's `typeof value === "number"` filter dropped), and it only ever held a single "current value" instead of the per-year series.
- **Fix:**
  - New `app/services/inspection_trends.py`: deterministic per-year readings parsed from the indexed inspection-report chunks (`APEL-INS-*-YYYY`) — Pressure / Corrosion / Vibration / Seal temp for each available year, percentage changes (`pct` between consecutive years), limit-breach flags from the report findings text, risk level and a ready-to-render **multi-series line chart** titled "Pressure, Corrosion, and Vibration Levels (YYYY–YYYY)".
  - `AnalysisEngine` (`app/services/analysis_service.py`) merges the trend chart/metrics/findings/table into every asset-targeted analysis (`_merge_inspection_trends`) and coerces LLM chart values to numbers (`_normalize_charts`). Verify: P-102 → chart series Pressure (34→37→42 bar), Corrosion (1.2→2.4→3.8 mm), Vibration (4.1→5.3→7.2 mm/s) across 2024/2025/2026; risk HIGH.
  - `orchestrator._collect_analysis` also merges the trend chart as a last line of defense, so the `run_completed.analysis` graph is never blank.
  - Frontend (`AnalysisView.tsx`): new multi-series line renderer (`MultiSeriesLineChart`) with per-metric legend and colors; `BarChart`/`LineChart` coerce numeric strings defensively so a string value can never blank the graph.

### Verification
- Full suite: **162 passed** (~7.4s) — new `tests/unit/test_inspection_trends.py` (parsing, multi-year series, % changes, risk, year filter, no-measurement fallback) and `tests/unit/test_synth_fallback.py` (never emits "Error synthesizing answer"; includes metrics/findings/sources/artifact/risk; honest empty answer). Frontend `npx tsc --noEmit` clean.
- Live E2E (exact user query, /api/chat/stream): 11/11 steps completed → answer 3370 chars with **no** `Error synthesizing answer`; `analysis.charts[0]` = line chart "Pressure, Corrosion, and Vibration Levels (2024–2026)" with 3 series × 2024/2025/2026 values; analysis also carries readings table, `% changes`, `risk_level: HIGH`; DOCX "P-102 Inspection Report for Engineering Review" generated + persisted; sources (13) and artifacts (1) persist on the message row and the chart persists in `meta.analysis` so it renders after reopen.
- 20-case E2E incl. recheck of comparison/company info cases 2.0 matrix remains green.

## Final E2E verification (single pass, all local)
- Greeting fast-path: `hello` → model `fast-path-greeting`, no tools, warm reply
- Code sandbox: `/api/code/run` `print(sum(range(1,101)))` → `5050`, return 0, ~28 ms, sandbox note
- Document generation + approval sync: "Create a risk assessment document…" → XLSX artifact + PENDING approval (`APR-…`); approve as seed user → APPROVED, reviewer + reviewed_at set
- Security status → overall `secure`; local inference/storage/audit all ACTIVE
- Frontend: `tsc --noEmit` clean
- All-format exports: 8 formats render in 0.5 s (docx/xlsx/pptx/pdf/txt/json/md/csv); every chat-created doc appears in Artifacts with download + preview
- Version chain: "Create an inspection report…" → v1 DOCX → "Update … add a risk mitigation section" → v2 DOCX (`parent_artifact_id` = v1) → "Convert the approval note to pdf" → PDF linked to its source; converted PDF verified to contain the full report body (`pdftotext`)
- Chat upload: attach `vib.csv` → "highest vibration reading from my uploaded file" → `7.5 mm/s on 2026-08-20`
- Full suite: 92 passed (80 unit / 12 e2e) in ~5 s; frontend `tsc --noEmit` clean
- Chat persistence E2E (Tests 1–4, API-verified via live backend): (1) "Explain how our company's leave policy works" → run_completed evidence=5, assistant message row persisted `sources`[5], survives GET messages (close/reopen); (2) artifacts/download links round-trip through the messages endpoint (seeded `ART-REOPEN` download_url returned verbatim after reopen); (3) auto-title "Company Leave Policy" on first message, `PATCH` rename → "HR Leave Policy Deep Dive" round-trips, empty-title rejected 400; (4) `DELETE` removes conversation + cascade messages + agent runs (repeat → 404). Full generated-doc link persistence is additionally locked by repo round-trip + messages-serializer e2e tests; live doc routing depends on the 3b Ollama model following the plan (it sometimes answers from search without calling the document tool — unchanged pre-existing model routing).

### Known limitations (on this machine)
- PaddleOCR scanned-PDF OCR is CPU-only and slow; may be skipped on large scans.
- True containerized sandbox not guaranteed; network blocking is best-effort (firewall cgroup),
  documented rather than faked on Security page. Executed Python runs with `-I` (isolated mode),
  per-process CPU/fs/fd rlimits, temp-dir cwd, and no network env on the subprocess, but a malicious
  same-OS process is not a hard VM boundary.
- Only 6 GB VRAM / RTX 4050 → vision (VL) models not run; image analysis = OCR + local heuristics.
- `TEST_DATA_REMOVE_LATER` folder empty in this dataset copy → test data authoring deferred.
- Chat uploads are conversational and chat-scoped: files persist on disk under `backend/chat_uploads/` and per-file metadata is written onto the user message row, so uploaded-file context is rebuilt from the DB after a backend restart (in-memory index + message-metadata fallback). Deliberately not indexed into the permanent RAG/knowledge base.
- Artifact status shown in the API remains the lifecycle string; the UI groups tabs by format and creation date.

## Phase 21 — Full sovereign dataset ingestion (223 files → 2907 chunks)

### What was added
- `backend/scripts/ingest_full_dataset.py` — idempotent full-dataset ingestion command (auto-discovery, registry-aware stable document_ids, no gold-plating). Bounds large structured files so no single file floods the index (`_MAX_XLSX_ROWS_PER_SHEET` 1500, `_MAX_CSV_ROWS` 1200, `_MAX_JSONL_GROUPS` 30, `_MAX_JSON_RECORDS` 300). Parquet files are **aggregated** into ≤40 distilled sections (per Asset/Unit/Year min/mean/max stats + last-5-row samples).
- **Idempotency via content hash** stored in `Document.doc_metadata["content_hash"]` + a `processor_version` gate — unchanged files are skipped, changed/incomplete files reprocess (old chunks + Qdrant points deleted first), metadata-classifier changes are picked up by bumping `PROCESSOR_VERSION`. Dry-run mode is non-destructive (verified).
- **Per-chunk semantic metadata enrichment** (`_page_assets`/`_page_year`): structured pages carry the asset id(s) + year they describe, folded into chunk metadata and the Qdrant payload — so asset/year filters now hit the data files (e.g. `vibration_condition_history` C-301 sections, `asset_health_history` per instrument/yr).
- Extensions to `app/rag/doc_metadata.py`: `_canonical_document_type` path matching now works for slash-less `source_path` and maps the new folders (`condition_monitoring`/`integrity` → inspection, `assets` → equipment, `instrumentation` → procedure, registers stay register); `_derive_department` maps the new folders to real departments (Engineering/HSE/Inspection/Operations/Maintenance/Procurement/Enterprise Data/…).

### Final state (verified)
- 223 documents (all READY) — 76 PDF, 111 XLSX, 36 structured (JSON/YAML/CSV/jsonl/parquet); 2907 chunks, all embedded, 2907 Qdrant points; 0 duplicates (document/chunk ids) and DB↔Qdrant counts match.
- Previously indexed 250 chunks rebuilt cleanly; companies/assets/conversations/artifacts/messages rows untouched.
- Metadata filter verification: `asset_id=P-102` → 546 points, `C-301` → 32 (vibration sections), `FT-101` → 325; `document_type=inspection` → 405, `report` → 1637, `equipment` → 169; `department=HSE` → 643; `year=2025` → 466.
- Retrieval spot-checks (HybridRetriever): operating limits/design basis (manual, P-102), compressor vibration (asset-filtered → `condition_monitoring_vibration_condition_history` C-301 2026 segments), unit equipment (asset hierarchy), company profile (`company.json`, entity registry).
- Excluded by design: `TEST_DATA/`, `tools/`, `templates/`, root README (knowledge content only). Content hash makes re-runs true no-ops.
- Full suite **162 passed**, frontend `npx tsc --noEmit` clean after the metadata/doc changes.

### Entity-reference guard (anti-hallucination hardening)
- New `app/agents/entity_guard.py`: before synthesis the orchestrator deterministically checks every plant code the user referenced (asset/instrument codes, unit tags like CDU-4/UTY, and generic `U-101`-shaped tokens) against the indexed corpus (`chunk_metadata.asset_id` + unit tags from hierarchy/specs). Retrieved-but-uncited codes get a soft note; codes that exist nowhere (e.g. `U-101`, `V-999`) get a strict instruction to state "not found" and, for units, to list the real ones. Ordinary prose/numbers are never misread as codes.
- Verified live in-process against the U-101 query (previously fabricated): the answer now honestly reports U-101 is not in the KB and lists the actual units — no hallucinated equipment. 13 new guard unit tests (`tests/unit/test_entity_guard.py`).
- E2E answer quality battery (6 queries, all cited, no "Error synthesizing answer"): company profile (company_info), P-102 safe operating limits (35 normal / 40 max / 45 trip — cites the new `specs_operating_limits`), C-301 vibration (asset-filtered values accurate), FT-101 event history (accurately all LOW/MEDIUM operational transients), and P-102 pressure/corrosion/vibration analysis with the deterministic 3-series chart (34→37→42 bar, 1.2→2.4→3.8 mm, 4.1→5.3→7.2 mm/s) + readings table persisted in `messages.meta.analysis`.
- Full suite now **175 passed** (~6.7 s). NOTE: the running uvicorn (started without `--reload`) needs a restart to load the entity-guard synthesis change.
