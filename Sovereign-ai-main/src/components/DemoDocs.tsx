import { useState } from "react";
import { fileById, DemoFile, DEMO_NOTICE, vibDE, vibNDE, discharge, flow, tempDE } from "../data/demoCore";

type DocSection = {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { caption?: string; headers: string[]; rows: string[][] };
};

type DocContent = {
  title: string;
  subtitle?: string;
  meta: [string, string][];
  sections: DocSection[];
};

const typeColor: Record<DemoFile["type"], string> = {
  PDF: "#DC2626",
  DOCX: "#2563EB",
  XLSX: "#059669",
  CSV: "#7C3AED",
};

const typeBg: Record<DemoFile["type"], string> = {
  PDF: "#FEE2E2",
  DOCX: "#DBEAFE",
  XLSX: "#D1FAE5",
  CSV: "#EDE9FE",
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

function buildContent(file: DemoFile): DocContent {
  const base: DocSection[] = [
    {
      paragraphs: [
        "This is a simulated, demonstration version of the referenced plant document. Values shown (e.g., P-102 DE vibration 8.2 mm/s vs 7.1 mm/s SOP limit, seal weep from 18 Aug 2026) are the consistent demo dataset used across the walkthrough and do not represent actual measurements.",
      ],
    },
  ];
  const meta: [string, string][] = [
    ["Doc-Ref", file.id.toUpperCase()],
    ["Classification", "CONFIDENTIAL"],
    ["Status", "Approved"],
    ["Owner", "Inspection Engineering"],
  ];

  switch (file.id) {
    case "insp-aug26":
      return {
        title: "P-102 Inspection Report",
        subtitle: "Feed Transfer Pump · CDU-4 · Inspection campaign Aug 2026 · Rev 1.0 · 47 pages",
        meta: [...meta, ["Date", "18 Aug 2026"], ["Inspector", "Rajesh Kumar"]],
        sections: [
          {
            heading: "1. Equipment",
            paragraphs: ["P-102 Feed Transfer Pump (single-train duty), API 610 BB1, design 320 m³/h @ 9.2 kg/cm²."],
          },
          {
            heading: "2. Findings Summary",
            table: {
              caption: "Key inspection readings vs limits",
              headers: ["Parameter", "Reading", "Limit", "Status"],
              rows: [
                ["DE bearing vibration", "8.2 mm/s", "7.1 mm/s", "EXCEEDS"],
                ["NDE bearing vibration", "6.6 mm/s", "7.1 mm/s", "OK"],
                ["DE bearing temperature", "79 °C", "82 °C alarm", "WATCH"],
                ["Discharge pressure", "7.9 kg/cm²", "8.0 kg/cm² min", "BELOW"],
                ["Flow rate", "301 m³/h", "320 m³/h design", "LOW"],
                ["Mechanical seal", "Weeping", "No leakage", "DEFECT"],
              ],
            },
          },
          {
            heading: "3. Deviations & Recommended Actions",
            bullets: [
              "DE vibration above SOP action limit since Jun 2026 — raise corrective WO within 14 days.",
              "Mechanical seal weep (4–6 drops/min) observed 18 Aug 2026; 6-monthly seal inspection 8 days overdue.",
              "Discharge pressure 0.1 kg/cm² below instruction minimum — watch item.",
              "UT casing worst point 8.6 mm vs 8.2 mm min; reduce recheck interval to ≤ 6 months.",
            ],
          },
          ...base,
        ],
      };
    case "insp-jul25":
      return {
        title: "P-102 Inspection Report",
        subtitle: "Feed Transfer Pump · CDU-4 · Inspection campaign Jul 2025 · Rev 1.4 · 44 pages",
        meta: [...meta, ["Date", "21 Jul 2025"], ["Inspector", "Rajesh Kumar"]],
        sections: [
          {
            heading: "1. Findings Summary",
            table: {
              caption: "Key inspection readings vs limits (Jul 2025)",
              headers: ["Parameter", "Reading", "Limit", "Status"],
              rows: [
                ["DE bearing vibration", "7.4 mm/s", "7.1 mm/s", "EXCEEDS"],
                ["NDE bearing vibration", "6.1 mm/s", "7.1 mm/s", "OK"],
                ["DE bearing temperature", "75 °C", "82 °C alarm", "WATCH"],
                ["Discharge pressure", "8.3 kg/cm²", "8.0 kg/cm² min", "OK"],
                ["Mechanical seal", "Slight seep", "No leakage", "MONITOR"],
              ],
            },
          },
          {
            heading: "2. History Note",
            paragraphs: [
              "2025 report already flagged a near-limit DE vibration (7.4 mm/s) and recommended a condition-monitoring repeat within 6 months. The Aug 2026 campaign confirms continued degradation to 8.2 mm/s.",
            ],
          },
          ...base,
        ],
      };
    case "data-xlsx":
      return {
        title: "P-102 Inspection Measurements",
        subtitle: "Workbook · Sheet1 'Aug-2026 snapshot' · Sheet2 'Monthly trends Jan–Aug 2026'",
        meta: [...meta, ["Format", "XLSX"]],
        sections: [
          {
            heading: "Sheet 1 — Aug 2026 snapshot",
            table: {
              headers: ["Parameter", "Unit", "Value"],
              rows: [
                ["DE bearing vibration", "mm/s", "8.2"],
                ["NDE bearing vibration", "mm/s", "6.6"],
                ["DE bearing temperature", "°C", "79"],
                ["Discharge pressure", "kg/cm²", "7.9"],
                ["Suction pressure", "kg/cm²", "1.2"],
                ["Flow rate", "m³/h", "301"],
                ["Power draw", "kW", "24.3"],
                ["Casing wall thickness", "mm", "8.6"],
              ],
            },
          },
          {
            heading: "Sheet 2 — Monthly trends (mm/s / °C / kg/cm² / m³/h)",
            table: {
              headers: ["Month", "DE vib", "NDE vib", "DE temp", "Discharge", "Flow"],
              rows: months.map((m, i) => [m, vibDE[i].toFixed(1), vibNDE[i].toFixed(1), tempDE[i], discharge[i].toFixed(1), flow[i]]),
            },
          },
          ...base,
        ],
      };
    case "trend-csv":
      return {
        title: "P-102 Vibration Trend Jan–Aug 2026",
        subtitle: "CSV · columns: month, DE bearing mm/s, NDE bearing mm/s, status",
        meta: [...meta, ["Rows", "8"]],
        sections: [
          {
            heading: "Preview (full file available on download)",
            table: {
              headers: ["month", "de_bearing_mms", "nde_bearing_mms", "status"],
              rows: months.map((m, i) => [m, vibDE[i].toFixed(1), vibNDE[i].toFixed(1), vibDE[i] > 7.1 ? "above_limit" : vibDE[i] >= 7.0 ? "watch" : "normal"]),
            },
          },
          ...base,
        ],
      };
    case "memo-docx":
      return {
        title: "Engineering Action Memo",
        subtitle: "P-102 Feed Transfer Pump — Corrective Action (Aug 2026 inspection)",
        meta: [...meta, ["Date", "16 Sep 2026"], ["To", "Maintenance & Inspection"]],
        sections: [
          {
            heading: "1. Subject",
            paragraphs: ["P-102 Feed Transfer Pump — corrective action arising from the Aug 2026 inspection campaign."],
          },
          {
            heading: "2. Findings",
            bullets: [
              "DE bearing vibration 8.2 mm/s vs 7.1 mm/s SOP action limit (in action band since Jun 2026).",
              "Mechanical seal weeping since 18 Aug 2026; 6-monthly seal inspection 8 days overdue.",
              "Discharge pressure 7.9 kg/cm² below the 8.0 kg/cm² minimum.",
              "Reliability risk score 76/100 (HIGH), 8-week exposure window.",
            ],
          },
          {
            heading: "3. Actions",
            table: {
              headers: ["ID", "Action", "Owner", "Due"],
              rows: [
                ["A1", "Raise corrective WO (seal + bearing replacement)", "Maintenance", "5 days"],
                ["A2", "Complete overdue seal inspection", "Inspection", "3 days"],
                ["A3", "Confirm containment (drip tray / drain)", "Operations", "1 day"],
              ],
            },
          },
          ...base,
        ],
      };
    case "wo-summary":
      return {
        title: "Maintenance Work Order Summary",
        subtitle: "Corrective WO · P-102 · Priority HIGH · Rev A",
        meta: [...meta, ["WO", "WO-2026-0917"], ["Priority", "HIGH"], ["Window", "≤ 14 days"]],
        sections: [
          {
            heading: "1. Scope",
            bullets: [
              "Replace mechanical seal (API 682 Plan 11 + 62) and inspect seal chamber.",
              "Replace DE and NDE bearing set; verify clearances against datasheet.",
              "Rotor balance verification (< 2.5 mm/s residual) and soft-foot check.",
              "Lube flush/refill and baseline test run.",
            ],
          },
          {
            heading: "2. Materials",
            table: {
              headers: ["Item", "Spec", "Qty"],
              rows: [
                ["Mechanical seal kit", "API 682 / Plan 11+62", "1"],
                ["Bearing set DE/NDE", "per datasheet §6", "2"],
                ["Lubricant", "ISO VG 46 turbine oil", "10 L"],
                ["Gasket set", "API 610", "1 lot"],
              ],
            },
          },
          {
            heading: "3. Constraints",
            paragraphs: [
              "Single-train duty — coordinate isolation with feed swing. Trip criteria in force: DE ≥ 8.5 mm/s or DE temp ≥ 82 °C.",
            ],
          },
          ...base,
        ],
      };
    case "cx4-xlsx":
      return {
        title: "CX-4 Vendor Comparison",
        subtitle: "P-102 replacement pump · Technical + commercial scorecard",
        meta: [...meta, ["Format", "XLSX"], ["Evaluation", "2 bids"]],
        sections: [
          {
            heading: "Scorecard",
            table: {
              headers: ["Criterion", "Bid-A (Sterling)", "Bid-B (Meridian)"],
              rows: [
                ["Hydraulics (m³/h @ kg/cm²)", "318 @ 9.1", "321 @ 9.3"],
                ["Impeller metallurgy", "CD4MCu", "Duplex 2205"],
                ["Seal plan", "11 + 62", "11"],
                ["Lead time", "24 weeks", "20 weeks"],
                ["Price (₹ L)", "118", "131"],
                ["15-yr lifecycle NPV (₹ Cr)", "1.62", "1.71"],
              ],
            },
          },
          {
            heading: "Recommendation",
            paragraphs: ["Bid-A recommended on lifecycle NPV and seal-plan fit for the current weep-prone service."],
          },
          ...base,
        ],
      };
    case "anomaly-pdf":
      return {
        title: "P-102 Anomaly Brief",
        subtitle: "Mechanical seal leakage · observed 18 Aug 2026 · Anomaly #2026-AN-0312",
        meta: [...meta, ["Date", "18 Aug 2026"], ["Class", "HS&E Class 2"]],
        sections: [
          {
            heading: "1. Observation",
            paragraphs: [
              "Operator round noted a continuous light weep at the P-102 mechanical seal housing: ~4–6 drops/min (class 2 — minor/moderate).",
            ],
          },
          {
            heading: "2. Immediate Actions",
            bullets: [
              "Install drip tray and confirm drain path.",
              "Log observation in maintenance history.",
              "Route to seal inspection (interval already 8 days overdue).",
              "Include seal replacement in the corrective WO scope.",
            ],
          },
          {
            heading: "3. Escalation Criteria",
            paragraphs: [
              "Escalate to class 3 (dripping flow) — coordinate planned isolation within 48 hours.",
            ],
          },
          ...base,
        ],
      };
    default:
      return {
        title: file.name,
        subtitle: file.blurb,
        meta: [...meta, ["Type", file.type]],
        sections: [{ heading: "1. Content", paragraphs: [file.blurb] }, ...base],
      };
  }
}

function toCSV(rows: string[][]) {
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function download(file: DemoFile) {
  const c = buildContent(file);
  let content: string;
  let type: string;
  let ext: string;

  if (file.type === "CSV" || file.type === "XLSX") {
    const sheet = c.sections.find((s) => s.table);
    const rows = sheet?.table ? [sheet.table.headers, ...sheet.table.rows] : [];
    content = `# ${file.name}\n# ${DEMO_NOTICE}\n\n` + toCSV(rows);
    type = "text/csv";
    ext = "csv";
  } else {
    const parts = c.sections.map((s) => {
      const head = s.heading ? `\n\n${s.heading}\n` : "";
      const paras = (s.paragraphs || []).map((p) => p).join("\n\n");
      const bullets = (s.bullets || []).map((b) => `- ${b}`).join("\n");
      const tbl = s.table
        ? `\n\n${s.table.caption || "Table"}\n${toCSV([s.table.headers, ...s.table.rows])}`
        : "";
      return `${head}${paras}${bullets}${tbl}`;
    });
    content = `${c.title}\n${c.subtitle}\n\n${DEMO_NOTICE}\n\n${parts.join("\n")}`;
    type = "text/plain";
    ext = "txt";
  }

  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${file.name.replace(/\s+/g, "_")}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DocTypeChip({ type }: { type: DemoFile["type"] | string }) {
  const bg = typeBg[type as DemoFile["type"]] ?? "#F1F5F9";
  const color = typeColor[type as DemoFile["type"]] ?? "#64748B";
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold"
      style={{ background: bg, color: color }}>
      {type}
    </span>
  );
}

export default function DocumentViewer({ fileId, onClose }: { fileId: string; onClose: () => void }) {
  const file = fileById(fileId);
  const [tab, setTab] = useState<string>("Preview");
  if (!file) return null;
  const content = buildContent(file);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: "#E2E8F0", background: "#F8FAFC" }}>
          <div className="flex items-center gap-3">
            <DocTypeChip type={file.type} />
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "#0F172A" }}>{file.name}</h2>
              <div className="text-[11px] mt-0.5" style={{ color: "#64748B" }}>
                {file.size} · {file.blurb}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => download(file)} className="text-xs px-4 py-2 rounded font-medium border hover:bg-slate-50 transition-colors"
              style={{ borderColor: "#E2E8F0", color: "#334155" }}>
              ⭳ Download
            </button>
            <button onClick={onClose} className="text-xs px-4 py-2 rounded font-medium text-white transition-colors"
              style={{ background: "#0F766E" }}>
              Close
            </button>
          </div>
        </div>

        <div className="flex border-b flex-shrink-0" style={{ background: "#F1F5F9", borderColor: "#E2E8F0" }}>
          {["Preview", "Properties", "Usage Track"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className="px-4 py-2 text-xs font-medium transition-colors"
              style={{ color: tab === t ? "#0F766E" : "#64748B", borderBottom: tab === t ? "2px solid #0F766E" : "2px solid transparent" }}>
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8" style={{ background: "#E8EBEF" }}>
          <div className="max-w-2xl mx-auto bg-white shadow-sm border p-10 min-h-full relative text-sm" style={{ borderColor: "#E2E8F0", color: "#1E293B" }}>
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <span className="text-[11px] font-mono font-bold tracking-[0.4em] uppercase -rotate-12 text-red-200">DEMO DATA — SIMULATED</span>
            </div>
            {tab === "Preview" && (
              <div>
                <div className="flex items-start justify-between border-b pb-4 mb-6" style={{ borderColor: "#E2E8F0" }}>
                  <div>
                    <div className="text-[11px] font-bold tracking-wider text-slate-900 mb-1">MANGALORE REFINERY & PETROCHEMICALS · INSPECTION {file.type}</div>
                    <h1 className="text-xl font-bold">{content.title}</h1>
                    {content.subtitle && <p className="text-xs mt-1 text-slate-800">{content.subtitle}</p>}
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">CONFIDENTIAL</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mb-6">
                  {content.meta.map(([k, v]) => (
                    <div key={k} className="flex border rounded px-2 py-1.5" style={{ borderColor: "#E2E8F0", background: "#F8FAFC" }}>
                      <span className="w-24 text-slate-800">{k}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>

                {content.sections.map((s, i) => (
                  <div key={i} className="mb-5">
                    {s.heading && <h3 className="font-semibold border-b pb-1 mb-2" style={{ borderColor: "#CBD5E1" }}>{s.heading}</h3>}
                    {s.paragraphs?.map((p, j) => <p key={j} className="leading-relaxed mb-2">{p}</p>)}
                    {s.bullets && (
                      <ul className="list-disc pl-5 space-y-1">
                        {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
                      </ul>
                    )}
                    {s.table && (
                      <div className="mt-2">
                        {s.table.caption && <div className="text-xs text-slate-800 mb-1">{s.table.caption}</div>}
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b" style={{ borderColor: "#CBD5E1" }}>
                              {s.table.headers.map((h, j) => <th key={j} className="text-left px-2 py-1.5 font-semibold">{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {s.table.rows.map((r, j) => (
                              <tr key={j} className="border-b" style={{ borderColor: "#E2E8F0" }}>
                                {r.map((cell, k) => (
                                  <td key={k} className={`px-2 py-1.5 ${cell === "EXCEEDS" || cell === "BELOW" || cell === "CRITICAL" ? "text-red-700 font-medium" : cell === "WATCH" ? "text-amber-700" : ""}`}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
                <div className="mt-8 pt-3 text-center" style={{ borderTop: "1px dashed #CBD5E1" }}>
                  <span className="text-[10px] text-slate-900 uppercase">— End of {file.name} —</span>
                </div>
              </div>
            )}
            {tab === "Properties" && (
              <div className="space-y-2 text-xs">
                {[["Doc-Ref", file.id.toUpperCase()], ["Classification", "CONFIDENTIAL"], ["Department", "Inspection Engineering"], ["Security", "RBAC: view/query granted to project contributors"], ["Version control", "Rev as stored in Document Intelligence"], ["Residency", "KNOVIA (on-prem) store — MRPL"]].map(([k, v]) => (
                  <div key={k} className="flex border rounded px-2 py-1.5" style={{ borderColor: "#E2E8F0", background: "#F8FAFC" }}>
                    <span className="w-36 text-slate-800">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
            )}
            {tab === "Usage Track" && (
              <div className="space-y-3 text-xs">
                {[
                  { who: "Engineering Agent", what: "Referenced in DQ01 analysis (evidence retrieval)", when: "16 Sep 2026" },
                  { who: "Anita Rao", what: "Viewed from Workbench answer card", when: "16 Sep 2026" },
                  { who: "Inspection Eng.", what: "Uploaded to knowledge base", when: "18 Aug 2026" },
                ].map((u, i) => (
                  <div key={i} className="flex items-center gap-2 border rounded px-3 py-2" style={{ borderColor: "#E2E8F0", background: "#F8FAFC" }}>
                    <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                    <span className="font-medium w-32">{u.who}</span>
                    <span className="flex-1 text-slate-900">{u.what}</span>
                    <span className="text-slate-900">{u.when}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}