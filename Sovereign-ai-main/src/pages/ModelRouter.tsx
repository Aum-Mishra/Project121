const routes = [
  { query: "Simple query / data lookup", complexity: "Simple", model: "Qwen2.5-Omni-3B", latency: "<100ms", vram: "3 GB", path: "fast", color: "#0F766E" },
  { query: "Keyword / structured search", complexity: "Simple", model: "BM25 / SQL", latency: "<200ms", vram: "—", path: "fast", color: "#0F766E" },
  { query: "General reasoning & summarization", complexity: "Normal", model: "Qwen3-8B", latency: "1–3s", vram: "8 GB", path: "knowledge", color: "#2563EB" },
  { query: "Document analysis / QA", complexity: "Medium", model: "Qwen2.5-VL-7B", latency: "2–5s", vram: "7 GB", path: "knowledge", color: "#2563EB" },
  { query: "Complex industrial reasoning", complexity: "Complex", model: "InternVL3-8B", latency: "2–4s", vram: "8 GB", path: "complex", color: "#7C3AED" },
  { query: "Multimodal Voice + Vision + Text", complexity: "Medium", model: "Qwen2.5-Omni-7B", latency: "2–6s", vram: "7 GB", path: "knowledge", color: "#2563EB" },
  { query: "Speech / voice transcription", complexity: "Simple", model: "Whisper large-v3", latency: "Real-time", vram: "3 GB", path: "fast", color: "#0F766E" },
];

const models = [
  { name: "Reasoning Model (Qwen3-8B)", type: "Reasoning", status: "Active", vram: "8 GB / 12 GB", latency: "1.8s avg", queue: 0 },
  { name: "Vision Model (Qwen2.5-VL-7B)", type: "Vision", status: "Active", vram: "7 GB / 12 GB", latency: "2.1s avg", queue: 0 },
  { name: "Industrial Vision (InternVL3-8B)", type: "Vision", status: "Active", vram: "8 GB / 12 GB", latency: "2.4s avg", queue: 1 },
  { name: "Omni Model (Qwen2.5-Omni-7B)", type: "Omni", status: "Active", vram: "7 GB / 12 GB", latency: "2.5s avg", queue: 0 },
  { name: "Lightweight Omni (Qwen2.5-Omni-3B)", type: "Omni", status: "Active", vram: "3 GB / 12 GB", latency: "0.8s avg", queue: 0 },
  { name: "Speech Model (Whisper large-v3)", type: "Speech", status: "Active", vram: "3 GB / 12 GB", latency: "RT", queue: 0 },
  { name: "Embedding Model (BGE-M3)", type: "Embedding", status: "Active", vram: "2 GB / 12 GB", latency: "45ms avg", queue: 0 },
  { name: "Reranker (BGE-Reranker-v2)", type: "Reranking", status: "Active", vram: "1 GB / 12 GB", latency: "30ms avg", queue: 0 },
];

const pathColors: Record<string, string> = { fast: "#0F766E", knowledge: "#2563EB", complex: "#7C3AED" };
const pathBg: Record<string, string> = { fast: "#F0FDFA", knowledge: "#EFF6FF", complex: "#F5F3FF" };

export default function ModelRouter() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Model Router</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Adaptive model selection — choose the simplest reliable execution path
          </p>
        </div>

        {/* Pipeline diagram */}
        <div className="bg-white rounded border p-6 mb-6" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-sm font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>Routing Pipeline</div>
          <div className="flex items-center gap-3 overflow-x-auto pb-2">
            {["Query", "Intent Detection", "Complexity Assessment", "Task Classification", "Model Selection", "Execution"].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-3 flex-shrink-0">
                <div className="px-3 py-2 rounded text-xs font-medium text-center" style={{ background: "var(--color-surface-subtle)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", minWidth: 100 }}>
                  {step}
                </div>
                {i < arr.length - 1 && <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Routing Table */}
        <div className="bg-white rounded border overflow-hidden mb-6" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-5 py-3.5 border-b font-semibold text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
            Routing Rules
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Query Type", "Complexity", "Model Selected", "Est. Latency", "VRAM", "Path"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routes.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50" style={{ borderBottom: i < routes.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <td className="px-5 py-3 text-sm" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{r.query}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{
                      background: r.complexity === "Simple" ? "#F0FDF4" : r.complexity === "Normal" ? "#EFF6FF" : r.complexity === "Medium" ? "#DBEAFE" : "#F5F3FF",
                      color: r.complexity === "Simple" ? "#15803D" : r.complexity === "Normal" ? "#1D4ED8" : r.complexity === "Medium" ? "#2563EB" : "#7C3AED",
                      fontSize: 11,
                    }}>{r.complexity}</span>
                  </td>
                  <td className="px-5 py-3 text-sm font-medium" style={{ color: r.color, fontSize: 13 }}>{r.model}</td>
                  <td className="px-5 py-3 text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>{r.latency}</td>
                  <td className="px-5 py-3 text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>{r.vram}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: pathBg[r.path], color: pathColors[r.path], fontSize: 10 }}>
                      {r.path === "fast" ? "Fast Path" : r.path === "knowledge" ? "Knowledge Path" : "Complex Path"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Active Models */}
        <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-5 py-3.5 border-b font-semibold text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
            Active Local Models
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Model", "Type", "Status", "VRAM Usage", "Avg Latency", "Queue"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={i} className="hover:bg-slate-50" style={{ borderBottom: i < models.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <td className="px-5 py-3 font-medium text-sm" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{m.name}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#F0FDFA", color: "var(--color-teal)", fontSize: 10 }}>{m.type}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: "#15803D" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#15803D" }} />
                      {m.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>{m.vram}</td>
                  <td className="px-5 py-3 text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>{m.latency}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-medium" style={{ color: m.queue > 0 ? "var(--color-warning)" : "var(--color-text-muted)" }}>
                      {m.queue} pending
                    </span>
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
