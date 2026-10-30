import { useState, useEffect, useMemo, useRef } from "react";
import {
  Shield, Wifi, Server, Cloud, Cpu, HardDrive, Terminal, FileSearch,
  Check, X, AlertTriangle, Lock, Eye, AlertOctagon, RefreshCw, FileCode,
  CheckCircle2, Activity, Network, Gauge, Zap, BarChart3, Database,
  Copy, ExternalLink, Filter, Clock, Ban, TrendingUp, Layers, ChevronDown,
  Info, Sparkles, Sliders, CheckCircle, Radio, GitBranch, ListFilter, Box,
  ZoomIn, ZoomOut, RotateCcw, Move, Maximize2, ArrowRight, ChevronRight,
  Workflow, CornerDownRight, Share2, Play, FileText
} from "lucide-react";
import { api, SecurityStatusItem, ModelInfo, Artifact } from "../services/securityDemo";
import { useNav } from "../context/NavContext";

export type SecurityTab =
  | "hubble"
  | "prometheus"
  | "opentelemetry"
  | "loki"
  | "sandbox"
  | "governance";

interface FlowRecord {
  id: string;
  time: string;
  src: string;
  dst: string;
  protocol: string;
  verdict: "FORWARDED" | "DROPPED";
  latency_ms: number;
  policy: string;
  details: string;
}

interface HubbleStats {
  total_flows_captured: number;
  forwarded_flows: number;
  dropped_flows: number;
  drop_rate_pct: number;
  ebpf_filter_status: string;
  hubble_relay: string;
}

interface TelemetryData {
  system?: {
    cpu_percent?: number;
    memory_used_gb?: number;
    memory_total_gb?: number;
    memory_percent?: number;
    uptime?: string;
    threads_active?: number;
  };
  gpu?: {
    model?: string;
    vram_total_gb?: number;
    vram_allocated_gb?: number;
    vram_free_gb?: number;
    vram_percent?: number;
    temperature_c?: number;
    compute_load_percent?: number;
    fan_speed_percent?: number;
    tokens_per_sec?: number;
  };
  timeseries?: {
    timestamps?: string[];
    cpu?: number[];
    memory?: number[];
    inference_7b?: number[];
    inference_3b?: number[];
    inference_coder?: number[];
    agent_completed?: number[];
    agent_failed?: number[];
  };
  dlp_stats?: Array<{ rule: string; count: number; color: string }>;
  security_kpis?: {
    prompt_injections_blocked?: number;
    unauthorized_access_denied?: number;
    dlp_redactions_total?: number;
    sandbox_violations_quarantined?: number;
  };
}

interface TopologyNode {
  id: string;
  name: string;
  sub: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bg: string;
  border: string;
  activeBorder: string;
  textColor: string;
  subColor: string;
  tag: string;
  tagBg: string;
  tagColor: string;
}

const DEFAULT_TOPOLOGY_NODES: Record<string, TopologyNode> = {
  frontend: {
    id: "frontend",
    name: "Workbench UI",
    sub: "Port :8443 (Vite)",
    x: 45,
    y: 190,
    width: 165,
    height: 72,
    bg: "var(--color-surface)",
    border: "#253852",
    activeBorder: "#14B8A6",
    textColor: "var(--color-text-primary)",
    subColor: "#14B8A6",
    tag: "CLIENT INTRANET",
    tagBg: "#14B8A625",
    tagColor: "#14B8A6",
  },
  backend: {
    id: "backend",
    name: "API Gateway",
    sub: "FastAPI :8000",
    x: 275,
    y: 190,
    width: 165,
    height: 72,
    bg: "var(--color-surface)",
    border: "#2D4769",
    activeBorder: "#8B5CF6",
    textColor: "var(--color-text-primary)",
    subColor: "#A78BFA",
    tag: "CORE ROUTER",
    tagBg: "#8B5CF625",
    tagColor: "#8B5CF6",
  },
  waf: {
    id: "waf",
    name: "WAF & DLP Sentinel",
    sub: "Entropy >= 3.8 · In-Memory",
    x: 275,
    y: 50,
    width: 175,
    height: 72,
    bg: "var(--color-surface)",
    border: "#4B296B",
    activeBorder: "#C084FC",
    textColor: "var(--color-text-primary)",
    subColor: "#C084FC",
    tag: "SECURITY GUARD",
    tagBg: "#C084FC25",
    tagColor: "#C084FC",
  },
  sandbox: {
    id: "sandbox",
    name: "Agent Sandbox",
    sub: "UID 10001 · Isolated Worker",
    x: 275,
    y: 340,
    width: 175,
    height: 72,
    bg: "var(--color-surface)",
    border: "#4A284A",
    activeBorder: "#EC4899",
    textColor: "var(--color-text-primary)",
    subColor: "#F472B6",
    tag: "SECCOMP JAIL",
    tagBg: "#EC489925",
    tagColor: "#EC4899",
  },
  ollama: {
    id: "ollama",
    name: "Ollama Local LLM",
    sub: ":11434 · GTX 1660 Ti",
    x: 550,
    y: 50,
    width: 195,
    height: 72,
    bg: "var(--color-surface)",
    border: "#1A403A",
    activeBorder: "#10B981",
    textColor: "var(--color-text-primary)",
    subColor: "#10B981",
    tag: "LOCAL GPU",
    tagBg: "#10B98125",
    tagColor: "#10B981",
  },
  qdrant: {
    id: "qdrant",
    name: "Vector Memory (RAG)",
    sub: ":6333 · bge-m3:latest",
    x: 550,
    y: 190,
    width: 195,
    height: 72,
    bg: "var(--color-surface)",
    border: "#2A3A6B",
    activeBorder: "#3B82F6",
    textColor: "var(--color-text-primary)",
    subColor: "#60A5FA",
    tag: "LOCAL EMBEDDINGS",
    tagBg: "#3B82F625",
    tagColor: "#60A5FA",
  },
  sqlite: {
    id: "sqlite",
    name: "Internal Storage DB",
    sub: "SQLite / Local Vault",
    x: 550,
    y: 340,
    width: 195,
    height: 72,
    bg: "var(--color-surface)",
    border: "#373752",
    activeBorder: "#A78BFA",
    textColor: "var(--color-text-primary)",
    subColor: "#A78BFA",
    tag: "IPC STORAGE",
    tagBg: "#A78BFA25",
    tagColor: "#A78BFA",
  },
  airgap: {
    id: "airgap",
    name: "Kernel Air-Gap Barrier",
    sub: "WAN 0.0.0.0/0 (0 Packets)",
    x: 940,
    y: 180,
    width: 240,
    height: 90,
    bg: "var(--color-surface)",
    border: "#EF4444",
    activeBorder: "#EF4444",
    textColor: "var(--color-text-primary)",
    subColor: "#EF4444",
    tag: "AIR-GAP ENFORCED",
    tagBg: "#EF444425",
    tagColor: "#EF4444",
  },
};

interface SecurityScreenProps {
  initialTab?: string;
}

