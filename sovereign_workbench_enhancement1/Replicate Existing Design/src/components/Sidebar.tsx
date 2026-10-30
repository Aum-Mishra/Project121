import { useState, useEffect } from "react";
import { MessageSquare, FolderOpen, Files, BookOpen, CheckSquare, Package, ClipboardCheck, Cpu, ShieldCheck, Zap, ChevronRight, FileSearch, Activity } from "lucide-react";
import { api } from "../services/api";

type View = "chat" | "projects" | "files" | "knowledge" | "tasks" | "artifacts" | "approvals" | "models" | "security" | "audit" | "system-health";

interface SidebarProps {
  currentView: View;
  onNavigate: (v: View) => void;
  onProfile?: () => void;
}

const NAV: { label: string; items: { id: View; name: string; Icon: React.ElementType; badge?: number }[] }[] = [
  {
    label: "OVERVIEW",
    items: [
      { id: "chat",      name: "Workbench", Icon: MessageSquare },
      { id: "projects",  name: "Projects",  Icon: FolderOpen },
      { id: "files",     name: "Documents", Icon: Files },
      { id: "knowledge", name: "Knowledge", Icon: BookOpen },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { id: "tasks",     name: "Tasks",     Icon: CheckSquare, badge: 2 },
      { id: "artifacts", name: "Artifacts", Icon: Package },
      { id: "approvals", name: "Approvals", Icon: ClipboardCheck, badge: 1 },
      { id: "models",    name: "Models",    Icon: Cpu },
    ],
  },
  {
    label: "GOVERNANCE & OPS",
    items: [
      { id: "security",      name: "Security",      Icon: ShieldCheck },
      { id: "audit",         name: "Audit Trail",   Icon: FileSearch },
      { id: "system-health", name: "System Health", Icon: Activity },
    ],
  },
];

export default function Sidebar({ currentView, onNavigate, onProfile }: SidebarProps) {
  const [pendingApprovals, setPendingApprovals] = useState<number>(11);

  useEffect(() => {
    let active = true;
    api.approvals.list().then((res) => {
      if (active && res?.approvals) {
        const count = res.approvals.filter((a: any) =>
          !(a.status || "").toLowerCase().includes("approv") &&
          !(a.status || "").toLowerCase().includes("reject")
        ).length;
        setPendingApprovals(count);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [currentView]);

  return (
    <aside className="w-[240px] flex-none h-full flex flex-col bg-[#0F1726] border-r border-[#253248] select-none">

      {/* ── Logo ── */}
      <div className="px-4 py-4 border-b border-[#1a2740]">
        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="w-7 h-7 rounded-[6px] bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] flex items-center justify-center shadow-sm flex-none">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L2 4v6l5 3 5-3V4L7 1z" stroke="white" strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
              <path d="M7 1v12M2 4l5 3 5-3" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.15em] text-[#F5F7FA] leading-none">SOVEREIGN AI</div>
            <div className="text-[8.5px] font-medium tracking-[0.2em] text-[#667386] mt-0.5">WORKBENCH</div>
          </div>
        </div>

        {/* Company context */}
        <div className="rounded-[6px] bg-[#0A1220] border border-[#1a2740] px-2.5 py-2">
          <div className="flex items-start gap-1.5">
            <span className="mt-[3px] w-1.5 h-1.5 rounded-full bg-[#14B8A6] flex-none animate-pulse-dot"/>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#F5F7FA] truncate">ApexPetro Energy Ltd.</p>
              <p className="text-[10px] text-[#667386]">Jamnagar Refinery</p>
              <p className="text-[9px] text-[#14B8A6] font-medium mt-0.5 tracking-wide">● Local Environment</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV.map(({ label, items }) => (
          <div key={label}>
            <p className="px-2 mb-1 text-[9px] font-semibold tracking-[0.15em] text-[#3a4a60]">{label}</p>
            {items.map(({ id, name, Icon, badge }) => {
              const active = currentView === id;
              const displayBadge = id === "approvals" ? pendingApprovals : badge;
              return (
                <button
                  key={id}
                  onClick={() => onNavigate(id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-[6px] text-[12.5px] transition-colors relative ${
                    active
                      ? "bg-[#8B5CF6]/12 text-[#8B5CF6] font-medium"
                      : "text-[#9AA6B5] hover:bg-[#141E2F] hover:text-[#F5F7FA]"
                  }`}
                >
                  {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-[#8B5CF6] rounded-r-sm"/>}
                  <Icon size={14} className="flex-none" strokeWidth={active ? 2 : 1.6}/>
                  <span className="flex-1 text-left">{name}</span>
                  {displayBadge !== undefined && displayBadge > 0 && (
                    <span className="text-[9px] font-semibold bg-[#8B5CF6]/15 text-[#8B5CF6] rounded-full px-[5px] py-px leading-none">{displayBadge}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── GPU status ── */}
      <div className="px-3 pb-2">
        <div className="rounded-[6px] bg-[#0A1220] border border-[#1a2740] px-3 py-2.5 mb-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Zap size={10} className="text-[#8B5CF6]"/>
              <span className="text-[9px] font-semibold text-[#667386] tracking-wide">GPU</span>
            </div>
            <span className="text-[9px] text-[#14B8A6] font-medium">● Local Only</span>
          </div>
          <p className="text-[11px] font-medium text-[#F5F7FA] mb-1.5">NVIDIA GTX 1660 Ti</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[3px] bg-[#253248] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#14B8A6] rounded-full" style={{ width: "100%" }}/>
            </div>
            <span className="text-[9.5px] font-mono text-[#9AA6B5] flex-none">6 GB</span>
          </div>
        </div>
      </div>

      {/* ── User ── */}
      <button
        onClick={onProfile}
        className="flex items-center gap-2.5 px-3 pb-4 pt-2 border-t border-[#1a2740] hover:bg-[#141E2F] transition-colors w-full text-left"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] flex items-center justify-center text-white text-[10px] font-semibold flex-none">AM</div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-[#F5F7FA] truncate">Arjun Mehta</p>
          <p className="text-[10px] text-[#667386] truncate">Inspection Engineer</p>
        </div>
        <ChevronRight size={11} className="text-[#3a4a60] flex-none"/>
      </button>
    </aside>
  );
}
