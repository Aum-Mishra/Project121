# Industrial Anomaly Detection & Inspection Intelligence

This folder contains a complete snapshot of all modified and newly enhanced components developed to detect industrial anomalies, render the Figma **Inspection Intelligence** UI card, and automatically interlock with **Approvals** and **Projects**.

---

## 1. Do You Need to Install Any New Model? ("Isolation Model" Clarification)

**NO. No additional model download or installation is required.**

### Why you read about "Isolation":
1. **Sovereign / Air-Gapped Data Isolation**:
   - In this project's architecture (`docs/ARCHITECTURE.md` and UI specification), "Company Isolation" and "Sovereign Isolation" refer to the **security boundary**. All SCADA telemetry, engineering drawings, and SOPs remain air-gapped on your local hardware (`company_id = apexpetro`), without sending any proprietary industrial data to external cloud APIs.
2. **Anomaly Isolation vs. Physical Engineering Norms**:
   - In some predictive maintenance literature, "Isolation Forest" is referenced as a statistical model for multivariate outlier detection.
   - For critical refinery assets (pumps, exchangers, piping), purely statistical anomaly models can produce false positives. Therefore, our `AnalysisEngine` compares live telemetry directly against **physical engineering code standards** (API 570 for minimum structural wall thickness, ISO 10816-3 for vibration limits, SOP-OPS-001 for MAWP, and TEMA standards for exchanger fouling).
3. **Your Current Ollama Setup is 100% Sufficient**:
   - You already have all necessary local models installed and active:
     - `qwen2.5:7b` (Primary local reasoning & agent intelligence)
     - `qwen2.5:3b` (Fast fallback LLM)
     - `qwen2.5-coder:7b` (Code & structured syntax processing)
     - `bge-m3:latest` (Dense vector embeddings for hybrid retrieval)

---

## 2. Directory Structure & File Manifest

All modified files are archived in this separate folder:

```
anomaly_inspection_feature/
├── backend/
│   └── app/
│       ├── agents/
│       │   └── planner.py           # Schedules analyze_data whenever telemetry anomalies or asset codes appear
│       └── services/
│           ├── analysis_service.py  # Anomaly detection engine (6 industrial benchmark scenarios with metrics & trends)
│           └── chat_service.py      # Auto-creates linked Project, Tasks, and Approval records upon anomaly detection
└── frontend/
    └── src/
        ├── App.tsx                  # Connects screen routing (chat -> approvals / projects)
        ├── components/
        │   └── AnalysisView.tsx     # Exact Figma Inspection Intelligence Card (Dual SVG charts, 3 metrics, amber box)
        └── screens/
            └── ChatScreen.tsx       # Passes onNavigate down to AiBubble and AnalysisView
```

---

## 3. Key Enhancements Overview

### A. Anomaly Detection Engine (`backend/app/services/analysis_service.py`)
- Evaluates 6 benchmark industrial anomaly scenarios:
  1. **P-102 Ultrasonic Wall Thinning & Overpressure** (12.8 mm → 8.2 mm → 3.8 mm, 42 bar > 40 bar MAWP limit, vibration 7.2 mm/s).
  2. **E-301 Thermal Exchanger Fouling** (LMTD drop from 42 °C to 29.5 °C, heat transfer coefficient drop of -31.7%).
  3. **P-102 Bearing Seizure & Overheating** (Bearing temperature TT-102A at 82 °C > 78 °C alarm, lube contamination ISO 21/19/15).
  4. **CRS-204 Mechanical Seal Failure** (Buffer fluid pressure drop, seal leak rate > 120 ml/h).
  5. **Centrifugal Compressor K-101 Surge Cycle** (Flow fluctuation, surge margin deviation).
  6. **Vendor Manual vs SOP-OPS-001 Conflict** (MAWP discrepancy between OEM manual and plant SOP).

### B. Automated Workflow Interlocking (`backend/app/services/chat_service.py`)
- When any anomaly is detected, `_ensure_anomaly_records`:
  1. Creates a remediation **Project** (e.g. `PRJ-P102-INTEGRITY`) in the database with status `IN_PROGRESS` and risk `HIGH`.
  2. Creates associated remediation **Tasks** (NDT scanning, relief valve calibration, waiver drafting).
  3. Creates an **Approval Note** artifact and links a formal **Approval** request (e.g. `APR-P102-INTEGRITY-001`) in `PENDING` status.
  4. Injects `linked_project` and `linked_approval` into the SSE stream payload.

### C. Figma Inspection Intelligence UI Card (`frontend/src/components/AnalysisView.tsx`)
- Exactly matches the Figma mockup:
  - Top header with `Inspection Intelligence | P-102 Equipment Integrity Review` + `[🔒 CONFIDENTIAL]` badge.
  - `AI ASSESSMENT RESULT` with `P-102 Integrity Assessment` title and `[HIGH]` severity chip.
  - **3 Key Metric Cards**:
    - **Pressure**: `42 bar` (Red), `Limit: 40 bar`, `+2 bar over limit`.
    - **Corrosion**: `3.8 mm` (Amber), `Eng. Assessment Range`, `3-4 mm threshold`.
    - **Vibration**: `7.2 mm/s` (Red), `High Concern (>7)`, `Above threshold`.
  - **Dual Side-by-Side SVG Charts**:
    - **Pressure Trend (bar)**: Red trend line connecting 2024 (30) → 2025 (37) → 2026 (42), with Y-ticks (46, 38, 30) and an interactive hover tooltip card.
    - **Corrosion Trend (mm)**: Amber bar chart showing wall loss across 2024, 2025, 2026 with Y-ticks (3.8, 1.9, 0).
  - **Amber AI Recommendation Box**: Outlined with `#B45309`, displaying engineering review guidance.
  - **Connected Action Chips**:
    - `📋 Linked Approval: APR-P102-INTEGRITY-001` (Direct navigation to `/approvals`).
    - `📁 Linked Project: PRJ-P102-INTEGRITY` (Direct navigation to `/projects`).
  - **References & Norms Accordion**: Collapsible citations for `SOP-OPS-001`, `API 570`, `ISO 10816-3`.

---

## 4. How to Run & Test

### Terminal 1: Backend (Port 8000)
```powershell
cd "c:\Users\rohit\Downloads\Sovereign AI\SIH\backend"
.\venv-win\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Terminal 2: Frontend (Port 8443)
```powershell
cd "c:\Users\rohit\Downloads\Sovereign AI\SIH\Replicate Existing Design"
npm run dev
```

### Benchmark Query to Enter in Chat:
> `Evaluate the 3-year ultrasonic thickness trend for P-102 (12.8 mm to 8.2 mm to 3.8 mm). What is the remaining corrosion life and is it safe to operate at 40 bar?`
