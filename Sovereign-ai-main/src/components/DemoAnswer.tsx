import { useState, type ReactNode } from "react"
import { DemoQuestion, DATA_NOTICE } from "../data/demoQuestions"
import { sourceById, fileById } from "../data/demoCore"
import ChartCard from "./DemoCharts"
import DocumentViewer, { DocTypeChip } from "./DemoDocs"

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000"

type InlineSeg = { text: string bold: boolean }

function renderLinks(text: string) {
  const out: ReactNode[] = []
  const re = /\[([^\]]+)\]\(\s*([^)\s]+)\s*\)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const href = match[2]
    const target = href.startsWith("/api/") ? API_BASE + href : href
    out.push(
      <a
        key={key++}
        href={target}
        target="_blank"
        rel="noreferrer"
        className="underline"
        style={{ color: "#0F766E" }}
      >
        {match[1]}
      </a>,
    )
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out.length ? out : text
}

function toInline(text: string): InlineSeg[] {
  const segs: InlineSeg[] = []
  let bold = false
  for (const part of text.split("**")) {
    if (part) segs.push({ text: part, bold })
    bold = !bold
  }
  return segs
}

function renderInline(text: string) {
  return toInline(text).map((s, i) =>
    s.bold ? (
      <strong key={i}>{renderLinks(s.text)}</strong>
    ) : (
      <span key={i}>{renderLinks(s.text)}</span>
    ),
  )
}

function StatusChip({ status }: { status: "good" | "warning" | "critical" }) {
  const styles = {
    good: { bg: "#DCFCE7", color: "#15803D" },
    warning: { bg: "#FEF3C7", color: "#92400E" },
    critical: { bg: "#FEE2E2", color: "#991B1B" },
  }[status]
  const label = { good: "OK", warning: "Watch", critical: "Critical" }[status]
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded font-semibold"
      style={{ background: styles.bg, color: styles.color }}
    >
      {label}
    </span>
  )
}

const chartStatusStyles = (status: string) => {
  const s = String(status || "").toUpperCase()
  if (s === "CRITICAL" || s === "EXCEEDS" || s === "HIGH")
    return {
      chipBg: "#FEE2E2",
      chipColor: "#991B1B",
      color: "#DC2626",
      text: "CRITICAL",
    }
  if (s === "WATCH" || s === "MEDIUM")
    return {
      chipBg: "#FEF3C7",
      chipColor: "#92400E",
      color: "#D97706",
      text: "WATCH",
    }
  return {
    chipBg: "#DCFCE7",
    chipColor: "#15803D",
    color: "#16A34A",
    text: "OK",
  }
}

