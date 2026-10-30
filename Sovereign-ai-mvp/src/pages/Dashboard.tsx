import { useState } from "react";
import { useNav } from "../context/NavContext";
import { projectConversations, flatProjectConvs } from "../data/projectChats";
import { conversations as personalConvs } from "../data/personalChats";
import { files as allFiles, isHRFile } from "../data/demoCore";
import DocumentViewer, { DocTypeChip } from "../components/DemoDocs";
import { filterProjectsForRole, hasAccess, personas, isEngineeringProject } from "../data/roles";

const statusColors: Record<string, { bg: string; color: string }> = {
  Active: { bg: "#DBEAFE", color: "#1D4ED8" },
  Completed: { bg: "#DCFCE7", color: "#15803D" },
  "Pending Approval": { bg: "#FEF3C7", color: "#92400E" },
  Planning: { bg: "#F1F5F9", color: "#475569" },
};

const clsColors: Record<string, { bg: string; color: string }> = {
  CONFIDENTIAL: { bg: "#FEF3C7", color: "#92400E" },
  INTERNAL: { bg: "#DBEAFE", color: "#1E40AF" },
  RESTRICTED: { bg: "#FEE2E2", color: "#991B1B" },
};

const allQuickActions = [
  { label: "New Chat", icon: "◯", page: "workbench" as const },
  { label: "New Project", icon: "◫", page: "projects" as const },
  { label: "Documents", icon: "◧", page: "documents" as const },
  { label: "Coding Workspace", icon: "⌨", page: "coding-workspace" as const },
  { label: "Approvals", icon: "✓", page: "approvals" as const },
  { label: "Knowledge Base", icon: "◈", page: "knowledge-base" as const },
];

const roleGreeting: Record<string, { hello: string; sub: string }> = {
  admin: { hello: "Good morning, Anita", sub: "Your secure industrial AI workspace — ApexPetro Refinery Operations" },
  engineer: { hello: "Good morning, Rajesh", sub: "Inspection & reliability workspace — ApexPetro Refinery Operations" },
  hr: { hello: "Good morning, Priya", sub: "People & talent workspace — ApexPetro HR Services" },
};

