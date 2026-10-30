import { useState, type ReactNode } from "react";
import { api } from "../services/api";
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

  // ── Industrial Anomaly Intelligence properties ─────────────────────────────
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

function statusColor(status?: string) {
  switch ((status || "").toUpperCase()) {
    case "CRITICAL":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "WARNING":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "NORMAL":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    default:
      return "bg-[#253248] text-[#9AA6B5] border-[#253248]";
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
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="mt-3">
      <p className="text-[11px] text-[#667386] mb-2">{chart.title}</p>
      <div className="flex items-end gap-3 h-[90px] px-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className="text-[10px] font-semibold text-[#F5F7FA]">{d.value}</span>
            <div
              className="w-full rounded-[4px] bg-gradient-to-t from-[#8B5CF6] to-[#A78BFA] min-h-[4px]"
              style={{ height: `${Math.max(((d.value as number) / max) * 78, 4)}px` }}
            />
            <span className="text-[9px] text-[#667386] truncate w-full text-center">{d.label}</span>
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
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => ({
    x: i * step,
    y: h - ((d.value) - min) / range * h,
    ...d,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <div className="mt-3">
      <p className="text-[11px] text-[#667386] mb-2">{chart.title}</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[90px]">
        <polyline points={path} fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#A78BFA" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {pts.map((p, i) => (
          <span key={i} className="text-[9px] text-[#667386] truncate max-w-[20%]">{p.label}</span>
        ))}
      </div>
    </div>
  );
}

