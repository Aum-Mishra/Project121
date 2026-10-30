export type SeriesPoint = { x: string; y: number };

export type TrendSeries = {
  id: string;
  name: string;
  color: string;
  unit: string;
  points: SeriesPoint[];
};

export type ChartDef = {
  id: string;
  title: string;
  xLabel: string;
  yLabel: string;
  unit: string;
  threshold?: { value: number; label: string };
  alarm?: { value: number; label: string };
  series: TrendSeries[];
  anomalyPoints?: { x: string; label: string }[];
  minWall?: { value: number; label: string };
  insight: string;
};

export const DEMO_NOTICE =
  "Demonstration data set — simulated values for a demo walkthrough, not actual plant measurements.";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

export const vibDE = [5.9, 6.1, 6.4, 6.7, 7.0, 7.3, 7.8, 8.2];
export const vibNDE = [4.8, 5.0, 5.2, 5.4, 5.7, 5.9, 6.2, 6.6];
export const tempDE = [62, 64, 66, 68, 71, 74, 77, 79];
export const tempNDE = [58, 59, 60, 61, 63, 65, 67, 69];
export const discharge = [8.9, 8.8, 8.7, 8.6, 8.4, 8.3, 8.1, 7.9];
export const suction = [1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2];
export const flow = [315, 313, 311, 309, 307, 305, 303, 301];
export const powerKW = [22.0, 22.3, 22.7, 23.0, 23.2, 23.6, 23.9, 24.3];
export const thicknessYrs = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];
export const thicknessMM = [9.8, 9.7, 9.6, 9.5, 9.3, 9.1, 8.9, 8.6];

export const P102 = {
  tag: "P-102",
  asset: "P-102 Feed Transfer Pump (CDU-4)",
  vibrationThreshold: 7.1,
  vibrationAlarm: 8.5,
  tempAlarm: 82,
  tempTrip: 90,
  dischargeMin: 8.0,
  dischargeMax: 9.5,
  flowDesign: 320,
  flowMin: 290,
  minWall: 8.2,
  currentVibDE: 8.2,
  currentVibNDE: 6.6,
  currentTempDE: 79,
  currentTempNDE: 69,
  currentDischarge: 7.9,
  currentFlow: 301,
  currentPower: 24.3,
  sealLeak: "Weep observed at mechanical seal on 18 Aug 2026 (~4–6 drops/min).",
};

export const toPoints = (values: number[], labels = MONTHS): SeriesPoint[] =>
  values.map((y, i) => ({ x: labels[i] ?? `P${i + 1}`, y }));

