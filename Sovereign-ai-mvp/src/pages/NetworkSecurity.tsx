export default function NetworkSecurity() {
  const nodes = [
    { label: "MRPL User", sub: "MRPL Intranet / VPN", color: "var(--color-teal)", icon: "◯" },
    { label: "Secure AI Gateway", sub: "TLS 1.3 · Auth · Rate Limit", color: "var(--color-blue)", icon: "⊠" },
    { label: "Workbench Backend", sub: "API · Security · RBAC", color: "var(--color-teal)", icon: "⬡" },
    { label: "Local Model Server", sub: "Ollama · On-premise GPU", color: "var(--color-teal)", icon: "▣" },
    { label: "GPU Infrastructure", sub: "A100 × 2 · RTX 4090", color: "#7C3AED", icon: "▦" },
  ];

  const policies = [
    { name: "Ingress Policy — User → Gateway", status: "Enforced", detail: "MRPL VPN only · MFA required · TLS" },
    { name: "Service Mesh — Internal Traffic", status: "Enforced", detail: "Cilium eBPF · Mutual TLS · Pod-to-Pod" },
    { name: "Egress Policy — All External Traffic", status: "Blocked", detail: "0 external connections permitted · Cilium netpol" },
    { name: "DNS Policy", status: "Enforced", detail: "Internal DNS only · No external resolution" },
    { name: "Model Server Isolation", status: "Enforced", detail: "Ollama · No public endpoints · GPU network isolated" },
    { name: "Sandbox Network Policy", status: "Enforced", detail: "Sandbox containers — network completely disabled" },
  ];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Network Security</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>Zero-trust network architecture · Cilium + Hubble enforcement</p>
        </div>

        {/* Internet Egress Banner */}
        <div className="mb-6 px-5 py-4 rounded border" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <div className="flex items-center gap-3">
            <span className="text-xl">🚫</span>
            <div>
              <div className="font-semibold text-sm" style={{ color: "#991B1B" }}>Internet Egress: BLOCKED</div>
              <div className="text-xs mt-0.5" style={{ color: "#B91C1C" }}>All outbound internet traffic is blocked by Cilium network policies. No data can leave the MRPL sovereign environment.</div>
            </div>
            <div className="ml-auto flex flex-col items-end">
              <span className="text-xs font-semibold" style={{ color: "var(--color-danger)" }}>0 egress connections</span>
              <span className="text-xs" style={{ color: "#B91C1C" }}>Last 24 hours</span>
            </div>
          </div>
        </div>

        {/* Architecture */}
        <div className="bg-white rounded border p-6 mb-6" style={{ borderColor: "var(--color-border)" }}>
          <div className="font-semibold text-sm mb-5" style={{ color: "var(--color-text-primary)" }}>Network Architecture</div>
          <div className="flex flex-col items-center gap-2">
            {nodes.map((node, i) => (
              <div key={node.label} className="flex flex-col items-center w-full max-w-sm">
                <div
                  className="w-full px-5 py-3 rounded border text-center"
                  style={{ borderColor: node.color, background: "#F8FAFC" }}
                >
                  <div className="font-semibold text-sm" style={{ color: node.color }}>{node.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{node.sub}</div>
                </div>
                {i < nodes.length - 1 && (
                  <div className="flex flex-col items-center my-1">
                    <div className="w-0.5 h-4" style={{ background: "var(--color-border)" }} />
                    <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>↓</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* External internet blocked */}
          <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center justify-center gap-4">
              <div className="px-5 py-3 rounded border text-center" style={{ borderColor: "var(--color-danger)", background: "#FEF2F2" }}>
                <div className="font-semibold text-sm" style={{ color: "var(--color-danger)" }}>🌐 Internet</div>
                <div className="text-xs font-medium mt-0.5" style={{ color: "var(--color-danger)" }}>🚫 BLOCKED</div>
              </div>
              <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>← No connection permitted →</div>
              <div className="px-5 py-3 rounded border text-center" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-subtle)" }}>
                <div className="font-semibold text-sm" style={{ color: "var(--color-text-secondary)" }}>MRPL Network</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--color-success)" }}>🟢 Isolated</div>
              </div>
            </div>
          </div>
        </div>

        {/* Network Policies */}
        <div className="bg-white rounded border overflow-hidden mb-6" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-5 py-3.5 border-b font-semibold text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
            Network Policies (Cilium)
          </div>
          {policies.map((p, i) => (
            <div key={p.name} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50" style={{ borderBottom: i < policies.length - 1 ? "1px solid var(--color-border)" : "none" }}>
              <div className="flex-1">
                <div className="font-medium text-sm" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{p.name}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{p.detail}</div>
              </div>
              <span
                className="text-xs px-2 py-1 rounded font-medium"
                style={{
                  background: p.status === "Blocked" ? "#FEE2E2" : "#DCFCE7",
                  color: p.status === "Blocked" ? "var(--color-danger)" : "var(--color-success)",
                  fontSize: 11,
                }}
              >
                {p.status === "Blocked" ? "🚫 " : "✓ "}{p.status}
              </span>
            </div>
          ))}
        </div>

        {/* Hubble traffic */}
        <div className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Hubble Traffic Visibility</div>
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#DCFCE7", color: "#15803D" }}>Live</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Internal Flows / hr", value: "24,841", color: "var(--color-teal)" },
              { label: "Denied Flows / hr", value: "3", color: "var(--color-warning)" },
              { label: "Egress Attempts Blocked", value: "0", color: "var(--color-success)" },
            ].map((stat) => (
              <div key={stat.label} className="px-4 py-3 rounded" style={{ background: "var(--color-surface-subtle)", border: "1px solid var(--color-border)" }}>
                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{stat.label}</div>
                <div className="text-xl font-semibold mt-1" style={{ color: stat.color }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