export default function Dashboard() {
  const { navigate, projects, setCurrentProjectName, role } = useNav();
  const [openFile, setOpenFile] = useState<string | null>(null);
  const persona = personas.find((p) => p.id === role) ?? personas[0];
  const text = roleGreeting[role] ?? roleGreeting.admin;

  const visibleProjects = filterProjectsForRole(projects, role);

  const allConvs = role === "hr"
    ? flatProjectConvs().filter((c) => !isEngineeringProject(c.project))
    : flatProjectConvs().filter((c) => isEngineeringProject(c.project));

  const visibleFiles = role === "hr" ? allFiles.filter((f) => isHRFile(f.id)) : allFiles.filter((f) => !isHRFile(f.id));

  const pendingApprovals = projectConversations
    .filter((p) => role === "hr" ? !isEngineeringProject(p.name) : isEngineeringProject(p.name))
    .flatMap((p) =>
      p.convs.flatMap((c) =>
        c.messages.flatMap((m) =>
          m.kind === "text" && m.approval ? [{ project: p.name, convTitle: c.title, approval: m.approval }] : []
        )
      )
    );

  const quickActions = allQuickActions.filter((a) => hasAccess(role, a.page));

  const kpis = [
    { label: "Active Projects", value: String(visibleProjects.filter((p) => p.status === "Active").length), delta: `of ${visibleProjects.length}`, color: "var(--color-teal)" },
    { label: "Project Chats", value: String(allConvs.length), delta: role === "hr" ? "across HR projects" : "across engineering projects", color: "var(--color-blue)" },
    { label: "Pending Approvals", value: String(pendingApprovals.length), delta: "awaiting you", color: "var(--color-warning)" },
    { label: "Documents on File", value: String(visibleFiles.length), delta: "shared library", color: "var(--color-info)" },
    { label: "Knowledge Chunks", value: role === "hr" ? "412" : "1,284", delta: "+12 today", color: "#7C3AED" },
  ];

  const recentChats = [...allConvs.slice(0, 4), ...personalConvs.slice(0, 2).map((c) => ({ project: "Personal", conv: { title: c.title, preview: c.preview, time: c.time } }))];

  const openProject = (name: string) => {
    setCurrentProjectName(name);
    navigate("project-detail");
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-surface-subtle)" }}>
      <div className="max-w-6xl mx-auto px-10 py-12">

        {/* Header */}
        <div className="mb-10 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              {text.hello}
            </h1>
            <p className="text-base mt-2" style={{ color: "var(--color-text-secondary)" }}>
              {text.sub}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm" style={{ border: "1px solid var(--color-border)" }}>
              <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse"></span>
              <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>{visibleProjects.length} projects in focus · all systems on-premise</span>
            </span>
            <span className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold" style={{ background: persona.colorBg, border: `1px solid ${persona.borderColor}`, color: persona.color }}>
              {persona.label}
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-6 gap-5 mb-10">
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.page)}
              className="flex flex-col items-center justify-center gap-3 px-4 py-5 rounded-2xl bg-white shadow-sm hover:shadow-md transition-all text-center border border-transparent hover:border-teal-200"
            >
              <div className="w-11 h-11 flex items-center justify-center rounded-full" style={{ background: "var(--color-bg-secondary)", color: "var(--color-teal)" }}>
                <span className="text-lg">{a.icon}</span>
              </div>
              <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>{a.label}</span>
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-5 gap-5 mb-10">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-2xl px-5 py-5 bg-white shadow-sm">
              <div className="text-xs mb-3 font-semibold" style={{ color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {kpi.label}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ color: kpi.color }}>{kpi.value}</span>
                <span className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>{kpi.delta}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-8">
          {/* Left column: recent projects + chats */}
          <div className="col-span-2 flex flex-col gap-8">
            <div className="bg-white rounded-2xl shadow-sm">
              <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>Recent Projects</h2>
                <button className="text-sm font-medium transition-colors hover:text-teal-700" style={{ color: "var(--color-teal)" }} onClick={() => navigate("projects")}>
                  View all →
                </button>
              </div>
              <div className="py-2">
                {visibleProjects.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-5 px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => openProject(p.name)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate" style={{ color: "var(--color-text-primary)" }}>{p.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-teal-50 text-teal-700" style={{ border: "1px solid #99F6E4" }}>{p.contributors?.length} contributors</span>
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                        {p.dept} · updated {p.updated} · {i === 0 ? "discussed in chat today" : `${i === 1 ? "in deep-dive this week" : "tracked this week"}`}
                      </div>
                    </div>
                    <div className="w-28 flex-shrink-0">
                      <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: "var(--color-text-muted)" }}>
                        <span>Progress</span><span className="font-semibold" style={{ color: "var(--color-text-secondary)" }}>{p.progress}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: "var(--color-teal)" }} />
                      </div>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-md font-medium flex-shrink-0" style={{ background: statusColors[p.status]?.bg || "#F1F5F9", color: statusColors[p.status]?.color || "#475569" }}>
                      {p.status}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-md font-medium flex-shrink-0" style={{ background: clsColors[p.cls]?.bg || "#F1F5F9", color: clsColors[p.cls]?.color || "#475569" }}>
                      {p.cls}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Chats */}
            <div className="bg-white rounded-2xl shadow-sm">
              <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>Recent Chats</h2>
                <button className="text-sm font-medium transition-colors hover:text-teal-700" style={{ color: "var(--color-teal)" }} onClick={() => navigate("workbench")}>
                  Open Workbench →
                </button>
              </div>
              <div className="px-6 py-3 divide-y" style={{ borderColor: "var(--color-border)" }}>
                {recentChats.map((c, i) => (
                  <div key={i} className="flex items-center gap-4 py-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors -mx-2 px-2" onClick={() => navigate("workbench")}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: c.project === "Personal" ? "#F5F3FF" : "#F0FDFA", color: c.project === "Personal" ? "#7C3AED" : "var(--color-teal)" }}>
                      {c.project === "Personal" ? "P" : c.project[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{c.conv.title}</span>
                        {c.project !== "Personal" && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700">project</span>}
                      </div>
                      <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>{c.conv.preview}</div>
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>{c.conv.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-8">
            {/* Pending Approvals */}
            <div className="bg-white rounded-2xl shadow-sm">
              <div className="px-6 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>Pending Approvals</h2>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md" style={{ background: "#FEF3C7", color: "#92400E" }}>{pendingApprovals.length}</span>
                </div>
              </div>
              <div className="px-6 py-3">
                {pendingApprovals.slice(0, 4).map((item, i) => (
                  <div key={i} className="py-3 border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--color-text-muted)" }}>{item.project}</div>
                    <div className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>{item.approval.artifact}</div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{item.approval.action}</span>
                      {item.approval.due && <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "#FEF3C7", color: "#92400E" }}>due {item.approval.due}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 pb-6">
                <button onClick={() => navigate("approvals")} className="w-full text-sm font-medium py-2.5 rounded-lg border transition-colors hover:bg-amber-50" style={{ borderColor: "#D97706", color: "#D97706" }}>
                  Review Approvals
                </button>
              </div>
            </div>

            {/* Recent Files */}
            <div className="bg-white rounded-2xl shadow-sm">
              <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
                <h2 className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>Recent Files</h2>
                <button className="text-sm font-medium transition-colors hover:text-teal-700" style={{ color: "var(--color-teal)" }} onClick={() => navigate("documents")}>
                  All docs →
                </button>
              </div>
              <div className="px-6 py-3">
                {visibleFiles.slice(0, 5).map((f) => (
                  <button key={f.id} onClick={() => setOpenFile(f.id)} className="w-full flex items-center gap-2.5 py-2.5 border-b last:border-0 text-left hover:bg-slate-50 transition-colors rounded-lg -mx-2 px-2" title={f.blurb}>
                    <span className="text-base">{f.type === "PDF" ? "📄" : f.type === "DOCX" ? "📝" : f.type === "XLSX" ? "📊" : "📈"}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{f.name}</span>
                      <span className="block text-xs" style={{ color: "var(--color-text-muted)" }}>{f.size} · {f.blurb.slice(0, 48)}…</span>
                    </span>
                    <DocTypeChip type={f.type} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
          Demonstration workspace — all data rendered here is simulated for the Sovereign AI Workbench product walkthrough.
        </div>
      </div>

      {openFile && <DocumentViewer fileId={openFile} onClose={() => setOpenFile(null)} />}
    </div>
  );
}