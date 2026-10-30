const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function authHeaders(): Record<string, string> {
  let token = null;
  try {
    token = localStorage.getItem("sovereign_token");
  } catch {
    token = null;
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let reauthPromise: Promise<string | null> | null = null;

async function refreshAuthToken(): Promise<string | null> {
  if (reauthPromise) return reauthPromise;
  reauthPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "arjun.mehta@apexpetro.com", password: "apexpetro2026" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          try {
            localStorage.setItem("sovereign_token", data.access_token);
            localStorage.setItem(
              "sovereign_user",
              JSON.stringify({
                full_name: data.full_name,
                email: data.email,
                role: data.role,
              })
            );
          } catch {
            // ignore storage errors
          }
          return data.access_token;
        }
      }
    } catch (e) {
      console.warn("Auto-reauthentication error:", e);
    } finally {
      reauthPromise = null;
    }
    return null;
  })();
  return reauthPromise;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  let res = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...authHeaders(), ...options?.headers },
    ...options,
  });
  if (res.status === 401 && !url.includes("/auth/login")) {
    const freshToken = await refreshAuthToken();
    if (freshToken) {
      res = await fetch(`${API_BASE}${url}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshToken}`,
          ...options?.headers,
        },
        ...options,
      });
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchStream(url: string, options?: RequestInit): Promise<Response> {
  let res = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...authHeaders(), ...options?.headers },
    ...options,
  });
  if (res.status === 401 && !url.includes("/auth/login")) {
    const freshToken = await refreshAuthToken();
    if (freshToken) {
      res = await fetch(`${API_BASE}${url}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshToken}`,
          ...options?.headers,
        },
        ...options,
      });
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res;
}