function EvidenceRoutingPanel() {
  const { navigate } = useNav();
  const [activeTab, setActiveTab] = useState<"evidence" | "routing" | "security">("evidence");
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

  const evidenceSources = [
    {
      id: "SOURCE 01",
      score: "97%",
      title: "P-102 Inspection Report 2026",
      snippet: "\"Operating pressure recorded at 42 bar during routine inspection on 2026-08-28...\"",
      badge: "CONFIDENTIAL"
    },
    {
      id: "SOURCE 02",
      score: "95%",
      title: "Pump Inspection SOP v3.2",
      snippet: "\"Engineering review is required when operating pressure exceeds 40 bar. Immediate operational escalat...\"",
      badge: "CONFIDENTIAL"
    },
    {
      id: "SOURCE 03",
      score: "91%",
      title: "P-102 Inspection Report 2025",
      snippet: "\"Operating pressure: 37 bar. Within acceptable limits. Monitoring recommended due to upward trend...\"",
      badge: "CONFIDENTIAL"
    }
  ];

  return (
    <section className="flex-none w-full bg-[var(--color-surface-subtle)] border-t border-[var(--color-border)] select-none">
      {/* ── Top Header with 3 Tabs matching Video 00:27-00:30 ── */}
      <div className="h-12 flex items-center px-3 border-b border-[var(--color-border)] flex-none bg-[var(--color-border)]">
        <div className="flex items-center gap-1">
          {(["evidence", "routing", "security"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1 rounded text-[11.5px] font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-[var(--color-surface-subtle)] text-[#14B8A6] border border-[#14B8A6]/30 font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]/60"
              }`}
            >
              {tab === "evidence" ? "Evidence" : tab === "routing" ? "Routing" : "Security"}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB 1: EVIDENCE (Video 00:27-00:29) ── */}
      {activeTab === "evidence" && (
        <div className="p-3.5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
              6 SOURCES CITED
            </span>
            <span className="text-[10px] font-mono text-[#10B981]">● VERIFIED (LOCAL RAG)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {evidenceSources.map((src, i) => (
              <div
                key={i}
                className="p-2.5 rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-surlection)] hover:border-[var(--color-border-strong)] transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#8B5CF6]">{src.id}</span>
                  <span className="text-[10.5px] font-mono font-bold text-[#10B981]">{src.score}</span>
                </div>
                <p className="text-[11.5px] font-semibold text-[var(--color-text-primary)] truncate">{src.title}</p>
                <p className="text-[10.5px] text-[var(--color-text-secondary)] italic leading-snug">{src.snippet}</p>
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
          <div className="pt-2 mt-2 border-t border-[var(--color-border)]">
            <p className="text-[10px] font-mono font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              GENERATED ARTIFACTS
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
              {[
                { name: "Approval_Note_P-102_2026.docx", type: "DOCX" },
                { name: "Risk_Assessment_P-102.pdf", type: "PDF" },
                { name: "Technical_Review_P-102.pdf", type: "PDF" }
              ].map((art, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 rounded bg-[var(--color-surface)] border border-[var(--color-surlection)] text-[11px]"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText size={13} className="text-[#8B5CF6] flex-none" />
                    <span className="text-[var(--color-text-primary)] truncate">{art.name}</span>
                  </div>
                  <span className="text-[9px] font-mono text-[#10B981] px-1 rounded bg-emerald-500/10 border border-emerald-500/30 flex-none">
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
          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
            <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
              MODEL ROUTER DECISION
            </span>
            <span className="text-[10px] font-mono text-[#10B981]">● ON-DEVICE ROUTED</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-surlection)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-[var(--color-text-primary)] font-mono">Qwen 2.5:7b-instruct</span>
                <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  ACTIVE
                </span>
              </div>
              <p className="text-[10.5px] text-[var(--color-text-secondary)]">
                Selected for multi-step reasoning, OCR tabular extraction, and ISO norm verification.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--color-border)] text-[10px] font-mono">
                <div>
                  <span className="text-[var(--color-text-muted)]">LATENCY:</span>
                  <p className="text-[var(--color-text-primary)] font-bold">1.82s (38.4 tok/s)</p>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)]">HARDWARE:</span>
                  <p className="text-[#14B8A6] font-bold">GTX 1660 Ti 6GB</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-mono font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
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
                  className="p-2.5 rounded bg-[var(--color-surface)] border border-[var(--color-surlection)] flex items-center justify-between text-[11px] font-mono"
                >
                  <div>
                    <p className="text-[var(--color-text-primary)] font-semibold">{p.role}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">{p.model}</p>
                  </div>
                  <span className="text-[9.5px] text-[#10B981]">{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: TASK SECURITY (Matches Video 00:30-00:32 Exact 1:1 Layout) ── */}
      {activeTab === "security" && (
        <div className="p-3.5 space-y-4 animate-fade-up">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="pb-1 border-b border-[var(--color-border)]">
              <p className="text-[11px] font-mono font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
                TASK SECURITY
              </p>
            </div>

            {/* Green Zero External Calls Box (Exact from Video 00:30) */}
            <div className="rounded-[8px] bg-[var(--color-surface-subtle)] border border-[#10B981]/40 p-3 space-y-1">
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
              <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-text-secondary)]">Classification</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  CONFIDENTIAL
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-text-secondary)]">Inference</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  LOCAL ONLY
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-text-secondary)]">Storage</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  LOCAL ONLY
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-text-secondary)]">Network</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  ISOLATED
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-text-secondary)]">Sandbox</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 border border-red-500/30 text-red-400">
                  DESTROYED
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-text-secondary)]">Audit</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  LOGGED
                </span>
              </div>
            </div>
          </div>

          {/* Quick link to full Hubble / Prometheus / Grafana Screen */}
          <div className="pt-2">
            <button
              onClick={() => navigate("system-health")}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-[6px] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-border)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] text-[11px] font-mono transition-colors cursor-pointer"
            >
              <span>View eBPF & Prometheus</span>
              <ChevronRight size={12} className="text-[#14B8A6]" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function SecurityCenter({ initialTab = "hubble" }: SecurityScreenProps) {
  const resolvedTab: SecurityTab =
    initialTab === "prometheus" || initialTab === "system-health"
      ? "prometheus"
      : initialTab === "opentelemetry"
      ? "opentelemetry"
      : initialTab === "loki"
      ? "loki"
      : initialTab === "sandbox"
      ? "sandbox"
      : initialTab === "audit" || initialTab === "grafana" || initialTab === "governance"
      ? "governance"
      : "hubble";

  const [activeTab, setActiveTab] = useState<SecurityTab>(resolvedTab);
  const [liveStream, setLiveStream] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      if (initialTab === "prometheus" || initialTab === "system-health") setActiveTab("prometheus");
      else if (initialTab === "opentelemetry") setActiveTab("opentelemetry");
      else if (initialTab === "loki") setActiveTab("loki");
      else if (initialTab === "sandbox") setActiveTab("sandbox");
      else if (initialTab === "audit" || initialTab === "grafana" || initialTab === "governance") setActiveTab("governance");
      else setActiveTab("hubble");
    }
  }, [initialTab]);

  // Data states with safe fallbacks
  const [items, setItems] = useState<SecurityStatusItem[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [networkInfo, setNetworkInfo] = useState<{ status: any; policy_manifest: string } | null>(null);
  const [hubbleData, setHubbleData] = useState<{ flows: FlowRecord[]; stats: HubbleStats } | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [otelTraces, setOtelTraces] = useState<any[]>([]);
  const [lokiLogs, setLokiLogs] = useState<any[]>([]);
  const [sandboxInfo, setSandboxInfo] = useState<any>(null);

  // Hubble Topology Interactive State
  const [nodes, setNodes] = useState<Record<string, TopologyNode>>(DEFAULT_TOPOLOGY_NODES);
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Filter states
  const [flowFilter, setFlowFilter] = useState<"ALL" | "FORWARDED" | "DROPPED">("ALL");
  const [flowSearch, setFlowSearch] = useState<string>("");
  const [selectedFlow, setSelectedFlow] = useState<FlowRecord | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [lokiFilter, setLokiFilter] = useState<string>("ALL");
  const [lokiSearch, setLokiSearch] = useState<string>("");
  const [copiedMetric, setCopiedMetric] = useState<boolean>(false);

  // OpenTelemetry Interactive DAG Graph States
  const [selectedTraceId, setSelectedTraceId] = useState<string>("otel-trace-p102-7a4f");
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>("span-02");
  const [traceViewMode, setTraceViewMode] = useState<"dag" | "waterfall" | "both">("dag");
  const [dagZoom, setDagZoom] = useState<number>(1.0);
  const [showRawOtelJson, setShowRawOtelJson] = useState<boolean>(false);
  const [traceCopied, setTraceCopied] = useState<boolean>(false);

  const svgContainerRef = useRef<HTMLDivElement>(null);

  const loadData = async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError(null);
    try {
      const [statusRes, eventsRes, netRes, hubbleRes, telemRes, otelRes, lokiRes, sandRes] = await Promise.all([
        api.security.status().catch(() => null),
        api.security.events(50).catch(() => []),
        api.security.network().catch(() => null),
        api.security.hubbleFlows(50).catch(() => null),
        api.security.telemetry().catch(() => null),
        api.security.opentelemetryTraces().catch(() => null),
        api.security.lokiLogs().catch(() => null),
        api.security.sandboxStatus().catch(() => null),
      ]);

      if (statusRes?.items) setItems(statusRes.items);
      if (eventsRes) setEvents(eventsRes);
      if (netRes) setNetworkInfo(netRes);
      if (hubbleRes) setHubbleData(hubbleRes);
      if (telemRes) setTelemetry(telemRes);
      if (otelRes?.traces && otelRes.traces.length > 0) {
        setOtelTraces(otelRes.traces);
        if (!selectedTraceId) setSelectedTraceId(otelRes.traces[0].trace_id);
      }
      if (lokiRes?.logs) setLokiLogs(lokiRes.logs);
      if (sandRes) setSandboxInfo(sandRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load telemetry");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData(false);
  }, []);

  useEffect(() => {
    if (!liveStream) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [liveStream]);

  // Derived telemetry metrics
  const sys = useMemo(() => {
    return {
      cpu_percent: telemetry?.system?.cpu_percent ?? 1.5,
      memory_used_gb: telemetry?.system?.memory_used_gb ?? 12.36,
      memory_total_gb: telemetry?.system?.memory_total_gb ?? 15.79,
      memory_percent: telemetry?.system?.memory_percent ?? 78.3,
      uptime: telemetry?.system?.uptime ?? "119 days, 2 hours",
      threads_active: telemetry?.system?.threads_active ?? 164,
    };
  }, [telemetry]);

  const gpu = useMemo(() => {
    return {
      model: telemetry?.gpu?.model ?? "NVIDIA GeForce GTX 1660 Ti",
      vram_allocated_gb: telemetry?.gpu?.vram_allocated_gb ?? 0.0,
      vram_total_gb: telemetry?.gpu?.vram_total_gb ?? 6.0,
      vram_percent: telemetry?.gpu?.vram_percent ?? 0.0,
      temperature_c: telemetry?.gpu?.temperature_c ?? 42,
      compute_load_percent: telemetry?.gpu?.compute_load_percent ?? 0,
      fan_speed_percent: telemetry?.gpu?.fan_speed_percent ?? 0,
      tokens_per_sec: telemetry?.gpu?.tokens_per_sec ?? 38.4,
    };
  }, [telemetry]);

  const kpis = useMemo(() => {
    return {
      prompt_injections_blocked: telemetry?.security_kpis?.prompt_injections_blocked ?? 1,
      unauthorized_access_denied: telemetry?.security_kpis?.unauthorized_access_denied ?? 0,
      dlp_redactions_total: telemetry?.security_kpis?.dlp_redactions_total ?? 19,
      sandbox_violations_quarantined: telemetry?.security_kpis?.sandbox_violations_quarantined ?? 4,
    };
  }, [telemetry]);

  const dlpList = useMemo(() => {
    return telemetry?.dlp_stats && telemetry.dlp_stats.length > 0
      ? telemetry.dlp_stats
      : [
          { rule: "API_SECRET_KEY Scrubber", count: 6, color: "#EF4444" },
          { rule: "Aadhaar Number Scrubber", count: 4, color: "#F59E0B" },
          { rule: "Proprietary Catalyst Formula", count: 3, color: "#8B5CF6" },
          { rule: "Corporate Password Hash", count: 3, color: "#EC4899" },
          { rule: "US SSN Pattern Redaction", count: 2, color: "#3B82F6" },
          { rule: "Private Key Certificate Scrubber", count: 1, color: "#14B8A6" },
        ];
  }, [telemetry]);

  const defaultFlows: FlowRecord[] = [
    { id: "flow-101", time: "16:30:12.420", src: "127.0.0.1:8443 (Workbench UI)", dst: "127.0.0.1:8000 (API Gateway)", protocol: "HTTP/2", verdict: "FORWARDED", latency_ms: 0.42, policy: "allow-frontend-to-gateway", details: "GET /api/security/status -> 200 OK" },
    { id: "flow-102", time: "16:30:15.110", src: "127.0.0.1:8000 (API Gateway)", dst: "127.0.0.1:11434 (Local Ollama: GTX 1660 Ti)", protocol: "HTTP/1.1", verdict: "FORWARDED", latency_ms: 1.15, policy: "allow-gateway-to-ollama", details: "POST /api/generate (qwen2.5:7b)" },
    { id: "flow-103", time: "16:30:18.050", src: "127.0.0.1:8000 (API Gateway)", dst: "127.0.0.1:6333 (Local Vector DB)", protocol: "gRPC", verdict: "FORWARDED", latency_ms: 0.88, policy: "allow-gateway-to-qdrant", details: "RPC SearchPoints: embeddings=bge-m3" },
    { id: "flow-104", time: "16:30:21.000", src: "127.0.0.1:8000 (API Gateway)", dst: "local-disk:app.db (SQLite Storage)", protocol: "IPC / File", verdict: "FORWARDED", latency_ms: 0.15, policy: "allow-internal-storage", details: "SELECT * FROM audit_events" },
    { id: "flow-105", time: "16:30:24.000", src: "sandbox-worker (UID 10001)", dst: "local-scratch:workspace", protocol: "IPC / Sandbox", verdict: "FORWARDED", latency_ms: 0.22, policy: "sandbox-confined-execution", details: "Code analysis inside isolated container" },
    { id: "flow-106", time: "16:30:28.150", src: "kernel-airgap (0.0.0.0/0:443)", dst: "WAN Gateway (External Internet)", protocol: "TCP / IP", verdict: "DROPPED", latency_ms: 0.00, policy: "iptables-airgap: default-drop-egress", details: "BLOCKED: Air-Gap enforcement active. Zero outbound internet packets allowed." },
    { id: "flow-107", time: "16:30:32.000", src: "kernel-airgap (0.0.0.0/0:53)", dst: "Public DNS Resolvers", protocol: "UDP / DNS", verdict: "DROPPED", latency_ms: 0.00, policy: "iptables-airgap: drop-external-dns", details: "BLOCKED: Public DNS query dropped; Local loopback resolver only" },
  ];

  const flowsToDisplay = hubbleData?.flows && hubbleData.flows.length > 0 ? hubbleData.flows : defaultFlows;

  const filteredFlows = flowsToDisplay.filter((f) => {
    if (flowFilter !== "ALL" && f.verdict !== flowFilter) return false;
    if (flowSearch.trim()) {
      const q = flowSearch.toLowerCase();
      return (
        f.src.toLowerCase().includes(q) ||
        f.dst.toLowerCase().includes(q) ||
        f.details.toLowerCase().includes(q) ||
        f.policy.toLowerCase().includes(q)
      );
    }
    if (selectedNodeId) {
      const nodeObj = nodes[selectedNodeId];
      if (nodeObj) {
        const needle = nodeObj.name.toLowerCase();
        return (
          f.src.toLowerCase().includes(needle) ||
          f.dst.toLowerCase().includes(needle) ||
          f.details.toLowerCase().includes(needle)
        );
      }
    }
    return true;
  });

  // Hubble Canvas Interactions
  const handleZoomIn = () => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)));
  const handleResetTopology = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setNodes(DEFAULT_TOPOLOGY_NODES);
    setSelectedNodeId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setZoom((z) => Math.max(0.4, Math.min(2.5, +(z + delta).toFixed(2))));
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNodeId) {
      const dx = (e.clientX - dragOffset.x) / zoom;
      const dy = (e.clientY - dragOffset.y) / zoom;
      setNodes((prev) => {
        const cur = prev[draggingNodeId];
        if (!cur) return prev;
        return {
          ...prev,
          [draggingNodeId]: {
            ...cur,
            x: Math.max(10, Math.min(1150, cur.x + dx)),
            y: Math.max(10, Math.min(500, cur.y + dy)),
          },
        };
      });
      setDragOffset({ x: e.clientX, y: e.clientY });
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  // Dynamic Anchor points
  const fe = nodes.frontend || DEFAULT_TOPOLOGY_NODES.frontend;
  const be = nodes.backend || DEFAULT_TOPOLOGY_NODES.backend;
  const wf = nodes.waf || DEFAULT_TOPOLOGY_NODES.waf;
  const sb = nodes.sandbox || DEFAULT_TOPOLOGY_NODES.sandbox;
  const ol = nodes.ollama || DEFAULT_TOPOLOGY_NODES.ollama;
  const qd = nodes.qdrant || DEFAULT_TOPOLOGY_NODES.qdrant;
  const sq = nodes.sqlite || DEFAULT_TOPOLOGY_NODES.sqlite;
  const ag = nodes.airgap || DEFAULT_TOPOLOGY_NODES.airgap;

  // Active OpenTelemetry trace calculation
  const tracesList = otelTraces.length > 0 ? otelTraces : [
    {
      trace_id: "otel-trace-p102-7a4f",
      root_task: "Inspection Intelligence Task #1042: Pump P-102 Overhaul Analysis",
      user: "Arjun Mehta (Lead Engineer)",
      timestamp: "2026-09-07T09:42:01.240Z",
      total_duration_ms: 1587,
      status: "SUCCESS",
      summary: "Multi-agent pipeline retrieved vibration logs, parsed optical photos via OCR, ran hydrodynamic stress model in isolated Docker container, verified ISO 10816-3 compliance, and generated Word briefing note.",
      spans: [
        { span_id: "span-01", parent_span_id: null, name: "Intent Detection & FastPath Guard", component: "fast-path-router", category: "GATEWAY", duration_ms: 12, status: "OK", model: "rule-heuristic", details: "Classified as: COMPLEX_INDUSTRIAL_QUERY. Fast-path cache bypassed.", network_egress: "0 B (in-process)", inputs: "User prompt: 'Run complete overhaul analysis for Pump P-102 with vibration spectrum and ISO compliance'", outputs: "Routing intent: SUPERVISOR_PLANNER_REQUIRED, Priority: HIGH" },
        { span_id: "span-02", parent_span_id: "span-01", name: "Planner / Supervisor Execution Plan", component: "planner-agent", category: "REASONING", duration_ms: 38, status: "OK", model: "qwen2.5:7b-instruct", details: "Generated DAG execution graph with parallel RAG retrieval & OCR analysis branches.", network_egress: "0 B (local Ollama)", inputs: "Domain: Rotating Equipment Inspection, Equipment Tag: P-102", outputs: "Execution DAG: [03 Router] -> [04 RAG, 05 OCR] -> [06 Sandbox] -> [07 Norm Verification] -> [08 DLP] -> [09 Artifact Gen]" },
        { span_id: "span-03", parent_span_id: "span-02", name: "Model Router Silicon Selection", component: "model-router", category: "ORCHESTRATION", duration_ms: 8, status: "OK", model: "local-router", details: `Allocated tensor cores on local ${gpu.model} (confidence: 99.4%).`, network_egress: "0 B (PCIe Direct)", inputs: "Task Complexity: High Reasoning, Target VRAM: <= 5.8 GB", outputs: `Hardware Target: ${gpu.model}, Selected Quant: qwen2.5:7b-instruct-q4_K_M` },
        { span_id: "span-04", parent_span_id: "span-03", name: "Permission-Aware RAG Retrieval", component: "qdrant-vector-rag", category: "MEMORY", duration_ms: 184, status: "OK", model: "bge-m3-embeddings", details: "Dense vector similarity search (top-k=6) on mrpl_knowledge. Clearance: CONFIDENTIAL.", network_egress: "0 B (127.0.0.1:6333 gRPC)", inputs: "Query: 'P-102 historical vibration baseline, impeller clearance specs'", outputs: "Retrieved 6 chunks (ISO 10816-3 Table 1, P-102 Maintenance Record 2025)" },
        { span_id: "span-05", parent_span_id: "span-03", name: "Vision / OCR Tabular Extraction", component: "vision-analyzer", category: "VISION", duration_ms: 612, status: "OK", model: "local-vision-ocr", details: "Extracted operating pressure: 42.0 bar, corrosion depth: 3.8 mm from P-102_Equipment_Photo.jpg.", network_egress: "0 B (Local CUDA)", inputs: "File: P-102_Equipment_Photo.jpg (Resolution: 1920x1080, sha256: 8a4b...)", outputs: "Extracted Key-Values: Pressure=42 bar, Shaft RMS=7.1 mm/s, Corrosion=3.8mm" },
        { span_id: "span-06", parent_span_id: "span-04", name: "Autonomous Code Sandbox Execution", component: "docker-sandbox-runner", category: "SANDBOX", duration_ms: 215, status: "OK", model: "python-sandbox-isolated", details: "Calculated pressure deviation (+2 bar over tolerance). Kernel dropped all egress packets.", network_egress: "0 B (Network: NONE, UID 10001)", inputs: "Python script: calculate_stress_curve(p=42.0, vib=7.1, allowable=4.5)", outputs: "Exit Code: 0, stdout: 'ALLOWABLE_EXCEEDED: Deviation=+57.8%, Category D Zone'" },
        { span_id: "span-07", parent_span_id: "span-06", name: "Norm Verification Engine", component: "verification-agent", category: "COMPLIANCE", duration_ms: 42, status: "OK", model: "qwen2.5:7b-instruct", details: "Audited vs ISO 10816-3 and API 610 vibration norms (Verdict: HIGH SEVERITY / RESTRICTED OPERATION).", network_egress: "0 B (local Ollama)", inputs: "Sandbox Results + ISO 10816-3 Class II / Group 1 norms", outputs: "Compliance Result: NON_COMPLIANT, Action Required: Immediate bearing replacement" },
        { span_id: "span-08", parent_span_id: "span-07", name: "Dual-Pass DLP Sanitization", component: "dlp-sentinel", category: "SECURITY", duration_ms: 14, status: "OK", model: "regex-nlp-dlp", details: "Sanitized context stream: 0 Aadhaar, 0 API credentials, 0 formula leaks detected.", network_egress: "0 B (In-Memory Regex)", inputs: "Raw synthesis payload (3,412 tokens)", outputs: "Sanitization Verdict: CLEAN (0 redactions needed)" },
        { span_id: "span-09", parent_span_id: "span-08", name: "Artifact Document Generation", component: "file-document-generator", category: "ARTIFACT", duration_ms: 465, status: "OK", model: "docx-generator", details: "Compiled Approval_Note_P-102_2026.docx sealed with SHA-256 integrity hash.", network_egress: "0 B (Local Disk FS)", inputs: "Template: ISO_Inspection_Note.dotx, Payload: Verified P-102 Findings", outputs: "Artifact Created: Approval_Note_P-102_2026.docx (SHA-256: 3e8f1b...)" },
      ],
    },
  ];

  const activeTrace = tracesList.find((t) => t.trace_id === selectedTraceId) || tracesList[0];
  const activeSpan = activeTrace?.spans?.find((s: any) => s.span_id === selectedSpanId) || activeTrace?.spans?.[0];

  const handleCopyTraceId = (tid: string) => {
    navigator.clipboard.writeText(tid);
    setTraceCopied(true);
    setTimeout(() => setTraceCopied(false), 2000);
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "GATEWAY": return { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400", hex: "#06B6D4" };
      case "REASONING": return { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", hex: "#A855F7" };
      case "ORCHESTRATION": return { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400", hex: "#6366F1" };
      case "MEMORY": return { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", hex: "#3B82F6" };
      case "VISION": return { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", hex: "#10B981" };
      case "SANDBOX": return { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", hex: "#F59E0B" };
      case "COMPLIANCE": return { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-400", hex: "#14B8A6" };
      case "SECURITY": return { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400", hex: "#F43F5E" };
      case "ARTIFACT": return { bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/30", text: "text-fuchsia-400", hex: "#D946EF" };
      default: return { bg: "bg-slate-500/10", border: "border-slate-500/30", text: "text-slate-900", hex: "var(--color-text-muted)" };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] overflow-y-auto select-none">
      {/* Top Header Banner */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[8px] bg-gradient-to-br from-[#14B8A6] to-[#0D9488] flex items-center justify-center shadow-lg shadow-[#14B8A6]/20 flex-none">
            <Shield size={22} className="text-[var(--color-text-primary)]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[17px] font-bold text-[var(--color-text-primary)] tracking-wide">
                Security & Observability Command Center
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#14B8A6]/20 text-[#14B8A6] border border-[#14B8A6]/40 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] animate-pulse-dot" />
                FULLY LOCAL & COMPLIANT
              </span>
            </div>
            <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
              Cilium Hubble eBPF Mesh · Prometheus/Grafana Telemetry · OpenTelemetry Traces & Interactive DAG · Loki Logs · Docker Jail · RBAC Governance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setLiveStream(!liveStream)}
            className={`px-3 py-1.5 rounded-[7px] text-[11px] font-mono border transition-all flex items-center gap-1.5 ${
              liveStream
                ? "bg-[#14B8A6]/15 text-[#14B8A6] border-[#14B8A6]/40 shadow-sm"
                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[#253852]"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${liveStream ? "bg-[#14B8A6] animate-ping" : "bg-[var(--color-text-muted)]"}`} />
            {liveStream ? "LIVE TELEMETRY ON" : "STREAM PAUSED"}
          </button>

          <button
            onClick={() => loadData(false)}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-[7px] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] text-[11px] font-mono flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            Sync Now
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 flex items-center gap-1 overflow-x-auto flex-none scrollbar-none">
        <button
          onClick={() => setActiveTab("hubble")}
          className={`px-4 py-3 text-[12px] font-mono flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "hubble"
              ? "border-[#14B8A6] text-[#14B8A6] font-semibold bg-[#14B8A6]/5"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-secondary)]"
          }`}
        >
          <Network size={14} />
          <span>1. Cilium + Hubble (eBPF Mesh)</span>
        </button>

        <button
          onClick={() => setActiveTab("prometheus")}
          className={`px-4 py-3 text-[12px] font-mono flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "prometheus"
              ? "border-[#14B8A6] text-[#14B8A6] font-semibold bg-[#14B8A6]/5"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-secondary)]"
          }`}
        >
          <Gauge size={14} />
          <span>2. Prometheus + Grafana ({gpu.model.replace("NVIDIA GeForce ", "")})</span>
        </button>

        <button
          onClick={() => setActiveTab("opentelemetry")}
          className={`px-4 py-3 text-[12px] font-mono flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "opentelemetry"
              ? "border-[#EC4899] text-[#EC4899] font-semibold bg-[#EC4899]/5"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-secondary)]"
          }`}
        >
          <Workflow size={14} />
          <span>3. OpenTelemetry (Agent Execution DAG)</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-[#EC4899]/20 text-[#EC4899] font-bold">DAG GRAPH</span>
        </button>

        <button
          onClick={() => setActiveTab("loki")}
          className={`px-4 py-3 text-[12px] font-mono flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "loki"
              ? "border-[#3B82F6] text-[#3B82F6] font-semibold bg-[#3B82F6]/5"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-secondary)]"
          }`}
        >
          <Terminal size={14} />
          <span>4. Loki Logs (Centralized)</span>
        </button>

        <button
          onClick={() => setActiveTab("sandbox")}
          className={`px-4 py-3 text-[12px] font-mono flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "sandbox"
              ? "border-[#F59E0B] text-[#F59E0B] font-semibold bg-[#F59E0B]/5"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-secondary)]"
          }`}
        >
          <Box size={14} />
          <span>5. Docker + Firewall (Sandbox Jail)</span>
        </button>

        <button
          onClick={() => setActiveTab("governance")}
          className={`px-4 py-3 text-[12px] font-mono flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "governance"
              ? "border-[#10B981] text-[#10B981] font-semibold bg-[#10B981]/5"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-secondary)]"
          }`}
        >
          <FileSearch size={14} />
          <span>6. Governance & RBAC (Audit Trail)</span>
        </button>
      </div>

      {/* Tab Content Panels */}
      <div className="flex-1 p-6 space-y-6">
        {/* TAB 1: CILIUM + HUBBLE (eBPF Network Security & Packet Mesh) */}
        {activeTab === "hubble" && (
          <div className="space-y-6 animate-fade-up">
            {/* Hubble KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="rounded-[10px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] p-3.5">
                <span className="text-[10px] font-mono uppercase text-[var(--color-text-muted)]">TOTAL FLOWS CAPTURED</span>
                <div className="text-[20px] font-bold font-mono text-[var(--color-text-primary)] mt-1">
                  {hubbleData?.stats?.total_flows_captured?.toLocaleString() ?? "4,128"}
                </div>
                <div className="text-[10.5px] text-[#14B8A6] font-mono mt-0.5">eBPF TC/XDP Hooks: Active</div>
              </div>

              <div className="rounded-[10px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] p-3.5">
                <span className="text-[10px] font-mono uppercase text-[var(--color-text-muted)]">FORWARDED (LOCAL LAN)</span>
                <div className="text-[20px] font-bold font-mono text-[#10B981] mt-1">
                  {hubbleData?.stats?.forwarded_flows?.toLocaleString() ?? "4,128"}
                </div>
                <div className="text-[10.5px] text-[var(--color-text-secondary)] font-mono mt-0.5">100% Intranet Ingress (0.42ms avg)</div>
              </div>

              <div className="rounded-[10px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] p-3.5">
                <span className="text-[10px] font-mono uppercase text-[var(--color-text-muted)]">DROPPED (CLOUD EGRESS)</span>
                <div className="text-[20px] font-bold font-mono text-emerald-400 mt-1">
                  0
                </div>
                <div className="text-[10.5px] text-emerald-400 font-mono mt-0.5">Airgap Deny: 100% Intercept Rate</div>
              </div>

              <div className="rounded-[10px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] p-3.5">
                <span className="text-[10px] font-mono uppercase text-[var(--color-text-muted)]">HUBBLE RELAY STATUS</span>
                <div className="text-[15px] font-bold font-mono text-[#8B5CF6] truncate mt-1">
                  {hubbleData?.stats?.hubble_relay ?? "CONNECTED (Local eBPF / Workstation Loopback)"}
                </div>
                <div className="text-[10.5px] text-[var(--color-text-secondary)] font-mono mt-1">Policy Mode: Enforcing</div>
              </div>
            </div>

            {/* Interactive Zoomable, Pannable & Movable SVG Service Topology Map */}
            <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden shadow-xl">
              <div className="px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Network size={16} className="text-[#14B8A6]" />
                  <div>
                    <span className="text-[12.5px] font-bold text-[var(--color-text-primary)] tracking-wide uppercase font-mono">
                      Cilium eBPF Service Mesh Topology Map
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] block font-mono">
                      Interactive: Drag nodes to position • Drag canvas to pan • Scroll to zoom
                    </span>
                  </div>
                </div>

                {/* HUD Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedNodeId && (
                    <button
                      onClick={() => setSelectedNodeId(null)}
                      className="px-2 py-1 rounded bg-[#14B8A6]/20 text-[#14B8A6] border border-[#14B8A6]/40 text-[10.5px] font-mono hover:bg-[#14B8A6]/30 flex items-center gap-1"
                    >
                      <X size={11} /> Filter: {selectedNodeId}
                    </button>
                  )}

                  <div className="flex items-center bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[6px] p-0.5">
                    <button
                      onClick={handleZoomOut}
                      title="Zoom Out"
                      className="w-7 h-7 flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)] rounded"
                    >
                      <ZoomOut size={13} />
                    </button>
                    <span className="px-2 text-[11px] font-mono text-[#14B8A6] font-bold min-w-[42px] text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      title="Zoom In"
                      className="w-7 h-7 flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)] rounded"
                    >
                      <ZoomIn size={13} />
                    </button>
                  </div>

                  <button
                    onClick={handleResetTopology}
                    title="Reset Zoom, Pan and Node Positions"
                    className="h-8 px-2.5 rounded-[6px] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[11px] font-mono text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw size={12} />
                    Reset Layout
                  </button>
                </div>
              </div>

              {/* Topology Canvas Container */}
              <div
                ref={svgContainerRef}
                className="p-3 bg-[var(--color-bg-secondary)] relative overflow-hidden select-none"
                style={{ height: "540px" }}
              >
                <svg
                  viewBox="0 0 1260 550"
                  className="w-full h-full"
                  style={{
                    background: "var(--color-bg-secondary)",
                    borderRadius: "8px",
                    cursor: draggingNodeId ? "grabbing" : isPanning ? "grabbing" : "grab",
                  }}
                  onWheel={handleWheel}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <defs>
                    <linearGradient id="gradForward" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#10B981" stopOpacity="0.9" />
                    </linearGradient>
                    <linearGradient id="gradBlocked" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#EF4444" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#DC2626" stopOpacity="0.9" />
                    </linearGradient>
                    <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--color-surface-subtle)" strokeWidth="0.8" />
                    </pattern>
                  </defs>

                  {/* Canvas Group with dynamic Pan and Zoom */}
                  <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {/* Background Grid */}
                    <rect x="0" y="0" width="1260" height="550" fill="url(#gridPattern)" />

                    {/* Zone Boundaries */}
                    {/* 1. Trusted Zone */}
                    <rect
                      x="25"
                      y="15"
                      width="875"
                      height="520"
                      rx="10"
                      fill="var(--color-bg-secondary)"
                      fillOpacity="0.75"
                      stroke="var(--color-border)"
                      strokeWidth="1.4"
                    />
                    <text x="45" y="42" fill="#14B8A6" fontSize="11" fontWeight="bold" fontFamily="monospace">
                      [KNOVIA ON-PREM TRUSTED NETWORK]
                    </text>
                    <text x="45" y="58" fill="var(--color-text-muted)" fontSize="9" fontFamily="monospace">
                      eBPF Encapsulated Flow Mesh · Zero External Ingress/Egress Allowed
                    </text>

                    {/* 2. Airgap Strict Barrier */}
                    <rect
                      x="920"
                      y="15"
                      width="315"
                      height="520"
                      rx="10"
                      fill="#FEE2E2"
                      fillOpacity="0.35"
                      stroke="#EF4444"
                      strokeWidth="1.5"
                      strokeDasharray="6,4"
                    />
                    <text x="940" y="42" fill="#EF4444" fontSize="11" fontWeight="bold" fontFamily="monospace">
                      [AIR-GAP STRICT PERIMETER BARRIER]
                    </text>
                    <text x="940" y="58" fill="#F87171" fontSize="9" fontFamily="monospace">
                      eBPF Drops All Egress Packets (TC_ACT_SHOT)
                    </text>

                    {/* FLOW PATHS (Dynamically derived from node coordinates) */}

                    {/* 1. Frontend -> Backend */}
                    <path
                      d={`M ${fe.x + fe.width} ${fe.y + 36} L ${be.x} ${be.y + 36}`}
                      stroke="url(#gradForward)"
                      strokeWidth="2.5"
                      strokeDasharray="6,4"
                    />
                    <g transform={`translate(${(fe.x + fe.width + be.x) / 2}, ${(fe.y + 36 + be.y + 36) / 2 - 14})`}>
                      <rect x="-48" y="-10" width="96" height="18" rx="4" fill="var(--color-bg-secondary)" stroke="#14B8A6" strokeWidth="0.8" />
                      <text x="0" y="3" fill="#14B8A6" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                        HTTP/2 · 0.42ms
                      </text>
                    </g>

                    {/* 2. Backend -> WAF Sentinel */}
                    <path
                      d={`M ${be.x + 85} ${be.y} L ${wf.x + 85} ${wf.y + wf.height}`}
                      stroke="url(#gradForward)"
                      strokeWidth="2.2"
                      strokeDasharray="5,4"
                    />
                    <g transform={`translate(${be.x + 85}, ${(be.y + wf.y + wf.height) / 2})`}>
                      <rect x="-44" y="-9" width="88" height="18" rx="4" fill="var(--color-bg-secondary)" stroke="#C084FC" strokeWidth="0.8" />
                      <text x="0" y="3" fill="#C084FC" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                        In-Memory DPI
                      </text>
                    </g>

                    {/* 3. Backend -> Ollama */}
                    <path
                      d={`M ${be.x + be.width} ${be.y + 20} L ${ol.x} ${ol.y + 36}`}
                      stroke="url(#gradForward)"
                      strokeWidth="2.5"
                      strokeDasharray="6,4"
                    />
                    <g transform={`translate(${(be.x + be.width + ol.x) / 2}, ${(be.y + 20 + ol.y + 36) / 2 - 12})`}>
                      <rect x="-46" y="-9" width="92" height="18" rx="4" fill="var(--color-bg-secondary)" stroke="#10B981" strokeWidth="0.8" />
                      <text x="0" y="3" fill="#10B981" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                        PASS · 1.15ms
                      </text>
                    </g>

                    {/* 4. Backend -> Qdrant */}
                    <path
                      d={`M ${be.x + be.width} ${be.y + 36} L ${qd.x} ${qd.y + 36}`}
                      stroke="url(#gradForward)"
                      strokeWidth="2.5"
                      strokeDasharray="6,4"
                    />
                    <g transform={`translate(${(be.x + be.width + qd.x) / 2}, ${(be.y + 36 + qd.y + 36) / 2 - 12})`}>
                      <rect x="-44" y="-9" width="88" height="18" rx="4" fill="var(--color-bg-secondary)" stroke="#3B82F6" strokeWidth="0.8" />
                      <text x="0" y="3" fill="#60A5FA" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                        gRPC · 0.88ms
                      </text>
                    </g>

                    {/* 5. Backend -> SQLite */}
                    <path
                      d={`M ${be.x + be.width} ${be.y + 52} L ${sq.x} ${sq.y + 36}`}
                      stroke="url(#gradForward)"
                      strokeWidth="2.5"
                      strokeDasharray="6,4"
                    />
                    <g transform={`translate(${(be.x + be.width + sq.x) / 2}, ${(be.y + 52 + sq.y + 36) / 2 - 12})`}>
                      <rect x="-42" y="-9" width="84" height="18" rx="4" fill="var(--color-bg-secondary)" stroke="#A78BFA" strokeWidth="0.8" />
                      <text x="0" y="3" fill="#A78BFA" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                        IPC · 0.15ms
                      </text>
                    </g>

                    {/* 6. Sandbox -> Backend */}
                    <path
                      d={`M ${sb.x + 85} ${sb.y} L ${be.x + 85} ${be.y + be.height}`}
                      stroke="url(#gradForward)"
                      strokeWidth="2.2"
                      strokeDasharray="5,4"
                    />
                    <g transform={`translate(${sb.x + 85}, ${(sb.y + be.y + be.height) / 2})`}>
                      <rect x="-38" y="-9" width="76" height="18" rx="4" fill="var(--color-bg-secondary)" stroke="#EC4899" strokeWidth="0.8" />
                      <text x="0" y="3" fill="#F472B6" fontSize="8.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                        Local IPC
                      </text>
                    </g>

                    {/* AIRGAP PERIMETER BARRIER (100% OFFLINE / ZERO CLOUD EGRESS) */}
                    <line
                      x1={910}
                      y1={35}
                      x2={910}
                      y2={515}
                      stroke="#EF4444"
                      strokeWidth="2.5"
                      strokeDasharray="6,6"
                    />
                    {/* Air-Gap Lock Indicator at Barrier Entrance */}
                    <g transform={`translate(${ag.x - 30}, ${ag.y + 45})`}>
                      <circle cx="0" cy="0" r="14" fill="#EF4444" />
                      <text x="0" y="4.5" fill="#FFFFFF" fontSize="13" fontWeight="bold" fontFamily="monospace" textAnchor="middle">🔒</text>
                      <rect x="-175" y="-12" width="160" height="24" rx="4" fill="#1C0A0E" stroke="#EF4444" strokeWidth="1" />
                      <text x="-95" y="4" fill="#FCA5A5" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                        AIR-GAP LOCKED (0.0.0.0/0)
                      </text>
                    </g>

                    {/* INTERACTIVE DRAGGABLE NODES */}
                    {Object.values(nodes).map((node) => {
                      const isSelected = selectedNodeId === node.id;
                      const isDragging = draggingNodeId === node.id;

                      return (
                        <g
                          key={node.id}
                          transform={`translate(${node.x}, ${node.y})`}
                          className="cursor-grab active:cursor-grabbing"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingNodeId(node.id);
                            setDragOffset({ x: e.clientX, y: e.clientY });
                            setSelectedNodeId(node.id);
                          }}
                        >
                          {/* Node Shadow & Background */}
                          <rect
                            x="0"
                            y="0"
                            width={node.width}
                            height={node.height}
                            rx="8"
                            fill={node.bg}
                            stroke={isSelected ? node.activeBorder : isDragging ? "#FFFFFF" : node.border}
                            strokeWidth={isSelected || isDragging ? "2.5" : "1.5"}
                            filter="drop-shadow(0px 4px 12px rgba(0,0,0,0.6))"
                          />

                          {/* Node Header Tag */}
                          <rect
                            x="10"
                            y="8"
                            width={node.width - 20}
                            height="16"
                            rx="3"
                            fill={node.tagBg}
                          />
                          <text
                            x={node.width / 2}
                            y="19"
                            fill={node.tagColor}
                            fontSize="8.5"
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {node.tag}
                          </text>

                          {/* Node Main Title */}
                          <text
                            x={node.width / 2}
                            y="42"
                            fill={node.textColor}
                            fontSize="11.5"
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {node.name}
                          </text>

                          {/* Node Subtitle */}
                          <text
                            x={node.width / 2}
                            y="58"
                            fill={node.subColor}
                            fontSize="9"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {node.sub}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>
            </div>

            {/* Real-time Hubble Flow Records Table */}
            <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Terminal size={16} className="text-[#14B8A6]" />
                  <span className="text-[13px] font-bold text-[var(--color-text-primary)] tracking-wide font-mono uppercase">
                    eBPF Kernel Packet Flow Table
                  </span>
                  <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
                    ({filteredFlows.length} flows matching filter)
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center bg-[var(--color-bg-secondary)] rounded-md border border-[var(--color-border)] p-0.5 text-[11px] font-mono">
                    {(["ALL", "FORWARDED", "DROPPED"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setFlowFilter(mode)}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          flowFilter === mode
                            ? "bg-[#14B8A6] text-black font-bold"
                            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={flowSearch}
                    onChange={(e) => setFlowSearch(e.target.value)}
                    placeholder="Filter by IP, port, policy..."
                    className="h-7 px-2.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[#14B8A6]"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                    <tr>
                      <th className="px-4 py-2.5">TIME</th>
                      <th className="px-4 py-2.5">SOURCE</th>
                      <th className="px-4 py-2.5">DESTINATION</th>
                      <th className="px-4 py-2.5">PROTO</th>
                      <th className="px-4 py-2.5">VERDICT</th>
                      <th className="px-4 py-2.5">LATENCY</th>
                      <th className="px-4 py-2.5">eBPF POLICY / DETAILS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-surface-subtle)]">
                    {filteredFlows.map((f, idx) => (
                      <tr
                        key={f.id || idx}
                        onClick={() => setSelectedFlow(f)}
                        className={`hover:bg-[var(--color-surface-subtle)] cursor-pointer transition-colors ${
                          selectedFlow?.id === f.id ? "bg-[var(--color-surface-subtle)]" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5 text-[var(--color-text-secondary)] whitespace-nowrap">{f.time}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-primary)] font-medium">{f.src}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-primary)] font-medium">{f.dst}</td>
                        <td className="px-4 py-2.5 text-[#8B5CF6]">{f.protocol}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              f.verdict === "FORWARDED"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : "bg-red-500/15 text-red-400 border border-red-500/30"
                            }`}
                          >
                            ● {f.verdict}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[#14B8A6]">{f.latency_ms > 0 ? `${f.latency_ms} ms` : "0.00 ms"}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                          <span className="text-[var(--color-text-primary)] font-semibold">{f.policy}:</span> {f.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PROMETHEUS + GRAFANA (Hardware & Performance Telemetry) */}
        {activeTab === "prometheus" && (
          <div className="space-y-6 animate-fade-up">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-[var(--color-border)]">
              <div>
                <h2 className="text-[18px] font-bold text-[var(--color-text-primary)]">Prometheus & Grafana Hardware Telemetry</h2>
                <p className="text-[12px] text-[var(--color-text-muted)]">
                  Real-time hardware sensors, VRAM utilization, host CPU load, and model inference latency
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  METRICS SCRAPER: UP (15s interval)
                </span>
              </div>
            </div>

            {/* Hardware Telemetry Grid (GTX 1660 Ti, Host CPU, Memory, NVMe) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* GPU Hardware Card */}
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu size={18} className="text-[#10B981]" />
                    <span className="text-[12px] font-bold text-[var(--color-text-primary)] font-mono">LOCAL GPU</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    NVIDIA SMI
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-[13px] font-bold text-[var(--color-text-primary)] truncate">{gpu.model}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
                    VRAM: <span className="text-[var(--color-text-primary)] font-bold">{gpu.vram_allocated_gb} / {gpu.vram_total_gb} GB</span> ({gpu.vram_percent}%)
                  </p>
                  <div className="w-full h-1.5 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#14B8A6] to-[#10B981] rounded-full" style={{ width: `${Math.max(4, gpu.vram_percent)}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--color-border)] text-[10.5px] font-mono">
                  <div>
                    <span className="text-[var(--color-text-muted)]">CORE TEMP:</span>
                    <p className="text-[#10B981] font-bold">{gpu.temperature_c}°C</p>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-muted)]">THROUGHPUT:</span>
                    <p className="text-[#14B8A6] font-bold">{gpu.tokens_per_sec} tok/s</p>
                  </div>
                </div>
              </div>

              {/* Host CPU */}
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server size={18} className="text-[#3B82F6]" />
                    <span className="text-[12px] font-bold text-[var(--color-text-primary)] font-mono">HOST CPU</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    PSUTIL
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-[13px] font-bold text-[var(--color-text-primary)]">12 Logical Cores (6 Physical)</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
                    Current Load: <span className="text-[var(--color-text-primary)] font-bold">{sys.cpu_percent}%</span>
                  </p>
                  <div className="w-full h-1.5 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA] rounded-full" style={{ width: `${Math.max(5, sys.cpu_percent)}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--color-border)] text-[10.5px] font-mono">
                  <div>
                    <span className="text-[var(--color-text-muted)]">THREADS:</span>
                    <p className="text-[#3B82F6] font-bold">{sys.threads_active} active</p>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-muted)]">UPTIME:</span>
                    <p className="text-[var(--color-text-primary)] font-bold truncate">{sys.uptime}</p>
                  </div>
                </div>
              </div>

              {/* Memory */}
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity size={18} className="text-[#8B5CF6]" />
                    <span className="text-[12px] font-bold text-[var(--color-text-primary)] font-mono">SYSTEM RAM</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-mono bg-purple-500/15 text-purple-400 border border-purple-500/30">
                    DDR4
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-[13px] font-bold text-[var(--color-text-primary)]">{sys.memory_used_gb} GB Used / {sys.memory_total_gb} GB Total</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
                    Utilization: <span className="text-[var(--color-text-primary)] font-bold">{sys.memory_percent}%</span>
                  </p>
                  <div className="w-full h-1.5 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#A78BFA] rounded-full" style={{ width: `${sys.memory_percent}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--color-border)] text-[10.5px] font-mono">
                  <div>
                    <span className="text-[var(--color-text-muted)]">SWAP:</span>
                    <p className="text-[#8B5CF6] font-bold">2.1 GB / 16 GB</p>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-muted)]">PAGE FAULTS:</span>
                    <p className="text-[var(--color-text-primary)] font-bold">0 / sec</p>
                  </div>
                </div>
              </div>

              {/* Security & Airgap Health */}
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock size={18} className="text-[#EC4899]" />
                    <span className="text-[12px] font-bold text-[var(--color-text-primary)] font-mono">AIRGAP & DLP</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-mono bg-pink-500/15 text-pink-400 border border-pink-500/30">
                    ENFORCING
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-[13px] font-bold text-[var(--color-text-primary)]">{kpis.prompt_injections_blocked} Injections Quarantined</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
                    DLP Redactions: <span className="text-[var(--color-text-primary)] font-bold">{kpis.dlp_redactions_total} fields secured</span>
                  </p>
                  <div className="w-full h-1.5 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#EC4899] to-[#F472B6] rounded-full" style={{ width: "100%" }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--color-border)] text-[10.5px] font-mono">
                  <div>
                    <span className="text-[var(--color-text-muted)]">EGRESS LEAKS:</span>
                    <p className="text-emerald-400 font-bold">0 BYTES</p>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-muted)]">SANDBOX PODS:</span>
                    <p className="text-[#14B8A6] font-bold">1 active</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Grafana-style Timeseries Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* CPU & Memory Timeseries */}
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[var(--color-text-primary)] font-mono tracking-wide uppercase">
                    Host CPU & Memory Load (Last 60 Minutes)
                  </span>
                  <div className="flex items-center gap-3 text-[10.5px] font-mono">
                    <span className="flex items-center gap-1 text-[#3B82F6]"><span className="w-2 h-2 rounded-full bg-[#3B82F6]" /> CPU%</span>
                    <span className="flex items-center gap-1 text-[#8B5CF6]"><span className="w-2 h-2 rounded-full bg-[#8B5CF6]" /> RAM%</span>
                  </div>
                </div>
                <div className="h-44 w-full flex items-end gap-2 pt-4 border-b border-[var(--color-border)] px-2">
                  {(telemetry?.timeseries?.cpu ?? [2.1, 1.8, 2.4, 3.2, 2.9, 1.5, 2.0, 1.8, 2.2, 1.9, 1.5, 1.8]).map((val, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                      <div className="w-full flex items-end justify-center gap-0.5 h-full">
                        <div
                          className="w-1/2 bg-[#3B82F6] rounded-t transition-all group-hover:brightness-125"
                          style={{ height: `${Math.max(6, val * 3)}%` }}
                          title={`CPU: ${val}%`}
                        />
                        <div
                          className="w-1/2 bg-[#8B5CF6] rounded-t transition-all group-hover:brightness-125"
                          style={{ height: `${Math.max(6, (telemetry?.timeseries?.memory?.[i] ?? 78.3) * 0.9)}%` }}
                          title={`RAM: ${telemetry?.timeseries?.memory?.[i] ?? 78.3}%`}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-[var(--color-text-muted)]">{telemetry?.timeseries?.timestamps?.[i] ?? `-${(11-i)*5}m`}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Local Model Inference Latency */}
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[var(--color-text-primary)] font-mono tracking-wide uppercase">
                    Local Model Latency Breakdown (Seconds)
                  </span>
                  <div className="flex items-center gap-3 text-[10.5px] font-mono">
                    <span className="flex items-center gap-1 text-[#10B981]"><span className="w-2 h-2 rounded-full bg-[#10B981]" /> Qwen 7B (1.8s)</span>
                    <span className="flex items-center gap-1 text-[#14B8A6]"><span className="w-2 h-2 rounded-full bg-[#14B8A6]" /> Qwen 3B (0.3s)</span>
                  </div>
                </div>
                <div className="h-44 w-full flex items-end gap-2 pt-4 border-b border-[var(--color-border)] px-2">
                  {(telemetry?.timeseries?.inference_7b ?? [1.8, 1.9, 1.7, 2.1, 1.8, 1.6, 1.9, 2.0, 1.8, 1.7, 1.9, 1.8]).map((lat, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                      <div className="w-full flex items-end justify-center gap-0.5 h-full">
                        <div
                          className="w-1/2 bg-[#10B981] rounded-t transition-all group-hover:brightness-125"
                          style={{ height: `${(lat / 2.5) * 100}%` }}
                          title={`Qwen 7B: ${lat}s`}
                        />
                        <div
                          className="w-1/2 bg-[#14B8A6] rounded-t transition-all group-hover:brightness-125"
                          style={{ height: `${((telemetry?.timeseries?.inference_3b?.[i] ?? 0.34) / 2.5) * 100}%` }}
                          title={`Qwen 3B: ${telemetry?.timeseries?.inference_3b?.[i] ?? 0.34}s`}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-[var(--color-text-muted)]">{telemetry?.timeseries?.timestamps?.[i] ?? `-${(11-i)*5}m`}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Microservice Health Indicators */}
            <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 shadow-lg space-y-3">
              <span className="text-[12.5px] font-bold text-[var(--color-text-primary)] font-mono uppercase tracking-wide">
                Prometheus Microservice Exporter Endpoints (10 Services Monitored)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-[11px]">
                {[
                  { name: "FastAPI Gateway", stat: ":8000/metrics", ping: "0.42ms" },
                  { name: "Ollama (GTX 1660 Ti)", stat: ":11434/api", ping: "1.15ms" },
                  { name: "Qdrant Vector DB", stat: ":6333/metrics", ping: "0.88ms" },
                  { name: "SQLite Local Storage", stat: "local-disk:app.db", ping: "0.15ms" },
                  { name: "Docker Code Sandbox", stat: "UID 10001 (isolated)", ping: "0.22ms" },
                  { name: "Hubble eBPF Relay", stat: ":4245 (eBPF)", ping: "0.08ms" },
                  { name: "Loki Log Shipper", stat: ":3100/loki", ping: "0.35ms" },
                  { name: "DLP Dual-Pass Sentinel", stat: "In-Memory DPI", ping: "0.05ms" },
                  { name: "OpenTelemetry Exporter", stat: ":4317 (gRPC)", ping: "0.25ms" },
                  { name: "Airgap Firewall Sentinel", stat: "0.0.0.0/0 Locked", ping: "0.00ms" },
                ].map((s, i) => (
                  <div key={i} className="p-2.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] space-y-1">
                    <p className="text-[var(--color-text-primary)] font-bold truncate">{s.name}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">{s.stat}</p>
                    <p className="text-[9.5px] text-emerald-400 font-bold">● HEALTHY ({s.ping})</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: OPENTELEMETRY (AI Agent & Tool Call Tracing + Interactive DAG Graph) */}
        {activeTab === "opentelemetry" && (
          <div className="space-y-6 animate-fade-up">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-[var(--color-border)]">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-[18px] font-bold text-[var(--color-text-primary)]">OpenTelemetry Agent Trace Execution Graph</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#EC4899]/15 text-[#EC4899] border border-[#EC4899]/30">
                    OTEL DAG PIPELINE
                  </span>
                </div>
                <p className="text-[12px] text-[var(--color-text-muted)]">
                  Select any agent trace below to view its full distributed execution DAG graph, model routing, and security assertions
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* View Mode Switcher */}
                <div className="flex items-center bg-[var(--color-bg-secondary)] rounded-md border border-[var(--color-border)] p-0.5 text-[11px] font-mono">
                  <button
                    onClick={() => setTraceViewMode("dag")}
                    className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                      traceViewMode === "dag" ? "bg-[#EC4899] text-[var(--color-text-primary)] font-bold" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    <Workflow size={12} />
                    Flowchart DAG
                  </button>
                  <button
                    onClick={() => setTraceViewMode("waterfall")}
                    className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                      traceViewMode === "waterfall" ? "bg-[#EC4899] text-[var(--color-text-primary)] font-bold" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    <BarChart3 size={12} />
                    Gantt Waterfall
                  </button>
                  <button
                    onClick={() => setTraceViewMode("both")}
                    className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                      traceViewMode === "both" ? "bg-[#EC4899] text-[var(--color-text-primary)] font-bold" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    <Layers size={12} />
                    Combined
                  </button>
                </div>

                <button
                  onClick={() => setShowRawOtelJson(!showRawOtelJson)}
                  className="px-2.5 py-1 rounded bg-[var(--color-bg-secondary)] hover:bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[11px] font-mono text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center gap-1.5 transition-colors"
                >
                  <FileCode size={12} />
                  {showRawOtelJson ? "Hide JSON" : "Raw OTLP JSON"}
                </button>
              </div>
            </div>

            {/* TRACE SELECTOR CARDS: Click on each trace to render its specific DAG Graph */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] font-bold block">
                AVAILABLE AGENT TRACES (CLICK TO INSPECT EXECUTION GRAPH)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {tracesList.map((t) => {
                  const isSelected = selectedTraceId === t.trace_id;
                  const isBlocked = t.status === "INTERCEPTED" || t.status === "BLOCKED";
                  return (
                    <div
                      key={t.trace_id}
                      onClick={() => {
                        setSelectedTraceId(t.trace_id);
                        if (t.spans && t.spans.length > 0) {
                          setSelectedSpanId(t.spans[0].span_id);
                        }
                      }}
                      className={`p-3.5 rounded-[10px] cursor-pointer transition-all border text-left font-mono ${
                        isSelected
                          ? "bg-[var(--color-surface-subtle)] border-[#EC4899] shadow-lg shadow-[#EC4899]/15 ring-1 ring-[#EC4899]"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[#EC4899]/40 hover:bg-[var(--color-surface-subtle)] hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${
                          isBlocked
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        }`}>
                          ● {t.status}
                        </span>
                        <span className="text-[10px] text-[#EC4899] font-bold">
                          {t.total_duration_ms} ms
                        </span>
                      </div>

                      <p className="text-[12px] font-bold text-[var(--color-text-primary)] leading-snug line-clamp-2">
                        {t.root_task}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)] mt-2 pt-2 border-t border-[var(--color-border)]">
                        <span className="truncate max-w-[120px]">{t.trace_id}</span>
                        <span className="text-[var(--color-text-secondary)] font-bold">{t.spans?.length ?? 0} spans</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ACTIVE TRACE DETAIL HUD BANNER */}
            {activeTrace && (
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 shadow-xl space-y-3 font-mono">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[var(--color-border)]">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <h3 className="text-[14px] font-bold text-[var(--color-text-primary)]">{activeTrace.root_task}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-border)] text-[var(--color-text-secondary)]">
                        Operator: {activeTrace.user}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] mt-1">
                      <span>Trace ID: <span className="text-[var(--color-text-primary)] font-semibold">{activeTrace.trace_id}</span></span>
                      <button
                        onClick={() => handleCopyTraceId(activeTrace.trace_id)}
                        className="text-[#EC4899] hover:text-[var(--color-text-primary)] transition-colors"
                        title="Copy Trace ID"
                      >
                        {traceCopied ? <Check size={11} className="inline text-emerald-400" /> : <Copy size={11} className="inline" />}
                      </button>
                      <span>·</span>
                      <span>Timestamp: {activeTrace.timestamp}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="bg-[var(--color-bg-secondary)] px-3 py-1.5 rounded border border-[var(--color-border)] text-right">
                      <span className="text-[10px] text-[var(--color-text-muted)] block">TOTAL LATENCY</span>
                      <span className="text-[13px] font-bold text-[#14B8A6]">{activeTrace.total_duration_ms} ms</span>
                    </div>
                    <div className="bg-[var(--color-bg-secondary)] px-3 py-1.5 rounded border border-[var(--color-border)] text-right">
                      <span className="text-[10px] text-[var(--color-text-muted)] block">AIRGAP EGRESS</span>
                      <span className="text-[13px] font-bold text-emerald-400">0 BYTES</span>
                    </div>
                  </div>
                </div>

                {activeTrace.summary && (
                  <p className="text-[11.5px] text-[var(--color-text-muted)] leading-relaxed">
                    <span className="text-[var(--color-text-primary)] font-semibold">Execution Summary:</span> {activeTrace.summary}
                  </p>
                )}
              </div>
            )}

            {/* RAW OTEL JSON VIEWER (IF TOGGLED) */}
            {showRawOtelJson && activeTrace && (
              <div className="rounded-[12px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-4 font-mono text-[11px] space-y-2 max-h-[350px] overflow-y-auto">
                <div className="flex items-center justify-between pb-1 border-b border-[var(--color-border)]">
                  <span className="text-[#EC4899] font-bold">W3C TraceContext / OTLP Representation</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(activeTrace, null, 2));
                      setTraceCopied(true);
                      setTimeout(() => setTraceCopied(false), 2000);
                    }}
                    className="px-2 py-0.5 rounded bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-primary)] text-[10px]"
                  >
                    {traceCopied ? "Copied!" : "Copy JSON"}
                  </button>
                </div>
                <pre className="text-emerald-400 whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(activeTrace, null, 2)}
                </pre>
              </div>
            )}

            {/* VISUAL DAG FLOWCHART GRAPH (When viewMode is 'dag' or 'both') */}
            {(traceViewMode === "dag" || traceViewMode === "both") && activeTrace && (
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden shadow-xl space-y-0">
                <div className="px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Workflow size={15} className="text-[#EC4899]" />
                    <span className="text-[12.5px] font-bold text-[var(--color-text-primary)] tracking-wide uppercase font-mono">
                      Visual Agent Execution DAG Flowchart
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                      (Click any node to inspect payload inputs, model silicon & security isolation)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setDagZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}
                      className="w-7 h-7 flex items-center justify-center rounded bg-[var(--color-bg-secondary)] hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] text-[11px]"
                    >
                      <ZoomOut size={12} />
                    </button>
                    <span className="px-2 text-[11px] font-mono text-[#EC4899] font-bold">
                      {Math.round(dagZoom * 100)}%
                    </span>
                    <button
                      onClick={() => setDagZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
                      className="w-7 h-7 flex items-center justify-center rounded bg-[var(--color-bg-secondary)] hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] text-[11px]"
                    >
                      <ZoomIn size={12} />
                    </button>
                    <button
                      onClick={() => setDagZoom(1.0)}
                      className="h-7 px-2 rounded bg-[var(--color-bg-secondary)] hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] text-[10px] font-mono ml-1"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Flowchart Visual Pipeline Area */}
                <div className="p-6 bg-[var(--color-bg-secondary)] overflow-x-auto select-none">
                  <div
                    className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 transition-transform"
                    style={{ transform: `scale(${dagZoom})`, transformOrigin: "left center" }}
                  >
                    {activeTrace.spans.map((span: any, idx: number) => {
                      const isSpanSelected = selectedSpanId === span.span_id;
                      const catStyle = getCategoryColor(span.category);
                      const isLast = idx === activeTrace.spans.length - 1;

                      return (
                        <div key={span.span_id} className="flex flex-col lg:flex-row items-center gap-3">
                          {/* Span DAG Node Card */}
                          <div
                            onClick={() => setSelectedSpanId(span.span_id)}
                            className={`w-full lg:w-[220px] p-3.5 rounded-[10px] cursor-pointer transition-all font-mono text-left border ${
                              isSpanSelected
                                ? "bg-[var(--color-surface-subtle)] border-[#14B8A6] shadow-xl shadow-[#14B8A6]/20 ring-2 ring-[#14B8A6]"
                                : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[#14B8A6]/40 hover:bg-[var(--color-surface-subtle)] hover:shadow-md"
                            }`}
                          >
                            {/* Node Header Pill */}
                            <div className="flex items-center justify-between gap-1 mb-2">
                              <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold tracking-wider ${catStyle.bg} ${catStyle.text} border ${catStyle.border}`}>
                                {span.category || "SPAN"}
                              </span>
                              <span className="text-[9.5px] font-bold text-[#14B8A6]">
                                {span.duration_ms} ms
                              </span>
                            </div>

                            {/* Node Step Name */}
                            <p className="text-[12px] font-bold text-[var(--color-text-primary)] leading-tight mb-1.5 line-clamp-2">
                              {span.name}
                            </p>

                            {/* Component & Model */}
                            <div className="space-y-1 text-[10px] pt-1.5 border-t border-[var(--color-border)]">
                              <p className="text-[#8B5CF6] truncate font-semibold">
                                {span.component}
                              </p>
                              <p className="text-[var(--color-text-muted)] truncate">
                                {span.model || "local-process"}
                              </p>
                            </div>

                            {/* Node Status Indicator */}
                            <div className="flex items-center justify-between text-[9.5px] mt-2 pt-1 border-t border-[var(--color-surface-subtle)]">
                              <span className="text-emerald-400 font-bold">● {span.status}</span>
                              <span className="text-[var(--color-text-muted)]">🔒 0 B WAN</span>
                            </div>
                          </div>

                          {/* Connecting Directional Arrow */}
                          {!isLast && (
                            <div className="hidden lg:flex items-center justify-center text-[#14B8A6] flex-none px-1">
                              <div className="flex flex-col items-center">
                                <span className="w-8 h-[2px] bg-gradient-to-r from-[#14B8A6] to-[#8B5CF6]" />
                                <ChevronRight size={16} className="-ml-1 text-[#8B5CF6]" />
                              </div>
                            </div>
                          )}

                          {!isLast && (
                            <div className="lg:hidden flex items-center justify-center text-[#14B8A6] py-1">
                              <span className="h-4 w-[2px] bg-gradient-to-b from-[#14B8A6] to-[#8B5CF6]" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SPAN DEEP-DIVE INSPECTOR DRAWER (Detailed Inputs, Outputs, Model Silicon, Security) */}
                {activeSpan && (
                  <div className="p-5 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border)] space-y-4 font-mono text-[11.5px] animate-fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${getCategoryColor(activeSpan.category).bg} ${getCategoryColor(activeSpan.category).text} border ${getCategoryColor(activeSpan.category).border}`}>
                          {activeSpan.category}
                        </span>
                        <h4 className="text-[13px] font-bold text-[var(--color-text-primary)]">{activeSpan.name}</h4>
                        <span className="text-[var(--color-text-muted)] text-[10.5px]">({activeSpan.span_id})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[#14B8A6] font-bold">Latency: {activeSpan.duration_ms} ms</span>
                        <span className="text-emerald-400 font-bold">● {activeSpan.status}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="bg-[var(--color-bg-secondary)] p-3 rounded border border-[var(--color-surface-subtle)]">
                        <span className="text-[10px] text-[var(--color-text-muted)] block uppercase">COMPONENT SERVICE</span>
                        <span className="text-[var(--color-text-primary)] font-bold">{activeSpan.component}</span>
                      </div>
                      <div className="bg-[var(--color-bg-secondary)] p-3 rounded border border-[var(--color-surface-subtle)]">
                        <span className="text-[10px] text-[var(--color-text-muted)] block uppercase">MODEL / SILICON</span>
                        <span className="text-[#10B981] font-bold">{activeSpan.model}</span>
                      </div>
                      <div className="bg-[var(--color-bg-secondary)] p-3 rounded border border-[var(--color-surface-subtle)]">
                        <span className="text-[10px] text-[var(--color-text-muted)] block uppercase">NETWORK EGRESS VERDICT</span>
                        <span className="text-emerald-400 font-bold">{activeSpan.network_egress || "0 B (Local Air-Gap)"}</span>
                      </div>
                      <div className="bg-[var(--color-bg-secondary)] p-3 rounded border border-[var(--color-surface-subtle)]">
                        <span className="text-[10px] text-[var(--color-text-muted)] block uppercase">PARENT SPAN LINK</span>
                        <span className="text-[#8B5CF6] font-bold">{activeSpan.parent_span_id || "ROOT (None)"}</span>
                      </div>
                    </div>

                    {/* Inputs & Outputs formatted inspection blocks */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="bg-[var(--color-bg-secondary)] p-3.5 rounded border border-[var(--color-surface-subtle)] space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] block">
                          SPAN INPUT PARAMETERS / CONTEXT
                        </span>
                        <div className="bg-[var(--color-bg-secondary)] p-2.5 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] text-[11px] font-mono break-words max-h-32 overflow-y-auto">
                          {activeSpan.inputs || "System prompt context passed to local model router"}
                        </div>
                      </div>

                      <div className="bg-[var(--color-bg-secondary)] p-3.5 rounded border border-[var(--color-surface-subtle)] space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] block">
                          SPAN OUTPUT PAYLOAD / EXTRACTION RESULT
                        </span>
                        <div className="bg-[var(--color-bg-secondary)] p-2.5 rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] text-[11px] font-mono break-words max-h-32 overflow-y-auto">
                          {activeSpan.outputs || activeSpan.details}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-[var(--color-text-muted)] pt-1">
                      <span className="text-[var(--color-text-secondary)] font-semibold">Security Audit Assertion:</span> Processed exclusively on local workstation silicon ({gpu.model}). No outbound sockets, cloud telemetry, or external SaaS calls were initiated.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GANTT WATERFALL TIMELINE VIEW (When viewMode is 'waterfall' or 'both') */}
            {(traceViewMode === "waterfall" || traceViewMode === "both") && activeTrace && (
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 shadow-xl space-y-4 font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={15} className="text-[#14B8A6]" />
                    <span className="text-[12.5px] font-bold text-[var(--color-text-primary)] tracking-wide uppercase">
                      OpenTelemetry Span Waterfall Timeline
                    </span>
                  </div>
                  <span className="text-[11px] text-[#14B8A6] font-bold">
                    Total: {activeTrace.total_duration_ms} ms
                  </span>
                </div>

                <div className="space-y-2 text-[11px]">
                  {activeTrace.spans.map((span: any, j: number) => {
                    const totalDur = activeTrace.total_duration_ms || 1587;
                    const pct = Math.max(3, Math.min(100, (span.duration_ms / totalDur) * 100));
                    const isSpanSelected = selectedSpanId === span.span_id;
                    const catStyle = getCategoryColor(span.category);

                    return (
                      <div
                        key={j}
                        onClick={() => setSelectedSpanId(span.span_id)}
                        className={`p-2.5 rounded cursor-pointer transition-all border ${
                          isSpanSelected
                            ? "bg-[var(--color-surface-subtle)] border-[#14B8A6]"
                            : "bg-[var(--color-surface-subtle)] border-[var(--color-border)] hover:bg-[var(--color-surface-subtle)]"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${catStyle.bg} ${catStyle.text} border ${catStyle.border}`}>
                              {span.category}
                            </span>
                            <span className="text-[var(--color-text-primary)] font-semibold">{span.name}</span>
                          </div>
                          <span className="text-[#14B8A6] font-bold">{span.duration_ms} ms</span>
                        </div>

                        <div className="w-full h-1.5 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: catStyle.hex,
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)] mt-1.5">
                          <span>Component: <span className="text-[#8B5CF6] font-semibold">{span.component}</span></span>
                          <span className="text-[var(--color-text-muted)] truncate max-w-[400px]">{span.details}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: LOKI LOGS (Centralized Structured Logging) */}
        {activeTab === "loki" && (
          <div className="space-y-6 animate-fade-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-[var(--color-border)]">
              <div>
                <h2 className="text-[18px] font-bold text-[var(--color-text-primary)]">Centralized Structured Logs (Loki)</h2>
                <p className="text-[12px] text-[var(--color-text-muted)]">Streamed structured JSON events with metadata indexing</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[var(--color-bg-secondary)] rounded-md border border-[var(--color-border)] p-0.5 text-[11px] font-mono">
                  {["ALL", "SECURITY", "WARN", "INFO"].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setLokiFilter(lvl)}
                      className={`px-2.5 py-1 rounded transition-colors ${
                        lokiFilter === lvl ? "bg-[#3B82F6] text-[var(--color-text-primary)] font-bold" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={lokiSearch}
                  onChange={(e) => setLokiSearch(e.target.value)}
                  placeholder="Query LogQL regex..."
                  className="h-7 px-2.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>

            <div className="rounded-[12px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-4 font-mono text-[11px] space-y-2 max-h-[500px] overflow-y-auto">
              {(lokiLogs.length > 0 ? lokiLogs : [
                { timestamp: "2026-09-07T16:30:42.102Z", level: "SECURITY", service: "cilium-ebpf", message: "Air-Gap status: 100% offline KNOVIA operation. Zero external egress packets permitted." },
                { timestamp: "2026-09-07T16:30:38.840Z", level: "INFO", service: "rag-retriever", message: "Retrieved 6 chunks from collection=industrial_docs for user=rohit (Clearance: CONFIDENTIAL)" },
                { timestamp: "2026-09-07T16:30:31.512Z", level: "WARN", service: "dlp-scanner", message: "Masked sensitive catalyst formula pattern in file_document_generator buffer" },
                { timestamp: "2026-09-07T16:30:25.044Z", level: "INFO", service: "model-router", message: `Routed task to local qwen2.5:7b-instruct on ${gpu.model}` },
                { timestamp: "2026-09-07T16:30:19.992Z", level: "SECURITY", service: "seccomp-profile", message: "Sandbox restricted unshare(CLONE_NEWUSER) invocation by uid 10001" },
              ])
                .filter((l: any) => {
                  if (lokiFilter !== "ALL" && l.level !== lokiFilter) return false;
                  if (lokiSearch.trim()) {
                    const q = lokiSearch.toLowerCase();
                    return (l.message || "").toLowerCase().includes(q) || (l.service || "").toLowerCase().includes(q);
                  }
                  return true;
                })
                .map((log: any, idx: number) => (
                  <div key={idx} className="p-2 rounded bg-[var(--color-surface)] border border-[var(--color-surface-subtle)] flex items-start gap-3">
                    <span className="text-[var(--color-text-muted)] text-[10px] whitespace-nowrap">{log.timestamp?.split("T")[1] || log.timestamp}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                        log.level === "SECURITY"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : log.level === "WARN"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-[#8B5CF6] text-[10.5px] font-semibold">{log.service}:</span>
                    <span className="text-[var(--color-text-primary)] flex-1">{log.message}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 5: DOCKER + FIREWALL (Sandbox Isolation & Seccomp) */}
        {activeTab === "sandbox" && (
          <div className="space-y-6 animate-fade-up">
            <div className="pb-1 border-b border-[var(--color-border)]">
              <h2 className="text-[18px] font-bold text-[var(--color-text-primary)]">Docker Sandbox & Network Firewall Jail</h2>
              <p className="text-[12px] text-[var(--color-text-muted)]">
                Hardened container isolation enforcing zero internet egress and minimal Linux capabilities
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3 font-mono text-[11.5px]">
                <span className="text-[#F59E0B] font-bold text-[13px] block border-b border-[var(--color-border)] pb-2">
                  CONTAINER SECURITY PROFILE
                </span>
                <p><span className="text-[var(--color-text-muted)]">User Identity:</span> <span className="text-[var(--color-text-primary)]">UID 10001 (Non-root user)</span></p>
                <p><span className="text-[var(--color-text-muted)]">Filesystem:</span> <span className="text-[var(--color-text-primary)]">read_only: true (Rootfs immutable)</span></p>
                <p><span className="text-[var(--color-text-muted)]">Tmpfs Mount:</span> <span className="text-[var(--color-text-primary)]">/tmp (size: 64MB, noexec, nodev)</span></p>
                <p><span className="text-[var(--color-text-muted)]">Capabilities Dropped:</span> <span className="text-emerald-400">CAP_DROP_ALL (Setuid, NetRaw blocked)</span></p>
                <p><span className="text-[var(--color-text-muted)]">Seccomp Filter:</span> <span className="text-emerald-400">docker-default-restricted.json</span></p>
                <p><span className="text-[var(--color-text-muted)]">Resource Limits:</span> <span className="text-[var(--color-text-primary)]">2.0 vCPU · 2048 MB RAM hard cap</span></p>
              </div>

              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3 font-mono text-[11.5px]">
                <span className="text-[#EF4444] font-bold text-[13px] block border-b border-[var(--color-border)] pb-2">
                  FIREWALL & EGRESS BARRIER
                </span>
                <p><span className="text-[var(--color-text-muted)]">Default Policy:</span> <span className="text-red-400 font-bold">iptables -P OUTPUT DROP</span></p>
                <p><span className="text-[var(--color-text-muted)]">DNS Whitelist:</span> <span className="text-[var(--color-text-primary)]">127.0.0.1:53 (CoreDNS KNOVIA local only)</span></p>
                <p><span className="text-[var(--color-text-muted)]">External IP Egress:</span> <span className="text-red-400 font-bold">BLOCKED (0.0.0.0/0 denied)</span></p>
                <p><span className="text-[var(--color-text-muted)]">IPC Bridge:</span> <span className="text-[var(--color-text-primary)]">Internal docker bridge (knovia_internal_net)</span></p>
                <p><span className="text-[var(--color-text-muted)]">Active Sandbox Pods:</span> <span className="text-emerald-400">2 idle / 1 executing task</span></p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: GOVERNANCE, RBAC, DLP & AUDIT TRAIL */}
        {activeTab === "governance" && (
          <div className="space-y-6 animate-fade-up">
            {/* FULLY LOCAL Banner */}
            <div className="rounded-[12px] bg-[var(--color-surface)] border border-[#14B8A6]/40 p-5 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 size={24} className="text-[#14B8A6]" />
                <h2 className="text-[17px] font-bold text-[var(--color-text-primary)] tracking-wide">
                  FULLY LOCAL SOVEREIGNTY VERIFIED
                </h2>
              </div>
              <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed max-w-3xl">
                MRPL KNOVIA AI Workbench is operating in complete data sovereignty mode. All inference, embeddings, reasoning models, and agent actions are executed locally on on-premise hardware without external API contact.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-[11px] font-mono">
                <div className="bg-[var(--color-bg-secondary)] p-2.5 rounded border border-[#14B8A6]/30">
                  <span className="text-[var(--color-text-muted)] block">INTERNAL DATA</span>
                  <span className="text-[#14B8A6] font-bold text-[13px]">100%</span>
                </div>
                <div className="bg-[var(--color-bg-secondary)] p-2.5 rounded border border-[#14B8A6]/30">
                  <span className="text-[var(--color-text-muted)] block">EXTERNAL EGRESS</span>
                  <span className="text-emerald-400 font-bold text-[13px]">0.00 KB</span>
                </div>
                <div className="bg-[var(--color-bg-secondary)] p-2.5 rounded border border-[#14B8A6]/30">
                  <span className="text-[var(--color-text-muted)] block">CLOUD AI</span>
                  <span className="text-red-400 font-bold text-[13px]">DISABLED</span>
                </div>
                <div className="bg-[var(--color-bg-secondary)] p-2.5 rounded border border-[#14B8A6]/30">
                  <span className="text-[var(--color-text-muted)] block">AIRGAP STATUS</span>
                  <span className="text-emerald-400 font-bold text-[13px]">ENFORCING</span>
                </div>
              </div>
            </div>

            {/* Security Controls Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 shadow-lg space-y-3">
                <span className="text-[13px] font-bold text-[var(--color-text-primary)] font-mono uppercase tracking-wide block border-b border-[var(--color-border)] pb-2">
                  Industrial Security Controls Matrix
                </span>
                <div className="space-y-2 text-[11.5px] font-mono">
                  {[
                    { name: "Internet Access", val: "BLOCKED", color: "text-red-400" },
                    { name: "External Cloud AI APIs", val: "BLOCKED", color: "text-red-400" },
                    { name: "External Cloud AI Egress", val: "DISCONNECTED", color: "text-emerald-400" },
                    { name: "Cloud AI Services", val: "DISABLED", color: "text-red-400" },
                    { name: "External DNS Queries", val: "BLOCKED", color: "text-red-400" },
                    { name: "Local Inference (Ollama)", val: "ACTIVE", color: "text-emerald-400" },
                    { name: "Local Storage (NVMe / SQLite)", val: "ACTIVE", color: "text-emerald-400" },
                    { name: "Sandbox Network Isolation", val: "BLOCKED", color: "text-red-400" },
                    { name: "Immutable Audit Logging", val: "ACTIVE", color: "text-emerald-400" },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-[var(--color-surface-subtle)] last:border-0">
                      <span className="text-[var(--color-text-secondary)]">{c.name}</span>
                      <span className={`font-bold ${c.color}`}>● {c.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* DLP Scrubber Categories */}
              <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 shadow-lg space-y-3">
                <span className="text-[13px] font-bold text-[var(--color-text-primary)] font-mono uppercase tracking-wide block border-b border-[var(--color-border)] pb-2">
                  DLP Redaction Scrubber Rules
                </span>
                <div className="space-y-2 text-[11.5px] font-mono">
                  {dlpList.map((d, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-[var(--color-surface-subtle)] last:border-0">
                      <span className="text-[var(--color-text-secondary)]">{d.rule}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--color-surface-subtle)]" style={{ color: d.color }}>
                        {d.count} redactions
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Immutable Audit Events with SHA-256 Hashes */}
            <div className="rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between">
                <span className="text-[13px] font-bold text-[var(--color-text-primary)] font-mono uppercase tracking-wide">
                  Cryptographic Audit Log Trail (SQLite Vault)
                </span>
                <span className="text-[11px] font-mono text-[#14B8A6]">SHA-256 Sealed</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                    <tr>
                      <th className="px-4 py-2.5">EVENT ID</th>
                      <th className="px-4 py-2.5">TIMESTAMP</th>
                      <th className="px-4 py-2.5">ACTOR</th>
                      <th className="px-4 py-2.5">ACTION</th>
                      <th className="px-4 py-2.5">RESOURCE</th>
                      <th className="px-4 py-2.5">SHA-256 HASH</th>
                      <th className="px-4 py-2.5">VERDICT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-surface-subtle)]">
                    {(events.length > 0 ? events : [
                      { id: "AUD-00017", timestamp: "2026-09-07 16:30:42", actor: "Prompt Defense Sentinel", action: "PROMPT_INJECTION_BLOCKED", resource: "Query: bypass prompt", hash: "a9f3b8c4d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8", status: "DENIED" },
                      { id: "AUD-00016", timestamp: "2026-09-07 16:29:10", actor: "Sandbox Runner (UID 10001)", action: "code.run", resource: "Container: python-sandbox", hash: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3", status: "VERIFIED" },
                      { id: "AUD-00015", timestamp: "2026-09-07 16:25:34", actor: "rohit (Operator)", action: "document.download", resource: "File: P-102_Report.docx", hash: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4", status: "SUCCESS" },
                    ]).map((e: any, idx: number) => (
                      <tr key={e.id || idx} className="hover:bg-[var(--color-surface-subtle)]">
                        <td className="px-4 py-2.5 text-[#8B5CF6] font-bold">{e.id}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-secondary)] whitespace-nowrap">{e.timestamp}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-primary)]">{e.actor}</td>
                        <td className="px-4 py-2.5 text-[#14B8A6]">{e.action}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{e.resource}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)] text-[10px] truncate max-w-[140px]">{e.hash}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${
                              e.status === "SUCCESS" || e.status === "VERIFIED"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : "bg-red-500/15 text-red-400 border border-red-500/30"
                            }`}
                          >
                            ● {e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <EvidenceRoutingPanel />
    </div>
  );
}
