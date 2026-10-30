# KNOVIA AI — Test Prompt Suite

End-to-end verification prompts for the integrated system (backend `KNOVIA-ai-main`, UI on port 5175, API on port 8000).

## Setup

- Backend: `venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload`
- Frontend: `npm run dev` (port 5175), Vite proxy not used — frontend calls `API_BASE` directly (`http://localhost:8000`)
- Login: use the Admin persona (full access); Workbench chat, Approvals, Projects are the primary screens under test.
- Expected shared artifacts: live anomaly replies create a `P-102 Abnormality Review` approval (PENDING) and, for report intents, a DOCX artifact under `/api/artifacts/…`.

> Note on live-model flakiness: classification and synthesis run against the local Ollama models. Under load they are slow (60–90 s+ for COMPLEX) and occasionally misclassify a query as `irrelevant` (UI shows "I am restricted to answering questions related to MRPL…"). If that happens, simply re-run the same prompt. Intent is logged in the plan card (`Intent identified: …`).

---

## 1. Simple / Fact Lookup

| # | Prompt | Expected Behavior | Verify |
|---|--------|-------------------|--------|
| 1.1 | `What is the current operating pressure of pump P-102?` | SIMPLE intent, 3-step plan, fast path | Answer "42.0 bar"; plan card shows 3 steps; COMPLEXITY chip SIMPLE |
| 1.2 | `What is the remaining corrosion allowance on the P-102 pump casing?` | Fact lookup | Answer ~"2.1 mm"; sources cited |

---

## 2. Talk / Figures / Charts (Graphs + Analytics)

| # | Prompt | Expected Behavior | Verify |
|---|--------|-------------------|--------|
| 2.1 | `Compare the operating pressure and vibration of pump P-102 between 2024 and 2026, and explain the changes with the relevant inspection data.` | MEDIUM intent, analysis envelope, no anomaly (pressure/vibration trend context) | Analysis card "Key Metrics"/"Findings" render; percentage-change values (+23.5% pressure, +75.6% vibration) |
| 2.2 | `Analyze the 2026 CDU-4 monthly production data from January through July. Show a bar chart for CDU-4 production, identify the highest and lowest months, explain the July change, and provide the data as CSV.` | Graph generation + CSV file artifact | Chart card renders (Jan-Jun rising to 146 kbd, July 141 kbd); `CDU4_production_2026.csv` downloadable |
| 2.3 | `Analyze discharge pressure and flow over the last 8 months — is performance degrading?` | Analytics, chart, verdict flag | Trend chart + verdict "slightly below limit" |
| 2.4 | `Can you show me the Jan–Aug trend and explain the pattern?` | Trend chart | Vibration trend chart; monotonic increase Jan→Aug |

## 3. Comparison & Calculation

| # | Prompt | Expected Behavior | Verify |
|---|--------|-------------------|--------|
| 3.1 | `Compare the CX-4 vendor proposals for a P-102 replacement pump.` | Multi-metric comparison | Vendor A vs B lead time 12 vs 6 weeks; `cx4-xlsx` + `vendor` files |
| 3.2 | `Now compare current measurements against the baseline (new condition) — quantify the change.` | Baseline delta calculation | Δ vs 2.5 mm/s baseline quantified |

## 4. Document Generation (all formats)

| # | Prompt | Expected Behavior | Verify |
|---|--------|-------------------|--------|
| 4.1 | `Draft an engineering action memo summarizing the P-102 inspection findings.` | DOCX artifact | `<YourProject>_Action_Memo.docx` in "Generated / Referenced Documents"; download returns file (not JSON) |
| 4.2 | `And export the trend as a CSV for my personal record.` | CSV artifact | `.csv` download |
| 4.3 | `What is the approved CDU-4 startup sequence? … generate a practical startup checklist document.` | DOCX checklist | Startup checklist DOCX; content match pre-start/warm-up/hold sections |
| 4.4 | `What criteria should be used to evaluate a supplier for a critical P-102 mechanical seal cartridge? … create an evaluation checklist…` | XLSX artifact | `Vendor_Evaluation_Checklist.xlsx`; sheets present, scores blank |
| 4.5 | `Prepare a management-level explanation of the KNOVIA AI Workbench… Generate a 6-slide PPTX.` | PPTX artifact | 6-slide deck renders/downloads (pptx format) |
| 4.6 | `For planned maintenance on a pump, explain how permit-to-work and energy isolation should work together… produce a one-page procedural PDF with a flow diagram.` | PPTX→PDF/flow artifact | PDF + flow PNG produced |
| 4.7 | `make a powerpoint deck summarizing the P-102 discharge pressure findings` | PPTX **+ DOCX** (management summary) | Presentational keywords (`ppt/presentation/slides/powerpoint`) force `management_summary` → both files READY in the run |

