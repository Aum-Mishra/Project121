const tools = [
  { name: "PostgreSQL Query Tool", description: "Natural language to SQL, read-only database queries", agents: ["Data Analysis Agent", "Research Agent"], permission: "Read-only", network: "Internal", approval: "Not required", env: "Sandbox", audited: true },
  { name: "File Search Tool", description: "Semantic and keyword search across project files", agents: ["Research Agent", "Document Agent", "Coding Agent"], permission: "Read", network: "None", approval: "Not required", env: "Isolated", audited: true },
  { name: "PDF Parser", description: "Extract text, structure, and metadata from PDF documents", agents: ["Document Agent", "HSE Agent"], permission: "Read", network: "None", approval: "Not required", env: "Isolated", audited: true },
  { name: "Git Tool", description: "Read repository, create commits, branch operations", agents: ["Coding Agent"], permission: "Repository access", network: "Internal", approval: "For push", env: "Isolated", audited: true },
  { name: "Sandbox Runner", description: "Execute code in isolated container environment", agents: ["Coding Agent", "Data Analysis Agent"], permission: "Execute (isolated)", network: "None", approval: "Required", env: "Air-gapped container", audited: true },
  { name: "Document Generator", description: "Generate Word, PDF, and PowerPoint from approved templates", agents: ["Document Agent", "Research Agent", "Engineering Agent"], permission: "Write", network: "None", approval: "Required", env: "Isolated", audited: true },
  { name: "Engineering Calculator", description: "Numerical calculations for pressure, flow, heat transfer", agents: ["Engineering Agent", "Calculation Agent"], permission: "Execute", network: "None", approval: "Not required", env: "Isolated", audited: true },
  { name: "OCR Engine", description: "Extract text from images and scanned documents", agents: ["Document Agent", "HSE Agent"], permission: "Read", network: "None", approval: "Not required", env: "Isolated", audited: true },
];

export default function ToolRegistry() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Tool Registry</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>All tools operate within MRPL sovereign environment · Agent access enforced by RBAC</p>
        </div>

        <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Tool", "Agents With Access", "Permission", "Network", "Approval", "Environment", "Audit", ""].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tools.map((tool, i) => (
                <tr key={i} className="hover:bg-slate-50 cursor-pointer transition-colors" style={{ borderBottom: i < tools.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <td className="px-5 py-4">
                    <div className="font-medium text-sm" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{tool.name}</div>
                    <div className="text-xs mt-0.5 max-w-xs" style={{ color: "var(--color-text-muted)" }}>{tool.description}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {tool.agents.slice(0, 2).map((a) => (
                        <span key={a} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#F0FDFA", color: "var(--color-teal)", fontSize: 10 }}>{a}</span>
                      ))}
                      {tool.agents.length > 2 && <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>+{tool.agents.length - 2}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs" style={{ color: "var(--color-text-secondary)" }}>{tool.permission}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: tool.network === "None" ? "#F0FDF4" : "#EFF6FF", color: tool.network === "None" ? "#15803D" : "#1D4ED8", fontSize: 10 }}>
                      {tool.network === "None" ? "🚫 None" : `🌐 ${tool.network}`}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: tool.approval === "Required" ? "#FEF3C7" : "#F0FDF4", color: tool.approval === "Required" ? "#92400E" : "#15803D", fontSize: 10 }}>
                      {tool.approval}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs" style={{ color: "var(--color-text-secondary)" }}>{tool.env}</td>
                  <td className="px-5 py-4">
                    {tool.audited && <span className="text-xs font-medium" style={{ color: "#15803D" }}>✓ Audited</span>}
                  </td>
                  <td className="px-5 py-4">
                    <button className="text-xs px-2 py-1 rounded border hover:bg-slate-100" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", fontSize: 11 }}>Configure</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