export const charts: ChartDef[] = [
  {
    id: "vibration-trend",
    title: "P-102 DE / NDE Bearing Vibration — Jan–Aug 2026",
    xLabel: "Month",
    yLabel: "Vibration",
    unit: "mm/s",
    threshold: { value: P102.vibrationThreshold, label: "SOP limit 7.1 mm/s" },
    series: [
      { id: "de", name: "DE bearing (drive end)", color: "#E11D48", unit: "mm/s", points: toPoints(vibDE) },
      { id: "nde", name: "NDE bearing (non-drive end)", color: "#2563EB", unit: "mm/s", points: toPoints(vibNDE) },
    ],
    anomalyPoints: [
      { x: "Jun", label: "Exceeds SOP (7.3 > 7.1)" },
      { x: "Aug", label: "Current 8.2 mm/s — critical" },
    ],
    insight:
      "DE vibration first crossed the 7.1 mm/s SOP limit in June and reached 8.2 mm/s in Aug 2026 (+15.5% above limit).",
  },
  {
    id: "temperature-trend",
    title: "P-102 DE Bearing Temperature — Jan–Aug 2026",
    xLabel: "Month",
    yLabel: "Temperature",
    unit: "°C",
    alarm: { value: P102.tempAlarm, label: "Alarm 82 °C" },
    series: [
      { id: "temp-de", name: "DE bearing temp", color: "#D97706", unit: "°C", points: toPoints(tempDE) },
      { id: "temp-nde", name: "NDE bearing temp", color: "#7C3AED", unit: "°C", points: toPoints(tempNDE) },
    ],
    anomalyPoints: [{ x: "Aug", label: "79 °C — approaching 82 °C alarm" }],
    insight:
      "DE bearing temperature rose from 62 °C (Jan) to 79 °C (Aug). Still below the 82 °C alarm but trending +17 °C over 8 months.",
  },
  {
    id: "pressure-flow",
    title: "P-102 Discharge Pressure & Flow — Jan–Aug 2026",
    xLabel: "Month",
    yLabel: "Pressure / Flow",
    unit: "kg/cm²",
    alarm: { value: P102.dischargeMin, label: "Min discharge 8.0 kg/cm²" },
    series: [
      { id: "disch", name: "Discharge pressure", color: "#0891B2", unit: "kg/cm²", points: toPoints(discharge) },
      { id: "flow", name: "Flow rate", color: "#65A30D", unit: "m³/h", points: toPoints(flow) },
    ],
    anomalyPoints: [
      { x: "Aug", label: "Discharge 7.9 kg/cm² below min 8.0" },
      { x: "Aug", label: "Flow 301 m³/h (−6% vs design)" },
    ],
    insight:
      "Discharge pressure trended from 8.9 to 7.9 kg/cm² (below the 8.0 kg/cm² instruction limit in Aug) while flow dropped to 301 m³/h.",
  },
  {
    id: "corrosion-trend",
    title: "P-102 Casing Wall Thickness (UT) — 2019–2026",
    xLabel: "Year",
    yLabel: "Wall thickness",
    unit: "mm",
    minWall: { value: P102.minWall, label: "Min required 8.2 mm" },
    series: [
      { id: "thick", name: "Casing wall thickness", color: "#4F46E5", unit: "mm", points: thicknessYrs.map((y, i) => ({ x: y, y: thicknessMM[i] })) },
    ],
    insight:
      "Wall thickness reduced from 9.8 mm (2019) to 8.6 mm (2026). Remaining corrosion allowance ≈ 0.4 mm; next UT interval shortened.",
  },
  {
    id: "baseline-current",
    title: "P-102 Baseline (new condition 2024) vs Current (Aug 2026)",
    xLabel: "Parameter",
    yLabel: "Measured",
    unit: "varies",
    series: [
      { id: "base", name: "Baseline", color: "#0EA5E9", unit: "varies",
        points: [
          { x: "DE vib", y: 4.2 }, { x: "NDE vib", y: 3.6 }, { x: "DE temp", y: 58 },
          { x: "Discharge", y: 9.2 }, { x: "Flow", y: 318 }, { x: "Power", y: 21.5 },
        ] },
      { id: "curr", name: "Current", color: "#E11D48", unit: "varies",
        points: [
          { x: "DE vib", y: 8.2 }, { x: "NDE vib", y: 6.6 }, { x: "DE temp", y: 79 },
          { x: "Discharge", y: 7.9 }, { x: "Flow", y: 301 }, { x: "Power", y: 24.3 },
        ] },
    ],
    insight:
      "DE vibration has doubled vs baseline (4.2 → 8.2 mm/s) and discharge pressure dropped (9.2 → 7.9 kg/cm²) — signs of degradation.",
  },
  {
    id: "history",
    title: "P-102 DE Bearing Vibration — Annual Comparison 2023–2026",
    xLabel: "Year",
    yLabel: "Average / Max",
    unit: "mm/s",
    threshold: { value: P102.vibrationThreshold, label: "SOP limit 7.1 mm/s" },
    series: [
      { id: "avg", name: "Annual avg (DE)", color: "#2563EB", unit: "mm/s",
        points: [
          { x: "2023", y: 4.6 }, { x: "2024", y: 5.4 }, { x: "2025", y: 6.8 }, { x: "2026", y: 7.6 },
        ] },
      { id: "max", name: "Annual max (DE)", color: "#E11D48", unit: "mm/s",
        points: [
          { x: "2023", y: 5.1 }, { x: "2024", y: 6.0 }, { x: "2025", y: 7.4 }, { x: "2026", y: 8.2 },
        ] },
    ],
    insight:
      "Progressive year-on-year rise: annual max 5.1 → 8.2 mm/s (2023–2026). Consistency fits a mechanical-degradation hypothesis.",
  },
  {
    id: "levels-24-26",
    title: "Pressure, Corrosion, and Vibration Levels (2024–2026)",
    xLabel: "Year",
    yLabel: "Level",
    unit: "varies",
    series: [
      { id: "pressure", name: "Pressure (bar)", color: "#0EA5E9", unit: "bar",
        points: [{ x: "2024", y: 34.0 }, { x: "2025", y: 37.0 }, { x: "2026", y: 42.0 }] },
      { id: "corrosion", name: "Corrosion (mm)", color: "#F59E0B", unit: "mm",
        points: [{ x: "2024", y: 1.2 }, { x: "2025", y: 2.4 }, { x: "2026", y: 3.8 }] },
      { id: "vibration", name: "Vibration (mm/s)", color: "#E11D48", unit: "mm/s",
        points: [{ x: "2024", y: 4.1 }, { x: "2025", y: 5.3 }, { x: "2026", y: 7.2 }] },
    ],
    insight: "All three monitored parameters exhibit a progressive year-on-year increase from 2024 to 2026."
  },
  {
    id: "pressure-changes",
    title: "Pressure Changes Over Years",
    xLabel: "Year",
    yLabel: "Pressure (bar)",
    unit: "bar",
    series: [
      { id: "pressure", name: "Pressure", color: "#0EA5E9", unit: "bar",
        points: [{ x: "2024", y: 34.0 }, { x: "2025", y: 37.0 }, { x: "2026", y: 42.0 }] },
    ],
    threshold: { value: 35.0, label: "Max 35.0 bar" },
    insight: "Pressure exceeded maximum allowable operating limit of 35.0 bar in 2025 and 2026."
  },
  {
    id: "corrosion-changes",
    title: "Corrosion Changes Over Years",
    xLabel: "Year",
    yLabel: "Corrosion (mm)",
    unit: "mm",
    series: [
      { id: "corrosion", name: "Corrosion", color: "#F59E0B", unit: "mm",
        points: [{ x: "2024", y: 1.2 }, { x: "2025", y: 2.4 }, { x: "2026", y: 3.8 }] },
    ],
    insight: "Accelerated corrosion rate observed, reaching 3.8 mm by 2026."
  },
  {
    id: "vibration-changes",
    title: "Vibration Changes Over Years",
    xLabel: "Year",
    yLabel: "Vibration (mm/s)",
    unit: "mm/s",
    series: [
      { id: "vibration", name: "Vibration", color: "#E11D48", unit: "mm/s",
        points: [{ x: "2024", y: 4.1 }, { x: "2025", y: 5.3 }, { x: "2026", y: 7.2 }] },
    ],
    threshold: { value: 7.1, label: "Limit 7.1 mm/s" },
    insight: "Vibration levels crossed the critical threshold of 7.1 mm/s in 2026."
  },
];

