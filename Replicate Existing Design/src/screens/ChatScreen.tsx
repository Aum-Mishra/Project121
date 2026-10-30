import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Paperclip, BookOpen, ImageIcon, ChevronDown, ChevronUp,
  X, ExternalLink, AlertTriangle, Check, Circle, Play, Terminal,
  Cpu, HardDrive, Clock, Wifi, FileText, Sparkles, Code, Settings,
  Zap, Eye, Shield, Loader, ChevronRight, Loader2, Plus, MessageSquare,
  FileSpreadsheet, RefreshCw, Download, Package, File, Pencil, Trash2,
} from "lucide-react";
import { api, ChatEvent, MessageRecord, ConversationSummary, ChatSource, ChatArtifact, ChatAttachmentRecord } from "../services/api";
import AnalysisView, { AnalysisEnvelope } from "../components/AnalysisView";

type Mode = "ask" | "code";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  sources?: ChatSource[];
  artifacts?: ChatArtifact[];
  model?: string;
  verified?: boolean | null;
  analysis?: AnalysisEnvelope;
}

type EvidenceItem = ChatSource;

interface AgentStepView {
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
}

interface ArtifactLink {
  artifact_id: string;
  name?: string;
  template?: string;
  format?: string;
  download_url?: string;
  approval_id?: string | null;
  version?: number;
  parent_artifact_id?: string | null;
}

// ── SSE stream parser ─────────────────────────────────────────────────────────

async function* streamEvents(res: Response): AsyncGenerator<ChatEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6)) as ChatEvent;
          } catch {
            /* ignore malformed */
          }
        }
      }
    }
  }
}

// ── Evidence Drawer ───────────────────────────────────────────────────────────