function ResultChart({ chart }: { chart: any }) {
  const data = Array.isArray(chart?.data) ? chart.data : []
  if (!data.length) return null
  const W = 560
  const H = 168
  const padL = 44
  const padR = 12
  const padT = 16
  const padB = 24
  const style = chartStatusStyles(chart.status)
  const unit = chart.unit || ""
  const values = data
    .map((d) => Number(d.value))
    .filter((v) => Number.isFinite(v))
  const limit =
    typeof chart.limit === "number" && Number.isFinite(chart.limit)
      ? chart.limit
      : null
  const rawMax = Math.max(...values, limit ?? -Infinity, 0)
  const rawMin = Math.min(...values, limit ?? Infinity, 0)
  const lo = rawMin >= 0 ? 0 : rawMin * 1.1
  const hi = rawMax <= 0 ? 1 : rawMax * 1.12
  const span = hi - lo
  const y = (v: number) => padT + (1 - (v - lo) / span) * (H - padT - padB)
  const x = (i: number) =>
    padL +
    (data.length === 1
      ? (W - padL - padR) / 2
      : (i / (data.length - 1)) * (W - padL - padR))
  const ticks = Array.from({ length: 5 }, (_, k) => lo + (span * k) / 4)
  const barW = Math.min(44, ((W - padL - padR) / data.length) * 0.42)
  const isBar = chart.type === "bar"
  const path = data
    .map(
      (d, i) =>
        `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number(d.value)).toFixed(1)}`,
    )
    .join(" ")
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid #E2E8F0" }}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2"
        style={{ background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}
      >
        <span className="text-[11px] font-bold" style={{ color: "#0F172A" }}>
          {chart.title}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-bold"
          style={{ background: style.chipBg, color: style.chipColor }}
        >
          {style.text}
        </span>
      </div>
      <div className="p-2.5">
        <svg
          viewBox={`0 0 ${W} ${H + padT + 10}`}
          className="w-full h-auto"
          role="img"
          aria-label={chart.title}
        >
          {ticks.map((t, k) => (
            <g key={k}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(t)}
                y2={y(t)}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={y(t) + 3}
                textAnchor="end"
                fontSize="9"
                fill="#94A3B8"
              >
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          {limit !== null && (
            <g>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(limit)}
                y2={y(limit)}
                stroke="#DC2626"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <text
                x={W - padR}
                y={Math.max(8, y(limit) - 5)}
                textAnchor="end"
                fontSize="9"
                fontWeight="bold"
                fill="#B91C1C"
              >
                limit {limit} {unit}
              </text>
            </g>
          )}
          {isBar ? (
            data.map((d, i) => {
              const v = Number(d.value)
              return (
                <g key={i}>
                  <rect
                    x={x(i) - barW / 2}
                    y={y(v)}
                    width={barW}
                    height={Math.max(0, y(0) - y(v))}
                    rx="3"
                    fill={limit !== null && v >= limit ? "#DC2626" : "#0F766E"}
                    opacity="0.9"
                  />
                  <text
                    x={x(i)}
                    y={y(v) - 6}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="bold"
                    fill="#0F172A"
                  >
                    {v}
                  </text>
                  <text
                    x={x(i)}
                    y={H + padT + 8}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#64748B"
                  >
                    {d.label}
                  </text>
                </g>
              )
            })
          ) : (
            <g>
              <path
                d={path}
                fill="none"
                stroke="#0F766E"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {data.map((d, i) => (
                <g key={i}>
                  <circle
                    cx={x(i)}
                    cy={y(Number(d.value))}
                    r="4"
                    fill="#0F766E"
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                  <text
                    x={x(i)}
                    y={y(Number(d.value)) - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="bold"
                    fill="#0F172A"
                  >
                    {Number(d.value)}
                  </text>
                  <text
                    x={x(i)}
                    y={H + padT + 8}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#64748B"
                  >
                    {d.label}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px]" style={{ color: "#64748B" }}>
            {unit ? `unit: ${unit}` : ""}
          </span>
          <span className="text-[10px] text-right" style={{ color: "#94A3B8" }}>
            {chart.source || ""}
          </span>
        </div>
        {chart.explanation && (
          <p
            className="text-[11px] leading-relaxed mt-1.5 px-1"
            style={{ color: "#475569" }}
          >
            {renderInline(chart.explanation)}
          </p>
        )}
      </div>
    </div>
  )
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines
    .filter((l) => l.trim())
    .map((l) =>
      l.trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim()),
    )
  if (!rows.length) return null
  const hasSep = rows.length > 1 && /^:?-{2,}:?$/.test((rows[1] || [])[0] || "")
  const header = rows[0]
  const bodyRows = hasSep ? rows.slice(2) : rows.slice(1)
  return (
    <div
      className="my-2 rounded-lg overflow-x-auto"
      style={{ border: "1px solid #E2E8F0" }}
    >
      <table className="w-full text-[11px]">
        <thead>
          <tr
            style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}
          >
            {header.map((h, i) => (
              <th
                key={i}
                className="text-left px-2.5 py-1.5 font-semibold whitespace-nowrap"
                style={{ color: "#334155" }}
              >
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
              {r.map((c, j) => (
                <td
                  key={j}
                  className="px-2.5 py-1.5 align-top whitespace-nowrap"
                  style={{
                    color: j === 0 ? "#0F172A" : "#475569",
                    fontWeight: j === 0 ? 600 : 400,
                  }}
                >
                  {renderInline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderAnswer(text: string) {
  const lines = text.split("\n")
  const out: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*\|/.test(line)) {
      const block: string[] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        block.push(lines[i])
        i++
      }
      out.push(<MarkdownTable key={out.length} lines={block} />)
      continue
    }
    if (line.trim() === "") {
      out.push(<div key={out.length} className="h-2" />)
    } else if (line.trim().startsWith("- ")) {
      out.push(
        <div key={out.length} className="flex gap-2 pl-1 py-0.5">
          <span className="text-[#0F766E] flex-shrink-0">•</span>
          <span>{renderInline(line.trim().slice(2))}</span>
        </div>,
      )
    } else if (/^#[# ]/.test(line.trim())) {
      out.push(
        <div
          key={out.length}
          className="font-semibold pt-1 text-[13px]"
          style={{ color: "#0F172A" }}
        >
          {renderInline(line.trim().replace(/^#+ /, ""))}
        </div>,
      )
    } else {
      out.push(
        <p key={out.length} className="mb-1.5">
          {renderInline(line)}
        </p>,
      )
    }
    i++
  }
  return out
}

function AnalysisPanel({
  analysis,
  answerHasTable,
}: {
  analysis: any
  answerHasTable: boolean
}) {
  const risk = analysis?.risk_level || analysis?.severity || ""
  const riskStyle =
    String(risk).toUpperCase() === "HIGH"
      ? { bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" }
      : String(risk).toUpperCase() === "MEDIUM"
        ? { bg: "#FFFBEB", color: "#92400E", border: "#FDE68A" }
        : { bg: "#F0FDF4", color: "#15803D", border: "#BBF7D0" }
  const tables = Array.isArray(analysis?.tables)
    ? analysis.tables.filter(
        (t: any) =>
          t &&
          Array.isArray(t.headers) &&
          Array.isArray(t.rows) &&
          t.headers.length,
      )
    : []
  const showTables = tables.length > 0 && !answerHasTable
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid #E2E8F0" }}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2"
        style={{ background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
          Data Analysis
        </span>
        {risk && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{
              background: riskStyle.bg,
              color: riskStyle.color,
              border: `1px solid ${riskStyle.border}`,
            }}
          >
            RISK {String(risk).toUpperCase()}
          </span>
        )}
      </div>
      {showTables && (
        <div className="px-3 pb-3 space-y-3 pt-1">
          {tables.map((t: any, i: number) => (
            <div key={i}>
              {t.title && (
                <div
                  className="text-[11px] font-semibold mb-1"
                  style={{ color: "#334155" }}
                >
                  {t.title}
                </div>
              )}
              <MarkdownTable
                lines={[
                  `|${t.headers.join("|")}|`,
                  `|${t.headers.map(() => "---").join("|")}|`,
                  ...t.rows.map(
                    (r: any) => `|${(Array.isArray(r) ? r : []).join("|")}|`,
                  ),
                ]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DemoAnswer({
  question,
  compact = false,
}: {
  question: DemoQuestion
  compact?: boolean
}) {
  const [openFile, setOpenFile] = useState<string | null>(null)
  const statuses = (question.findings || []).map((f) => f.status)

  // Image-demo final card: render ONLY the exact response — no verdict chip,
  // no sources, no evidence, no plan, no charts, no notice. Strict demo branch.
  if ((question as any).imageDemo) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden w-full">
        <div className="p-4">
          <div
            className="text-[13px] leading-relaxed"
            style={{ color: "#334155" }}
          >
            {renderAnswer(question.answer || "")}
          </div>
        </div>
      </div>
    )
  }

  const verdictStyle = statuses.includes("critical")
    ? { bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" }
    : statuses.includes("warning")
      ? { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E" }
      : { bg: "#F0FDF4", border: "#BBF7D0", color: "#15803D" }

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden w-full">
      {!compact && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-b"
          style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="w-4 h-4 flex items-center justify-center"
              style={{ color: "#0F766E" }}
            >
              ◈
            </span>
            <span
              className="text-[11px] font-semibold"
              style={{ color: "#334155" }}
            >
              {question.agent}
            </span>
            <span className="text-[10px]" style={{ color: "#94A3B8" }}>
              {question.agent} · {question.model}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {question.complexity === "complex" ? (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: "#F3E8FF", color: "#7E22CE" }}
              >
                ⚙ COMPLEX PATH
              </span>
            ) : question.complexity === "medium" ? (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: "#EFF6FF", color: "#1D4ED8" }}
              >
                🔍 KNOWLEDGE PATH
              </span>
            ) : (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: "#F0FDFA", color: "#0F766E" }}
              >
                ⚡ FAST PATH
              </span>
            )}
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700"
              style={{ border: "1px solid #BBF7D0" }}
            >
              ✓ VERIFIED
            </span>
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Verdict */}
        <div
          className="rounded-xl px-3.5 py-2.5 text-[13px] font-medium border"
          style={{
            background: verdictStyle.bg,
            borderColor: verdictStyle.border,
            color: verdictStyle.color,
          }}
        >
          {renderInline(question.verdict)}
        </div>

        {/* Final Answer */}
        <div
          className="text-[13px] leading-relaxed"
          style={{ color: "#334155" }}
        >
          {renderAnswer(question.answer || "")}
        </div>

        {/* Findings */}
        {question.findings.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid #E2E8F0" }}
          >
            <div
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"
              style={{
                background: "#F8FAFC",
                borderBottom: "1px solid #F1F5F9",
              }}
            >
              Key Findings
            </div>
            <div className="divide-y" style={{ borderColor: "#F1F5F9" }}>
              {(question.findings || []).map((f, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px]" style={{ color: "#64748B" }}>
                      {f.label}
                    </div>
                  </div>
                  <div
                    className="text-[12px] font-semibold text-right"
                    style={{ color: "#0F172A" }}
                  >
                    {f.value}
                  </div>
                  <StatusChip status={f.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Execution Plan (restored — final card must mirror the live flight) */}
        {question.plan && question.plan.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid #E2E8F0" }}
          >
            <div
              className="flex items-center justify-between px-3.5 py-2"
              style={{
                background: "#F8FAFC",
                borderBottom: "1px solid #F1F5F9",
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                Execution Plan
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="text-[10px] font-bold"
                  style={{ color: "#0F766E" }}
                >
                  {question.plan.length} STEPS
                </span>
                <span
                  className="text-[10px] font-bold"
                  style={{
                    color:
                      question.complexity === "complex" ? "#7E22CE" : "#1D4ED8",
                  }}
                >
                  {question.complexity?.toUpperCase() || "MEDIUM"} PATH
                </span>
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {(question.plan || []).map((p, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3.5 py-2">
                  <span
                    className="w-4 h-4 rounded-full mt-0.5 flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                    style={{
                      background: "#F0FDF4",
                      border: "1px solid #BBF7D0",
                      color: "#15803D",
                    }}
                  >
                    ✓
                  </span>
                  <span className="text-[12px] text-slate-700 leading-snug">
                    {p}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Processing Console */}
        {question.proc_lines && question.proc_lines.length > 0 && (
          <div
            className="rounded-xl px-3.5 py-2.5 space-y-1 font-mono text-[11px] leading-relaxed"
            style={{ background: "#FAFAFA", border: "1px solid #E2E8F0" }}
          >
            {(question.proc_lines || []).map((l, i) => (
              <div
                key={i}
                className="flex gap-2 whitespace-nowrap overflow-hidden text-ellipsis"
              >
                <span className="text-slate-400 select-none">{"\u203A"}</span>
                <span
                  style={{
                    color: l.includes("\u2717")
                      ? "#B91C1C"
                      : l.startsWith("\u2713")
                        ? "#15803D"
                        : "#475569",
                  }}
                >
                  {l}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Charts */}
        {(question.charts || []).length > 0 && (
          <div className="grid gap-3">
            {(question.charts || []).map((c, i) =>
              typeof c === "object" && c !== null ? (
                <ResultChart key={i} chart={c} />
              ) : (
                <ChartCard key={String(c)} id={String(c)} />
              ),
            )}
          </div>
        )}

        {/* Data Analysis (live pipeline envelope: risk + tables) */}
        {(question as any).analysis?.risk_level ||
        ((question as any).analysis?.tables || []).length > 0 ? (
          <AnalysisPanel
            analysis={(question as any).analysis}
            answerHasTable={/\|/.test(question.answer || "")}
          />
        ) : null}

        {/* Sources */}
        <div
          className="rounded-xl p-3"
          style={{ border: "1px solid #E2E8F0", background: "#F8FAFC" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Evidence Sources
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white border"
              style={{ borderColor: "#E2E8F0", color: "#475569" }}
            >
              {(question.sources || []).length} USED
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(question.sources || []).map((sid, i) => {
              const isObj = typeof sid === "object" && sid !== null
              const src: any = isObj ? sid : sourceById(sid)
              const title = src ? src.title : null
              if (!title) return null
              return (
                <span
                  key={i}
                  className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-white border"
                  style={{ borderColor: "#E2E8F0", color: "#334155" }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: ["#0F766E", "#2563EB", "#7C3AED", "#D97706"][
                        i % 4
                      ],
                    }}
                  />
                  {title}
                  {src.version && (
                    <span className="text-slate-400">v{src.version}</span>
                  )}
                  {src.year && (
                    <span className="text-slate-400">{src.year}</span>
                  )}
                </span>
              )
            })}
          </div>
        </div>

        {/* Files */}
        {(question.files || []).length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Generated / Referenced Documents
            </div>
            <div className="flex flex-wrap gap-2">
              {(question.files || []).map((fid, i) => {
                const isObj = typeof fid === "object" && fid !== null
                const f: any = isObj ? fid : fileById(fid)
                if (!f) return null
                const ftype = String(f.type || f.format || "").toUpperCase()
                const icon =
                  ftype === "PDF"
                    ? "📄"
                    : ftype === "DOCX"
                      ? "📝"
                      : ftype === "XLSX"
                        ? "📊"
                        : ftype === "CSV"
                          ? "📈"
                          : "🗎"
                const fileName = f.name || f.title || "Document"
                const failed = f.status === "FAILED" || f.status === "failed"

                if (isObj && f.url) {
                  return (
                    <a
                      key={i}
                      href={`${API_BASE}${f.url}`}
                      title={`Download ${fileName}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:border-teal-400 hover:bg-teal-50/50 transition-colors text-left no-underline"
                      style={{ borderColor: "#E2E8F0" }}
                    >
                      <span className="text-[13px]">{icon}</span>
                      <span>
                        <span
                          className="block text-[12px] font-medium"
                          style={{ color: "#0F172A" }}
                        >
                          {fileName}
                        </span>
                        <span
                          className="block text-[10px]"
                          style={{ color: "#94A3B8" }}
                        >
                          {f.size ? `${f.size} · ` : ""}Download
                        </span>
                      </span>
                      <DocTypeChip type={ftype} />
                      <span className="text-[11px] font-bold px-2 py-1 rounded-md bg-teal-600 text-white">
                        Download
                      </span>
                    </a>
                  )
                }
                if (failed) {
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-red-50/40 text-left"
                      style={{ borderColor: "#FECACA" }}
                      title={f.error}
                    >
                      <span className="text-[13px]">{icon}</span>
                      <span>
                        <span
                          className="block text-[12px] font-medium"
                          style={{ color: "#991B1B" }}
                        >
                          {fileName}
                        </span>
                        <span
                          className="block text-[10px]"
                          style={{ color: "#B45309" }}
                        >
                          {f.error || "Generation failed"}
                        </span>
                      </span>
                      <DocTypeChip type={ftype} />
                    </div>
                  )
                }
                return (
                  <button
                    key={i}
                    onClick={() => setOpenFile(String(fid))}
                    title={f.blurb || fileName}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:border-teal-400 hover:bg-teal-50/50 transition-colors text-left"
                    style={{ borderColor: "#E2E8F0" }}
                  >
                    {icon}
                    <span>
                      <span
                        className="block text-[12px] font-medium"
                        style={{ color: "#0F172A" }}
                      >
                        {fileName}
                      </span>
                      <span
                        className="block text-[10px]"
                        style={{ color: "#94A3B8" }}
                      >
                        {f.size ? `${f.size} · ` : ""}Open preview
                      </span>
                    </span>
                    <DocTypeChip type={ftype} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Verification */}
        <div className="flex flex-wrap gap-2 pt-1">
          {(question.verified || []).map((v) => (
            <span
              key={v}
              className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md"
              style={{
                background: "#F0FDF4",
                color: "#15803D",
                border: "1px solid #BBF7D0",
              }}
            >
              <span>✓</span>
              {v}
            </span>
          ))}
        </div>

        <div
          className="text-[10px] flex items-center gap-1.5 pt-1"
          style={{ color: "#94A3B8" }}
        >
          <span>◈</span>
          <span>{DATA_NOTICE}</span>
        </div>
      </div>

      {openFile && (
        <DocumentViewer fileId={openFile} onClose={() => setOpenFile(null)} />
      )}
    </div>
  )
}
