import React, { useState, useRef, useEffect } from "react"
import { useLocalStorage } from "../hooks/useLocalStorage"
import { ErrorBoundary } from "../components/ErrorBoundary"
import { useNav } from "../context/NavContext"
import { filterProjectsForRole } from "../data/roles"
import { convsByProjectName, PcMsg, ProjectConv } from "../data/projectChats"
import { conversations as personalConvs } from "../data/personalChats"
import {
  fetchProjects,
  listProjectChats,
  createProjectChat,
  renameProjectChat,
  deleteProjectChat,
  timeLabel,
  fallbackProjectId,
  BackendChat,
  BackendProject,
} from "../data/projectChatStore"
import { matchDemoQuestion, getQuestionById } from "../data/demoQuestions"
import { answerForQuery } from "../data/genericQueries"
import ChatMessages, {
  GenericAnswerCard,
  avatarColor,
  initials,
} from "../components/ChatMessages"
import ApiExecutionSequence, {
  StaticExecutionSequence,
  normalizePlan as normalizePlanLocal,
} from "../components/ApiExecutionSequence"
import ExecutionSequence from "../components/ExecutionSequence"
import GenericExecution from "../components/GenericExecution"
import DocumentViewer, { DocTypeChip } from "../components/DemoDocs"
import { files } from "../data/demoCore"
import {
  Download,
  ExternalLink,
  FileCode2,
  FolderArchive,
  Loader2,
} from "lucide-react"

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000"

type Scope = { type: "project" project: string convId: string } | {
  type: "personal"
  convId: number
}

type Flight = {
  key: string
  kind: "api" | "image"
  query: string
  convId: string
  role?: string
  projectId?: string
  chatId?: string
  contributor?: string
  projectName?: string
  image?: { preview: string name: string }
}
type ItemMsg = { type: "pc" msg: PcMsg } | {
  type: "generic"
  answer: ReturnType<typeof answerForQuery>
} | {
  type: "sequence"
  query: string
  plan: any
  procLines: string[]
  stepsDone: number
} | { type: "coding" coding: any }

const agents = [
  "Research Agent",
  "Document Agent",
  "Engineering Agent",
  "HSE/Inspection Agent",
  "Data Analysis Agent",
  "Maintenance Agent",
  "Procurement Agent",
  "Project Agent",
]

function deriveChatTitle(text: string): string {
  const q = (text || "").toLowerCase()
  const assetMatch = (text || "").match(
    /\b((?:P|EP|CX)-\d{2,3}[A-Z]?|CDU-\d)\b/i,
  )
  const asset = assetMatch ? assetMatch[0].toUpperCase() : ""
  const has = (...ws: string[]) => ws.some((w) => q.includes(w))
  let topic = ""
  if (has("inspection", "risk", "assess", "integrity", "health"))
    topic = "Inspection & Risk Assessment"
  else if (
    has("history", "compare", "comparison", "trend", "over time", "years")
  )
    topic = "History & Comparison"
  else if (has("report", "document", "docx", "excel", "presentation"))
    topic = "Report & Documentation"
  else if (has("maintenance", "work order", " corrective"))
    topic = "Maintenance & Work Orders"
  else if (
    has("vibration", "corrosion", "pressure", "temperature", "monitoring")
  )
    topic = "Condition Monitoring"
  if (asset) return topic ? `${asset} ${topic}` : `${asset} Analysis`
  const head = (text || "").trim().replace(/\s+/g, " ").slice(0, 42)
  return head.length >= 42 ? `${head}…` : head || "New Chat"
}

function intentLabel(intent: string | undefined): string {
  const map: Record<string, string> = {
    engineering_inquiry: "Engineering Inquiry",
    report_generation: "Report Generation",
    graph_generation: "Graph & Analysis",
    hr_inquiry: "HR Inquiry",
    general_qa: "Knowledge Base Q&A",
    greeting: "Greeting",
    irrelevant: "Out of Scope",
  }
  if (!intent) return "KNOVIA AI"
  return map[intent] || intent.replace(/_/g, " ")
}

