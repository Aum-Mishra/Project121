import type { Page } from "../context/NavContext"

export type Role = "admin" | "engineer" | "hr"

export type RolePersona = {
  id: Role
  label: string
  name: string
  initials: string
  title: string
  dept: string
  color: string
  colorBg: string
  borderColor: string
  description: string
}

export const personas: RolePersona[] = [
  {
    id: "admin",
    label: "Admin",
    name: "Anita Rao",
    initials: "AR",
    title: "Platform Administrator",
    dept: "Enterprise IT",
    color: "#7C3AED",
    colorBg: "#F5F3FF",
    borderColor: "#DDD6FE",
    description: "Full access — uploads, admin controls, RBAC, all projects",
  },
  {
    id: "engineer",
    label: "Engineer",
    name: "Rajesh Kumar",
    initials: "RK",
    title: "Inspection Engineer",
    dept: "Inspection Engineering",
    color: "#0D9488",
    colorBg: "#F0FDFA",
    borderColor: "#99F6E4",
    description:
      "Engineering features, analysis, reports — no uploads or admin",
  },
  {
    id: "hr",
    label: "HR",
    name: "Priya Nair",
    initials: "PN",
    title: "HR Business Partner",
    dept: "Human Resources",
    color: "#D97706",
    colorBg: "#FFFBEB",
    borderColor: "#FDE68A",
    description:
      "HR dashboard, training, employee records — no engineering content",
  },
]

const adminPages: Page[] = [
  "dashboard",
  "workbench",
  "projects",
  "project-detail",
  "tasks",
  "artifacts",
  "approvals",
  "knowledge-base",
  "documents",
  "collections",
  "research-notebooks",
  "notes",
  "agents",
  "model-router",
  "models",
  "tool-registry",
  "offline-plugins",
  "coding-workspace",
  "coding-agent",
  "sandbox",
  "engineering-analysis",
  "engineering-drawings",
  "multimodal",
  "collaboration",
  "personal-chat",
  "security-center",
  "rbac",
  "audit-trail",
  "system-health",
  "gpu-compute",
  "network-security",
  "settings",
  "help-center",
  "profile",
]

const engineerPages: Page[] = [
  "dashboard",
  "workbench",
  "projects",
  "project-detail",
  "tasks",
  "artifacts",
  "approvals",
  "knowledge-base",
  "documents",
  "collections",
  "research-notebooks",
  "notes",
  "agents",
  "coding-workspace",
  "coding-agent",
  "sandbox",
  "engineering-analysis",
  "engineering-drawings",
  "multimodal",
  "collaboration",
  "personal-chat",
  "help-center",
  "profile",
]

const hrPages: Page[] = [
  "dashboard",
  "workbench",
  "projects",
  "project-detail",
  "tasks",
  "approvals",
  "knowledge-base",
  "documents",
  "notes",
  "collaboration",
  "personal-chat",
  "help-center",
  "profile",
]

export const allowedPages: Record<Role, Page[]> = {
  admin: adminPages,
  engineer: engineerPages,
  hr: hrPages,
}

export const hasAccess = (role: Role, page: Page): boolean =>
  allowedPages[role].includes(page)

export const engineeringProjectNames = [
  "CDU-4 Inspection Analysis",
  "P-102 Pump Maintenance Study",
  "Vendor Technical Evaluation — CX-4",
  "Reformer Unit Optimization",
  "Pipeline Anomaly Investigation",
  "Annual Turnaround Planning 2027",
]

export const hrProjectNames = [
  "HR Training & Onboarding",
  "Employee Performance Review",
]

const HR_NAME_PATTERN = /hr|training|onboarding|employee|performance/i

export const isEngineeringProject = (name: string): boolean =>
  engineeringProjectNames.includes(name) || !HR_NAME_PATTERN.test(name)

export const isHRProject = (name: string): boolean =>
  hrProjectNames.includes(name) || HR_NAME_PATTERN.test(name)

export const filterProjectsForRole = <T extends { name: string },>(
  projects: T[],
  role: Role,
): T[] => {
  if (role === "admin") return projects
  if (role === "engineer")
    return projects.filter((p) => isEngineeringProject(p.name))
  return projects.filter((p) => isHRProject(p.name))
}

// ---- role-safe additive aliases (data only, no page edits) ----
export const isHRDoc = (id: string): boolean =>
  isHRProject(id) || id.startsWith("hr-")
export const isEngineeringPage = (page: string): boolean =>
  engineeringProjectNames.includes(page)
