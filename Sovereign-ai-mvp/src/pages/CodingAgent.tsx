import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, FolderCog, Sparkles, Play, Download, X, Check, Ban,
  FileCode2, Terminal, Files, GitCompare, FlaskConical, Loader2,
  Bot, User, FolderOpen, ShieldQuestion, CheckCircle2, AlertTriangle,
  FolderPlus, ChevronRight, CircleDot, PauseCircle, Boxes,
  Monitor, History, FolderSearch, Wrench, Plus, ArrowLeft, Timer,
  Save, Trash2, PenLine, RefreshCw, StopCircle, CornerDownLeft, Wand2, ChevronDown,
} from "lucide-react";
import {
  codingApi, CodingTaskDetail, CodingEvent, CodingSession,
  CodingSessionDetail, CodingTaskSummary, FolderBrowse,
  TaskTree, TreeNode, RunSnapshot, RunLogEntry, AiFixResult,
  CodingFileChange,
} from "../data/codingAgentMock";

type Mode = "generate" | "new_project" | "existing_project";
type CenterTab = "output" | "live" | "files" | "changes" | "tests" | "run";

// Minimal structural type for the event-log stream the API returns
// (stands in for the real EventSource so this screen stays server-agnostic).
interface AgentStream {
  onmessage: ((msg: { data: string }) => void) | null;
  close: () => void;
}

interface ChatLine {
  role: "user" | "agent";
  text: string;
  when: string;
}

interface EditorFile {
  path: string;
  content: string;
  saved: boolean;
}

const MODE_META: Record<Mode, { label: string; hint: string; Icon: React.ElementType }> = {
  generate: { label: "Generate code", hint: "Ask for a snippet/small script to download", Icon: Sparkles },
  new_project: { label: "Build new project", hint: "Create folder, files, run tests, fix", Icon: FolderPlus },
  existing_project: { label: "Fix existing project", hint: "Open a local folder and edit it", Icon: FolderCog },
};

const ACTIVE_SESSION_KEY = "ca_active_session";