const SERIES_COLORS = ["#8B5CF6", "#F59E0B", "#22D3EE", "#34D399", "#F472B6", "#60A5FA"];

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
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const range = max - min || 1;
  const step = labels.length > 1 ? w / (labels.length - 1) : w;

  const scaler = (value: number) => h - ((value - min) / range) * h;

  return (
    <div className="mt-3">
      <p className="text-[11px] text-[#667386] mb-2">{chart.title}</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[90px]">
        {series.map((s, si) => {
          const pts = s.points.map((p, pi) => {
            const x = pi * step;
            return { x, y: scaler(p.value), ...p };
          });
          const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              <polyline points={path} fill="none" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill={SERIES_COLORS[si % SERIES_COLORS.length]} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between mt-1">
        {labels.map((label, i) => (
          <span key={i} className="text-[9px] text-[#667386] truncate max-w-[20%]">{label}</span>
        ))}
      </div>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {series.map((s, si) => (
            <span key={si} className="inline-flex items-center gap-1 text-[9px] text-[#9AA6B5]">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[si % SERIES_COLORS.length] }}
              />
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
    <div className="rounded-[10px] bg-[#141E2F] border border-[#253248] p-3.5">
      {inner}
    </div>
  );
}

// ── Inspection Intelligence Dual Trend Charts (Figma card) ──────────────────

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
  const range = maxVal - minVal;

  const step = points.length > 1 ? plotW / (points.length - 1) : plotW;

  const pts = points.map((p, i) => {
    const clamped = Math.max(minVal, Math.min(maxVal, p.value));
    const normalized = (clamped - minVal) / range;
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
    <div className="rounded-[10px] bg-[#111A29] border border-[#1E2E44] p-3.5 relative flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11.5px] font-semibold text-[#F1F5F9]">{title}</p>
        <span className="text-[9.5px] font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
          MAWP Exceeded
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[120px] overflow-visible">
          {[46, 38, 30].map((val) => {
            const y = padTop + plotH - ((val - minVal) / range) * plotH;
            return (
              <g key={val}>
                <text x={padLeft - 6} y={y + 3.5} textAnchor="end" className="fill-[#64748B] text-[9.5px] font-mono">
                  {val}
                </text>
                <line x1={padLeft} y1={y} x2={w - padRight} y2={y} stroke="#1E2B40" strokeWidth="1" strokeDasharray="3 3" />
              </g>
            );
          })}

          <path d={pathD} fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {pts.map((p, i) => {
            const isHover = i === hoverIndex;
            return (
              <g
                key={i}
                className="cursor-pointer"
                onMouseEnter={() => setHoverIndex(i)}
              >
                <circle cx={p.x} cy={p.y} r={isHover ? "6" : "4.5"} fill="#EF4444" stroke="#0B1320" strokeWidth="2" />
                {isHover && (
                  <circle cx={p.x} cy={p.y} r="9" fill="#EF4444" fillOpacity="0.25" />
                )}
                <text
                  x={p.x}
                  y={h - 4}
                  textAnchor="middle"
                  className={`text-[10px] font-mono ${isHover ? "fill-white font-bold" : "fill-[#64748B]"}`}
                >
                  {p.year}
                </text>
              </g>
            );
          })}
        </svg>

        {activePt && (
          <div
            className="absolute -top-1 bg-[#0F172A]/95 border border-red-500/50 rounded-[6px] px-2.5 py-1.5 shadow-xl pointer-events-none transition-all duration-150"
            style={{
              left: `${Math.min(Math.max(activePt.x - 45, 10), 220)}px`,
            }}
          >
            <p className="text-[10px] text-[#94A3B8] font-mono">{activePt.year}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <p className="text-[11px] font-bold text-white font-mono">
                pressure : <span className="text-red-400">{activePt.value}</span>
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
    <div className="rounded-[10px] bg-[#111A29] border border-[#1E2E44] p-3.5 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11.5px] font-semibold text-[#F1F5F9]">{title}</p>
        <span className="text-[9.5px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
          Loss Rate Accelerating
        </span>
      </div>

      <div className="h-[120px] flex gap-2">
        <div className="flex flex-col justify-between py-1 text-right w-6 flex-none pr-1">
          {yTicks.map((val) => (
            <span key={val} className="text-[9.5px] text-[#64748B] font-mono">
              {val}
            </span>
          ))}
        </div>

        <div className="flex-1 relative flex items-end justify-around border-b border-[#1E2B40] pb-1">
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            <div className="border-b border-[#1E2B40]/50 w-full" />
            <div className="border-b border-[#1E2B40]/50 w-full" />
            <div className="border-b border-[#1E2B40]/50 w-full" />
          </div>

          {points.map((p, i) => {
            const pct = Math.min(100, Math.max(12, (p.value / maxVal) * 100));
            const yearLabel = p.year || p.label || `T${i + 1}`;
            return (
              <div key={i} className="flex-1 max-w-[48px] flex flex-col items-center h-full justify-end group z-10">
                <span className="text-[9.5px] font-mono font-bold text-amber-300 mb-1 opacity-90 group-hover:opacity-100 transition-opacity">
                  {p.value}
                </span>
                <div
                  className="w-full rounded-t-[5px] bg-gradient-to-t from-[#B45309] to-[#F59E0B] shadow-md shadow-amber-900/30 group-hover:brightness-110 transition-all"
                  style={{ height: `${pct * 0.72}%` }}
                />
                <span className="text-[10px] font-mono text-[#64748B] mt-1.5 group-hover:text-white transition-colors">
                  {yearLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AnalysisView({ analysis, onNavigate }: { analysis: AnalysisEnvelope; onNavigate?: (view: string) => void }) {
  const [refsOpen, setRefsOpen] = useState(false);

  // ── 1. INDUSTRIAL ANOMALY INTELLIGENCE CARD ────────────────────────────────
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

    return (
      <div className="mt-3 rounded-[12px] border border-[#223249] bg-[#0A121E] overflow-hidden animate-fade-up shadow-2xl">
        {/* Top Header Bar */}
        <div className="px-4 py-2.5 bg-[#0D1626] border-b border-[#1C2B40] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-[#8B5CF6]" />
            <span className="text-[11px] font-bold text-[#8B5CF6] tracking-wider uppercase">
              {analysis.category || "Inspection Intelligence"}
            </span>
            <span className="text-[#33445C]">|</span>
            <span className="text-[12px] font-medium text-[#9AA6B5]">
              {analysis.subtitle || "P-102 Equipment Integrity Review"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold tracking-wider font-mono uppercase">
            <Lock size={10} />
            {analysis.classification || "CONFIDENTIAL"}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* AI Assessment Result Title & Severity */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-[#64748B]">
              AI ASSESSMENT RESULT
            </p>
            <div className="flex items-center justify-between mt-0.5">
              <h3 className="text-[19px] font-bold text-white tracking-tight">
                {analysis.title || "P-102 Integrity Assessment"}
              </h3>
              <span
                className={`text-[11px] font-bold font-mono px-2.5 py-0.5 rounded border ${
                  severity === "CRITICAL" || severity === "HIGH"
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : severity === "WARNING" || severity === "MEDIUM"
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                }`}
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

                const valColor = isCritical
                  ? "text-[#F87171]"
                  : isWarning
                  ? "text-[#FBBF24]"
                  : "text-white";

                const deltaStyle = isCritical
                  ? "text-[#F87171] bg-red-500/10 border-red-500/20"
                  : isWarning
                  ? "text-[#FBBF24] bg-amber-500/10 border-amber-500/20"
                  : "text-[#94A3B8] bg-[#1E293B] border-[#334155]";

                return (
                  <div
                    key={i}
                    className="rounded-[10px] bg-[#111A29] border border-[#1E2E44] p-3.5 flex flex-col justify-between"
                  >
                    <p className="text-[12px] text-[#8C9BAE] font-medium">{c.label}</p>
                    <p className={`text-[26px] font-bold tracking-tight my-1 ${valColor}`}>
                      {c.value}
                    </p>
                    <div className="flex items-center justify-between gap-1 text-[11px] pt-1 border-t border-[#1C2B40]/60">
                      <span className="text-[#64748B] font-mono text-[10.5px] truncate">
                        {c.limit}
                      </span>
                      {c.delta && (
                        <span className={`text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded border flex-none ${deltaStyle}`}>
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
            <div className="rounded-[10px] bg-[#17140E] border border-[#B45309]/70 p-4 space-y-2 shadow-inner">
              <div className="flex items-center gap-1.5 text-[#F59E0B] text-[11px] font-bold font-mono tracking-wider uppercase">
                <Lightbulb size={13} className="text-[#F59E0B]" />
                <span>AI RECOMMENDATION</span>
              </div>
              <p className="text-[13px] text-[#FDE68A] font-medium leading-relaxed">
                {analysis.recommendation}
              </p>
              <div className="pt-2 border-t border-[#B45309]/30 flex items-center gap-2 text-[11px] text-[#E5A73B]/90">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-none" />
                <span>This recommendation is advisory and requires authorized human approval before any operational decision.</span>
              </div>
            </div>
          )}

          {/* 3 Action Buttons */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              type="button"
              onClick={() => onNavigate?.("approvals")}
              className="px-4 py-2 rounded-[6px] bg-[#0D9488] hover:bg-[#0F766E] text-white text-[12px] font-semibold transition-colors shadow-sm cursor-pointer"
            >
              View Approval Queue
            </button>
            {downloadArtifactId && (
              <button
                type="button"
                onClick={() => window.open(api.artifacts.downloadUrl(downloadArtifactId), "_blank")}
                className="px-3.5 py-2 rounded-[6px] bg-[#141E2F] hover:bg-[#1C2B40] border border-[#253248] text-[#E2E8F0] text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              >
                Download Approval Note
              </button>
            )}
            <button
              type="button"
              onClick={() => setRefsOpen(!refsOpen)}
              className="px-3.5 py-2 rounded-[6px] bg-[#141E2F] hover:bg-[#1C2B40] border border-[#253248] text-[#E2E8F0] text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              View Evidence
            </button>
          </div>

          {/* Connected Project Action (Workflow Interlocking) */}
          {analysis.linked_project && (
            <button
              type="button"
              onClick={() => onNavigate?.("projects")}
              className="w-full flex items-center justify-between p-3 rounded-[8px] bg-[#111E33] hover:bg-[#182B4A] border border-[#3B82F6]/35 text-left transition-all group shadow-sm mt-1"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-[6px] bg-[#3B82F6]/20 border border-[#3B82F6]/30 flex items-center justify-center text-[#93C5FD] flex-none">
                  <FolderGit2 size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[#DBEAFE] truncate">
                    Linked Project: {analysis.linked_project.project_id}
                  </p>
                  <p className="text-[10px] text-[#93C5FD]/80">
                    {analysis.linked_project.unit || "CDU-4"} · {analysis.linked_project.risk || "High Risk"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-none pl-2">
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  {analysis.linked_project.status || "IN_PROGRESS"}
                </span>
                <ArrowRight size={13} className="text-[#93C5FD] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )}

          {/* References & Norms Accordion */}
          {references.length > 0 && (
            <div className="rounded-[8px] bg-[#101827] border border-[#1E2E44] overflow-hidden">
              <button
                type="button"
                onClick={() => setRefsOpen(!refsOpen)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-[#142033] transition-colors"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold text-[#94A3B8]">
                  <BookOpen size={12} className="text-[#8B5CF6]" />
                  <span>References & Norms ({references.length})</span>
                </div>
                {refsOpen ? (
                  <ChevronUp size={13} className="text-[#64748B]" />
                ) : (
                  <ChevronDown size={13} className="text-[#64748B]" />
                )}
              </button>
              {refsOpen && (
                <div className="p-3 pt-0 space-y-2 border-t border-[#1C2B40]/70 mt-1">
                  {references.map((r, i) => (
                    <div key={i} className="p-2.5 rounded bg-[#0A111C] border border-[#1A283C] text-[11px]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-[#8B5CF6]/15 text-[#C4B5FD] border border-[#8B5CF6]/30">
                          {r.code}
                        </span>
                        <span className="font-semibold text-white">{r.title}</span>
                      </div>
                      {r.clause && (
                        <p className="text-[#8C9BAE] text-[10.5px] leading-relaxed pl-1">
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

  // ── 2. STANDARD STRUCTURED ANALYSIS VIEW ───────────────────────────────────
  const findings = analysis.findings || [];
  const metrics = analysis.metrics || [];
  const charts = analysis.charts || [];
  const tables = analysis.tables || [];
  const recommendations = analysis.recommendations || [];

  if (!analysis.summary && findings.length === 0 && metrics.length === 0) return null;

  return (
    <div className="mt-3 rounded-[10px] border border-[#253248] bg-[#0F1726] overflow-hidden animate-fade-up">
      <div className="px-4 py-2.5 border-b border-[#1a2740] flex items-center gap-2">
        <BarChart3 size={13} className="text-[#8B5CF6]" />
        <p className="text-[11px] font-semibold text-[#F5F7FA]">Structured Analysis</p>
      </div>
      <div className="p-4 space-y-4">
        {analysis.summary && (
          <p className="text-[12.5px] text-[#9AA6B5] leading-relaxed">{analysis.summary}</p>
        )}

        {metrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {metrics.map((m, i) => (
              <div key={i} className="rounded-[8px] bg-[#141E2F] border border-[#253248] px-3 py-2.5">
                <p className="text-[10px] text-[#667386]">{m.name}</p>
                <p className="text-[15px] font-semibold text-[#F5F7FA] mt-0.5">
                  {m.value}
                  {m.unit ? <span className="text-[10px] text-[#667386] ml-1">{m.unit}</span> : null}
                </p>
                <span className={`inline-block mt-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${statusColor(m.status)}`}>
                  {m.status || "INFO"}
                </span>
              </div>
            ))}
          </div>
        )}

        {charts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {charts.map((c, i) => <ChartCard key={i} chart={c} />)}
          </div>
        )}

        {findings.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#667386] mb-2">Findings</p>
            <div className="space-y-2">
              {findings.map((f, i) => (
                <div key={i} className="rounded-[8px] bg-[#141E2F] border border-[#253248] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-[#8B5CF6] flex-none" />
                    <p className="text-[12px] font-medium text-[#F5F7FA] flex-1">{f.title}</p>
                    {f.confidence && (
                      <span className="text-[9px] font-semibold text-[#667386] uppercase">{f.confidence}</span>
                    )}
                  </div>
                  {f.detail && <p className="text-[11px] text-[#9AA6B5] mt-1 leading-relaxed">{f.detail}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tables.length > 0 && (
          <div className="space-y-2">
            {tables.map((t, i) => (
              <div key={i} className="rounded-[8px] bg-[#141E2F] border border-[#253248] overflow-hidden">
                <div className="px-3 py-2 flex items-center gap-2 border-b border-[#1a2740]">
                  <TableIcon size={12} className="text-[#8B5CF6]" />
                  <p className="text-[11px] font-medium text-[#F5F7FA]">{t.title || "Data table"}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        {(t.headers || []).map((h, j) => (
                          <th key={j} className="px-3 py-2 text-[10px] font-semibold text-[#667386]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(t.rows || []).map((row, j) => (
                        <tr key={j}>
                          {row.map((cell, k) => (
                            <td key={k} className="px-3 py-1.5 text-[11px] text-[#9AA6B5]">{cell}</td>
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
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#667386] mb-2">
              <span className="inline-flex items-center gap-1"><Lightbulb size={11} /> Recommendations</span>
            </p>
            <div className="space-y-2">
              {recommendations.map((r, i) => (
                <div key={i} className="rounded-[8px] bg-[#141E2F] border border-[#253248] px-3 py-2.5 flex items-start gap-2">
                  <TrendingUp size={12} className="text-[#8B5CF6] flex-none mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[#F5F7FA]">{r.action}</p>
                    {r.rationale && <p className="text-[11px] text-[#9AA6B5] mt-0.5">{r.rationale}</p>}
                  </div>
                  {r.priority && (
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border flex-none ${statusColor(r.priority)}`}>
                      {r.priority}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}