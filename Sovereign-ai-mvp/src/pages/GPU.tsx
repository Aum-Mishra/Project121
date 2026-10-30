const gpus = [
  { name: "NVIDIA A100 80GB (GPU-0)", util: 72, vram: "58/80 GB", temp: "74°C", power: "285W / 400W", tokens: "1,240 tok/s", model: "Reasoning Model (QwQ-32B)" },
  { name: "NVIDIA A100 80GB (GPU-1)", util: 45, vram: "21/80 GB", temp: "68°C", power: "196W / 400W", tokens: "880 tok/s", model: "Coding Model (CodeLLaMA-34B)" },
  { name: "NVIDIA RTX 4090 24GB (GPU-2)", util: 88, vram: "22/24 GB", temp: "82°C", power: "350W / 450W", tokens: "2,100 tok/s", model: "Small LLM + Vision" },
];

const services = [
  { name: "Multithreading — I/O / Retrieval / DB", threads: "8 active", color: "#2563EB" },
  { name: "Multiprocessing — OCR / Parsing / Analysis", procs: "4 active", color: "#7C3AED" },
  { name: "GPU — LLM / Vision / Embeddings", models: "3 loaded", color: "#0F766E" },
  { name: "Multi-GPU — Load Balancing", dist: "2/3 GPUs", color: "#D97706" },
];

const jobs = [
  { id: "JOB-441", type: "LLM Inference", model: "QwQ-32B", gpu: "GPU-0", status: "Running", latency: "8.2s", queued: 0 },
  { id: "JOB-442", type: "Embedding", model: "BGE-M3", gpu: "GPU-0", status: "Running", latency: "45ms", queued: 3 },
  { id: "JOB-443", type: "OCR Processing", model: "—", gpu: "CPU", status: "Running", latency: "1.2s", queued: 0 },
  { id: "JOB-444", type: "Code Execution", model: "—", gpu: "Sandbox", status: "Queued", latency: "—", queued: 1 },
  { id: "JOB-445", type: "Vision Analysis", model: "LLaVA-13B", gpu: "GPU-2", status: "Running", latency: "3.1s", queued: 0 },
];

export default function GPU() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Compute & GPU</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>Local GPU infrastructure — all inference runs on-premise</p>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: "GPU Utilization", value: "68%", sub: "avg across 3 GPUs", color: "var(--color-teal)" },
            { label: "VRAM Total", value: "101 / 184 GB", sub: "3 GPUs", color: "var(--color-blue)" },
            { label: "Inference Tokens/s", value: "4,220", sub: "combined throughput", color: "#7C3AED" },
            { label: "Active Jobs", value: "4", sub: "1 queued", color: "var(--color-warning)" },
            { label: "CPU Threads", value: "8", sub: "I/O & retrieval", color: "var(--color-info)" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded border px-4 py-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="text-xs mb-1" style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{kpi.label}</div>
              <div className="text-xl font-semibold" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Architecture */}
        <div className="bg-white rounded border p-5 mb-6" style={{ borderColor: "var(--color-border)" }}>
          <div className="font-semibold text-sm mb-4" style={{ color: "var(--color-text-primary)" }}>Compute Architecture</div>
          <div className="flex items-center gap-4 overflow-x-auto pb-2">
            {["User Request", "Request Scheduler", "CPU Threads (I/O)", "GPU Model Server", "Result Cache", "Response"].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-4 flex-shrink-0">
                <div className="px-4 py-2.5 rounded text-xs font-medium text-center" style={{ background: "var(--color-surface-subtle)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", minWidth: 110 }}>
                  {step}
                </div>
                {i < arr.length - 1 && <span style={{ color: "var(--color-text-muted)" }}>→</span>}
              </div>
            ))}
          </div>

          {/* Parallel execution visualization */}
          <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
            <div className="text-xs font-semibold mb-3" style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Parallel Processing Model</div>
            <div className="grid grid-cols-4 gap-3">
              {services.map((svc) => (
                <div key={svc.name} className="px-4 py-3 rounded border" style={{ borderColor: "var(--color-border)", borderLeft: `3px solid ${svc.color}` }}>
                  <div className="text-xs font-medium" style={{ color: "var(--color-text-primary)", fontSize: 12 }}>{svc.name}</div>
                  <div className="text-xs mt-1" style={{ color: svc.color }}>
                    {svc.threads || svc.procs || svc.models || svc.dist}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GPU Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {gpus.map((gpu) => (
            <div key={gpu.name} className="bg-white rounded border px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-medium text-sm mb-3" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{gpu.name}</div>
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Utilization</span>
                  <span className="text-xs font-semibold" style={{ color: gpu.util > 80 ? "var(--color-warning)" : "var(--color-teal)" }}>{gpu.util}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${gpu.util}%`, background: gpu.util > 80 ? "var(--color-warning)" : "var(--color-teal)" }} />
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: "VRAM", value: gpu.vram },
                  { label: "Temp", value: gpu.temp },
                  { label: "Power", value: gpu.power },
                  { label: "Throughput", value: gpu.tokens },
                  { label: "Active Model", value: gpu.model },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <span style={{ color: "var(--color-text-muted)" }}>{item.label}</span>
                    <span className="font-medium" style={{ color: "var(--color-text-secondary)", fontSize: 11 }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Job Queue */}
        <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-5 py-3.5 border-b font-semibold text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
            Job Queue
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Job ID", "Type", "Model", "Compute", "Status", "Latency", "Queue"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, i) => (
                <tr key={job.id} className="hover:bg-slate-50" style={{ borderBottom: i < jobs.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{job.id}</td>
                  <td className="px-5 py-3 text-sm" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{job.type}</td>
                  <td className="px-5 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>{job.model}</td>
                  <td className="px-5 py-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>{job.gpu}</td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: job.status === "Running" ? "#15803D" : "#92400E" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: job.status === "Running" ? "#15803D" : "#D97706" }} />
                      {job.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>{job.latency}</td>
                  <td className="px-5 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>{job.queued} waiting</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
