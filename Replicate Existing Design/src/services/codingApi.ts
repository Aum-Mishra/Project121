// Coding Agent — isolated backend API client (separate service on port 8002).
const CODING_API_BASE = import.meta.env.VITE_CODING_API_BASE || "http://localhost:8002";

export interface CodingTaskSummary {
  task_id: string;
  title: string;
  task_type: "GENERATED_CODE" | "NEW_PROJECT" | "EXISTING_PROJECT";
  status: "PENDING" | "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
  verdict: "IMPLEMENTED" | "TESTED" | "FAILED" | "PARTIALLY_COMPLETED" | "REQUIRES_USER_ACTION" | null;
  engine: string;
  created_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  result_summary: string | null;
}

export interface CodingEvent {
  kind: string;
  task_id: string;
  at: string;
  [key: string]: any;
}

export interface CodingPermissionRequest {
  request_id: string;
  kind: string;
  detail: string;
  command: string | null;
  path: string | null;
  decision: string | null;
  created_at: string | null;
}

export interface CodingExecution {
  execution_id: string;
  command: string | null;
  label: string | null;
  status: string | null;
  return_code: number | null;
  duration_ms: number | null;
  stdout?: string | null;
  stderr?: string | null;
}

export interface CodingTestResult {
  command: string;
  passed: boolean;
  stdout: string;
  return_code: number | null;
  attempt: number;
}

export interface CodingFileChange {
  path: string;
  change_type: string;
  diff: string | null;
}

export interface CodingTaskDetail extends CodingTaskSummary {
  request: string;
  authorized_root: string | null;
  repair_attempts: number;
  events: CodingEvent[];
  messages: string[];
  permission_requests: CodingPermissionRequest[];
  executions: CodingExecution[];
  file_changes: CodingFileChange[];
  test_results: CodingTestResult[];
}

export interface WorkspaceEntry {
  name: string;
  path: string;
}

export interface WorkspaceInspect {
  ok: boolean;
  workspace: { name: string; path: string };
  tree: string;
  files: { path: string; size: number }[];
  git: { branch: string | null; changes: string };
}

