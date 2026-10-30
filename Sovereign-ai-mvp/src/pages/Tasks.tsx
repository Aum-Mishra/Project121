import { useState } from "react";
import { Plus, X, FolderKanban, User } from "lucide-react";

const members = ["Anita Rao", "Rajesh Kumar", "Priya Nair", "Suresh Bhat", "Meena Shetty", "Arvind Rao", "Alok Menon", "Vikram Iyer"];
const projects = ["CDU-4 Inspection Analysis", "P-102 Pump Maintenance Study", "Vendor Technical Evaluation — CX-4", "Reformer Unit Optimization", "Pipeline Anomaly Investigation", "Annual Turnaround Planning 2027"];

type Task = {
  id: string;
  name: string;
  project: string;
  scope: "project" | "personal";
  assignee: string;
  agent: string;
  status: string;
  priority: string;
  due: string;
  cls: string;
};

const initialTasks: Task[] = [
  { id: "TSK-041", name: "Review CDU-4 inspection report deviations", project: "CDU-4 Inspection Analysis", scope: "project", assignee: "Anita Rao", agent: "HSE Agent", status: "In Progress", priority: "High", due: "17 Sep 2026", cls: "CONFIDENTIAL" },
  { id: "TSK-042", name: "Generate management approval note", project: "CDU-4 Inspection Analysis", scope: "project", assignee: "Document Agent", agent: "Document Agent", status: "Pending Approval", priority: "High", due: "17 Sep 2026", cls: "CONFIDENTIAL" },
  { id: "TSK-043", name: "Query open maintenance records for CDU-4", project: "CDU-4 Inspection Analysis", scope: "project", assignee: "Rajesh Kumar", agent: "Data Analysis Agent", status: "Completed", priority: "Medium", due: "16 Sep 2026", cls: "INTERNAL" },
  { id: "TSK-044", name: "Vendor evaluation scoring — CX-4 compressor", project: "Vendor Technical Evaluation — CX-4", scope: "project", assignee: "Priya Nair", agent: "Research Agent", status: "Completed", priority: "Medium", due: "15 Sep 2026", cls: "INTERNAL" },
  { id: "TSK-045", name: "Pipeline anomaly root cause analysis", project: "Pipeline Anomaly Investigation", scope: "project", assignee: "Meena Shetty", agent: "Engineering Agent", status: "In Progress", priority: "Critical", due: "18 Sep 2026", cls: "RESTRICTED" },
  { id: "TSK-046", name: "Reformer catalyst performance trend analysis", project: "Reformer Unit Optimization", scope: "project", assignee: "Suresh Bhat", agent: "Data Analysis Agent", status: "In Progress", priority: "Medium", due: "20 Sep 2026", cls: "CONFIDENTIAL" },
  { id: "TSK-047", name: "P-102 seal leakage work order kick-off", project: "P-102 Pump Maintenance Study", scope: "project", assignee: "Rajesh Kumar", agent: "Engineering Agent", status: "Queued", priority: "High", due: "19 Sep 2026", cls: "CONFIDENTIAL" },
  { id: "TSK-048", name: "Long-lead spares list for 2027 turnaround", project: "Annual Turnaround Planning 2027", scope: "project", assignee: "Arvind Rao", agent: "Data Analysis Agent", status: "Queued", priority: "Medium", due: "24 Sep 2026", cls: "INTERNAL" },
  { id: "TSK-049", name: "Furnace tube temperature profile review", project: "CDU-4 Inspection Analysis", scope: "project", assignee: "Alok Menon", agent: "Engineering Agent", status: "In Progress", priority: "Medium", due: "18 Sep 2026", cls: "CONFIDENTIAL" },
  { id: "TSK-050", name: "Baseline vs current corrosion data comparison", project: "P-102 Pump Maintenance Study", scope: "project", assignee: "Vikram Iyer", agent: "Data Analysis Agent", status: "Queued", priority: "Low", due: "22 Sep 2026", cls: "CONFIDENTIAL" },
  { id: "TSK-P01", name: "Complete L2 HSE training module", project: "Personal", scope: "personal", assignee: "Anita Rao", agent: "—", status: "In Progress", priority: "Medium", due: "19 Sep 2026", cls: "INTERNAL" },
  { id: "TSK-P02", name: "Draft quarterly performance self-review", project: "Personal", scope: "personal", assignee: "Anita Rao", agent: "—", status: "Pending Approval", priority: "High", due: "18 Sep 2026", cls: "INTERNAL" },
  { id: "TSK-P03", name: "Prepare slides for plant safety committee", project: "Personal", scope: "personal", assignee: "Anita Rao", agent: "—", status: "Queued", priority: "Medium", due: "23 Sep 2026", cls: "INTERNAL" },
  { id: "TSK-P04", name: "Renew inspection certification (NDT Level II)", project: "Personal", scope: "personal", assignee: "Anita Rao", agent: "—", status: "Completed", priority: "Low", due: "12 Sep 2026", cls: "INTERNAL" },
];

