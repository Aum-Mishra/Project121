import { useState } from "react";

const notebooks = [
  { name: "CDU-4 Reliability Research", sources: 24, docs: 12, reports: 8, sops: 3, historical: 1, updated: "16 Sep 2026", cls: "CONFIDENTIAL" },
  { name: "Pump P-102 Failure Analysis", sources: 11, docs: 6, reports: 4, sops: 1, historical: 0, updated: "14 Sep 2026", cls: "CONFIDENTIAL" },
  { name: "Vendor CX-4 Technical Review", sources: 7, docs: 5, reports: 0, sops: 0, historical: 2, updated: "12 Sep 2026", cls: "INTERNAL" },
];

const notebookTabs = ["Overview", "Sources", "Chat", "Notes", "Findings", "Timeline"];

const chatMessages = [
  { role: "user", text: "Compare the last three inspection reports for CDU-4." },
  { role: "ai", text: "Based on 3 inspection reports in this notebook (2024, 2025, 2026):\n\n**2024:** No critical deviations. Minor corrosion on trays 14–18.\n\n**2025:** Tray corrosion progressed. Vibration elevated on pump P-102 DE bearing (5.8 mm/s).\n\n**2026:** Critical deviation — P-102 bearing vibration at 8.2 mm/s, exceeding SOP threshold of 7.1 mm/s. Seal leakage confirmed.\n\n**Trend:** Progressive degradation over 3 cycles. Recommend priority maintenance intervention.", citations: ["Inspection Report 2024, p.7", "Inspection Report 2025, p.12", "Inspection Report 2026, p.5"] },
];

