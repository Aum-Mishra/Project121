import { useState, useEffect } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Play,
  FileText,
  Package,
  Check,
  Eye,
  Download,
  Clock,
  Shield,
  Bot,
  User,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Cpu,
  RefreshCw,
  FolderGit2,
  ListTodo,
  CheckSquare,
  Square,
} from "lucide-react";
import { api, Project, Task, Artifact } from "../services/api";

interface ProjectDetailScreenProps {
  project: Project | null;
  onBack: () => void;
  onOpenWorkbench?: () => void;
}

const TABS = [
  "Overview",
  "Files",
  "Tasks",
  "Agent Runs",
  "Knowledge",
  "Artifacts",
  "Approvals",
  "Audit",
] as const;

type TabType = (typeof TABS)[number];

interface ProjectFile {
  name: string;
  type: string;
  size: string;
  classification: string;
  status: string;
  uploaded: string;
}

const FALLBACK_FILES: ProjectFile[] = [
  { name: "P-102_Inspection_Report_2026.pdf", type: "PDF", size: "4.2 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2026-08-28" },
  { name: "P-102_Equipment_Photo.jpg", type: "JPG", size: "8.1 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2026-08-28" },
  { name: "P-102_Measurements.xlsx", type: "XLSX", size: "0.9 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2026-08-28" },
  { name: "Vendor_Inspection_Report_2026.pdf", type: "PDF", size: "6.3 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2026-08-28" },
  { name: "SOP_Pump_Inspection.pdf", type: "PDF", size: "2.1 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2026-03-15" },
  { name: "SOP_Corrosion_Assessment.pdf", type: "PDF", size: "1.8 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2025-11-20" },
  { name: "SOP_Risk_Assessment.pdf", type: "PDF", size: "1.4 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2026-01-10" },
  { name: "P-102_Inspection_Report_2025.pdf", type: "PDF", size: "3.9 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2025-08-14" },
  { name: "P-102_Inspection_Report_2024.pdf", type: "PDF", size: "3.7 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2024-08-22" },
  { name: "SOP_Emergency_Shutdown.pdf", type: "PDF", size: "2.6 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2026-02-01" },
  { name: "SOP_Pressure_Equipment.pdf", type: "PDF", size: "1.9 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2025-12-05" },
  { name: "P-102_Commissioning_Report.pdf", type: "PDF", size: "8.6 MB", classification: "CONFIDENTIAL", status: "INDEXED", uploaded: "2018-06-14" },
];

const FALLBACK_ARTIFACTS = [
  { name: "Approval_Note_P-102_2026.docx", type: "DOCX", size: "0.4 MB", classification: "CONFIDENTIAL", status: "VERIFIED", author: "Inspection Analyst", timeAgo: "09:49 today", id: "ART-EGRITY-NOTE" },
  { name: "Risk_Assessment_P-102.pdf", type: "PDF", size: "0.2 MB", classification: "CONFIDENTIAL", status: "VERIFIED", author: "Inspection Analyst", timeAgo: "09:48 today", id: "f62c0b6d-2957-42a9-9153-5a3b33a60bcb" },
  { name: "Technical_Review_P-102.pdf", type: "PDF", size: "1.1 MB", classification: "CONFIDENTIAL", status: "VERIFIED", author: "Inspection Analyst", timeAgo: "08:50 today", id: "1dbe5a12-9f18-415d-ac66-d1958fb5f823" },
];

const FALLBACK_TASKS = [
  { id: 1, task_id: "TSK-EGRITY-01", title: "Perform high-density ultrasonic thickness NDT scan on pump casing", status: "IN_PROGRESS", priority: 1, asset: "P-102", due_date: "2026-09-10" },
  { id: 2, task_id: "TSK-EGRITY-02", title: "Verify and recalibrate pressure relief valve RV-102 setpoint", status: "TODO", priority: 1, asset: "P-102", due_date: "2026-09-12" },
  { id: 3, task_id: "TSK-EGRITY-03", title: "Implement corrosion inhibitor chemical injection adjustment", status: "TODO", priority: 2, asset: "P-102", due_date: "2026-09-15" },
  { id: 4, task_id: "TSK-EGRITY-04", title: "Draft and sign off technical engineering de-rating waiver", status: "TODO", priority: 1, asset: "P-102", due_date: "2026-09-08" },
];

