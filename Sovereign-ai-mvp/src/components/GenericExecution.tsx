import { useEffect, useState } from "react";

type Phase = "plan" | "steps" | "verify" | "done";

export default function GenericExecution({
  plan,
  steps,
  verified,
  onDone,
  complexity,
}: {
  plan: string[];
  steps: string[];
  verified: string[];
  onDone: () => void;
  complexity: "simple" | "medium" | "complex";
}) {
  const [phase, setPhase] = useState<Phase>(complexity === "simple" ? "verify" : "plan");
  const [planVisible, setPlanVisible] = useState(1);
  const [stepsDone, setStepsDone] = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    if (phase === "plan") {
      t = setTimeout(() => {
        if (planVisible < plan.length) setPlanVisible((v) => v + 1);
        else setPhase("steps");
      }, planVisible === 1 ? 500 : 420);
    } else if (phase === "steps") {
      t = setTimeout(() => {
        if (stepsDone < steps.length) setStepsDone((v) => v + 1);
        else setPhase("verify");
      }, 460);
    } else if (phase === "verify") {
      t = setTimeout(() => {
        setPhase("done");
        onDone();
      }, complexity === "simple" ? 420 : 900);
    }
    return () => { if (t) clearTimeout(t); };
  }, [phase, planVisible, stepsDone, plan.length, steps.length, complexity, onDone]);

  const doneCount =
    (phase === "done" ? plan.length + steps.length + 4 :
      phase === "verify" ? plan.length + steps.length + 3 :
        phase === "steps" ? plan.length + stepsDone :
          planVisible);
  const total = plan.length + steps.length + 4;
  const progress = Math.round((doneCount / total) * 100);

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden w-full">
      <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}>
        <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold bg-teal-600 text-white animate-pulse">AI</span>
        <span className="text-[13px] font-semibold" style={{ color: "#1E293B" }}>Sovereign AI Thinking…</span>
        <span className="text-[10px] ml-auto px-2 py-0.5 rounded-full font-bold" style={{ background: "#F0FDFA", color: "#0F766E" }}>
          {progress}%
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: phase === "plan" ? "#0F766E" : "#94A3B8" }}>
            1 · Planning
          </div>
          <div className="space-y-1.5">
            {plan.map((p, i) => {
              const state = i < planVisible ? "done" : "pending";
              return (
                <div key={i} className="flex items-center gap-2.5">
                  {phase === "plan" && i === planVisible - 1 ? (
                    <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-teal-500 animate-spin flex-shrink-0" />
                  ) : (
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${state === "done" ? "bg-green-100" : "bg-slate-100"}`}>
                      {state === "done" ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : null}
                    </span>
                  )}
                  <span className="text-[13px]" style={{ color: state === "done" ? "#334155" : "#C0CBD8" }}>{p}</span>
                </div>
              );
            })}
          </div>
        </div>

        {complexity !== "simple" && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: phase === "steps" ? "#0F766E" : phase === "done" || phase === "verify" ? "#15803D" : "#94A3B8" }}>
              2 · Executing
            </div>
            <div className="space-y-1.5">
              {steps.map((s, i) => {
                const state = i < stepsDone ? "done" : i === stepsDone && phase === "steps" ? "active" : "pending";
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    {state === "done" ? (
                      <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </span>
                    ) : state === "active" ? (
                      <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-teal-500 animate-spin flex-shrink-0" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border-2 border-slate-100 flex-shrink-0" />
                    )}
                    <span className="text-[13px]" style={{
                      color: state === "done" ? "#475569" : state === "active" ? "#0F172A" : "#C0CBD8",
                      textDecoration: state === "done" ? "line-through" : "none",
                    }}>
                      {s}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: phase === "verify" || phase === "done" ? "#15803D" : "#94A3B8" }}>
            {complexity === "simple" ? "2 · Verification" : "3 · Verification"}
          </div>
          {phase === "plan" || phase === "steps" || (complexity === "simple" && phase === "plan") ? (
            <div className="flex gap-2 opacity-40">
              {verified.map((v) => (
                <span key={v} className="text-[11px] px-2 py-1 rounded-md border" style={{ borderColor: "#E2E8F0", color: "#64748B" }}>{v}</span>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {verified.map((v, i) => (
                <span key={v} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md"
                  style={{ background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", animationDelay: `${i * 160}ms` }}>
                  <span>✓</span>{v}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-teal-500 transition-all duration-500 ease-linear" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}