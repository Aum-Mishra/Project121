import { createContext, useContext } from "react";
import type { Role } from "../data/roles";

export type Page =
  | "dashboard"
  | "workbench"
  | "projects"
  | "project-detail"
  | "tasks"
  | "artifacts"
  | "approvals"
  | "knowledge-base"
  | "documents"
  | "collections"
  | "research-notebooks"
  | "notes"
  | "agents"
  | "model-router"
  | "models"
  | "tool-registry"
  | "offline-plugins"
  | "coding-workspace"
  | "coding-agent"
  | "sandbox"
  | "engineering-analysis"
  | "engineering-drawings"
  | "collaboration"
  | "personal-chat"
  | "security-center"
  | "rbac"
  | "audit-trail"
  | "system-health"
  | "gpu-compute"
  | "network-security"
  | "settings"
  | "help-center"
  | "multimodal"
  | "profile";

export type Project = {
  name: string;
  owner: string;
  dept: string;
  status: string;
  progress: number;
  tasks: number;
  artifacts: number;
  cls: string;
  agents: string[];
  updated: string;
  contributors: string[];
  scope?: "engineering" | "hr";
};

export type NavContextType = {
  currentPage: Page;
  navigate: (page: Page) => void;
  role: Role;
  setRole: (role: Role) => void;
  projects: Project[];
  updateProject: (name: string, updates: Partial<Project>) => void;
  pendingSandboxTask: string | null;
  setPendingSandboxTask: (t: string | null) => void;
  currentProjectName: string;
  setCurrentProjectName: (name: string) => void;
};

export const NavContext = createContext<NavContextType>({
  currentPage: "dashboard",
  navigate: () => {},
  role: "admin",
  setRole: () => {},
  projects: [],
  updateProject: () => {},
  pendingSandboxTask: null,
  setPendingSandboxTask: () => {},
  currentProjectName: "P-102 Pump Maintenance Study",
  setCurrentProjectName: () => {},
});

export const useNav = () => useContext(NavContext);