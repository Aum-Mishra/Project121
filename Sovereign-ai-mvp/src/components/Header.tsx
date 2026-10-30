import { useState } from "react";
import { useNav, Page } from "../context/NavContext";
import { personas } from "../data/roles";

const pageTitles: Record<Page, string[]> = {
  dashboard: ["Home", "Dashboard"],
  workbench: ["Home", "Workbench"],
  projects: ["Work", "Projects"],
  "project-detail": ["Work", "Projects", "CDU-4 Inspection Analysis"],
  tasks: ["Work", "Tasks"],
  artifacts: ["Work", "Artifacts"],
  approvals: ["Work", "Approvals"],
  "knowledge-base": ["Knowledge", "Knowledge Base"],
  documents: ["Knowledge", "Documents"],
  collections: ["Knowledge", "Collections"],
  "research-notebooks": ["Knowledge", "Research Notebooks"],
  notes: ["Knowledge", "Notes"],
  agents: ["AI", "Agents"],
  "model-router": ["AI", "Model Router"],
  models: ["AI", "Models"],
  "tool-registry": ["AI", "Tool Registry"],
  "offline-plugins": ["AI", "Offline Plugins"],
  "coding-workspace": ["Development", "Coding Workspace"],
  "coding-agent": ["Development", "Coding Agent"],
  sandbox: ["Development", "Sandbox"],
  "engineering-analysis": ["Engineering", "Engineering Analysis"],
  "engineering-drawings": ["Engineering", "Engineering Drawings"],
  multimodal: ["Engineering", "Multimodal AI"],
  collaboration: ["Collaboration", "Shared Projects"],
  "personal-chat": ["Collaboration", "Personal Chat"],
  "security-center": ["Security & Ops", "Security Center"],
  rbac: ["Security & Ops", "RBAC & Access"],
  "audit-trail": ["Security & Ops", "Audit Trail"],
  "system-health": ["Security & Ops", "System Health"],
  "gpu-compute": ["Security & Ops", "GPU / Compute"],
  "network-security": ["Security & Ops", "Network Security"],
  settings: ["System", "Settings"],
  "help-center": ["System", "Help Center"],
  profile: ["System", "Profile"],
};

export default function Header() {
  const { currentPage, navigate, role, setRole } = useNav();
  const crumbs = pageTitles[currentPage] || ["Home"];
  const persona = personas.find((p) => p.id === role) ?? personas[0];
  const [showSwitcher, setShowSwitcher] = useState(false);

  return (
    <header
      className="flex items-center gap-6 px-6 h-16 border-b flex-shrink-0 bg-white"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm flex-shrink-0">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-300">/</span>}
            <span
              className={i === crumbs.length - 1 ? "font-medium" : "cursor-pointer hover:text-slate-900 transition-colors"}
              style={{ color: i === crumbs.length - 1 ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      {/* Search */}
      <div className="flex-1 max-w-xl mx-auto">
        <div className="relative group">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-900 group-focus-within:text-teal-600 transition-colors" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11.5 11.5L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search projects, documents, agents..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-full outline-none border transition-all focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            style={{
              background: "var(--color-surface-subtle)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Role badge + switcher */}
        <div className="relative">
          <button
            onClick={() => setShowSwitcher((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors hover:brightness-95"
            style={{ background: persona.colorBg, borderColor: persona.borderColor, color: persona.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: persona.color }}></span>
            {persona.label}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          {showSwitcher && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowSwitcher(false)}></div>
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border z-40 p-2" style={{ borderColor: "var(--color-border)" }}>
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                  Switch demo role
                </div>
                {personas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setRole(p.id); setShowSwitcher(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${role === p.id ? "" : "hover:bg-slate-50"}`}
                    style={role === p.id ? { background: p.colorBg, border: `1px solid ${p.borderColor}` } : { border: "1px solid transparent" }}
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: p.color }}>
                      {p.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{p.name}</div>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{p.label} · {p.title}</div>
                    </div>
                    {role === p.id && <span className="text-xs font-bold" style={{ color: p.color }}>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Security indicator */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs mr-2 border"
          style={{ background: "#F0FDF4", borderColor: "#BBF7D0", color: "#15803D" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          <span className="font-medium">No Internet Egress</span>
        </div>

        {/* Notifications */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M8 2a4 4 0 0 0-4 4v3l-1 1v1h10v-1l-1-1V6a4 4 0 0 0-4-4z" stroke="#475569" strokeWidth="1.3" />
            <path d="M6.5 12a1.5 1.5 0 0 0 3 0" stroke="#475569" strokeWidth="1.3" />
          </svg>
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full border-2 border-white" style={{ background: "#DC2626" }} />
        </button>

        {/* Approvals */}
        <button
          onClick={() => navigate("approvals")}
          className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="#475569" strokeWidth="1.3" />
            <path d="M5 8l2 2 4-4" stroke="#475569" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span
            className="absolute -top-0.5 -right-0.5 text-xs font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white"
            style={{ background: "#D97706", color: "white", fontSize: 10 }}
          >
            2
          </span>
        </button>

        {/* Help */}
        <button
          onClick={() => navigate("help-center")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-sm font-medium transition-colors"
          style={{ color: "var(--color-text-muted)" }}
        >
          ?
        </button>

        <div className="w-px h-6 bg-slate-200 mx-1"></div>

        {/* User */}
        <button
          onClick={() => navigate("profile")}
          className="flex items-center gap-3 px-2 py-1.5 rounded-full hover:bg-slate-50 transition-colors ml-1"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shadow-sm"
            style={{ background: persona.color, color: "white" }}
          >
            {persona.initials}
          </div>
          <span className="text-sm font-medium pr-1" style={{ color: "var(--color-text-primary)" }}>
            {persona.name}
          </span>
        </button>
      </div>
    </header>
  );
}