const AUDIT_ENTRIES = [
  { timestamp: "09:42:03", actor: "Arjun Mehta", action: "Created task", resource: "P-102 Integrity Review", agent: "Inspection Analyst", result: "SUCCESS" },
  { timestamp: "09:42:04", actor: "System", action: "Security classification applied", resource: "Task #1042", agent: "—", result: "SUCCESS" },
  { timestamp: "09:42:05", actor: "Inspection Analyst", action: "Execution plan generated", resource: "Task #1042", agent: "Inspection Analyst", result: "SUCCESS" },
  { timestamp: "09:42:08", actor: "System", action: "OCR executed", resource: "P-102_Inspection_Report_2026.pdf", agent: "Document Processor", result: "SUCCESS" },
  { timestamp: "09:42:13", actor: "System", action: "Vision analysis executed", resource: "P-102_Equipment_Photo.jpg", agent: "Vision Analyzer", result: "SUCCESS" },
  { timestamp: "09:42:17", actor: "System", action: "Knowledge search executed", resource: "Pump Inspection SOP", agent: "RAG", result: "SUCCESS" },
  { timestamp: "09:42:21", actor: "System", action: "Model router decision", resource: "Task #1042", agent: "Model Router", result: "SUCCESS" },
  { timestamp: "09:42:25", actor: "System", action: "Code execution in sandbox", resource: "Risk Calculation Script", agent: "Sandbox", result: "SUCCESS" },
  { timestamp: "09:42:27", actor: "System", action: "Evidence verification", resource: "Task #1042", agent: "Verification Engine", result: "SUCCESS" },
  { timestamp: "09:42:29", actor: "Inspection Analyst", action: "Approval requested", resource: "Task #1042", agent: "Inspection Analyst", result: "PENDING" },
  { timestamp: "09:42:35", actor: "System", action: "Artifact generated", resource: "Approval_Note_P-102_2026.docx", agent: "DOCX Generator", result: "SUCCESS" },
];

const KNOWLEDGE_NORMS = [
  {
    code: "API 570 - Piping Inspection Code",
    section: "Section 7.1: Minimum Structural Thickness & Corrosion Rates",
    relevance: "Governs casing retirement thickness limit (3.0 mm) and corrosion life projection.",
    status: "CRITICAL NORM",
    statusColor: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  },
  {
    code: "ISO 10816-3:2009",
    section: "Mechanical Vibration Evaluation on Non-Rotating Industrial Machinery",
    relevance: "Class C threshold (7.0 mm/s RMS). P-102 measured 7.2 mm/s triggering maintenance alarm.",
    status: "THRESHOLD EXCEEDED",
    statusColor: "text-red-400 border-red-500/30 bg-red-500/10",
  },
  {
    code: "SOP-OPS-001 (Rev 4)",
    section: "CDU-4 Safe Operating Limits & Relief System Setting",
    relevance: "Discharge MAWP specified at 40.0 bar. Pressure trip recalibration mandatory at +2 bar.",
    status: "MANDATORY SOP",
    statusColor: "text-teal-400 border-teal-500/30 bg-teal-500/10",
  },
  {
    code: "NACE SP0198-2016",
    section: "Corrosion Under Wet H2S / Sour Hydrocarbon Conditions",
    relevance: "Specifies corrosion inhibitor dosing and ultrasonic NDT frequency for high-naphthenic crude.",
    status: "ACTIVE STANDARD",
    statusColor: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  },
];

