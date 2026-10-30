import { useMemo, useState } from "react";
import { useNav } from "../context/NavContext";
import { convsByProjectName } from "../data/projectChats";
import ChatMessages from "../components/ChatMessages";

const tabs = ["Overview", "Chat", "Tasks", "Knowledge", "Documents", "Notebook", "Notes", "Code", "Sandbox", "Agents", "Artifacts", "Approvals", "Contributors", "Audit", "Settings"];

const descriptions: Record<string, string> = {
  "CDU-4 Inspection Analysis": "Continuous integrity & inspection program for CDU-4: furnace tube temperatures, overhead corrosion, exchanger fouling and RBI re-scheduling.",
  "P-102 Pump Maintenance Study": "Reliability study of the P-102 feed transfer pump: vibration, seal, pressure/flow degradation, corrective WO and replacement evaluation.",
  "Vendor Technical Evaluation — CX-4": "Technical + commercial evaluation of CX-4 proposals for a P-102 replacement pump — scorecard, lifecycle NPV and award recommendation.",
  "Reformer Unit Optimization": "Yield optimization of the reformer: 12-case sensitivity matrix, firing/S-C envelope, catalyst aging and product-split levers.",
  "Pipeline Anomaly Investigation": "Investigation of anomaly #2026-AN-0312 at EP-32 flange — suspected CUI, UT confirmation, consequence assessment and interim plan.",
  "Annual Turnaround Planning 2027": "End-to-end 2027 turnaround: 1,142-item scope, critical path, long-lead spares, manpower ramp, risk register and readiness gate.",
};

const kpiDefs: Record<string, { label: string; value: string; color: string }[]> = {
  "CDU-4 Inspection Analysis": [
    { label: "Deviations", value: "2 live", color: "#DC2626" },
    { label: "Findings", value: "14", color: "#0F766E" },
    { label: "Docs indexed", value: "62 pp", color: "#2563EB" },
  ],
  "P-102 Pump Maintenance Study": [
    { label: "Risk score", value: "76 / HIGH", color: "#DC2626" },
    { label: "WO window", value: "≤ 14 days", color: "#D97706" },
    { label: "Allowance", value: "0.4 mm", color: "#0F766E" },
  ],
  "Vendor Technical Evaluation — CX-4": [
    { label: "Bids evaluated", value: "2", color: "#0F766E" },
    { label: "Selected", value: "Bid-A", color: "#2563EB" },
    { label: "Decision due", value: "18 Sep", color: "#D97706" },
  ],
  "Reformer Unit Optimization": [
    { label: "Yield uplift", value: "+1.8%", color: "#0F766E" },
    { label: "Cases", value: "12", color: "#2563EB" },
    { label: "Catalyst age", value: "3.2 yr", color: "#D97706" },
  ],
  "Pipeline Anomaly Investigation": [
    { label: "Anomaly", value: "#0312", color: "#DC2626" },
    { label: "UT value", value: "7.4 mm", color: "#D97706" },
    { label: "Recheck", value: "4 months", color: "#0F766E" },
  ],
  "Annual Turnaround Planning 2027": [
    { label: "Scope items", value: "1,142", color: "#0F766E" },
    { label: "Readiness", value: "69%", color: "#2563EB" },
    { label: "High risk", value: "9", color: "#DC2626" },
  ],
};

const ownerRoles: Record<string, string[]> = {
  "CDU-4 Inspection Analysis": ["Project Lead", "Inspection Focal", "HSE Reviewer", "Maintenance Liaison"],
  "P-102 Pump Maintenance Study": ["Project Lead", "Inspection Focal", "Operations", "Procurement"],
  "Vendor Technical Evaluation — CX-4": ["Project Lead", "Technical Lead", "Procurement Head"],
  "Reformer Unit Optimization": ["Project Lead", "Operations", "Process"],
  "Pipeline Anomaly Investigation": ["Project Lead", "Inspection", "Corridor Ops"],
  "Annual Turnaround Planning 2027": ["Project Lead", "Procurement", "HSE", "Inspection"],
};

const memberColor: Record<string, string> = {
  "Anita Rao": "#0F766E", "Rajesh Kumar": "#2563EB", "Suresh Bhat": "#7C3AED",
  "Priya Nair": "#D97706", "Meena Shetty": "#DC2626", "Arvind Rao": "#0891B2",
  "Alok Menon": "#65A30D", "Vikram Iyer": "#DB2777",
};

type ProjectTabs = {
  tasks: { id: string; name: string; assignee: string; status: string; priority: string; due: string }[];
  docs: { name: string; type: string; status: string; ver: string }[];
  knowledge: { doc: string; section: string; snippet: string; score: number }[];
  notebook: { title: string; updated: string; runs: number }[];
  notes: { title: string; type: string; updated: string }[];
  code: { file: string; lang: string; purpose: string }[];
  sandbox: { name: string; runtime: string; status: string }[];
  agents: { name: string; role: string; status: string; activity: string }[];
  artifacts: { name: string; type: string; status: string }[];
  approvals: { task: string; requestedBy: string; risk: string; status: string }[];
  audit: { actor: string; action: string; time: string; kind: string }[];
  settings: { label: string; value: string }[];
};

