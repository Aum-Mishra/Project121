import { useState } from "react"
import { NavContext, Page, Project } from "./context/NavContext"
import SecurityWatermarkOverlay from "./components/SecurityWatermarkOverlay"
import { Role, hasAccess } from "./data/roles"
import Sidebar from "./components/Sidebar"
import Header from "./components/Header"

import Dashboard from "./pages/Dashboard"
import Workbench from "./pages/Workbench"
import Login from "./pages/Login"
import Projects from "./pages/Projects"
import ProjectDetail from "./pages/ProjectDetail"
import Tasks from "./pages/Tasks"
import Artifacts from "./pages/Artifacts"
import Approvals from "./pages/Approvals"
import KnowledgeBase from "./pages/KnowledgeBase"
import Documents from "./pages/Documents"
import ResearchNotebooks from "./pages/ResearchNotebooks"
import Notes from "./pages/Notes"
import Agents from "./pages/Agents"
import ModelRouter from "./pages/ModelRouter"
import Models from "./pages/Models"
import ToolRegistry from "./pages/ToolRegistry"
import OfflinePlugins from "./pages/OfflinePlugins"
import CodingWorkspace from "./pages/CodingWorkspace"
import CodingAgent from "./pages/CodingAgent"
import Sandbox from "./pages/Sandbox"
import EngineeringAnalysis from "./pages/EngineeringAnalysis"
import EngineeringDrawings from "./pages/EngineeringDrawings"
import MultimodalWorkspace from "./pages/MultimodalWorkspace"
import PersonalChat from "./pages/PersonalChat"
import SecurityCenter from "./pages/SecurityCenter"
import RBAC from "./pages/RBAC"
import AuditTrail from "./pages/AuditTrail"
import SystemHealth from "./pages/SystemHealth"
import GPU from "./pages/GPU"
import NetworkSecurity from "./pages/NetworkSecurity"
import HelpCenter from "./pages/HelpCenter"
import Settings from "./pages/Settings"
import AccessRestricted from "./pages/AccessRestricted"
import Profile from "./pages/Profile"

const pageLabels: Record<Page, string> = {
  dashboard: "Dashboard",
  workbench: "Workbench",
  projects: "Projects",
  "project-detail": "Project Detail",
  tasks: "Tasks",
  artifacts: "Artifacts",
  approvals: "Approvals",
  "knowledge-base": "Knowledge Base",
  documents: "Documents",
  collections: "Collections",
  "research-notebooks": "Research Notebooks",
  notes: "Notes",
  agents: "Agents",
  "model-router": "Model Router",
  models: "Models",
  "tool-registry": "Tool Registry",
  "offline-plugins": "Offline Plugins",
  "coding-workspace": "Coding Workspace",
  "coding-agent": "Coding Agent",
  sandbox: "Sandbox",
  "engineering-analysis": "Engineering Analysis",
  "engineering-drawings": "Engineering Drawings",
  multimodal: "Multimodal AI",
  collaboration: "Collaboration",
  "personal-chat": "Personal Chat",
  "security-center": "Security Center",
  rbac: "RBAC & Access",
  "audit-trail": "Audit Trail",
  "system-health": "System Health",
  "gpu-compute": "GPU / Compute",
  "network-security": "Network Security",
  settings: "Settings",
  "help-center": "Help Center",
  profile: "Profile",
}

function PageContent({ page, role }: { page: Page role: Role }) {
  if (!hasAccess(role, page)) {
    return <AccessRestricted pageLabel={pageLabels[page] ?? page} />
  }
  switch (page) {
    case "dashboard":
      return <Dashboard />
    case "workbench":
      return <Workbench />
    case "projects":
      return <Projects />
    case "project-detail":
      return <ProjectDetail />
    case "tasks":
      return <Tasks />
    case "artifacts":
      return <Artifacts />
    case "approvals":
      return <Approvals />
    case "knowledge-base":
      return <KnowledgeBase />
    case "documents":
      return <Documents />
    case "collections":
      return <KnowledgeBase />
    case "research-notebooks":
      return <ResearchNotebooks />
    case "notes":
      return <Notes />
    case "agents":
      return <Agents />
    case "model-router":
      return <ModelRouter />
    case "models":
      return <Models />
    case "tool-registry":
      return <ToolRegistry />
    case "offline-plugins":
      return <OfflinePlugins />
    case "coding-workspace":
      return <CodingWorkspace />
    case "coding-agent":
      return <CodingAgent />
    case "sandbox":
      return <Sandbox />
    case "engineering-analysis":
      return <EngineeringAnalysis />
    case "engineering-drawings":
      return <EngineeringDrawings />
    case "multimodal":
      return <MultimodalWorkspace />
    case "collaboration":
      return <PersonalChat />
    case "personal-chat":
      return <PersonalChat />
    case "security-center":
      return <SecurityCenter />
    case "rbac":
      return <RBAC />
    case "audit-trail":
      return <AuditTrail />
    case "system-health":
      return <SystemHealth />
    case "gpu-compute":
      return <GPU />
    case "network-security":
      return <NetworkSecurity />
    case "help-center":
      return <HelpCenter />
    case "settings":
      return <Settings />
    case "profile":
      return <Profile />
    default:
      return <Dashboard />
  }
}