const AGENT_RUNS = [
  {
    runId: "RUN-ANOMALY-P102-01",
    agent: "Inspection Analyst",
    model: "Qwen 2.5 7B (Local)",
    started: "09:42:05",
    duration: "4.8s",
    status: "COMPLETED",
    summary: "Evaluated 3-year ultrasonic thickness degradation (12.8 -> 8.2 -> 3.8 mm) and MAWP overpressure (+2 bar).",
    tools: ["Telemetry Ingestion", "RAG Knowledge Search", "Threshold Comparator"],
  },
  {
    runId: "RUN-CALC-SANDBOX-02",
    agent: "Python Sandbox Engine",
    model: "Python 3.13 Local Sandbox",
    started: "09:42:25",
    duration: "1.2s",
    status: "COMPLETED",
    summary: "Calculated remaining corrosion life (3.8 mm - 3.0 mm min / 2.2 mm/yr = 4.3 months) and risk level.",
    tools: ["Deterministic Code Exec", "KaTeX Equation Verification"],
  },
  {
    runId: "RUN-APPROVAL-DISPATCH-03",
    agent: "Workflow Interlock Agent",
    model: "Sovereign Rule Engine",
    started: "09:42:29",
    duration: "0.6s",
    status: "AWAITING HUMAN APPROVAL",
    summary: "Constructed approval package APR-P102-INTEGRITY-001 with 6 evidence sources & generated Approval Note DOCX.",
    tools: ["DocGen", "Database Interlock", "Security Classifier"],
  },
];

