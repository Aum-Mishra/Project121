import { useState } from "react";

const tabDefs = [
  { id: "TEXT", tasks: ["Document Analysis", "Summarization", "Q&A", "Translation"] },
  { id: "IMAGE", tasks: ["Inspection Images", "Engineering Drawings", "Equipment Photos", "Scanned Documents"] },
  { id: "DOCUMENT", tasks: ["Scanned PDFs", "Tables", "Forms", "Handwritten Notes"] },
  { id: "VOICE", tasks: ["Meeting Transcription", "Voice Query", "Inspection Notes", "Dictation"] },
  { id: "VIDEO", tasks: ["Equipment Inspection", "Safety Review", "Incident Analysis", "Training Material"] },
];

export default function MultimodalWorkspace() {
  const [activeTab, setActiveTab] = useState("IMAGE");

  const tab = tabDefs.find((t) => t.id === activeTab)!;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Multimodal AI Workspace</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>Process images, documents, voice, and video using local sovereign AI models</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabDefs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="px-5 py-2.5 rounded border font-semibold text-sm transition-all"
              style={{
                borderColor: activeTab === t.id ? "var(--color-teal)" : "var(--color-border)",
                background: activeTab === t.id ? "var(--color-teal)" : "white",
                color: activeTab === t.id ? "white" : "var(--color-text-secondary)",
              }}
            >
              {t.id}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Input Area */}
          <div className="col-span-2 space-y-4">
            <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              <div className="px-5 py-3 border-b font-semibold text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
                {activeTab === "IMAGE" ? "Image Analysis" : activeTab === "VOICE" ? "Voice Input" : activeTab === "VIDEO" ? "Video Analysis" : activeTab === "DOCUMENT" ? "Document Processing" : "Text Analysis"}
              </div>

              {/* Upload area */}
              <div
                className="m-5 rounded-lg border-2 border-dashed flex flex-col items-center justify-center py-12 cursor-pointer hover:bg-slate-50 transition-colors"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="text-3xl mb-3 opacity-30">
                  {activeTab === "IMAGE" ? "🖼" : activeTab === "VOICE" ? "🎤" : activeTab === "VIDEO" ? "🎬" : activeTab === "DOCUMENT" ? "📄" : "📝"}
                </div>
                <div className="font-medium text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  {activeTab === "IMAGE" ? "Drop inspection images, drawings, or equipment photos" :
                   activeTab === "VOICE" ? "Click to record or drop audio files" :
                   activeTab === "VIDEO" ? "Drop video files for inspection or safety review" :
                   activeTab === "DOCUMENT" ? "Drop scanned PDFs, forms, or handwritten notes" :
                   "Type or paste text for analysis"}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {activeTab === "IMAGE" ? "PNG, JPG, TIF, SVG, DXF — all processing local" :
                   activeTab === "VOICE" ? "MP3, WAV, M4A — transcription runs on-device" :
                   activeTab === "VIDEO" ? "MP4, AVI, MOV — vision model runs locally" :
                   "PDF, DOCX, TIFF — OCR and parsing on-premise" }
                </div>
                <button className="mt-4 text-xs px-4 py-2 rounded font-medium text-white" style={{ background: "var(--color-teal)" }}>
                  Select Files
                </button>
              </div>

              {/* Task selection */}
              <div className="px-5 pb-5">
                <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Analysis Tasks</div>
                <div className="flex flex-wrap gap-2">
                  {tab.tasks.map((task) => (
                    <button key={task} className="text-xs px-3 py-1.5 rounded border font-medium hover:bg-teal-50 transition-colors" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)", fontSize: 11 }}>
                      {task}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  placeholder="Describe what you want to extract, analyze, or understand from this input..."
                  className="w-full mt-3 px-3 py-2.5 text-sm rounded border outline-none resize-none"
                  style={{ borderColor: "var(--color-border)", fontSize: 13 }}
                />
                <button className="w-full mt-3 text-sm py-2 rounded font-medium text-white" style={{ background: "var(--color-teal)" }}>
                  Process with AI
                </button>
              </div>
            </div>

            {/* Sample Result */}
            {activeTab === "IMAGE" && (
              <div className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Analysis Result</div>
                  <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#DBEAFE", color: "#1D4ED8", fontSize: 10 }}>Vision Model (LLaVA)</span>
                  <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 10 }}>✓ Verified</span>
                </div>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
                  <strong>Image:</strong> Pump P-102 DE bearing housing inspection photograph (Aug 2026).<br /><br />
                  <strong>Findings:</strong> Visible seal leakage at mechanical seal housing — oil staining confirmed on bearing frame. Bearing housing shows minor surface oxidation. Vibration dampening pad appears compressed beyond serviceable limit. No visible cracks on pump casing.<br /><br />
                  <strong>Recommended action:</strong> Mechanical seal replacement required. Bearing inspection recommended during next maintenance window.
                </p>
                <div className="flex gap-2 mt-3">
                  <button className="text-xs px-3 py-1.5 rounded border font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Add to Report</button>
                  <button className="text-xs px-3 py-1.5 rounded border font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Save to Project</button>
                  <button className="text-xs px-3 py-1.5 rounded border font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-teal)" }}>Create Task →</button>
                </div>
              </div>
            )}
          </div>

          {/* Right — Config */}
          <div className="space-y-4">
            <div className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Model Selection</div>
              <div className="space-y-2">
                {[
                  { label: activeTab === "IMAGE" ? "Vision Model" : activeTab === "VOICE" ? "Speech Model" : activeTab === "VIDEO" ? "Video Model" : "Text Model", value: activeTab === "IMAGE" ? "LLaVA-13B (local)" : activeTab === "VOICE" ? "Whisper-Large (local)" : activeTab === "VIDEO" ? "Multimodal LLM (local)" : "Llama-3.1-8B (local)" },
                  { label: "OCR Engine", value: "Tesseract 5.3" },
                  { label: "Internet Access", value: "🚫 Blocked" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <span style={{ color: "var(--color-text-muted)" }}>{item.label}</span>
                    <span className="font-medium" style={{ color: "var(--color-text-secondary)" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Output</div>
              <div className="space-y-2">
                {["Text Analysis", "Structured Extraction", "Evidence Pack", "Project Note", "Task Creation"].map((out) => (
                  <label key={out} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
                    <input type="checkbox" defaultChecked={["Text Analysis", "Structured Extraction"].includes(out)} className="rounded" />
                    {out}
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Sovereignty</div>
              {["Local model only", "No cloud API", "Data stays on-premise", "Audit logged"].map((s) => (
                <div key={s} className="flex items-center gap-2 py-1 text-xs" style={{ color: "#15803D" }}>
                  <span>✓</span><span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