export default function Workbench() {
  const {
    navigate,
    projects,
    currentProjectName,
    setCurrentProjectName,
    role,
  } = useNav()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(true)
  const [scope, setScope] = useState<Scope>({
    type: "project",
    project: currentProjectName,
    convId: "",
  })
  const [items, setItems] = useState<ItemMsg[]>([])
  const [running, setRunning] = useState<Flight | null>(null)
  const [input, setInput] = useState("")
  const [mode, setMode] = useState<"auto" | "manual">("auto")
  const [selectedAgent, setSelectedAgent] = useState("Research Agent")
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [attachedImage, setAttachedImage] = useState<{
    preview: string
    name: string
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showNewChatMenu, setShowNewChatMenu] = useState(false)
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [tempConvs, setTempConvs] = useLocalStorage<ProjectConv[]>(
    "tempConvs",
    [],
  )
  const [tempPersonal, setTempPersonal] =
    useLocalStorage<import("../data/personalChats").Conversation[]>(
      "tempPersonal",
      [],
    )
  const [chatTitles, setChatTitles] = useLocalStorage<Record<string, string>>(
    "chatTitleOverrides",
    {},
  )
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const newChatConsumedRef = useRef(false)

  const [projectInfoMap, setProjectInfoMap] =
    useState<Record<string, BackendProject>>({})
  const [projectChats, setProjectChats] =
    useState<Record<string, BackendChat[]>>({})
  const [chatsVersion, setChatsVersion] = useState(0)
  const [projectSearch, setProjectSearch] = useState("")
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState("")

  const titleFor = (c: any) => chatTitles[String(c.id)] ?? c?.title ?? "Chat"

  // ── Backend project workspace wiring ─────────────────────────────────────
  const backendToConv = (b: BackendChat): ProjectConv => {
    const msgs: PcMsg[] = (b.messages || [])
      .filter((m) => m && m.content)
      .map((m) =>
        m.role === "user"
          ? {
              kind: "text" as const,
              role: "user" as const,
              author: b.created_by || "Project Member",
              text: String(m.content),
            }
          : {
              kind: "text" as const,
              role: "ai" as const,
              author: "KNOVIA AI",
              text: String(m.content),
              sources: m.sources,
              files: m.files,
              analysis: m.analysis,
              charts: m.charts,
              plan: m.plan,
            } as PcMsg,
      )
    const preview =
      b.last_message ||
      (msgs.length > 0
        ? String((msgs[msgs.length - 1] as any).text || "")
        : "Empty chat")
    return {
      id: String(b.id),
      title: b.title || "New Chat",
      preview,
      time: timeLabel(b.updated_at) || "",
      messages: msgs,
      owner: b.created_by || "System",
      updatedAt: b.updated_at ? new Date(b.updated_at).getTime() : Date.now(),
    }
  }

  const loadProjectChats = async (name: string) => {
    const pid = projectInfoMap[name]?.project_id || fallbackProjectId(name)
    try {
      const chats = await listProjectChats(pid)
      setProjectChats((prev) => ({ ...prev, [name]: chats }))
      setChatsVersion((v) => v + 1)
    } catch {
      /* backend unavailable — keep local fallback */
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const map = await fetchProjects()
        if (cancelled) return
        setProjectInfoMap(map)
      } catch {
        /* offline */
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (scope.type !== "project") return
    const name = scope.project
    if (!name) return
    ;(async () => {
      await new Promise((r) => setTimeout(r, 50))
      await loadProjectChats(name)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.project])

  const projectName =
    scope.type === "project" ? scope.project : currentProjectName
  const myProjects = filterProjectsForRole(projects, role)
  const currentProject =
    myProjects.find((p) => p.name === projectName) ?? myProjects[0]
  const backendConvs = (projectChats[projectName] || []).map(backendToConv)
  const tempProjectConvs = tempConvs.filter((c) => c.project === projectName)
  const legacyConvs = convsByProjectName(projectName)
  const sortTs = (c: any) => c?.updatedAt ?? Date.now()
  const projectConvs = [
    ...backendConvs,
    ...tempProjectConvs,
    ...(backendConvs.length === 0 && tempProjectConvs.length === 0
      ? legacyConvs
      : []),
  ].sort((a, b) => sortTs(b) - sortTs(a))

  const ownerOfConv = (c: any) => (c as any)?.owner || "System"

  const searchTerm = projectSearch.trim().toLowerCase()
  const filteredProjectConvs = searchTerm
    ? projectConvs.filter(
        (c) =>
          (c.title || "").toLowerCase().includes(searchTerm) ||
          (c.preview || "").toLowerCase().includes(searchTerm) ||
          c.messages.some((m) =>
            String(m.kind === "text" ? (m as any).text || "" : "")
              .toLowerCase()
              .includes(searchTerm),
          ),
      )
    : projectConvs

  const matchingProjects = searchTerm
    ? myProjects.filter((p) => p.name.toLowerCase().includes(searchTerm))
    : []

  const chatOwners = [
    ...new Set(
      filteredProjectConvs
        .map(ownerOfConv)
        .concat(currentProject?.contributors || [], "Anita Rao"),
    ),
  ]
  const ownerSections = chatOwners
    .map((author) => ({
      author,
      convs: filteredProjectConvs.filter((c) => ownerOfConv(c) === author),
    }))
    .filter((s) => s.convs.length > 0)
    .sort(
      (a, b) =>
        Math.max(...b.convs.map((c) => sortTs(c))) -
        Math.max(...a.convs.map((c) => sortTs(c))),
    )
  const isBackendConv = /^\d+$/.test(String(scope.convId))
  const activeConv =
    scope.type === "project"
      ? (projectConvs.find((c) => c.id === scope.convId) ?? projectConvs[0])
      : ([...tempPersonal, ...personalConvs].find(
          (c) => c.id === scope.convId,
        ) ?? [...tempPersonal, ...personalConvs][0])

  useEffect(() => {
    const storageKey = `chat-history-${scope.type}-${
      scope.type === "project" ? scope.project : ""
    }-${scope.convId}`
    const saved = localStorage.getItem(storageKey)

    if (saved) {
      try {
        setItems(JSON.parse(saved))
        setRunning(null)
        return
      } catch (e) {}
    }

    if (scope.type === "project") {
      const conv =
        projectConvs.find((c) => c.id === scope.convId) ?? projectConvs[0]
      setItems(
        conv
          ? conv.messages.map((m) => {
              if (m.kind === "demo")
                return {
                  type: "pc" as const,
                  msg: { kind: "demo", role: m.role, qId: m.qId } as PcMsg,
                }
              return { type: "pc" as const, msg: m }
            })
          : [],
      )
    } else {
      const conv =
        [...tempPersonal, ...personalConvs].find(
          (c) => c.id === scope.convId,
        ) ?? [...tempPersonal, ...personalConvs][0]
      setItems(
        conv.messages.map((m) => {
          if (m.kind === "demo")
            return {
              type: "pc" as const,
              msg: { kind: "demo", role: m.role, qId: m.qId } as PcMsg,
            }
          return {
            type: "pc" as const,
            msg: {
              kind: "text",
              role: m.role,
              author: m.role === "user" ? "Anita Rao" : "Personal AI",
              text: m.text,
              sources: m.sources,
              files: m.files,
              analysis: m.analysis,
            } as PcMsg,
          }
        }),
      )
    }
    setRunning(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.type, scope.convId, scope.project, chatsVersion])

  useEffect(() => {
    if (items.length > 0) {
      const storageKey = `chat-history-${scope.type}-${
        scope.type === "project" ? scope.project : ""
      }-${scope.convId}`
      localStorage.setItem(storageKey, JSON.stringify(items))
    }
  }, [items, scope.type, scope.convId, scope.project])

  // Dashboard "New Chat" quick action sets this flag then navigates here; on
  // mount we consume it and open a fresh personal chat.
  useEffect(() => {
    if (newChatConsumedRef.current) return
    newChatConsumedRef.current = true
    try {
      if (localStorage.getItem("wb_new_chat")) {
        localStorage.removeItem("wb_new_chat")
        newPersonalChat()
      }
    } catch {
      /* non-browser env */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = chatScrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [items, running])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const el = chatScrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }, 400)
    return () => window.clearInterval(id)
  }, [running])

  const switchProject = (name: string) => {
    setCurrentProjectName(name)
    setScope({ type: "project", project: name, convId: "" })
  }

  const switchPersonal = (convId: number) => {
    setScope({ type: "personal", convId })
  }

  const newPersonalChat = () => {
    const id = -Date.now() - Math.floor(Math.random() * 1000)
    const conv: import("../data/personalChats").Conversation = {
      id,
      title: "New Personal Chat",
      preview: "Fresh private conversation",
      time: "Now",
      temp: true,
      messages: [
        {
          kind: "text",
          role: "ai",
          text: "Fresh personal chat ready. Ask me anything in your private space — general knowledge plus your saved workspace notes only.",
        },
      ],
    }
    setTempPersonal((prev) => [conv, ...prev])
    setScope({ type: "personal", convId: id })
  }

  const newChat = async () => {
    const name = currentProjectName
    const pid = projectInfoMap[name]?.project_id || fallbackProjectId(name)
    const greeting =
      "Fresh conversation ready. Ask me anything about this project — documents, analyses, plans or approvals."
    try {
      const row = await createProjectChat(pid, "New Chat", "Anita Rao")
      const rowWithGreeting: BackendChat = {
        ...row,
        messages: [
          { role: "assistant", content: greeting },
          ...(row.messages || []),
        ],
      }
      setProjectChats((prev) => ({
        ...prev,
        [name]: [rowWithGreeting, ...(prev[name] || [])],
      }))
      setChatsVersion((v) => v + 1)
      setScope({ type: "project", project: name, convId: String(row.id) })
    } catch {
      const conv: ProjectConv = {
        id: `new-${Date.now()}`,
        title: "New Chat",
        time: "Now",
        preview: "Fresh conversation",
        project: name,
        temp: true,
        messages: [
          {
            kind: "text",
            role: "ai",
            author: "Engineering Agent",
            text: greeting,
          },
        ],
      }
      setTempConvs((prev) => [conv, ...prev])
      setScope({ type: "project", project: name, convId: conv.id })
    }
  }

  const deletePersonalChat = (id: number) => {
    const removeTitles = (prev: Record<string, string>) => {
      const next = { ...prev }
      delete next[String(id)]
      return next
    }
    setChatTitles(removeTitles)
    setTempPersonal((prev) => prev.filter((c) => c.id !== id))
    if (scope.convId === id) {
      const remaining = [...tempPersonal, ...personalConvs].filter(
        (c) => c.id !== id,
      )
      setScope({ type: "personal", convId: (remaining[0]?.id ?? -1) as number })
    }
  }

  const saveRename = async (id: string) => {
    const title = renameText.trim()
    const name = scope.type === "project" ? scope.project : ""
    setRenameId(null)
    if (!title || !name) return
    setChatTitles((prev) => ({ ...prev, [String(id)]: title }))
    setTempConvs((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
    setProjectChats((prev) => ({
      ...prev,
      [name]: (prev[name] || []).map((c) =>
        String(c.id) === String(id) ? { ...c, title } : c,
      ),
    }))
    if (/^\d+$/.test(String(id))) {
      const pid = projectInfoMap[name]?.project_id || fallbackProjectId(name)
      try {
        await renameProjectChat(pid, id, title)
        loadProjectChats(name)
      } catch {
        /* offline — local title kept */
      }
    }
  }

  const deleteConv = async (id: string) => {
    const name = scope.type === "project" ? scope.project : ""
    const nextScope =
      scope.convId === id ? projectConvs[0]?.id || "" : scope.convId
    const removeTitles = (prev: Record<string, string>) => {
      const next = { ...prev }
      delete next[String(id)]
      return next
    }
    setChatTitles(removeTitles)
    if (/^\d+$/.test(String(id)) && name) {
      const pid = projectInfoMap[name]?.project_id || fallbackProjectId(name)
      try {
        await deleteProjectChat(pid, id)
        setProjectChats((prev) => ({
          ...prev,
          [name]: (prev[name] || []).filter((c) => String(c.id) !== String(id)),
        }))
        setChatsVersion((v) => v + 1)
      } catch {
        setTempConvs((prev) => prev.filter((c) => c.id !== id))
      }
    } else {
      setTempConvs((prev) => prev.filter((c) => c.id !== id))
    }
    if (scope.convId === id) {
      setScope({
        type: "project",
        project: name || currentProjectName,
        convId: nextScope,
      })
    }
  }

  const openInCodingAgent = async (coding: any) => {
    // The real coding session was created by the isolated Coding Agent service
    // during the chat; drop its id into the page's active-session slot so the
    // Coding Agent screen opens that exact workspace (no mock seeding).
    if (coding?.session_id) {
      try {
        localStorage.setItem("ca_active_session", coding.session_id)
      } catch {
        /* non-browser env */
      }
    }
    navigate("coding-agent")
  }

  const openImagePicker = () => {
    setShowAttachMenu(false)
    window.setTimeout(() => fileInputRef.current?.click(), 0)
  }

  const removeImage = () => setAttachedImage(null)

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !/^image\//.test(file.type)) return
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || "")
      const img = new Image()
      img.onload = () => {
        const MAX = 880
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          setAttachedImage({ preview: raw, name: file.name })
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        setAttachedImage({
          preview: canvas.toDataURL("image/jpeg", 0.82),
          name: file.name,
        })
      }
      img.src = raw
    }
    reader.readAsDataURL(file)
  }

  const handleSend = () => {
    if (!input.trim() || running) return
    const text = input.trim()
    const image = attachedImage
    setInput("")
    setAttachedImage(null)
    setShowAttachMenu(false)

    // Name every conversation after its first real user query (and re-name any
    // chat still sitting on the generic placeholder title).
    const hasUserMsg = items.some(
      (it) =>
        it.type === "pc" && it.msg.kind === "text" && it.msg.role === "user",
    )
    const currentConvTitle =
      chatTitles[String(scope.convId)] ??
      (scope.type === "project"
        ? projectConvs.find((c) => String(c.id) === String(scope.convId))?.title
        : [...tempPersonal, ...personalConvs].find(
            (c) => String(c.id) === String(scope.convId),
          )?.title)
    const genericTitle =
      !currentConvTitle || /^New (?:Personal )?Chat$/.test(currentConvTitle)
    if (!hasUserMsg || genericTitle) {
      const derived = deriveChatTitle(text)
      if (derived) {
        setChatTitles((prev) => ({ ...prev, [String(scope.convId)]: derived }))
        if (scope.type === "project") {
          setTempConvs((prev) =>
            prev.map((c) =>
              c.id === scope.convId ? { ...c, title: derived } : c,
            ),
          )
        } else {
          setTempPersonal((prev) =>
            prev.map((c) =>
              c.id === scope.convId ? { ...c, title: derived } : c,
            ),
          )
        }
      }
    }

    setItems((prev) => [
      ...prev,
      {
        type: "pc",
        msg: {
          kind: "text",
          role: "user",
          author: "Anita Rao",
          text,
          ...(image ? { image } : {}),
        },
      },
    ])
    const projName =
      scope.type === "project" ? scope.project : currentProjectName
    const pid =
      projectInfoMap[projName]?.project_id || fallbackProjectId(projName)
    const projectForFlight =
      myProjects.find((p) => p.name === projName) || currentProject
    setRunning({
      key: `api-${Date.now()}`,
      kind: image ? "image" : "api",
      query: text,
      convId: scope.convId,
      role: projectForFlight?.dept === "Human Resources" ? "HR" : "ENGINEER",
      projectId: scope.type === "project" ? pid : "",
      chatId: scope.type === "project" && isBackendConv ? scope.convId : "",
      contributor: "Anita Rao",
      projectName: scope.type === "project" ? projName : "",
      ...(image ? { image } : {}),
    })
  }

  const finishFlight = (flight: Flight) => {
    setRunning(null)
    if (flight.kind === "demo") {
      setItems((prev) => [
        ...prev,
        { type: "pc", msg: { kind: "demo", role: "ai", qId: flight.qId } },
      ])
    } else {
      setItems((prev) => [...prev, { type: "generic", answer: flight.answer }])
    }
  }

  const pendingApprovals =
    scope.type === "project"
      ? convsByProjectName(scope.project).filter((c) =>
          c.messages.some((m) => m.kind === "text" && m.approval),
        ).length
      : 0

  const projectFileIds =
    scope.type === "project"
      ? projectConvs.flatMap((c) =>
          c.messages.flatMap((m) =>
            m.kind === "text" && m.files ? m.files : [],
          ),
        )
      : []

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-800">
            {scope.type === "personal" ? "Space:" : "Project:"}
          </span>
          <span className="text-sm font-semibold text-slate-900 truncate max-w-[220px]">
            {scope.type === "personal"
              ? "Personal Chats"
              : currentProject?.name}
          </span>
          {scope.type === "project" && (
            <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-amber-100 text-amber-800 border border-amber-200">
              🔒 {currentProject?.cls}
            </span>
          )}
          {scope.type === "project" && (
            <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-teal-50 text-teal-700 border border-teal-200">
              {projectConvs.length} CONVERSATIONS
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-slate-800 mr-2">
              {currentProject?.contributors?.length || 0} contributors
            </span>
            <div className="flex -space-x-2">
              {(currentProject?.contributors || []).slice(0, 3).map((c, i) => (
                <div
                  key={i}
                  title={c}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white border-2 border-white shadow-sm"
                  style={{
                    background: ["#0F766E", "#2563EB", "#7C3AED"][i % 3],
                  }}
                >
                  {c
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
              ))}
            </div>
          </div>
          <div className="h-6 w-px bg-slate-200 mx-1"></div>

          <button
            onClick={() => navigate("approvals")}
            className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
            title="Approvals"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect
                x="2"
                y="2"
                width="12"
                height="12"
                rx="1.5"
                stroke="#475569"
                strokeWidth="1.3"
              />
              <path
                d="M5 8l2 2 4-4"
                stroke="#475569"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            {pendingApprovals > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 text-xs font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white bg-amber-500 text-white"
                style={{ fontSize: 10 }}
              >
                {pendingApprovals}
              </span>
            )}
          </button>

          <button
            className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-slate-50 transition-colors ml-1"
            title="User Profile"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shadow-sm bg-teal-600 text-white">
              AR
            </div>
            <span className="text-sm font-medium pr-1 text-slate-900">
              Anita Rao
            </span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1"></div>
          <button
            className="text-xs px-3 py-1.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-sm"
            title="Export report"
          >
            Export
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel */}
        {!leftCollapsed ? (
          <div className="w-80 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col min-h-0 transition-all">
            {/* Section toggle */}
            <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex items-center gap-2">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100/80 border border-slate-200 flex-1">
                <button
                  onClick={() =>
                    setScope({
                      type: "project",
                      project: currentProjectName,
                      convId: "",
                    })
                  }
                  className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                    scope.type === "project"
                      ? "bg-white text-teal-700 shadow-sm"
                      : "text-slate-800 hover:text-slate-700"
                  }`}
                >
                  Project Chats
                </button>
                <button
                  onClick={() => switchPersonal(personalConvs[0]?.id ?? -1)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                    scope.type === "personal"
                      ? "bg-white text-teal-700 shadow-sm"
                      : "text-slate-800 hover:text-slate-700"
                  }`}
                >
                  Personal Chats
                </button>
              </div>
              <button
                onClick={() => setLeftCollapsed(true)}
                className="text-slate-900 hover:text-slate-700 transition-colors p-1.5 rounded-md hover:bg-slate-200 flex-shrink-0"
                title="Close chat history"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            </div>

            {scope.type === "personal" ? (
              <>
                <div className="p-4 border-b border-slate-100 relative">
                  <button
                    onClick={newPersonalChat}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                    title="Start a fresh personal chat"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    New Personal Chat
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1">
                  <div className="text-xs font-bold text-slate-900 tracking-wider uppercase px-2 mb-2 mt-1">
                    Personal Chats{" "}
                    <span className="text-slate-300 normal-case tracking-normal">
                      · private workspace
                    </span>
                  </div>
                  {[...tempPersonal, ...personalConvs].map((c) => {
                    const isActive =
                      scope.type === "personal" && scope.convId === c.id
                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => switchPersonal(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            switchPersonal(c.id)
                          }
                        }}
                        className={`group relative w-full flex flex-col items-start px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                          isActive
                            ? "bg-teal-50 border border-teal-200"
                            : "hover:bg-slate-50 border border-transparent"
                        }`}
                        title={`Load personal chat: ${c.title}`}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deletePersonalChat(c.id)
                          }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Delete chat"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                          </svg>
                        </button>
                        <span
                          className={`text-sm truncate w-full text-left pr-5 ${
                            isActive
                              ? "text-teal-900 font-semibold"
                              : "text-slate-700"
                          }`}
                        >
                          {titleFor(c)}{" "}
                          {c.temp && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-800 font-bold ml-1">
                              NEW
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-900 truncate w-full text-left mt-0.5">
                          {c.preview}
                        </span>
                        <span className="flex items-center gap-2 mt-1.5 w-full">
                          <span className="text-[10px] text-slate-900">
                            {c.time}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-teal-50 text-teal-700">
                            🔒 personal
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <select
                    value={
                      scope.type === "project"
                        ? scope.project
                        : currentProjectName
                    }
                    onChange={(e) => switchProject(e.target.value)}
                    className="text-sm font-medium text-slate-700 border border-slate-300 rounded-md px-2 py-1.5 outline-none bg-white cursor-pointer w-full truncate shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    title="Select Project"
                  >
                    {myProjects.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder="Search project chats or projects…"
                      className="w-full text-xs pl-8 pr-8 py-2 border border-slate-200 rounded-lg outline-none bg-white text-slate-700 placeholder-slate-400 focus:border-teal-400 focus:ring-1 focus:ring-teal-400/20 shadow-sm"
                    />
                    {projectSearch && (
                      <button
                        onClick={() => setProjectSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        title="Clear search"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {matchingProjects.length > 0 && projectSearch && (
                  <div className="px-4 pt-2 space-y-1">
                    {matchingProjects.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => {
                          switchProject(p.name)
                          setProjectSearch("")
                        }}
                        className="w-full text-left text-[11px] px-2 py-1.5 rounded-md bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 font-semibold"
                      >
                        Open project: {p.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="p-4 border-b border-slate-100 relative">
                  <button
                    onClick={() => {
                      setShowNewChatMenu(false)
                      newChat()
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                    title="Start a fresh project chat"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    New Project Chat
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
                  {ownerSections.length === 0 ? (
                    <div className="px-3 py-6 text-center">
                      <div className="text-xs text-slate-900">
                        {searchTerm
                          ? "No chats match your search."
                          : "No project chats yet."}
                      </div>
                      <div className="text-[11px] text-slate-900 mt-1">
                        {searchTerm
                          ? "Try a different term within this project."
                          : "Click “New Project Chat” to start one."}
                      </div>
                    </div>
                  ) : (
                    ownerSections.map(({ author, convs: sectionConvs }) => (
                      <div key={author}>
                        <div className="flex items-center gap-2 px-2 mb-1.5">
                          <div
                            title={author}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0"
                            style={{ background: avatarColor(author) }}
                          >
                            {initials(author)}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-700 truncate">
                            {author}
                          </span>
                          {author === "Anita Rao" && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-teal-50 text-teal-700 border border-teal-200">
                              YOU
                            </span>
                          )}
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-800">
                            {sectionConvs.length} chat
                            {sectionConvs.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {sectionConvs.map((c) => (
                            <button
                              key={c.id}
                              onClick={() =>
                                setScope({
                                  type: "project",
                                  project: currentProjectName,
                                  convId: c.id,
                                })
                              }
                              className={`w-full flex flex-col items-start px-3 py-2.5 rounded-lg transition-colors ${
                                scope.type === "project" &&
                                scope.convId === c.id
                                  ? "bg-teal-50 border border-teal-200"
                                  : "hover:bg-slate-50 border border-transparent"
                              }`}
                              title={`Load chat: ${c.title}`}
                            >
                              <span
                                className={`text-sm truncate w-full text-left ${
                                  scope.type === "project" &&
                                  scope.convId === c.id
                                    ? "text-teal-900 font-semibold"
                                    : "text-slate-700"
                                }`}
                              >
                                {titleFor(c)}
                              </span>
                              <span className="text-[11px] text-slate-900 truncate w-full text-left mt-0.5">
                                {c.preview}
                              </span>
                              <span className="flex items-center gap-2 mt-1.5 w-full">
                                <span className="text-[10px] text-slate-900">
                                  {c.time}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700">
                                  {c.messages.length} msgs
                                </span>
                                <span
                                  className="text-slate-400 hover:text-slate-700 transition-colors ml-auto p-0.5 rounded"
                                  title="Rename chat"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setRenameId(c.id)
                                    setRenameText(titleFor(c))
                                  }}
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                                  </svg>
                                </span>
                                <span
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-0.5 rounded"
                                  title="Delete chat"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    deleteConv(c.id)
                                  }}
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                  </svg>
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => setLeftCollapsed(false)}
            className="w-12 bg-white border-r border-slate-200 flex flex-col items-center justify-center text-slate-900 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            title="Open chat history"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            <span className="text-[9px] mt-2 uppercase tracking-wider">
              Chats
            </span>
          </button>
        )}

        {/* Center — Chat */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          <div
            ref={chatScrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-8 py-8 space-y-6"
          >
            {activeConv && scope.type === "project" && (
              <div className="flex-shrink-0">
                <div className="flex items-center gap-2">
                  {renameId === activeConv.id ? (
                    <input
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(activeConv.id)
                        if (e.key === "Escape") setRenameId(null)
                      }}
                      onBlur={() => saveRename(activeConv.id)}
                      className="text-xl font-semibold text-slate-900 border-b border-teal-400 outline-none w-[320px]"
                    />
                  ) : (
                    <div className="text-xl font-semibold text-slate-900">
                      {titleFor(activeConv)}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setRenameId(activeConv.id)
                      setRenameText(titleFor(activeConv))
                    }}
                    className="text-slate-400 hover:text-teal-700 transition-colors p-1 rounded-md hover:bg-teal-50"
                    title="Rename chat"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                    </svg>
                  </button>
                </div>
                <div className="text-xs text-slate-900 mt-0.5">
                  {activeConv.messages.length} messages · {activeConv.time}
                </div>
              </div>
            )}

            {items.map((item, idx) =>
              item.type === "generic" ? (
                <GenericAnswerCard key={"gen-" + idx} answer={item.answer} />
              ) : item.type === "sequence" ? (
                <StaticExecutionSequence
                  key={"seq-" + idx}
                  query={item.query}
                  plan={item.plan}
                  procLines={item.procLines}
                  stepsDone={item.stepsDone}
                />
              ) : item.type === "pc" ? (
                <ChatRow
                  key={idx}
                  msg={item.msg}
                  projectScope={scope.type === "project"}
                />
              ) : item.type === "coding" ? (
                <CodingProjectCard
                  key={"coding-" + idx}
                  coding={item.coding}
                  onOpen={() => openInCodingAgent(item.coding)}
                />
              ) : null,
            )}

            {running && (
              <ApiExecutionSequence
                key={running.key}
                query={running.query}
                role={running.role || "ENGINEER"}
                conversationId={String(running.convId ?? "")}
                projectId={running.projectId || ""}
                chatId={running.chatId || ""}
                contributor={running.contributor || ""}
                imageDemo={
                  running.kind === "image" && running.image
                    ? {
                        preview: running.image.preview,
                        name: running.image.name,
                        runId: running.key,
                      }
                    : null
                }
                onCodingRedirect={(coding) => {
                  if (!coding?.session_id) return
                  try {
                    localStorage.setItem("ca_active_session", coding.session_id)
                    localStorage.setItem(
                      "ca_active_project",
                      coding.project || "",
                    )
                  } catch {
                    /* non-browser env */
                  }
                  // Redirect as soon as the Coding Agent session + project are
                  // live, while the code is still being written.
                  navigate("coding-agent")
                }}
                onDone={(data) => {
                  if (data.error) {
                    setItems((prev) => [
                      ...prev,
                      {
                        type: "pc",
                        msg: {
                          kind: "text",
                          role: "ai",
                          author: "KNOVIA AI",
                          text: `Execution failed: ${data.error}`,
                        },
                      },
                    ])
                    setRunning(null)
                    return
                  }
                  // Image-demo flow: render ONLY the exact answer - no sources,
                  // findings, plan, charts, verdict or notices.
                  if (data.image_demo) {
                    const imageAnswer = {
                      id: "api_response",
                      title: running.query,
                      question: running.query,
                      keywords: [],
                      complexity: "image",
                      path: "image",
                      agent: "KNOVIA AI",
                      model: "KNOVIA-1 (Local)",
                      verdict: "Image Analysis",
                      answer: data.answer || "No response generated.",
                      findings: [],
                      plan: [],
                      steps: [],
                      proc_lines: [],
                      verified: [],
                      sources: [],
                      files: [],
                      charts: [],
                      analysis: undefined,
                      approval: undefined,
                      imageDemo: true,
                    }
                    setItems((prev) => [
                      ...prev,
                      {
                        type: "pc",
                        msg: {
                          kind: "demo",
                          role: "ai",
                          author: "KNOVIA AI",
                          qId: "api_response",
                          syntheticData: imageAnswer,
                        },
                      },
                    ])
                    setRunning(null)
                    return
                  }
                  const complexity = String(
                    data.plan?.complexity || "medium",
                  ).toLowerCase()
                  const planList = normalizePlanLocal(data)
                  const syntheticQuestion = {
                    id: "api_response",
                    title: running.query,
                    question: running.query,
                    keywords: [],
                    complexity,
                    path:
                      complexity === "complex"
                        ? "complex"
                        : complexity === "simple"
                          ? "fast"
                          : "knowledge",
                    agent: data.provider_label || "KNOVIA AI",
                    model: data.model || "KNOVIA-1 (Local)",
                    verdict: intentLabel(data.intent),
                    answer: data.answer || "No response generated.",
                    findings: data.findings || [],
                    plan: planList,
                    steps: data.steps || [],
                    proc_lines: data.proc_lines || [],
                    verified: ["Source Verified"],
                    sources: data.sources || [],
                    files: data.files || [],
                    charts: data.charts || [],
                    analysis: data.analysis || undefined,
                    approval: data.approval || undefined,
                  }
                  setItems((prev) => [
                    ...prev,
                    {
                      type: "pc",
                      msg: {
                        kind: "demo",
                        role: "ai",
                        author: "KNOVIA AI",
                        qId: "api_response",
                        syntheticData: syntheticQuestion,
                      },
                    },
                  ])
                  if (data.coding) {
                    setItems((prev) => [
                      ...prev,
                      { type: "coding", coding: data.coding },
                    ])
                  }
                  // Auto-redirect coding requests into the Coding Agent
                  // workspace. The persistent snapshot card above stays in the
                  // chat history so nothing is lost when the user comes back.
                  if (
                    data.coding?.session_id &&
                    data.action === "redirect_coding"
                  ) {
                    try {
                      localStorage.setItem(
                        "ca_active_session",
                        data.coding.session_id,
                      )
                    } catch {
                      /* non-browser env */
                    }
                    window.setTimeout(() => navigate("coding-agent"), 900)
                  }
                  if (running.projectName) {
                    loadProjectChats(running.projectName)
                  }
                  setRunning(null)
                }}
              />
            )}
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-6 pb-6 pt-2 bg-transparent">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all focus-within:shadow-md focus-within:border-teal-400">
              {attachedImage && (
                <div className="flex items-center gap-2 px-3 pt-3">
                  <div className="relative group">
                    <img
                      src={attachedImage.preview}
                      alt={attachedImage.name}
                      className="block h-16 w-24 object-cover rounded-lg border border-slate-200 shadow-sm"
                    />
                    <button
                      onClick={removeImage}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-red-600 hover:border-red-300 transition-colors"
                      title="Remove image"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-800 truncate">
                      {attachedImage.name}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="2"
                          stroke="currentColor"
                        />
                        <circle cx="9" cy="9" r="2" stroke="currentColor" />
                        <path d="M21 15l-5-5L5 21" stroke="currentColor" />
                      </svg>
                      Image attached — add a query to analyze the diagram
                    </div>
                    <button
                      onClick={removeImage}
                      className="text-[10px] font-semibold text-red-600 hover:text-red-700 hover:underline mt-0.5"
                    >
                      Remove image
                    </button>
                  </div>
                  <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200 flex-shrink-0">
                    Image mode
                  </span>
                </div>
              )}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={
                  scope.type === "personal"
                    ? "Ask anything in your private space..."
                    : "Ask, analyze, create, search, calculate or execute..."
                }
                rows={1}
                className="w-full px-4 py-3 text-sm outline-none resize-none text-slate-700 placeholder-slate-400 bg-transparent min-h-[44px]"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImagePick}
              />
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 border-t border-slate-100 relative">
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-900 flex items-center justify-center transition-colors shrink-0"
                  title="Attach options"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>

                <button
                  onClick={openImagePicker}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                    attachedImage
                      ? "bg-teal-100 text-teal-700 border border-teal-300"
                      : "bg-slate-200 hover:bg-slate-300 text-slate-900"
                  }`}
                  title={
                    attachedImage
                      ? "Replace image"
                      : "Attach an image (works offline, no data sent)"
                  }
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="2"
                      stroke="currentColor"
                    />
                    <circle cx="9" cy="9" r="2" stroke="currentColor" />
                    <path d="M21 15l-5-5L5 21" stroke="currentColor" />
                  </svg>
                </button>

                {scope.type === "project" && (
                  <div className="flex items-center p-0.5 ml-1 rounded-lg bg-slate-100/80 border border-slate-200 shrink-0">
                    {(["auto", "manual"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all capitalize ${
                          mode === m
                            ? "bg-white text-teal-700 shadow-sm"
                            : "text-slate-800 hover:text-slate-700"
                        }`}
                      >
                        {m === "auto" ? "● Auto" : "○ Manual"}
                      </button>
                    ))}
                  </div>
                )}
                {mode === "manual" && scope.type === "project" && (
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="text-[10px] border border-slate-300 rounded-lg px-2 py-1 outline-none bg-white text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-sm max-w-[130px] truncate shrink-0 ml-1"
                  >
                    {agents.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                )}

                <button
                  onClick={handleSend}
                  className={`ml-auto text-xs px-5 py-1.5 rounded-xl font-semibold transition-all shadow-sm ${
                    input.trim()
                      ? "bg-teal-600 text-white hover:bg-teal-700 hover:shadow"
                      : "bg-slate-200 text-slate-900 cursor-not-allowed"
                  }`}
                  title="Send message"
                >
                  Send
                </button>
              </div>
            </div>
            <div className="text-center mt-2">
              <span className="text-[9px] text-slate-900 font-medium tracking-wide">
                AI CAN MAKE MISTAKES. VERIFY IMPORTANT INFORMATION.
              </span>
            </div>
          </div>
        </div>

        {/* Right Panel — Context & Evidence */}
        {!rightCollapsed ? (
          <div className="w-80 bg-white border-l border-slate-200 flex-shrink-0 overflow-y-auto transition-all relative">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur z-10">
              <span className="text-xs font-bold text-slate-800 tracking-wider uppercase">
                Context & Evidence
              </span>
              <button
                onClick={() => setRightCollapsed(true)}
                className="text-slate-900 hover:text-slate-700 transition-colors p-1 rounded-md hover:bg-slate-100"
                title="Close right panel"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {scope.type === "personal" ? (
              <div className="p-5 space-y-4">
                <div
                  className="rounded-xl p-4"
                  style={{ background: "#FAF5FF", border: "1px solid #E9D5FF" }}
                >
                  <div className="text-sm font-semibold text-slate-800 mb-1">
                    Personal Context
                  </div>
                  <p className="text-xs text-slate-800 leading-relaxed">
                    Organizational knowledge is disabled. Personal chats use
                    general knowledge plus your saved workspace notes only.
                  </p>
                </div>
                <div className="text-xs text-slate-800 space-y-3">
                  {[
                    {
                      label: "Notes isolated",
                      value: "MRPL sources off",
                      icon: "◯",
                    },
                    {
                      label: "Retention",
                      value: "Per user setting",
                      icon: "◪",
                    },
                    {
                      label: "Audit scope",
                      value: "Personal access only",
                      icon: "◫",
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center border border-slate-100 text-purple-500">
                        <span className="text-lg">{item.icon}</span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">
                          {item.label}
                        </div>
                        <div className="text-xs text-slate-800">
                          {item.value}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-5 border-b border-slate-100 bg-slate-50/30">
                  <div className="text-sm font-semibold text-slate-800 mb-4">
                    Project Context
                  </div>
                  <div className="space-y-4">
                    {[
                      {
                        label: "Documents",
                        count: `${new Set(projectFileIds).size || currentProject?.artifacts} files`,
                        icon: "◧",
                        color: "text-blue-500",
                      },
                      {
                        label: "Knowledge",
                        count: "1.2K chunks",
                        icon: "◈",
                        color: "text-purple-500",
                      },
                      {
                        label: "Database",
                        count: "MRPL PostgreSQL",
                        icon: "⬡",
                        color: "text-teal-500",
                      },
                      {
                        label: "Conversations",
                        count: `${projectConvs.length} chats`,
                        icon: "◪",
                        color: "text-amber-500",
                      },
                      {
                        label: "Contributors",
                        count: `${currentProject?.contributors?.length || 0} active`,
                        icon: "◯",
                        color: "text-rose-500",
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center border border-slate-100 ${item.color}`}
                        >
                          <span className="text-lg">{item.icon}</span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">
                            {item.label}
                          </div>
                          <div className="text-xs text-slate-800">
                            {item.count}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-5 py-5 border-b border-slate-100">
                  <div className="text-sm font-semibold text-slate-800 mb-3">
                    Project Files
                  </div>
                  <div className="space-y-1.5">
                    {Array.from(new Set(projectFileIds)).map((fid, i) => {
                      const f = files.find((ff) => ff.id === fid)
                      if (!f) return null
                      return (
                        <button
                          key={fid}
                          onClick={() => setOpenFile(fid)}
                          className="w-full flex items-center gap-2 p-2 rounded-lg border hover:bg-teal-50/50 transition-colors text-left"
                          style={{ borderColor: "#E2E8F0" }}
                        >
                          <span className="text-sm">
                            {f.type === "PDF"
                              ? "📄"
                              : f.type === "DOCX"
                                ? "📝"
                                : f.type === "XLSX"
                                  ? "📊"
                                  : "📈"}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[12px] font-medium text-slate-700 truncate">
                              {f.name}
                            </span>
                          </span>
                          <DocTypeChip type={f.type} />
                        </button>
                      )
                    })}
                    {Array.from(new Set(projectFileIds)).length === 0 && (
                      <div className="text-xs text-slate-900 py-3 text-center">
                        No files referenced in this project yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-5 py-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-slate-800">
                      Documents Library
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                      14 ON FILE
                    </span>
                  </div>
                  <div className="text-xs text-slate-800 leading-relaxed">
                    This project references inspection reports, SOPs,
                    datasheets, vendor evaluations and turnaround schedules —
                    all openable from the chat cards or the Documents page.
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => setRightCollapsed(false)}
            className="w-12 bg-white border-l border-slate-200 flex flex-col items-center justify-center text-slate-900 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            title="Open Context & Evidence"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="text-[9px] mt-2 uppercase tracking-wider">
              Context
            </span>
          </button>
        )}
      </div>

      {openFile && (
        <DocumentViewer fileId={openFile} onClose={() => setOpenFile(null)} />
      )}
      {showAttachMenu && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 bg-white border border-slate-200 shadow-lg rounded-xl p-1.5 flex gap-1 z-20">
          {["Attach", "Voice", "Image", "Agent", "Tools", "Model"].map(
            (btn) => (
              <button
                key={btn}
                onClick={() =>
                  btn === "Image" ? openImagePicker() : setShowAttachMenu(false)
                }
                className="text-xs px-3 py-1.5 rounded-lg text-slate-900 hover:bg-slate-100 hover:text-slate-900 font-medium transition-colors"
                title={btn}
              >
                {btn}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function ChatRow({ msg, projectScope }: { msg: PcMsg projectScope: boolean }) {
  return (
    <div className="flex flex-col items-stretch">
      <ChatMessages messages={[msg]} />
    </div>
  )
}

function CodingProjectCard({
  coding,
  onOpen,
}: {
  coding: any
  onOpen: () => void
}) {
  const downloadUrl = coding.download_url
    ? `${API_BASE}${coding.download_url}`
    : coding.archive_file?.url
      ? `${API_BASE}${coding.archive_file.url}`
      : ""
  const lang = coding.language || "python"
  const files = coding.files || []
  return (
    <div
      className="flex max-w-full sm:max-w-none self-start rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm"
      style={{ minWidth: "min(92vw, 420px)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <FileCode2 className="w-4 h-4 text-indigo-600" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
            Coding Agent · Project Created
          </span>
        </div>
        <div
          className="text-sm font-semibold text-slate-900 truncate"
          title={coding.title || coding.project_name}
        >
          {coding.title || coding.project_name}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
            {lang}
          </span>
          <span className="text-[10px] text-slate-500">
            {files.length} file(s)
          </span>
          {coding.artifact_id && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-mono">
              {coding.artifact_id}
            </span>
          )}
        </div>
        {(coding.result_summary || "") !== "" && (
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            {coding.result_summary}
          </p>
        )}
        {files.length > 0 && (
          <div className="mt-3 space-y-1">
            {files.slice(0, 6).map((f: any) => (
              <div
                key={f.path}
                className="flex items-center gap-2 text-[11px] text-slate-700 bg-white/80 border border-slate-200 rounded-md px-2 py-1"
              >
                <span className="text-emerald-600 shrink-0">▸</span>
                <span className="font-mono truncate">{f.path}</span>
                <span className="ml-auto text-[10px] text-slate-400 shrink-0">
                  {f.size ?? f.content?.length ?? 0} B
                </span>
              </div>
            ))}
            {files.length > 6 && (
              <div className="text-[10px] text-slate-400 pl-1">
                +{files.length - 6} more file(s)
              </div>
            )}
          </div>
        )}
        {(coding.run_output ||
          (coding.run_ok !== undefined &&
            coding.run_ok !== null &&
            coding.run_output !== undefined)) && (
          <div className="mt-3 rounded-md bg-slate-900 text-emerald-300 font-mono text-[10px] leading-relaxed p-2.5 overflow-x-auto max-h-40 overflow-y-auto">
            {coding.run_ok ? (
              <>
                <span className="text-teal-300 font-semibold">
                  ✓ Verified output
                </span>{" "}
                <span className="text-slate-400">({coding.run_command})</span>
              </>
            ) : (
              <span className="text-rose-300 font-semibold">
                Run reported an error
              </span>
            )}
            {(coding.run_output || "")
              .split("\n")
              .slice(0, 24)
              .map((l: string, i: number) => (
                <div key={i}>{l}</div>
              ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-4">
          {downloadUrl && (
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
              title="Download project archive"
            >
              <Download className="w-3.5 h-3.5" /> Download ZIP
            </a>
          )}
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 transition-colors"
            title="Open the generated project in the Coding Agent workspace"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open in Coding Agent
          </button>
        </div>
        {coding.folder_path && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
            <FolderArchive className="w-3.5 h-3.5" />
            <span className="font-mono truncate">{coding.folder_path}</span>
          </div>
        )}
      </div>
    </div>
  )
}
