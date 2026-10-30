import React, { useState, useRef, useEffect } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useNav } from "../context/NavContext";
import { convsByProjectName, projectConversations, PcMsg, ProjectConv, convOwner, projectContributors } from "../data/projectChats";
import { conversations as personalConvs } from "../data/personalChats";
import { matchDemoQuestion, getQuestionById } from "../data/demoQuestions";
import { answerForQuery } from "../data/genericQueries";
import ChatMessages, { GenericAnswerCard, avatarColor, initials } from "../components/ChatMessages";
import ApiExecutionSequence, { StaticExecutionSequence } from "../components/ApiExecutionSequence";
import ExecutionSequence from "../components/ExecutionSequence";
import GenericExecution from "../components/GenericExecution";
import DocumentViewer, { DocTypeChip } from "../components/DemoDocs";
import { files } from "../data/demoCore";

type Scope =
  | { type: "project"; project: string; convId: string }
  | { type: "personal"; convId: number };

type Flight =
  | { key: string; kind: "api"; query: string };
type ItemMsg = { type: "pc"; msg: PcMsg } | { type: "generic"; answer: ReturnType<typeof answerForQuery> } | { type: "sequence", query: string, plan: any, procLines: string[], stepsDone: number };

const agents = ["Research Agent", "Document Agent", "Engineering Agent", "HSE/Inspection Agent", "Data Analysis Agent", "Maintenance Agent", "Procurement Agent", "Project Agent"];

