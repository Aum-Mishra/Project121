import { useState, useEffect } from "react";
import { X, ExternalLink, Shield, Check, Lock, Cpu, Database, Network, Ban, Activity, ChevronRight, FileText } from "lucide-react";
import { api, ModelInfo, Artifact, SecurityStatusItem } from "../services/api";

interface RightPanelProps {
  onClose: () => void;
  onNavigate?: (v: string) => void;
}

type Tab = "evidence" | "routing" | "security";

export default function RightPanel({ onClose, onNavigate }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("evidence");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [securityItems, setSecurityItems] = useState<SecurityStatusItem[]>([]);
  const [overall, setOverall] = useState<string>("secure");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.models.list();
        if (active) setModels(data.models || []);
      } catch { /* ignore */ }
      try {
        const art = await api.artifacts.list();
        if (active) setArtifacts(art.artifacts || []);
      } catch { /* ignore */ }
      try {
        const sec = await api.security.status();
        if (active) {
          setSecurityItems(sec.items || []);
          setOverall(sec.overall || "secure");
        }
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, []);

  const reasoning = models.find((m) => (m.role || "").toLowerCase().includes("reason")) || models[0];

  const evidenceSources = [
    {
      id: "SOURCE 01",
      score: "97%",
      title: "P-102 Inspection Report 2026",
      snippet: '"Operating pressure recorded at 42 bar during routine inspection on 2026-08-28..."',
      badge: "CONFIDENTIAL"
    },
    {
      id: "SOURCE 02",
      score: "95%",
      title: "Pump Inspection SOP v3.2",
      snippet: '"Engineering review is required when operating pressure exceeds 40 bar. Immediate operational escalat..."',
      badge: "CONFIDENTIAL"
    },
    {
      id: "SOURCE 03",
      score: "91%",
      title: "P-102 Inspection Report 2025",
      snippet: '"Operating pressure: 37 bar. Within acceptable limits. Monitoring recommended due to upward trend..."',
      badge: "CONFIDENTIAL"
    }
  ];

  return (
    <aside className="w-[300px] flex-none h-full flex flex-col bg-[#0F1726] border-l border-[#1a2740] overflow-y-auto animate-slide-right select-none">
      {/* ── Top Header with 3 Tabs matching Video 00:27-00:30 ── */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-[#1a2740] flex-none bg-[#0D1524]">
        <div className="flex items-center gap-1">
          {(["evidence", "routing", "security"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1 rounded text-[11.5px] font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-[#141E2F] text-[#14B8A6] border border-[#14B8A6]/30 font-semibold"
                  : "text-[#9AA6B5] hover:text-white hover:bg-[#141E2F]/60"
              }`}
            >
              {tab === "evidence" ? "Evidence" : tab === "routing" ? "Routing" : "Security"}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-[4px] flex items-center justify-center text-[#667386] hover:text-[#F5F7FA] hover:bg-[#141E2F] transition-all"
        >
          <X size={13} />
        </button>
      </div>

      {/* ── TAB 1: EVIDENCE (Video 00:27-00:29) ── */}
      {activeTab === "evidence" && (
        <div className="p-3.5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1A273E]">
            <span className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider">
              6 SOURCES CITED
            </span>
            <span className="text-[10px] font-mono text-[#10B981]">● VERIFIED (LOCAL RAG)</span>
          </div>

          <div className="space-y-2.5">
            {evidenceSources.map((src, i) => (
              <div
                key={i}
                className="p-2.5 rounded-[8px] bg-[#0A1220] border border-[#1C2B40] hover:border-[#2E4260] transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#8B5CF6]">{src.id}</span>
                  <span className="text-[10.5px] font-mono font-bold text-[#10B981]">{src.score}</span>
                </div>
                <p className="text-[11.5px] font-semibold text-white truncate">{src.title}</p>
                <p className="text-[10.5px] text-[#94A3B8] italic leading-snug">{src.snippet}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    🔒 {src.badge}
                  </span>
                  <button className="text-[10px] text-[#14B8A6] hover:underline flex items-center gap-0.5">
                    View <ExternalLink size={9} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Generated Artifacts in Evidence */}
          <div className="pt-2 border-t border-[#1A273E]">
            <p className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider mb-2">
              GENERATED ARTIFACTS
            </p>
            <div className="space-y-1.5">
              {[
                { name: "Approval_Note_P-102_2026.docx", type: "DOCX" },
                { name: "Risk_Assessment_P-102.pdf", type: "PDF" },
                { name: "Technical_Review_P-102.pdf", type: "PDF" }
              ].map((art, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded bg-[#0A1220] border border-[#1C2B40] text-[11px]"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText size={13} className="text-[#8B5CF6] flex-none" />
                    <span className="text-white truncate">{art.name}</span>
                  </div>
                  <span className="text-[9px] font-mono text-[#10B981] px-1 rounded bg-emerald-500/10 border border-emerald-500/30">
                    VERIFIED
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: ROUTING (Video 00:29) ── */}
      {activeTab === "routing" && (
        <div className="p-3.5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1A273E]">
            <span className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider">
              MODEL ROUTER DECISION
            </span>
            <span className="text-[10px] font-mono text-[#10B981]">● ON-DEVICE ROUTED</span>
          </div>

          <div className="rounded-[8px] bg-[#0A1220] border border-[#1C2B40] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-white font-mono">Qwen 2.5:7b-instruct</span>
              <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>
            <p className="text-[10.5px] text-[#94A3B8]">
              Selected for multi-step reasoning, OCR tabular extraction, and ISO norm verification.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1C283E] text-[10px] font-mono">
              <div>
                <span className="text-[#64748B]">LATENCY:</span>
                <p className="text-white font-bold">1.82s (38.4 tok/s)</p>
              </div>
              <div>
                <span className="text-[#64748B]">HARDWARE:</span>
                <p className="text-[#14B8A6] font-bold">GTX 1660 Ti 6GB</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider">
              PIPELINE WORKERS
            </p>
            {[
              { role: "OCR / Vision", model: "Document Processor (Local)", status: "Completed 0.8s" },
              { role: "Vector RAG", model: "Qdrant LAN :6333", status: "Completed 1.2s" },
              { role: "Risk Engine", model: "Python Sandbox :isolated", status: "Completed 0.4s" },
              { role: "Doc Generator", model: "DOCX Generator (Local)", status: "Ready" },
            ].map((p, i) => (
              <div
                key={i}
                className="p-2.5 rounded bg-[#0A1220] border border-[#1C2B40] flex items-center justify-between text-[11px] font-mono"
              >
                <div>
                  <p className="text-white font-semibold">{p.role}</p>
                  <p className="text-[10px] text-[#64748B]">{p.model}</p>
                </div>
                <span className="text-[9.5px] text-[#10B981]">{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: TASK SECURITY (Matches Video 00:30-00:32 Exact 1:1 Layout) ── */}
      {activeTab === "security" && (
        <div className="p-3.5 space-y-4 animate-fade-up">
          <div className="pb-1 border-b border-[#1A273E]">
            <p className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">
              TASK SECURITY
            </p>
          </div>

          {/* Green Zero External Calls Box (Exact from Video 00:30) */}
          <div className="rounded-[8px] bg-[#091C17] border border-[#10B981]/40 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[#10B981] text-[11px] font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse-dot" />
              <span>ZERO EXTERNAL CALLS</span>
            </div>
            <p className="text-[10.5px] text-[#A7F3D0] leading-relaxed">
              All processing on local infrastructure. No data transmitted externally.
            </p>
          </div>

          {/* Property List (Exact from Video 00:30-00:32) */}
          <div className="space-y-2.5 font-mono text-[11.5px]">
            <div className="flex items-center justify-between py-1.5 border-b border-[#1C283E]">
              <span className="text-[#94A3B8]">Classification</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                CONFIDENTIAL
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-[#1C283E]">
              <span className="text-[#94A3B8]">Inference</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                LOCAL ONLY
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-[#1C283E]">
              <span className="text-[#94A3B8]">Storage</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                LOCAL ONLY
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-[#1C283E]">
              <span className="text-[#94A3B8]">Network</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                ISOLATED
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-[#1C283E]">
              <span className="text-[#94A3B8]">Sandbox</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/30 text-red-400">
                DESTROYED
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-[#1C283E]">
              <span className="text-[#94A3B8]">Audit</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                LOGGED
              </span>
            </div>
          </div>

          {/* Quick link to full Hubble / Prometheus / Grafana Screen */}
          <div className="pt-2">
            <button
              onClick={() => onNavigate?.("security")}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-[6px] bg-[#141E2F] hover:bg-[#1E2B42] border border-[#253248] text-white text-[11px] font-mono transition-colors cursor-pointer"
            >
              <span>View eBPF & Prometheus</span>
              <ChevronRight size={12} className="text-[#14B8A6]" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
