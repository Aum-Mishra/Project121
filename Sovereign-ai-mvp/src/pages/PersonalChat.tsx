import { useState, useEffect } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";

import { conversations, conversationById, ChatMsg } from "../data/personalChats";
import { getQuestionById } from "../data/demoQuestions";
import DemoAnswer from "../components/DemoAnswer";
import ApiExecutionSequence, { StaticExecutionSequence } from "../components/ApiExecutionSequence";

type Rendered = { type: "msg"; msg: ChatMsg } | { type: "exec"; query: string } | { type: "sequence"; query: string; plan: any; procLines: string[]; stepsDone: number };

export default function PersonalChat() {
  const [activeConvId, setActiveConvId] = useState<number>(1);
  const [input, setInput] = useState("");
  const [executingQ, setExecutingQ] = useState<string | null>(null);
  const [extra, setExtra] = useLocalStorage<Rendered[]>(`personalChatHistory-${activeConvId}`, []);

  const [currentRole, setCurrentRole] = useState("ENGINEER"); 

  const conv = conversationById(activeConvId);
  const rendered: Rendered[] = [...conv.messages.map((m) => ({ type: "msg" as const, msg: m })), ...extra];

  const send = () => {
    if (!input.trim() || executingQ) return;
    const text = input.trim();
    setInput("");

    setExtra((prev) => [
      ...prev,
      { type: "msg", msg: { kind: "text", role: "user", text } },
      { type: "exec", query: text },
    ]);
    setExecutingQ(text);
  };

  const finishExecution = (query: string, data: any) => {
    const complexity = String(data.plan?.complexity || "medium").toLowerCase();
    const syntheticQuestion = {
        id: "api_response",
        title: query,
        question: query,
        keywords: [],
        complexity,
        path: complexity === "complex" ? "complex" : complexity === "simple" ? "fast" : "knowledge",
        agent: "Sovereign AI",
        model: "Sovereign-1 (Local)",
        verdict: "API Response",
        answer: data.answer || "No response generated.",
        findings: data.findings || [],
        plan: [],
        steps: data.steps || [],
        proc_lines: data.proc_lines || [],
        verified: ["Source Verified"],
        sources: data.sources || [],
        files: data.files || [],
        charts: data.charts || []
    };

    setExtra((prev) => {
      const filtered = prev.filter(p => p.type !== "exec");
      return [
        ...filtered, 
        { type: "sequence", query, plan: { steps: data.steps || [] }, procLines: data.proc_lines || [], stepsDone: (data.steps || []).length } as any,
        { type: "msg", msg: { kind: "demo", role: "ai", qId: "api_response", syntheticData: syntheticQuestion } }
      ];
    });
    setExecutingQ(null);
  };

  return (
    <div className="flex h-full bg-slate-50 relative">
      <div className="flex-1 flex flex-col h-full">
        <div className="flex items-center justify-between p-3 border-b bg-white border-slate-200">
          <span className="text-sm font-semibold text-slate-700">Personal Chat</span>
          <select value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} className="text-xs border rounded p-1 bg-slate-50">
            <option value="ADMIN">Admin</option>
            <option value="ENGINEER">Engineer</option>
            <option value="HR">HR</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {rendered.map((r, i) => {
            if (r.type === "msg") {
              if (r.msg.kind === "demo") {
                 if (r.msg.syntheticData) {
                    return <DemoAnswer key={i} question={r.msg.syntheticData} />;
                 }
                 const dq = getQuestionById(r.msg.qId);
                 return dq ? <DemoAnswer key={i} question={dq} /> : <div key={i}>Loading demo...</div>;
              }
              return (
                <div key={i} className={`flex ${r.msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                    r.msg.role === "user" ? "bg-teal-600 text-white" : "bg-white border border-slate-200 text-slate-700"
                  }`}>
                    {r.msg.text}
                  </div>
                </div>
              );
            }
            if (r.type === "exec") {
              return <ApiExecutionSequence key={`exec-${r.query}`} query={r.query} role={currentRole} onDone={(data) => finishExecution(r.query, data)} />;
            }
            if (r.type === "sequence") {
              return <StaticExecutionSequence key={`seq-${r.query}`} query={r.query} plan={r.plan} procLines={r.procLines} stepsDone={r.stepsDone} />;
            }
            return null;
          })}
        </div>
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto relative flex items-end bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500 transition-all">
            <textarea
              className="w-full bg-transparent p-3 text-[13px] outline-none resize-none placeholder:text-slate-900"
              rows={1}
              placeholder="Ask anything in your private space..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button onClick={send} disabled={!input.trim() || !!executingQ} className="p-3 text-slate-900 hover:text-teal-600 disabled:opacity-50">
              <span className="w-5 h-5 flex items-center justify-center font-bold text-lg">↑</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
