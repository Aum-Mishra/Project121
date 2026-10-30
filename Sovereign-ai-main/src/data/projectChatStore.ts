// Project chat API client + helpers used by the Workbench project workspace.

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000"

export type BackendChatMessage = {
  role: "user" | "assistant" | string
  content: string
  sources?: any[]
  charts?: any[]
  analysis?: any
  findings?: any[]
  plan?: any
  steps?: any[]
  files?: string[]
}

export type BackendChat = {
  id: number
  project_id: string
  title: string
  created_by: string
  messages: BackendChatMessage[]
  context?: any
  last_message?: string | null
  created_at?: string
  updated_at?: string
}

export type BackendProject = {
  id: number
  project_id: string
  name: string
  unit?: string | null
  asset?: string | null
  status?: string
  risk?: string | null
  classification?: string
  description?: string | null
}

function slugify(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function fetchProjects(): Promise<Record<string, BackendProject>> {
  const res = await fetch(`${API_BASE}/api/projects`, { cache: "no-store" })
  if (!res.ok) throw new Error(`projects ${res.status}`)
  const data = await res.json()
  const map: Record<string, BackendProject> = {}
  for (const p of data.projects || []) {
    map[p.name] = p
  }
  return map
}

export function fallbackProjectId(name: string): string {
  const known: Record<string, string> = {
    "P-102 Pump Maintenance Study": "PRJ-P102-REV",
    "CDU-4 Inspection Analysis": "PRJ-CDU4-INSP",
    "Annual Turnaround Planning 2027": "PRJ-TA2027",
    "Pipeline Anomaly Investigation": "PRJ-EP32-CUI",
    "Vendor Technical Evaluation — CX-4": "PRJ-CX4-VEND",
    "Reformer Unit Optimization": "PRJ-REF-OPT",
    "HR Training & Onboarding": "PRJ-HR-TRN",
    "Employee Performance Review": "PRJ-HR-PERF",
  }
  return known[name] || `PRJ-${slugify(name)}`
}

export async function listProjectChats(
  projectId: string,
): Promise<BackendChat[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/chats`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`chats ${res.status}`)
  const data = await res.json()
  return data.chats || []
}

export async function createProjectChat(
  projectId: string,
  title: string,
  createdBy: string,
): Promise<BackendChat> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, created_by: createdBy }),
  })
  if (!res.ok) throw new Error(`create ${res.status}`)
  return res.json()
}

export async function getProjectChat(
  projectId: string,
  chatId: string | number,
): Promise<BackendChat> {
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/chats/${chatId}`,
    { cache: "no-store" },
  )
  if (!res.ok) throw new Error(`get ${res.status}`)
  return res.json()
}

export async function renameProjectChat(
  projectId: string,
  chatId: string | number,
  title: string,
): Promise<BackendChat> {
  const res = await fetch(
    `${API_BASE}/api/projects/${projectId}/chats/${chatId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
  )
  if (!res.ok) throw new Error(`rename ${res.status}`)
  return res.json()
}

export async function deleteProjectChat(
  projectId: string,
  chatId: string | number,
): Promise<void> {
  await fetch(`${API_BASE}/api/projects/${projectId}/chats/${chatId}`, {
    method: "DELETE",
  })
}

/** "Just now", "5m ago", "2h ago", "3d ago", or a short date. */
export function timeLabel(iso?: string | null): string {
  if (!iso) return ""
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}