const initialProjects: Project[] = [
  {
    name: "CDU-4 Inspection Analysis",
    owner: "Anita Rao",
    dept: "Process Engineering",
    status: "Active",
    progress: 72,
    tasks: 14,
    artifacts: 3,
    cls: "CONFIDENTIAL",
    agents: ["Engineering Agent", "HSE Agent"],
    updated: "16 Sep 2026",
    contributors: ["Anita Rao", "Rajesh Kumar"],
  },
  {
    name: "P-102 Pump Maintenance Study",
    owner: "Rajesh Kumar",
    dept: "Inspection Engineering",
    status: "Active",
    progress: 45,
    tasks: 9,
    artifacts: 1,
    cls: "CONFIDENTIAL",
    agents: ["HSE/Inspection Agent"],
    updated: "15 Sep 2026",
    contributors: ["Rajesh Kumar"],
  },
  {
    name: "Vendor Technical Evaluation — CX-4",
    owner: "Priya Nair",
    dept: "Procurement",
    status: "Completed",
    progress: 100,
    tasks: 12,
    artifacts: 5,
    cls: "INTERNAL",
    agents: ["Research Agent", "Document Agent"],
    updated: "14 Sep 2026",
    contributors: ["Priya Nair", "Suresh Bhat"],
  },
  {
    name: "Reformer Unit Optimization",
    owner: "Suresh Bhat",
    dept: "Process Engineering",
    status: "Active",
    progress: 33,
    tasks: 6,
    artifacts: 0,
    cls: "CONFIDENTIAL",
    agents: ["Data Analysis Agent", "Engineering Agent"],
    updated: "16 Sep 2026",
    contributors: ["Suresh Bhat"],
  },
  {
    name: "Pipeline Anomaly Investigation",
    owner: "Meena Shetty",
    dept: "HSE",
    status: "Pending Approval",
    progress: 88,
    tasks: 11,
    artifacts: 2,
    cls: "RESTRICTED",
    agents: ["HSE Agent", "Document Agent"],
    updated: "12 Sep 2026",
    contributors: ["Meena Shetty"],
  },
  {
    name: "Annual Turnaround Planning 2027",
    owner: "Arvind Rao",
    dept: "Maintenance",
    status: "Planning",
    progress: 12,
    tasks: 3,
    artifacts: 0,
    cls: "INTERNAL",
    agents: [],
    updated: "10 Sep 2026",
    contributors: ["Arvind Rao"],
  },
  {
    name: "HR Training & Onboarding",
    owner: "Priya Nair",
    dept: "Human Resources",
    status: "Active",
    progress: 64,
    tasks: 8,
    artifacts: 2,
    cls: "INTERNAL",
    agents: ["HR Agent"],
    updated: "16 Sep 2026",
    contributors: ["Priya Nair"],
    scope: "hr",
  },
  {
    name: "Employee Performance Review",
    owner: "Sunita Sharma",
    dept: "Human Resources",
    status: "Active",
    progress: 40,
    tasks: 5,
    artifacts: 1,
    cls: "RESTRICTED",
    agents: ["HR Agent"],
    updated: "15 Sep 2026",
    contributors: ["Sunita Sharma"],
    scope: "hr",
  },
]

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [role, setRoleState] = useState<Role>("admin")
  const [currentPage, setCurrentPage] = useState<Page>("dashboard")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [pendingSandboxTask, setPendingSandboxTask] = useState<string | null>(
    null,
  )
  const [currentProjectName, setCurrentProjectName] = useState<string>(
    initialProjects[1]?.name || "P-102 Pump Maintenance Study",
  )

  const setRole = (r: Role | ((prev: Role) => Role)) => {
    if (typeof r === "function") {
      setRoleState((prev) => {
        const next = r(prev)
        try {
          localStorage.setItem("sw_role", next)
        } catch {
          /* ok */
        }
        return next
      })
      return
    }
    setRoleState(r)
    try {
      localStorage.setItem("sw_role", r)
    } catch {
      /* ok */
    }
  }

  const updateProject = (name: string, updates: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => (p.name === name ? { ...p, ...updates } : p)),
    )
  }

  // Full-width pages that manage their own layout
  const fullHeightPages: Page[] = [
    "workbench",
    "coding-agent",
    "sandbox",
    "personal-chat",
    "research-notebooks",
    "notes",
    "project-detail",
  ]
  const isFullHeight = fullHeightPages.includes(currentPage)

  if (!isAuthenticated) {
    return (
      <Login
        onLogin={(r) => {
          setRole(r)
          setIsAuthenticated(true)
        }}
      />
    )
  }

  return (
    <NavContext.Provider
      value={{
        currentPage,
        navigate: setCurrentPage,
        role,
        setRole,
        projects,
        updateProject,
        pendingSandboxTask,
        setPendingSandboxTask,
        currentProjectName,
        setCurrentProjectName,
      }}
    >
      <div
        className="flex h-screen overflow-hidden"
        style={{ background: "var(--color-bg)" }}
      >
        {/* Global security watermark above every page (sidebar, header, all screens) */}
        <SecurityWatermarkOverlay />
        {/* Sidebar */}
        <div
          onMouseEnter={() => setSidebarCollapsed(false)}
          onMouseLeave={() => setSidebarCollapsed(true)}
          className="h-full z-20 flex-shrink-0"
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((v) => !v)}
          />
        </div>

        {/* Main */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Header */}
          {currentPage !== "workbench" && currentPage !== "coding-agent" && (
            <Header />
          )}

          {/* Page content */}
          <div
            className={`flex-1 overflow-hidden ${
              isFullHeight ? "flex flex-col" : "overflow-y-auto"
            }`}
          >
            <PageContent page={currentPage} role={role} />
          </div>
        </div>
      </div>
    </NavContext.Provider>
  )
}
