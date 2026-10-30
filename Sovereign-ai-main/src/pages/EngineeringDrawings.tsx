import { useState } from "react";

const workflowSteps = ["Requirement", "Engineering Agent", "Structured Specification", "Drawing Generation", "Validation", "Engineer Review", "DXF / SVG / PDF"];

export default function EngineeringDrawings() {
  const [activeStep, setActiveStep] = useState(3);
  const [requirement, setRequirement] = useState("Generate a preliminary P&ID schematic for the CDU-4 reflux pump circuit, including P-102A/B, control valves FV-102 and FV-103, pressure indicators, and associated isolation valves.");
  const [qaInput, setQaInput] = useState("");

  const downloadDrawing = (fmt: string) => {
    let content = "";
    if (fmt === "SVG") {
      content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 380"><text y="20" font-family="sans-serif">MRPL-CDU4-PID-012 — AI-GENERATED PRELIMINARY DRAFT</text></svg>`;
    } else {
      content = `Mock ${fmt} binary content for MRPL-CDU4-PID-012`;
    }

    const mime = fmt === "SVG" ? "image/svg+xml" : "application/octet-stream";
    const ext = fmt.toLowerCase();

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MRPL-CDU4-PID-012.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Engineering Drawings</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>AI-assisted drawing generation — all outputs require qualified engineer review and certification</p>
        </div>

        {/* AI Warning */}
        <div className="mb-6 px-5 py-3.5 rounded flex items-center gap-3" style={{ background: "#FEF3C7", border: "1.5px solid #FDE68A" }}>
          <span className="text-lg">⚠</span>
          <div>
            <div className="font-semibold text-sm" style={{ color: "#92400E" }}>AI-GENERATED — ENGINEERING REVIEW REQUIRED</div>
            <div className="text-xs mt-0.5" style={{ color: "#92400E" }}>Drawings produced by this tool are preliminary AI-generated schematics only. They are not certified engineering drawings and must be reviewed, validated, and approved by a qualified engineer before any operational use.</div>
          </div>
        </div>

        {/* Workflow */}
        <div className="bg-white rounded border p-5 mb-6" style={{ borderColor: "var(--color-border)" }}>
          <div className="font-semibold text-sm mb-4" style={{ color: "var(--color-text-primary)" }}>Drawing Generation Workflow</div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {workflowSteps.map((step, i) => (
              <div key={step} className="flex items-center gap-2 flex-shrink-0">
                <div
                  className="flex flex-col items-center gap-1.5 cursor-pointer"
                  onClick={() => setActiveStep(i)}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2"
                    style={{
                      borderColor: i <= activeStep ? "var(--color-teal)" : "var(--color-border)",
                      background: i < activeStep ? "var(--color-teal)" : i === activeStep ? "#F0FDFA" : "white",
                      color: i < activeStep ? "white" : i === activeStep ? "var(--color-teal)" : "var(--color-text-muted)",
                    }}
                  >
                    {i < activeStep ? "✓" : i + 1}
                  </div>
                  <span className="text-xs text-center" style={{ color: i <= activeStep ? "var(--color-teal)" : "var(--color-text-muted)", fontSize: 10, width: 72 }}>
                    {step}
                  </span>
                </div>
                {i < workflowSteps.length - 1 && (
                  <div className="h-0.5 w-8 mb-4 flex-shrink-0" style={{ background: i < activeStep ? "var(--color-teal)" : "var(--color-border)" }} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-6">
          {/* Input panel */}
          <div className="col-span-2 space-y-4">
            <div className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Engineering Requirement</div>
              <textarea
                rows={5}
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded border outline-none resize-none"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", fontSize: 13 }}
              />
              <div className="mt-3 space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Drawing Type</label>
                  <select className="w-full text-sm border rounded px-3 py-2 outline-none" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
                    <option>P&ID (Piping & Instrumentation)</option>
                    <option>PFD (Process Flow Diagram)</option>
                    <option>Isometric Drawing</option>
                    <option>Equipment Layout</option>
                    <option>Electrical Single-Line</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Standard</label>
                  <select className="w-full text-sm border rounded px-3 py-2 outline-none" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
                    <option>ISA 5.1 — Instrumentation</option>
                    <option>ISO 10628 — P&ID</option>
                    <option>ASME Y14.5</option>
                  </select>
                </div>
              </div>
              <button className="w-full mt-4 text-sm py-2 rounded font-medium text-white" style={{ background: "var(--color-teal)" }}>
                Generate Drawing
              </button>
            </div>

            {/* Specification */}
            <div className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Structured Specification</div>
              <div className="space-y-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {[
                  ["Title", "CDU-4 Reflux Pump P&ID"],
                  ["Equipment", "P-102A, P-102B"],
                  ["Control Valves", "FV-102, FV-103"],
                  ["Instrumentation", "PI-301, PI-302, FI-102"],
                  ["Standard", "ISA 5.1"],
                  ["Drawing No.", "MRPL-CDU4-PID-012-DRAFT"],
                  ["Status", "AI-Generated / Preliminary"],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="font-medium flex-shrink-0 w-28" style={{ color: "var(--color-text-muted)" }}>{k}:</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Drawing Canvas */}
          <div className="col-span-3">
            <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                <div className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Drawing Preview</div>
                <div className="flex gap-2">
                  {["SVG", "DXF", "PDF"].map((fmt) => (
                    <button key={fmt} onClick={() => downloadDrawing(fmt)} className="text-xs px-2.5 py-1 rounded border font-medium hover:bg-slate-50 transition-colors" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)", fontSize: 11 }}>↓ {fmt}</button>
                  ))}
                </div>
              </div>
              {/* SVG P&ID sketch */}
              <div className="p-6" style={{ background: "#FAFAFA" }}>
                <div className="text-center text-xs font-medium mb-4" style={{ color: "var(--color-text-muted)" }}>
                  MRPL-CDU4-PID-012 — AI-GENERATED PRELIMINARY DRAFT
                </div>
                <svg viewBox="0 0 600 380" className="w-full" style={{ border: "1px solid var(--color-border)", background: "white" }}>
                  {/* Feed line */}
                  <line x1="30" y1="190" x2="120" y2="190" stroke="#0F172A" strokeWidth="2" />
                  <text x="50" y="180" fontSize="9" fill="#475569">Feed</text>

                  {/* Pump P-102A */}
                  <circle cx="145" cy="190" r="22" fill="white" stroke="#0F766E" strokeWidth="1.5" />
                  <line x1="125" y1="190" x2="165" y2="190" stroke="#0F766E" strokeWidth="1.5" />
                  <line x1="145" y1="170" x2="145" y2="210" stroke="#0F766E" strokeWidth="1.5" />
                  <text x="140" y="224" fontSize="9" fill="#0F766E" fontWeight="600">P-102A</text>

                  {/* Control valve FV-102 */}
                  <line x1="167" y1="190" x2="230" y2="190" stroke="#0F172A" strokeWidth="2" />
                  <polygon points="220,178 240,190 220,202" fill="white" stroke="#2563EB" strokeWidth="1.5" />
                  <line x1="230" y1="178" x2="230" y2="162" stroke="#2563EB" strokeWidth="1.5" />
                  <circle cx="230" cy="158" r="8" fill="white" stroke="#2563EB" strokeWidth="1.5" />
                  <text x="225" y="215" fontSize="9" fill="#2563EB">FV-102</text>

                  {/* Continue line */}
                  <line x1="240" y1="190" x2="320" y2="190" stroke="#0F172A" strokeWidth="2" />

                  {/* Pressure indicator PI-301 */}
                  <line x1="280" y1="190" x2="280" y2="158" stroke="#0F172A" strokeWidth="1.5" />
                  <circle cx="280" cy="148" r="12" fill="white" stroke="#475569" strokeWidth="1.5" />
                  <text x="274" y="152" fontSize="8" fill="#475569">PI</text>
                  <text x="270" y="136" fontSize="8" fill="#475569">301</text>

                  {/* Tower / Vessel */}
                  <rect x="320" y="120" width="80" height="140" rx="4" fill="white" stroke="#0F172A" strokeWidth="2" />
                  <text x="340" y="195" fontSize="9" fill="#0F172A" fontWeight="600">CDU-4</text>
                  <text x="340" y="206" fontSize="8" fill="#475569">Reflux</text>

                  {/* Return line from tower */}
                  <line x1="400" y1="190" x2="470" y2="190" stroke="#0F172A" strokeWidth="2" />
                  <text x="425" y="180" fontSize="9" fill="#475569">Reflux out</text>

                  {/* Pump P-102B (standby) */}
                  <circle cx="145" cy="290" r="22" fill="white" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4,2" />
                  <line x1="125" y1="290" x2="165" y2="290" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4,2" />
                  <line x1="145" y1="270" x2="145" y2="310" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4,2" />
                  <text x="137" y="324" fontSize="9" fill="#94A3B8">P-102B</text>
                  <text x="125" y="335" fontSize="8" fill="#94A3B8">(Standby)</text>

                  {/* Crossover */}
                  <line x1="145" y1="268" x2="145" y2="212" stroke="#475569" strokeWidth="1.5" />

                  {/* Border */}
                  <rect x="5" y="5" width="590" height="370" fill="none" stroke="#E2E8F0" strokeWidth="1" />

                  {/* Title block */}
                  <rect x="5" y="345" width="590" height="30" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1" />
                  <text x="15" y="364" fontSize="9" fill="#475569" fontWeight="600">MRPL — CDU-4 Reflux Pump Circuit P&ID — Preliminary AI Draft</text>
                  <text x="450" y="364" fontSize="9" fill="#DC2626" fontWeight="600">⚠ NOT FOR CONSTRUCTION</text>
                </svg>
                <div className="mt-3 text-center text-xs font-semibold py-2 rounded" style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>
                  AI-GENERATED — ENGINEERING REVIEW REQUIRED BEFORE USE
                </div>
              </div>
              <div className="border-t p-4 flex items-center gap-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-subtle)" }}>
                <input 
                  type="text" 
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  placeholder="Ask the Engineering Agent to review or modify this drawing..." 
                  className="flex-1 px-3 py-2 text-sm rounded border outline-none bg-white" 
                  style={{ borderColor: "var(--color-border)" }}
                />
                <button className="text-sm px-4 py-2 rounded font-medium text-white transition-colors hover:bg-teal-700" style={{ background: "var(--color-teal)" }}>
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