function EvidenceDrawer({ source, index, onClose }: {
  source: EvidenceItem;
  index: number;
  onClose: () => void;
}) {
  const num = String(index + 1).padStart(2, "0");
  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <aside
        className="w-[420px] h-full bg-[#0F1726] border-l border-[#253248] flex flex-col animate-slide-right overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-none px-5 py-4 border-b border-[#1a2740] flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-semibold text-[#667386] font-mono">SOURCE {num}</span>
              {source.section && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded text-[#9AA6B5] bg-[#253248]">
                  {source.section}
                </span>
              )}
            </div>
            <h2 className="text-[14px] font-semibold text-[#F5F7FA] leading-snug break-all">
              {source.document_id || "Retrieved source"}
            </h2>
            <p className="text-[11px] text-[#667386] mt-0.5">
              {source.page ? `Page ${source.page}` : "Extracted passage"} · {source.source}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-[5px] flex items-center justify-center text-[#667386] hover:text-[#F5F7FA] hover:bg-[#141E2F] transition-all flex-none">
            <X size={13} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[#1a2740] flex items-center gap-3">
          <p className="text-[10px] text-[#667386]">Relevance</p>
          <div className="flex-1 h-1 bg-[#253248] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#14B8A6] rounded-full transition-all"
              style={{ width: `${Math.min(100, source.relevance ?? 0)}%` }}
            />
          </div>
          <span className="text-[10px] font-semibold font-mono text-[#8B5CF6]">
            {source.relevance != null ? `${Math.round(source.relevance)}%` : "—"}
          </span>
        </div>

        <div className="px-5 py-4 border-b border-[#1a2740]">
          <p className="text-[9px] font-semibold tracking-[0.14em] text-[#3a4a60] uppercase mb-3">Extracted Passage</p>
          <div className="rounded-[6px] bg-[#141E2F] border border-[#253248] p-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#8B5CF6] rounded-r-full" />
            <p className="text-[12.5px] text-[#F5F7FA] leading-relaxed pl-2">{source.content}</p>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-[6px] bg-[#0A1A18] border border-[#14B8A6]/20 p-3 flex items-start gap-2.5">
            <Shield size={13} className="text-[#14B8A6] flex-none mt-0.5" />
            <p className="text-[11px] text-[#14B8A6] leading-relaxed">
              Retrieved from ApexPetro"s local knowledge base. No data is transmitted externally.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ── Agent Plan Card ───────────────────────────────────────────────────────────

function AgentPlanCard({ steps, running }: { steps: AgentStepView[]; running: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const done = steps.filter((s) => s.status === "completed").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const runningIndex = steps.findIndex((s) => s.status === "running");
  const terminal = running || failed > 0 || (steps.length > 0 && done === steps.length);

  return (
    <div className="rounded-[8px] bg-[#141E2F] border border-[#253248] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#182337] transition-colors text-left"
      >
        <div className={`w-7 h-7 rounded-[6px] flex items-center justify-center flex-none ${
          running ? "bg-[#8B5CF6]/15" : failed > 0 ? "bg-[#EF4444]/15" : "bg-[#14B8A6]/12"
        }`}>
          {running
            ? <Loader size={13} className="text-[#8B5CF6] animate-spin-slow" />
            : failed > 0
            ? <X size={13} className="text-[#EF4444]" />
            : <Check size={13} className="text-[#14B8A6]" />}
        </div>
        <div className="flex-1">
          <p className="text-[12.5px] font-semibold text-[#F5F7FA]">Knowledge Agent</p>
          <p className="text-[10px] text-[#667386]">Agent · {steps.length} steps{failed > 0 ? " · an issue occurred" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-20 h-[3px] bg-[#253248] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  running
                    ? "bg-gradient-to-r from-[#8B5CF6] to-[#8B5CF6]/60"
                    : failed > 0
                    ? "bg-gradient-to-r from-[#EF4444] to-[#EF4444]/60"
                    : "bg-gradient-to-r from-[#8B5CF6] to-[#14B8A6]"
                }`}
                style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-[#9AA6B5]">{done}/{steps.length}</span>
          </div>
          {expanded ? <ChevronUp size={12} className="text-[#667386]" /> : <ChevronDown size={12} className="text-[#667386]" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#253248] px-4 py-2.5 space-y-px">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3 py-1.5 px-2 rounded-[5px]">
              <div className="flex-none mt-px">
                {step.status === "completed" ? (
                  <div className="w-[14px] h-[14px] rounded-full bg-[#14B8A6]/15 flex items-center justify-center">
                    <Check size={8} className="text-[#14B8A6]" />
                  </div>
                ) : step.status === "failed" ? (
                  <div className="w-[14px] h-[14px] rounded-full bg-[#EF4444]/15 flex items-center justify-center">
                    <X size={8} className="text-[#EF4444]" />
                  </div>
                ) : step.status === "running" ? (
                  <div className="w-[14px] h-[14px] rounded-full bg-[#8B5CF6]/25 flex items-center justify-center">
                    <span className="w-[5px] h-[5px] rounded-full bg-[#8B5CF6] animate-pulse-dot" />
                  </div>
                ) : (
                  <div className="w-[14px] h-[14px] rounded-full border border-[#253248] flex items-center justify-center">
                    <Circle size={4} className="text-[#3a4a60]" fill="#3a4a60" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`flex-1 text-[11.5px] leading-snug ${
                  step.status === "failed"
                    ? "text-[#F87171] line-through decoration-[#F87171]/50"
                    : step.status === "completed"
                    ? "text-[#9AA6B5]"
                    : step.status === "running"
                    ? "text-[#A78BFA] font-medium"
                    : "text-[#3a4a60]"
                }`}>
                  {step.label}
                  {step.status === "running" && (
                    <span className="ml-2 text-[9px] text-[#8B5CF6]/60 font-mono animate-blink">running…</span>
                  )}
                </span>
                {step.status === "failed" && step.error && (
                  <p className="text-[10px] text-[#EF4444]/80 mt-0.5 font-mono">{step.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AiBubble with persistent sources ─────────────────────────────────────────

function AiBubble({ message, index, onViewSource, onNavigate }: {
  message: ChatMessage;
  index: number;
  onViewSource: (e: EvidenceItem, i: number) => void;
  onNavigate?: (view: string) => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const srcs = message.sources || [];
  const arts = message.artifacts || [];

  return (
    <div className="flex gap-3 max-w-[680px]">
      <div className="w-8 h-8 rounded-[8px] bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] flex items-center justify-center flex-none mt-0.5 shadow-lg shadow-[#8B5CF6]/20">
        <Zap size={12} className="text-white" />
      </div>
      <div className="flex-1 min-w-0 space-y-3.5">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold text-[#8B5CF6]">Knowledge Agent</p>
          <span className="text-[9px] bg-[#8B5CF6]/12 text-[#8B5CF6] px-1.5 py-0.5 rounded-[3px] font-semibold">Agent</span>
          {message.model && <p className="text-[10px] text-[#667386]">{message.model}</p>}
          {message.verified !== null && message.verified !== undefined && (
            <span className={`ml-auto flex items-center gap-1 text-[10.5px] font-bold ${
              message.verified ? "text-[#22C55E]" : "text-[#F59E0B]"
            }`}>
              {message.verified ? <Check size={11} /> : <AlertTriangle size={11} />}
              {message.verified ? "VERIFIED" : "REVIEW RECOMMENDED"}
            </span>
          )}
          {message.created_at && <p className="text-[10px] text-[#667386] ml-auto">{message.created_at}</p>}
        </div>

        <div className="rounded-[8px] bg-[#141E2F] border border-[#253248] p-4">
          <div className="text-[13.5px] text-[#F5F7FA] leading-relaxed whitespace-pre-wrap">{message.content}</div>
        </div>

        {!!srcs.length && (
          <div className="rounded-[8px] bg-[#141E2F] border border-[#253248] overflow-hidden">
            <button
              onClick={() => setSourcesOpen(!sourcesOpen)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#182337] transition-colors"
            >
              <span className="text-[12px] font-semibold text-[#F5F7FA] flex-1 text-left">
                Sources ({srcs.length})
              </span>
              {sourcesOpen ? <ChevronUp size={12} className="text-[#667386]" /> : <ChevronDown size={12} className="text-[#667386]" />}
            </button>
            {sourcesOpen && (
              <div className="border-t border-[#253248] divide-y divide-[#253248]">
                {srcs.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => onViewSource(src, i)}
                    className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-[#182337] group transition-colors text-left"
                  >
                    <span className="text-[10px] font-mono font-semibold text-[#667386] w-5 flex-none mt-px">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[#F5F7FA] leading-snug break-all">{src.document_id}</p>
                      <p className="text-[10px] text-[#667386] mt-0.5">
                        {src.page ? `Page ${src.page}` : "Passage"}{src.section ? ` · ${src.section}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-none">
                      <div className="w-8 h-[3px] bg-[#253248] rounded-full overflow-hidden">
                        <div className="h-full bg-[#8B5CF6] rounded-full" style={{ width: `${Math.min(100, src.relevance ?? 0)}%` }} />
                      </div>
                      <ChevronRight size={10} className="text-[#3a4a60] group-hover:text-[#667386] transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!!arts.length && <GeneratedArtifactsCard artifacts={arts as ArtifactLink[]} />}

        {message.analysis && Object.keys(message.analysis).length > 0 && (
          <AnalysisView analysis={message.analysis} onNavigate={onNavigate} />
        )}
      </div>
    </div>
  );
}

// ── Generated Artifacts Card ──────────────────────────────────────────────────

function artifactExt(format?: string): string {
  return (format || "file").toUpperCase();
}

function artifactIcon(format?: string) {
  const f = (format || "").toLowerCase();
  if (f.includes("xls") || f.includes("sheet")) return FileSpreadsheet;
  if (f.includes("ppt")) return FileText;
  if (f.includes("py") || f.includes("code")) return Package;
  return FileText;
}

function GeneratedArtifactsCard({ artifacts }: { artifacts: ArtifactLink[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-[8px] bg-[#0F1726] border border-[#14B8A6]/25 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-[#141E2F] transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-[6px] bg-[#14B8A6]/12 flex items-center justify-center flex-none">
          <FileText size={13} className="text-[#14B8A6]" />
        </div>
        <div className="flex-1">
          <p className="text-[12.5px] font-semibold text-[#F5F7FA]">Generated documents</p>
          <p className="text-[10px] text-[#667386]">{artifacts.length} artifact{artifacts.length === 1 ? "" : "s"} ready for review</p>
        </div>
        {open ? <ChevronUp size={12} className="text-[#667386]" /> : <ChevronDown size={12} className="text-[#667386]" />}
      </button>
      {open && (
        <div className="border-t border-[#253248] divide-y divide-[#253248]">
          {artifacts.map((art) => {
            const Icon = artifactIcon(art.format);
            return (
              <div key={art.artifact_id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-[7px] bg-[#8B5CF6]/12 flex items-center justify-center flex-none">
                  <Icon size={14} className="text-[#8B5CF6]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-[#F5F7FA] truncate">{art.name || "Generated artifact"}</p>
                  <p className="text-[10px] text-[#667386]">
                    {artifactExt(art.format)}{art.template ? ` · ${art.template.replace(/_/g, " ")}` : ""} · READY FOR REVIEW
                  </p>
                </div>
                <a
                  href={api.artifacts.downloadUrl(art.artifact_id)}
                  className="flex-none w-8 h-8 rounded-[6px] flex items-center justify-center text-[#14B8A6] border border-[#14B8A6]/25 hover:bg-[#14B8A6]/10 transition-all"
                  title="Download artifact"
                >
                  <Download size={13} />
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Message Row ───────────────────────────────────────────────────────────────

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[580px]">
        <div className="bg-[#141E2F] border border-[#253248] rounded-[12px] rounded-tr-[4px] px-4 py-3.5">
          <p className="text-[14px] text-[#F5F7FA] leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
        {message.created_at && (
          <p className="text-[10px] text-[#667386] mt-1.5 text-right">{message.created_at}</p>
        )}
      </div>
    </div>
  );
}

// ── Conversation Sidebar ──────────────────────────────────────────────────────

function ConversationSidebar({ conversations, activeId, onSelect, onNew, onRename, onDelete }: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renamingId) renameRef.current?.select();
  }, [renamingId]);

  function startRename(id: string, current: string | null) {
    setRenamingId(id);
    setRenameValue(current || "");
  }

  async function saveRename() {
    if (!renamingId) return;
    const title = renameValue.trim();
    const id = renamingId;
    if (title) {
      try {
        await onRename(id, title);
      } catch {
        /* keep UI in sync via parent state */
      }
    }
    setRenamingId(null);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); void saveRename(); }
    else if (e.key === "Escape") setRenamingId(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="flex-none w-9 h-9 rounded-[7px] flex items-center justify-center text-[#667386] hover:text-[#F5F7FA] hover:bg-[#141E2F] transition-all"
        title="Conversations"
      >
        <MessageSquare size={15} />
      </button>
      {open && (
        <div className="absolute left-3 top-14 z-30 w-[280px] bg-[#0F1726] border border-[#253248] rounded-[10px] shadow-2xl overflow-hidden flex flex-col animate-fade-up">
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-[#1a2740]">
            <p className="text-[11px] font-semibold text-[#F5F7FA]">Conversations</p>
            <button
              onClick={() => { onNew(); setOpen(false); }}
              className="flex items-center gap-1 text-[10px] text-[#8B5CF6] hover:text-[#A78BFA] transition-colors"
            >
              <Plus size={11} /> New
            </button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto py-1">
            {conversations.length === 0 && (
              <p className="px-4 py-6 text-center text-[11px] text-[#667386]">No conversations yet.</p>
            )}
            {conversations.map((c) => {
              const isRenaming = renamingId === c.conversation_id;
              return (
                <div
                  key={c.conversation_id}
                  onDoubleClick={() => startRename(c.conversation_id, c.title)}
                  className={`group w-full text-left px-3.5 py-2.5 hover:bg-[#141E2F] transition-colors flex items-start gap-2 ${
                    activeId === c.conversation_id ? "bg-[#8B5CF6]/8" : ""
                  }`}
                >
                  <MessageSquare size={13} className="text-[#8B5CF6] flex-none mt-0.5" />
                  {isRenaming ? (
                    <div className="flex-1 min-w-0 flex items-center gap-1">
                      <input
                        ref={renameRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={handleKey}
                        onBlur={() => void saveRename()}
                        placeholder="Chat title"
                        className="flex-1 min-w-0 bg-[#141E2F] border border-[#8B5CF6]/40 rounded px-2 py-1 text-[12px] text-[#F5F7FA] outline-none"
                      />
                      <button onClick={() => void saveRename()} className="text-[#14B8A6] hover:text-[#22D3A5]" title="Save">
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { onSelect(c.conversation_id); setOpen(false); }}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className={`block text-[12px] truncate ${activeId === c.conversation_id ? "text-[#A78BFA] font-medium" : "text-[#F5F7FA]"}`}>
                          {c.title || "Untitled"}
                        </span>
                        <span className="text-[9.5px] text-[#667386]">{c.updated_at}</span>
                      </button>
                      <div className="flex items-center gap-0.5 flex-none opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startRename(c.conversation_id, c.title)}
                          className="w-6 h-6 rounded-[5px] flex items-center justify-center text-[#667386] hover:text-[#F5F7FA] hover:bg-[#182337] transition-colors"
                          title="Rename"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(c.conversation_id)}
                          className="w-6 h-6 rounded-[5px] flex items-center justify-center text-[#667386] hover:text-[#FCA5A5] hover:bg-[#182337] transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmDeleteId(null)}>
          <div className="flex-1 absolute inset-0 bg-black/50" />
          <div
            className="relative bg-[#0F1726] border border-[#253248] rounded-[12px] w-[380px] p-5 animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-9 rounded-[8px] bg-[#7F1D1D]/20 flex items-center justify-center mb-3">
              <Trash2 size={15} className="text-[#FCA5A5]" />
            </div>
            <h3 className="text-[14px] font-semibold text-[#F5F7FA] mb-1">Delete conversation?</h3>
            <p className="text-[12px] text-[#9AA6B5] leading-relaxed mb-4">
              This permanently deletes the conversation and all of its messages. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="h-8 px-3.5 rounded-[7px] bg-[#141E2F] border border-[#253248] text-[#9AA6B5] text-[12px] font-semibold hover:text-[#F5F7FA] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = confirmDeleteId;
                  setConfirmDeleteId(null);
                  void onDelete(id);
                }}
                className="h-8 px-3.5 rounded-[7px] bg-[#D0314C]/90 hover:bg-[#D0314C] text-white text-[12px] font-semibold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────────

interface ComposerAttachment {
  name: string;
  status: "uploading" | "processing" | "ready" | "error";
  error?: string;
  documentId?: string;
}

function Composer({ message, setMessage, onSend, running, attachments, onAttach, onRemoveAttachment }: {
  message: string;
  setMessage: (m: string) => void;
  onSend: () => void;
  running: boolean;
  attachments: ComposerAttachment[];
  onAttach: (files: FileList) => void;
  onRemoveAttachment: (name: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleSend() {
    if (message.trim() && !running) onSend();
  }

  function pick() {
    if (running) return;
    fileInputRef.current?.click();
  }

  return (
    <div className="flex-none px-4 py-3 border-t border-[#253248]">
      <div className="max-w-[760px] mx-auto rounded-[10px] bg-[#0F1726] border border-[#253248] hover:border-[#2e3e57] focus-within:border-[#8B5CF6]/40 transition-all overflow-hidden">
        {attachments.length > 0 && (
          <div className="px-3 pt-3 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div key={a.name} className="flex items-center gap-2 rounded-md bg-[#141E2F] border border-[#253248] px-2.5 py-1.5">
                <File size={12} className="text-[#8B5CF6]" />
                <span className="text-[11px] text-[#F5F7FA] max-w-[180px] truncate">{a.name}</span>
                {a.status === "uploading" || a.status === "processing" ? (
                  <Loader2 size={11} className="text-[#667386] animate-spin" />
                ) : a.status === "error" ? (
                  <span className="text-[9px] text-[#FCA5A5]">{a.error}</span>
                ) : (
                  <button onClick={() => onRemoveAttachment(a.name)} className="text-[#667386] hover:text-[#F5F7FA] transition-colors">
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask about assets, procedures, or company knowledge…"
          className="w-full bg-transparent px-4 pt-3.5 pb-2 text-[14px] text-[#F5F7FA] placeholder-[#667386] outline-none resize-none leading-relaxed"
          rows={2}
          style={{ maxHeight: "120px" }}
        />
        <div className="flex items-center gap-2 px-3 pb-3 pt-1">
          <button onClick={pick} title="Attach file" disabled={running} className="w-7 h-7 rounded-[5px] flex items-center justify-center text-[#667386] hover:text-[#9AA6B5] hover:bg-[#141E2F] transition-all disabled:opacity-40">
            <Paperclip size={13} />
          </button>
          <button title="Search knowledge" className="w-7 h-7 rounded-[5px] flex items-center justify-center text-[#667386] hover:text-[#9AA6B5] hover:bg-[#141E2F] transition-all">
            <BookOpen size={13} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,.docx,.pptx,.xlsx,.csv,.txt,.md,.markdown,.html,.htm"
            className="hidden"
            onChange={(e) => { if (e.target.files && e.target.files.length > 0) onAttach(e.target.files); e.target.value = ""; }}
          />
          <button
            onClick={onSend}
            disabled={!message.trim() || running}
            className="ml-auto w-8 h-8 rounded-[8px] bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-all shadow-md shadow-[#8B5CF6]/25 active:scale-95"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
      </div>
      <p className="text-center text-[10px] text-[#3a4a60] mt-2 max-w-[760px] mx-auto">
        AI responses may require human review · Your work stays within ApexPetro"s controlled environment
      </p>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

const suggestionCards = [
  { icon: FileText,        title: "Analyze a document",    desc: "Find the operating limits for centrifugal pump P-102." },
  { icon: FileSpreadsheet, title: "Compare documents",     desc: "Compare the inspection requirements between the applicable SOPs." },
  { icon: Sparkles,        title: "Create a document",     desc: "Prepare an approval note from recently found inspection findings." },
  { icon: BookOpen,        title: "Use company knowledge", desc: "Find the procedure for pressure equipment inspection." },
  { icon: Terminal,        title: "Code / Calculate",      desc: "Calculate the pressure deviation for a value above its limit." },
  { icon: FileSpreadsheet, title: "Analyze data",          desc: "Find abnormal trends in the maintenance history." },
];

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 pb-8 min-h-0">
      <div className="w-12 h-12 rounded-[10px] bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] flex items-center justify-center mb-5 shadow-xl shadow-[#8B5CF6]/20">
        <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
          <path d="M7 1L2 4v6l5 3 5-3V4L7 1z" stroke="white" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
          <path d="M7 1v12M2 4l5 3 5-3" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="text-[25px] font-semibold text-[#F5F7FA] text-center mb-2.5">How can I help with your work?</h1>
      <p className="text-[13px] text-[#9AA6B5] text-center max-w-[480px] leading-relaxed mb-7">
        Ask questions answered from ApexPetro"s confidential knowledge base — entirely within your local environment.
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-[520px]">
        {suggestionCards.map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.title} onClick={() => onSuggestion(card.desc)}
              className="text-left p-3.5 rounded-[8px] bg-[#0F1726] border border-[#253248] hover:border-[#8B5CF6]/30 hover:bg-[#141E2F] transition-all group">
              <Icon size={14} className="text-[#8B5CF6] mb-2" />
              <p className="text-[12px] font-semibold text-[#F5F7FA] mb-0.5">{card.title}</p>
              <p className="text-[11px] text-[#667386] leading-relaxed group-hover:text-[#9AA6B5] transition-colors">{card.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ChatScreen({ onOpenModelDrawer, onNavigate }: { onOpenModelDrawer: () => void; onNavigate?: (view: string) => void }) {
  const [mode, setMode] = useState<Mode>("ask");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStepView[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceSource, setEvidenceSource] = useState<{ item: EvidenceItem; index: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, running, scrollToBottom]);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await api.chat.listConversations();
      setConversations(data.conversations || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const newChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setSteps([]);
    setError(null);
    setAttachments([]);
    attachmentsRef.current = [];
  }, []);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    try {
      const updated = await api.chat.renameConversation(id, title);
      setConversations((prev) => prev.map((c) => c.conversation_id === id ? { ...c, title: updated.title } : c));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename conversation");
    }
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await api.chat.deleteConversation(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete conversation");
      return;
    }
    setConversations((prev) => prev.filter((c) => c.conversation_id !== id));
    if (activeId === id) {
      newChat();
    }
  }, [activeId, newChat]);

  const selectConversation = useCallback(async (id: string) => {
    newChat();
    setActiveId(id);
    setLoadingHistory(true);
    try {
      const data = await api.chat.getMessages(id);
      setMessages((data.messages || []).map((m: MessageRecord) => ({
        role: m.role,
        content: m.content,
        created_at: formatTime(m.created_at),
        sources: (m.sources || []) as ChatSource[],
        artifacts: (m.artifacts || []) as ChatArtifact[],
        model: m.meta?.model || undefined,
        verified: m.meta?.verified !== undefined ? m.meta!.verified : null,
        analysis: m.meta?.analysis || undefined,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversation");
    } finally {
      setLoadingHistory(false);
    }

    // BUG 2 fix: reload the attachments that were uploaded to this conversation
    // so the chips persist across conversation switches / reopen. Chips stay
    // until the user removes them; they are NOT cleared on send.
    try {
      const atts = await api.chat.listAttachments(id);
      const loaded: ComposerAttachment[] = (atts.attachments || []).map((a) => ({
        name: a.filename,
        status: a.status === "READY" ? "ready" : ("processing" as const),
        documentId: a.document_id,
      }));
      setAttachments(loaded);
      attachmentsRef.current = loaded;
    } catch (e) {
      console.error("Failed to load conversation attachments", e);
      setAttachments([]);
      attachmentsRef.current = [];
    }
  }, [newChat]);

  async function runQuery(query: string) {
    setRunning(true);
    setError(null);
    setSteps([]);

    let convId = activeId;
    if (!convId) {
      try {
        const created = await api.chat.createConversation();
        convId = created.conversation_id;
        setActiveId(convId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start conversation");
        setRunning(false);
        return;
      }
    }

    setMessages((prev) => [...prev, { role: "user", content: query }]);
    scrollToBottom();

    try {
      const res = await api.chat.stream({ query, conversation_id: convId });
      const artifactLinks: ArtifactLink[] = [];
      let runVerified: boolean | null = null;
      let stepCount = 0;

      const applyStepStatus = (index: number, status: AgentStepView["status"], error?: string) =>
        setSteps((prev) =>
          prev.map((s, i) => (i === index ? { ...s, status, error } : s))
        );

      for await (const ev of streamEvents(res)) {
        if (ev.event === "plan_created" && ev.steps) {
          stepCount = ev.steps.length;
          setSteps((ev.steps as string[]).map((s) => ({ label: s, status: "pending" as const })));
        } else if (ev.event === "tool_started" && typeof ev.step_index === "number") {
          applyStepStatus(ev.step_index, "running");
        } else if (ev.event === "tool_completed" && typeof ev.step_index === "number") {
          applyStepStatus(ev.step_index, ev.success ? "completed" : "failed", ev.error || undefined);
        } else if (ev.event === "verification_completed") {
          runVerified = ev.verified !== undefined ? ev.verified : null;
        } else if (ev.event === "artifact_created" && ev.artifact) {
          const a = ev.artifact as ArtifactLink;
          if (a?.artifact_id && !artifactLinks.some((x) => x.artifact_id === a.artifact_id)) {
            artifactLinks.push(a);
          }
        } else if (ev.event === "run_completed") {
          const finalSteps = (ev.steps_status as { label: string; status: string; error?: string }[] | undefined);
          if (finalSteps && finalSteps.length > 0) {
            setSteps(
              finalSteps.map((s) => ({
                label: s.label,
                status: (["completed", "failed", "running", "pending"].includes(s.status)
                  ? s.status
                  : "completed") as AgentStepView["status"],
                error: s.error || undefined,
              }))
            );
          } else if (stepCount > 0) {
            setSteps(
              Array.from({ length: stepCount }, (_, i) => ({ label: `Step ${i + 1}`, status: "completed" as const }))
            );
          }
          for (const a of ev.artifacts || []) {
            if (a?.artifact_id && !artifactLinks.some((x) => x.artifact_id === a.artifact_id)) {
              artifactLinks.push(a);
            }
          }
          const analysis = ev.analysis || undefined;
          if (ev.answer) {
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: ev.answer as string,
              sources: (ev.evidence || []) as ChatSource[],
              artifacts: artifactLinks,
              model: ev.model || undefined,
              verified: ev.verified !== undefined ? ev.verified : runVerified,
              analysis,
            }]);
          } else if (artifactLinks.length > 0) {
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: "Generated documents are ready below.",
              artifacts: artifactLinks,
              model: ev.model || undefined,
            }]);
          }
        } else if (ev.event === "run_failed") {
          const failedSteps = (ev.steps_status as { label: string; status: string; error?: string }[] | undefined);
          if (failedSteps && failedSteps.length > 0) {
            setSteps(
              failedSteps.map((s) => ({
                label: s.label,
                status: s.status === "failed" ? "failed" : s.status === "completed" ? "completed" : "pending",
                error: s.error || undefined,
              }))
            );
          }
          setError(`The agent could not complete the request. ${ev.error || ""}`.trim());
        }
      }

      await refreshConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stream failed");
    } finally {
      setRunning(false);
    }
  }

  async function pollAttachmentStatus(convId: string) {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    for (let i = 0; i < 300; i++) {
      await sleep(2000);
      let records: ChatAttachmentRecord[] = [];
      try {
        records = (await api.chat.listAttachments(convId)).attachments;
      } catch {
        return;
      }
      const byId = new Map(records.map((r) => [r.document_id, r]));
      setAttachments((prev) => prev.map((a) => {
        if (!a.documentId || a.status === "error") return a;
        const rec = byId.get(a.documentId);
        if (rec?.status === "READY") return { ...a, status: "ready" as const };
        if (rec?.status === "ERROR") return { ...a, status: "error" as const, error: "Processing failed" };
        return a.status === "uploading" ? a : { ...a, status: "processing" as const };
      }));
      const pending = attachmentsRef.current.some((a) => {
        if (!a.documentId || a.status === "error") return false;
        const rec = byId.get(a.documentId);
        return !rec || (rec.status !== "READY" && rec.status !== "ERROR");
      });
      if (!pending) return;
    }
  }

  async function handleAttach(files: FileList) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setAttachments((prev) => [...prev, ...list.map((f) => ({ name: f.name, status: "uploading" as const }))]);
    let convId = activeId;
    if (!convId) {
      try {
        const created = await api.chat.createConversation();
        convId = created.conversation_id;
        setActiveId(convId);
      } catch (e) {
        const names = list.map((f) => f.name);
        setAttachments((prev) => prev.map((a) => names.includes(a.name) ? { name: a.name, status: "error", error: "Failed to start conversation" } : a));
        return;
      }
    }
    for (const file of list) {
      try {
        const res = await api.chat.uploadAttachment(convId, file);
        setAttachments((prev) => prev.map((a) => a.name === file.name ? { ...a, status: "processing" as const, documentId: res.document_id } : a));
      } catch (e) {
        setAttachments((prev) => prev.map((a) => a.name === file.name ? { ...a, status: "error" as const, error: "Upload failed" } : a));
      }
    }
    void pollAttachmentStatus(convId);
  }

  async function handleRemoveAttachment(name: string) {
    const target = attachmentsRef.current.find((a) => a.name === name);
    setAttachments((prev) => prev.filter((a) => a.name !== name));
    if (target?.documentId && activeId) {
      try {
        await api.chat.deleteAttachment(activeId, target.documentId);
      } catch {
        /* backend cleanup already best-effort */
      }
    }
  }

  function handleSend() {
    const q = message.trim();
    if (!q || running) return;
    setMessage("");
    void runQuery(q);
  }

  function handleSuggestion(text: string) {
    setMessage("");
    void runQuery(text);
  }

  if (mode === "code") {
    return <CodeSandbox onBack={() => setMode("ask")} />;
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="h-full flex flex-col bg-[#080D18] relative">
      <div className="flex-none flex items-center gap-1 px-3 pt-2">
<ConversationSidebar
              conversations={conversations}
              activeId={activeId}
              onSelect={(id) => void selectConversation(id)}
              onNew={newChat}
              onRename={handleRenameConversation}
              onDelete={handleDeleteConversation}
            />
        <button
          onClick={() => { setMode("code"); }}
          className="flex items-center gap-1.5 h-8 px-3 rounded-[7px] bg-[#141E2F] border border-[#253248] text-[#9AA6B5] text-[11.5px] font-medium hover:border-[#14B8A6]/40 hover:text-[#14B8A6] transition-all"
        >
          <Code size={13} /> Code in Sandbox
        </button>
        <button
          onClick={onOpenModelDrawer}
          className="flex items-center gap-1.5 h-8 px-3 rounded-[7px] bg-[#141E2F] border border-[#253248] text-[#9AA6B5] text-[11.5px] font-medium hover:border-[#2e3e57] hover:text-[#F5F7FA] transition-all"
        >
          <Settings size={13} /> Change Model
        </button>
        <div className="flex-1" />
        {steps.length > 0 && !running && (
          <button
            onClick={newChat}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[7px] bg-[#141E2F] border border-[#253248] text-[#9AA6B5] text-[11.5px] font-medium hover:text-[#F5F7FA] hover:bg-[#182337] transition-all"
          >
            <Plus size={13} /> New Chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loadingHistory ? (
          <div className="flex items-center justify-center h-full text-[#667386] text-[12px] gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading conversation…
          </div>
        ) : !hasMessages && !running && !steps.length ? (
          <EmptyState onSuggestion={handleSuggestion} />
        ) : (
          <div className="max-w-[760px] mx-auto px-6 py-6 space-y-8">
            {messages.map((m, i) =>
              m.role === "user"
                ? <UserBubble key={i} message={m} />
                : <AiBubble key={i} message={m} index={i} onViewSource={(item, j) => setEvidenceSource({ item, index: j })} onNavigate={onNavigate} />
            )}

            {running && (
              <div className="flex gap-3 max-w-[680px]">
                <div className="w-8 h-8 rounded-[8px] bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] flex items-center justify-center flex-none mt-0.5 shadow-lg shadow-[#8B5CF6]/20">
                  <Loader size={12} className="text-white animate-spin-slow" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[11px] font-semibold text-[#8B5CF6]">Knowledge Agent</p>
                    <span className="text-[9px] bg-[#8B5CF6]/12 text-[#8B5CF6] px-1.5 py-0.5 rounded-[3px] font-semibold">Agent</span>
                  </div>
                  <p className="text-[13.5px] text-[#F5F7FA] mb-1 font-medium">Task understood.</p>
                  <p className="text-[12.5px] text-[#9AA6B5] mb-3.5">
                    Executing a {steps.length || "multi"}-step plan across knowledge retrieval and reasoning…
                  </p>
                  {steps.length > 0 && <AgentPlanCard steps={steps} running />}
                </div>
              </div>
            )}

            {!running && steps.length > 0 && (
              <div className="max-w-[680px]"><AgentPlanCard steps={steps} running={false} /></div>
            )}

            {error && (
              <div className="rounded-[8px] bg-[#7F1D1D]/15 border border-[#7F1D1D]/40 px-4 py-3 flex items-start gap-2.5">
                <AlertTriangle size={14} className="text-[#FCA5A5] flex-none mt-0.5" />
                <p className="text-[12.5px] text-[#FCA5A5] leading-relaxed">{error}</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <Composer
        message={message}
        setMessage={setMessage}
        onSend={handleSend}
        running={running}
        attachments={attachments}
        onAttach={handleAttach}
        onRemoveAttachment={handleRemoveAttachment}
      />
      {evidenceSource && (
        <EvidenceDrawer source={evidenceSource.item} index={evidenceSource.index} onClose={() => setEvidenceSource(null)} />
      )}
    </div>
  );
}

// ── Code Sandbox (kept as an isolated UI affordance) ──────────────────────────

type CodeToken = { text: string; cls: string };
const pythonCode: CodeToken[][] = [
  [{ text: "pressure", cls: "text-[#F5F7FA]" }, { text: " = ", cls: "text-[#9AA6B5]" }, { text: "42", cls: "text-[#FCA5A5]" }],
  [{ text: "limit", cls: "text-[#F5F7FA]" }, { text: " = ", cls: "text-[#9AA6B5]" }, { text: "40", cls: "text-[#FCA5A5]" }],
  [],
  [{ text: "deviation", cls: "text-[#F5F7FA]" }, { text: " = ", cls: "text-[#9AA6B5]" }, { text: "pressure", cls: "text-[#F5F7FA]" }, { text: " - ", cls: "text-[#9AA6B5]" }, { text: "limit", cls: "text-[#F5F7FA]" }],
  [],
  [{ text: "print", cls: "text-[#93C5FD]" }, { text: "(", cls: "text-[#9AA6B5]" }, { text: 'f"Deviation: {deviation} bar"', cls: "text-[#86EFAC]" }, { text: ")", cls: "text-[#9AA6B5]" }],
];

const codeSource = pythonCode.map((line) => line.map((t) => t.text).join("")).join("\n");

function CodeSandbox({ onBack }: { onBack: () => void }) {
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCode() {
    setRunning(true);
    setError(null);
    setOutput(null);
    try {
      const res = await api.code.run(codeSource, 30);
      const parts = [];
      if (res.stdout) parts.push(res.stdout.trimEnd());
      if (res.stderr) parts.push(res.stderr.trimEnd());
      parts.push(`\n[exit ${res.return_code}] completed in ${res.execution_ms} ms · ${res.sandbox}`);
      setOutput(parts.join("\n").trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run code");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#080D18]">
      <div className="flex-none px-5 py-3 border-b border-[#253248] bg-[#0F1726] flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-[11px] text-[#667386] hover:text-[#9AA6B5] transition-colors">
          <ChevronDown size={12} className="rotate-90" /> Back to Chat
        </button>
        <div className="h-4 w-px bg-[#253248]" />
        <Terminal size={13} className="text-[#14B8A6]" />
        <p className="text-[13px] font-semibold text-[#F5F7FA]">Secure Code Sandbox</p>
        <p className="text-[11px] text-[#667386]">Live execution · isolated temp dir · audited</p>
      </div>
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex items-center px-4 py-2 bg-[#0F1726] border-b border-[#253248]">
            <span className="text-[11px] font-mono text-[#9AA6B5]">main.py</span>
          </div>
          <div className="flex-1 overflow-auto p-5 bg-[#080D18]">
            <div className="font-mono text-[13px] leading-7">
              {pythonCode.map((tokens, i) => (
                <div key={i} className="flex gap-4">
                  <span className="text-[#253248] select-none w-5 text-right flex-none text-[11px] leading-7">{i + 1}</span>
                  <span>{tokens.map((t, j) => <span key={j} className={t.cls}>{t.text}</span>)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-[#253248] px-4 py-2.5 flex items-center gap-3 bg-[#0F1726]">
            <button onClick={runCode} disabled={running}
              className={`h-8 px-4 rounded-[6px] text-[12px] font-semibold flex items-center gap-2 transition-all ${
                running ? "bg-[#8B5CF6]/30 text-[#A78BFA] cursor-not-allowed" : "bg-[#8B5CF6] hover:bg-[#7C3AED] text-white"
              }`}>
              <Play size={12} /> {running ? "Running…" : "Run Code"}
            </button>
            {output !== null && <span className="text-[11px] text-[#22C55E]">Completed</span>}
          </div>
          {(output !== null || running || error) && (
            <div className="border-t border-[#253248] p-4 bg-[#080D18]">
              <p className="text-[8.5px] font-semibold tracking-[0.15em] text-[#667386] uppercase mb-2">Output</p>
              {running ? (
                <p className="font-mono text-[12px] text-[#667386]">Executing in isolated sandbox…</p>
              ) : error ? (
                <pre className="font-mono text-[12px] text-[#FCA5A5] whitespace-pre-wrap">{error}</pre>
              ) : output ? (
                <pre className="font-mono text-[12px] text-[#9AA6B5] whitespace-pre-wrap">{output}</pre>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
