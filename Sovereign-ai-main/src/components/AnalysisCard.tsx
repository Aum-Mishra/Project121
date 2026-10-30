import React, { useState, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderGit2,
  Lightbulb,
  Lock,
  ShieldAlert,
  Table as TableIcon,
  TrendingUp,
} from "lucide-react";

interface MetricItem {
  name: string;
  value: string | number;
  unit?: string;
  status?: string;
}

interface FindingItem {
  title: string;
  detail?: string;
  confidence?: string;
}

interface ChartPoint {
  label?: string;
  value?: number | string;
}

interface ChartSeries {
  name?: string;
  data: ChartPoint[];
}

interface ChartData {
  type?: string;
  title?: string;
  data?: ChartPoint[];
  series?: ChartSeries[];
}

interface TableData {
  title?: string;
  headers?: string[];
  rows?: Array<Array<string | number>>;
}

interface RecItem {
  priority?: string;
  action?: string;
  rationale?: string;
}

export interface AnalysisEnvelope {
  summary?: string;
  findings?: FindingItem[];
  metrics?: MetricItem[];
  charts?: ChartData[];
  tables?: TableData[];
  recommendations?: RecItem[];

  anomaly_detected?: boolean;
  category?: string;
  subtitle?: string;
  title?: string;
  severity?: string;
  classification?: string;
  asset_id?: string;
  anomaly_cards?: AnomalyCardItem[];
  pressure_trend?: TrendPoint[];
  corrosion_trend?: TrendPoint[];
  recommendation?: string;
  references?: ReferenceItem[];
  linked_project?: LinkedProject | null;
  linked_approval?: LinkedApproval | null;
}

export interface AnomalyCardItem {
  label: string;
  value: string;
  limit?: string;
  delta?: string;
  status?: "CRITICAL" | "WARNING" | "NORMAL" | "INFO" | string;
}

export interface TrendPoint {
  year?: string;
  label?: string;
  value: number;
}

export interface ReferenceItem {
  code: string;
  title: string;
  clause?: string;
}

export interface LinkedProject {
  id?: number | string;
  project_id: string;
  name?: string;
  unit?: string;
  asset?: string;
  risk?: string;
  status?: string;
}

export interface LinkedApproval {
  id?: number | string;
  approval_id: string;
  artifact_id?: string;
  status?: string;
  comments?: string;
}

const SERIES_COLORS = ["#0D9488", "#D97706", "#0891B2", "#16A34A", "#DB2777", "#3B82F6"];