const statusColors: Record<string, { bg: string; color: string }> = {
  "In Progress": { bg: "#DBEAFE", color: "#1D4ED8" },
  "Completed": { bg: "#DCFCE7", color: "#15803D" },
  "Pending Approval": { bg: "#FEF3C7", color: "#92400E" },
  "Queued": { bg: "#F1F5F9", color: "#475569" },
};

const priorityColors: Record<string, { bg: string; color: string }> = {
  Critical: { bg: "#FEE2E2", color: "#991B1B" },
  High: { bg: "#FEF3C7", color: "#92400E" },
  Medium: { bg: "#DBEAFE", color: "#1D4ED8" },
  Low: { bg: "#F0FDF4", color: "#15803D" },
};

const clsColors: Record<string, { bg: string; color: string }> = {
  CONFIDENTIAL: { bg: "#FEF3C7", color: "#92400E" },
  INTERNAL: { bg: "#DBEAFE", color: "#1E40AF" },
  RESTRICTED: { bg: "#FEE2E2", color: "#991B1B" },
};

const emptyForm = { name: "", scope: "project" as const, project: projects[0], assignee: members[0], priority: "Medium", due: "20 Sep 2026" };

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [section, setSection] = useState<"project" | "personal">("project");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const visible = tasks.filter((t) => {
    const matchSection = t.scope === section;
    const matchStatus = statusFilter === "All" || t.status === statusFilter;
    const matchSearch = !search.trim() || (t.name + t.project + t.assignee).toLowerCase().includes(search.toLowerCase());
    return matchSection && matchStatus && matchSearch;
  });

  const pendingCount = tasks.filter(t => t.status === "Pending Approval").length;

  const handleCreate = () => {
    if (!form.name.trim()) return;
    const nextId = tasks.filter(t => t.id.startsWith("TSK-") && !isNaN(Number(t.id.slice(4)))).length + 1;
    const id = form.scope === "personal" ? `TSK-${form.name.trim().split(" ")[0].toUpperCase()}-${Math.floor(Math.random() * 90 + 10)}` : `TSK-${String(50 + nextId).padStart(3, "0")}`;
    const newTask: Task = {
      id,
      name: form.name.trim(),
      project: form.scope === "personal" ? "Personal" : form.project,
      scope: form.scope,
      assignee: form.scope === "personal" ? "Anita Rao" : form.assignee,
      agent: form.scope === "personal" ? "—" : "Auto-routed",
      status: "Queued",
      priority: form.priority,
      due: form.due,
      cls: form.scope === "personal" ? "INTERNAL" : "CONFIDENTIAL",
    };
    setTasks((prev) => [newTask, ...prev]);
    setFormOpen(false);
    setForm(emptyForm);
    setSection(form.scope);
  };

  const updateStatus = (id: string, status: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Tasks</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>{tasks.length} tasks · {pendingCount} pending approval</p>
          </div>
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 text-xs px-4 py-2 rounded font-medium text-white transition-colors"
            style={{ background: "var(--color-teal)" }}
          >
            <Plus className="w-3.5 h-3.5" /> New Task
          </button>
        </div>

        {/* Section toggle: personal vs project */}
        <div className="flex gap-1 bg-white rounded-lg border p-1 mb-4 w-max" style={{ borderColor: "var(--color-border)" }}>
          {([["project", "Project Tasks", FolderKanban], ["personal", "Personal Tasks", User]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => { setSection(key); setStatusFilter("All"); }}
              className={`flex items-center gap-2 text-xs px-4 py-2 rounded-md font-semibold transition-all ${section === key ? "text-white" : "text-slate-900 hover:bg-slate-50"}`}
              style={section === key ? { background: "var(--color-teal)" } : undefined}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${section === key ? "bg-white/20" : "bg-slate-100 text-slate-800"}`}>{tasks.filter(t => t.scope === key).length}</span>
            </button>
          ))}
        </div>

        <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-3 px-5 py-3 border-b flex-wrap" style={{ borderColor: "var(--color-border)" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="flex-1 max-w-xs px-3 py-1.5 text-sm rounded border outline-none"
              style={{ borderColor: "var(--color-border)", fontSize: 13 }}
            />
            {["All", "In Progress", "Pending Approval", "Queued", "Completed"].map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className="text-xs px-3 py-1.5 rounded border font-medium transition-colors"
                style={{
                  borderColor: statusFilter === f ? "var(--color-teal)" : "var(--color-border)",
                  color: statusFilter === f ? "var(--color-teal)" : "var(--color-text-secondary)",
                  background: statusFilter === f ? "#F0FDFA" : "transparent",
                  fontSize: 11,
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["ID", "Task", "Project", "Assignee / Agent", "Priority", "Status", "Due", "Classification", ""].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((task, i) => (
                <tr key={task.id} className="hover:bg-slate-50 transition-colors" style={{ borderBottom: i < visible.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{task.id}</td>
                  <td className="px-5 py-3 max-w-xs">
                    <div className="font-medium text-sm" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{task.name}</div>
                  </td>
                  <td className="px-5 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>{task.project}</td>
                  <td className="px-5 py-3">
                    <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{task.assignee}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>via {task.agent}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: priorityColors[task.priority]?.bg, color: priorityColors[task.priority]?.color, fontSize: 10 }}>{task.priority}</span>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={task.status}
                      onChange={(e) => updateStatus(task.id, e.target.value)}
                      className="text-xs px-2 py-1 rounded border outline-none cursor-pointer"
                      style={{ background: statusColors[task.status]?.bg, color: statusColors[task.status]?.color, borderColor: "var(--color-border)", fontSize: 11, fontWeight: 600 }}
                    >
                      {["Queued", "In Progress", "Pending Approval", "Completed"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>{task.due}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: clsColors[task.cls]?.bg, color: clsColors[task.cls]?.color, fontSize: 10 }}>{task.cls}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: task.scope === "personal" ? "#F0FDFA" : "#EFF6FF", color: task.scope === "personal" ? "#0F766E" : "#1D4ED8", fontSize: 10 }}>{task.scope === "personal" ? "PERSONAL" : "PROJECT"}</span>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No tasks match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Task Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
              <h3 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Create Task</h3>
              <button onClick={() => setFormOpen(false)} className="text-slate-900 hover:text-slate-900 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Task Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Review RBI re-schedule for exchanger E-301"
                  className="w-full px-3 py-2 text-sm rounded border outline-none"
                  style={{ borderColor: "var(--color-border)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Task Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {([["project", "Project Task", FolderKanban], ["personal", "Personal Task", User]] as const).map(([key, label, Icon]) => (
                    <button
                      key={key}
                      onClick={() => setForm({ ...form, scope: key })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${form.scope === key ? "border-teal-400 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-900 hover:bg-slate-50"}`}
                    >
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </button>
                  ))}
                </div>
              </div>
              {form.scope === "project" && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Project</label>
                    <select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: "var(--color-border)" }}>
                      {projects.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Assign To</label>
                    <select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: "var(--color-border)" }}>
                      {members.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: "var(--color-border)" }}>
                    {["Critical", "High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Due</label>
                  <input type="text" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ borderColor: "var(--color-border)" }} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t" style={{ borderColor: "var(--color-border)" }}>
              <button onClick={() => setFormOpen(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Cancel</button>
              <button onClick={handleCreate} className="flex-1 py-2 text-sm rounded font-medium text-white" style={{ background: "var(--color-teal)" }}>Create Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}