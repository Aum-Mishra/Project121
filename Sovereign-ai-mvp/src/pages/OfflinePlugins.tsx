const categories = ["All", "Document Processing", "Engineering", "Data Analysis", "Database", "Git", "File System", "OCR", "Image Processing", "Office Automation", "Visualization", "Security", "Internal APIs"];

const plugins = [
  { name: "PDF Parser", category: "Document Processing", version: "2.4.1", permission: "Read-only", network: "None", status: "Installed", approved: true, internet: false, description: "Extract text, tables, and metadata from PDF documents using PyMuPDF." },
  { name: "OCR Engine (Tesseract)", category: "OCR", version: "5.3.0", permission: "Read-only", network: "None", status: "Installed", approved: true, internet: false, description: "Optical character recognition for scanned documents and images." },
  { name: "PostgreSQL Connector", category: "Database", version: "3.1.0", permission: "Read-only (configurable)", network: "Internal only", status: "Installed", approved: true, internet: false, description: "Connects to MRPL PostgreSQL instances. Read-only by default; write requires approval." },
  { name: "Git Connector", category: "Git", version: "1.8.2", permission: "Repository access", network: "Internal only", status: "Installed", approved: true, internet: false, description: "Clone, read, and commit to internal Git repositories." },
  { name: "Excel Analyzer", category: "Office Automation", version: "2.0.4", permission: "Read/Write", network: "None", status: "Installed", approved: true, internet: false, description: "Parse, analyze, and generate Excel files using openpyxl." },
  { name: "Document Generator", category: "Document Processing", version: "1.5.3", permission: "Write", network: "None", status: "Installed", approved: true, internet: false, description: "Generate Word, PDF, and PowerPoint artifacts from approved templates." },
  { name: "Engineering Calculator", category: "Engineering", version: "1.2.0", permission: "Execute", network: "None", status: "Installed", approved: true, internet: false, description: "Numerical engineering calculations — pressure, flow, heat transfer, stress analysis." },
  { name: "Image Analyzer", category: "Image Processing", version: "3.0.1", permission: "Read-only", network: "None", status: "Installed", approved: true, internet: false, description: "Analyze inspection images and engineering photographs using local vision models." },
  { name: "Internal SAP Connector", category: "Internal APIs", version: "1.0.0", permission: "Read-only", network: "Internal only", status: "Restricted", approved: false, internet: false, description: "Connect to MRPL SAP system for maintenance and procurement data." },
];

const statusColors: Record<string, { bg: string; color: string }> = {
  Installed: { bg: "#DCFCE7", color: "#15803D" },
  Restricted: { bg: "#FEF3C7", color: "#92400E" },
  Disabled: { bg: "#F1F5F9", color: "#475569" },
};

export default function OfflinePlugins() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Offline Plugins</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>Local Plugin Registry — all plugins execute inside the MRPL sovereign environment</p>
          </div>
          <button className="text-xs px-4 py-2 rounded border font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>+ Install Plugin</button>
        </div>

        {/* Sovereignty banner */}
        <div className="mb-6 px-5 py-3 rounded flex items-center gap-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
          <span>🟢</span>
          <span className="text-sm font-medium" style={{ color: "#15803D" }}>All plugins execute locally · Internet Access: Blocked for all plugins</span>
          <span className="ml-auto text-xs" style={{ color: "#15803D" }}>{plugins.filter(p => p.status === "Installed").length}/{plugins.length} active</span>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          {categories.slice(0, 8).map((cat) => (
            <button
              key={cat}
              className="text-xs px-3 py-1.5 rounded border font-medium hover:bg-slate-50"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)", fontSize: 11 }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Plugin Grid */}
        <div className="grid grid-cols-2 gap-4">
          {plugins.map((p, i) => (
            <div key={i} className="bg-white rounded border p-5 hover:shadow-sm transition-all" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{p.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: statusColors[p.status].bg, color: statusColors[p.status].color, fontSize: 10 }}>{p.status}</span>
                    {p.approved && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 10 }}>✓ Approved</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-muted)", fontSize: 10 }}>{p.category}</span>
                    <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)", fontSize: 11 }}>v{p.version}</span>
                  </div>
                </div>
                <button className="text-xs px-3 py-1.5 rounded border font-medium flex-shrink-0 hover:bg-slate-50" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)", fontSize: 11 }}>
                  Configure
                </button>
              </div>

              <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>{p.description}</p>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="font-medium mb-0.5" style={{ color: "var(--color-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Permission</div>
                  <div style={{ color: "var(--color-text-secondary)" }}>{p.permission}</div>
                </div>
                <div>
                  <div className="font-medium mb-0.5" style={{ color: "var(--color-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Network</div>
                  <div style={{ color: "var(--color-text-secondary)" }}>{p.network}</div>
                </div>
                <div>
                  <div className="font-medium mb-0.5" style={{ color: "var(--color-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Internet</div>
                  <div className="flex items-center gap-1" style={{ color: "var(--color-danger)" }}>
                    <span>🚫</span> <span>Blocked</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
