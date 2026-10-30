import { useState } from "react";
import { useNav } from "../context/NavContext";

// projects removed (moved to global state in App.tsx)

const statusColors: Record<string, string> = {
  Active: "bg-blue-100 text-blue-700",
  Completed: "bg-green-100 text-green-700",
  "Pending Approval": "bg-amber-100 text-amber-800",
  Planning: "bg-slate-100 text-slate-900",
};

const clsColors: Record<string, string> = {
  CONFIDENTIAL: "bg-amber-100 text-amber-800",
  INTERNAL: "bg-blue-100 text-blue-700",
  RESTRICTED: "bg-rose-100 text-rose-800",
};

export default function Projects() {
  const { navigate, projects, updateProject } = useNav();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [newContributor, setNewContributor] = useState("");

  const filtered = projects.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "All" || p.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto px-10 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Projects</h1>
            <p className="text-base mt-2 text-slate-800">
              {projects.length} active projects · MRPL Refinery Operations
            </p>
          </div>
          <button
            className="text-sm px-5 py-2.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-sm"
          >
            + New Project
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11.5 11.5L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white shadow-sm"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
            {["All", "Active", "Completed", "Pending Approval", "Planning"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-sm px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                  filter === f
                    ? "bg-teal-50 text-teal-700 border border-teal-200 shadow-sm"
                    : "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                {["Project", "Owner / Department", "Status", "Progress", "Contributors", "Agents", "Classification", ""].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-4 text-[11px] font-bold text-slate-800 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={i}
                  className="hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100 last:border-0 group"
                  onClick={() => navigate("project-detail")}
                >
                  <td className="px-6 py-4">
                    <div className="font-semibold text-sm text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-800 mt-1">{p.tasks} tasks · {p.artifacts} artifacts</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-700">{p.owner}</div>
                    <div className="text-xs text-slate-800 mt-1">{p.dept}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${statusColors[p.status] || "bg-slate-100 text-slate-700"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${p.progress === 100 ? "bg-green-500" : "bg-teal-500"}`}
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-900">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1 mb-1">
                      {p.contributors?.slice(0, 3).map((c) => (
                        <div key={c} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shadow-sm" style={{ background: "#0F766E" }} title={c}>
                          {c.split(" ").map(n => n[0]).join("")}
                        </div>
                      ))}
                      {p.contributors?.length > 3 && (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold bg-slate-200 text-slate-900">
                          +{p.contributors.length - 3}
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingProject(p.name); }}
                      className="text-[10px] text-teal-600 hover:text-teal-700 font-medium mt-1 hover:underline"
                    >
                      + Manage
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {p.agents.slice(0, 2).map((a) => (
                        <span key={a} className="text-[10px] px-2 py-1 rounded-md bg-teal-50 text-teal-700 font-medium">
                          {a}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider border ${clsColors[p.cls]?.replace('bg-', 'border-').replace('100', '200')} ${clsColors[p.cls] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                      {p.cls}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-xs px-4 py-2 rounded-lg border border-slate-200 font-medium text-slate-900 hover:bg-white hover:text-slate-900 hover:border-slate-300 transition-colors bg-slate-50 opacity-0 group-hover:opacity-100">
                      Open →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-800">
              No projects found matching your search.
            </div>
          )}
        </div>
      </div>

      {/* Contributor Management Modal */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Manage Contributors</h3>
              <button onClick={() => { setEditingProject(null); setNewContributor(""); }} className="text-slate-900 hover:text-slate-900">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div className="p-6">
              <div className="text-sm font-medium text-slate-700 mb-2">Add new contributor</div>
              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  placeholder="E.g. Rajesh Kumar"
                  value={newContributor}
                  onChange={(e) => setNewContributor(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
                <button
                  onClick={() => {
                    if (newContributor.trim()) {
                      const proj = projects.find(p => p.name === editingProject);
                      if (proj && !proj.contributors.includes(newContributor.trim())) {
                        updateProject(proj.name, { contributors: [...proj.contributors, newContributor.trim()] });
                      }
                      setNewContributor("");
                    }
                  }}
                  className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
                >
                  Add
                </button>
              </div>

              <div className="text-sm font-medium text-slate-700 mb-3">Current Contributors</div>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {projects.find(p => p.name === editingProject)?.contributors.map((c) => (
                  <div key={c} className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-semibold">
                        {c.split(" ").map(n => n[0]).join("")}
                      </div>
                      <span className="text-sm font-medium text-slate-800">{c}</span>
                    </div>
                    <button
                      onClick={() => {
                        const proj = projects.find(p => p.name === editingProject);
                        if (proj) {
                          updateProject(proj.name, { contributors: proj.contributors.filter(x => x !== c) });
                        }
                      }}
                      className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setEditingProject(null)}
                className="px-5 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
