export interface ModelInfo {
  model_id: string;
  role: string;
  provider: string;
  is_local: boolean;
  capabilities: string[];
  context_length: number;
  vram_usage_gb: number;
  status: string;
  last_checked: string | null;
}

export interface Artifact {
  id: number;
  artifact_id: string;
  project_id: number | null;
  name: string;
  artifact_type: string;
  file_path: string | null;
  status: string;
  classification: string;
  created_by: number;
  version: number;
  parent_artifact_id: string | null;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Approval {
  id: number;
  approval_id: string;
  artifact_id: number | null;
  artifact_uuid?: string | null;
  artifact_name?: string | null;
  artifact_type?: string | null;
  download_url?: string | null;
  requested_by: number;
  requested_by_name?: string | null;
  reviewed_by: number | null;
  reviewed_by_name?: string | null;
  status: string;
  comments: string | null;
  requested_at: string;
  reviewed_at: string | null;
}

export interface SecurityStatusItem {
  label: string;
  status: string;
  status_color: string;
  status_bg: string;
  desc: string;
  indicator: "active" | "blocked" | "disabled";
}

const MODELS: ModelInfo[] = [
  { model_id: "qwen2.5:7b-instruct", role: "reasoning", provider: "Ollama (Local)", is_local: true, capabilities: ["multi-step-reasoning", "iso-norm-verification", "ocr-table-extraction"], context_length: 32768, vram_usage_gb: 5.8, status: "ready", last_checked: "2026-09-07T09:40:00Z" },
  { model_id: "qwen3b", role: "fast_reasoning", provider: "Ollama (Local)", is_local: true, capabilities: ["categorization", "fast-summarization"], context_length: 8192, vram_usage_gb: 2.1, status: "ready", last_checked: "2026-09-07T09:40:00Z" },
  { model_id: "qwen-coder", role: "code_reasoning", provider: "Ollama (Local)", is_local: true, capabilities: ["python-generation", "sandbox-formatting"], context_length: 16384, vram_usage_gb: 3.4, status: "ready", last_checked: "2026-09-07T09:40:00Z" },
  { model_id: "bge-m3:latest", role: "embeddings", provider: "Ollama (Local)", is_local: true, capabilities: ["dense-vectors", "multilingual", "semantic-search"], context_length: 8192, vram_usage_gb: 1.1, status: "ready", last_checked: "2026-09-07T09:40:00Z" },
];

const STATUS_ITEMS: SecurityStatusItem[] = [
  { label: "Zero External Egress", status: "Enforced", status_color: "text-emerald-400", status_bg: "bg-emerald-500/15 border-emerald-500/30", desc: "All outbound packets dropped by kernel barrier", indicator: "blocked" },
  { label: "Prompt Injection Defense", status: "Active", status_color: "text-emerald-400", status_bg: "bg-emerald-500/15 border-emerald-500/30", desc: "1 quarantine blocked this session", indicator: "active" },
  { label: "DLP Redaction Scrubber", status: "Active", status_color: "text-emerald-400", status_bg: "bg-emerald-500/15 border-emerald-500/30", desc: "19 sensitive fields sanitized", indicator: "active" },
  { label: "Sandbox Seccomp Jail", status: "Quarantined", status_color: "text-amber-400", status_bg: "bg-amber-500/15 border-amber-500/30", desc: "4 violations flagged, 1 pod executing", indicator: "active" },
  { label: "Immutable Audit Ledger", status: "Verified", status_color: "text-emerald-400", status_bg: "bg-emerald-500/15 border-emerald-500/30", desc: "SHA-256 hash chain intact", indicator: "active" },
  { label: "Cloud AI APIs", status: "Disabled", status_color: "text-red-400", status_bg: "bg-red-500/15 border-red-500/30", desc: "No external provider access configured", indicator: "disabled" },
];

const AUDIT_EVENTS = [
  { id: "AUD-94812", timestamp: "2026-09-07 16:30:42", actor: "Air-Gap Kernel Sentinel", actor_type: "SYSTEM", action: "AIRGAP_INTEGRITY_VERIFIED", resource: "WAN 0.0.0.0/0 (Egress Boundary)", hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", status: "VERIFIED", risk: "LOW", details: "100% offline air-gap verified. Zero external egress packets transmitted; all inference strictly local." },
  { id: "AUD-94811", timestamp: "2026-09-07 16:30:38", actor: "Arjun Mehta", actor_type: "USER", action: "QUERY_EXECUTE", resource: "P-102 Pump Integrity Review", hash: "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4", status: "SUCCESS", risk: "LOW", details: "Initiated multi-agent diagnostic analysis for refinery pump P-102 vibration anomalies." },
  { id: "AUD-94810", timestamp: "2026-09-07 16:30:35", actor: "Planner Agent", actor_type: "AGENT", action: "AGENT_PLAN_FORMULATION", resource: "Task #1042 / 10-Step Execution", hash: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb", status: "SUCCESS", risk: "LOW", details: "Constructed deterministic DAG routing query to Qdrant vector retrieval and vision OCR." },
  { id: "AUD-94809", timestamp: "2026-09-07 16:30:29", actor: "Qdrant Vector Engine", actor_type: "SYSTEM", action: "CLASSIFIED_CHUNKS_RETRIEVAL", resource: "Collection: industrial_docs (6 chunks)", hash: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a", status: "SUCCESS", risk: "MEDIUM", details: "Retrieved CONFIDENTIAL SOP and baseline vibration data for Jamnagar refinery." },
  { id: "AUD-94808", timestamp: "2026-09-07 16:30:21", actor: "Dual-Pass DLP Sentinel", actor_type: "SYSTEM", action: "SENSITIVE_DATA_REDACT", resource: "file_document_generator buffer", hash: "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d", status: "VERIFIED", risk: "HIGH", details: "Sanitized proprietary refinery chemical catalyst formula pattern before storage." },
  { id: "AUD-94807", timestamp: "2026-09-07 16:30:14", actor: "Document Generator", actor_type: "AGENT", action: "ARTIFACT_IMMUTABLE_COMMIT", resource: "Approval_Note_P-102_2026.docx", hash: "fb8e20fc2e4c3f248c60c39bd652f3c1347298ab97b8b456a531a425e3221f72", status: "SUCCESS", risk: "LOW", details: "Generated official inspection approval document with SHA-256 version stamp." },
];

type HubbleFlow = {
  id: string;
  time: string;
  src: string;
  dst: string;
  protocol: string;
  verdict: "FORWARDED" | "DROPPED";
  latency_ms: number;
  policy: string;
  details: string;
};

const FLOWS: HubbleFlow[] = [
  { id: "flow-101", time: "16:30:12.420", src: "127.0.0.1:8443 (Workbench UI)", dst: "127.0.0.1:8000 (API Gateway)", protocol: "HTTP/2", verdict: "FORWARDED", latency_ms: 0.42, policy: "allow-frontend-to-gateway", details: "GET /api/security/status -> 200 OK" },
  { id: "flow-102", time: "16:30:15.110", src: "127.0.0.1:8000 (API Gateway)", dst: "127.0.0.1:11434 (Local Ollama: GTX 1660 Ti)", protocol: "HTTP/1.1", verdict: "FORWARDED", latency_ms: 1.15, policy: "allow-gateway-to-ollama", details: "POST /api/generate (qwen2.5:7b)" },
  { id: "flow-103", time: "16:30:18.050", src: "127.0.0.1:8000 (API Gateway)", dst: "127.0.0.1:6333 (Local Vector DB)", protocol: "gRPC", verdict: "FORWARDED", latency_ms: 0.88, policy: "allow-gateway-to-qdrant", details: "RPC SearchPoints: embeddings=bge-m3" },
  { id: "flow-104", time: "16:30:21.000", src: "127.0.0.1:8000 (API Gateway)", dst: "local-disk:app.db (SQLite Storage)", protocol: "IPC / File", verdict: "FORWARDED", latency_ms: 0.15, policy: "allow-internal-storage", details: "SELECT * FROM audit_events" },
  { id: "flow-105", time: "16:30:24.000", src: "sandbox-worker (UID 10001)", dst: "local-scratch:workspace", protocol: "IPC / Sandbox", verdict: "FORWARDED", latency_ms: 0.22, policy: "sandbox-confined-execution", details: "Code analysis inside isolated container" },
  { id: "flow-106", time: "16:30:28.150", src: "kernel-airgap (0.0.0.0/0:443)", dst: "WAN Gateway (External Internet)", protocol: "TCP / IP", verdict: "DROPPED", latency_ms: 0.0, policy: "iptables-airgap: default-drop-egress", details: "BLOCKED: Air-Gap enforcement active. Zero outbound internet packets allowed." },
  { id: "flow-107", time: "16:30:32.000", src: "kernel-airgap (0.0.0.0/0:53)", dst: "Public DNS Resolvers", protocol: "UDP / DNS", verdict: "DROPPED", latency_ms: 0.0, policy: "iptables-airgap: drop-external-dns", details: "BLOCKED: Public DNS query dropped; Local loopback resolver only" },
];

const HUBBLE_STATS = {
  total_flows_captured: 4128,
  forwarded_flows: 4128,
  dropped_flows: 0,
  drop_rate_pct: 0,
  ebpf_filter_status: "Active",
  hubble_relay: "CONNECTED (Local eBPF / Workstation Loopback)",
};

const TELEMETRY = {
  system: {
    cpu_percent: 1.5,
    memory_used_gb: 12.36,
    memory_total_gb: 15.79,
    memory_percent: 78.3,
    uptime: "119 days, 2 hours",
    threads_active: 164,
  },
  gpu: {
    model: "NVIDIA GeForce GTX 1660 Ti",
    vram_total_gb: 6.0,
    vram_allocated_gb: 0.0,
    vram_free_gb: 6.0,
    vram_percent: 0.0,
    temperature_c: 42,
    compute_load_percent: 0,
    fan_speed_percent: 0,
    tokens_per_sec: 38.4,
  },
  timeseries: {
    timestamps: ["-55m", "-50m", "-45m", "-40m", "-35m", "-30m", "-25m", "-20m", "-15m", "-10m", "-5m", "now"],
    cpu: [2.1, 1.8, 2.4, 3.2, 2.9, 1.5, 2.0, 1.8, 2.2, 1.9, 1.5, 1.8],
    memory: [78.3, 78.1, 78.5, 78.8, 78.4, 78.2, 78.6, 78.3, 78.7, 78.5, 78.1, 78.3],
    inference_7b: [1.8, 1.9, 1.7, 2.1, 1.8, 1.6, 1.9, 2.0, 1.8, 1.7, 1.9, 1.8],
    inference_3b: [0.34, 0.31, 0.36, 0.33, 0.35, 0.3, 0.34, 0.32, 0.37, 0.33, 0.31, 0.34],
    inference_coder: [0.62, 0.68, 0.65, 0.71, 0.64, 0.6, 0.66, 0.69, 0.63, 0.67, 0.65, 0.62],
    agent_completed: [1, 0, 1, 2, 0, 1, 1, 2, 0, 1, 1, 1],
    agent_failed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  dlp_stats: [
    { rule: "API_SECRET_KEY Scrubber", count: 6, color: "#EF4444" },
    { rule: "Aadhaar Number Scrubber", count: 4, color: "#F59E0B" },
    { rule: "Proprietary Catalyst Formula", count: 3, color: "#8B5CF6" },
    { rule: "Corporate Password Hash", count: 3, color: "#EC4899" },
    { rule: "US SSN Pattern Redaction", count: 2, color: "#3B82F6" },
    { rule: "Private Key Certificate Scrubber", count: 1, color: "#14B8A6" },
  ],
  security_kpis: {
    prompt_injections_blocked: 1,
    unauthorized_access_denied: 0,
    dlp_redactions_total: 19,
    sandbox_violations_quarantined: 4,
  },
};

const TRACES = [
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
      { span_id: "span-03", parent_span_id: "span-02", name: "Model Router Silicon Selection", component: "model-router", category: "ORCHESTRATION", duration_ms: 8, status: "OK", model: "local-router", details: "Allocated tensor cores on local NVIDIA GeForce GTX 1660 Ti (confidence: 99.4%).", network_egress: "0 B (PCIe Direct)", inputs: "Task Complexity: High Reasoning, Target VRAM: <= 5.8 GB", outputs: "Hardware Target: NVIDIA GeForce GTX 1660 Ti, Selected Quant: qwen2.5:7b-instruct-q4_K_M" },
      { span_id: "span-04", parent_span_id: "span-03", name: "Permission-Aware RAG Retrieval", component: "qdrant-vector-rag", category: "MEMORY", duration_ms: 184, status: "OK", model: "bge-m3-embeddings", details: "Dense vector similarity search (top-k=6) on mrpl_knowledge. Clearance: CONFIDENTIAL.", network_egress: "0 B (127.0.0.1:6333 gRPC)", inputs: "Query: 'P-102 historical vibration baseline, impeller clearance specs'", outputs: "Retrieved 6 chunks (ISO 10816-3 Table 1, P-102 Maintenance Record 2025)" },
      { span_id: "span-05", parent_span_id: "span-03", name: "Vision / OCR Tabular Extraction", component: "vision-analyzer", category: "VISION", duration_ms: 612, status: "OK", model: "local-vision-ocr", details: "Extracted operating pressure: 42.0 bar, corrosion depth: 3.8 mm from P-102_Equipment_Photo.jpg.", network_egress: "0 B (Local CUDA)", inputs: "File: P-102_Equipment_Photo.jpg (Resolution: 1920x1080, sha256: 8a4b...)", outputs: "Extracted Key-Values: Pressure=42 bar, Shaft RMS=7.1 mm/s, Corrosion=3.8mm" },
      { span_id: "span-06", parent_span_id: "span-04", name: "Autonomous Code Sandbox Execution", component: "docker-sandbox-runner", category: "SANDBOX", duration_ms: 215, status: "OK", model: "python-sandbox-isolated", details: "Calculated pressure deviation (+2 bar over tolerance). Kernel dropped all egress packets.", network_egress: "0 B (Network: NONE, UID 10001)", inputs: "Python script: calculate_stress_curve(p=42.0, vib=7.1, allowable=4.5)", outputs: "Exit Code: 0, stdout: 'ALLOWABLE_EXCEEDED: Deviation=+57.8%, Category D Zone'" },
      { span_id: "span-07", parent_span_id: "span-06", name: "Norm Verification Engine", component: "verification-agent", category: "COMPLIANCE", duration_ms: 42, status: "OK", model: "qwen2.5:7b-instruct", details: "Audited vs ISO 10816-3 and API 610 vibration norms (Verdict: HIGH SEVERITY / RESTRICTED OPERATION).", network_egress: "0 B (local Ollama)", inputs: "Sandbox Results + ISO 10816-3 Class II / Group 1 norms", outputs: "Compliance Result: NON_COMPLIANT, Action Required: Immediate bearing replacement" },
      { span_id: "span-08", parent_span_id: "span-07", name: "Dual-Pass DLP Sanitization", component: "dlp-sentinel", category: "SECURITY", duration_ms: 14, status: "OK", model: "regex-nlp-dlp", details: "Sanitized context stream: 0 Aadhaar, 0 API credentials, 0 formula leaks detected.", network_egress: "0 B (In-Memory Regex)", inputs: "Raw synthesis payload (3,412 tokens)", outputs: "Sanitization Verdict: CLEAN (0 redactions needed)" },
      { span_id: "span-09", parent_span_id: "span-08", name: "Artifact Document Generation", component: "file-document-generator", category: "ARTIFACT", duration_ms: 465, status: "OK", model: "docx-generator", details: "Compiled Approval_Note_P-102_2026.docx sealed with SHA-256 integrity hash.", network_egress: "0 B (Local Disk FS)", inputs: "Template: ISO_Inspection_Note.dotx, Payload: Verified P-102 Findings", outputs: "Artifact Created: Approval_Note_P-102_2026.docx (SHA-256: 3e8f1b...)" },
    ],
  },
];

const LOKI_LOGS = [
  { timestamp: "2026-09-07T16:30:42.102Z", level: "SECURITY", service: "cilium-ebpf", message: "Air-Gap status: 100% offline sovereign operation. Zero external egress packets permitted." },
  { timestamp: "2026-09-07T16:30:38.840Z", level: "INFO", service: "rag-retriever", message: "Retrieved 6 chunks from collection=industrial_docs for user=rohit (Clearance: CONFIDENTIAL)" },
  { timestamp: "2026-09-07T16:30:31.512Z", level: "WARN", service: "dlp-scanner", message: "Masked sensitive catalyst formula pattern in file_document_generator buffer" },
  { timestamp: "2026-09-07T16:30:25.044Z", level: "INFO", service: "model-router", message: "Routed task to local qwen2.5:7b-instruct on NVIDIA GeForce GTX 1660 Ti" },
  { timestamp: "2026-09-07T16:30:19.992Z", level: "SECURITY", service: "seccomp-profile", message: "Sandbox restricted unshare(CLONE_NEWUSER) invocation by uid 10001" },
];

const SANDBOX_STATUS = {
  status: "RUNNING",
  container: "python-sandbox",
  user_id: 10001,
  rootfs: "read-only",
  cap_drop: "CAP_DROP_ALL",
  seccomp: "docker-default-restricted.json",
  cpus: 2.0,
  mem_limit_mb: 2048,
  pods: { active: 1, idle: 2, quarantined: 4 },
};

const MTLS_STATUS = {
  status: "ENFORCING",
  mode: "STRICT",
  cert_issuer: "MRPL Sovereign Internal CA",
  cert_expiry: "2027-03-14",
  mutual_tls_ports: ["8000", "6333", "11434"],
};

const NETWORK = {
  status: { policy: "default-drop-egress", egress_bytes: 0 },
  policy_manifest: "iptables-airgap: default-drop-egress (WAN 0.0.0.0/0 blocked)",
};

const ARTIFACTS: Artifact[] = [
  { id: 1, artifact_id: "ART-001", project_id: 1, name: "Approval_Note_P-102_2026.docx", artifact_type: "DOCUMENT", file_path: "/artifacts/ART-001.docx", status: "VERIFIED", classification: "CONFIDENTIAL", created_by: 12, version: 1, parent_artifact_id: null, preview_url: "/api/artifacts/ART-001/preview", created_at: "2026-09-07T09:42:00Z", updated_at: "2026-09-07T09:42:00Z" },
  { id: 2, artifact_id: "ART-002", project_id: 1, name: "P-102_Stress_Analysis_v1.docx", artifact_type: "DOCUMENT", file_path: "/artifacts/ART-002.docx", status: "VERIFIED", classification: "CONFIDENTIAL", created_by: 12, version: 1, parent_artifact_id: null, preview_url: "/api/artifacts/ART-002/preview", created_at: "2026-09-07T08:10:00Z", updated_at: "2026-09-07T08:10:00Z" },
  { id: 3, artifact_id: "ART-003", project_id: 1, name: "P-102_Stress_Analysis_v2.docx", artifact_type: "DOCUMENT", file_path: "/artifacts/ART-003.docx", status: "VERIFIED", classification: "CONFIDENTIAL", created_by: 12, version: 2, parent_artifact_id: "ART-002", preview_url: "/api/artifacts/ART-003/preview", created_at: "2026-09-07T09:40:00Z", updated_at: "2026-09-07T09:40:00Z" },
  { id: 4, artifact_id: "ART-004", project_id: 1, name: "Risk_Assessment_P-102.pdf", artifact_type: "REPORT", file_path: "/artifacts/ART-004.pdf", status: "VERIFIED", classification: "RESTRICTED", created_by: 12, version: 1, parent_artifact_id: null, preview_url: "/api/artifacts/ART-004/preview", created_at: "2026-09-07T09:41:00Z", updated_at: "2026-09-07T09:41:00Z" },
  { id: 5, artifact_id: "ART-005", project_id: 2, name: "Vibration_Telemetry_Export.csv", artifact_type: "SPREADSHEET", file_path: "/artifacts/ART-005.csv", status: "VERIFIED", classification: "CONFIDENTIAL", created_by: 12, version: 1, parent_artifact_id: null, preview_url: "/api/artifacts/ART-005/preview", created_at: "2026-09-06T15:20:00Z", updated_at: "2026-09-06T15:20:00Z" },
  { id: 6, artifact_id: "ART-006", project_id: 3, name: "CDU4_Management_Approval_Note.docx", artifact_type: "DOCUMENT", file_path: "/artifacts/ART-006.docx", status: "PENDING_REVIEW", classification: "CONFIDENTIAL", created_by: 12, version: 1, parent_artifact_id: null, preview_url: "/api/artifacts/ART-006/preview", created_at: "2026-09-07T10:05:00Z", updated_at: "2026-09-07T10:05:00Z" },
  { id: 7, artifact_id: "ART-007", project_id: 2, name: "Stress_Simulation_Script.py", artifact_type: "CODE", file_path: "/artifacts/ART-007.py", status: "VERIFIED", classification: "CONFIDENTIAL", created_by: 12, version: 1, parent_artifact_id: null, preview_url: "/api/artifacts/ART-007/preview", created_at: "2026-09-05T12:00:00Z", updated_at: "2026-09-05T12:00:00Z" },
  { id: 8, artifact_id: "ART-008", project_id: 2, name: "Pipeline_Integrity_Presentation.pptx", artifact_type: "PRESENTATION", file_path: "/artifacts/ART-008.pptx", status: "VERIFIED", classification: "INTERNAL", created_by: 12, version: 1, parent_artifact_id: null, preview_url: "/api/artifacts/ART-008/preview", created_at: "2026-09-04T09:30:00Z", updated_at: "2026-09-04T09:30:00Z" },
];

const APPROVALS: Approval[] = [
  { id: 1, approval_id: "APR-1041", artifact_id: 6, artifact_uuid: "ART-006", artifact_name: "CDU4_Management_Approval_Note.docx", artifact_type: "DOCUMENT", download_url: "/api/artifacts/ART-006/download", requested_by: 12, requested_by_name: "Document Agent", reviewed_by: null, reviewed_by_name: null, status: "PENDING_REVIEW", comments: "AI-generated management approval note requires authorized human review before dissemination.", requested_at: "2026-09-07T10:06:00Z", reviewed_at: null },
  { id: 2, approval_id: "APR-1040", artifact_id: 4, artifact_uuid: "ART-004", artifact_name: "Risk_Assessment_P-102.pdf", artifact_type: "REPORT", download_url: "/api/artifacts/ART-004/download", requested_by: 12, requested_by_name: "Engineering Agent", reviewed_by: null, reviewed_by_name: null, status: "PENDING_REVIEW", comments: "Risk assessment flagging HIGH SEVERITY deviation requiring sign-off.", requested_at: "2026-09-07T09:43:00Z", reviewed_at: null },
  { id: 3, approval_id: "APR-1039", artifact_id: 3, artifact_uuid: "ART-003", artifact_name: "P-102_Stress_Analysis_v2.docx", artifact_type: "DOCUMENT", download_url: "/api/artifacts/ART-003/download", requested_by: 12, requested_by_name: "Document Agent", reviewed_by: null, reviewed_by_name: null, status: "PENDING_REVIEW", comments: "Version 2 supersedes v1 after corrected corrosion depth input.", requested_at: "2026-09-07T09:39:00Z", reviewed_at: null },
  { id: 4, approval_id: "APR-1038", artifact_id: 1, artifact_uuid: "ART-001", artifact_name: "Approval_Note_P-102_2026.docx", artifact_type: "DOCUMENT", download_url: "/api/artifacts/ART-001/download", requested_by: 12, requested_by_name: "Document Agent", reviewed_by: 3, reviewed_by_name: "Rohit Sharma", status: "APPROVED", comments: "Verified against ISO 10816-3 — approved.", requested_at: "2026-09-06T16:00:00Z", reviewed_at: "2026-09-06T17:15:00Z" },
  { id: 5, approval_id: "APR-1037", artifact_id: 8, artifact_uuid: "ART-008", artifact_name: "Pipeline_Integrity_Presentation.pptx", artifact_type: "PRESENTATION", download_url: "/api/artifacts/ART-008/download", requested_by: 12, requested_by_name: "Engineering Agent", reviewed_by: 3, reviewed_by_name: "Rohit Sharma", status: "REJECTED", comments: "External share of RESTRICTED data denied.", requested_at: "2026-09-05T18:30:00Z", reviewed_at: "2026-09-06T09:10:00Z" },
];

const ARTIFACT_PREVIEWS: Record<string, string> = {
  "ART-001": "APPROVAL NOTE — P-102 PUMP\n\nApproval requested for maintenance intervention on P-102.\nFindings: Bearing vibration DE 8.2 mm/s exceeds 7.1 mm/s threshold.\nVerdict from ISO 10816-3 audit: NON_COMPLIANT.\nRecommendation: immediate bearing replacement before next run cycle.\n\n-- End of Document --",
  "ART-002": "P-102 STRESS ANALYSIS v1\n\nOperating pressure: 37 bar. Within acceptable limits.\nMonitoring recommended due to upward trend.",
  "ART-003": "P-102 STRESS ANALYSIS v2\n\nOperating pressure: 42.0 bar. Deviation +57.8% over allowable.\nCategory D Zone. Immediate action required.",
  "ART-004": "RISK ASSESSMENT — P-102\n\nSeverity: HIGH\nLikelihood: MEDIUM\nExposure: CONFIDENTIAL\nAction: Restricted operation and bearing replacement.",
  "ART-005": "timestamp,asset,parameter,value,threshold,status\n2026-09-06T15:00:00Z,P-102,vibration_de_mm_s,6.8,7.1,OK\n2026-09-06T15:05:00Z,P-102,vibration_de_mm_s,8.2,7.1,CRITICAL",
  "ART-006": "CDU-4 MANAGEMENT APPROVAL NOTE\n\nAI-generated note prepared for management review.\n2 critical deviations from SOP identified.\nImmediate maintenance action recommended.",
  "ART-007": "# Stress simulation for P-102\nimport numpy as np\n\ndef stress_curve(p, allowable):\n    deviation = (p / allowable - 1) * 100\n    return deviation\n\nprint(stress_curve(42.0, 4.5))",
  "ART-008": "Slide 1 — Pipeline Integrity Presentation\nExecutive summary of P-102 integrity review.\n\nSlide 2 — Findings\nThreshold breach at DE bearing.\n\nSlide 3 — Recommendations\nImmediate maintenance intervention.",
};

const ARTIFACT_DIFF = {
  artifact_a: "ART-002",
  artifact_b: "ART-003",
  lines_added: 5,
  lines_removed: 2,
  unified_diff: "@@ -1,4 +1,6 @@\n P-102 STRESS ANALYSIS\n-Operating pressure: 37 bar. Within acceptable limits.\n-Monitoring recommended due to upward trend.\n+Operating pressure: 42.0 bar. Deviation +57.8% over allowable.\n+Category D Zone. Immediate action required.\n+Source: OCR extraction from P-102_Equipment_Photo.jpg\n+Inputs: vibration 7.1 mm/s, corrosion 3.8 mm",
};

function resolveApproval(id: string, status: "APPROVED" | "REJECTED", comments?: string): Approval {
  const base = APPROVALS.find((a) => a.approval_id === id) ?? APPROVALS[0];
  return {
    ...base,
    status,
    comments: comments && comments.trim() ? comments.trim() : base.comments,
    reviewed_by: 12,
    reviewed_by_name: "Arjun Mehta",
    reviewed_at: "2026-09-07T16:35:00Z",
  };
}

export const api = {
  auth: {
    login: () => Promise.resolve({ token: "demo-token", user_id: 12 }),
    signup: () => Promise.resolve({ token: "demo-token", user_id: 12 }),
    me: () => Promise.resolve({ user_id: 12, full_name: "Arjun Mehta", email: "arjun.mehta@mrpl.com", role: "Reliability Engineer", company_id: "MRPL-JAMNAGAR" }),
  },
  models: {
    list: () => Promise.resolve({ models: MODELS }),
    get: (modelId: string) => Promise.resolve(MODELS.find((m) => m.model_id === modelId) ?? MODELS[0]),
    checkAvailability: () => Promise.resolve({ availability: [] }),
    initialize: () => Promise.resolve({ initialized: MODELS.length, models: MODELS.map((m) => m.model_id) }),
  },
  security: {
    status: () => Promise.resolve({ items: STATUS_ITEMS, overall: "secure" as const }),
    events: (limit = 50) => Promise.resolve(AUDIT_EVENTS.slice(0, limit)),
    network: () => Promise.resolve(NETWORK),
    hubbleFlows: (limit = 50) => Promise.resolve({ flows: FLOWS.slice(0, limit), stats: HUBBLE_STATS }),
    telemetry: () => Promise.resolve(TELEMETRY),
    opentelemetryTraces: () => Promise.resolve({ traces: TRACES }),
    lokiLogs: (level = "ALL", limit = 50) => Promise.resolve({ logs: LOKI_LOGS.slice(0, limit), total: LOKI_LOGS.length, loki_status: "UP" }),
    sandboxStatus: () => Promise.resolve(SANDBOX_STATUS),
    mtlsStatus: () => Promise.resolve(MTLS_STATUS),
  },
  system: {
    telemetry: () => Promise.resolve(TELEMETRY),
  },
  approvals: {
    list: () => Promise.resolve({ approvals: [...APPROVALS], total: APPROVALS.length }),
    get: (approvalId: string) => Promise.resolve(APPROVALS.find((a) => a.approval_id === approvalId) ?? APPROVALS[0]),
    approve: (approvalId: string, comments?: string) => Promise.resolve(resolveApproval(approvalId, "APPROVED", comments)),
    reject: (approvalId: string, comments?: string) => Promise.resolve(resolveApproval(approvalId, "REJECTED", comments)),
    create: (artifactId: string, comments?: string) => Promise.resolve({ ...APPROVALS[0], id: APPROVALS.length + 1, approval_id: `APR-${1042 + APPROVALS.length}`, artifact_id: Number(artifactId.replace(/\D+/g, "")) || null, comments: comments || null }),
  },
  artifacts: {
    list: () => Promise.resolve({ artifacts: [...ARTIFACTS], total: ARTIFACTS.length }),
    get: (artifactId: string) => Promise.resolve(ARTIFACTS.find((a) => a.artifact_id === artifactId) ?? ARTIFACTS[0]),
    download: (artifactId: string) => Promise.resolve(new Response(ARTIFACT_PREVIEWS[artifactId] || "demo artifact", { headers: { "Content-Type": "text/plain" } })),
    preview: (artifactId: string) => Promise.resolve({ artifact_id: artifactId, name: ARTIFACTS.find((a) => a.artifact_id === artifactId)?.name || artifactId, content: ARTIFACT_PREVIEWS[artifactId] || "(No previewable content — download to view.)", raw: ARTIFACT_PREVIEWS[artifactId] || "", mime: "text/plain" }),
    downloadUrl: (artifactId: string) => `/api/artifacts/${artifactId}/download`,
    versions: (artifactId: string) => Promise.resolve(ARTIFACTS.filter((a) => a.artifact_id === artifactId || a.parent_artifact_id === artifactId)),
    diff: (_a?: string, _b?: string) => Promise.resolve(ARTIFACT_DIFF),
  },
};