export default function ResearchNotebooks() {
  const [activeNotebook, setActiveNotebook] = useState<number | null>(0);
  const [activeTab, setActiveTab] = useState("Chat");
  const [input, setInput] = useState("");
  const [sourceGrounded, setSourceGrounded] = useState(true);
  const [messages, setMessages] = useState(chatMessages);
  const [isTyping, setIsTyping] = useState(false);

  const nb = activeNotebook !== null ? notebooks[activeNotebook] : null;

  const handleAsk = () => {
    if (!input.trim() || isTyping) return;
    const userMsg = { role: "user", text: input };
    setMessages([...messages, userMsg]);
    setInput("");
    setIsTyping(true);
    
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: "ai", 
        text: "Based on the internal notebook sources, I have analyzed your request.\n\nThe anomaly is likely linked to the recent vibration reports we reviewed. I recommend checking the P-102 pump metrics.", 
        citations: ["P-102 Maintenance Log", "Vibration Thresholds SOP"]
      }]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="flex h-full" style={{ background: "#F7F9FC" }}>
      {/* Sidebar */}
      <div className="w-72 border-r bg-white flex-shrink-0 flex flex-col" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h1 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Research Notebooks</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Source-grounded AI research</p>
          </div>
          <button className="text-xs px-3 py-1.5 rounded font-medium text-white" style={{ background: "var(--color-teal)", fontSize: 11 }}>+ New</button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {notebooks.map((nb, i) => (
            <button
              key={i}
              onClick={() => setActiveNotebook(i)}
              className="w-full text-left px-4 py-4 border-b hover:bg-slate-50 transition-colors"
              style={{
                borderColor: "var(--color-border)",
                background: activeNotebook === i ? "#F0FDFA" : "transparent",
                borderRight: activeNotebook === i ? "2px solid var(--color-teal)" : "2px solid transparent",
              }}
            >
              <div className="font-medium text-sm" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{nb.name}</div>
              <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{nb.sources} sources · Updated {nb.updated}</div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#FEF3C7", color: "#92400E", fontSize: 10 }}>{nb.cls}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      {nb ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-white border-b px-6 py-4 flex-shrink-0" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-lg" style={{ color: "var(--color-text-primary)" }}>{nb.name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{nb.docs} documents</span>
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{nb.reports} inspection reports</span>
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{nb.sops} SOPs</span>
                  {nb.historical > 0 && <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{nb.historical} historical analysis</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Source-grounded:</span>
                  <button
                    onClick={() => setSourceGrounded(!sourceGrounded)}
                    className="w-10 h-5 rounded-full transition-colors relative"
                    style={{ background: sourceGrounded ? "var(--color-teal)" : "#CBD5E1" }}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                      style={{ transform: sourceGrounded ? "translateX(22px)" : "translateX(2px)" }}
                    />
                  </button>
                </div>
                <button className="text-xs px-3 py-1.5 rounded border font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Export</button>
              </div>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 mt-3">
              {notebookTabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                  style={{
                    background: activeTab === t ? "var(--color-teal)" : "transparent",
                    color: activeTab === t ? "white" : "var(--color-text-muted)",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex">
            {activeTab === "Chat" && (
              <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  {sourceGrounded && (
                    <div className="flex items-center gap-2 text-xs px-3 py-2 rounded" style={{ background: "#F0FDFA", border: "1px solid #A7F3D0", color: "var(--color-teal)" }}>
                      <span>🟢</span>
                      <span>Source-grounded mode active — AI answers use only this notebook's sources</span>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-2xl">
                        <div
                          className="rounded-lg px-4 py-3 text-sm"
                          style={{
                            background: msg.role === "user" ? "var(--color-teal)" : "white",
                            color: msg.role === "user" ? "white" : "var(--color-text-primary)",
                            border: msg.role === "ai" ? "1px solid var(--color-border)" : "none",
                            whiteSpace: "pre-wrap",
                            fontSize: 13,
                          }}
                        >
                          {msg.text}
                        </div>
                        {msg.role === "ai" && msg.citations && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {msg.citations.map((c) => (
                              <span key={c} className="text-xs px-2 py-0.5 rounded border font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)", background: "var(--color-surface-subtle)", fontSize: 11 }}>
                                📄 {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2 bg-white border" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t bg-white px-5 py-4 flex-shrink-0" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                      placeholder="Ask about this notebook's sources..."
                      className="flex-1 px-4 py-2 text-sm rounded border outline-none"
                      style={{ borderColor: "var(--color-border)", fontSize: 13 }}
                    />
                    <button onClick={handleAsk} disabled={isTyping} className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50" style={{ background: "var(--color-teal)" }}>Ask</button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "Findings" && (
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-3 max-w-2xl">
                  {[
                    { finding: "P-102 bearing vibration exceeds SOP threshold by 15.5%", source: "Inspection Report 2026, p.5", severity: "Critical", verified: true },
                    { finding: "Mechanical seal leakage confirmed — maintenance overdue by 8 days", source: "SOP P-102 Rev 3.2 + Inspection Report 2026", severity: "High", verified: true },
                    { finding: "Tray corrosion progression observed across 3 inspection cycles (2024–2026)", source: "Inspection Reports 2024/2025/2026", severity: "Medium", verified: true },
                  ].map((f, i) => (
                    <div key={i} className="bg-white rounded border px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
                      <div className="flex items-start gap-3">
                        <span className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 mt-0.5" style={{
                          background: f.severity === "Critical" ? "#FEE2E2" : f.severity === "High" ? "#FEF3C7" : "#DBEAFE",
                          color: f.severity === "Critical" ? "#991B1B" : f.severity === "High" ? "#92400E" : "#1D4ED8",
                          fontSize: 10,
                        }}>{f.severity}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{f.finding}</p>
                          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Source: {f.source}</p>
                        </div>
                        {f.verified && <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 10 }}>✓ Verified</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(activeTab !== "Chat" && activeTab !== "Findings") && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  <div className="text-2xl mb-2 opacity-30">◉</div>
                  <div>{activeTab} — Content for {nb.name}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-3 opacity-20">◉</div>
            <div className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>Select a notebook</div>
          </div>
        </div>
      )}
    </div>
  );
}
