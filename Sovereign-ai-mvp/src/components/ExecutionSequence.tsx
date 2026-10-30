import { useEffect, useState } from "react";
import { DemoQuestion } from "../data/demoQuestions";

type Phase = "processing" | "plan" | "steps" | "done";

export default function ExecutionSequence({ question, onDone }: { question: DemoQuestion; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("processing");
  const [procIdx, setProcIdx] = useState(0);
  const [planVisible, setPlanVisible] = useState(1);
  const [stepsDone, setStepsDone] = useState(0);

  const isSimple = question.complexity === "simple";
  const isMedium = question.complexity === "medium";
  const isComplex = question.complexity === "complex";

  const procLines = isSimple
    ? ["Processing query...", "Understanding request...", "Identifying asset: P-102", "Determining query complexity..."]
    : isMedium
    ? ["Processing query...", "Understanding comparison requirements...", "Identifying asset: P-102", "Identifying requested years: 2024–2026", "Identifying metrics: pressure and vibration", "Determining query complexity..."]
    : ["Processing query...", "Analyzing request", "Identifying company information requirement", "Identifying asset: P-102", "Identifying inspection history requirement", "Identifying required years: 2024, 2025, 2026", "Identifying SOP requirement", "Identifying comparison requirements", "Identifying calculation requirements", "Identifying operating-limit verification", "Identifying risk-assessment requirement", "Identifying engineering-report generation requirement"];

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    if (phase === "processing") {
      t = setTimeout(() => {
        if (procIdx < procLines.length - 1) {
          setProcIdx(v => v + 1);
        } else {
          setPhase("plan");
        }
      }, isSimple ? 250 : isMedium ? 300 : 250);
    } else if (phase === "plan") {
      t = setTimeout(() => {
        // Complex question shows the whole plan before moving to execution
        setPhase("steps");
      }, isSimple ? 100 : isMedium ? 1000 : 2000);
    } else if (phase === "steps") {
      t = setTimeout(() => {
        if (stepsDone < question.steps.length) {
          setStepsDone(v => v + 1);
        } else {
          setPhase("done");
          onDone();
        }
      }, isSimple ? 1500 : isMedium ? 1800 : 1000);
    }
    return () => { if (t) clearTimeout(t); };
  }, [phase, procIdx, planVisible, stepsDone]);

  const totalSteps = question.steps.length;
  
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden w-full mb-4">
      <div className="px-4 py-3 border-b" style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold bg-teal-600 text-white animate-pulse">AI</span>
          <span className="text-[13px] font-semibold" style={{ color: "#1E293B" }}>
            {phase === "processing" ? "Processing query..." : "Sovereign AI Executing..."}
          </span>
          <div className="ml-auto flex gap-2">
            {(phase !== "processing" || procIdx >= procLines.length - 1) && (
              <>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: "#F0FDFA", color: "#0F766E" }}>
                  {question.complexity}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#F1F5F9", color: "#475569" }}>
                  ~{isSimple ? "4" : isMedium ? "12" : "20"} sec
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Processing State */}
        {phase === "processing" && (
          <div className="space-y-1.5 opacity-80">
            {procLines.slice(0, procIdx + 1).map((line, i) => (
              <div key={i} className="text-[12px] font-mono text-slate-900 animate-in fade-in slide-in-from-left-1">{line}</div>
            ))}
          </div>
        )}

        {/* Plan / Execution */}
        {phase !== "processing" && (
          <>
            {!isSimple && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider mb-2 text-teal-700">
                  Planning Agent
                </div>
                <div className="text-[12px] text-slate-800 mb-3">
                  Agent · {question.steps.length} steps<br/>
                  {isComplex && "Executing a 14-step plan across knowledge retrieval, structured analysis, evidence validation, and report generation..."}
                </div>
              </div>
            )}

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2 text-slate-800 flex justify-between">
                <span>{isSimple ? "Plan Execution" : "Knowledge Agent"}</span>
                {!isSimple && <span>{stepsDone}/{question.steps.length}</span>}
              </div>
              <div className="space-y-2">
                {question.steps.map((s, i) => {
                  const state = i < stepsDone ? "done" : i === stepsDone && (phase === "steps") ? "active" : "pending";
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      {state === "done" ? (
                        <span className="w-4 h-4 mt-0.5 rounded-full text-green-600 flex items-center justify-center flex-shrink-0 font-bold text-[14px]">
                          ✓
                        </span>
                      ) : state === "active" ? (
                        <span className="w-4 h-4 mt-0.5 rounded-full text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-[14px] animate-spin">
                          ⟳
                        </span>
                      ) : (
                        <span className="w-4 h-4 mt-0.5 rounded-full text-slate-300 flex items-center justify-center flex-shrink-0 font-bold text-[14px]">
                          ○
                        </span>
                      )}
                      <span className="text-[13px] leading-tight" style={{
                        color: state === "done" ? "#475569" : state === "active" ? "#0F172A" : "#94A3B8"
                      }}>
                        {s}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
