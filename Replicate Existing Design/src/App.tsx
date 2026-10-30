import { useState, useEffect, Component, ReactNode } from "react";
import { PanelRight } from "lucide-react";

import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import RightPanel from "./components/RightPanel";
import CommandPalette from "./components/CommandPalette";
import ModelDrawer from "./components/ModelDrawer";

import LoginScreen from "./screens/LoginScreen";
import ChatScreen from "./screens/ChatScreen";
import ProjectsScreen from "./screens/ProjectsScreen";
import ProjectDetailScreen from "./screens/ProjectDetailScreen";
import TasksScreen from "./screens/TasksScreen";
import ArtifactsScreen from "./screens/ArtifactsScreen";
import ApprovalsScreen from "./screens/ApprovalsScreen";
import KnowledgeScreen from "./screens/KnowledgeScreen";
import ModelsScreen from "./screens/ModelsScreen";
import SecurityScreen from "./screens/SecurityScreen";
import FilesScreen from "./screens/FilesScreen";
import CodingAgentScreen from "./screens/CodingAgentScreen";
import DocumentViewerScreen from "./screens/DocumentViewerScreen";
import ProfileScreen from "./screens/ProfileScreen";
import ErrorStateScreen from "./screens/ErrorStateScreen";
import { Document, Project } from "./services/api";

type View =
  | "chat"
  | "projects"
  | "project-detail"
  | "files"
  | "document-viewer"
  | "knowledge"
  | "tasks"
  | "artifacts"
  | "approvals"
  | "models"
  | "security"
  | "coding-agent"
  | "profile"
  | "error-state";

const sidebarViews = new Set<View>(["chat", "projects", "files", "knowledge", "tasks", "artifacts", "approvals", "models", "security", "coding-agent"]);

type SidebarView = "chat" | "projects" | "files" | "knowledge" | "tasks" | "artifacts" | "approvals" | "models" | "security" | "coding-agent";

function isSidebarView(v: View): v is SidebarView {
  return sidebarViews.has(v as SidebarView);
}

function hasSession(): boolean {
  try {
    return !!localStorage.getItem("sovereign_token");
  } catch {
    return false;
  }
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state: { hasError: boolean; message: string } = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || "Unknown error" };
  }

  componentDidCatch(error: Error) {
    console.error("App render error:", error);
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-[#080D18] text-[#F5F7FA]">
          <div className="max-w-md w-full px-6 text-center">
            <h1 className="text-[22px] font-semibold mb-2">Something went wrong</h1>
            <p className="text-[12.5px] text-[#9AA6B5] mb-4 leading-relaxed break-words">
              {this.state.message || "The interface hit an unexpected error."}
            </p>
            <button
              onClick={this.handleReload}
              className="h-10 px-5 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-[13px] font-semibold transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean>(() => hasSession());
  const [view, setView] = useState<View>("chat");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [modelDrawerOpen, setModelDrawerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
        setModelDrawerOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  const showRightPanel = view === "chat" && rightPanelOpen;
  const sidebarActive: SidebarView = isSidebarView(view)
    ? view
    : view === "project-detail" ? "projects"
    : view === "document-viewer" ? "files"
    : "chat";

  function renderScreen() {
    switch (view) {
      case "chat":
        return <ChatScreen onOpenModelDrawer={() => setModelDrawerOpen(true)} onNavigate={(v) => setView(v as View)} />;
      case "projects":
        return <ProjectsScreen onSelectProject={(p) => { setSelectedProject(p); setView("project-detail"); }} />;
      case "project-detail":
        return <ProjectDetailScreen project={selectedProject} onBack={() => setView("projects")} />;
      case "files":
        return <FilesScreen onSelectFile={(doc) => { setSelectedDoc(doc); setView("document-viewer"); }} />;
      case "document-viewer":
        return <DocumentViewerScreen document={selectedDoc} onBack={() => setView("files")} onAskAI={() => setView("chat")} />;
      case "knowledge":
        return <KnowledgeScreen />;
      case "tasks":
        return <TasksScreen />;
      case "artifacts":
        return <ArtifactsScreen />;
      case "approvals":
        return <ApprovalsScreen />;
      case "models":
        return <ModelsScreen />;
      case "security":
        return <SecurityScreen />;
      case "coding-agent":
        return <CodingAgentScreen />;
      case "profile":
        return <ProfileScreen onBack={() => setView("chat")}/>;
      case "error-state":
        return <ErrorStateScreen onBack={() => setView("chat")}/>;
      default:
        return null;
    }
  }

  return (
    <AppErrorBoundary>
      <div className="h-full flex overflow-hidden bg-[#080D18] text-[#F5F7FA]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <Sidebar currentView={sidebarActive} onNavigate={(v) => setView(v)} onProfile={() => setView("profile")}/>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top bar row */}
          <div className="flex-none flex items-stretch border-b border-[#253248]">
            <div className="flex-1 min-w-0">
              <TopBar
                view={sidebarActive}
                onCommandPalette={() => setCommandPaletteOpen(true)}
                onSecurityClick={() => setView("security")}
              />
            </div>

            {/* Right panel toggle — only on chat */}
            {view === "chat" && (
              <div className="flex-none flex items-center px-2 bg-[#0F1726]">
                <button
                  onClick={() => setRightPanelOpen(!rightPanelOpen)}
                  title={rightPanelOpen ? "Hide context panel" : "Show context panel"}
                  className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                    rightPanelOpen
                      ? "bg-[#8B5CF6]/15 text-[#8B5CF6]"
                      : "text-[#667386] hover:text-[#9AA6B5] hover:bg-[#141E2F]"
                  }`}
                >
                  <PanelRight size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <main className="flex-1 min-w-0 overflow-hidden">
              {renderScreen()}
            </main>
            {showRightPanel && <RightPanel onClose={() => setRightPanelOpen(false)} />}
          </div>
        </div>

        {/* Global overlays */}
        {modelDrawerOpen && <ModelDrawer onClose={() => setModelDrawerOpen(false)} />}
        {commandPaletteOpen && (
          <CommandPalette
            onClose={() => setCommandPaletteOpen(false)}
            onNavigate={(v) => { setView(v); setCommandPaletteOpen(false); }}
          />
        )}
      </div>
    </AppErrorBoundary>
  );
}