const projectData: Record<string, ProjectTabs> = {
  "CDU-4 Inspection Analysis": {
    tasks: [
      { id: "TSK-041", name: "Review CDU-4 inspection report deviations", assignee: "Anita Rao", status: "In Progress", priority: "High", due: "17 Sep 2026" },
      { id: "TSK-042", name: "Generate management approval note", assignee: "Document Agent", status: "Pending Approval", priority: "High", due: "17 Sep 2026" },
      { id: "TSK-043", name: "Query open maintenance records for CDU-4", assignee: "Rajesh Kumar", status: "Completed", priority: "Medium", due: "16 Sep 2026" },
      { id: "TSK-049", name: "Furnace tube temperature profile review", assignee: "Alok Menon", status: "In Progress", priority: "Medium", due: "18 Sep 2026" },
      { id: "TSK-051", name: "Re-schedule RBI for exchanger E-301", assignee: "Anita Rao", status: "Queued", priority: "Medium", due: "21 Sep 2026" },
    ],
    docs: [
      { name: "CDU-4 Inspection Report Aug 2026", type: "PDF", status: "Ready", ver: "1.0" },
      { name: "Inspection SOP – Pump P-102", type: "PDF", status: "Ready", ver: "3.2" },
      { name: "CDU-4 Maintenance Log 2026", type: "XLSX", status: "Ready", ver: "—" },
      { name: "CDU-4 Overhead Corrosion Wafers", type: "CSV", status: "Ready", ver: "1.0" },
      { name: "Inspection Findings Exchange", type: "XML", status: "Processing", ver: "0.9" },
      { name: "Furnace Tube Temperature Survey", type: "PDF", status: "Ready", ver: "2.0" },
    ],
    knowledge: [
      { doc: "APEL-INS-P102-2026", section: "P-102 Aug Inspection", snippet: "Bearing vibration DE: 8.2 mm/s — recorded 14 Aug 2026. Seal leakage observed at mechanical seal housing.", score: 0.87 },
      { doc: "APEL-SOP-ENG-241", section: "Section 4.2: Vibration Thresholds", snippet: "Bearing vibration at DE must not exceed 7.1 mm/s (peak).", score: 0.94 },
      { doc: "APEL-PRJ-CDU4-601", section: "Historical CDU-4 RBI Cases", snippet: "Prior RBI re-schedule approved 2024 for E-301 after fouling factor exceeded design.", score: 0.78 },
    ],
    notebook: [
      { title: "CDU-4 Furnace Tube Delta-T Analysis", updated: "16 Sep 2026", runs: 3 },
      { title: "Overhead Corrosion — Wafer Weights", updated: "14 Sep 2026", runs: 2 },
      { title: "RBI Re-schedule Scenario Table", updated: "12 Sep 2026", runs: 5 },
    ],
    notes: [
      { title: "CDU-4 Inspection Observations", type: "Project", updated: "16 Sep 2026" },
      { title: "Deviations — SOP vs measured", type: "Project", updated: "15 Sep 2026" },
    ],
    code: [
      { file: "furnace_delta_t.py", lang: "Python", purpose: "Furnace tube skin temperature delta-T regression" },
      { file: "corrosion_wafers.qmd", lang: "Pandas", purpose: "Wafer weight-loss trend dashboard" },
      { file: "rbi_reschedule.py", lang: "Python", purpose: "RBI re-schedule risk banding" },
    ],
    sandbox: [
      { name: "CDU-4 HVAC/SIM sandbox", runtime: "Py 3.11 · JupyterLite", status: "Running" },
      { name: "Corrosion model GPU env", runtime: "PyTorch · CUDA", status: "Idle" },
    ],
    agents: [
      { name: "Engineering Agent", role: "Furnace/thermal analysis", status: "Active", activity: "3 tasks routed this week" },
      { name: "HSE Agent", role: "Inspection deviation review", status: "Active", activity: "Approval note drafted" },
      { name: "Data Analysis Agent", role: "Corrosion & maintenance queries", status: "Idle", activity: "Last run TSK-043" },
    ],
    artifacts: [
      { name: "CDU-4 Management Approval Note", type: "Word", status: "Pending Review" },
      { name: "CDU-4 Analysis Code — vibration.py", type: "Code", status: "Verified" },
      { name: "Inspection Findings Exchange", type: "XML", status: "Pending Review" },
    ],
    approvals: [
      { task: "Generate CDU-4 management approval note", requestedBy: "Document Agent", risk: "Medium", status: "Pending" },
      { task: "Execute SQL update on maintenance schedule", requestedBy: "Data Analysis Agent", risk: "High", status: "Pending" },
      { task: "External share of inspection findings XML", requestedBy: "Anita Rao", risk: "High", status: "Rejected" },
    ],
    audit: [
      { actor: "Anita Rao", action: "Opened inspection report APEL-INS-P102-2026", time: "16 Sep 14:32", kind: "READ" },
      { actor: "Document Agent", action: "Generated approval note artifact", time: "16 Sep 14:30", kind: "GENERATE" },
      { actor: "Rajesh Kumar", action: "Updated maintenance log entry TSK-043", time: "16 Sep 11:05", kind: "UPDATE" },
      { actor: "Alok Menon", action: "Uploaded furnace tube survey PDF", time: "15 Sep 16:40", kind: "UPLOAD" },
    ],
    settings: [
      { label: "Retrieval mode", value: "BM25 + Vector + PostgreSQL" },
      { label: "Classification", value: "CONFIDENTIAL" },
      { label: "Approval policy", value: "Human review mandatory for artifacts" },
      { label: "Default agent", value: "Engineering Agent / HSE Agent" },
    ],
  },
  "P-102 Pump Maintenance Study": {
    tasks: [
      { id: "TSK-047", name: "P-102 seal leakage work order kick-off", assignee: "Rajesh Kumar", status: "Queued", priority: "High", due: "19 Sep 2026" },
      { id: "TSK-050", name: "Baseline vs current corrosion data comparison", assignee: "Vikram Iyer", status: "Queued", priority: "Low", due: "22 Sep 2026" },
      { id: "TSK-052", name: "Analyze pressure/flow degradation curve", assignee: "Rajesh Kumar", status: "In Progress", priority: "High", due: "18 Sep 2026" },
      { id: "TSK-053", name: "Evaluate replacement vs repair economics", assignee: "Anita Rao", status: "Pending Approval", priority: "Medium", due: "25 Sep 2026" },
    ],
    docs: [
      { name: "P-102 Detailed Datasheet (APEL-AS-P102-002)", type: "PDF", status: "Ready", ver: "4.2" },
      { name: "P-102 Inspection Measurements", type: "XLSX", status: "Ready", ver: "1.0" },
      { name: "P-102 Vibration Trend Jan–Aug 2026", type: "CSV", status: "Ready", ver: "—" },
      { name: "P-102 Engineering Action Memo", type: "DOCX", status: "Ready", ver: "0.1" },
      { name: "P-102 Maintenance Work Order Summary", type: "PDF", status: "Ready", ver: "A" },
      { name: "Sensor Data Schema — API Contract", type: "JSON", status: "Ready", ver: "1.2" },
    ],
    knowledge: [
      { doc: "APEL-VND-P102-501", section: "Vendor datasheet — replacement pump", snippet: "Refurbished OEM quote 8 week lead time, 92% efficiency at duty point.", score: 0.81 },
      { doc: "APEL-AS-P102-002", section: "Table 3: Operating Limits", snippet: "Design pressure 40 bar, normal 38 bar — MAWP confirmed by relief scenario RV-102.", score: 0.88 },
      { doc: "APEL-MAN-305", section: "Seal maintenance", snippet: "Mechanical seal inspection every 6 months; leakage mandates seal face replacement.", score: 0.76 },
    ],
    notebook: [
      { title: "P-102 Pressure/Flow Degradation", updated: "16 Sep 2026", runs: 4 },
      { title: "Vibration Signature Analysis", updated: "15 Sep 2026", runs: 2 },
      { title: "Corrosion Baseline Comparison", updated: "13 Sep 2026", runs: 3 },
    ],
    notes: [
      { title: "P-102 Maintenance Action Items", type: "Project", updated: "15 Sep 2026" },
      { title: "Repair vs replacement trade-off", type: "Project", updated: "14 Sep 2026" },
    ],
    code: [
      { file: "vibration_analysis.py", lang: "Python", purpose: "Vibration thresholds & anomaly detection" },
      { file: "pressure_flow_fit.qmd", lang: "Pandas", purpose: "Degradation curve fitting" },
      { file: "npt_rating.sql", lang: "SQL", purpose: "NPV / life-cycle cost scoring" },
    ],
    sandbox: [
      { name: "P-102 sensor sandbox", runtime: "Py 3.11 · Pandas", status: "Running" },
      { name: "Telemetry replay env", runtime: "TimescaleDB · Grafana", status: "Idle" },
    ],
    agents: [
      { name: "HSE/Inspection Agent", role: "Inspection deviations", status: "Active", activity: "Work order prep" },
      { name: "Data Analysis Agent", role: "Sensor trends", status: "Active", activity: "TSK-052 in progress" },
      { name: "Engineering Agent", role: "Structural assessment", status: "Idle", activity: "Last run 14 Sep" },
    ],
    artifacts: [
      { name: "P-102 Inspection Analysis Report", type: "PDF", status: "Verified" },
      { name: "P-102 Vibration Telemetry Export", type: "CSV", status: "Verified" },
      { name: "Maintenance Work Order Log", type: "TXT", status: "Verified" },
      { name: "Sensor Data Schema — API Contract", type: "JSON", status: "Completed" },
    ],
    approvals: [
      { task: "Publish P-102 vibration telemetry CSV to maintenance team", requestedBy: "Document Agent", risk: "Low", status: "Pending" },
      { task: "Publish approved sensor data schema (JSON)", requestedBy: "Document Agent", risk: "Low", status: "Approved" },
      { task: "Approve WO for seal replacement before run-time window closes", requestedBy: "Rajesh Kumar", risk: "High", status: "Pending" },
    ],
    audit: [
      { actor: "Rajesh Kumar", action: "Queried vibration dataset TSK-050", time: "16 Sep 09:12", kind: "QUERY" },
      { actor: "Document Agent", action: "Generated telemetry CSV artifact", time: "16 Sep 09:20", kind: "GENERATE" },
      { actor: "Vikram Iyer", action: "Uploaded corrosion basis CSV", time: "15 Sep 13:50", kind: "UPLOAD" },
      { actor: "Anita Rao", action: "Reviewed datasheet APEL-AS-P102-002", time: "15 Sep 10:22", kind: "READ" },
    ],
    settings: [
      { label: "Retrieval mode", value: "Vector + BM25 hybrid" },
      { label: "Classification", value: "CONFIDENTIAL" },
      { label: "Approval policy", value: "Agent actions < Low auto-routed" },
      { label: "Default agent", value: "HSE/Inspection Agent" },
    ],
  },
  "Vendor Technical Evaluation — CX-4": {
    tasks: [
      { id: "TSK-044", name: "Vendor evaluation scoring — CX-4 compressor", assignee: "Priya Nair", status: "Completed", priority: "Medium", due: "15 Sep 2026" },
      { id: "TSK-054", name: "Lifecycle NPV comparison Bid-A vs Bid-B", assignee: "Suresh Bhat", status: "In Progress", priority: "High", due: "18 Sep 2026" },
      { id: "TSK-055", name: "Commercial negotiation round II", assignee: "Priya Nair", status: "Queued", priority: "Medium", due: "20 Sep 2026" },
    ],
    docs: [
      { name: "Vendor Evaluation Report CX-4", type: "DOCX", status: "Ready", ver: "1.3" },
      { name: "Vendor CX-4 Technical Datasheet", type: "PDF", status: "Ready", ver: "2.0" },
      { name: "Bid-A Commercial Proposal", type: "XLSX", status: "Ready", ver: "1.0" },
      { name: "Bid-B Commercial Proposal", type: "XLSX", status: "Ready", ver: "1.0" },
    ],
    knowledge: [
      { doc: "APEL-VND-P102-501", section: "Vendor qualification summary", snippet: "Bid-A holds approved vendor status; Bid-B needs FAT witness prior to award.", score: 0.84 },
      { doc: "APEL-PROC-322", section: "Procurement policy $250k+", snippet: "Two-bid min + technical compliance gate before commercial evaluation.", score: 0.79 },
    ],
    notebook: [
      { title: "CX-4 Scorecard — Weighted Matrix", updated: "15 Sep 2026", runs: 2 },
      { title: "NPV Life-cycle Model", updated: "14 Sep 2026", runs: 4 },
    ],
    notes: [
      { title: "Vendor CX-4 Evaluation Notes", type: "Shared", updated: "12 Sep 2026" },
      { title: "Negotiation levers list", type: "Project", updated: "11 Sep 2026" },
    ],
    code: [
      { file: "scorecard.py", lang: "Python", purpose: "Weighted technical score computation" },
      { file: "npv_model.qmd", lang: "Pandas", purpose: "25-year life-cycle NPV" },
    ],
    sandbox: [{ name: "Evaluation model env", runtime: "Py 3.11 · openpyxl", status: "Running" }],
    agents: [
      { name: "Research Agent", role: "Market & vendor intelligence", status: "Active", activity: "NPV report drafted" },
      { name: "Document Agent", role: "Evaluation pack assembly", status: "Idle", activity: "Last run 14 Sep" },
    ],
    artifacts: [
      { name: "Vendor CX-4 Technical Evaluation", type: "Excel", status: "Completed" },
      { name: "Vendor Award Recommendation", type: "Word", status: "Pending Review" },
    ],
    approvals: [
      { task: "Share analysis report with external contractor", requestedBy: "Anita Rao", risk: "High", status: "Rejected" },
      { task: "Circulate award recommendation to steering committee", requestedBy: "Priya Nair", risk: "Medium", status: "Pending" },
    ],
    audit: [
      { actor: "Priya Nair", action: "Uploaded Bid-A commercial proposal", time: "15 Sep 11:00", kind: "UPLOAD" },
      { actor: "Research Agent", action: "Generated scorecard artifact", time: "14 Sep 16:45", kind: "GENERATE" },
      { actor: "Suresh Bhat", action: "Ran NPV model (case 3)", time: "14 Sep 13:10", kind: "RUN" },
    ],
    settings: [
      { label: "Retrieval mode", value: "Vector only" },
      { label: "Classification", value: "INTERNAL" },
      { label: "Approval policy", value: "External share requires 2 approvers" },
      { label: "Default agent", value: "Research Agent" },
    ],
  },
  "Reformer Unit Optimization": {
    tasks: [
      { id: "TSK-046", name: "Reformer catalyst performance trend analysis", assignee: "Suresh Bhat", status: "In Progress", priority: "Medium", due: "20 Sep 2026" },
      { id: "TSK-056", name: "Run 12-case firing/S-C sensitivity matrix", assignee: "Suresh Bhat", status: "Queued", priority: "Medium", due: "22 Sep 2026" },
      { id: "TSK-057", name: "Product-split lever recommendation", assignee: "Alok Menon", status: "In Progress", priority: "High", due: "19 Sep 2026" },
    ],
    docs: [
      { name: "Reformer Catalyst Loading Sheet", type: "XLSX", status: "Ready", ver: "1.0" },
      { name: "Reformate Yield Historical 2023–26", type: "CSV", status: "Ready", ver: "—" },
      { name: "Heater Box Thermocouple Map", type: "PDF", status: "Ready", ver: "2.0" },
    ],
    knowledge: [
      { doc: "APEL-MAN-302", section: "Catalyst aging model", snippet: "Activity factor decays 0.8%/yr; regeneration window every 4.5 yr.", score: 0.85 },
      { doc: "APEL-SOP-HSE-232", section: "Coil skin temp limits", snippet: "Maximum continuous skin temp 1,040 °C, peak 1,090 °C for 24h.", score: 0.82 },
    ],
    notebook: [
      { title: "Sensitivity Matrix — 12 Cases", updated: "16 Sep 2026", runs: 12 },
      { title: "Firing / Steam-Carbon Envelope", updated: "15 Sep 2026", runs: 6 },
    ],
    notes: [
      { title: "Catalyst reload decision notes", type: "Project", updated: "14 Sep 2026" },
    ],
    code: [
      { file: "sensitivity_matrix.py", lang: "Python", purpose: "Fire/S-C operating envelope" },
      { file: "yield_optimizer.qmd", lang: "SciPy", purpose: "Reformate yield uplift search" },
    ],
    sandbox: [{ name: "Reformer kinetics env", runtime: "Py 3.11 · Scipy", status: "Running" }],
    agents: [
      { name: "Data Analysis Agent", role: "Yield model runs", status: "Active", activity: "TSK-046 trending" },
      { name: "Engineering Agent", role: "Furnace limits", status: "Idle", activity: "Last run 15 Sep" },
    ],
    artifacts: [
      { name: "Reformer Block Configuration", type: "JSON", status: "Completed" },
      { name: "Yield Uplift Summary", type: "Excel", status: "Pending Review" },
    ],
    approvals: [
      { task: "Deploy reformer simulation JSON config to DCS sandbox", requestedBy: "Engineering Agent", risk: "High", status: "Pending" },
      { task: "Publish operating envelope change notice", requestedBy: "Suresh Bhat", risk: "Medium", status: "Pending" },
    ],
    audit: [
      { actor: "Suresh Bhat", action: "Ran sensitivity case #7", time: "16 Sep 10:05", kind: "RUN" },
      { actor: "Data Analysis Agent", action: "Queried catalyst aging records", time: "15 Sep 14:20", kind: "QUERY" },
      { actor: "Alok Menon", action: "Updated product-split lever table", time: "15 Sep 09:30", kind: "UPDATE" },
    ],
    settings: [
      { label: "Retrieval mode", value: "BM25 + Vector" },
      { label: "Classification", value: "CONFIDENTIAL" },
      { label: "Approval policy", value: "DCS changes require 2 approvers" },
      { label: "Default agent", value: "Data Analysis Agent" },
    ],
  },
  "Pipeline Anomaly Investigation": {
    tasks: [
      { id: "TSK-045", name: "Pipeline anomaly root cause analysis", assignee: "Meena Shetty", status: "In Progress", priority: "Critical", due: "18 Sep 2026" },
      { id: "TSK-058", name: "UT confirmation at EP-32 flange", assignee: "Rajesh Kumar", status: "In Progress", priority: "Critical", due: "17 Sep 2026" },
      { id: "TSK-059", name: "Consequence assessment & interim plan", assignee: "Meena Shetty", status: "Queued", priority: "High", due: "19 Sep 2026" },
    ],
    docs: [
      { name: "Pipeline Anomaly Report 2026-08", type: "PDF", status: "Processing", ver: "1.0" },
      { name: "EP-32 UT Scan Data", type: "XLSX", status: "Ready", ver: "1.0" },
      { name: "CUI Risk Zone Map", type: "PDF", status: "Ready", ver: "3.0" },
    ],
    knowledge: [
      { doc: "APEL-DOC-105", section: "CUI suspected location history", snippet: "EP-32 flange flagged 2019 for coating breakdown; re-inspected 2024, 7.8 mm.", score: 0.86 },
      { doc: "APEL-POL-P-102-118", section: "Interim defect policy", snippet: "Wall thickness < 8.0 mm on 24\" line requires 4-month recheck program.", score: 0.8 },
    ],
    notebook: [
      { title: "CUI Suspect Register", updated: "12 Sep 2026", runs: 2 },
      { title: "UT Grid Reconstruction", updated: "11 Sep 2026", runs: 3 },
    ],
    notes: [
      { title: "Anomaly 0312 — field notes", type: "Restricted", updated: "12 Sep 2026" },
    ],
    code: [
      { file: "ut_grid_plot.py", lang: "Python", purpose: "UT thickness grid reconstruction" },
      { file: "consequence_matrix.qmd", lang: "Pandas", purpose: "QRA consequence scoring" },
    ],
    sandbox: [{ name: "Pipeline integrity env", runtime: "Py 3.11 · GeoPandas", status: "Running" }],
    agents: [
      { name: "HSE Agent", role: "Consequence assessment", status: "Active", activity: "Interim plan drafting" },
      { name: "Document Agent", role: "Anomaly report generation", status: "Active", activity: "Pipeline report processing" },
    ],
    artifacts: [
      { name: "Pipeline Risk Assessment Q3 2026", type: "PowerPoint", status: "Completed" },
      { name: "EP-32 UT Findings Pack", type: "Excel", status: "Pending Review" },
    ],
    approvals: [
      { task: "Generate pipeline anomaly report with sensor data", requestedBy: "Engineering Agent", risk: "Low", status: "Approved" },
      { task: "Approve interim 4-month recheck plan", requestedBy: "Meena Shetty", risk: "High", status: "Pending" },
    ],
    audit: [
      { actor: "Rajesh Kumar", action: "Uploaded EP-32 UT scan data", time: "16 Sep 15:22", kind: "UPLOAD" },
      { actor: "HSE Agent", action: "Queried CUI history APEL-DOC-105", time: "12 Sep 13:00", kind: "QUERY" },
      { actor: "Meena Shetty", action: "Opened anomaly register #0312", time: "12 Sep 09:48", kind: "READ" },
    ],
    settings: [
      { label: "Retrieval mode", value: "Vector + BM25" },
      { label: "Classification", value: "RESTRICTED" },
      { label: "Approval policy", value: "Meena Shetty sole approver" },
      { label: "Default agent", value: "HSE Agent" },
    ],
  },
  "Annual Turnaround Planning 2027": {
    tasks: [
      { id: "TSK-048", name: "Long-lead spares list for 2027 turnaround", assignee: "Arvind Rao", status: "Queued", priority: "Medium", due: "24 Sep 2026" },
      { id: "TSK-060", name: "Critical path definition (P6)", assignee: "Arvind Rao", status: "In Progress", priority: "High", due: "22 Sep 2026" },
      { id: "TSK-061", name: "Manpower ramp plan sign-off", assignee: "Priya Nair", status: "Pending Approval", priority: "High", due: "25 Sep 2026" },
    ],
    docs: [
      { name: "Turnaround Work List 2027", type: "XLSX", status: "Ready", ver: "3.0" },
      { name: "Historical Turnaround 2023 Lessons", type: "PDF", status: "Ready", ver: "1.0" },
      { name: "Long-Lead Spares Register", type: "CSV", status: "Ready", ver: "1.0" },
    ],
    knowledge: [
      { doc: "APEL-HST-MNT-201", section: "2023 turnaround lessons", snippet: "Seal kits and exchanger gaskets were critical-path long-lead items — order by Dec 2026.", score: 0.83 },
      { doc: "APEL-PROC-322", section: "Procurement calendar", snippet: "90+ day lead items must be released at readiness gate 1.", score: 0.77 },
    ],
    notebook: [
      { title: "T/A Risk Register v3", updated: "15 Sep 2026", runs: 2 },
      { title: "Manpower Ramp Model", updated: "14 Sep 2026", runs: 4 },
    ],
    notes: [
      { title: "Turnaround kick-off prep", type: "Project", updated: "13 Sep 2026" },
    ],
    code: [
      { file: "critical_path.py", lang: "Python", purpose: "P6 critical path export" },
      { file: "ramp_model.qmd", lang: "Pandas", purpose: "Manpower ramp optimization" },
    ],
    sandbox: [{ name: "T/A schedule sandbox", runtime: "Py 3.11 · networkx", status: "Idle" }],
    agents: [
      { name: "Data Analysis Agent", role: "Scope & spares", status: "Active", activity: "Long-lead spares scrubbing" },
      { name: "Document Agent", role: "Turnaround pack", status: "Idle", activity: "Last run 12 Sep" },
    ],
    artifacts: [
      { name: "Turnaround Work List — 2027", type: "Excel", status: "Pending Review" },
      { name: "Readiness Gate Dashboard", type: "PowerPoint", status: "Pending Review" },
    ],
    approvals: [
      { task: "Approve turnaround work list export", requestedBy: "Arvind Rao", risk: "Medium", status: "Pending" },
      { task: "Release long-lead PO to approved vendors", requestedBy: "Priya Nair", risk: "High", status: "Pending" },
    ],
    audit: [
      { actor: "Arvind Rao", action: "Updated critical path in P6", time: "15 Sep 17:20", kind: "UPDATE" },
      { actor: "Data Analysis Agent", action: "Queried 2023 lessons APEL-HST-MNT-201", time: "15 Sep 10:00", kind: "QUERY" },
      { actor: "Priya Nair", action: "Submitted manpower ramp plan", time: "14 Sep 16:15", kind: "SUBMIT" },
    ],
    settings: [
      { label: "Retrieval mode", value: "BM25 + Vector" },
      { label: "Classification", value: "INTERNAL" },
      { label: "Approval policy", value: "Gate reviews monthly" },
      { label: "Default agent", value: "Data Analysis Agent" },
    ],
  },
};