---

## 4b. Coding Agent (writing code)

| # | Prompt | Expected Behavior | Verify |
|---|--------|-------------------|--------|
| 4b.1 | `write a python script to compute the discharge pressure trend of P-102` | result `action: "redirect_coding"` + `coding` envelope | codegen SSE rows ("Coding Agent" / CODE → ZIP READY); chat shows "Coding Agent · Project Created" card with file list, **Download ZIP**, **Open in Coding Agent** |
| 4b.2 | Click **Open in Coding Agent** on the card | Navigate to Coding Agent page | New session opens pre-seeded with the generated files, ADFS `COMPLETED`/`IMPLEMENTED`; persists via `ca_active_session` |
| 4b.3 | `code` / `script` / `function`/`bug`/`api` phrasing | Push to Coding Agent | Any of those words triggers the code phase (intent heuristic `coding_task`) |
| 4b.4 | Artifacts page | Code tab | `CODE_PROJECT` / `ZIP` row (e.g. `p-102-….zip`) listed under **Code**, download returns the archive (not JSON). Embedded metrics are the retrieved values (no fabricated P-102 numbers). |
| 4b.5 | `write a python code to count from 1 to 100` | **Pure coding** — correct code only | Answer is the actual counting program (hardcoded loop 1..100) with **verified run output** (`1\n2\n…\n100`). NO Engineering Report DOCX/XLSX, NO Key Findings, NO Structured-Analysis card, NO P-102 metrics. Delivery: instant (deterministic template, no coder-model latency) |
| 4b.6 | `write a python program that simulates rolling a six-sided die 10 times and prints each result` | Generic coding via coder model | Not a known template → local `qwen2.5-coder:7b` generates `main.py`, executed with returncode 0, real random die rolls in run output (e.g. `2 3 1 5 1 3 2 3 5 6`) |
| 4b.7 | `write a python script to compute the discharge pressure trend of P-102` | Asset-aware coding (unchanged) | Same as 4b.1 but generated `main.py` **executes successfully** (`run_ok: true`) printing the real retrieved P-102 operating summary; chat answer has `mode: asset` |

---

## 5. Anomaly Detection → Human Approval (core OLD feature)

| # | Prompt | Expected Behavior | Verify |
|---|--------|-------------------|--------|
| 5.1 | `Run a comprehensive reliability analysis on the P-102 pump and flag any anomalies` | COMPLEX run; `analysis.anomaly_detected=true`; Approval + Artifact created | Workbench shows analysis card with CRITICAL findings, and "AI Action Required" approval card (`P-102 Abnormality Review`) |
| 5.2 | Repeat 5.1 (or ask again within 2 h) | Dedupe | No duplicate approval created; same `APR-…` id returned |
| 5.3 | Sidebar | Pending badge | Approvals nav icon shows count of PENDING (increases after a new anomaly is created) |
| 5.4 | Approvals page | List + status | New PENDING row appears with artifact link, risk "LOW", requested-by "KNOVIA AI" |
| 5.5 | Approve | Status flips | Click Approve → status APPROVED; reviewed-by captured; row moves to completed; badge count decreases |
| 5.6 | Reject (re-run 5.1 then reject) | Status flips | Status REJECTED persisted; artifact marked REJECTED |

---

## 6. Personal Projects CRUD (frontend → `/api/projects`)

| # | Action | Expected Behavior | Verify |
|---|--------|-------------------|--------|
| 6.1 | Projects → "Personal Projects" section | Loads own projects | Header "created by <persona name>"; empty-state for first run |
| 6.2 | New Personal Project → name/reason → Create | POST persists | Card appears; reload (F5) keeps it (SQLite persistence) |
| 6.3 | Re-login as a different persona | Owner scoping | `?personal=true` filters by owner; other user's items not shown |
| 6.4 | Corporate list | Regression check | Seed projects (P-102 Pump Maintenance Study etc.) still listed |