export const chartById = (id: string): ChartDef | undefined => charts.find((c) => c.id === id);

export type SourceDoc = {
  id: string;
  title: string;
  version?: string;
  dept?: string;
  method?: string;
  match?: number;
};

export const sources: SourceDoc[] = [
  { id: "sop", title: "Inspection SOP – Pump P-102", version: "3.2", dept: "Maintenance Eng.", method: "BM25 + Vector", match: 0.94 },
  { id: "insp2608", title: "P-102 Inspection Report (Aug 2026)", version: "1.0", dept: "Inspection Eng.", method: "Vector", match: 0.97 },
  { id: "insp2507", title: "P-102 Inspection Report (Jul 2025)", version: "1.4", dept: "Inspection Eng.", method: "BM25", match: 0.88 },
  { id: "vlimit", title: "MRPL Equipment Vibration Limits", version: "2.1", dept: "Inspection Eng.", method: "BM25", match: 0.82 },
  { id: "mainlog", title: "CDU-4 Maintenance Log 2026", version: "—", dept: "Operations", method: "Vector", match: 0.87 },
  { id: "datasheet", title: "P-102 Pump Datasheet / Design", version: "4.0", dept: "Mechanical Eng.", method: "BM25", match: 0.79 },
  { id: "vendor", title: "Vendor Technical Evaluation – CX-4", version: "1.3", dept: "Procurement", method: "BM25 + Vector", match: 0.91 },
  { id: "risk", title: "P-102 Reliability Risk Assessment", version: "1.0", dept: "Inspection Eng.", method: "Vector", match: 0.85 },
];

export const sourceById = (id: string): SourceDoc | undefined => sources.find((s) => s.id === id);