export default function Workbench() {
  const { navigate, projects, currentProjectName, setCurrentProjectName } = useNav();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [scope, setScope] = useState<Scope>({ type: "project", project: currentProjectName, convId: "" });
  const [items, setItems] = useState<ItemMsg[]>([]);
  const [running, setRunning] = useState<Flight | null>(null);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [selectedAgent, setSelectedAgent] = useState("Research Agent");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showNewChatMenu, setShowNewChatMenu] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [tempConvs, setTempConvs] = useLocalStorage<ProjectConv[]>("tempConvs", []);
  const [tempPersonal, setTempPersonal] = useLocalStorage<import("../data/personalChats").Conversation[]>("tempPersonal", []);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const projectConvs = [
    ...convsByProjectName(scope.type === "project" ? scope.project : currentProjectName),
    ...tempConvs.filter((c) => scope.type === "project"),
  ];
  const activeConv =
    scope.type === "project"
      ? projectConvs.find((c) => c.id === scope.convId) ?? projectConvs[0]
      : [...tempPersonal, ...personalConvs].find((c) => c.id === scope.convId) ?? [...tempPersonal, ...personalConvs][0];
  const currentProject = projects.find((p) => p.name === (scope.type === "project" ? scope.project : currentProjectName)) ?? projects[0];

  useEffect(() => {
    const storageKey = `chat-history-${scope.type}-${scope.type === 'project' ? scope.project : ''}-${scope.convId}`;
    const saved = localStorage.getItem(storageKey);
    
    if (saved) {
      try {
        setItems(JSON.parse(saved));
        setRunning(null);
        return;
      } catch(e) {}
    }

    if (scope.type === "project") {
      const conv = projectConvs.find((c) => c.id === scope.convId) ?? projectConvs[0];
      setItems(conv ? conv.messages.map((m) => {
        if (m.kind === "demo") return { type: "pc" as const, msg: { kind: "demo", role: m.role, qId: m.qId } as PcMsg };
        return { type: "pc" as const, msg: m };
      }) : []);
    } else {
      const conv = [...tempPersonal, ...personalConvs].find((c) => c.id === scope.convId) ?? [...tempPersonal, ...personalConvs][0];
      setItems(conv.messages.map((m) => {
        if (m.kind === "demo") return { type: "pc" as const, msg: { kind: "demo", role: m.role, qId: m.qId } as PcMsg };
        return {
          type: "pc" as const,
          msg: {
            kind: "text",
            role: m.role,
            author: m.role === "user" ? "Anita Rao" : "Personal AI",
            text: m.text,
            sources: m.sources,
            files: m.files,
            analysis: m.analysis,
          } as PcMsg,
        };
      }));
    }
    setRunning(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.type, scope.convId, scope.project]);

  useEffect(() => {
    if (items.length > 0) {
      const storageKey = `chat-history-${scope.type}-${scope.type === 'project' ? scope.project : ''}-${scope.convId}`;
      localStorage.setItem(storageKey, JSON.stringify(items));
    }
  }, [items, scope.type, scope.convId, scope.project]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items, running]);

  const switchProject = (name: string) => {
    setCurrentProjectName(name);
    setScope({ type: "project", project: name, convId: "" });
  };

  const switchPersonal = (convId: number) => {
    setScope({ type: "personal", convId });
  };

  const newPersonalChat = () => {
    const id = -Date.now();
    const conv: import("../data/personalChats").Conversation = {
      id,
      title: "New Personal Chat",
      preview: "Fresh private conversation",
      time: "Now",
      temp: true,
      messages: [
        { kind: "text", role: "ai", text: "Fresh personal chat ready. Ask me anything in your private space — general knowledge plus your saved workspace notes only." },
      ],
    };
    setTempPersonal((prev) => [conv, ...prev]);
    setScope({ type: "personal", convId: id });
  };

  const newChat = () => {
    const conv: ProjectConv = {
      id: `new-${Date.now()}`,
      title: "New Chat",
      time: "Now",
      preview: "Fresh conversation",
      messages: [
        {
          kind: "text", role: "ai", author: "Engineering Agent",
          text: "Fresh conversation ready. Ask me anything about this project — documents, analyses, plans or approvals.",
        },
      ],
    };
    setTempConvs((prev) => [conv, ...prev]);
    setScope({ type: "project", project: currentProjectName, convId: conv.id });
  };

  const handleSend = () => {
    if (!input.trim() || running) return;
    const text = input.trim();
    setInput("");

    setItems((prev) => [
      ...prev,
      { type: "pc", msg: { kind: "text", role: "user", author: "Anita Rao", text } }
    ]);
    setRunning({ key: `api-${Date.now()}`, kind: "api", query: text });
  };

  const finishFlight = (flight: Flight) => {
    setRunning(null);
    if (flight.kind === "demo") {
      setItems((prev) => [...prev, { type: "pc", msg: { kind: "demo", role: "ai", qId: flight.qId } }]);
    } else {
      setItems((prev) => [...prev, { type: "generic", answer: flight.answer }]);
    }
  };

  const pendingApprovals =
    scope.type === "project"
      ? convsByProjectName(scope.project).filter((c) => c.messages.some((m) => m.kind === "text" && m.approval)).length
      : 0;

  const projectFileIds = scope.type === "project" ? projectConvs.flatMap((c) => c.messages.flatMap((m) => (m.kind === "text" && m.files) ? m.files : [])) : [];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-800">{scope.type === "personal" ? "Space:" : "Project:"}</span>
          <span className="text-sm font-semibold text-slate-900 truncate max-w-[220px]">
            {scope.type === "personal" ? "Personal Chats" : currentProject?.name}
          </span>
          {scope.type === "project" && (
            <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-amber-100 text-amber-800 border border-amber-200">
              🔒 {currentProject?.cls}
            </span>
          )}
          {scope.type === "project" && (
            <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-teal-50 text-teal-700 border border-teal-200">
              {projectConvs.length} CONVERSATIONS
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-slate-800 mr-2">{currentProject?.contributors?.length || 0} contributors</span>
            <div className="flex -space-x-2">
              {(currentProject?.contributors || []).slice(0, 3).map((c, i) => (
                <div
                  key={i}
                  title={c}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white border-2 border-white shadow-sm"
                  style={{ background: ["#0F766E", "#2563EB", "#7C3AED"][i % 3] }}
                >
                  {c.split(" ").map((n) => n[0]).join("")}
                </div>
              ))}
            </div>
          </div>
          <div className="h-6 w-px bg-slate-200 mx-1"></div>

          <button onClick={() => navigate("approvals")} className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors" title="Approvals">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="#475569" strokeWidth="1.3" />
              <path d="M5 8l2 2 4-4" stroke="#475569" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {pendingApprovals > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-xs font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white bg-amber-500 text-white" style={{ fontSize: 10 }}>
                {pendingApprovals}
              </span>
            )}
          </button>

          <button className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-slate-50 transition-colors ml-1" title="User Profile">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shadow-sm bg-teal-600 text-white">AR</div>
            <span className="text-sm font-medium pr-1 text-slate-900">Anita Rao</span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1"></div>
          <button className="text-xs px-3 py-1.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-sm" title="Export report">
            Export
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel */}
        {!leftCollapsed ? (
          <div className="w-80 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col min-h-0 transition-all">
            {/* Section toggle */}
            <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex items-center gap-2">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100/80 border border-slate-200 flex-1">
                <button
                  onClick={() => setScope({ type: "project", project: currentProjectName, convId: "" })}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-all ${scope.type === "project" ? "bg-white text-teal-700 shadow-sm" : "text-slate-800 hover:text-slate-700"}`}
                >
                  Project Chats
                </button>
                <button
                  onClick={() => switchPersonal(personalConvs[0]?.id ?? -1)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-all ${scope.type === "personal" ? "bg-white text-teal-700 shadow-sm" : "text-slate-800 hover:text-slate-700"}`}
                >
                  Personal Chats
                </button>
              </div>
              <button onClick={() => setLeftCollapsed(true)} className="text-slate-900 hover:text-slate-700 transition-colors p-1.5 rounded-md hover:bg-slate-200 flex-shrink-0" title="Close chat history">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
            </div>

            {scope.type === "personal" ? (
              <>
                <div className="p-4 border-b border-slate-100 relative">
                  <button
                    onClick={newPersonalChat}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                    title="Start a fresh personal chat"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                    New Personal Chat
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1">
                  <div className="text-xs font-bold text-slate-900 tracking-wider uppercase px-2 mb-2 mt-1">
                    Personal Chats <span className="text-slate-300 normal-case tracking-normal">· private workspace</span>
                  </div>
                  {[...tempPersonal, ...personalConvs].map((c) => {
                    const isActive = scope.type === "personal" && scope.convId === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => switchPersonal(c.id)}
                        className={`w-full flex flex-col items-start px-3 py-2.5 rounded-lg transition-colors ${isActive ? "bg-teal-50 border border-teal-200" : "hover:bg-slate-50 border border-transparent"}`}
                        title={`Load personal chat: ${c.title}`}
                      >
                        <span className={`text-sm truncate w-full text-left ${isActive ? "text-teal-900 font-semibold" : "text-slate-700"}`}>
                          {c.title} {c.temp && <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-800 font-bold ml-1">NEW</span>}
                        </span>
                        <span className="text-[11px] text-slate-900 truncate w-full text-left mt-0.5">{c.preview}</span>
                        <span className="flex items-center gap-2 mt-1.5 w-full">
                          <span className="text-[10px] text-slate-900">{c.time}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-teal-50 text-teal-700">🔒 personal</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50 gap-2">
                  <select
                    value={scope.type === "project" ? scope.project : currentProjectName}
                    onChange={(e) => switchProject(e.target.value)}
                    className="text-sm font-medium text-slate-700 border border-slate-300 rounded-md px-2 py-1.5 outline-none bg-white cursor-pointer w-full truncate shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    title="Select Project"
                  >
                    {projectConversations.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="p-4 border-b border-slate-100 relative">
                  <button
                    onClick={() => { setShowNewChatMenu(false); newChat(); }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                    title="Start a fresh project chat"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                    New Project Chat
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
                  {projectContributors(scope.type === "project" ? scope.project : currentProjectName).map((author) => {
                    const sectionConvs = projectConvs.filter((c) => convOwner(c) === author);
                    if (sectionConvs.length === 0) return null;
                    return (
                      <div key={author}>
                        <div className="flex items-center gap-2 px-2 mb-1.5">
                          <div
                            title={author}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0"
                            style={{ background: avatarColor(author) }}
                          >
                            {initials(author)}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-700 truncate">{author}</span>
                          {author === "Anita Rao" && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-teal-50 text-teal-700 border border-teal-200">YOU</span>
                          )}
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-800">{sectionConvs.length} chat{sectionConvs.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="space-y-1">
                          {sectionConvs.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setScope({ type: "project", project: currentProjectName, convId: c.id })}
                              className={`w-full flex flex-col items-start px-3 py-2.5 rounded-lg transition-colors ${scope.type === "project" && scope.convId === c.id ? "bg-teal-50 border border-teal-200" : "hover:bg-slate-50 border border-transparent"}`}
                              title={`Load chat: ${c.title}`}
                            >
                              <span className={`text-sm truncate w-full text-left ${scope.type === "project" && scope.convId === c.id ? "text-teal-900 font-semibold" : "text-slate-700"}`}>
                                {c.title}
                              </span>
                              <span className="text-[11px] text-slate-900 truncate w-full text-left mt-0.5">{c.preview}</span>
                              <span className="flex items-center gap-2 mt-1.5 w-full">
                                <span className="text-[10px] text-slate-900">{c.time}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700">{c.messages.length} msgs</span>
                                {c.messages.length > 0 && c.messages.slice(0, 3).some((m) => m.kind === "text" && (m as any).collab) && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-purple-50 text-purple-700">👤 collab</span>
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => setLeftCollapsed(false)}
            className="w-12 bg-white border-r border-slate-200 flex flex-col items-center justify-center text-slate-900 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            title="Open chat history"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            <span className="text-[9px] mt-2 uppercase tracking-wider">Chats</span>
          </button>
        )}

        {/* Center — Chat */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto px-8 py-8 space-y-6 flex flex-col">
            {activeConv && scope.type === "project" && (
              <div className="flex-shrink-0">
                <div className="text-xl font-semibold text-slate-900">{activeConv.title}</div>
                <div className="text-xs text-slate-900 mt-0.5">{activeConv.messages.length} messages · {activeConv.time}</div>
              </div>
            )}

            {items.map((item, idx) =>
              item.type === "generic" ? (
                <GenericAnswerCard key={"gen-" + idx} answer={item.answer} />
              ) : item.type === "sequence" ? (
                <StaticExecutionSequence
                  key={"seq-" + idx}
                  query={item.query}
                  plan={item.plan}
                  procLines={item.procLines}
                  stepsDone={item.stepsDone}
                />
              ) : item.type === "pc" ? (
                <ChatRow key={idx} msg={item.msg} projectScope={scope.type === "project"} />
              ) : null
            )}

            {running && (
              <div className="bg-red-500 text-white p-4 font-bold text-xl">
                
              </div>
            )}
            {running && (
                <ApiExecutionSequence key={running.key}
                  query={running.query}
                  role="ENGINEER"
                  onDone={(data) => {
                    const complexity = String(data.plan?.complexity || "medium").toLowerCase();
                    const syntheticQuestion = {
                        id: "api_response",
                        title: running.query,
                        question: running.query,
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
                    setItems((prev) => [
                      ...prev,
                      { type: "sequence", query: running.query, plan: { steps: data.steps || [] }, procLines: data.proc_lines || [], stepsDone: (data.steps || []).length },
                      { type: "pc", msg: { kind: "demo", role: "ai", author: "Sovereign AI", qId: "api_response", syntheticData: syntheticQuestion } },
                    ]);
                    if (data.action === "redirect_coding_wait") {
                        // NO auto-navigation: keep the answer card + chat on screen.
                        // (Artifact/download links are rendered as in-page cards so the
                        //  user never gets ripped out of the conversation.)
                    }
                    setRunning(null);
                  }}
                />
            )}

          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-6 pb-6 pt-2 bg-transparent">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all focus-within:shadow-md focus-within:border-teal-400">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={scope.type === "personal" ? "Ask anything in your private space..." : "Ask, analyze, create, search, calculate or execute..."}
                rows={1}
                className="w-full px-4 py-3 text-sm outline-none resize-none text-slate-700 placeholder-slate-400 bg-transparent min-h-[44px]"
              />
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 border-t border-slate-100 relative">
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-900 flex items-center justify-center transition-colors shrink-0"
                  title="Attach options"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>

                {scope.type === "project" && (
                  <div className="flex items-center p-0.5 ml-1 rounded-lg bg-slate-100/80 border border-slate-200 shrink-0">
                    {(["auto", "manual"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all capitalize ${mode === m ? "bg-white text-teal-700 shadow-sm" : "text-slate-800 hover:text-slate-700"}`}
                      >
                        {m === "auto" ? "● Auto" : "○ Manual"}
                      </button>
                    ))}
                  </div>
                )}
                {mode === "manual" && scope.type === "project" && (
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="text-[10px] border border-slate-300 rounded-lg px-2 py-1 outline-none bg-white text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-sm max-w-[130px] truncate shrink-0 ml-1"
                  >
                    {agents.map((a) => <option key={a}>{a}</option>)}
                  </select>
                )}

                <button
                  onClick={handleSend}
                  className={`ml-auto text-xs px-5 py-1.5 rounded-xl font-semibold transition-all shadow-sm ${input.trim() ? "bg-teal-600 text-white hover:bg-teal-700 hover:shadow" : "bg-slate-200 text-slate-900 cursor-not-allowed"}`}
                  title="Send message"
                >
                  Send
                </button>
              </div>
            </div>
            <div className="text-center mt-2">
              <span className="text-[9px] text-slate-900 font-medium tracking-wide">AI CAN MAKE MISTAKES. VERIFY IMPORTANT INFORMATION.</span>
            </div>
          </div>
        </div>

        {/* Right Panel — Context & Evidence */}
        {!rightCollapsed ? (
          <div className="w-80 bg-white border-l border-slate-200 flex-shrink-0 overflow-y-auto transition-all relative">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur z-10">
              <span className="text-xs font-bold text-slate-800 tracking-wider uppercase">Context & Evidence</span>
              <button onClick={() => setRightCollapsed(true)} className="text-slate-900 hover:text-slate-700 transition-colors p-1 rounded-md hover:bg-slate-100" title="Close right panel">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {scope.type === "personal" ? (
              <div className="p-5 space-y-4">
                <div className="rounded-xl p-4" style={{ background: "#FAF5FF", border: "1px solid #E9D5FF" }}>
                  <div className="text-sm font-semibold text-slate-800 mb-1">Personal Context</div>
                  <p className="text-xs text-slate-800 leading-relaxed">
                    Organizational knowledge is disabled. Personal chats use general knowledge plus your saved workspace notes only.
                  </p>
                </div>
                <div className="text-xs text-slate-800 space-y-3">
                  {[
                    { label: "Notes isolated", value: "MRPL sources off", icon: "◯" },
                    { label: "Retention", value: "Per user setting", icon: "◪" },
                    { label: "Audit scope", value: "Personal access only", icon: "◫" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center border border-slate-100 text-purple-500"><span className="text-lg">{item.icon}</span></div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{item.label}</div>
                        <div className="text-xs text-slate-800">{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-5 border-b border-slate-100 bg-slate-50/30">
                  <div className="text-sm font-semibold text-slate-800 mb-4">Project Context</div>
                  <div className="space-y-4">
                    {[
                      { label: "Documents", count: `${new Set(projectFileIds).size || currentProject?.artifacts} files`, icon: "◧", color: "text-blue-500" },
                      { label: "Knowledge", count: "1.2K chunks", icon: "◈", color: "text-purple-500" },
                      { label: "Database", count: "MRPL PostgreSQL", icon: "⬡", color: "text-teal-500" },
                      { label: "Conversations", count: `${projectConvs.length} chats`, icon: "◪", color: "text-amber-500" },
                      { label: "Contributors", count: `${currentProject?.contributors?.length || 0} active`, icon: "◯", color: "text-rose-500" },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center border border-slate-100 ${item.color}`}>
                          <span className="text-lg">{item.icon}</span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{item.label}</div>
                          <div className="text-xs text-slate-800">{item.count}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-5 py-5 border-b border-slate-100">
                  <div className="text-sm font-semibold text-slate-800 mb-3">Project Files</div>
                  <div className="space-y-1.5">
                    {Array.from(new Set(projectFileIds)).map((fid, i) => {
                      const f = files.find((ff) => ff.id === fid);
                      if (!f) return null;
                      return (
                        <button key={fid} onClick={() => setOpenFile(fid)} className="w-full flex items-center gap-2 p-2 rounded-lg border hover:bg-teal-50/50 transition-colors text-left" style={{ borderColor: "#E2E8F0" }}>
                          <span className="text-sm">{f.type === "PDF" ? "📄" : f.type === "DOCX" ? "📝" : f.type === "XLSX" ? "📊" : "📈"}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[12px] font-medium text-slate-700 truncate">{f.name}</span>
                          </span>
                          <DocTypeChip type={f.type} />
                        </button>
                      );
                    })}
                    {Array.from(new Set(projectFileIds)).length === 0 && (
                      <div className="text-xs text-slate-900 py-3 text-center">No files referenced in this project yet.</div>
                    )}
                  </div>
                </div>

                <div className="px-5 py-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-slate-800">Documents Library</div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">14 ON FILE</span>
                  </div>
                  <div className="text-xs text-slate-800 leading-relaxed">
                    This project references inspection reports, SOPs, datasheets, vendor evaluations and turnaround schedules — all openable from the chat cards or the Documents page.
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => setRightCollapsed(false)}
            className="w-12 bg-white border-l border-slate-200 flex flex-col items-center justify-center text-slate-900 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            title="Open Context & Evidence"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            <span className="text-[9px] mt-2 uppercase tracking-wider">Context</span>
          </button>
        )}
      </div>

      {openFile && <DocumentViewer fileId={openFile} onClose={() => setOpenFile(null)} />}
      {showAttachMenu && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 bg-white border border-slate-200 shadow-lg rounded-xl p-1.5 flex gap-1 z-20">
          {["Attach", "Voice", "Image", "Agent", "Tools", "Model"].map((btn) => (
            <button key={btn} onClick={() => setShowAttachMenu(false)} className="text-xs px-3 py-1.5 rounded-lg text-slate-900 hover:bg-slate-100 hover:text-slate-900 font-medium transition-colors" title={btn}>
              {btn}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatRow({ msg, projectScope }: { msg: PcMsg; projectScope: boolean }) {
  return (
    <div className="flex flex-col items-stretch">
      <ChatMessages messages={[msg]} />
    </div>
  );
}