export interface CodingSession {
  session_id: string;
  title: string;
  mode: "generate" | "new_project" | "existing_project";
  project_name: string | null;
  folder_name: string | null;
  folder_path: string | null;
  storage_path: string | null;
  chat_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ChatLineDTO {
  role: "user" | "agent";
  text: string;
  when: string;
}

export interface CodingSessionDetail {
  session: CodingSession;
  chat: ChatLineDTO[];
  tasks: CodingTaskSummary[];
  task: CodingTaskDetail | null;
}

export interface FolderEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface FolderBrowse {
  path: string;
  name: string;
  parent: string | null;
  home: string;
  entries: FolderEntry[];
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  children?: TreeNode[];
}

export interface TaskTree {
  root: string;
  tree: TreeNode;
  files: { path: string; size: number }[];
  git: { branch: string | null; changes: string };
}

export interface RunDetect {
  ok: boolean;
  command: string;
  label: string;
  kind: string;
  urls: string[];
  root: string;
}

export interface RunLogEntry {
  at: string;
  type: string;
  message?: string;
  line?: string;
  exit?: number | null;
  urls?: string[];
  [key: string]: any;
}

export interface RunSnapshot {
  run_id: string;
  root: string;
  command: string;
  kind: string;
  label: string;
  urls: string[];
  status: string;
  is_running: boolean;
  started_at: string | null;
  stopped_at: string | null;
  exit_code: number | null;
  logs: RunLogEntry[];
}

export interface AiFixResult {
  ok: boolean;
  changes: CodingFileChange[];
  run: RunSnapshot | null;
  run_error?: string | null;
}

async function codingFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${CODING_API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coding API ${res.status}: ${text}`);
  }
  return res.json();
}

function codingStream(url: string): EventSource {
  return new EventSource(`${CODING_API_BASE}${url}`);
}

function downloadUrl(path: string): string {
  return `${CODING_API_BASE}${path}`;
}

export const codingApi = {
  base: CODING_API_BASE,

  health: () => codingFetch<{ status: string; service: string }>("/api/health"),

  models: () => codingFetch<{ models: string[]; coding_model: string }>("/api/models"),

  workspaces: {
    list: () => codingFetch<{ workspaces: WorkspaceEntry[] }>("/api/workspaces"),
    inspect: (folderName: string) =>
      codingFetch<WorkspaceInspect>("/api/workspaces/inspect", {
        method: "POST",
        body: JSON.stringify({ folder_name: folderName }),
      }),
    create: (folderName: string) =>
      codingFetch<{ ok: boolean; workspace: WorkspaceEntry }>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ folder_name: folderName }),
      }),
  },

  folders: {
    browse: (path?: string) =>
      codingFetch<FolderBrowse>(
        `/api/folders/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`
      ),
  },

  sessions: {
    create: (payload: {
      title?: string;
      mode?: string;
      project_name?: string | null;
      folder_name?: string | null;
      folder_path?: string | null;
      storage_path?: string | null;
    }) =>
      codingFetch<{ session: CodingSession }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    list: () => codingFetch<{ sessions: CodingSession[] }>("/api/sessions"),
    get: (sessionId: string) =>
      codingFetch<CodingSessionDetail>(`/api/sessions/${sessionId}`),
    appendMessage: (sessionId: string, role: string, text: string, when?: string) =>
      codingFetch<{ chat: ChatLineDTO[] }>(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ role, text, when }),
      }),
    rename: (sessionId: string, title: string) =>
      codingFetch<{ session: CodingSession }>(`/api/sessions/${sessionId}/rename`, {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    delete: (sessionId: string) =>
      codingFetch<{ ok: boolean }>(`/api/sessions/${sessionId}`, { method: "DELETE" }),
  },

  tasks: {
    list: () => codingFetch<{ tasks: CodingTaskSummary[] }>("/api/tasks"),
    get: (taskId: string) => codingFetch<CodingTaskDetail>(`/api/tasks/${taskId}`),
    generate: (message: string, title?: string, sessionId?: string) =>
      codingFetch<{ task_id: string }>("/api/tasks/generate", {
        method: "POST",
        body: JSON.stringify({ message, title, session_id: sessionId }),
      }),
    newProject: (message: string, projectName?: string, sessionId?: string, storagePath?: string) =>
      codingFetch<{ task_id: string }>("/api/tasks/new-project", {
        method: "POST",
        body: JSON.stringify({ message, project_name: projectName, session_id: sessionId, storage_path: storagePath }),
      }),
    existingProject: (
      message: string,
      folderName: string,
      folderPath?: string,
      sessionId?: string
    ) =>
      codingFetch<{ task_id: string }>("/api/tasks/existing-project", {
        method: "POST",
        body: JSON.stringify({ message, folder_name: folderName, folder_path: folderPath, session_id: sessionId }),
      }),
    approve: (taskId: string, decision: "ALLOW_ONCE" | "ALLOW_FOR_TASK" | "DENY") =>
      codingFetch<{ ok: boolean; decision: string }>(`/api/tasks/${taskId}/approve`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      }),
    approveAll: (taskId: string, decision: "ALLOW_ONCE" | "ALLOW_FOR_TASK" | "DENY") =>
      codingFetch<{ ok: boolean; decision: string }>(`/api/tasks/${taskId}/approve-all`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      }),
    cancel: (taskId: string) =>
      codingFetch<{ ok: boolean }>(`/api/tasks/${taskId}/cancel`, { method: "POST" }),
    files: (taskId: string) =>
      codingFetch<{ files: { path: string; size: number }[]; changes: CodingFileChange[] }>(
        `/api/tasks/${taskId}/files`
      ),
    file: (taskId: string, path: string) =>
      codingFetch<{ path: string; content: string }>(
        `/api/tasks/${taskId}/file?path=${encodeURIComponent(path)}`
      ),
    saveFile: (taskId: string, path: string, content: string) =>
      codingFetch<{ ok: boolean; path: string; size: number }>(
        `/api/tasks/${taskId}/file`,
        {
          method: "PUT",
          body: JSON.stringify({ path, content }),
        }
      ),
    tree: (taskId: string) =>
      codingFetch<TaskTree>(`/api/tasks/${taskId}/tree`),
    diff: (taskId: string) => codingFetch<{ changes: CodingFileChange[] }>(`/api/tasks/${taskId}/diff`),
    tests: (taskId: string) => codingFetch<{ results: CodingTestResult[] }>(`/api/tasks/${taskId}/tests`),
    executions: (taskId: string) =>
      codingFetch<{ executions: CodingExecution[] }>(`/api/tasks/${taskId}/executions`),
    download: (taskId: string) => downloadUrl(`/api/tasks/${taskId}/download`),
    events: (taskId: string) => codingStream(`/api/tasks/${taskId}/events`),
    runDetect: (taskId: string) =>
      codingFetch<RunDetect>(`/api/tasks/${taskId}/run/detect`),
    run: (taskId: string) =>
      codingFetch<{ run: RunSnapshot }>(`/api/tasks/${taskId}/run`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    runStatus: (taskId: string) =>
      codingFetch<{ runs: RunSnapshot[] }>(`/api/tasks/${taskId}/run/status`),
    runLogs: (taskId: string, runId: string) =>
      codingStream(`/api/tasks/${taskId}/run/${runId}/logs`),
    runInput: (taskId: string, runId: string, text: string) =>
      codingFetch<{ ok: boolean }>(`/api/tasks/${taskId}/run/${runId}/input`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    runStop: (taskId: string, runId: string) =>
      codingFetch<{ ok: boolean }>(`/api/tasks/${taskId}/run/${runId}/stop`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    aiFix: (taskId: string, error: string) =>
      codingFetch<AiFixResult>(`/api/tasks/${taskId}/ai-fix`, {
        method: "POST",
        body: JSON.stringify({ error }),
      }),
  },
};