export type DemoFile = {
  id: string;
  name: string;
  type: "PDF" | "DOCX" | "XLSX" | "CSV";
  size: string;
  blurb: string;
};

export const files: DemoFile[] = [
  { id: "insp-aug26", name: "P-102 Inspection Report – Aug 2026", type: "PDF", size: "3.4 MB", blurb: "47-page inspection report: vibration, temperature, seal, UT thickness and deviations." },
  { id: "data-xlsx", name: "P-102 Inspection Measurements", type: "XLSX", size: "0.2 MB", blurb: "Sheet 1 — Aug 2026 readings; Sheet 2 — Jan–Aug 2026 monthly trends." },
  { id: "trend-csv", name: "P-102 Vibration Trend Jan–Aug 2026", type: "CSV", size: "0.01 MB", blurb: "Monthly DE/NDE vibration series used for trend analysis (mm/s)." },
  { id: "memo-docx", name: "P-102 Inspection and Risk Assessment Report", type: "DOCX", size: "0.6 MB", blurb: "Draft engineering action memo: findings, priority and responsible owners." },
  { id: "wo-summary", name: "P-102 Maintenance Work Order Summary", type: "PDF", size: "1.1 MB", blurb: "Work order scope, material list and schedule for the corrective maintenance." },
  { id: "cx4-xlsx", name: "CX-4 Vendor Comparison", type: "XLSX", size: "0.3 MB", blurb: "Scorecard comparing CX-4 vendor proposals for a P-102 replacement pump." },
  { id: "anomaly-pdf", name: "P-102 Anomaly Brief – Seal Leakage", type: "PDF", size: "0.8 MB", blurb: "Anomaly brief for the mechanical seal weep observed on 18 Aug 2026." },
  { id: "insp-jul25", name: "P-102 Inspection Report – Jul 2025", type: "PDF", size: "3.1 MB", blurb: "Previous-year inspection report (historical baseline for comparison)." },
  { id: "cdu4-report", name: "CDU-4 Inspection Report – Sep 2026", type: "PDF", size: "5.2 MB", blurb: "Unit-level inspection summary: furnace tube skin temps, overhead corrosion and exchanger fouling findings." },
  { id: "cdu4-memo", name: "CDU-4 Management Approval Note", type: "DOCX", size: "0.4 MB", blurb: "Approval note listing the two live deviations and the proposed corrective scope for management sign-off." },
  { id: "reformer-cases", name: "Reformer Optimization Case Matrix", type: "XLSX", size: "0.5 MB", blurb: "12-case matrix of reformer operating envelopes with yield, firing and pressure-drop sensitivities." },
  { id: "pipeline-digest", name: "Pipeline Anomaly Digest – EP-32", type: "PDF", size: "1.4 MB", blurb: "Anomaly digest for the suspected corrosion-under-insulation at EP-32 flange (CUI, UT confirmatory)." },
  { id: "ta-scope", name: "2027 TA Scope Register", type: "XLSX", size: "0.9 MB", blurb: "1,142-item scope register for the 2027 annual turnaround with 9 high-risk flagged items." },
  { id: "ta-schedule", name: "2027 TA Critical Path Schedule", type: "PDF", size: "2.1 MB", blurb: "21-day turnaround critical path: reformer furnace + P-102 replacement slot and manpower plan." },
  { id: "hr-onboarding", name: "HR Onboarding Tracker FY27", type: "XLSX", size: "0.3 MB", blurb: "FY27 onboarding tracker: 42 new hires, module completion and 30/60/90 gates." },
  { id: "hr-training", name: "HR Training Plan 2026-27", type: "PDF", size: "1.2 MB", blurb: "Annual training plan: compliance refreshers, upskilling courses and seat allocation." },
  { id: "hr-review", name: "HR Appraisal Cycle Q3", type: "DOCX", size: "0.7 MB", blurb: "Q3 appraisal cycle pack: goal entry status, calibration schedule and PIP register." },
  { id: "hr-skills", name: "HR Skills Matrix", type: "XLSX", size: "0.4 MB", blurb: "Department-wise skill matrix with coverage vs target and identified gaps." },
];

export const fileById = (id: string): DemoFile | undefined => files.find((f) => f.id === id);

export const isHRFile = (id: string): boolean => ["hr-onboarding", "hr-training", "hr-review", "hr-skills"].includes(id);