function statusStyle(status?: string) {
  switch ((status || "").toUpperCase()) {
    case "CRITICAL":
      return { bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" };
    case "WARNING":
      return { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" };
    case "NORMAL":
      return { bg: "#DCFCE7", color: "#15803D", border: "#BBF7D0" };
    default:
      return { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" };
  }
}

function toNumber(value?: number | string): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface NumericPoint {
  label?: string;
  value: number;
}

function toNumericPoints(data: ChartPoint[] | undefined): NumericPoint[] {
  const out: NumericPoint[] = [];
  for (const p of data || []) {
    const value = toNumber(p.value);
    if (value !== null) out.push({ label: p.label, value });
  }
  return out;
}

function BarChart({ chart }: { chart: ChartData }) {
  const data = toNumericPoints(chart.data);
  if (data.length === 0) return null;
  const max = data.length > 0 ? Math.max(...data.map((d) => d.value), 1) : 1;
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold mb-2" style={{ color: "#334155" }}>{chart.title}</p>
      <div className="flex items-end gap-3 h-[90px] px-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className="text-[10px] font-semibold" style={{ color: "#0F766E" }}>{d.value}</span>
            <div
              className="w-full rounded-[4px] min-h-[4px]"
              style={{ height: `${Math.max((d.value / max) * 78, 4)}px`, background: "linear-gradient(to top, #0D9488, #2DD4BF)" }}
            />
            <span className="text-[9px] truncate w-full text-center" style={{ color: "#64748B" }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ chart }: { chart: ChartData }) {
  const data = toNumericPoints(chart.data);
  if (data.length < 2) return <BarChart chart={chart} />;
  const w = 300;
  const h = 90;
  const max = data.length > 0 ? Math.max(...data.map((d) => d.value), 1) : 1;
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => ({
    x: i * step,
    y: h - ((d.value - min) / range) * h,
    ...d,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold mb-2" style={{ color: "#334155" }}>{chart.title}</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[90px]">
        <polyline points={path} fill="none" stroke="#0D9488" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#2DD4BF" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {pts.map((p, i) => (
          <span key={i} className="text-[9px] truncate max-w-[20%]" style={{ color: "#64748B" }}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}

function MultiSeriesLineChart({ chart }: { chart: ChartData }) {
  const series = (chart.series || [])
    .map((s) => ({
      name: s.name,
      points: toNumericPoints(s.data),
    }))
    .filter((s) => s.points.length > 0);

  if (series.length === 0) return null;

  const labels = Array.from(new Set(series.flatMap((s) => s.points.map((p) => String(p.label ?? "")))));
  const w = 300;
  const h = 90;
  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const max = allValues.length > 0 ? Math.max(...allValues, 1) : 1;
  const min = Math.min(...allValues, 0);
  const range = max - min || 1;
  const step = labels.length > 1 ? w / (labels.length - 1) : w;
  const scaler = (value: number) => h - ((value - min) / range) * h;

  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold mb-2" style={{ color: "#334155" }}>{chart.title}</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[90px]">
        {series.map((s, si) => {
          const color = SERIES_COLORS[si % SERIES_COLORS.length];
          const pts = s.points.map((p, pi) => ({ x: pi * step, y: scaler(p.value), ...p }));
          const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              <polyline points={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between mt-1">
        {labels.map((label, i) => (
          <span key={i} className="text-[9px] truncate max-w-[20%]" style={{ color: "#64748B" }}>{label}</span>
        ))}
      </div>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {series.map((s, si) => (
            <span key={si} className="inline-flex items-center gap-1 text-[9px]" style={{ color: "#475569" }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SERIES_COLORS[si % SERIES_COLORS.length] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartCard({ chart }: { chart: ChartData }) {
  const type = (chart.type || "bar").toLowerCase();
  let inner: ReactNode;
  if (type === "line") {
    if ((chart.series || []).length > 0) inner = <MultiSeriesLineChart chart={chart} />;
    else inner = <LineChart chart={chart} />;
  } else {
    inner = <BarChart chart={chart} />;
  }
  return (
    <div className="rounded-[10px] bg-white border p-3.5" style={{ borderColor: "#E2E8F0" }}>
      {inner}
    </div>
  );
}

function PressureLineChart({ points, title = "Pressure Trend (bar)" }: { points: TrendPoint[]; title?: string }) {
  const [hoverIndex, setHoverIndex] = useState<number>(points.length - 1);
  if (!points || points.length === 0) return null;

  const w = 340;
  const h = 135;
  const padLeft = 36;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 26;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const minVal = 30;
  const maxVal = 46;
  const rangeV = maxVal - minVal;
  const step = points.length > 1 ? plotW / (points.length - 1) : plotW;

  const pts = points.map((p, i) => {
    const clamped = Math.max(minVal, Math.min(maxVal, p.value));
    const normalized = (clamped - minVal) / rangeV;
    return {
      x: padLeft + i * step,
      y: padTop + plotH - normalized * plotH,
      year: p.year || p.label || `P${i + 1}`,
      value: p.value,
    };
  });

  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const activePt = pts[hoverIndex] || pts[pts.length - 1];

  return (
    <div className="rounded-[10px] bg-white border p-3.5 relative flex flex-col justify-between" style={{ borderColor: "#E2E8F0" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11.5px] font-semibold" style={{ color: "#1E293B" }}>{title}</p>
        <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded border" style={{ color: "#B91C1C", background: "#FEE2E2", borderColor: "#FECACA" }}>
          MAWP Exceeded
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[120px] overflow-visible">
          {[46, 38, 30].map((val) => {
            const y = padTop + plotH - ((val - minVal) / rangeV) * plotH;
            return (
              <g key={val}>
                <text x={padLeft - 6} y={y + 3.5} textAnchor="end" className="text-[9.5px] font-mono" fill="#64748B">
                  {val}
                </text>
                <line x1={padLeft} y1={y} x2={w - padRight} y2={y} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />
              </g>
            );
          })}

          <path d={pathD} fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {pts.map((p, i) => {
            const isHover = i === hoverIndex;
            return (
              <g key={i} className="cursor-pointer" onMouseEnter={() => setHoverIndex(i)}>
                <circle cx={p.x} cy={p.y} r={isHover ? "6" : "4.5"} fill="#DC2626" stroke="#FFFFFF" strokeWidth="2" />
                {isHover && <circle cx={p.x} cy={p.y} r="9" fill="#DC2626" fillOpacity="0.2" />}
                <text
                  x={p.x}
                  y={h - 4}
                  textAnchor="middle"
                  className="text-[10px] font-mono"
                  fill={isHover ? "#1E293B" : "#64748B"}
                >
                  {p.year}
                </text>
              </g>
            );
          })}
        </svg>

        {activePt && (
          <div
            className="absolute -top-1 bg-white/95 border rounded-[6px] px-2.5 py-1.5 shadow-xl pointer-events-none transition-all duration-150"
            style={{ borderColor: "#FECACA", left: `${Math.min(Math.max(activePt.x - 45, 10), 220)}px` }}
          >
            <p className="text-[10px] text-slate-900 font-mono">{activePt.year}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <p className="text-[11px] font-bold text-slate-800 font-mono">
                pressure : <span className="text-red-600">{activePt.value}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CorrosionBarChart({ points, title = "Corrosion Trend (mm)" }: { points: TrendPoint[]; title?: string }) {
  if (!points || points.length === 0) return null;

  const maxVal = 3.8;
  const yTicks = [3.8, 1.9, 0];

  return (
    <div className="rounded-[10px] bg-white border p-3.5 flex flex-col justify-between" style={{ borderColor: "#E2E8F0" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11.5px] font-semibold" style={{ color: "#1E293B" }}>{title}</p>
        <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded border" style={{ color: "#92400E", background: "#FEF3C7", borderColor: "#FDE68A" }}>
          Loss Rate Accelerating
        </span>
      </div>

      <div className="h-[120px] flex gap-2">
        <div className="flex flex-col justify-between py-1 text-right w-6 flex-none pr-1">
          {yTicks.map((val) => (
            <span key={val} className="text-[9.5px] text-slate-800 font-mono">{val}</span>
          ))}
        </div>

        <div className="flex-1 relative flex items-end justify-around border-b pb-1" style={{ borderColor: "#E2E8F0" }}>
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            <div className="border-b border-slate-100 w-full" />
            <div className="border-b border-slate-100 w-full" />
            <div className="border-b border-slate-100 w-full" />
          </div>

          {points.map((p, i) => {
            const pct = Math.min(100, Math.max(12, (p.value / maxVal) * 100));
            const yearLabel = p.year || p.label || `T${i + 1}`;
            return (
              <div key={i} className="flex-1 max-w-[48px] flex flex-col items-center h-full justify-end group z-10">
                <span className="text-[9.5px] font-mono font-bold mb-1" style={{ color: "#B45309" }}>
                  {p.value}
                </span>
                <div
                  className="w-full rounded-t-[5px] shadow-sm group-hover:brightness-110 transition-all"
                  style={{ height: `${pct * 0.72}%`, background: "linear-gradient(to top, #B45309, #F59E0B)" }}
                />
                <span className="text-[10px] font-mono mt-1.5" style={{ color: "#64748B" }}>{yearLabel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AnalysisCard({
  analysis,
  onNavigate,
}: {
  analysis: AnalysisEnvelope;
  onNavigate?: (view: string) => void;
}) {
  const [refsOpen, setRefsOpen] = useState(false);

  if (analysis.anomaly_detected) {
    const cards = analysis.anomaly_cards || [];
    const pressureTrend = analysis.pressure_trend || [
      { year: "2024", value: 30 },
      { year: "2025", value: 37 },
      { year: "2026", value: 42 },
    ];
    const corrosionTrend = analysis.corrosion_trend || [
      { year: "2024", value: 1.0 },
      { year: "2025", value: 2.2 },
      { year: "2026", value: 3.8 },
    ];
    const references = analysis.references || [];
    const severity = (analysis.severity || "HIGH").toUpperCase();
    const downloadArtifactId = analysis.linked_approval?.artifact_id;

    const severityStyle =
      severity === "CRITICAL" || severity === "HIGH"
        ? { bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" }
        : severity === "WARNING" || severity === "MEDIUM"
        ? { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" }
        : { bg: "#DCFCE7", color: "#15803D", border: "#BBF7D0" };

    return (
      <div className="mt-3 rounded-[12px] border overflow-hidden shadow-sm" style={{ borderColor: "#E2E8F0", background: "#FFFFFF" }}>
        {/* Top Header Bar */}
        <div className="px-4 py-2.5 bg-white border-b flex items-center justify-between flex-wrap gap-2" style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}>
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-teal-600" />
            <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: "#0F766E" }}>
              {analysis.category || "Inspection Intelligence"}
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-[12px] font-medium" style={{ color: "#64748B" }}>
              {analysis.subtitle || "P-102 Equipment Integrity Review"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white border text-[10px] font-bold tracking-wider font-mono uppercase" style={{ background: "#FFFBEB", borderColor: "#FDE68A", color: "#92400E" }}>
            <Lock size={10} />
            {analysis.classification || "CONFIDENTIAL"}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* AI Assessment Result Title & Severity */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#64748B" }}>
              AI ASSESSMENT RESULT
            </p>
            <div className="flex items-center justify-between mt-0.5 flex-wrap gap-2">
              <h3 className="text-[19px] font-bold tracking-tight" style={{ color: "#0F172A" }}>
                {analysis.title || "P-102 Integrity Assessment"}
              </h3>
              <span
                className="text-[11px] font-bold font-mono px-2.5 py-0.5 rounded border"
                style={{ background: severityStyle.bg, color: severityStyle.color, borderColor: severityStyle.border }}
              >
                [{severity}]
              </span>
            </div>
          </div>

          {/* 3 Key Metric Cards */}
          {cards.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {cards.map((c, i) => {
                const cardStatus = (c.status || "INFO").toUpperCase();
                const isCritical = cardStatus === "CRITICAL";
                const isWarning = cardStatus === "WARNING";
                const valColor = isCritical ? "#DC2626" : isWarning ? "#B45309" : "#0F172A";
                const deltaStyle = isCritical
                  ? { color: "#B91C1C", bg: "#FEE2E2", border: "#FECACA" }
                  : isWarning
                  ? { color: "#92400E", bg: "#FEF3C7", border: "#FDE68A" }
                  : { color: "#475569", bg: "#F1F5F9", border: "#E2E8F0" };

                return (
                  <div key={i} className="rounded-[10px] bg-white border p-3.5 flex flex-col justify-between" style={{ borderColor: "#E2E8F0" }}>
                    <p className="text-[12px] font-medium" style={{ color: "#475569" }}>{c.label}</p>
                    <p className="text-[26px] font-bold tracking-tight my-1" style={{ color: valColor }}>
                      {c.value}
                    </p>
                    <div className="flex items-center justify-between gap-1 text-[11px] pt-1 border-t" style={{ borderColor: "#F1F5F9" }}>
                      <span className="font-mono text-[10.5px] truncate" style={{ color: "#64748B" }}>{c.limit}</span>
                      {c.delta && (
                        <span className="text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded border flex-none" style={deltaStyle}>
                          {c.delta}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Dual Side-by-Side Trend Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PressureLineChart points={pressureTrend} />
            <CorrosionBarChart points={corrosionTrend} />
          </div>

          {/* AI Recommendation Container */}
          {analysis.recommendation && (
            <div className="rounded-[10px] p-4 space-y-2" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <div className="flex items-center gap-1.5 text-[11px] font-bold font-mono tracking-wider uppercase" style={{ color: "#B45309" }}>
                <Lightbulb size={13} className="text-amber-600" />
                <span>AI RECOMMENDATION</span>
              </div>
              <p className="text-[13px] font-medium leading-relaxed" style={{ color: "#78350F" }}>
                {analysis.recommendation}
              </p>
              <div className="pt-2 border-t flex items-center gap-2 text-[11px]" style={{ borderColor: "#FDE68A", color: "#B45309" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-none" />
                <span>This recommendation is advisory and requires authorized human approval before any operational decision.</span>
              </div>
            </div>
          )}

          {/* 3 Action Buttons */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              type="button"
              onClick={() => onNavigate?.("approvals")}
              className="px-4 py-2 rounded-[6px] bg-teal-600 hover:bg-teal-700 text-white text-[12px] font-semibold transition-colors shadow-sm cursor-pointer"
            >
              View Approval Queue
            </button>
            {downloadArtifactId && (
              <button
                type="button"
                className="px-3.5 py-2 rounded-[6px] bg-white hover:bg-slate-50 border text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                style={{ borderColor: "#E2E8F0", color: "#334155" }}
              >
                Download Approval Note
              </button>
            )}
            <button
              type="button"
              onClick={() => setRefsOpen(!refsOpen)}
              className="px-3.5 py-2 rounded-[6px] bg-white hover:bg-slate-50 border text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              style={{ borderColor: "#E2E8F0", color: "#334155" }}
            >
              View Evidence
            </button>
          </div>

          {/* Connected Project Action (Workflow Interlocking) */}
          {analysis.linked_project && (
            <button
              type="button"
              onClick={() => onNavigate?.("projects")}
              className="w-full flex items-center justify-between p-3 rounded-[8px] text-left transition-all shadow-sm mt-1"
              style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-[6px] flex items-center justify-center flex-none" style={{ background: "#DBEAFE", border: "1px solid #BFDBFE", color: "#1D4ED8" }}>
                  <FolderGit2 size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold truncate" style={{ color: "#1E3A8A" }}>
                    Linked Project: {analysis.linked_project.project_id}
                  </p>
                  <p className="text-[10px]" style={{ color: "#3B82F6" }}>
                    {analysis.linked_project.unit || "CDU-4"} · {analysis.linked_project.risk || "High Risk"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-none pl-2">
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: "#DBEAFE", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
                  {analysis.linked_project.status || "IN_PROGRESS"}
                </span>
                <ArrowRight size={13} className="text-blue-500" />
              </div>
            </button>
          )}

          {/* References & Norms Accordion */}
          {references.length > 0 && (
            <div className="rounded-[8px] bg-white border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
              <button
                type="button"
                onClick={() => setRefsOpen(!refsOpen)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: "#475569" }}>
                  <BookOpen size={12} className="text-teal-600" />
                  <span>References & Norms ({references.length})</span>
                </div>
                {refsOpen ? <ChevronUp size={13} className="text-slate-900" /> : <ChevronDown size={13} className="text-slate-900" />}
              </button>
              {refsOpen && (
                <div className="p-3 pt-0 space-y-2 border-t" style={{ borderColor: "#F1F5F9", marginTop: 1 }}>
                  {references.map((r, i) => (
                    <div key={i} className="p-2.5 rounded text-[11px]" style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border" style={{ background: "#F0FDFA", color: "#0F766E", borderColor: "#99F6E4" }}>
                          {r.code}
                        </span>
                        <span className="font-semibold" style={{ color: "#1E293B" }}>{r.title}</span>
                      </div>
                      {r.clause && (
                        <p className="text-[10.5px] leading-relaxed pl-1" style={{ color: "#64748B" }}>
                          {r.clause}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── STANDARD STRUCTURED ANALYSIS VIEW ─────────────────────────────────────
  const findings = analysis.findings || [];
  const metrics = analysis.metrics || [];
  const charts = analysis.charts || [];
  const tables = analysis.tables || [];
  const recommendations = analysis.recommendations || [];

  if (!analysis.summary && findings.length === 0 && metrics.length === 0) return null;

  return (
    <div className="mt-3 rounded-[10px] border bg-white overflow-hidden shadow-sm" style={{ borderColor: "#E2E8F0" }}>
      <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}>
        <BarChart3 size={13} className="text-teal-600" />
        <p className="text-[11px] font-semibold" style={{ color: "#334155" }}>Structured Analysis</p>
      </div>
      <div className="p-4 space-y-4">
        {analysis.summary && (
          <p className="text-[12.5px] leading-relaxed" style={{ color: "#475569" }}>{analysis.summary}</p>
        )}

        {metrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {metrics.map((m, i) => {
              const st = statusStyle(m.status);
              return (
                <div key={i} className="rounded-[8px] bg-white border px-3 py-2.5" style={{ borderColor: "#E2E8F0" }}>
                  <p className="text-[10px]" style={{ color: "#64748B" }}>{m.name}</p>
                  <p className="text-[15px] font-semibold mt-0.5" style={{ color: "#0F172A" }}>
                    {m.value}
                    {m.unit ? <span className="text-[10px] ml-1" style={{ color: "#64748B" }}>{m.unit}</span> : null}
                  </p>
                  <span className="inline-block mt-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border" style={st}>
                    {m.status || "INFO"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {charts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {charts.map((c, i) => <ChartCard key={i} chart={c} />)}
          </div>
        )}

        {findings.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#64748B" }}>Findings</p>
            <div className="space-y-2">
              {findings.map((f, i) => (
                <div key={i} className="rounded-[8px] bg-white border px-3 py-2.5" style={{ borderColor: "#E2E8F0" }}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-teal-600 flex-none" />
                    <p className="text-[12px] font-medium flex-1" style={{ color: "#1E293B" }}>{f.title}</p>
                    {f.confidence && (
                      <span className="text-[9px] font-semibold uppercase" style={{ color: "#94A3B8" }}>{f.confidence}</span>
                    )}
                  </div>
                  {f.detail && <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "#475569" }}>{f.detail}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tables.length > 0 && (
          <div className="space-y-2">
            {tables.map((t, i) => (
              <div key={i} className="rounded-[8px] bg-white border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
                <div className="px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor: "#F1F5F9" }}>
                  <TableIcon size={12} className="text-teal-600" />
                  <p className="text-[11px] font-medium" style={{ color: "#334155" }}>{t.title || "Data table"}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        {(t.headers || []).map((h, j) => (
                          <th key={j} className="px-3 py-2 text-[10px] font-semibold" style={{ color: "#64748B", background: "#F8FAFC" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(t.rows || []).map((row, j) => (
                        <tr key={j} style={{ borderTop: "1px solid #F1F5F9" }}>
                          {row.map((cell, k) => (
                            <td key={k} className="px-3 py-1.5 text-[11px]" style={{ color: "#475569" }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {recommendations.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#64748B" }}>
              <span className="inline-flex items-center gap-1"><Lightbulb size={11} /> Recommendations</span>
            </p>
            <div className="space-y-2">
              {recommendations.map((r, i) => {
                const st = statusStyle(r.priority);
                return (
                  <div key={i} className="rounded-[8px] bg-white border px-3 py-2.5 flex items-start gap-2" style={{ borderColor: "#E2E8F0" }}>
                    <TrendingUp size={12} className="text-teal-600 flex-none mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium" style={{ color: "#1E293B" }}>{r.action}</p>
                      {r.rationale && <p className="text-[11px] mt-0.5" style={{ color: "#475569" }}>{r.rationale}</p>}
                    </div>
                    {r.priority && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border flex-none" style={st}>
                        {r.priority}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}