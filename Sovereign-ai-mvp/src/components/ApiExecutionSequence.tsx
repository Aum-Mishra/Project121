import { useEffect, useRef, useState } from "react";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://localhost:8001";

const DWELL_MS: Record<string, number> = {
  status: 550,
  plan: 1600,
  step_start: 350,
  step_complete: 650,
  result: 900,
};

type Stage = "processing" | "planning" | "executing" | "answered";

const STAGES: { key: Stage; label: string }[] = [
  { key: "processing", label: "Processing" },
  { key: "planning", label: "Planning" },
  { key: "executing", label: "Executing" },
];

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function ApiExecutionSequence({ query, role = "ENGINEER", onDone }: { query: string, role?: string, onDone: (data: any) => void }) {
  const [stage, setStage] = useState<Stage>("processing");
  const [procLines, setProcLines] = useState<string[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [stepsDone, setStepsDone] = useState<number>(0);
  const [runningStep, setRunningStep] = useState<number | null>(null);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const activeRef = useRef(true);
  const ctrlRef = useRef<AbortController | null>(null);
  const pendingAbortRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      if (pendingAbortRef.current !== null) {
        window.clearTimeout(pendingAbortRef.current);
        pendingAbortRef.current = null;
      }
      return () => { ctrlRef.current?.abort(); };
    }
    startedRef.current = true;
    activeRef.current = true;

    const controller = new AbortController();
    ctrlRef.current = controller;
    let finished = false;

    const events: any[] = [];
    let draining = false;

    const push = (data: any) => {
      events.push(data);
      void drain();
    };

    function applyEvent(data: any) {
      switch (data.type) {
        case "status":
          setProcLines((prev) => [...prev, data.message]);
          break;
        case "plan":
          setPlan(data.data ?? data);
          setStage("planning");
          break;
        case "step_start":
          setStage("executing");
          setRunningStep(data.step_index);
          break;
        case "step_complete":
          setStepsDone(data.step_index + 1);
          setRunningStep((prev) => (prev === data.step_index ? null : prev));
          break;

        case "result":
          setStage("answered");
          setStepsDone(data.steps?.length || plan?.steps?.length || 0);
          onDoneRef.current(data);
          break;
      }
    }

    const drain = async () => {
      if (draining) return;
      draining = true;
      while (events.length > 0) {
        const ev = events.shift();
        applyEvent(ev);
        await delay(DWELL_MS[ev.type] || 500);
      }
      draining = false;
      if (finished && events.length === 0 && !activeRef.current) {
        // done
      }
    };

    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, role }),
          signal: ctrlRef.current?.signal,
        });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
               const str = line.slice(6).trim();
               if (str) {
                 events.push(JSON.parse(str));
                 drain();
               }
            }
          }
        }
      } catch (err) {
        // handle err
      } finally {
        finished = true;
      }
    };
    run();

    return () => {
      activeRef.current = false;
      pendingAbortRef.current = window.setTimeout(() => ctrlRef.current?.abort(), 5000);
    };
  }, [query, role]);

  const steps = plan?.steps || [];
  const total = steps.length;
  const isComplete = stage === "answered";

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden w-full mb-4">
      <div className="px-4 py-3 border-b" style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold bg-teal-600 text-white ${!isComplete ? 'animate-pulse' : ''}`}>AI</span>
          <span className="text-[13px] font-semibold" style={{ color: "#1E293B" }}>
            {stage === "processing" ? "Processing query..." : isComplete ? "Sovereign AI Executed" : "Sovereign AI Executing..."}
          </span>
          <div className="ml-auto flex gap-2">
            {plan && plan.complexity && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: "#F0FDFA", color: "#0F766E" }}>
                {plan.complexity}
              </span>
            )}
            {isComplete && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-green-700" style={{ background: "#DCFCE7" }}>
                ✓ COMPLETED
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        <div className="space-y-1.5 opacity-95">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2 text-slate-800">Processing</div>
          {procLines.map((line, i) => (
            <div key={i} className={`text-[12px] font-mono ${line.includes("✗") ? "text-red-600" : "text-slate-800"}`}>
              {line}
            </div>
          ))}
        </div>

        {plan && (
          <div className="pt-2 border-t border-slate-100">
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2 text-slate-800 flex justify-between">
              <span>Plan Execution</span>
              <span>{Math.min(stepsDone, total)}/{total}</span>
            </div>
            <div className="space-y-2">
              {steps.map((s: string, i: number) => {
                const state = i < stepsDone ? "done" : i === runningStep ? "active" : "pending";
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    {state === "done" ? (
                      <span className="w-4 h-4 mt-0.5 rounded-full text-green-600 flex items-center justify-center flex-shrink-0 font-bold text-[14px]">✓</span>
                    ) : state === "active" ? (
                      <span className="w-4 h-4 mt-0.5 rounded-full text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-[14px] animate-spin">⟳</span>
                    ) : (
                      <span className="w-4 h-4 mt-0.5 rounded-full text-slate-300 flex items-center justify-center flex-shrink-0 font-bold text-[14px]">○</span>
                    )}
                    <span className="text-[13px] leading-tight" style={{ color: state === "done" ? "#475569" : state === "active" ? "#0F172A" : "#94A3B8" }}>
                      {i + 1}. {s}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function StaticExecutionSequence({ query, plan, procLines, stepsDone }: { query: string, plan: any, procLines: string[], stepsDone: number }) {
  const steps = plan?.steps || [];
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden w-full mb-4">
      <div className="px-4 py-3 border-b" style={{ borderColor: "#F1F5F9", background: "#F8FAFC" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold bg-teal-600 text-white">AI</span>
          <span className="text-[13px] font-semibold" style={{ color: "#1E293B" }}>
            Sovereign AI Executed
          </span>
          <div className="ml-auto flex gap-2">
            {plan && plan.complexity && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: "#F0FDFA", color: "#0F766E" }}>
                {plan.complexity}
              </span>
            )}
            {totalStepsDone(steps, stepsDone) && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-green-700" style={{ background: "#DCFCE7" }}>
                ✓ COMPLETED
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        <div className="space-y-1.5 opacity-95">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2 text-slate-800">Processing</div>
          {procLines.map((line, i) => (
            <div key={i} className={`text-[12px] font-mono ${line.includes("✗") ? "text-red-600" : "text-slate-800"}`}>
              {line}
            </div>
          ))}
        </div>

        {plan && (
          <div className="pt-2 border-t border-slate-100">
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2 text-slate-800 flex justify-between">
              <span>Plan Execution</span>
              <span>{Math.min(stepsDone, steps.length)}/{steps.length}</span>
            </div>
            <div className="space-y-2">
              {steps.map((s: string, i: number) => {
                const state = i < stepsDone ? "done" : i === stepsDone ? "active" : "pending";
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    {state === "done" ? (
                      <span className="w-4 h-4 mt-0.5 rounded-full text-green-600 flex items-center justify-center flex-shrink-0 font-bold text-[14px]">✓</span>
                    ) : state === "active" ? (
                      <span className="w-4 h-4 mt-0.5 rounded-full text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-[14px]">⟳</span>
                    ) : (
                      <span className="w-4 h-4 mt-0.5 rounded-full text-slate-300 flex items-center justify-center flex-shrink-0 font-bold text-[14px]">○</span>
                    )}
                    <span className="text-[13px] leading-tight" style={{ color: state === "done" ? "#475569" : state === "active" ? "#0F172A" : "#94A3B8" }}>
                      {i + 1}. {s}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function totalStepsDone(steps: string[], done: number) {
  return steps.length > 0 && done >= steps.length;
}