---

## 7. Follow-ups / Continuity

| # | Prompt | Expected Behavior | Verify |
|---|--------|-------------------|--------|
| 7.1 | 2.1, then in same chat: `Also — when did it first cross the 7.1 mm/s threshold?` | Context carried | Answer "June 15th, 2026"; new turn, no reset |
| 7.2 | After 5.1 anomaly: `What is the recommended shutdown / priority recommendation based on current findings?` | References prior findings | No-shutdown recommendation (below 8.5 trip); linked approval/project still referenced |

---

## 8. Error / Guard handling

| # | Prompt | Expected Behavior | Verify |
|---|--------|-------------------|--------|
| 8.1 | `Who won the Super Bowl?` / `What's the weather in Mumbai?` | Irrelevant intent | "I am restricted to answering questions related to MRPL…" (no retrieval, no artifacts) |
| 8.2 | `Hi` / `Hello` | Greeting | Greeting response without plan |
| 8.3 | Empty input / whitespace | Guard | Send disabled or validation message |

---

## API smoke (no UI)

```bash
curl -s http://localhost:8000/api/projects?personal=true          # projects (own)
curl -s http://localhost:8000/api/approvals                       # list + pending count
curl -s http://localhost:8000/api/artifacts                       # artifacts (incl. ANN-docs)
curl -sN http://localhost:8000/api/chat -X POST -H 'Content-Type: application/json' \
  -d '{"query":"Run a comprehensive reliability analysis on the P-102 pump and flag any anomalies","role":"ADMIN"}' # SSE
```

---

## 9. Real Coding Agent (isolated service on :8002, wired through chat + Coding Agent page)

The chat coding phase now drives the separate `coding_agent` service (see
`backend/coding_gateway.py`). It is a REAL implementation — files land on disk,
projects are executed/validated, follow-ups edit the SAME workspace, and every
deterministic template / fake-service shortcut is bypassed. `curl -m 600` for
cold-start latency of `qwen2.5-coder:7b`.

| # | Prompt | Expected Behavior | Verify |
|---|--------|-------------------|--------|
| 9.1 | POST `/api/chat` `{"query":"Write a python program that creates a list of numbers from 1 to 10, squares each, and prints the squares.","role":"ENGINEER","conversation_id":"t9-1"}` | `codegen`, then final card "New Project" with verification `✓` | Status COMPLETED + verdict TESTED; folder under `coding_agent/data/coding/<slug>`; `{squares}[n² list]` in `run_output` |
| 9.2 | Same conversation: `{"query":"Now also print the cube of each number, keep the existing squares output.","conversation_id":"t9-1"}` | "Existing Project" | `modified main.py` only (minidiff), detail shows modify; second verification `✓`; SAME authorized root |
| 9.3 | Fresh conversation: `{"query":"Write a bash script to count lines in a file.","conversation_id":"t9-2"}` | Isolation | Different authorized root than t9-1; no reuse |
| 9.4 | In same chat (9.1): `"Now also print the average, keep the squares output."` | 3rd follow-up | continues SAME workspace; sums don't re-create files |
| 9.5 | Coding Agent page after 9.1's card → "Open in Coding Agent" | Real session | `ca_active_session` = real `cs-…`; page loads live task, files, tree, verification history |
| 9.6 | Coding page → Run on a completed task | Live console | Streaming run/logs from `/api/tasks/{id}/run` + SSE logs |
| 9.7 | Coding page → ZIP on a completed task | Real download | Downloads the actual project zip (from `/api/tasks/{id}/download`) |
| 9.8 | P-102 asset coding query (e.g. "write Python to predict bearing failure for P-102") | Asset-aware path retained | Uses in-app asset metrics path (service has no asset awareness); regression-checked |

## Regression checks

- `npm run build` in `KNOVIA-ai-main` passes (rolldown build).
- Both rapid dev servers: 5173/5174 = MVP project (API 8001), 5175 = main (API 8000).
- Qdrant total in `backend/storage/qdrant/collection/mrpl_knowledge_local/storage.sqlite` (`SELECT COUNT(*) FROM points`) after a full `force=true` ingest should be ≥ 12,255.