export default function CodingAgentScreen() {
  const [mode, setMode] = useState<Mode>("generate");
  const [input, setInput] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [storagePath, setStoragePath] = useState("");
  const [workspaces, setWorkspaces] = useState<{ name: string; path: string }[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [task, setTask] = useState<CodingTaskDetail | null>(null);
  const [centerTab, setCenterTab] = useState<CenterTab>("output");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<string>("check");
  const [filesTree, setFilesTree] = useState<{ path: string; size: number }[]>([]);

  // sessions
  const [sessions, setSessions] = useState<CodingSession[]>([]);
  const [activeSession, setActiveSession] = useState<CodingSession | null>(null);
  const [browserFor, setBrowserFor] = useState<"folder" | "storage" | null>(null);

  // live code editor (nested tree + open files)
  const [fileTree, setFileTree] = useState<TreeNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openFiles, setOpenFiles] = useState<EditorFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [liveTree, setLiveTree] = useState<{ path: string; size: number }[]>([]);

  // session management modals
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<CodingSession | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [delTarget, setDelTarget] = useState<CodingSession | null>(null);

  // run panel
  const [runSnap, setRunSnap] = useState<RunSnapshot | null>(null);
  const [runLogs, setRunLogs] = useState<RunLogEntry[]>([]);
  const [runBusy, setRunBusy] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [runInputOpen, setRunInputOpen] = useState(false);

  // timer + auto-fix tracker
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [autoFix, setAutoFix] = useState<{ attempts: number; state: "idle" | "repairing" | "fixed" | "failed"; lastError: string }>(
    { attempts: 0, state: "idle", lastError: "" }
  );

  const chatEndRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const esRef = useRef<AgentStream | null>(null);
  const runEsRef = useRef<AgentStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const taskIdRef = useRef<string | null>(null);

  const pushLine = useCallback((line: ChatLine) => {
    setChat((c) => [...c, line]);
    const sid = sessionIdRef.current;
    if (sid) codingApi.sessions.appendMessage(sid, line.role, line.text).catch(() => {});
  }, []);

  const evKey = useCallback((ev: CodingEvent) => {
    return [ev.kind, ev.at, ev.command, ev.detail, ev.count, ev.attempt, ev.return_code, ev.path, ev.error]
      .map((v) => String(v ?? "")).join("|");
  }, []);

  const refreshSessions = useCallback(() => {
    return codingApi.sessions.list().then((r) => setSessions(r.sessions)).catch(() => {});
  }, []);

  const refreshLive = useCallback((taskId: string) => {
    codingApi.tasks.tree(taskId)
      .then((r: TaskTree) => {
        setFileTree(r.tree);
        setFilesTree(r.files);
        setLiveTree(r.files);
      })
      .catch(() => {});
  }, []);

  // decrypt runtime state for a freshly opened task with an active run
  const probeRun = useCallback((taskId: string) => {
    codingApi.tasks.runStatus(taskId).then(({ runs }) => {
      const live = runs.find((r) => r.status === "running" || r.status === "starting");
      if (live) {
        setRunSnap(live);
        setRunLogs([]);
        subscribeRunLogs(live.run_id);
      } else if (runs.length > 0) {
        setRunSnap(runs[0]);
        setRunLogs(runs[0].logs || []);
      }
    }).catch(() => {});
  }, []);

  // ticking clock for the persistent running timer
  useEffect(() => {
    const i = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // periodic live-code refresh while the agent is running
  useEffect(() => {
    if (task && (task.status === "RUNNING" || task.status === "AWAITING_APPROVAL") && taskIdRef.current) {
      const i = window.setInterval(() => refreshLive(taskIdRef.current!), 3000);
      return () => window.clearInterval(i);
    }
  }, [task, refreshLive]);

  // poll the run state to keep the Run tab status/URLs fresh
  useEffect(() => {
    if (!task || !runSnap || !taskIdRef.current) return;
    const i = window.setInterval(() => {
      codingApi.tasks.runStatus(taskIdRef.current!).then(({ runs }) => {
        const cur = runs.find((r) => r.run_id === runSnap.run_id);
        if (cur) {
          setRunSnap(cur);
          if (cur.status !== "running" && cur.status !== "starting" && runEsRef.current) {
            runEsRef.current.close();
            runEsRef.current = null;
          }
        }
      }).catch(() => {});
    }, 2500);
    return () => window.clearInterval(i);
  }, [task, runSnap]);

  // cleanup EventSource on task switch
  useEffect(() => () => {
    if (runEsRef.current) { runEsRef.current.close(); runEsRef.current = null; }
  }, []);

  const handleEvent = useCallback((ev: CodingEvent) => {
    const key = evKey(ev);
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);

    const tid = taskIdRef.current;
    if (["files_written", "project_files_written", "repair_files_written", "fix_applied"].includes(ev.kind) && tid) {
      refreshLive(tid);
    }

    switch (ev.kind) {
      case "manifest_generated":
        setCenterTab("output");
        break;
      case "workspace_created":
      case "workspace_opened":
        pushLine({ role: "agent", text: `📁 Workspace ready at ${ev.root}`, when: new Date().toLocaleTimeString() });
        break;
      case "files_written":
        pushLine({ role: "agent", text: `📝 Wrote ${ev.count} file(s)`, when: new Date().toLocaleTimeString() });
        break;
      case "command_started":
        pushLine({ role: "agent", text: `⚙️  $ ${ev.command}`, when: new Date().toLocaleTimeString() });
        break;
      case "command_finished":
        if (ev.return_code !== 0) {
          pushLine({ role: "agent", text: `⚠️  exit ${ev.return_code}: ${ev.command}`, when: new Date().toLocaleTimeString() });
        }
        break;
      case "permission_requested":
        pushLine({
          role: "agent",
          text: `🔐 Permission needed: ${ev.detail}\nApprove or deny in the panel →`,
          when: new Date().toLocaleTimeString(),
        });
        break;
      case "permission_resolved":
        pushLine({ role: "agent", text: `🔓 Permission ${ev.decision.toLowerCase()}`, when: new Date().toLocaleTimeString() });
        break;
      case "verification_started":
        pushLine({ role: "agent", text: `🧪 Verification — attempt ${ev.attempt}`, when: new Date().toLocaleTimeString() });
        break;
      case "verification_result":
        pushLine({
          role: "agent",
          text: `🧪 ${ev.ok ? "PASS" : "FAIL"} (exit ${ev.return_code}): ${ev.command}`,
          when: new Date().toLocaleTimeString(),
        });
        if (ev.ok) setAutoFix((a) => ({ ...a, state: a.state === "idle" ? a.state : "fixed" }));
        else setAutoFix((a) => ({ ...a, state: "repairing", lastError: `${ev.command} (exit ${ev.return_code})` }));
        break;
      case "repair_started":
        pushLine({ role: "agent", text: `🔧 Repair attempt ${ev.attempt}…`, when: new Date().toLocaleTimeString() });
        setAutoFix({ attempts: ev.attempt || 0, state: "repairing", lastError: "" });
        break;
      case "fix_applied":
        pushLine({ role: "agent", text: `🔧 AI fixed ${ev.count ?? (ev.files || []).length} file(s) — show diff in Changes`, when: new Date().toLocaleTimeString() });
        setAutoFix((a) => ({ ...a, state: "fixed", attempts: (a.attempts || 0) + 1 }));
        break;
      case "task_completed":
        setCenterTab("output");
        setAutoFix((a) => ({ ...a, state: a.state === "idle" ? a.state : "fixed" }));
        break;
      case "task_error":
      case "blocked_command":
        pushLine({ role: "agent", text: `⛔ ${ev.error || "blocked"}`, when: new Date().toLocaleTimeString() });
        setAutoFix((a) => ({ ...a, state: "failed", lastError: ev.error || "" }));
        break;
    }
  }, [evKey, pushLine, refreshLive]);

  const subscribe = useCallback((taskId: string) => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    const es = codingApi.tasks.events(taskId);
    esRef.current = es;
    es.onmessage = (msg) => {
      try { handleEvent(JSON.parse(msg.data)); } catch { /* keepalive/irrelevant */ }
    };
    return es;
  }, [handleEvent]);

  const subscribeRunLogs = useCallback((runId: string) => {
    if (runEsRef.current) { runEsRef.current.close(); runEsRef.current = null; }
    if (!taskIdRef.current) return;
    const es = codingApi.tasks.runLogs(taskIdRef.current, runId);
    runEsRef.current = es;
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data);
        setRunLogs((prev) => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            if (last.at === ev.at && (last.line ?? "") === (ev.line ?? "")
                && (last.message ?? "") === (ev.message ?? ""))
              return prev;
          }
          return [...prev, ev];
        });
      } catch { /* keepalive */ }
    };
    return es;
  }, []);

  const attachTask = useCallback((d: CodingTaskDetail, silent = false) => {
    taskIdRef.current = d.task_id;
    setTask(d);
    (d.events || []).forEach((ev) => seenRef.current.add(evKey(ev)));
    if (!silent) {
      if (d.status === "COMPLETED") {
        pushLine({ role: "agent", text: `✅ Done — ${d.verdict}. ${d.result_summary || ""}`, when: new Date().toLocaleTimeString() });
      } else if (d.status === "FAILED") {
        pushLine({ role: "agent", text: `❌ Failed — ${d.error_message || "check logs"}`, when: new Date().toLocaleTimeString() });
      } else if (d.status === "RUNNING") {
        pushLine({ role: "agent", text: "🚀 Agent is working on this…", when: new Date().toLocaleTimeString() });
      }
    }
    if (d.repair_attempts) setAutoFix((a) => ({ ...a, attempts: Math.max(a.attempts, d.repair_attempts), state: a.state === "idle" ? "repairing" : a.state }));
    if (d.status === "AWAITING_APPROVAL") setAutoFix((a) => ({ ...a, state: "idle" }));
    refreshLive(d.task_id);
    probeRun(d.task_id);
  }, [evKey, pushLine, refreshLive, probeRun]);

  const persistActiveSession = useCallback((sid: string | null) => {
    if (sid) localStorage.setItem(ACTIVE_SESSION_KEY, sid);
    else localStorage.removeItem(ACTIVE_SESSION_KEY);
  }, []);

  const openSession = useCallback(async (sid: string) => {
    try {
      const d: CodingSessionDetail = await codingApi.sessions.get(sid);
      if (runEsRef.current) { runEsRef.current.close(); runEsRef.current = null; }
      setRunSnap(null);
      setRunLogs([]);
      sessionIdRef.current = sid;
      persistActiveSession(sid);
      setActiveSession(d.session);
      setChat(d.chat || []);
      setMode((d.session.mode in MODE_META ? d.session.mode : "generate") as Mode);
      setProjectName(d.session.project_name || "");
      setFolderName(d.session.folder_name || "");
      setFolderPath(d.session.folder_path || "");
      setStoragePath(d.session.storage_path || "");
      setActiveFile(null);
      setOpenFiles([]);
      seenRef.current = new Set();
      if (d.task) {
        attachTask(d.task, true);
        if (!["COMPLETED", "FAILED", "CANCELLED"].includes(d.task.status)) subscribe(d.task.task_id);
      } else {
        taskIdRef.current = null;
        setTask(null);
      }
      refreshSessions();
    } catch { /* session may have been deleted; ignore */ }
  }, [attachTask, subscribe, refreshSessions, persistActiveSession]);

  useEffect(() => {
    codingApi.health().then(() => setHealth("ok")).catch(() => setHealth("down"));
    codingApi.workspaces.list()
      .then((r) => setWorkspaces(r.workspaces))
      .catch(() => {});
    refreshSessions().then(() => {
      const saved = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (saved) openSession(saved);
    });
  }, [refreshSessions, openSession]);

  function newSession() {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    if (runEsRef.current) { runEsRef.current.close(); runEsRef.current = null; }
    seenRef.current = new Set();
    sessionIdRef.current = null;
    taskIdRef.current = null;
    persistActiveSession(null);
    setActiveSession(null);
    setChat([]);
    setTask(null);
    setFilesTree([]);
    setLiveTree([]);
    setFileTree(null);
    setOpenFiles([]);
    setActiveFile(null);
    setRunSnap(null);
    setRunLogs([]);
    setAutoFix({ attempts: 0, state: "idle", lastError: "" });
    setMode("generate");
    setProjectName("");
    setFolderName("");
    setFolderPath("");
    setStoragePath("");
    setInput("");
  }

  function pickFolder(p: string) {
    if (browserFor === "folder") {
      setFolderPath(p);
      setFolderName(p.split(/[\\/]/).filter(Boolean).pop() || p);
    } else if (browserFor === "storage") {
      setStoragePath(p);
    }
    setBrowserFor(null);
  }

  async function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    pushLine({ role: "user", text, when: new Date().toLocaleTimeString() });

    let sid = sessionIdRef.current;
    if (!sid) {
      try {
        const r = await codingApi.sessions.create({
          title: (mode === "existing_project" ? folderName : projectName) || text.slice(0, 48),
          mode,
          project_name: mode === "new_project" ? projectName : null,
          folder_name: mode === "existing_project" ? folderName || null : null,
          folder_path: folderPath || null,
          storage_path: storagePath || null,
        });
        sid = r.session.session_id;
        sessionIdRef.current = sid;
        persistActiveSession(sid);
        setActiveSession(r.session);
        refreshSessions();
      } catch (e: any) {
        pushLine({ role: "agent", text: `❌ ${e?.message || "Could not start session"}`, when: new Date().toLocaleTimeString() });
        setBusy(false);
        return;
      }
    }

    try {
      let tid: string;
      if (mode === "generate") {
        ({ task_id: tid } = await codingApi.tasks.generate(text, undefined, sid));
      } else if (mode === "new_project") {
        ({ task_id: tid } = await codingApi.tasks.newProject(text, projectName, sid, storagePath));
      } else {
        if (!folderName && !folderPath) {
          pushLine({ role: "agent", text: "Select a folder to work in.", when: new Date().toLocaleTimeString() });
          setBusy(false);
          return;
        }
        ({ task_id: tid } = await codingApi.tasks.existingProject(text, folderName, folderPath, sid));
      }
      const es = subscribe(tid);
      window.setTimeout(() => {
        codingApi.tasks.get(tid).then((d) => {
          attachTask(d);
          if (d.status !== "COMPLETED" && d.status !== "FAILED") {
            poll(tid, es);
          } else {
            setBusy(false);
          }
        }).catch(() => {});
      }, 500);
    } catch (e: any) {
      pushLine({ role: "agent", text: `❌ ${e?.message || "Request failed"}`, when: new Date().toLocaleTimeString() });
      setBusy(false);
    }
  }

  function poll(taskId: string, es: AgentStream) {
    const int = window.setInterval(async () => {
      try {
        const d = await codingApi.tasks.get(taskId);
        attachTask(d);
        if (d.status === "COMPLETED" || d.status === "FAILED" || d.status === "CANCELLED") {
          window.clearInterval(int);
          es.close();
          setBusy(false);
        }
      } catch {
        window.clearInterval(int);
        setBusy(false);
      }
    }, 2500);
  }

  function approve(decision: "ALLOW_ONCE" | "ALLOW_FOR_TASK" | "DENY") {
    if (!task) return;
    codingApi.tasks.approve(task.task_id, decision).then(() => {
      codingApi.tasks.get(task.task_id).then(attachTask);
    }).catch(() => {});
  }

  // ── File explorer + live editor helpers ────────────────────────────────

  const toggleDir = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const openFile = useCallback((path: string) => {
    setCenterTab("live");
    if (!task) return;
    if (openFiles.some((f) => f.path === path)) {
      setActiveFile(path);
      return;
    }
    codingApi.tasks.file(task.task_id, path)
      .then((r) => {
        setOpenFiles((o) => [...o, { path: r.path, content: r.content, saved: true }]);
        setActiveFile(r.path);
      })
      .catch(() => {});
  }, [task, openFiles]);

  const closeFileTab = useCallback((path: string) => {
    setOpenFiles((o) => o.filter((f) => f.path !== path));
    if (activeFile === path) {
      const others = openFiles.filter((f) => f.path !== path);
      setActiveFile(others.length > 0 ? others[others.length - 1].path : null);
    }
  }, [activeFile, openFiles]);

  const updateActiveFile = useCallback((content: string) => {
    if (!activeFile) return;
    setOpenFiles((o) => o.map((f) => (f.path === activeFile ? { ...f, content, saved: false } : f)));
  }, [activeFile]);

  const saveActiveFile = useCallback(async () => {
    const f = openFiles.find((x) => x.path === activeFile);
    if (!f || !task) return;
    try {
      await codingApi.tasks.saveFile(task.task_id, f.path, f.content);
      setOpenFiles((o) => o.map((x) => (x.path === f.path ? { ...x, saved: true } : x)));
      refreshLive(task.task_id);
      pushLine({ role: "agent", text: `💾 Saved ${f.path}`, when: new Date().toLocaleTimeString() });
    } catch (e: any) {
      pushLine({ role: "agent", text: `❌ Save failed: ${e?.message || "unknown"}`, when: new Date().toLocaleTimeString() });
    }
  }, [activeFile, openFiles, task, refreshLive, pushLine]);

  // ── Run panel helpers ──────────────────────────────────────────────────

  const runProject = useCallback(async () => {
    const tid = taskIdRef.current;
    if (!tid) return;
    setRunBusy(true);
    try {
      setCenterTab("run");
      const { run } = await codingApi.tasks.run(tid);
      setRunSnap(run);
      setRunLogs([]);
      if (runEsRef.current) { runEsRef.current.close(); runEsRef.current = null; }
      subscribeRunLogs(run.run_id);
      setAutoFix((a) => ({ ...a, state: "idle", lastError: "" }));
    } catch (e: any) {
      pushLine({ role: "agent", text: `⛔ Could not run project: ${e?.message || "unknown"}`, when: new Date().toLocaleTimeString() });
    } finally {
      setRunBusy(false);
    }
  }, [subscribeRunLogs, pushLine]);

  const stopRun = useCallback(() => {
    if (!runSnap || !task) return;
    codingApi.tasks.runStop(task.task_id, runSnap.run_id).then(() => {
      pushLine({ role: "agent", text: "⏹ Stopped the project process.", when: new Date().toLocaleTimeString() });
    }).catch(() => {});
  }, [runSnap, task, pushLine]);

  const sendRunInput = useCallback(() => {
    const text = runInput.trim();
    if (!text || !runSnap || !task) return;
    codingApi.tasks.runInput(task.task_id, runSnap.run_id, text).then(() => {
      setRunLogs((prev) => [
        ...prev,
        { at: new Date().toISOString(), type: "stdin", line: `⏎ ${text}` } as RunLogEntry,
      ]);
      setRunInput("");
      setRunInputOpen(false);
    }).catch((e: any) => {
      pushLine({ role: "agent", text: `❌ Input failed: ${e?.message || "unknown"}`, when: new Date().toLocaleTimeString() });
    });
  }, [runInput, runSnap, task, pushLine]);

  const lastRunError = useCallback((): string => {
    const tail = [...runLogs].slice(-60);
    const lines = tail.filter((l) => l.type === "stdout").map((l) => l.line || "").reverse();
    const errLines = [] as string[];
    for (const ln of lines) {
      if (/error|traceback|exception|failed|exit /i.test(ln)) errLines.push(ln);
      if (errLines.length >= 12) break;
    }
    // Historical failure text from the server run state (e.g. "Process exited rc=1").
    const exitMsg = tail.find((l) => l.type === "status" && l.exit !== undefined && l.exit !== 0);
    const msg = errLines.length > 0
      ? errLines.join("\n")
      : (exitMsg?.message || "The project failed to run (non-zero exit code).");
    return msg;
  }, [runLogs]);

  const aiFix = useCallback(async () => {
    const tid = taskIdRef.current;
    if (!tid || fixBusy) return;
    setFixBusy(true);
    pushLine({ role: "agent", text: "🔧 Asking the coding agent to find and fix the error…", when: new Date().toLocaleTimeString() });
    try {
      const errorText = lastRunError();
      const res: AiFixResult = await codingApi.tasks.aiFix(tid, errorText);
      setAutoFix((a) => ({ ...a, state: "fixed", attempts: (a.attempts || 0) + 1, lastError: "" }));
      if (res.run) {
        setRunSnap(res.run);
        setRunLogs([]);
        if (runEsRef.current) { runEsRef.current.close(); runEsRef.current = null; }
        subscribeRunLogs(res.run.run_id);
      }
      refreshLive(tid);
      codingApi.tasks.get(tid).then(attachTask).catch(() => {});
      if (res.changes && res.changes.length > 0) {
        pushLine({ role: "agent", text: `✅ Fixed ${res.changes.length} file(s). Diffs in the Changes tab — re-running now to verify.`, when: new Date().toLocaleTimeString() });
      } else {
        pushLine({ role: "agent", text: "🔧 No file changes were needed — re-run in progress to verify.", when: new Date().toLocaleTimeString() });
      }
      setCenterTab("run");
    } catch (e: any) {
      setAutoFix((a) => ({ ...a, state: "failed", lastError: e?.message || "unknown" }));
      pushLine({ role: "agent", text: `❌ AI fix failed: ${e?.message || "unknown"}`, when: new Date().toLocaleTimeString() });
    } finally {
      setFixBusy(false);
    }
  }, [fixBusy, lastRunError, subscribeRunLogs, refreshLive, attachTask, pushLine]);

  // ── Session management ─────────────────────────────────────────────────

  async function doRename() {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (!title) return;
    try {
      const r = await codingApi.sessions.rename(renameTarget.session_id, title);
      setActiveSession((a) => (a?.session_id === r.session.session_id ? r.session : a));
      await refreshSessions();
      setRenameTarget(null);
    } catch (e: any) {
      pushLine({ role: "agent", text: `❌ Rename failed: ${e?.message || "unknown"}`, when: new Date().toLocaleTimeString() });
    }
  }

  async function doDelete() {
    if (!delTarget) return;
    try {
      await codingApi.sessions.delete(delTarget.session_id);
      await refreshSessions();
      if (activeSession?.session_id === delTarget.session_id) newSession();
      setDelTarget(null);
      setMenuFor(null);
    } catch (e: any) {
      pushLine({ role: "agent", text: `❌ Delete failed: ${e?.message || "unknown"}`, when: new Date().toLocaleTimeString() });
    }
  }

  const pendingPerms = (task?.permission_requests || []).filter((p) => p.decision === null);

  // Persistent running timer (restored across refresh via task.created_at)
  const startMs = task?.created_at ? new Date(task.created_at).getTime() : null;
  const terminal = !!task && ["COMPLETED", "FAILED", "CANCELLED"].includes(task.status);
  const endMs = task?.completed_at ? new Date(task.completed_at).getTime() : terminal ? nowTick : null;
  const running = !!task && !!startMs && !endMs && !terminal;
  const elapsedSec = startMs ? Math.max(0, Math.floor(((endMs ?? nowTick) - startMs) / 1000)) : 0;

  let center: React.ReactNode = null;
  if (centerTab === "output") {
    center = (
      <div className="p-4 space-y-2 overflow-y-auto h-full">
        {task?.events?.slice(-30).map((ev, i) => (
          <EventRow key={`${ev.at}-${i}`} ev={ev} />
        ))}
        <p className="text-[10px] text-slate-900 pt-1">Live event stream from the agent — SSE connection.</p>
      </div>
    );
  } else if (centerTab === "live") {
    center = (
      <div className="flex h-full min-h-0">
        <div className="w-[260px] flex-none overflow-y-auto p-3 border-r border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-mono text-slate-900 truncate">{task?.authorized_root || "no workspace"}</p>
            <button
              title="Refresh file tree"
              onClick={() => task && refreshLive(task.task_id)}
              className="text-[var(--color-text-secondary)] hover:text-teal-700 flex-none"
            >
              <RefreshCw size={11} />
            </button>
          </div>
          {!fileTree && <p className="text-[12px] text-[var(--color-text-secondary)]">No files yet — start a task to see live code.</p>}
          {fileTree && (
            <FileTreeView
              node={fileTree}
              depth={0}
              expanded={expanded}
              activePath={activeFile}
              onToggle={toggleDir}
              onOpenFile={openFile}
            />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          {openFiles.length > 0 && (
            <div className="flex-none flex items-center gap-1 px-2 pt-1.5 border-b border-[#E2E8F0] overflow-x-auto">
              {openFiles.map((f) => (
                <span
                  key={f.path}
                  className={`flex items-center gap-1 h-6 px-2 rounded-t-[5px] text-[10.5px] border border-b-0 max-w-[200px] ${
                    f.path === activeFile
                      ? "bg-teal-50 text-teal-700 border-teal-200"
                      : "bg-white text-slate-700 border-slate-200"
                  }`}
                >
                  <button className="truncate flex-1" onClick={() => setActiveFile(f.path)}>{f.path}</button>
                  {!f.saved && <span className="text-[#B45309] flex-none">●</span>}
                  <button onClick={() => closeFileTab(f.path)} className="text-slate-900 hover:text-teal-700 flex-none">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {openFiles.filter((f) => f.path === activeFile)[0] ? (
              <EditorPane
                file={openFiles.filter((f) => f.path === activeFile)[0]}
                onChange={updateActiveFile}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-[12px] text-[var(--color-text-secondary)]">Select a file from the tree to view &amp; edit its code.</p>
              </div>
            )}
            {openFiles.filter((f) => f.path === activeFile)[0]?.saved === false && (
              <div className="absolute top-2 right-2 flex items-center gap-2">
                <span className="text-[9.5px] text-[#B45309] bg-[#FFFFFF]/90 px-2 py-1 rounded border border-[#E2E8F0]">unsaved changes</span>
                <button
                  onClick={saveActiveFile}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] bg-[#0D9488] hover:bg-[#0D9488] text-[var(--color-text-primary)] text-[11px] font-medium"
                >
                  <Save size={12} /> Save
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } else if (centerTab === "files") {
    center = (
      <div className="p-4 overflow-y-auto h-full">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-mono text-slate-900">{task?.authorized_root || "no workspace"}</p>
          <button
            title="Refresh file tree"
            onClick={() => task && refreshLive(task.task_id)}
            className="text-[var(--color-text-secondary)] hover:text-teal-700"
          >
            <RefreshCw size={11} />
          </button>
        </div>
        {!fileTree && (task?.file_changes || []).length === 0 && (
          <p className="text-[12px] text-[var(--color-text-secondary)]">No files yet — start a task.</p>
        )}
        {fileTree && (
          <FileTreeView
            node={fileTree}
            depth={0}
            expanded={expanded}
            activePath={activeFile}
            onToggle={toggleDir}
            onOpenFile={openFile}
          />
        )}
        {(task?.file_changes || []).filter((c) => !fileTree?.children?.some(() => false)).length > 0 && (
          <div className="mt-3 border-t border-[#E2E8F0] pt-2">
            <p className="text-[9.5px] uppercase tracking-wider text-slate-900 mb-1">Agent changes</p>
            <ul className="font-mono text-[12px] space-y-1">
              {(task?.file_changes || []).map((c) => (
                <li key={c.path + c.change_type} className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <GitCompare size={12} className="text-[var(--color-text-secondary)] flex-none" />
                  <button className="truncate flex-1 text-left hover:text-[#0F766E]" onClick={() => openFile(c.path)}>{c.path}</button>
                  <span className={`text-[9.5px] ${c.change_type === "delete" ? "text-red-600" : "text-[#B45309]"}`}>{c.change_type}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  } else if (centerTab === "changes") {
    center = (
      <div className="p-4 overflow-y-auto h-full space-y-3">
        {(task?.file_changes || []).length === 0 && (
          <p className="text-[12px] text-[var(--color-text-secondary)]">No changes recorded yet.</p>
        )}
        {(task?.file_changes || []).map((c) => (
          <div key={c.path + c.change_type + (c.diff || "").length} className="rounded-[6px] bg-[#FFFFFF] border border-[#E2E8F0] overflow-hidden">
            <div className="px-3 py-2 flex items-center gap-2 border-b border-[#E2E8F0]">
              <GitCompare size={12} className="text-[#0F766E]" />
              <span className="text-[12px] font-medium text-slate-900">{c.path}</span>
              <span className="text-[9.5px] px-1.5 py-px rounded bg-[#0D9488]/15 text-[#0F766E] font-semibold">{c.change_type}</span>
            </div>
            {c.diff ? (
              <pre className="p-3 text-[11px] font-mono leading-relaxed text-[var(--color-text-secondary)] overflow-x-auto">{c.diff}</pre>
            ) : (
              <p className="p-3 text-[11px] text-[var(--color-text-secondary)]">(new file — no diff recorded)</p>
            )}
          </div>
        ))}
      </div>
    );
  } else if (centerTab === "tests") {
    center = (
      <div className="p-4 overflow-y-auto h-full space-y-2">
        {(task?.test_results || []).length === 0 && (
          <p className="text-[12px] text-[var(--color-text-secondary)]">No test results yet.</p>
        )}
        {(task?.test_results || []).map((t, i) => (
          <div key={i} className="rounded-[6px] border px-3 py-2 border-[#E2E8F0] bg-[#FFFFFF]">
            <div className="flex items-center gap-2">
              {t.passed
                ? <CheckCircle2 size={13} className="text-[#0F766E]" />
                : <AlertTriangle size={13} className="text-[#B45309]" />}
              <span className={`text-[12px] font-medium ${t.passed ? "text-[#0F766E]" : "text-[#B45309]"}`}>
                {t.passed ? "PASS" : "FAIL"}
              </span>
              <span className="text-[11px] text-[var(--color-text-secondary)] font-mono truncate flex-1">{t.command}</span>
              <span className="text-[10px] text-slate-900">attempt {t.attempt}</span>
            </div>
            {!t.passed && t.stdout && <pre className="mt-1.5 text-[10.5px] font-mono text-[var(--color-text-secondary)] whitespace-pre-wrap">{t.stdout.slice(-400)}</pre>}
          </div>
        ))}
      </div>
    );
  } else if (centerTab === "run") {
    center = (
      <RunPanel
        runSnap={runSnap}
        runLogs={runLogs}
        busy={runBusy}
        fixBusy={fixBusy}
        inputOpen={runInputOpen}
        inputValue={runInput}
        onInputChange={setRunInput}
        onToggleInput={() => setRunInputOpen((v) => !v)}
        onSendInput={sendRunInput}
        onRun={runProject}
        onStop={stopRun}
        onFix={aiFix}
        onOpenChanges={() => setCenterTab("changes")}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#F7F9FC]">
      {/* ── Sessions strip ─────────────────────────────────────────────── */}
      <div className="flex-none h-[32px] flex items-center gap-1.5 px-3 border-b border-[#E2E8F0] bg-[#F8FAFC] overflow-x-auto">
        <History size={12} className="text-slate-900 flex-none" />
        <button
          onClick={newSession}
          className="flex-none flex items-center gap-1 h-[22px] px-2 rounded-[5px] text-[10.5px] text-[#0F766E] hover:bg-[#0D9488]/12 border border-[#0D9488]/25"
        >
          <Plus size={10} /> New session
        </button>
        {sessions.slice(0, 20).map((s) => (
          <div key={s.session_id} className="relative flex-none max-w-[190px]">
            <button
              onClick={() => openSession(s.session_id)}
              title={`${s.title} · ${new Date(s.updated_at || "").toLocaleString()}`}
              className={`flex items-center gap-1 h-[22px] px-2 pr-0 rounded-[5px] text-[10.5px] border transition-colors w-full max-w-[170px] ${
                s.session_id === activeSession?.session_id
                  ? "bg-[#0D9488]/15 text-[#0F766E] border-[#0D9488]/25"
                  : "text-[var(--color-text-secondary)] hover:text-slate-900 hover:bg-slate-50 border-slate-200"
              }`}
            >
              <CircleDot size={9} className={s.session_id === activeSession?.session_id ? "text-[#0F766E]" : "text-slate-900"} />
              <span className="truncate">{s.title}</span>
            </button>
            <button
              onClick={() => setMenuFor(menuFor === s.session_id ? null : s.session_id)}
              title="Session options"
              className="absolute right-0 top-1/2 -translate-y-1/2 h-[18px] w-[18px] flex items-center justify-center rounded text-slate-900 hover:text-[var(--color-text-secondary)] hover:bg-slate-100"
            >
              {menuFor === s.session_id ? <X size={9} /> : <ChevronDown size={10} />}
            </button>
            {menuFor === s.session_id && (
              <div className="absolute top-full right-0 z-40 mt-0.5 w-[150px] rounded-[6px] bg-[#FFFFFF] border border-[#E2E8F0] shadow-xl overflow-hidden">
                <button
                  onClick={() => { setMenuFor(null); setRenameTarget(s); setRenameValue(s.title); }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-[10.5px] text-[var(--color-text-secondary)] hover:bg-slate-100 hover:text-slate-900"
                >
                  <PenLine size={11} /> Rename session
                </button>
                <button
                  onClick={() => { setMenuFor(null); setDelTarget(s); }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-[10.5px] text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={11} /> Delete session
                </button>
              </div>
            )}
          </div>
        ))}
        {sessions.length === 0 && <span className="text-[10px] text-slate-900">No saved sessions — your chats persist automatically.</span>}
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* ── Left: chat + mode ─────────────────────────────────────────── */}
        <div className="w-[300px] flex-none flex flex-col border-r border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="px-3 pt-3 pb-2 border-b border-[#E2E8F0]">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-900 mb-2">WORKFLOW</p>
            <div className="space-y-1">
              {(Object.keys(MODE_META) as Mode[]).map((m) => {
                const meta = MODE_META[m];
                const active = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-[6px] text-left text-[11.5px] transition-colors ${
                      active ? "bg-[#0D9488]/12 text-[#0F766E] border border-[#0D9488]/20" : "text-[var(--color-text-secondary)] hover:bg-slate-100 border border-transparent"
                    }`}
                  >
                    <meta.Icon size={13} className="flex-none" />
                    <span className="flex-1">{meta.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[9.5px] text-[var(--color-text-secondary)] mt-2 leading-snug">{MODE_META[mode].hint}</p>

            {mode === "existing_project" && (
              <div className="mt-2">
                <label className="text-[9.5px] text-slate-900 uppercase tracking-wider">Folder</label>
                <div className="relative">
                  <FolderOpen size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
                  <input
                    value={folderName}
                    onChange={(e) => { setFolderName(e.target.value); if (e.target.value) setFolderPath(""); }}
                    placeholder="e.g. my-project"
                    className="w-full h-8 pl-7 pr-2 rounded-[6px] bg-[#FFFFFF] border border-[#E2E8F0] text-[11.5px] text-slate-900 outline-none focus:border-[#0D9488] placeholder:text-slate-900"
                  />
                </div>
                {(folderName || folderPath) && (
                  <p className="text-[9px] font-mono text-slate-900 mt-1 truncate">{folderPath || folderName}</p>
                )}
                <button
                  onClick={() => setBrowserFor("folder")}
                  className="mt-1.5 w-full flex items-center gap-1.5 h-7 px-2 rounded-[6px] bg-[#FFFFFF] border border-[#E2E8F0] text-[10.5px] text-[var(--color-text-secondary)] hover:bg-slate-100 hover:text-slate-900"
                >
                  <FolderSearch size={11} /> Browse folder…
                </button>
                {workspaces.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 max-h-24 overflow-y-auto">
                    {workspaces.map((w) => (
                      <li key={w.name}>
                        <button
                          onClick={() => { setFolderName(w.name); setFolderPath(""); }}
                          className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10.5px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)] hover:bg-slate-100"
                        >
                          <FolderOpen size={10} />{w.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {mode === "new_project" && (
              <div className="mt-2">
                <label className="text-[9.5px] text-slate-900 uppercase tracking-wider">Project name (optional)</label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. calc-service"
                  className="w-full h-8 px-2 rounded-[6px] bg-[#FFFFFF] border border-[#E2E8F0] text-[11.5px] text-slate-900 outline-none focus:border-[#0D9488] placeholder:text-slate-900"
                />
                <div className="mt-2">
                  <label className="text-[9.5px] text-slate-900 uppercase tracking-wider">Save to</label>
                  <button
                    onClick={() => setBrowserFor("storage")}
                    className="mt-1 w-full flex items-center gap-1.5 h-7 px-2 rounded-[6px] bg-[#FFFFFF] border border-[#E2E8F0] text-[10.5px] text-[var(--color-text-secondary)] hover:bg-slate-100 hover:text-slate-900"
                  >
                    <FolderSearch size={11} />
                    <span className="truncate flex-1 text-left">{storagePath || "default coding workspace"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {chat.length === 0 && (
              <div className="text-[11.5px] text-[var(--color-text-secondary)] text-center mt-8 leading-relaxed">
                <Bot size={22} className="mx-auto mb-2 text-slate-900" />
                Ask the local coding agent to generate, build, or fix code. Everything stays on this machine.
              </div>
            )}
            {chat.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className={`w-6 h-6 rounded flex-none mt-0.5 flex items-center justify-center ${c.role === "user" ? "bg-[#0D9488]/15 text-[#0F766E]" : "bg-[#0D9488]/15 text-[#0F766E]"}`}>
                  {c.role === "user" ? <User size={12} /> : <Bot size={12} />}
                </div>
                <div className="min-w-0">
                  <p className="text-[11.5px] text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap break-words">{c.text}</p>
                  <p className="text-[9px] text-slate-900 mt-0.5">{c.when}</p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t border-[#E2E8F0]">
            {busy && (
              <div className="mb-2 flex items-center gap-2 text-[10.5px] text-[#0F766E]">
                <Loader2 size={12} className="animate-spin" /> Working with local model…
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                rows={2}
                placeholder={MODE_META[mode].hint + "…"}
                className="flex-1 resize-none bg-[#FFFFFF] border border-[#E2E8F0] rounded-[6px] px-2.5 py-2 text-[12px] text-slate-900 outline-none focus:border-[#0D9488] placeholder:text-slate-900"
              />
              <button
                onClick={submit}
                disabled={busy || !input.trim()}
                className="h-9 w-9 flex-none rounded-[6px] bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-40 flex items-center justify-center text-[var(--color-text-primary)] transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Center: tabs + content ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#FFFFFF]">
          <div className="flex-none flex items-center border-b border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1.5 gap-1">
            {([
              ["output", "Output", Terminal],
              ["run", "Run", Play],
              ["live", "Live Code", Monitor],
              ["files", "Files", Files],
              ["changes", "Changes", GitCompare],
              ["tests", "Tests", FlaskConical],
            ] as [CenterTab, string, React.ElementType][]).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setCenterTab(id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-[11px] h-7 transition-colors ${
                  centerTab === id ? "bg-[#0D9488]/12 text-[#0F766E] font-medium" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)] hover:bg-slate-100"
                }`}
              >
                <Icon size={12} />{label}
                {id === "run" && runSnap?.is_running && (
                  <span className="text-[9px] w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-pulse" />
                )}
                {id === "changes" && (task?.file_changes?.length || 0) > 0 && (
                  <span className="text-[9px] bg-[#0D9488]/20 text-[#0F766E] rounded-full px-1.5">{task!.file_changes!.length}</span>
                )}
                {id === "live" && liveTree.length > 0 && (
                  <span className="text-[9px] bg-[#0D9488]/15 text-[#0F766E] rounded-full px-1.5">{liveTree.length}</span>
                )}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <span className={`text-[9.5px] flex items-center gap-1 ${health === "ok" ? "text-[#0F766E]" : health === "down" ? "text-red-600" : "text-[var(--color-text-secondary)]"}`}>
                <CircleDot size={10} /> {health === "ok" ? "local model online" : health === "down" ? "coding service offline" : "checking…"}
              </span>
              <button
                disabled={!task || !task.authorized_root || runBusy}
                onClick={runProject}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] bg-[#0D9488]/15 text-[#0F766E] border border-[#0D9488]/25 hover:bg-[#0D9488]/25 text-[11px] font-medium disabled:opacity-40 transition-colors"
                title="Run the project (detects type, starts server/script, streams logs)"
              >
                {runBusy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                {runSnap?.is_running ? "Re-run" : "Run"}
              </button>
              <button
                disabled={!task}
                onClick={() => pushLine({ role: "agent", text: "📦 ZIP export is simulated in this demo — files are shown in the Live Code / Files tabs.", when: new Date().toLocaleTimeString() })}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] bg-[#0D9488]/15 text-[#0F766E] border border-[#0D9488]/25 hover:bg-[#0D9488]/25 text-[11px] font-medium disabled:opacity-40 transition-colors"
              >
                <Download size={12} /> ZIP
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden bg-[#FFFFFF]">{center}</div>
        </div>

        {/* ── Right: task status + permissions ──────────────────────────── */}
        <div className="w-[280px] flex-none flex flex-col border-l border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="px-3 pt-3 pb-2 border-b border-[#E2E8F0]">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-900">TASK</p>
            <p className="text-[12px] font-semibold text-slate-900 mt-1 truncate">{task?.title || "No active task"}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <StatusPill status={task?.status || null} />
              {task?.verdict && <span className="text-[9.5px] text-[var(--color-text-secondary)]">{task.verdict}</span>}
              {task?.engine && <span className="text-[9px] text-slate-900">engine: {task.engine}</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              {running && (
                <span className="flex items-center gap-1 text-[10.5px] font-mono text-[#0F766E]">
                  <Timer size={10} /> Running · {fmtDuration(elapsedSec)}
                </span>
              )}
              {terminal && (
                <span className="flex items-center gap-1 text-[10.5px] font-mono text-[#0F766E]">
                  <CheckCircle2 size={10} /> Done · {fmtDuration(elapsedSec)}
                </span>
              )}
            </div>
          </div>

          {/* AUTO-FIX tracker */}
          <div className="px-3 py-3 border-b border-[#E2E8F0]">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-900 mb-1.5">AUTO-FIX</p>
            {autoFix.state === "idle" && (
              <p className="text-[10.5px] text-slate-900">{task ? "No fixes needed yet." : "Start a task to see auto error fixes."}</p>
            )}
            {autoFix.state === "repairing" && (
              <p className="text-[10.5px] text-[#B45309] flex items-center gap-1">
                <Wrench size={10} className="animate-pulse" /> Repairing ({autoFix.attempts || 1} attempt)…
              </p>
            )}
            {autoFix.state === "fixed" && (
              <p className="text-[10.5px] text-[#0F766E] flex items-center gap-1">
                <CheckCircle2 size={10} /> Fixed after {autoFix.attempts || 1} repair(s)
              </p>
            )}
            {autoFix.state === "failed" && (
              <p className="text-[10.5px] text-red-600 flex items-start gap-1">
                <AlertTriangle size={10} className="flex-none mt-0.5" />
                <span className="break-words">Fix failed: {autoFix.lastError}</span>
              </p>
            )}
          </div>

          {/* Permission requests */}
          <div className="px-3 py-3 border-b border-[#E2E8F0]">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-900 mb-2">PERMISSIONS</p>
            {pendingPerms.length === 0 ? (
              <p className="text-[10.5px] text-slate-900">No pending requests.</p>
            ) : (
              <div className="space-y-2">
                {pendingPerms.map((p) => (
                  <div key={p.request_id} className="rounded-[6px] border border-[#D97706]/30 bg-[#FFFFFF] p-2.5">
                    <div className="flex items-center gap-1.5 text-[#B45309] mb-1">
                      <ShieldQuestion size={12} />
                      <span className="text-[10px] font-semibold uppercase">{p.kind}</span>
                    </div>
                    <p className="text-[10.5px] text-[var(--color-text-secondary)] font-mono break-words">{p.command || p.detail}</p>
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={() => approve("ALLOW_ONCE")} className="flex-1 h-6 rounded text-[10px] font-semibold bg-[#0D9488]/15 text-[#0F766E] hover:bg-[#0D9488]/25 flex items-center justify-center gap-1">
                        <Check size={10} /> Once
                      </button>
                      <button onClick={() => approve("ALLOW_FOR_TASK")} className="flex-1 h-6 rounded text-[10px] font-semibold bg-[#0D9488]/15 text-[#0F766E] hover:bg-[#0D9488]/25 flex items-center justify-center gap-1">
                        <Check size={10} /> Always
                      </button>
                      <button onClick={() => approve("DENY")} className="flex-1 h-6 rounded text-[10px] font-semibold bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center gap-1">
                        <Ban size={10} /> Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {pendingPerms.length === 0 && (task?.permission_requests || []).length > 0 && (
              <p className="text-[9.5px] text-slate-900 mt-1">Earlier requests already resolved.</p>
            )}
          </div>

          {/* Project / workspace */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-900 mb-2">PROJECT</p>
            <div className="space-y-1.5">
              {(task?.executions || []).slice(-6).map((ex) => (
                <div key={ex.execution_id} className="rounded bg-[#FFFFFF] border border-[#E2E8F0] px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Terminal size={10} className="text-[var(--color-text-secondary)] flex-none" />
                    <span className="text-[10.5px] font-mono text-[var(--color-text-secondary)] truncate">{ex.command}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[9px] text-slate-900">
                    <span className={ex.return_code === 0 ? "text-[#0F766E]" : "text-[#B45309]"}>rc {ex.return_code ?? "—"}</span>
                    <span>{ex.duration_ms ? `${Math.round(ex.duration_ms / 1000)}s` : ""}</span>
                  </div>
                </div>
              ))}
              {(task?.executions || []).length === 0 && (
                <p className="text-[10.5px] text-slate-900">No commands run yet.</p>
              )}
            </div>

            <div className="mt-3">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-900 mb-1.5">SESSION</p>
              {activeSession ? (
                <div className="flex items-center gap-1.5 px-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10.5px] text-[var(--color-text-secondary)] truncate">{activeSession.title}</p>
                    <p className="font-mono text-[9.5px] text-slate-900 break-words">{activeSession.folder_path || activeSession.storage_path || activeSession.mode}</p>
                  </div>
                  <button
                    onClick={() => { setRenameTarget(activeSession); setRenameValue(activeSession.title); }}
                    title="Rename session"
                    className="flex-none text-slate-900 hover:text-[#0F766E]"
                  >
                    <PenLine size={11} />
                  </button>
                  <button
                    onClick={() => setDelTarget(activeSession)}
                    title="Delete session"
                    className="flex-none text-slate-900 hover:text-red-600"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ) : (
                <p className="text-[10.5px] text-slate-900">No session — start a task to auto-create one.</p>
              )}
            </div>

            <div className="mt-3">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-900 mb-1.5">OTHER WORKSPACES</p>
              {workspaces.map((w) => (
                <div key={w.name} className="flex items-center gap-1.5 text-[10.5px] text-[var(--color-text-secondary)] px-1 py-0.5">
                  <Boxes size={10} className="flex-none" />{w.name}
                </div>
              ))}
              {task?.status === "FAILED" && (
                <button onClick={() => task && codingApi.tasks.cancel(task.task_id)} className="mt-2 text-[10px] text-[#B45309] flex gap-1 items-center">
                  <PauseCircle size={10} /> cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Folder browser modal ───────────────────────────────────────── */}
      {browserFor && (
        <FolderBrowserModal
          title={browserFor === "folder" ? "Open existing project folder" : "Choose storage location for the new project"}
          initialPath={browserFor === "folder" ? folderPath : storagePath}
          onSelect={pickFolder}
          onClose={() => setBrowserFor(null)}
        />
      )}

      {/* ── Rename session modal ───────────────────────────────────────── */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setRenameTarget(null)}>
          <div className="w-[380px] rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center gap-2">
              <PenLine size={14} className="text-[#0F766E]" />
              <p className="text-[12px] font-semibold text-slate-900">Rename session</p>
            </div>
            <div className="p-4">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doRename(); if (e.key === "Escape") setRenameTarget(null); }}
                placeholder="Session title"
                className="w-full h-9 px-2.5 rounded-[6px] bg-[#FFFFFF] border border-[#E2E8F0] text-[12px] text-slate-900 outline-none focus:border-[#0D9488] placeholder:text-slate-900"
              />
            </div>
            <div className="flex-none px-4 py-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
              <button onClick={() => setRenameTarget(null)} className="h-7 px-3 rounded-[6px] text-[11px] text-[var(--color-text-secondary)] hover:bg-slate-100">Cancel</button>
              <button
                onClick={doRename}
                disabled={!renameValue.trim()}
                className="h-7 px-3 rounded-[6px] bg-[#0D9488] hover:bg-[#0F766E] text-[var(--color-text-primary)] text-[11px] font-medium disabled:opacity-40"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete session confirmation ────────────────────────────────── */}
      {delTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setDelTarget(null)}>
          <div className="w-[400px] rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center gap-2">
              <Trash2 size={14} className="text-red-600" />
              <p className="text-[12px] font-semibold text-slate-900">Delete session?</p>
            </div>
            <div className="p-4 text-[11.5px] text-[var(--color-text-secondary)] leading-relaxed">
              <p className="font-medium text-slate-900 mb-1">"{delTarget.title}"</p>
              This permanently removes the session, its chat history and agent tasks. Workspace folders on disk are kept.
            </div>
            <div className="flex-none px-4 py-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
              <button onClick={() => setDelTarget(null)} className="h-7 px-3 rounded-[6px] text-[11px] text-[var(--color-text-secondary)] hover:bg-slate-100">Cancel</button>
              <button
                onClick={doDelete}
                className="h-7 px-3 rounded-[6px] bg-red-600 hover:bg-red-600 text-[var(--color-text-primary)] text-[11px] font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-[9.5px] text-slate-900">idle</span>;
  const map: Record<string, string> = {
    RUNNING: "text-[#0F766E] bg-[#0D9488]/15",
    COMPLETED: "text-[#0F766E] bg-[#0D9488]/15",
    FAILED: "text-red-600 bg-red-50",
    CANCELLED: "text-[var(--color-text-secondary)] bg-[#E2E8F0]/40",
    AWAITING_APPROVAL: "text-[#B45309] bg-[#D97706]/15",
  };
  return (
    <span className={`px-1.5 py-px rounded text-[9px] font-semibold ${map[status] || "text-[var(--color-text-secondary)] bg-[#E2E8F0]/40"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function EventRow({ ev }: { ev: CodingEvent }) {
  let dot = "bg-[var(--color-text-muted)]";
  let text = ev.kind as string;
  let sub = "";
  if (ev.kind === "command_finished" || ev.kind === "verification_result") {
    dot = (ev.ok || ev.return_code === 0) ? "bg-[#0D9488]" : ev.kind === "verification_result" ? "bg-[#D97706]" : "bg-red-600";
    text = `▸ ${ev.command} — ${ev.ok || ev.return_code === 0 ? "ok" : `exit ${ev.return_code}`}`;
  } else if (ev.kind === "permission_requested") {
    dot = "bg-[#D97706]";
    text = `🔐 ${ev.detail}`;
  } else if (ev.kind === "task_completed") {
    dot = "bg-[#0D9488]";
    text = `task completed — ${ev.verdict || ""}`;
  } else if (ev.kind === "task_error" || ev.kind === "blocked_command") {
    dot = "bg-red-600";
    text = ev.error || ev.kind;
  } else if (["manifest_generated", "files_written", "project_files_written", "repair_files_written", "fix_applied"].includes(ev.kind)) {
    dot = "bg-[#0D9488]";
    text = `${ev.kind.replace(/_/g, " ")}${ev.count ? ` (${ev.count})` : ""}`;
  }
  const when = ev.at ? new Date(ev.at).toLocaleTimeString([], { hour12: false }) : "";
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-none ${dot}`} />
      <div className="min-w-0">
        <p className="text-[11px] text-[var(--color-text-secondary)] break-words">{text}</p>
        {sub && <p className="text-[9px] text-slate-900">{sub}</p>}
        <p className="text-[8.5px] text-slate-900">{when}</p>
      </div>
    </div>
  );
}

// ── Recursive file tree (expand/collapse folders) ─────────────────────────

function FileTreeView({
  node, depth, expanded, activePath, onToggle, onOpenFile,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  activePath: string | null;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth === 0 || expanded.has(node.path));
  const isDir = node.type === "dir";

  // keep local expansion in sync when the parent re-renders with new trees
  useEffect(() => {
    if (isDir) setIsOpen(depth === 0 || expanded.has(node.path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  if (!isDir) {
    return (
      <li>
        <button
          onClick={() => onOpenFile(node.path)}
          className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors ${
            activePath === node.path ? "bg-[#0D9488]/15 text-[#0F766E]" : "text-[var(--color-text-secondary)] hover:bg-slate-100"
          }`}
        >
          <FileCode2 size={12} className="text-[var(--color-text-secondary)] flex-none" />
          <span className="truncate flex-1">{node.name}</span>
          {node.size > 0 && <span className="text-[9px] text-slate-900 flex-none">{node.size} B</span>}
        </button>
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={() => { setIsOpen((v) => !v); onToggle(node.path); }}
        className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left text-slate-900 hover:bg-slate-100 transition-colors"
      >
        <ChevronRight size={11} className={`flex-none transition-transform ${isOpen ? "rotate-90" : ""} text-slate-900`} />
        <FolderOpen size={12} className="text-[#0F766E] flex-none" />
        <span className="truncate flex-1">{node.name}</span>
      </button>
      {isOpen && (
        <ul className="ml-3 border-l border-[#E2E8F0] pl-1 space-y-0.5 mt-0.5">
          {(node.children || []).map((c) => (
            <FileTreeView
              key={c.path || c.name}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              activePath={activePath}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
            />
          ))}
          {(node.children || []).length === 0 && (
            <li className="text-[10px] text-slate-900 px-1.5 py-0.5">(empty folder)</li>
          )}
        </ul>
      )}
    </li>
  );
}

// ── Live code editor pane ───────────────────────────────────────────────────

function EditorPane({
  file, onChange,
}: {
  file: EditorFile;
  onChange: (content: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.value = file.content;
      ref.current.scrollTop = 0;
    }
  }, [file.path]);
  return (
    <textarea
      ref={ref}
      key={file.path}
      defaultValue={file.content}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // insert real tabs instead of jumping focus
        if (e.key === "Tab" && !e.shiftKey && ref.current) {
          e.preventDefault();
          const el = ref.current;
          const start = el.selectionStart;
          const end = el.selectionEnd;
          const next = el.value.slice(0, start) + "  " + el.value.slice(end);
          el.value = next;
          el.selectionStart = el.selectionEnd = start + 2;
          onChange(next);
        }
      }}
      className="w-full h-full p-4 text-[11.5px] font-mono leading-relaxed text-slate-900 bg-transparent outline-none resize-none whitespace-pre"
    />
  );
}

// ── Run tab: status, URLs, streaming logs, stdin, AI fix ───────────────────

function RunPanel({
  runSnap, runLogs, busy, fixBusy, inputOpen, inputValue,
  onInputChange, onToggleInput, onSendInput, onRun, onStop, onFix, onOpenChanges,
}: {
  runSnap: RunSnapshot | null;
  runLogs: RunLogEntry[];
  busy: boolean;
  fixBusy: boolean;
  inputOpen: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  onToggleInput: () => void;
  onSendInput: () => void;
  onRun: () => void;
  onStop: () => void;
  onFix: () => void;
  onOpenChanges: () => void;
}) {
  const failed = !!runSnap && (runSnap.status === "exited" && (runSnap.exit_code ?? 1) !== 0 || runSnap.status === "error");
  const running = !!runSnap && (runSnap.status === "running" || runSnap.status === "starting");
  const runConsoleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    runConsoleRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [runLogs]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-none px-4 py-2.5 border-b border-slate-700 bg-slate-900 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={`text-[9.5px] font-semibold px-2 py-px rounded-full ${
          running ? "bg-[#0D9488]/15 text-[#0F766E]" :
          failed ? "bg-red-50 text-red-600" :
          runSnap ? "bg-slate-700 text-slate-300" : "bg-slate-800 text-slate-400"
        }`}>
          {runSnap ? runSnap.status : "not started"}
        </span>
        {runSnap?.command && (
          <code className="text-[11px] font-mono text-slate-300">$ {runSnap.command}</code>
        )}
        {runSnap && runSnap.kind && (
          <span className="text-[9.5px] text-slate-400 uppercase tracking-wider">{runSnap.kind}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {running && (
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[11px] font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
            >
              <StopCircle size={12} /> Stop
            </button>
          )}
          <button
            onClick={onRun}
            disabled={busy}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[11px] font-medium bg-[#0D9488]/15 text-[#0F766E] border border-[#0D9488]/25 hover:bg-[#0D9488]/25 disabled:opacity-40"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {running ? "Re-run" : "Run"}
          </button>
        </div>
      </div>

      {runSnap?.urls && runSnap.urls.length > 0 && (
        <div className="flex-none px-4 py-2 border-b border-slate-700 bg-slate-900 flex items-center gap-2">
          <span className="text-[9.5px] uppercase tracking-wider text-slate-400">Local URLs</span>
          {runSnap.urls.map((u) => (
            <a
              key={u}
              href={u}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-mono text-teal-400 hover:underline"
            >
              {u}
            </a>
          ))}
          {!running && <span className="text-[9.5px] text-slate-500">(server finished)</span>}
        </div>
      )}

      {failed && !fixBusy && (
        <div className="flex-none mx-4 mt-2 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={13} className="text-red-600 flex-none" />
          <span className="text-[11px] text-red-600 flex-1">The process failed (exit {runSnap?.exit_code}). Ask the agent to inspect the edited files and fix it.</span>
          <button
            onClick={onFix}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[11px] font-medium bg-[#0D9488] hover:bg-[#0F766E] text-[var(--color-text-primary)]"
          >
            <Wand2 size={12} /> Fix with AI
          </button>
        </div>
      )}
      {fixBusy && (
        <div className="flex-none mx-4 mt-2 rounded-[6px] border border-[#0D9488]/30 bg-[#0D9488]/10 px-3 py-2 flex items-center gap-2">
          <Loader2 size={13} className="animate-spin text-[#0F766E]" />
          <span className="text-[11px] text-slate-900">Agent is inspecting the current files and error, applying a fix and re-running…</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-slate-900">
        {runLogs.length === 0 && !runSnap && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-[11.5px] text-slate-400">
              <Play size={20} className="mx-auto mb-2" />
              Press <span className="text-[#0F766E]">Run</span> to start the project and stream its output here.
            </div>
          </div>
        )}
        {runLogs.length === 0 && runSnap && (
          <p className="p-3 text-[11px] font-mono text-slate-300">Starting…</p>
        )}
        <div className="p-3 space-y-0.5">
          {runLogs.map((l, i) => (
            <div key={i} className="flex items-start gap-2 font-mono">
              <span className="text-[9px] text-slate-500 flex-none select-none">
                {l.at ? new Date(l.at).toLocaleTimeString([], { hour12: false }) : ""}
              </span>
              {l.type === "stdout" || l.type === "stdin" ? (
                <span
                  className={`text-[11px] whitespace-pre-wrap break-words flex-1 ${
                    l.type === "stdin" ? "text-[#38bdf8]" : "text-slate-300"
                  }`}
                >
                  {l.line}
                </span>
              ) : (
                <span className={`text-[10.5px] flex-1 ${failed ? "text-amber-500" : "text-teal-400"}`}>
                  {l.message}
                </span>
              )}
            </div>
          ))}
          <div ref={runConsoleRef} />
        </div>
      </div>

      <div className="flex-none px-3 py-2 border-t border-slate-700 bg-slate-900 flex items-center gap-2">
        <button
          onClick={onToggleInput}
          title="Send input to the running program"
          className="flex-none flex items-center gap-1.5 h-7 px-2 rounded-[6px] text-[10.5px] text-slate-300 border border-slate-700 hover:bg-slate-800"
        >
          <CornerDownLeft size={11} /> Input
        </button>
        {inputOpen ? (
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSendInput(); }}
              placeholder="Type program input and press Enter (e.g. a number/name)…"
              className="flex-1 h-7 px-2 rounded-[6px] bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200 outline-none focus:border-slate-500 placeholder:text-slate-500"
            />
            <button
              onClick={onSendInput}
              className="flex-none flex items-center justify-center h-7 w-7 rounded-[6px] bg-[#0D9488] hover:bg-[#0D9488] text-[var(--color-text-primary)] disabled:opacity-40"
              disabled={!inputValue.trim()}
            >
              <Send size={11} />
            </button>
          </div>
        ) : (
          <span className="text-[9.5px] text-slate-400">Single-file scripts: the output shows here, and you can send input above.</span>
        )}
      </div>
    </div>
  );
}

function FolderBrowserModal({
  title, initialPath, onSelect, onClose,
}: {
  title: string;
  initialPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [dir, setDir] = useState<string>(initialPath || "");
  const [data, setData] = useState<FolderBrowse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    codingApi.folders.browse(dir || undefined)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e?.message || "Could not read folder"); setLoading(false); });
  }, [dir]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="w-[560px] max-h-[72vh] rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-none px-4 py-3 border-b border-[#E2E8F0] flex items-center gap-2">
          <FolderSearch size={14} className="text-[#0F766E]" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-slate-900">{title}</p>
            <p className="text-[9.5px] font-mono text-slate-900 truncate">{data?.path || dir || "home"}</p>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-secondary)] hover:text-teal-700"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {loading && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)] px-2 py-3">
              <Loader2 size={12} className="animate-spin" /> Reading folder…
            </div>
          )}
          {error && <p className="text-[11px] text-red-600 px-2 py-3">{error}</p>}
          {!loading && !error && (
            <ul className="space-y-0.5">
              {data?.parent && (
                <li>
                  <button
                    onClick={() => setDir(data.parent!)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[5px] text-[11px] text-[var(--color-text-secondary)] hover:bg-slate-100"
                  >
                    <ArrowLeft size={12} className="flex-none" /> .. (parent)
                  </button>
                </li>
              )}
              {(data?.entries || []).map((ent) => (
                <li key={ent.path}>
                  <button
                    onClick={() => ent.is_dir && setDir(ent.path)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-[5px] text-[11px] text-left ${
                      ent.is_dir ? "text-[var(--color-text-secondary)] hover:bg-slate-100" : "text-[var(--color-text-secondary)] cursor-default"
                    }`}
                  >
                    {ent.is_dir
                      ? <FolderOpen size={12} className="text-[#0F766E] flex-none" />
                      : <FileCode2 size={12} className="text-slate-900 flex-none" />}
                    <span className="truncate flex-1">{ent.name}</span>
                    {!ent.is_dir && ent.size > 0 && <span className="text-[9px] text-slate-900 flex-none">{ent.size} B</span>}
                    {ent.is_dir && <ChevronRight size={11} className="flex-none text-slate-900" />}
                  </button>
                </li>
              ))}
              {(data?.entries || []).length === 0 && <p className="text-[11px] text-slate-900 px-2 py-3">(empty folder)</p>}
            </ul>
          )}
        </div>

        <div className="flex-none px-4 py-3 border-t border-[#E2E8F0] flex items-center gap-2">
          <span className="flex-1 text-[10px] text-slate-900 truncate">Selected: {data?.path || ""}</span>
          <button
            onClick={onClose}
            className="h-7 px-3 rounded-[6px] text-[11px] text-[var(--color-text-secondary)] hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            disabled={!data || loading}
            onClick={() => data && onSelect(data.path)}
            className="h-7 px-3 rounded-[6px] bg-[#0D9488] hover:bg-[#0F766E] text-[var(--color-text-primary)] text-[11px] font-medium disabled:opacity-40"
          >
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
}