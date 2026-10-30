import { useState } from "react";
import type { PcMsg } from "../data/projectChats";
import { getQuestionById } from "../data/demoQuestions";
import { fileById, sourceById } from "../data/demoCore";
import { DATA_NOTICE } from "../data/demoQuestions";
import type { GenericAnswer } from "../data/genericQueries";
import DemoAnswer from "./DemoAnswer";
import DocumentViewer, { DocTypeChip } from "./DemoDocs";
import ApprovalPanel from "./ApprovalPanel";
import AnalysisCard from "./AnalysisCard";

export const avatarColor = (name: string) => {
  const colors = ["#0F766E", "#2563EB", "#7C3AED", "#D97706", "#DC2626", "#0891B2"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  return colors[h % colors.length];
};

export const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase();

function renderText(text: string) {
  const segs: { text: string; bold: boolean }[] = [];
  let bold = false;
  for (const part of text.split("**")) {
    if (part) segs.push({ text: part, bold });
    bold = !bold;
  }
  return segs.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>));
}

function TextBlock({ text, styleColor = "#334155" }: { text: string; styleColor?: string }) {
  return (
    <div className="text-[13px] leading-relaxed" style={{ color: styleColor, whiteSpace: "pre-wrap" }}>
      {text.split("\n").map((line, i) => {
        if (line.trim() === "") return <div key={i} className="h-2" />;
        if (/^#{1,3} /.test(line.trim()))
          return <div key={i} className="font-semibold pt-1 pb-0.5 text-[13px]" style={{ color: "#0F172A" }}>{renderText(line.trim().replace(/^#+ /, ""))}</div>;
        if (/^[-•] /.test(line.trim()))
          return (
            <div key={i} className="flex gap-2 pl-1 py-0.5">
              <span className="text-[#0F766E] flex-shrink-0">•</span>
              <span>{renderText(line.trim().slice(2))}</span>
            </div>
          );
        if (/^\d+\. /.test(line.trim()))
          return (
            <div key={i} className="flex gap-2 pl-1 py-0.5">
              <span className="text-[#0F766E] flex-shrink-0 font-semibold">{line.match(/^\d+\./)?.[0]}</span>
              <span>{renderText(line.replace(/^\d+\. /, ""))}</span>
            </div>
          );
        if (/^\|/.test(line.trim()))
          return (
            <div key={i} className="font-mono text-[11px] px-2 py-1 my-1 rounded overflow-x-auto whitespace-pre" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
              {line}
            </div>
          );
        return <p key={i} className="mb-1">{renderText(line)}</p>;
      })}
    </div>
  );
}

export function SourcesRow({ sources }: { sources: any[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="rounded-xl p-4 mt-4 bg-[#F8FAFC] border border-[#E2E8F0]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800">Evidence Used</span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-[#E2E8F0] text-slate-600">{sources.length} USED</span>
      </div>
      <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
        {sources.map((srcRaw, i) => {
          // Fallback to title string if it's not an object
          const isObj = typeof srcRaw === 'object' && srcRaw !== null;
          const rawTitle = isObj ? srcRaw.title : (sourceById(srcRaw)?.title ?? srcRaw);
          const title = rawTitle ? String(rawTitle) : "Unknown Source";
          const type = isObj && srcRaw.type ? srcRaw.type : (title.includes("INS") ? "Inspection Report" : "Document");
          const year = isObj && srcRaw.year ? srcRaw.year : (title.match(/202\d/) ? title.match(/202\d/)[0] : "");
          const snippet = isObj && srcRaw.snippet ? srcRaw.snippet : "";
          
          return (
            <div key={i} className="flex flex-col gap-1.5 text-[12px] p-3 rounded-lg bg-white border border-[#E2E8F0] shadow-sm">
              <div className="flex items-start justify-between">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: ["#0F766E", "#2563EB", "#7C3AED", "#D97706"][i % 4] }} />
                  {title}
                </div>
                {year && <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 rounded">{year}</span>}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{type}</div>
              {snippet && <div className="text-[11px] text-slate-600 italic line-clamp-2 mt-1 px-2 border-l-2 border-slate-200">"{snippet}"</div>}
              <button className="text-[10px] text-teal-600 font-medium hover:underline text-left mt-1 w-max">
                [View Original Document]
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FilesRow({ files }: { files: string[] }) {
  const [openFile, setOpenFile] = useState<string | null>(null);
  if (!files || files.length === 0) return null;
  return (
    <>
      <div className="mt-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-800 mb-1.5">Generated / Referenced Documents</div>
        <div className="flex flex-wrap gap-2">
          {files.map((fid) => {
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
      {openFile && <DocumentViewer fileId={openFile} onClose={() => setOpenFile(null)} />}
    </>
  );
}

export function TableBlock({ table }: { table: { caption?: string; headers: string[]; rows: string[][] } }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl" style={{ border: "1px solid #E2E8F0" }}>
      {table.caption && (
        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800" style={{ background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
          {table.caption}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
              {table.headers.map((h, i) => (
                <th key={i} className="text-left px-3 py-2 font-semibold whitespace-nowrap" style={{ color: "#334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                {r.map((cell, j) => (
                  <td key={j} className="px-3 py-2 whitespace-nowrap"
                    style={{
                      color: cell === "EXCEEDS" || cell === "BELOW" || cell === "CRITICAL" || cell === "AT ALARM"
                        ? "#DC2626"
                        : cell === "WATCH" || cell === "WATCH" || cell === "BELOW MIN" ? "#B45309" : "#475569",
                      fontWeight: j === 0 || cell === "EXCEEDS" || cell === "BELOW" ? 600 : 400,
                    }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentHeader({ name, note }: { name: string; note: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5 ml-1">
      <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold bg-teal-600 text-white shadow-sm">AI</div>
      <span className="text-[13px] font-semibold" style={{ color: "#1E293B" }}>{name}</span>
      <span className="text-[11px]" style={{ color: "#94A3B8" }}>{note}</span>
    </div>
  );
}

function Bubble({ msg }: { msg: Extract<PcMsg, { kind: "text" }> }) {
  if (msg.role === "user") {
    if (msg.collab) {
      return (
        <div className="flex justify-start">
          <div className="max-w-3xl flex gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-1" style={{ background: avatarColor(msg.author) }}>
              {initials(msg.author)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold" style={{ color: "#475569" }}>{msg.author}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "#F1F5F9", color: "#64748B" }}>COLLABORATOR</span>
                {msg.sources && msg.sources.length > 0 && <span className="text-[10px]" style={{ color: "#94A3B8" }}>· shared context</span>}
              </div>
              <div className="rounded-2xl px-4 py-3 text-[13px] leading-relaxed border shadow-sm rounded-tl-sm" style={{ background: "#FFFFFF", borderColor: "#E2E8F0", color: "#334155", whiteSpace: "pre-wrap" }}>
                {msg.text}
              </div>
              {msg.files && <FilesRow files={msg.files} />}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-end">
        <div className="max-w-3xl flex flex-col items-end">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>You · {msg.author}</span>
          </div>
          <div className="rounded-2xl px-4 py-3 text-[13px] leading-relaxed bg-teal-600 text-white shadow-sm rounded-tr-sm" style={{ whiteSpace: "pre-wrap" }}>
            {renderText(msg.text)}
          </div>
          {msg.files && msg.files.length > 0 && <div className="mt-2">{/* attached files render in bubble row below */}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-3xl w-full">
        <AgentHeader name={msg.author} note="Sovereign-1 (Local)" />
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 rounded-tl-sm">
          <TextBlock text={msg.text} />
          {msg.analysis && <AnalysisCard analysis={msg.analysis} />}
          {(msg as any).table && <TableBlock table={(msg as any).table} />}
          {(msg as any).sources && <SourcesRow sources={(msg as any).sources} />}
          {msg.files && <FilesRow files={msg.files} />}
          {msg.approval && (
            <div className="mt-3">
              <ApprovalPanel approval={msg.approval} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DemoBubble({ msg }: { msg: Extract<PcMsg, { kind: "demo" }> }) {
  const q = msg.syntheticData || getQuestionById(msg.qId);
  if (!q) return null;
  return (
    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className="w-full max-w-3xl">
        {msg.role === "user" ? (
          <div className="flex justify-end">
            <div>
              <div className="flex items-center gap-2 mb-1 justify-end">
                <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>You · Anita Rao</span>
              </div>
              <div className="rounded-2xl px-4 py-3 text-[13px] leading-relaxed bg-teal-600 text-white shadow-sm rounded-tr-sm" style={{ whiteSpace: "pre-wrap" }}>
                {q.question}
              </div>
            </div>
          </div>
        ) : (
          <DemoAnswer question={q} />
        )}
      </div>
    </div>
  );
}

export default function ChatMessages({ messages }: { messages: PcMsg[] }) {
  return (
    <div className="space-y-5">
      {messages.map((m, i) =>
        m.kind === "demo" ? <DemoBubble key={i} msg={m} /> : <Bubble key={i} msg={m} />
      )}
    </div>
  );
}

export function GenericAnswerCard({ answer }: { answer: GenericAnswer }) {
  const pathStyle = {
    complex: { bg: "#F3E8FF", color: "#7E22CE", label: "⚙ COMPLEX PATH · MULTI-AGENT" },
    knowledge: { bg: "#EFF6FF", color: "#1D4ED8", label: "🔍 KNOWLEDGE PATH · HYBRID RAG" },
    fast: { bg: "#F0FDFA", color: "#0F766E", label: "⚡ FAST PATH · DIRECT RETRIEVAL" },
  }[answer.path];

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden w-full">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 flex items-center justify-center" style={{ color: "#0F766E" }}>◈</span>
          <span className="text-[11px] font-semibold" style={{ color: "#334155" }}>{answer.agent}</span>
          <span className="text-[10px]" style={{ color: "#94A3B8" }}>{answer.intent}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: pathStyle.bg, color: pathStyle.color }}>{pathStyle.label}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700" style={{ border: "1px solid #BBF7D0" }}>✓ VERIFIED</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="rounded-xl px-3.5 py-2.5 text-[13px] font-medium border"
          style={{
            background: answer.findings.some((f) => f.status === "critical")
              ? "#FEF2F2" : answer.findings.some((f) => f.status === "warning")
                ? "#FFFBEB" : "#F0FDF4",
            borderColor: answer.findings.some((f) => f.status === "critical")
              ? "#FECACA" : answer.findings.some((f) => f.status === "warning")
                ? "#FDE68A" : "#BBF7D0",
            color: answer.findings.some((f) => f.status === "critical")
              ? "#991B1B" : answer.findings.some((f) => f.status === "warning")
                ? "#92400E" : "#15803D",
          }}>
          {renderText(answer.verdict)}
        </div>

        <TextBlock text={answer.answer} />

        {answer.findings.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800" style={{ background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
              Key Findings
            </div>
            <div className="divide-y" style={{ borderColor: "#F1F5F9" }}>
              {answer.findings.map((f, i) => {
                const chip = f.status === "critical" ? { bg: "#FEE2E2", color: "#991B1B", label: "Critical" }
                  : f.status === "warning" ? { bg: "#FEF3C7", color: "#92400E", label: "Watch" }
                    : { bg: "#DCFCE7", color: "#15803D", label: "OK" };
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0 text-[11px]" style={{ color: "#64748B" }}>{f.label}</div>
                    <div className="text-[12px] font-semibold text-right" style={{ color: "#0F172A" }}>{f.value}</div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: chip.bg, color: chip.color }}>{chip.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {answer.sources && <SourcesRow sources={answer.sources} />}
        {answer.files && <FilesRow files={answer.files} />}

        <div className="flex flex-wrap gap-2 pt-1">
          {answer.verified.map((v) => (
            <span key={v} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md" style={{ background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0" }}>
              <span>✓</span>{v}
            </span>
          ))}
        </div>

        {answer.approval && <ApprovalPanel approval={answer.approval} />}

        <div className="text-[10px] flex items-center gap-1.5 pt-1" style={{ color: "#94A3B8" }}>
          <span>◈</span>
          <span>{DATA_NOTICE}</span>
        </div>
      </div>
    </div>
  );
}