import { useState } from "react";

const agents = [
  {
    name: "Research Agent",
    purpose: "Comprehensive research and information synthesis",
    tools: ["Hybrid RAG", "Web Search (disabled)", "Document Parser", "Summary Generator"],
    models: ["Qwen3-8B", "BGE-M3"],
    inputs: ["Text", "PDF", "DOCX"],
    outputs: ["Research Report", "Summary", "Evidence Pack"],
    approval: "Not required",
    status: "Active",
    runs: 248,
    permissions: ["Knowledge Base", "Documents", "Project Knowledge"],
  },
  {
    name: "Document Agent",
    purpose: "Document analysis, generation, and management",
    tools: ["OCR Engine", "PDF Parser", "Template Engine", "Document Generator"],
    models: ["Qwen2.5-VL-7B", "Qwen3-8B"],
    inputs: ["PDF", "DOCX", "Scanned Images", "XLSX"],
    outputs: ["Word Document", "PDF Report", "Extraction Results"],
    approval: "For generation",
    status: "Active",
    runs: 341,
    permissions: ["Documents", "Templates", "Artifacts"],
  },
  {
    name: "Coding Agent",
    purpose: "Code analysis, generation, debugging, and testing",
    tools: ["Sandbox Runner", "Git Tool", "File System", "Test Runner"],
    models: ["Qwen3-8B"],
    inputs: ["Code", "Repository", "Test Results", "Error Logs"],
    outputs: ["Code", "Test Results", "Analysis Report"],
    approval: "For execution",
    status: "Active",
    runs: 89,
    permissions: ["Code Repository", "Sandbox", "File System"],
  },
  {
    name: "Engineering Agent",
    purpose: "Engineering calculations, drawing, and analysis",
    tools: ["Engineering Calculator", "Drawing Generator", "Sensor Data Reader"],
    models: ["Qwen3-8B", "InternVL3-8B"],
    inputs: ["Engineering Specs", "CAD Data", "Sensor Readings", "Images"],
    outputs: ["Engineering Report", "Drawing (SVG/DXF)", "Risk Assessment"],
    approval: "Required for drawings",
    status: "Active",
    runs: 52,
    permissions: ["Engineering Knowledge", "Documents"],
  },
  {
    name: "HSE / Inspection Agent",
    purpose: "Health, safety, and inspection analysis",
    tools: ["Inspection DB", "Risk Calculator", "Document Parser"],
    models: ["Qwen3-8B", "InternVL3-8B"],
    inputs: ["Inspection Reports", "Equipment Photos", "Sensor Data"],
    outputs: ["Inspection Analysis", "Risk Report", "Recommendations"],
    approval: "For critical findings",
    status: "Active",
    runs: 173,
    permissions: ["HSE Knowledge", "Inspection Reports", "Equipment DB"],
  },
  {
    name: "Data Analysis Agent",
    purpose: "Structured data analysis and PostgreSQL querying",
    tools: ["PostgreSQL Query Tool", "Excel Analyzer", "Chart Generator"],
    models: ["No LLM (SQL)", "Qwen3-8B"],
    inputs: ["Natural Language", "XLSX", "Database Tables"],
    outputs: ["Analysis Report", "Charts", "Data Tables"],
    approval: "Read-only by default",
    status: "Active",
    runs: 412,
    permissions: ["MRPL PostgreSQL (read-only)", "Operational Data"],
  },
];

const statusColors: Record<string, { bg: string; color: string }> = {
  Active: { bg: "#DCFCE7", color: "#15803D" },
  Inactive: { bg: "#F1F5F9", color: "#475569" },
  Restricted: { bg: "#FEE2E2", color: "#991B1B" },
};

export default function Agents() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="flex h-full" style={{ background: "#F7F9FC" }}>
      {/* List */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-5xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Agent Registry</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>All agents operate within MRPL sovereign environment · RBAC enforced</p>
            </div>
          </div>

          <div className="space-y-3">
            {agents.map((agent, i) => (
              <div
                key={i}
                className="bg-white rounded border cursor-pointer hover:shadow-sm transition-all"
                style={{ borderColor: selected === i ? "var(--color-teal)" : "var(--color-border)" }}
                onClick={() => setSelected(i === selected ? null : i)}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <div
                    className="w-9 h-9 rounded flex items-center justify-center text-sm font-semibold flex-shrink-0"
                    style={{ background: "#F0FDFA", color: "var(--color-teal)" }}
                  >
                    {agent.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{agent.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: statusColors[agent.status].bg, color: statusColors[agent.status].color, fontSize: 10 }}>
                        {agent.status}
                      </span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{agent.purpose}</div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>{agent.runs}</div>
                      <div>Executions</div>
                    </div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>{agent.tools.length}</div>
                      <div>Tools</div>
                    </div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>{agent.approval}</div>
                      <div>Approval</div>
                    </div>
                    <button className="text-xs px-3 py-1.5 rounded border font-medium hover:bg-slate-50 flex-shrink-0" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
                      Configure
                    </button>
                  </div>
                </div>

                {selected === i && (
                  <div className="border-t px-5 py-4 grid grid-cols-4 gap-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-subtle)" }}>
                    <div>
                      <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tools</div>
                      {agent.tools.map((t) => <div key={t} className="text-xs py-0.5" style={{ color: "var(--color-text-secondary)" }}>· {t}</div>)}
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Models</div>
                      {agent.models.map((m) => <div key={m} className="text-xs py-0.5" style={{ color: "var(--color-text-secondary)" }}>· {m}</div>)}
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Inputs / Outputs</div>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>In: {agent.inputs.join(", ")}</div>
                      <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Out: {agent.outputs.join(", ")}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Permissions</div>
                      {agent.permissions.map((p) => (
                        <div key={p} className="text-xs py-0.5 flex items-center gap-1">
                          <span style={{ color: "var(--color-success)" }}>✓</span>
                          <span style={{ color: "var(--color-text-secondary)" }}>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
