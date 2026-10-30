// Real HTTP client for the isolated Coding Agent service (`coding_agent`
// backend, its REST + SSE API). Same surface as `codingAgentMock` so the
// Coding Agent page and Workbench keep working unchanged against live data.
// The service URL is configurable via VITE_CODING_AGENT_URL.

export type {
  CodingTaskSummary,
  CodingEvent,
  CodingPermissionRequest,
  CodingExecution,
  CodingTestResult,
  CodingFileChange,
  CodingTaskDetail,
  WorkspaceEntry,
  WorkspaceInspect,
  CodingSession,
  ChatLineDTO,
  CodingSessionDetail,
  FolderEntry,
  FolderBrowse,
  TreeNode,
  TaskTree,
  RunDetect,
  RunLogEntry,
  RunSnapshot,
  AiFixResult,
} from "./codingAgentMock";

const BASE =
  (import.meta.env.VITE_CODING_AGENT_URL as string | undefined) ||
  "http://localhost:8002";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  if (res.status === 404) {
    const e = new Error("Not found");
    (e as Error & { status?: number }).status = 404;
    throw e;
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.detail || body.message || msg;
    } catch {
      /* non-json */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const post = <T>(path: string, payload?: unknown) =>
  req<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

const put = <T>(path: string, payload: unknown) =>
  req<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const codingApi = {
  base: "http://coding-agent.service",

  health: async (): Promise<{ status: string; service?: string }> =>
    req("/api/health"),

  models: async (): Promise<{ models: string[]; coding_model: string }> =>
    req("/api/models"),

  workspaces: {
    list: () => req("/api/workspaces"),
    inspect: (folderName: string) =>
      post(`/api/workspaces/inspect`, { folder_name: folderName }),
    create: (folderName: string) =>
      post(`/api/workspaces/`, { folder_name: folderName }),
  } as const,

  folders: {
    browse: (path?: string) =>
      req(`/api/folders/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  } as const,

  sessions: {
    create: (payload: {
      title?: string;
      mode?: string;
      project_name?: string | null;
      folder_name?: string | null;
      folder_path?: string | null;
      storage_path?: string | null;
    }) => post(`/api/sessions`, payload),
    list: () => req(`/api/sessions`),
    get: <T>(sessionId: string): Promise<T> => req(`/api/sessions/${encodeURIComponent(sessionId)}`),
    appendMessage: (sessionId: string, role: string, text: string, when?: string) =>
      post(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
        role,
        text,
        when,
      }),
    rename: (sessionId: string, title: string) =>
      post(`/api/sessions/${encodeURIComponent(sessionId)}/rename`, { title }),
    delete: (sessionId: string) => req(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
  } as const,

  tasks: {
    list: () => req(`/api/tasks`),
    get: <T>(taskId: string): Promise<T> => req(`/api/tasks/${encodeURIComponent(taskId)}`),

    generate: (message: string, title?: string, sessionId?: string) =>
      post(`/api/tasks/generate`, { message, title, session_id: sessionId }),
    newProject: (
      message: string,
      projectName?: string,
      sessionId?: string,
      storagePath?: string
    ) =>
      post(`/api/tasks/new-project`, {
        message,
        project_name: projectName,
        session_id: sessionId,
        storage_path: storagePath,
      }),
    existingProject: (message: string, folderName: string, folderPath?: string, sessionId?: string) =>
      post(`/api/tasks/existing-project`, {
        message,
        folder_name: folderName,
        folder_path: folderPath,
        session_id: sessionId,
      }),

    approve: (taskId: string, decision: "ALLOW_ONCE" | "ALLOW_FOR_TASK" | "DENY") =>
      post(`/api/tasks/${encodeURIComponent(taskId)}/approve`, { decision }),
    approveAll: (taskId: string, decision: "ALLOW_ONCE" | "ALLOW_FOR_TASK" | "DENY") =>
      post(`/api/tasks/${encodeURIComponent(taskId)}/approve-all`, { decision }),
    cancel: (taskId: string) => post(`/api/tasks/${encodeURIComponent(taskId)}/cancel`),

    files: (taskId: string) =>
      req(`/api/tasks/${encodeURIComponent(taskId)}/files`),
    file: (taskId: string, path: string) =>
      req(`/api/tasks/${encodeURIComponent(taskId)}/file?path=${encodeURIComponent(path)}`),
    saveFile: (taskId: string, path: string, content: string) =>
      put(`/api/tasks/${encodeURIComponent(taskId)}/file`, { path, content }),
    tree: (taskId: string) =>
      req(`/api/tasks/${encodeURIComponent(taskId)}/tree`),
    diff: (taskId: string) => req(`/api/tasks/${encodeURIComponent(taskId)}/diff`),
    tests: (taskId: string) => req(`/api/tasks/${encodeURIComponent(taskId)}/tests`),
    executions: (taskId: string) => req(`/api/tasks/${encodeURIComponent(taskId)}/executions`),
    download: (taskId: string) =>
      `${BASE}/api/tasks/${encodeURIComponent(taskId)}/download`,

    events: (taskId: string) =>
      new EventSource(`${BASE}/api/tasks/${encodeURIComponent(taskId)}/events`),

    runDetect: (taskId: string) =>
      req(`/api/tasks/${encodeURIComponent(taskId)}/run/detect`),
    run: (taskId: string) => post(`/api/tasks/${encodeURIComponent(taskId)}/run`),
    runStatus: (taskId: string) =>
      req(`/api/tasks/${encodeURIComponent(taskId)}/run/status`),
    runLogs: (taskId: string, runId: string) =>
      new EventSource(
        `${BASE}/api/tasks/${encodeURIComponent(taskId)}/run/${encodeURIComponent(runId)}/logs`
      ),
    runInput: (taskId: string, runId: string, text: string) =>
      post(`/api/tasks/${encodeURIComponent(taskId)}/run/${encodeURIComponent(runId)}/input`, { text }),
    runStop: (taskId: string, runId: string) =>
      post(`/api/tasks/${encodeURIComponent(taskId)}/run/${encodeURIComponent(runId)}/stop`),
    aiFix: (taskId: string, error: string) =>
      post(`/api/tasks/${encodeURIComponent(taskId)}/ai-fix`, { error }),
  } as const,
};