export default function ProjectDetailScreen({
  project,
  onBack,
  onOpenWorkbench,
}: ProjectDetailScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>("Overview");
  const [liveTasks, setLiveTasks] = useState<any[]>([]);
  const [liveArtifacts, setLiveArtifacts] = useState<any[]>([]);
  const [liveDocs, setLiveDocs] = useState<any[]>([]);
  const [liveApprovals, setLiveApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const p = project || {
    id: 1,
    project_id: "PRJ-P102-INTEGRITY",
    name: "P-102 Equipment Integrity Review",
    unit: "CDU-4",
    asset: "P-102",
    status: "AWAITING APPROVAL",
    risk: "HIGH",
    progress: 36,
    classification: "CONFIDENTIAL",
    description:
      "Comprehensive integrity assessment of centrifugal process pump P-102 at CDU-4, including pressure analysis, corrosion assessment and vibration review.",
  };

  const isHigh = (p.risk || "HIGH").toUpperCase() === "HIGH";

  useEffect(() => {
    const projIdNum = typeof p.id === "number" ? p.id : 1;
    Promise.allSettled([
      api.tasks.list({ project_id: projIdNum }),
      api.artifacts.list({ project_id: projIdNum }),
      api.documents.list({ limit: 20 }),
      api.approvals.list({ limit: 10 }),
    ]).then(([tasksRes, artifactsRes, docsRes, approvalsRes]) => {
      if (tasksRes.status === "fulfilled" && tasksRes.value?.tasks?.length) {
        setLiveTasks(tasksRes.value.tasks);
      }
      if (artifactsRes.status === "fulfilled" && artifactsRes.value?.artifacts?.length) {
        setLiveArtifacts(artifactsRes.value.artifacts);
      }
      if (docsRes.status === "fulfilled" && docsRes.value?.documents?.length) {
        setLiveDocs(docsRes.value.documents);
      }
      if (approvalsRes.status === "fulfilled" && approvalsRes.value?.approvals?.length) {
        setLiveApprovals(approvalsRes.value.approvals);
      }
      setLoading(false);
    });
  }, [p.id]);

  const displayTasks = liveTasks.length > 0 ? liveTasks : FALLBACK_TASKS;
  const displayArtifacts = liveArtifacts.length > 0 ? liveArtifacts : FALLBACK_ARTIFACTS;
  const displayFiles = liveDocs.length > 0
    ? liveDocs.map((d: any) => ({
        name: d.file_name,
        type: (d.file_type || "PDF").toUpperCase(),
        size: d.file_size ? `${(d.file_size / 1024 / 1024).toFixed(1)} MB` : "2.4 MB",
        classification: d.classification || "CONFIDENTIAL",
        status: d.status || "INDEXED",
        uploaded: d.uploaded_at ? String(d.uploaded_at).slice(0, 10) : "2026-08-28",
      }))
    : FALLBACK_FILES;

  return (
    <div className="h-full overflow-y-auto bg-[#070D18]">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center gap-2 text-[11px] text-[#64748B]">
          <button
            onClick={onBack}
            className="flex items-center gap-1 hover:text-[#94A3B8] transition-colors"
          >
            <ArrowLeft size={12} />
            <span>Projects</span>
          </button>
          <ChevronRight size={10} />
          <span className="text-[#94A3B8] font-medium">{p.name}</span>
        </div>

        {/* Top Header Card */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            {/* Badges Row */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${
                  isHigh
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                }`}
              >
                {p.risk || "HIGH"}
              </span>

              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25">
                {p.classification || "CONFIDENTIAL"}
              </span>

              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                {p.status || "AWAITING APPROVAL"}
              </span>
            </div>

            <h1 className="text-[22px] font-bold text-white tracking-tight">
              {p.name}
            </h1>
            <p className="text-[12px] text-[#64748B] mt-1 font-medium">
              Jamnagar Refinery Complex · {p.unit || "CDU-4"} · Asset: {p.asset || "P-102"}
            </p>
          </div>

          {/* Action Buttons on Right */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenWorkbench || onBack}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-[#141E2F] hover:bg-[#1C2B42] border border-[#253248] text-white text-[12px] font-medium transition-colors cursor-pointer"
            >
              Open in Workbench
            </button>
            <button
              onClick={() => setActiveTab("Tasks")}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-[#0D9488] hover:bg-[#0F766E] text-white text-[12px] font-semibold transition-colors shadow-sm cursor-pointer"
            >
              <Play size={12} fill="white" />
              <span>Remediation Tasks ({displayTasks.length})</span>
            </button>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="rounded-[10px] bg-[#0E1726] border border-[#1E2E44] p-4">
          <div className="flex items-center justify-between text-[11px] mb-2">
            <span className="text-[#8C9BAE] font-medium">Overall Progress</span>
            <span className="font-mono font-bold text-amber-400">{p.progress ?? 36}%</span>
          </div>
          <div className="w-full h-[6px] bg-[#162233] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
              style={{ width: `${p.progress ?? 36}%` }}
            />
          </div>
        </div>

        {/* Horizontal Tabs Navigation */}
        <div className="border-b border-[#1E2E44] flex items-center gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            let countBadge: number | null = null;
            if (tab === "Files") countBadge = displayFiles.length;
            if (tab === "Tasks") countBadge = displayTasks.length;
            if (tab === "Artifacts") countBadge = displayArtifacts.length;
            if (tab === "Approvals") countBadge = liveApprovals.length || 1;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-[12px] font-medium transition-all relative whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? "text-[#14B8A6] font-semibold"
                    : "text-[#64748B] hover:text-[#94A3B8]"
                }`}
              >
                <span>{tab}</span>
                {countBadge !== null && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive
                        ? "bg-teal-500/20 text-teal-300"
                        : "bg-[#162338] text-[#8C9BAE]"
                    }`}
                  >
                    {countBadge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#14B8A6] rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        {/* TAB CONTENTS */}
        {/* 1. OVERVIEW TAB */}
        {activeTab === "Overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 Cols: Project Summary */}
            <div className="lg:col-span-2 rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-5 space-y-5">
              <h2 className="text-[11px] font-mono uppercase tracking-wider text-[#64748B]">
                PROJECT SUMMARY
              </h2>

              <div className="grid grid-cols-2 gap-4 text-[12px]">
                <div>
                  <p className="text-[10.5px] text-[#64748B]">Company</p>
                  <p className="text-white font-medium mt-0.5">ApexPetro Energy Limited</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-[#64748B]">Facility</p>
                  <p className="text-white font-medium mt-0.5">Jamnagar Refinery Complex</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-[#64748B]">Unit</p>
                  <p className="text-white font-medium mt-0.5">{p.unit || "CDU-4"}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-[#64748B]">Asset</p>
                  <p className="text-white font-medium mt-0.5">{p.asset || "P-102"}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-[#64748B]">Classification</p>
                  <p className="text-white font-medium mt-0.5">{p.classification || "CONFIDENTIAL"}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-[#64748B]">Risk Level</p>
                  <p className="text-white font-medium mt-0.5">{p.risk || "HIGH"}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-[#64748B]">Database ID</p>
                  <p className="text-white font-medium mt-0.5 font-mono">{p.project_id}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-[#64748B]">Last Activity</p>
                  <p className="text-white font-medium mt-0.5 font-mono">09:49 today</p>
                </div>
              </div>

              <div className="pt-4 border-t border-[#1A283C]">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#64748B] mb-1.5">
                  DESCRIPTION & ANOMALY JUSTIFICATION
                </h3>
                <p className="text-[12.5px] text-[#94A3B8] leading-relaxed">
                  {p.description ||
                    "Comprehensive integrity assessment of centrifugal process pump P-102 at CDU-4, including pressure analysis, corrosion assessment and vibration review."}
                </p>
              </div>
            </div>

            {/* Right Column: Stats & Agents Used */}
            <div className="space-y-4">
              {/* Stats Box */}
              <div className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-5">
                <h2 className="text-[11px] font-mono uppercase tracking-wider text-[#64748B] mb-4">
                  STATS (LIVE REPOSITORY)
                </h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2 text-[#94A3B8]">
                      <FileText size={13} className="text-[#64748B]" />
                      Files
                    </span>
                    <span className="font-mono font-bold text-white">{displayFiles.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2 text-[#94A3B8]">
                      <Check size={13} className="text-[#64748B]" />
                      Tasks
                    </span>
                    <span className="font-mono font-bold text-white">{displayTasks.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2 text-[#94A3B8]">
                      <Bot size={13} className="text-[#64748B]" />
                      Agent Runs
                    </span>
                    <span className="font-mono font-bold text-white">{AGENT_RUNS.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2 text-[#94A3B8]">
                      <Package size={13} className="text-[#64748B]" />
                      Artifacts
                    </span>
                    <span className="font-mono font-bold text-white">{displayArtifacts.length}</span>
                  </div>
                </div>
              </div>

              {/* Agents Used Box */}
              <div className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-5">
                <h2 className="text-[11px] font-mono uppercase tracking-wider text-[#64748B] mb-3">
                  AGENTS DEPLOYED
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#141E2F] border border-[#1E2E44]">
                    <div className="flex items-center gap-2.5">
                      <Bot size={15} className="text-teal-400" />
                      <span className="text-[12px] font-semibold text-white">
                        Inspection Analyst
                      </span>
                    </div>
                    <span className="text-[9.5px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      ● ACTIVE
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#141E2F] border border-[#1E2E44]">
                    <div className="flex items-center gap-2.5">
                      <Cpu size={15} className="text-amber-400" />
                      <span className="text-[12px] font-semibold text-white">
                        Sandbox Python Engine
                      </span>
                    </div>
                    <span className="text-[9.5px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      ● READY
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. FILES TAB */}
        {activeTab === "Files" && (
          <div className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] overflow-hidden">
            <div className="p-4 border-b border-[#1E2E44] flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-white">Refinery Evidence & Engineering Documents</h3>
                <p className="text-[11px] text-[#64748B]">Indexed engineering manuals, telemetry logs, and SOP procedures for {p.unit || "CDU-4"}</p>
              </div>
              <span className="text-[11px] font-mono text-[#14B8A6]">{displayFiles.length} files available</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#1E2E44] bg-[#0A121E] text-[10.5px] font-mono uppercase text-[#64748B]">
                    <th className="px-4 py-3">Document</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Classification</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182335]">
                  {displayFiles.map((file, i) => (
                    <tr key={i} className="hover:bg-[#131E30] transition-colors">
                      <td className="px-4 py-3 text-white font-medium flex items-center gap-2">
                        <FileText size={13} className="text-teal-400 flex-none" />
                        <span className="truncate">{file.name}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[#8C9BAE]">{file.type}</td>
                      <td className="px-4 py-3 font-mono text-[#8C9BAE]">{file.size}</td>
                      <td className="px-4 py-3">
                        <span className="text-[9.5px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25">
                          {file.classification}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[9.5px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/25">
                          ● {file.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[#64748B]">{file.uploaded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. TASKS TAB (LIVE RELATIONAL DATABASE) */}
        {activeTab === "Tasks" && (
          <div className="space-y-4">
            <div className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-4 flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-white">Engineering Remediation & Safety Tasks</h3>
                <p className="text-[11px] text-[#64748B]">Automated corrective action items generated in response to physical telemetry violations</p>
              </div>
              <span className="text-[11px] font-mono text-[#14B8A6]">{displayTasks.length} total tasks</span>
            </div>

            <div className="space-y-2.5">
              {displayTasks.map((t: any, idx: number) => {
                const isDone = t.status === "DONE" || t.status === "COMPLETED";
                const isInProg = t.status === "IN_PROGRESS";
                return (
                  <div
                    key={t.id || idx}
                    className="p-4 rounded-[10px] bg-[#0E1726] border border-[#1E2E44] hover:border-[#2D4263] transition-all flex items-start justify-between gap-4"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="pt-0.5">
                        {isDone ? (
                          <CheckSquare size={16} className="text-emerald-400" />
                        ) : (
                          <Square size={16} className="text-[#64748B]" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-mono font-bold text-[#38BDF8] bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                            {t.task_id}
                          </span>
                          <span className="text-[13px] font-medium text-white">
                            {t.title}
                          </span>
                          <span
                            className={`text-[9.5px] font-mono font-bold px-2 py-0.5 rounded border ${
                              isDone
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : isInProg
                                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                : "bg-slate-500/15 text-slate-300 border-slate-500/30"
                            }`}
                          >
                            ● {t.status}
                          </span>
                          {t.priority && (
                            <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                              Priority: P{t.priority}
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <p className="text-[11.5px] text-[#8C9BAE] leading-relaxed">
                            {t.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-[10.5px] text-[#64748B] pt-1">
                          <span>Asset: {t.asset || p.asset || "P-102"}</span>
                          {t.due_date && <span>Due Date: {String(t.due_date).slice(0, 10)}</span>}
                          <span>Project: {p.project_id}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="flex-none px-3 py-1.5 rounded-lg bg-[#141E2F] hover:bg-[#1C2B42] border border-[#253248] text-[11px] font-medium text-[#94A3B8] transition-colors"
                    >
                      {isDone ? "Reopen" : "Update Status"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. AGENT RUNS TAB */}
        {activeTab === "Agent Runs" && (
          <div className="space-y-4">
            <div className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-4 flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-white">Autonomous Agent Execution History</h3>
                <p className="text-[11px] text-[#64748B]">Deterministic audit trace of multi-agent reasoning, mathematical evaluations, and verification runs</p>
              </div>
              <span className="text-[11px] font-mono text-teal-400">{AGENT_RUNS.length} agent runs recorded</span>
            </div>

            <div className="space-y-3">
              {AGENT_RUNS.map((run, idx) => (
                <div
                  key={idx}
                  className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-4.5 space-y-3 hover:border-[#2D4263] transition-all"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                        <Bot size={15} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-white">{run.agent}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#162338] text-[#94A3B8]">
                            {run.runId}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748B]">Model: {run.model} · Duration: {run.duration}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      ● {run.status}
                    </span>
                  </div>

                  <p className="text-[12px] text-[#CBD5E1] bg-[#0A121E] p-3 rounded-lg border border-[#162233]">
                    {run.summary}
                  </p>

                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                    <span className="text-[#64748B] text-[10.5px]">Tools Invoked:</span>
                    {run.tools.map((tool, ti) => (
                      <span
                        key={ti}
                        className="px-2 py-0.5 rounded bg-[#131E30] text-[#8C9BAE] border border-[#1E2E44] font-mono text-[10px]"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. KNOWLEDGE TAB */}
        {activeTab === "Knowledge" && (
          <div className="space-y-4">
            <div className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-4 flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-white">Engineering Norms & Physical Boundaries</h3>
                <p className="text-[11px] text-[#64748B]">Physical refinery standards, threshold matrix, and safe operating envelope citations</p>
              </div>
              <span className="text-[11px] font-mono text-teal-400">4 Active Norms</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {KNOWLEDGE_NORMS.map((k, idx) => (
                <div
                  key={idx}
                  className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-4.5 space-y-2.5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-[12.5px] font-bold text-white flex items-center gap-1.5">
                        <BookOpen size={14} className="text-[#8B5CF6]" />
                        {k.code}
                      </span>
                      <span className={`text-[9.5px] font-mono font-bold px-2 py-0.5 rounded border ${k.statusColor}`}>
                        {k.status}
                      </span>
                    </div>
                    <p className="text-[11.5px] font-semibold text-[#38BDF8]">{k.section}</p>
                    <p className="text-[12px] text-[#94A3B8] mt-1 leading-relaxed">{k.relevance}</p>
                  </div>
                  <div className="pt-2 border-t border-[#1A283C] flex items-center justify-between text-[11px] text-[#64748B]">
                    <span>Source: ApexPetro Engineering Library</span>
                    <button className="text-teal-400 hover:text-teal-300 font-medium">View Standard →</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. ARTIFACTS TAB (LIVE REPOSITORY) */}
        {activeTab === "Artifacts" && (
          <div className="space-y-3">
            <div className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-4 flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-white">Project Deliverables & Generated Artifacts</h3>
                <p className="text-[11px] text-[#64748B]">Signed approval notes, technical inspection summaries, and risk assessment packages</p>
              </div>
              <span className="text-[11px] font-mono text-teal-400">{displayArtifacts.length} artifacts generated</span>
            </div>

            {displayArtifacts.map((art: any, i: number) => {
              const artId = art.artifact_id || art.id || `ART-${i}`;
              return (
                <div
                  key={artId}
                  className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-4 flex items-center justify-between gap-4 hover:border-[#2D4263] transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#141E2F] border border-[#1E2E44] flex items-center justify-center flex-none">
                      <Package size={16} className="text-teal-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-semibold text-white truncate">
                          {art.name}
                        </p>
                        <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25">
                          {art.classification || "CONFIDENTIAL"}
                        </span>
                        <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                          ● {art.status || "VERIFIED"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        {art.author || "Inspection Analyst"} · {art.timeAgo || "09:49 today"} · {art.size || "0.4 MB"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-none">
                    <button
                      type="button"
                      onClick={() => {
                        window.open(`/api/artifacts/${artId}/preview`, "_blank");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141E2F] hover:bg-[#1C2B42] border border-[#253248] text-[11px] font-medium text-[#94A3B8] transition-colors cursor-pointer"
                    >
                      <Eye size={12} />
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        window.open(`/api/artifacts/${artId}/download`, "_blank");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141E2F] hover:bg-[#1C2B42] border border-[#253248] text-[11px] font-medium text-[#94A3B8] transition-colors cursor-pointer"
                    >
                      <Download size={12} />
                      Download
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 7. APPROVALS TAB */}
        {activeTab === "Approvals" && (
          <div className="space-y-4">
            <div className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-4 flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-white">Human-in-the-Loop Approval Queue</h3>
                <p className="text-[11px] text-[#64748B]">Sovereign engineering decisions requiring authorized mechanical / inspection supervisor sign-off</p>
              </div>
              <span className="text-[11px] font-mono text-amber-400">1 Awaiting Approval</span>
            </div>

            <div className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] p-5 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                      APR-P102-INTEGRITY-001
                    </span>
                    <span className="text-[14px] font-semibold text-white">
                      P-102 Equipment Integrity Review & Operational Waiver Sign-off
                    </span>
                  </div>
                  <p className="text-[12px] text-[#94A3B8] mt-1.5 leading-relaxed">
                    Requested by <strong className="text-white">Inspection Analyst</strong> for asset <strong className="text-white">P-102</strong> (Crude Distillation Unit CDU-4). Authorizes emergency derating to 38 bar and schedules casing NDT scan.
                  </p>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  ● PENDING SUPERVISOR REVIEW
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#141E2F] border border-[#1E2E44] flex items-center justify-between gap-4 text-[11.5px]">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-teal-400" />
                  <span className="text-white font-medium">Approval_Note_P-102_2026.docx</span>
                  <span className="text-[#64748B] font-mono">(0.4 MB · CONFIDENTIAL)</span>
                </div>
                <button
                  type="button"
                  onClick={() => window.open("/api/artifacts/download/ART-P102-NOTE", "_blank")}
                  className="text-teal-400 hover:text-teal-300 font-medium cursor-pointer"
                >
                  Download Note ↓
                </button>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#1A283C]">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-[#1B1726] border border-[#EF4444]/40 text-[#F87171] text-[12px] font-semibold hover:bg-red-500/15 transition-colors cursor-pointer"
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-[#1C2538] border border-[#2A3F60] text-[#94A3B8] text-[12px] font-semibold hover:bg-[#253650] transition-colors cursor-pointer"
                >
                  Request Changes
                </button>
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-[#0D9488] hover:bg-[#0F766E] text-white text-[12px] font-semibold transition-colors shadow-sm cursor-pointer"
                >
                  Approve Waiver
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 8. AUDIT TAB */}
        {activeTab === "Audit" && (
          <div className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] overflow-hidden">
            <div className="p-4 border-b border-[#1E2E44] flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-white">System & Agent Audit Trail</h3>
                <p className="text-[11px] text-[#64748B]">Cryptographically verifiable event log of user actions, model invocations, and tool executions</p>
              </div>
              <span className="text-[11px] font-mono text-teal-400">{AUDIT_ENTRIES.length} events logged</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#1E2E44] bg-[#0A121E] text-[10.5px] font-mono uppercase text-[#64748B]">
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Resource</th>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182335]">
                  {AUDIT_ENTRIES.map((entry, i) => (
                    <tr key={i} className="hover:bg-[#131E30] transition-colors font-mono">
                      <td className="px-4 py-3 text-[#64748B] text-[11px]">{entry.timestamp}</td>
                      <td className="px-4 py-3 text-white font-sans font-medium">{entry.actor}</td>
                      <td className="px-4 py-3 text-[#94A3B8] font-sans">{entry.action}</td>
                      <td className="px-4 py-3 text-white font-sans">{entry.resource}</td>
                      <td className="px-4 py-3 text-[#8C9BAE] font-sans">{entry.agent}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[9.5px] font-bold px-2 py-0.5 rounded border ${
                            entry.result === "SUCCESS"
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          }`}
                        >
                          ● {entry.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