const statusColors: Record<string, { bg: string; color: string }> = {
  "In Progress": { bg: "#DBEAFE", color: "#1D4ED8" },
  "Completed": { bg: "#DCFCE7", color: "#15803D" },
  "Pending Approval": { bg: "#FEF3C7", color: "#92400E" },
  Queued: { bg: "#F1F5F9", color: "#475569" },
  Ready: { bg: "#DCFCE7", color: "#15803D" },
  Processing: { bg: "#DBEAFE", color: "#1D4ED8" },
  Approved: { bg: "#DCFCE7", color: "#15803D" },
  Rejected: { bg: "#FEE2E2", color: "#991B1B" },
  Pending: { bg: "#FEF3C7", color: "#92400E" },
  Active: { bg: "#DCFCE7", color: "#15803D" },
  Idle: { bg: "#F1F5F9", color: "#475569" },
  Running: { bg: "#DCFCE7", color: "#15803D" },
  "Verified": { bg: "#DCFCE7", color: "#15803D" },
  "Completed": { bg: "#DCFCE7", color: "#15803D" },
};

const priorityColors: Record<string, { bg: string; color: string }> = {
  Critical: { bg: "#FEE2E2", color: "#991B1B" },
  High: { bg: "#FEF3C7", color: "#92400E" },
  Medium: { bg: "#DBEAFE", color: "#1D4ED8" },
  Low: { bg: "#F0FDF4", color: "#15803D" },
};

