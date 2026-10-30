const models = [
  { name: "Qwen3-8B", type: "Reasoning", size: "8B", vram: "8 GB", context: "128K", status: "Active", latency: "1.8s avg", quantization: "Q4_K_M", use: "Text reasoning, summarization, Q&A" },
  { name: "Qwen2.5-VL-7B", type: "Vision", size: "7B", vram: "7 GB", context: "32K", status: "Active", latency: "2.1s avg", quantization: "Q4_K_M", use: "Image/document analysis" },
  { name: "InternVL3-8B", type: "Vision", size: "8B", vram: "8 GB", context: "32K", status: "Active", latency: "2.4s avg", quantization: "Q4_K_M", use: "Industrial vision, inspection photos" },
  { name: "Qwen2.5-Omni-7B", type: "Omni", size: "7B", vram: "7 GB", context: "32K", status: "Active", latency: "2.5s avg", quantization: "Q4_K_M", use: "Voice + image + video + text" },
  { name: "Qwen2.5-Omni-3B", type: "Omni", size: "3B", vram: "3 GB", context: "32K", status: "Active", latency: "0.8s avg", quantization: "Q4_K_M", use: "Lightweight omni processing" },
  { name: "Whisper large-v3", type: "Speech", size: "1.5B", vram: "3 GB", context: "30s audio", status: "Active", latency: "Real-time", quantization: "FP16", use: "Speech-to-text only" },
  { name: "BGE-M3", type: "Embedding", size: "0.6B", vram: "2 GB", context: "8192 tokens", status: "Active", latency: "45ms avg", quantization: "FP16", use: "Multilingual embeddings" },
  { name: "BGE-Reranker", type: "Reranking", size: "0.3B", vram: "1 GB", context: "4096 tokens", status: "Active", latency: "30ms avg", quantization: "FP16", use: "Reranking search results" },
];

const typeColors: Record<string, { bg: string; color: string }> = {
  Reasoning: { bg: "#F5F3FF", color: "#7C3AED" },
  General: { bg: "#EFF6FF", color: "#2563EB" },
  Code: { bg: "#F0FDFA", color: "#0F766E" },
  Vision: { bg: "#FEF3C7", color: "#92400E" },
  Speech: { bg: "#F0FDF4", color: "#15803D" },
  Embedding: { bg: "#F1F5F9", color: "#475569" },
  Omni: { bg: "#FAE8FF", color: "#A21CAF" },
  Reranking: { bg: "#E0E7FF", color: "#4338CA" },
};

export default function Models() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Local Models</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>All models run on-premise — no external API calls · MRPL sovereign AI infrastructure</p>
        </div>

        <div className="mb-6 px-5 py-3 rounded flex items-center gap-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
          <span>🟢</span>
          <span className="text-sm font-medium" style={{ color: "#15803D" }}>8 models active · 0 external APIs · Internet: Blocked</span>
          <span className="ml-auto text-xs" style={{ color: "#15803D" }}>Total VRAM: 39 GB / 64 GB available</span>
        </div>

        <div className="space-y-3">
          {models.map((m, i) => (
            <div key={i} className="bg-white rounded border p-5 hover:shadow-sm transition-all" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center font-semibold text-sm flex-shrink-0"
                  style={{ background: typeColors[m.type]?.bg, color: typeColors[m.type]?.color }}
                >
                  {m.name[0]}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{m.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: typeColors[m.type]?.bg, color: typeColors[m.type]?.color, fontSize: 10 }}>{m.type}</span>
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 10 }}>● Active</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>{m.use}</p>
                </div>
                <div className="grid grid-cols-5 gap-6 text-right flex-shrink-0">
                  {[
                    { label: "Size", value: m.size },
                    { label: "VRAM", value: m.vram },
                    { label: "Context", value: m.context },
                    { label: "Avg Latency", value: m.latency },
                    { label: "Quantization", value: m.quantization },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div className="text-xs" style={{ color: "var(--color-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</div>
                      <div className="text-sm font-medium mt-0.5" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