async function fetchForm<T>(url: string, options?: RequestInit): Promise<T> {
  let res = await fetch(`${API_BASE}${url}`, {
    headers: { ...authHeaders(), ...options?.headers },
    ...options,
  });
  if (res.status === 401 && !url.includes("/auth/login")) {
    const freshToken = await refreshAuthToken();
    if (freshToken) {
      res = await fetch(`${API_BASE}${url}`, {
        headers: {
          Authorization: `Bearer ${freshToken}`,
          ...options?.headers,
        },
        ...options,
      });
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  full_name: string;
  role?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  full_name: string;
  email: string;
  role: string;
  company_id: string;
  user_id: number;
}

export interface ConversationSummary {
  conversation_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSource {
  source: string;
  document_id: string;
  content: string;
  page: number | null;
  section: string | null;
  relevance: number | null;
}

export interface ChatArtifact {
  artifact_id: string;
  name?: string;
  template?: string;
  format?: string;
  download_url?: string;
  approval_id?: string | null;
  version?: number;
  parent_artifact_id?: string | null;
}

export interface ChatMessageMeta {
  model?: string | null;
  verified?: boolean | null;
  analysis?: any;
}

export interface MessageRecord {
  message_id: string;
  role: "user" | "assistant";
  content: string;
  run_id: string | null;
  sources?: ChatSource[];
  artifacts?: ChatArtifact[];
  meta?: ChatMessageMeta;
  attachments?: any[];
  created_at: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  company_id: string;
  environment: string;
}

export interface DetailedHealthResponse {
  status: string;
  checks: {
    database: boolean;
    ollama: boolean;
    qdrant: boolean;
  };
  company_id: string;
  environment: string;
}

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

export interface ModelListResponse {
  models: ModelInfo[];
}

export interface ModelAvailability {
  model_id: string;
  available: boolean;
  status: string;
  error?: string;
}

export interface ChatRequest {
  query: string;
  conversation_id?: string;
  model?: string;
}

export interface ChatEvent {
  event: string;
  run_id?: string;
  query?: string;
  model?: string;
  reason?: string;
  steps?: string[];
  error?: string;
  verified?: boolean;
  answer?: string;
  evidence?: Array<{
    source: string;
    document_id: string;
    content: string;
    page: number;
    section: string;
    relevance: number;
  }>;
  tools_used?: string[];
  documents_accessed?: string[];
  analysis?: any;
  artifact?: any;
  artifacts?: Array<{
    artifact_id: string;
    name?: string;
    template?: string;
    format?: string;
    download_url?: string;
  }>;
}

export interface KnowledgeSearchRequest {
  query: string;
  limit?: number;
  asset_id?: string;
  document_type?: string;
  classification?: string;
}

export interface KnowledgeSearchResult {
  chunk_id: number;
  document_id: string;
  content: string;
  page_number: number;
  section: string | null;
  score: number;
  metadata: Record<string, any>;
}

export interface KnowledgeSearchResponse {
  results: KnowledgeSearchResult[];
  query: string;
  total: number;
}

export interface Document {
  id: number;
  document_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  page_count: number | null;
  classification: string;
  status: string;
  owner: string | null;
  revision: string | null;
  uploaded_at: string | null;
  indexed_at: string | null;
  error_message: string | null;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
}

export interface Asset {
  id: number;
  asset_id: string;
  asset_type: string;
  unit: string;
  service: string;
  criticality: string;
  manufacturer: string;
  model: string;
  year: number;
  design_pressure: number;
  normal_pressure: number;
  design_temp: number;
  capacity: string;
  specifications: Record<string, any>;
}

export interface AssetListResponse {
  assets: Asset[];
  total: number;
}

export interface Project {
  id: number;
  project_id: string;
  name: string;
  unit: string;
  asset: string;
  status: string;
  risk: string;
  progress: number;
  classification: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
}

export interface Task {
  id: number;
  task_id: string;
  project_id: number;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  owner_id: number | null;
  due_date: string | null;
  asset: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
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

export interface ArtifactListResponse {
  artifacts: Artifact[];
  total: number;
}

export interface Approval {
  id: number;
  approval_id: string;
  artifact_id: number;
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

export interface ApprovalListResponse {
  approvals: Approval[];
  total: number;
}

export interface WorkOrder {
  id: number;
  wo_id: string;
  asset_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  assigned_to: number | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface WorkOrderListResponse {
  work_orders: WorkOrder[];
  total: number;
}

export interface SecurityStatusItem {
  label: string;
  status: string;
  status_color: string;
  status_bg: string;
  desc: string;
  indicator: "active" | "blocked" | "disabled";
}

export interface SecurityStatusResponse {
  items: SecurityStatusItem[];
  overall: "secure" | "degraded" | "warning";
}

export interface CodeRunResult {
  stdout: string;
  stderr: string;
  return_code: number;
  execution_ms: number;
  sandbox: string;
}

export interface UploadResponse {
  document_id: string;
  file_name: string;
  status: string;
}

export interface ChatAttachmentResponse {
  attachment_id: string;
  filename: string;
  ext: string;
  size: number;
  summary: string;
  content_excerpt: string;
}

export interface ArtifactPreview {
  artifact_id: string;
  name: string;
  content?: string;
  raw?: string;
  mime?: string;
}

export interface GenerateDocumentRequest {
  template: string;
  data: Record<string, any>;
  format: "docx" | "xlsx" | "pptx" | "pdf";
}

export interface GenerateDocumentResponse {
  artifact_id: string;
  file_path: string;
  download_url: string;
}

export const api = {
  health: {
    check: () => fetchJson<HealthResponse>("/api/health"),
    detailed: () => fetchJson<DetailedHealthResponse>("/api/health/detailed"),
  },

  auth: {
    login: (data: LoginRequest) => fetchJson<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(data) }),
    signup: (data: SignupRequest) => fetchJson<LoginResponse>("/api/auth/signup", { method: "POST", body: JSON.stringify(data) }),
    me: () => fetchJson<{ user_id: number; full_name: string; email: string; role: string; company_id: string }>("/api/auth/me"),
  },

  models: {
    list: () => fetchJson<ModelListResponse>("/api/models"),
    get: (modelId: string) => fetchJson<ModelInfo>(`/api/models/${modelId}`),
    checkAvailability: () => fetchJson<{ availability: ModelAvailability[] }>("/api/models/check-availability", { method: "POST" }),
    initialize: () => fetchJson<{ initialized: number; models: string[] }>("/api/models/initialize", { method: "POST" }),
  },

  chat: {
    stream: (request: ChatRequest) => fetchStream("/api/chat/stream", { method: "POST", body: JSON.stringify(request) }),
    getConversation: (conversationId: string) => fetchJson<{ conversation_id: string; runs: string[] }>(`/api/chat/${conversationId}`),
    createConversation: () => fetchJson<ConversationSummary>("/api/chat/conversations", { method: "POST", body: "{}" }),
    listConversations: () => fetchJson<{ conversations: ConversationSummary[]; total: number }>("/api/chat/conversations"),
    getMessages: (conversationId: string) => fetchJson<{ conversation_id: string; messages: MessageRecord[]; total: number }>(`/api/chat/conversations/${conversationId}/messages`),
    renameConversation: (conversationId: string, title: string) => fetchJson<ConversationSummary>(`/api/chat/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify({ title }) }),
    deleteConversation: (conversationId: string) => fetchJson<{ conversation_id: string; deleted: boolean }>(`/api/chat/conversations/${conversationId}`, { method: "DELETE" }),
    uploadAttachment: (conversationId: string, file: File) => {
      const form = new FormData();
      form.append("conversation_id", conversationId);
      form.append("file", file);
      return fetchForm<ChatAttachmentResponse>("/api/chat/attachments", { method: "POST", body: form });
    },
  },

  knowledge: {
    search: (request: KnowledgeSearchRequest) => fetchJson<KnowledgeSearchResponse>("/api/knowledge/search", { method: "POST", body: JSON.stringify(request) }),
    health: () => fetchJson<{ status: string; service: string }>("/api/knowledge/health"),
  },

  documents: {
    list: (params?: { company_id?: string; status?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.company_id) search.set("company_id", params.company_id);
      if (params?.status) search.set("status", params.status);
      if (params?.limit) search.set("limit", String(params.limit));
      if (params?.offset) search.set("offset", String(params.offset));
      return fetchJson<DocumentListResponse>(`/api/documents?${search.toString()}`);
    },
    upload: (file: File, metadata?: { classification?: string; asset_id?: string }) => {
      const form = new FormData();
      form.append("file", file);
      if (metadata?.classification) form.append("classification", metadata.classification);
      if (metadata?.asset_id) form.append("asset_id", metadata.asset_id);
      return fetchForm<UploadResponse>("/api/documents/upload", { method: "POST", body: form });
    },
    get: (documentId: string) => fetchJson<Document>(`/api/documents/${documentId}`),
    delete: (documentId: string) => fetchJson<{ success: boolean }>(`/api/documents/${documentId}`, { method: "DELETE" }),
  },

  assets: {
    list: (params?: { company_id?: string; unit?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.company_id) search.set("company_id", params.company_id);
      if (params?.unit) search.set("unit", params.unit);
      if (params?.limit) search.set("limit", String(params.limit));
      if (params?.offset) search.set("offset", String(params.offset));
      return fetchJson<AssetListResponse>(`/api/assets?${search.toString()}`);
    },
    get: (assetId: string) => fetchJson<Asset>(`/api/assets/${assetId}`),
  },

  projects: {
    list: (params?: { company_id?: string; status?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.company_id) search.set("company_id", params.company_id);
      if (params?.status) search.set("status", params.status);
      if (params?.limit) search.set("limit", String(params.limit));
      if (params?.offset) search.set("offset", String(params.offset));
      return fetchJson<ProjectListResponse>(`/api/projects?${search.toString()}`);
    },
    get: (projectId: string) => fetchJson<Project>(`/api/projects/${projectId}`),
    create: (data: Partial<Project>) => fetchJson<Project>("/api/projects", { method: "POST", body: JSON.stringify(data) }),
    update: (projectId: string, data: Partial<Project>) => fetchJson<Project>(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(data) }),
  },

  tasks: {
    list: (params?: { project_id?: number; status?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.project_id) search.set("project_id", String(params.project_id));
      if (params?.status) search.set("status", params.status);
      if (params?.limit) search.set("limit", String(params.limit));
      if (params?.offset) search.set("offset", String(params.offset));
      return fetchJson<TaskListResponse>(`/api/tasks?${search.toString()}`);
    },
    get: (taskId: string) => fetchJson<Task>(`/api/tasks/${taskId}`),
    create: (data: Partial<Task>) => fetchJson<Task>("/api/tasks", { method: "POST", body: JSON.stringify(data) }),
    update: (taskId: string, data: Partial<Task>) => fetchJson<Task>(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }),
  },

  artifacts: {
    list: (params?: { project_id?: number; status?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.project_id) search.set("project_id", String(params.project_id));
      if (params?.status) search.set("status", params.status);
      if (params?.limit) search.set("limit", String(params.limit));
      if (params?.offset) search.set("offset", String(params.offset));
      return fetchJson<ArtifactListResponse>(`/api/artifacts?${search.toString()}`);
    },
    get: (artifactId: string) => fetchJson<Artifact>(`/api/artifacts/${artifactId}`),
    download: (artifactId: string) => fetch(`${API_BASE}/api/artifacts/${artifactId}/download`),
    preview: (artifactId: string) => fetchJson<ArtifactPreview>(`/api/artifacts/${artifactId}/preview`),
    downloadUrl: (artifactId: string) => `${API_BASE}/api/artifacts/${artifactId}/download`,
    versions: (artifactId: string) => fetchJson<Artifact[]>(`/api/artifacts/${artifactId}/versions`),
    diff: (artifactIdA: string, artifactIdB: string) =>
      fetchJson<{ artifact_a: any; artifact_b: any; unified_diff: string; lines_added: number; lines_removed: number }>(
        `/api/artifacts/${artifactIdA}/diff/${artifactIdB}`
      ),
  },

  approvals: {
    list: (params?: { status?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.status) search.set("status", params.status);
      if (params?.limit) search.set("limit", String(params.limit));
      if (params?.offset) search.set("offset", String(params.offset));
      return fetchJson<ApprovalListResponse>(`/api/approvals?${search.toString()}`);
    },
    get: (approvalId: string) => fetchJson<Approval>(`/api/approvals/${approvalId}`),
    create: (artifactId: string, comments?: string) =>
      fetchJson<Approval>(`/api/approvals`, { method: "POST", body: JSON.stringify({ artifact_id: artifactId, comments }) }),
    approve: (approvalId: string, comments?: string) => fetchJson<Approval>(`/api/approvals/${approvalId}/approve`, { method: "POST", body: JSON.stringify({ comments }) }),
    reject: (approvalId: string, comments?: string) => fetchJson<Approval>(`/api/approvals/${approvalId}/reject`, { method: "POST", body: JSON.stringify({ comments }) }),
  },

  workOrders: {
    list: (params?: { asset_id?: string; status?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.asset_id) search.set("asset_id", params.asset_id);
      if (params?.status) search.set("status", params.status);
      if (params?.limit) search.set("limit", String(params.limit));
      if (params?.offset) search.set("offset", String(params.offset));
      return fetchJson<WorkOrderListResponse>(`/api/work-orders?${search.toString()}`);
    },
    get: (woId: string) => fetchJson<WorkOrder>(`/api/work-orders/${woId}`),
  },

  security: {
    status: () => fetchJson<SecurityStatusResponse>("/api/security/status"),
    events: (limit = 50) => fetchJson<any[]>(`/api/security/events?limit=${limit}`),
    network: () => fetchJson<{ status: any; policy_manifest: string }>("/api/security/network"),
    hubbleFlows: (limit = 50) => fetchJson<{ flows: any[]; stats: any }>(`/api/security/hubble/flows?limit=${limit}`),
    telemetry: () => fetchJson<any>("/api/security/prometheus/telemetry"),
    opentelemetryTraces: () => fetchJson<{ traces: any[] }>("/api/security/opentelemetry/traces"),
    lokiLogs: (level = "ALL", limit = 50) => fetchJson<{ logs: any[]; total: number; loki_status: string }>(`/api/security/loki/logs?level=${level}&limit=${limit}`),
    sandboxStatus: () => fetchJson<any>("/api/security/sandbox/status"),
    mtlsStatus: () => fetchJson<any>("/api/security/mtls/status"),
  },

  code: {
    run: (code: string, timeout = 30) =>
      fetchJson<CodeRunResult>("/api/code/run", { method: "POST", body: JSON.stringify({ code, language: "python", timeout }) }),
    debugLoop: (payload: { task_prompt: string; initial_code: string; max_iterations?: number; timeout?: number }) =>
      fetchJson<any>("/api/code/debug-loop", { method: "POST", body: JSON.stringify(payload) }),
    diff: (original_text: string, modified_text: string, filename?: string) =>
      fetchJson<{ diff: string; has_changes: boolean; lines_added: number; lines_removed: number }>("/api/code/diff", {
        method: "POST",
        body: JSON.stringify({ original_text, modified_text, filename }),
      }),
    checkpoint: (project_path: string, label?: string) =>
      fetchJson<any>("/api/code/checkpoint", { method: "POST", body: JSON.stringify({ project_path, label }) }),
    rollback: (project_path: string, checkpoint_id: string) =>
      fetchJson<{ success: boolean; restored_checkpoint: string }>("/api/code/rollback", {
        method: "POST",
        body: JSON.stringify({ project_path, checkpoint_id }),
      }),
    projectTree: (path?: string) =>
      fetchJson<any>(`/api/code/project-tree${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  },

  documentsGeneration: {
    generate: (request: GenerateDocumentRequest) => fetchJson<GenerateDocumentResponse>("/api/documents/generate", { method: "POST", body: JSON.stringify(request) }),
  },
};