const riskColors: Record<string, string> = {
  Low: "#15803D", Medium: "#D97706", High: "#DC2626", Critical: "#991B1B",
};

function Chip({ label, map }: { label: string; map: Record<string, { bg: string; color: string }> }) {
  const c = map[label] || { bg: "#F1F5F9", color: "#475569" };
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-md font-medium inline-block" style={{ background: c.bg, color: c.color, fontSize: 10 }}>{label}</span>
  );
}

function SectionTitle({ title, count }: { title: string; count?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{title}</h2>
      {count && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">{count}</span>}
    </div>
  );
}

export default function ProjectDetail() {
  const { navigate, projects, currentProjectName } = useNav();
  const [activeTab, setActiveTab] = useState("Overview");
  const [activeConvId, setActiveConvId] = useState<string>("");
  const [showContributorModal, setShowContributorModal] = useState(false);

  const project = useMemo(
    () => projects.find((p) => p.name === currentProjectName) ?? projects[0],
    [projects, currentProjectName]
  );
  const convs = convsByProjectName(project?.name || "");
  const activeConv = convs.find((c) => c.id === activeConvId) ?? convs[0];
  const owner = project?.owner || "Anita Rao";
  const data: ProjectTabs = projectData[project?.name || ""] ?? projectData["CDU-4 Inspection Analysis"];

  const contributors = useMemo(() => {
    const names = new Set<string>([owner]);
    convs.forEach((c) => c.messages.forEach((m) => {
      if (m.kind === "text" && m.collab) names.add(m.author);
    }));
    (project?.contributors || []).forEach((n) => names.add(n));
    return Array.from(names);
  }, [convs, owner, project]);

  const kpis = kpiDefs[project?.name || ""] ?? [];
  const description = descriptions[project?.name || ""] ?? "";

  return (
    <div className="flex flex-col h-full" style={{ background: "#F7F9FC" }}>
      {/* Project Header */}
      <div className="bg-white border-b px-8 py-5 flex-shrink-0" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => navigate("projects")} className="text-xs" style={{ color: "var(--color-text-muted)" }}>← Projects</button>
              <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-muted)", fontSize: 10 }}>{project?.dept}</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>{project?.name}</h1>
              <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#FEF3C7", color: "#92400E", fontSize: 10 }}>🔒 {project?.cls}</span>
              <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#DBEAFE", color: "#1D4ED8", fontSize: 11 }}>{project?.status}</span>
            </div>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: "var(--color-text-muted)" }}>{description}</p>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Owner: <strong style={{ color: "var(--color-text-secondary)" }}>{project?.owner}</strong></span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Updated: <strong style={{ color: "var(--color-text-secondary)" }}>{project?.updated}</strong></span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Agents: <strong style={{ color: "var(--color-text-secondary)" }}>{project?.agents?.join(", ") || "Auto-routed"}</strong></span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Chats: <strong style={{ color: "var(--color-text-secondary)" }}>{convs.length} conversations</strong></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowContributorModal(true)} className="text-xs px-3 py-2 rounded border font-medium hover:bg-slate-50" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
              + Add Contributor
            </button>
            <button className="text-xs px-3 py-2 rounded border font-medium hover:bg-slate-50" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
              Export
            </button>
            <button onClick={() => navigate("workbench")} className="text-xs px-4 py-2 rounded font-medium text-white" style={{ background: "var(--color-teal)" }}>
              Open Workbench
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-xs" style={{ background: "var(--color-border)" }}>
            <div className="h-full rounded-full" style={{ width: `${project?.progress ?? 72}%`, background: "var(--color-teal)" }} />
          </div>
          <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>{project?.progress}% complete</span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{project?.tasks} tasks · {project?.artifacts} artifacts</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b flex-shrink-0 overflow-x-auto" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex px-8">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-3 text-xs font-medium border-b-2 transition-colors flex-shrink-0"
              style={{
                borderBottomColor: activeTab === tab ? "var(--color-teal)" : "transparent",
                color: activeTab === tab ? "var(--color-teal)" : "var(--color-text-muted)",
                fontSize: 12,
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {activeTab === "Overview" && (
          <div className="max-w-4xl grid grid-cols-3 gap-5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="bg-white rounded border px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
                <div className="text-xs mb-1" style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{kpi.label}</div>
                <div className="text-xl font-semibold" style={{ color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
            <div className="col-span-3 bg-white rounded border" style={{ borderColor: "var(--color-border)" }}>
              <div className="px-5 py-3.5 border-b font-semibold text-sm flex items-center justify-between" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
                Recent Activity
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">{convs.length} chats tracked</span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {convs.slice(0, 5).map((c, i) => (
                  <button key={c.id} onClick={() => { setActiveConvId(c.id); setActiveTab("Chat"); }} className="w-full text-left flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5" style={{ background: "#F0FDFA", color: "var(--color-teal)" }}>
                      {c.id.replace(/\d/g, "§")[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: "var(--color-text-primary)", fontSize: 12 }}>{c.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>{c.messages.length} msgs</span>
                      </div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{c.preview}</div>
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>{c.time}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "Chat" && (
          <div className="max-w-5xl">
            <div className="flex gap-6">
              <div className="w-64 flex-shrink-0 space-y-1">
                <div className="text-xs font-bold text-slate-900 tracking-wider uppercase px-2 mb-2">Conversations</div>
                {convs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveConvId(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${activeConv?.id === c.id ? "bg-teal-50 border border-teal-200" : "hover:bg-slate-50 border border-transparent"}`}
                  >
                    <div className={`text-sm truncate ${activeConv?.id === c.id ? "text-teal-900 font-semibold" : "text-slate-700"}`}>{c.title}</div>
                    <div className="text-[11px] text-slate-900 truncate">{c.preview}</div>
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-0 bg-white rounded-2xl border p-6" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center justify-between mb-4 pb-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                  <div>
                    <div className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{activeConv?.title}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{activeConv?.time} · {activeConv?.messages.length} messages</div>
                  </div>
                  <button onClick={() => navigate("workbench")} className="text-xs px-3 py-2 rounded font-medium text-white" style={{ background: "var(--color-teal)" }}>
                    Continue in Workbench
                  </button>
                </div>
                <ChatMessages messages={activeConv ? activeConv.messages : []} />
                <div className="mt-6 pt-4 text-[10px]" style={{ color: "var(--color-text-muted)", borderTop: "1px dashed var(--color-border)" }}>
                  Simulated project conversation — values are demo data for the walkthrough.
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Tasks" && (
          <div className="max-w-5xl">
            <SectionTitle title="Project Tasks" count={`${data.tasks.length} tasks`} />
            <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {["ID", "Task", "Assignee", "Priority", "Status", "Due"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.tasks.map((t, i) => (
                    <tr key={t.id} className="hover:bg-slate-50" style={{ borderBottom: i < data.tasks.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                      <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{t.id}</td>
                      <td className="px-5 py-3 text-sm max-w-sm" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{t.name}</td>
                      <td className="px-5 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>{t.assignee}</td>
                      <td className="px-5 py-3"><Chip label={t.priority} map={priorityColors} /></td>
                      <td className="px-5 py-3"><Chip label={t.status} map={statusColors} /></td>
                      <td className="px-5 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>{t.due}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Knowledge" && (
          <div className="max-w-4xl">
            <SectionTitle title="RAG Knowledge — Remote Queries" count="MRPL_knowledge" />
            <div className="space-y-3">
              {data.knowledge.map((k, i) => (
                <div key={i} className="bg-white rounded border px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold mt-0.5" style={{ color: "var(--color-teal)", minWidth: 20 }}>#{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{k.doc}</span>
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>· {k.section}</span>
                        <span className="text-xs font-medium ml-auto" style={{ color: "var(--color-teal)" }}>Score: {k.score}</span>
                      </div>
                      <p className="text-sm mt-1.5" style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>{k.snippet}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Documents" && (
          <div className="max-w-4xl">
            <SectionTitle title="Project Documents" count={`${data.docs.length} docs`} />
            <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {["Document", "Type", "Version", "Status", ""].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.docs.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-50" style={{ borderBottom: i < data.docs.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-sm max-w-md" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{d.name}</div>
                      </td>
                      <td className="px-5 py-3"><span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-secondary)", fontSize: 11 }}>{d.type}</span></td>
                      <td className="px-5 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>v{d.ver}</td>
                      <td className="px-5 py-3"><Chip label={d.status} map={statusColors} /></td>
                      <td className="px-5 py-3">
                        <button className="text-xs px-2 py-1 rounded border hover:bg-slate-100" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", fontSize: 11 }}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Notebook" && (
          <div className="max-w-4xl">
            <SectionTitle title="Analysis Notebooks" count={`${data.notebook.length} notebooks`} />
            <div className="grid grid-cols-2 gap-4">
              {data.notebook.map((nb, i) => (
                <div key={i} className="bg-white rounded border px-5 py-4 hover:shadow-sm transition-shadow" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-teal-700 bg-teal-50 border border-teal-100" style={{ fontSize: 12, fontWeight: 600 }}>◉</div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">{nb.runs} runs</span>
                  </div>
                  <div className="font-semibold text-sm mt-3" style={{ color: "var(--color-text-primary)" }}>{nb.title}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Updated {nb.updated}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Notes" && (
          <div className="max-w-4xl">
            <SectionTitle title="Project Notes" count={`${data.notes.length} notes`} />
            <div className="space-y-3">
              {data.notes.map((n, i) => (
                <div key={i} className="bg-white rounded border px-5 py-4 hover:shadow-sm transition-shadow" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>{n.title}</div>
                    <Chip label={n.type} map={{ Project: { bg: "#CCFBF1", color: "#0F766E" }, Shared: { bg: "#DBEAFE", color: "#1D4ED8" }, Restricted: { bg: "#FEE2E2", color: "#991B1B" } }} />
                  </div>
                  <div className="text-xs mt-1.5" style={{ color: "var(--color-text-muted)" }}>Updated {n.updated} · PERSONAL_PLUS_PROJECT scope</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Code" && (
          <div className="max-w-4xl">
            <SectionTitle title="Project Code" count={`${data.code.length} files`} />
            <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              {data.code.map((c, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50" style={{ borderBottom: i < data.code.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-900 text-emerald-400" style={{ fontSize: 11 }}>&lt;/&gt;</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{c.file}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{c.purpose}</div>
                  </div>
                  <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>{c.lang}</span>
                  <button className="text-xs px-2.5 py-1.5 rounded border font-medium hover:bg-slate-50" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Open</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Sandbox" && (
          <div className="max-w-4xl">
            <SectionTitle title="Compute Sandboxes" count={`${data.sandbox.length} environments`} />
            <div className="grid grid-cols-2 gap-4">
              {data.sandbox.map((s, i) => (
                <div key={i} className="bg-white rounded border px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.status === "Running" ? "#15803D" : "#94A3B8" }}></div>
                    <Chip label={s.status} map={statusColors} />
                  </div>
                  <div className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{s.name}</div>
                  <div className="text-xs mt-1 font-mono" style={{ color: "var(--color-text-muted)" }}>{s.runtime}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Agents" && (
          <div className="max-w-4xl">
            <SectionTitle title="Assigned Agents" count={`${data.agents.length} agents`} />
            <div className="space-y-3">
              {data.agents.map((a, i) => (
                <div key={i} className="bg-white rounded border px-5 py-4 flex items-center gap-4" style={{ borderColor: "var(--color-border)" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: "var(--color-teal)" }}>◎</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{a.name}</span>
                      <Chip label={a.status} map={statusColors} />
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{a.role} · {a.activity}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Artifacts" && (
          <div className="max-w-4xl">
            <SectionTitle title="Artifacts" count={`${data.artifacts.length} generated`} />
            <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              {data.artifacts.map((a, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50" style={{ borderBottom: i < data.artifacts.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-800" style={{ fontSize: 11 }}>⬚</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>{a.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{a.type}</div>
                  </div>
                  <Chip label={a.status} map={statusColors} />
                  <button className="text-xs px-2.5 py-1.5 rounded border font-medium hover:bg-slate-50" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>View</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Approvals" && (
          <div className="max-w-4xl">
            <SectionTitle title="Approval Requests" count={`${data.approvals.length} requests`} />
            <div className="space-y-3">
              {data.approvals.map((a, i) => (
                <div key={i} className="bg-white rounded border px-5 py-4 flex items-center gap-4" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>{a.task}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Requested by {a.requestedBy}</div>
                  </div>
                  <span className="text-xs font-bold" style={{ color: riskColors[a.risk] || "#475569" }}>{a.risk}</span>
                  <Chip label={a.status} map={statusColors} />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Contributors" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Project Contributors</h2>
              <button onClick={() => setShowContributorModal(true)} className="text-xs px-3 py-2 rounded font-medium text-white" style={{ background: "var(--color-teal)" }}>
                + Add Contributor
              </button>
            </div>
            <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              {contributors.map((c, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ background: memberColor[c] || "var(--color-teal)", color: "white" }}>
                    {c.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>{c} {c === owner && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold ml-1" style={{ background: "#FEF3C7", color: "#92400E" }}>OWNER</span>}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{ownerRoles[project?.name || ""]?.[i] || "Contributor"}</div>
                  </div>
                  <div className="text-xs px-2 py-1 rounded font-medium" style={{ background: "#EFF6FF", color: "var(--color-blue)" }}>{c === owner ? "Administrator" : "Contributor"}</div>
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#FEF3C7", color: "#92400E", fontSize: 10 }}>{project?.cls}</span>
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Since Sep 2026</span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: "var(--color-text-muted)" }}>
              Contributors share project context in the Workbench and Project Chat. Access is governed by project RBAC.
            </p>
          </div>
        )}

        {activeTab === "Audit" && (
          <div className="max-w-4xl">
            <SectionTitle title="Audit Trail" count={`${data.audit.length} events`} />
            <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              {data.audit.map((e, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50" style={{ borderBottom: i < data.audit.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border flex-shrink-0" style={{ background: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE", fontSize: 9 }}>{e.kind}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>{e.actor}</span>
                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}> · {e.action}</span>
                  </div>
                  <span className="text-xs text-slate-900 flex-shrink-0">{e.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Settings" && (
          <div className="max-w-2xl">
            <SectionTitle title="Project Settings" />
            <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              {data.settings.map((s, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-4" style={{ borderBottom: i < data.settings.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <div className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>{s.label}</div>
                  <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Contributor Modal */}
      {showContributorModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" style={{ border: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
              <h3 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Add Contributor</h3>
              <button onClick={() => setShowContributorModal(false)} style={{ color: "var(--color-text-muted)" }}>✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Search User</label>
                <input type="text" placeholder="Search MRPL users..." className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: "var(--color-border)" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Project Role</label>
                  <select className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: "var(--color-border)" }}>
                    {["Viewer", "Contributor", "Analyst", "Project Manager", "Approver", "Administrator"].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Access Level</label>
                  <select className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: "var(--color-border)" }}>
                    {["Public", "Internal", "Confidential", "Restricted"].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t" style={{ borderColor: "var(--color-border)" }}>
              <button onClick={() => setShowContributorModal(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Cancel</button>
              <button className="flex-1 py-2 text-sm rounded font-medium text-white" style={{ background: "var(--color-teal)" }}>Add Contributor</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}