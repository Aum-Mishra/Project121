import { useState } from "react";
import { DemoQuestion, DATA_NOTICE } from "../data/demoQuestions";
import { sourceById, fileById } from "../data/demoCore";
import ChartCard from "./DemoCharts";
import DocumentViewer, { DocTypeChip } from "./DemoDocs";

type InlineSeg = { text: string; bold: boolean };

function toInline(text: string): InlineSeg[] {
  const segs: InlineSeg[] = [];
  let bold = false;
  for (const part of text.split("**")) {
    if (part) segs.push({ text: part, bold });
    bold = !bold;
  }
  return segs;
}

function renderInline(text: string) {
  return toInline(text).map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>));
}

function StatusChip({ status }: { status: "good" | "warning" | "critical" }) {
  const styles = {
    good: { bg: "#DCFCE7", color: "#15803D" },
    warning: { bg: "#FEF3C7", color: "#92400E" },
    critical: { bg: "#FEE2E2", color: "#991B1B" },
  }[status];
  const label = { good: "OK", warning: "Watch", critical: "Critical" }[status];
  return <span className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: styles.bg, color: styles.color }}>{label}</span>;
}

export default function DemoAnswer({ question, compact = false }: { question: DemoQuestion; compact?: boolean }) {
  const [openFile, setOpenFile] = useState<string | null>(null);
  const statuses = (question.findings || []).map((f) => f.status);
  const verdictStyle = statuses.includes("critical")
    ? { bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" }
    : statuses.includes("warning")
      ? { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E" }
      : { bg: "#F0FDF4", border: "#BBF7D0", color: "#15803D" };

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden w-full">
      {!compact && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 flex items-center justify-center" style={{ color: "#0F766E" }}>◈</span>
            <span className="text-[11px] font-semibold" style={{ color: "#334155" }}>{question.agent}</span>
            <span className="text-[10px]" style={{ color: "#94A3B8" }}>{question.agent} · {question.model}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {question.complexity === "complex" ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#F3E8FF", color: "#7E22CE" }}>⚙ COMPLEX PATH</span>
            ) : question.complexity === "medium" ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>🔍 KNOWLEDGE PATH</span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#F0FDFA", color: "#0F766E" }}>⚡ FAST PATH</span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700" style={{ border: "1px solid #BBF7D0" }}>✓ VERIFIED</span>
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Verdict */}
        <div className="rounded-xl px-3.5 py-2.5 text-[13px] font-medium border"
          style={{ background: verdictStyle.bg, borderColor: verdictStyle.border, color: verdictStyle.color }}>
          {renderInline(question.verdict)}
        </div>

        {/* Final Answer */}
        <div className="text-[13px] leading-relaxed" style={{ color: "#334155" }}>
          {(question.answer || "").split("\n").map((line, i) => {
            if (line.trim() === "") return <div key={i} className="h-2" />;
            if (line.trim().startsWith("- "))
              return (
                <div key={i} className="flex gap-2 pl-1 py-0.5">
                  <span className="text-[#0F766E] flex-shrink-0">•</span>
                  <span>{renderInline(line.trim().slice(2))}</span>
                </div>
              );
            if (/^#[# ]/.test(line.trim()))
              return <div key={i} className="font-semibold pt-1 text-[13px]" style={{ color: "#0F172A" }}>{renderInline(line.trim().replace(/^#+ /, ""))}</div>;
            if (/^\|/.test(line.trim()))
              return (
                <div key={i} className="font-mono text-[11px] px-2 py-1 my-1 rounded overflow-x-auto whitespace-pre" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
                  {line}
                </div>
              );
            return <p key={i} className="mb-1.5">{renderInline(line)}</p>;
          })}
        </div>

        {/* Findings */}
        {question.findings.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={{ background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
              Key Findings
            </div>
            <div className="divide-y" style={{ borderColor: "#F1F5F9" }}>
              {(question.findings || []).map((f, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px]" style={{ color: "#64748B" }}>{f.label}</div>
                  </div>
                  <div className="text-[12px] font-semibold text-right" style={{ color: "#0F172A" }}>{f.value}</div>
                  <StatusChip status={f.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charts */}
        {(question.charts || []).length > 0 && (
          <div className="grid gap-3">
            {(question.charts || []).map((id) => <ChartCard key={id} id={id} />)}
          </div>
        )}

        {/* Sources */}
        <div className="rounded-xl p-3" style={{ border: "1px solid #E2E8F0", background: "#F8FAFC" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Evidence Sources</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white border" style={{ borderColor: "#E2E8F0", color: "#475569" }}>{(question.sources || []).length} USED</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(question.sources || []).map((sid, i) => {
              const src = sourceById(sid);
              if (!src) return null;
              return (
                <span key={i} className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-white border" style={{ borderColor: "#E2E8F0", color: "#334155" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: ["#0F766E", "#2563EB", "#7C3AED", "#D97706"][i % 4] }} />
                  {src.title} {src.version && <span className="text-slate-400">v{src.version}</span>}
                </span>
              );
            })}
          </div>
        </div>

        {/* Files */}
        {(question.files || []).length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Generated / Referenced Documents</div>
            <div className="flex flex-wrap gap-2">
              {(question.files || []).map((fid) => {
                const f = fileById(fid);
                if (!f) return null;
                return (
                  <button key={fid} onClick={() => setOpenFile(fid)} title={f.blurb}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:border-teal-400 hover:bg-teal-50/50 transition-colors text-left"
                    style={{ borderColor: "#E2E8F0" }}>
                    {f.type === "PDF" ? <span className="text-[13px]">📄</span> : f.type === "DOCX" ? <span className="text-[13px]">📝</span> : f.type === "XLSX" ? <span className="text-[13px]">📊</span> : <span className="text-[13px]">📈</span>}
                    <span>
                      <span className="block text-[12px] font-medium" style={{ color: "#0F172A" }}>{f.name}</span>
                      <span className="block text-[10px]" style={{ color: "#94A3B8" }}>{f.size} · Open preview</span>
                    </span>
                    <DocTypeChip type={f.type} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Verification */}
        <div className="flex flex-wrap gap-2 pt-1">
          {(question.verified || []).map((v) => (
            <span key={v} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md" style={{ background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0" }}>
              <span>✓</span>{v}
            </span>
          ))}
        </div>

        <div className="text-[10px] flex items-center gap-1.5 pt-1" style={{ color: "#94A3B8" }}>
          <span>◈</span>
          <span>{DATA_NOTICE}</span>
        </div>
      </div>

      {openFile && <DocumentViewer fileId={openFile} onClose={() => setOpenFile(null)} />}
    </div>
  );
}
