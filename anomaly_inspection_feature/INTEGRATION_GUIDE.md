# Sovereign AI — Industrial Anomaly & Inspection Feature Integration Guide

This standalone package contains the complete **Industrial Anomaly Detection, Inspection Intelligence, and Workflow Interlocking** feature set built for the Sovereign AI Workbench.

You can share this entire `anomaly_inspection_feature/` folder directly with your team or collaborator.

---

## 📁 Package Manifest

```
anomaly_inspection_feature/
├── README.md                                  # Feature summary & architecture primer
├── INTEGRATION_GUIDE.md                       # Step-by-step copy & paste instructions (this file)
│
├── docs/
│   └── Industrial_Anomaly_Detection_Architecture.pdf  # Technical specification (SPEC-AI-ANOMALY-001)
│
├── backend/app/
│   ├── agents/
│   │   └── planner.py                         # Schedules analyze_data for anomaly & telemetry queries
│   ├── api/routes/
│   │   ├── projects.py                        # Fixed Pydantic response types for live projects API
│   │   ├── tasks.py                           # Fixed Pydantic response types for live tasks API
│   │   └── work_orders.py                     # Fixed Pydantic response types for work orders API
│   └── services/
│       ├── analysis_service.py                # 6 benchmark industrial anomaly scenarios + metrics & trend curves
│       └── chat_service.py                    # Database interlock: Auto-generates Project, Tasks, and Approval records
│
└── frontend/src/
    ├── App.tsx                                # View routing between workbench chat, approvals, and projects
    ├── components/
    │   └── AnalysisView.tsx                   # Figma Inspection Intelligence Card (Dual SVG charts, 3 metrics, amber recommendation box)
    └── screens/
        ├── ChatScreen.tsx                     # Binds AnalysisView with seamless navigation callbacks
        ├── ProjectsScreen.tsx                 # 2-column grid project catalog matching video layout (00:43-00:49)
        └── ProjectDetailScreen.tsx            # 8 dynamic project tabs (Overview, Files, Tasks, Agent Runs, Knowledge, Artifacts, Approvals, Audit)
```

---

## 🚀 How to Integrate into Another Clone / Repository

### Step 1: Copy Backend Files
Copy the files from `anomaly_inspection_feature/backend/` into your target project's `backend/` directory:

```powershell
# Windows PowerShell (run from your target repo root)
Copy-Item -Path "anomaly_inspection_feature\backend\app\services\chat_service.py" -Destination "backend\app\services\chat_service.py" -Force
Copy-Item -Path "anomaly_inspection_feature\backend\app\services\analysis_service.py" -Destination "backend\app\services\analysis_service.py" -Force
Copy-Item -Path "anomaly_inspection_feature\backend\app\agents\planner.py" -Destination "backend\app\agents\planner.py" -Force
Copy-Item -Path "anomaly_inspection_feature\backend\app\api\routes\projects.py" -Destination "backend\app\api\routes\projects.py" -Force
Copy-Item -Path "anomaly_inspection_feature\backend\app\api\routes\tasks.py" -Destination "backend\app\api\routes\tasks.py" -Force
Copy-Item -Path "anomaly_inspection_feature\backend\app\api\routes\work_orders.py" -Destination "backend\app\api\routes\work_orders.py" -Force
```

### Step 2: Copy Frontend Files
Copy the files from `anomaly_inspection_feature/frontend/` into your target project's frontend directory (e.g. `Replicate Existing Design/src/` or `frontend/src/`):

```powershell
# Windows PowerShell
Copy-Item -Path "anomaly_inspection_feature\frontend\src\App.tsx" -Destination "frontend\src\App.tsx" -Force
Copy-Item -Path "anomaly_inspection_feature\frontend\src\components\AnalysisView.tsx" -Destination "frontend\src\components\AnalysisView.tsx" -Force
Copy-Item -Path "anomaly_inspection_feature\frontend\src\screens\ChatScreen.tsx" -Destination "frontend\src\screens\ChatScreen.tsx" -Force
Copy-Item -Path "anomaly_inspection_feature\frontend\src\screens\ProjectsScreen.tsx" -Destination "frontend\src\screens\ProjectsScreen.tsx" -Force
Copy-Item -Path "anomaly_inspection_feature\frontend\src\screens\ProjectDetailScreen.tsx" -Destination "frontend\src\screens\ProjectDetailScreen.tsx" -Force
```

---

## ⚙️ Model & Environment Requirements

> [!IMPORTANT]
> **No new or separate models are required.** This feature operates 100% locally on standard air-gapped models already present in Ollama:
> - `qwen2.5:7b` (Primary local reasoning & agent planner)
> - `qwen2.5:3b` (Fast classifier & semantic intent router)
> - `bge-m3:latest` (Vector embeddings in Qdrant)

---

## 🧪 Verification Queries to Test After Integration

In the Workbench Chat (`http://localhost:8443/`), enter any of these test queries:

### 1. P-102 Ultrasonic Thickness & Overpressure Anomaly:
```text
Evaluate the 3-year ultrasonic thickness trend for P-102 (12.8 mm to 8.2 mm to 3.8 mm). What is the remaining corrosion life and is it safe to operate at 40 bar?
```
- **What to observe:**
  - AI Assessment card appears with 3 metric chips: **Pressure (42 bar, Critical)**, **Corrosion (3.8 mm, Warning)**, **Vibration (7.2 mm/s, Critical)**.
  - Dual side-by-side SVG trend charts (Pressure Line Chart with hover tooltip & Corrosion Bar Chart).
  - Amber AI Recommendation box with disclaimer.
  - Action buttons: "View Approval Queue", "Download Approval Note", "View Evidence".
  - Auto-created Project (`PRJ-P102-INTEGRITY`) and Tasks in the database.

### 2. E-301 Thermal Fouling Degradation:
```text
Assess the thermal fouling on heat exchanger E-301 based on TT-301 temperature telemetry and calculate the Log Mean Temperature Difference deviation.
```

### 3. P-102 Bearing Seizure Scenario (CRS-2026-001):
```text
Evaluate risk scenario CRS-2026-001 on pump P-102. TT-102A bearing temperature is at 82 °C and oil sample indicates ISO 21/19/15 particulate contamination. What is the seizure risk?
```
