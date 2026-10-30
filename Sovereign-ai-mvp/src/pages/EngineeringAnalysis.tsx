import { useState, useRef, useEffect } from "react";
import { useNav } from "../context/NavContext";

const capabilities = ["Engineering Calculations", "Equipment Analysis", "Inspection Analysis", "Trend Analysis", "Anomaly Detection", "Risk Assessment", "Historical Comparison", "Technical Report Generation"];

const pipeline = ["Input", "Analysis", "Calculation", "Verification", "Engineer Review", "Output"];

const analysisResult = {
  title: "P-102 Vibration Analysis — CDU-4",
  summary: "Bearing vibration at 8.2 mm/s exceeds SOP threshold of 7.1 mm/s by 15.5%. Historical trend indicates progressive degradation over 3 inspection cycles (2024–2026). Risk assessment: HIGH. Immediate maintenance intervention recommended.",
  findings: [
    { label: "Current Vibration (DE Bearing)", value: "8.2 mm/s", status: "Exceeded", threshold: "7.1 mm/s" },
    { label: "Seal Condition", value: "Leaking", status: "Critical", threshold: "No leakage" },
    { label: "Tray Corrosion (14–18)", value: "Grade 3/5", status: "Elevated", threshold: "Grade 2/5" },
  ],
};

export default function EngineeringAnalysis() {
  const { navigate } = useNav();
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [inputType, setInputType] = useState("Text");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const runAnalysis = () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setShowResult(false);
    setActiveStep(0);
    
    let step = 0;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (step < pipeline.length - 1) {
        step++;
        setActiveStep(step);
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsAnalyzing(false);
        setShowResult(true);
        setActiveStep(null);
      }
    }, 1000);
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => navigate("workbench")}
            className="w-9 h-9 rounded-lg bg-white border hover:bg-slate-50 text-slate-900 flex items-center justify-center transition-colors shadow-sm flex-shrink-0"
            style={{ borderColor: "var(--color-border)" }}
            title="Back to Workbench"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Engineering Analysis</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>AI-assisted engineering analysis — all outputs require engineer review</p>
          </div>
        </div>

        {/* Capabilities */}
        <div className="flex flex-wrap gap-2 mb-6">
          {capabilities.map((cap) => (
            <span key={cap} className="text-xs px-2.5 py-1 rounded border font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)", background: "white", fontSize: 11 }}>
              {cap}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-6">
          {/* Left — Input */}
          <div className="col-span-2 space-y-4">
            <div className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Analysis Input</div>
              <div className="flex gap-1 mb-3">
                {["Text", "Table", "Image", "PDF", "Sensor Data"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setInputType(t)}
                    className="flex-1 text-xs py-1.5 rounded transition-colors font-medium"
                    style={{
                      background: inputType === t ? "var(--color-teal)" : "var(--color-surface-subtle)",
                      color: inputType === t ? "white" : "var(--color-text-muted)",
                      fontSize: 10,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                rows={6}
                placeholder="Describe the equipment, provide measurement data, or upload relevant files for analysis..."
                className="w-full px-3 py-2.5 text-sm rounded border outline-none resize-none"
                defaultValue="Analyze pump P-102 bearing vibration data from the Aug 2026 inspection report. Compare with historical data from 2024 and 2025. Assess risk and recommend maintenance actions."
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", fontSize: 13 }}
              />
              <div className="flex gap-2 mt-3">
                <button className="text-xs px-3 py-1.5 rounded border font-medium hover:bg-slate-50 transition-colors" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Attach Files</button>
                <button onClick={runAnalysis} disabled={isAnalyzing} className="flex-1 text-xs py-1.5 rounded font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50" style={{ background: "var(--color-teal)" }}>
                  {isAnalyzing ? "Analyzing..." : "Run Analysis"}
                </button>
              </div>
            </div>

            {/* Pipeline */}
            <div className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-semibold text-sm mb-4" style={{ color: "var(--color-text-primary)" }}>Analysis Pipeline</div>
              <div className="space-y-2">
                {pipeline.map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      style={{
                        background: activeStep !== null && i < activeStep ? "var(--color-teal)" : i === activeStep ? "#EFF6FF" : "var(--color-border)",
                        color: activeStep !== null && i < activeStep ? "white" : i === activeStep ? "var(--color-blue)" : "var(--color-text-muted)",
                        border: i === activeStep ? "1.5px solid var(--color-blue)" : "none",
                        fontSize: 10,
                      }}
                    >
                      {activeStep !== null && i < activeStep ? "✓" : i + 1}
                    </div>
                    <span className="text-xs font-medium" style={{ color: activeStep !== null && i < activeStep ? "var(--color-teal)" : i === activeStep ? "var(--color-blue)" : "var(--color-text-muted)" }}>
                      {step}
                    </span>
                    {i === activeStep && (
                      <span className="text-xs px-2 py-0.5 rounded ml-auto" style={{ background: "#EFF6FF", color: "var(--color-blue)", fontSize: 10 }}>Active</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Results */}
          <div className="col-span-3 space-y-4">
            {!showResult ? (
              <div className="bg-white rounded border p-12 text-center flex flex-col items-center justify-center h-full" style={{ borderColor: "var(--color-border)" }}>
                {isAnalyzing ? (
                  <div className="text-sm font-medium animate-pulse" style={{ color: "var(--color-text-muted)" }}>Analyzing data...</div>
                ) : (
                  <div className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>Ready to analyze. Provide input and click "Run Analysis".</div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{analysisResult.title}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 10 }}>Risk: HIGH</span>
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#DBEAFE", color: "#1D4ED8", fontSize: 10 }}>Engineering Agent</span>
                  </div>
                </div>
                <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>{analysisResult.summary}</p>
  
                <div className="space-y-3">
                  {analysisResult.findings.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded border" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-subtle)" }}>
                      <div className="flex-1">
                        <div className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>{f.label}</div>
                        <div className="text-sm font-semibold mt-0.5" style={{ color: "var(--color-text-primary)" }}>{f.value}</div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Threshold: {f.threshold}</div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0" style={{
                        background: f.status === "Exceeded" || f.status === "Critical" ? "#FEE2E2" : "#FEF3C7",
                        color: f.status === "Exceeded" || f.status === "Critical" ? "#991B1B" : "#92400E",
                        fontSize: 10,
                      }}>
                        {f.status}
                      </span>
                    </div>
                  ))}
                </div>
  
                {/* Verification */}
                <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Verification</div>
                  <div className="flex gap-4">
                    {["Evidence Found", "Calculation Verified", "SOP Referenced", "Permissions Valid"].map((v) => (
                      <div key={v} className="flex items-center gap-1 text-xs" style={{ color: "var(--color-success)" }}>
                        <span>✓</span> <span>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
  
                <div className="mt-4 pt-4 border-t flex gap-2" style={{ borderColor: "var(--color-border)" }}>
                  <div className="text-xs px-3 py-2 rounded flex-1 text-center font-medium" style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>
                    ⚠ Engineering Review Required — AI analysis is not a certified engineering assessment
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="flex-1 text-xs py-2 rounded border font-medium hover:bg-slate-50 transition-colors" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>View Evidence</button>
                  <button className="flex-1 text-xs py-2 rounded font-medium text-white transition-colors hover:bg-teal-700" style={{ background: "var(--color-teal)" }}>Generate Report</button>
                  <button className="flex-1 text-xs py-2 rounded border font-medium hover:bg-slate-50 transition-colors" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Request Approval</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
