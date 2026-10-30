import { useState, useRef, useEffect } from "react"
import { useNav } from "../context/NavContext"
import { P102, vibDE, vibNDE, tempDE, discharge, flow } from "../data/demoCore"

type FileNode = { name: string type: string content: string }

type Repo = {
  name: string
  tag: string
  files: FileNode[]
}

type LiveSession = {
  id: string
  name: string
  detail: string
  repo: number
}

const extType = (name: string): string => {
  const ext = (name.split(".").pop() || "").toLowerCase()
  if (["py", "js", "ts", "tsx", "sh", "c", "cpp", "go", "rs"].includes(ext))
    return "python"
  if (["json", "yaml", "yml", "toml"].includes(ext)) return "json"
  return "data"
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"]

const analysisPy = `import pandas as pd
import numpy as np

def analyze_vibration_data(sensor_file: str) -> dict:
    \"\"\"Analyze P-102 pump vibration readings against SOP thresholds.\"\"\"
    df = pd.read_csv(sensor_file)

    # P-102 SOP threshold: 7.1 mm/s (Inspection SOP v3.2)
    SOP_THRESHOLD = 7.1

    results = {
        "max_vibration": df["vibration_mms"].max(),
        "mean_vibration": df["vibration_mms"].mean(),
        "threshold_exceeded": df["vibration_mms"].max() > SOP_THRESHOLD,
        "exceedance_pct": round(
            (df["vibration_mms"].max() - SOP_THRESHOLD) / SOP_THRESHOLD * 100, 2
        ),
        "exceed_months": df.loc[df["vibration_mms"] > SOP_THRESHOLD, "month"].tolist(),
    }
    return results

if __name__ == "__main__":
    r = analyze_vibration_data("pressure_data.csv")
    print(f"Max vibration: {r['max_vibration']} mm/s")
    print(f"Threshold exceeded: {r['threshold_exceeded']} ({r['exceedance_pct']}%)")
    print(f"Exceed months: {r['exceed_months']}")`

const vibrationPy = `"""Trend + anomaly screening for the P-102 feed transfer pump (CDU-4)."""
from analysis import analyze_vibration_data
import pandas as pd

DATA = "pressure_data.csv"

def run_trend_check():
    r = analyze_vibration_data(DATA)
    latest = vib_last_reading()
    print("=== P-102 Vibration Trend (Jan-Aug 2026) ===")
    print(f"Latest DE bearing: {latest} mm/s  (SOP limit {7.1})")
    status = "THRESHOLD EXCEEDED" if latest > 7.1 else "OK"
    print(f"Status -> {status}")
    return r

def vib_last_reading():
    df = pd.read_csv(DATA)
    return df["vibration_mms"].iloc[-1]

if __name__ == "__main__":
    run_trend_check()`

const pressureCsv = `# P-102 Demo dataset (simulated) - inspection measurements 2026
month,de_bearing_mms,nde_bearing_mms,temp_degc,discharge_kgcm2,flow_m3h
${months.map((m, i) => `${m},${vibDE[i]},${vibNDE[i]},${tempDE[i]},${discharge[i]},${flow[i]}`).join("\n")}`

const anomalyPy = `import pandas as pd
import numpy as np

def detect_anomalies(df: pd.DataFrame, limits: dict) -> list:
    \"\"\"z-score + limit screening on P-102 telemetry (demo).\"\"\"
    anomalies = []
    for col, limit in limits.items():
        z = (df[col] - df[col].mean()) / (df[col].std() + 1e-9)
        last = df[col].iloc[-1]
        if last > limit:
            anomalies.append({
                "sensor": col, "value": round(float(last), 2),
                "limit": limit, "z": round(float(z.iloc[-1]), 2)
            })
    return anomalies

if __name__ == "__main__":
    df = pd.read_csv("pressure_data.csv")
    limits = {"de_bearing_mms": 7.1, "temp_degc": 82, "discharge_kgcm2": 8.0}
    for a in detect_anomalies(df, limits):
        print(f"ANOMALY {a['sensor']}: {a['value']} vs limit {a['limit']} (z={a['z']})")`

const reportPy = `"""Build the engineering action memo sections from inspection findings."""
from analysis import analyze_vibration_data

def compose_memo():
    r = analyze_vibration_data("pressure_data.csv")
    return f\"\"\"
Engineering Action Memo - P-102 Feed Transfer Pump
DE vibration: {r['max_vibration']} mm/s vs 7.1 mm/s limit
Status: DEVIATION - raise corrective work order
\"\"\"

if __name__ == "__main__":
    print(compose_memo())`

const requirementsTxt = `pandas==2.2.2
numpy==1.26.4
matplotlib==3.9.0
pytest==8.2.1`

const testAnalysisPy = `from analysis import analyze_vibration_data
import pandas as pd

def test_vibration_threshold():
    r = analyze_vibration_data("pressure_data.csv")
    assert r["threshold_exceeded"] is True

def test_exceedance_calculation():
    r = analyze_vibration_data("pressure_data.csv")
    assert round(r["exceedance_pct"], 1) == 15.5

def test_edge_cases():
    df = pd.DataFrame({"vibration_mms": [5.0, 6.0], "month": ["Jan", "Feb"]})
    df.to_csv("/tmp/edge.csv", index=False)
    r = analyze_vibration_data("/tmp/edge.csv")
    assert r["threshold_exceeded"] is False`

const telemetryPy = `import pandas as pd
from analysis import analyze_vibration_data

def ingest(file: str):
    raw = pd.read_csv(file)
    enriched = raw.copy()
    enriched["efficiency_pct"] = (enriched["flow_m3h"] / 320) * 100
    return enriched

if __name__ == "__main__":
    df = ingest("pressure_data.csv")
    print(df.tail(3).to_string(index=False))`

const dashboardPy = `"""P-102 monitoring dashboard data prep (demo)."""
import pandas as pd

def prepare_tiles():
    df = pd.read_csv("pressure_data.csv")
    latest = df.iloc[-1]
    tiles = {
        "Vibration (DE)": f"{latest['de_bearing_mms']} mm/s",
        "Temperature": f"{latest['temp_degc']} C",
        "Discharge": f"{latest['discharge_kgcm2']} kg/cm2",
        "Flow": f"{latest['flow_m3h']} m3/h",
    }
    return tiles

if __name__ == "__main__":
    for k, v in prepare_tiles().items():
        print(f"{k}: {v}")`

const thresholdCfg = `{
  "asset": "P-102",
  "limits": {
    "de_bearing_mms": 7.1,
    "temp_degc": 82,
    "discharge_kgcm2": 8.0
  },
  "cadence_days": 7
}`

const inspectComparePy = `"""Compare Aug-2026 inspection vs Jul-2025 baseline (P-102, demo)."""
import pandas as pd

def compare(last_year_file: str, current_file: str):
    last = pd.read_csv(last_year_file).set_index("month")
    cur = pd.read_csv(current_file).set_index("month")
    de_last = last["de_bearing_mms"].iloc[-1]
    de_cur = cur["de_bearing_mms"].iloc[-1]
    return {
        "Jul-2025": de_last, "Aug-2026": de_cur,
        "delta": round(de_cur - de_last, 2), "limit": 7.1
    }

if __name__ == "__main__":
    print(compare("baseline_2025.csv", "pressure_data.csv"))`

const memoDocxScript = `"""Generate the memo DOCX bundle (demo template)."""
def build_docx_payload():
    return {
        "title": "Engineering Action Memo - P-102",
        "deviation": "DE vibration 8.2 mm/s vs 7.1 mm/s",
        "owners": ["Maintenance", "Inspection", "Operations"]
    }

if __name__ == "__main__":
    print(build_docx_payload())`

const exportPdfPy = `"""Export analysis drift as PDF/CSV for records (demo)."""
def export(kind: str = "csv"):
    rows = "month,de_bearing_mms\\n"
    for m, v in zip(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"], [5.9,6.1,6.4,6.7,7.0,7.3,7.8,8.2]):
        rows += f"{m},{v}\\n"
    return f"P-102_{kind}.export" if kind == "csv" else "P-102_report.pdf"

if __name__ == "__main__":
    print(export("csv"))`

const repos: Repo[] = [
  {
    name: "P-102 Analysis",
    tag: "P-102 · CDU-4",
    files: [
      { name: "analysis.py", type: "python", content: analysisPy },
      { name: "vibration_analysis.py", type: "python", content: vibrationPy },
      { name: "pressure_data.csv", type: "data", content: pressureCsv },
      { name: "anomaly_detection.py", type: "python", content: anomalyPy },
      { name: "report_generator.py", type: "python", content: reportPy },
      { name: "requirements.txt", type: "text", content: requirementsTxt },
      {
        name: "tests/test_analysis.py",
        type: "python",
        content: testAnalysisPy,
      },
    ],
  },
  {
    name: "Pump Monitoring",
    tag: "Monitoring · Telemetry",
    files: [
      { name: "telemetry_ingest.py", type: "python", content: telemetryPy },
      { name: "dashboard.py", type: "python", content: dashboardPy },
      { name: "threshold_config.json", type: "json", content: thresholdCfg },
      {
        name: "tests/test_ingest.py",
        type: "python",
        content: `from telemetry_ingest import ingest\n\ndef test_ingest_shape():\n    df = ingest("pressure_data.csv")\n    assert "efficiency_pct" in df.columns\ndef test_demo_values():\n    df = ingest("pressure_data.csv")\n    assert df["de_bearing_mms"].iloc[-1] == 8.2`,
      },
    ],
  },
  {
    name: "Inspection Analytics",
    tag: "Inspection · 2026",
    files: [
      {
        name: "inspection_compare.py",
        type: "python",
        content: inspectComparePy,
      },
      {
        name: "baseline_2025.csv",
        type: "data",
        content:
          "month,de_bearing_mms\nJan,5.0\nFeb,5.2\nMar,5.4\nApr,5.7\nMay,6.0\nJun,6.3\nJul,7.4\nAug,7.2",
      },
      { name: "memo_builder.py", type: "python", content: memoDocxScript },
      { name: "export_report.py", type: "python", content: exportPdfPy },
    ],
  },
]

const sessions = [
  {
    id: "s1",
    name: "P-102 trend fit",
    detail: "Gaussian process · 8 points",
    repo: 0,
  },
  {
    id: "s2",
    name: "P-102 anomaly classifier",
    detail: "z-score + limits · tests 12",
    repo: 0,
  },
  {
    id: "s3",
    name: "CDU-4 tube skin model",
    detail: "furnace zone-3 · 486 °C",
    repo: 2,
  },
  {
    id: "s4",
    name: "Reformer yield sensitivity",
    detail: "12-case matrix",
    repo: 1,
  },
]

const executionTimeline = [
  { step: "Analyze", status: "done" },
  { step: "Read", status: "done" },
  { step: "Modify", status: "done" },
  { step: "Sandbox", status: "done" },
  { step: "Test", status: "done" },
  { step: "Detect Error", status: "done" },
  { step: "AI Fix", status: "done" },
  { step: "Retest", status: "done" },
  { step: "Verify", status: "running" },
  { step: "Checkpoint", status: "pending" },
]

export default function CodingWorkspace() {
  const { navigate } = useNav()
  const [repoIdx, setRepoIdx] = useState(0)
  const [sessionIdx, setSessionIdx] = useState(0)
  const reposView = liveRepo ? [liveRepo] : repos
  const allSessions = liveSessions.length ? liveSessions : sessions
  const repo = reposView[repoIdx] || repos[0]
  const [activeFile, setActiveFile] = useState(repo.files[0].name)
  const [terminalTab, setTerminalTab] = useState("Terminal")
  const [chatInput, setChatInput] = useState("")
  const [messages, setMessages] = useState([
    {
      role: "ai",
      text:
        "Coding Agent initialized. Repository `" +
        repos[0].name +
        "` context loaded (P-102 demo dataset). I can analyze code, generate tests, fix errors, and run the sandbox.",
    },
  ])
  const [isRunning, setIsRunning] = useState(false)
  const [termLines, setTermLines] = useState<string[]>([])
  const [testStats, setTestStats] = useState("")

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([])
  const [liveRepo, setLiveRepo] = useState<Repo | null>(null)
  const [liveMode, setLiveMode] = useState(false)
  const [liveTermLines, setLiveTermLines] = useState<string[]>([])
  const [liveTestStats, setLiveTestStats] = useState("")
  const [liveStatus, setLiveStatus] = useState("")
  const [liveTaskId, setLiveTaskId] = useState("")
  const [liveLoaded, setLiveLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/coding/sessions")
        if (!res.ok) return
        const body = await res.json()
        if (cancelled) return
        const sessions = (body.sessions || []).map((s: any) => ({
          id: s.session_id,
          name: s.title || s.project_name || "Coding session",
          detail: s.mode || "agent",
          repo: 0,
        }))
        setLiveSessions(sessions)
        if (sessions.length === 0) return
        let activeId = ""
        try {
          activeId = localStorage.getItem("ca_active_session") || ""
        } catch {
          /* non-browser env */
        }
        const initial =
          sessions.find((s: LiveSession) => s.id === activeId)?.id ||
          sessions[0].id
        await loadLiveSession(initial)
      } catch {
        /* service offline -> demo fallback */
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadLiveSession = async (sessionId: string) => {
    try {
      const svc = await fetch(
        `/api/coding/sessions/${encodeURIComponent(sessionId)}`,
      )
      if (!svc.ok) return false
      const data = await svc.json()
      const tasks = data.tasks || []
      if (tasks.length === 0) return false
      const task = tasks[tasks.length - 1]
      setLiveTaskId(task.task_id || "")
      setLiveStatus(task.status || "completed")
      const tree = await fetch(
        `/api/coding/tasks/${encodeURIComponent(task.task_id)}/tree`,
      )
      if (!tree.ok) return false
      const treeBody = await tree.json()
      const paths: string[] = treeBody.files || []
      const cap = paths.slice(0, 60)
      const files: FileNode[] = []
      for (const path of cap) {
        try {
          const fr = await fetch(
            `/api/coding/tasks/${encodeURIComponent(task.task_id)}/file?path=${encodeURIComponent(path)}`,
          )
          if (!fr.ok) continue
          const fbody = await fr.json()
          files.push({
            name: path,
            type: extType(path),
            content: String(fbody.content || ""),
          })
        } catch {
          /* skip unreadable file */
        }
      }
      let tests = ""
      try {
        const tr = await fetch(
          `/api/coding/tasks/${encodeURIComponent(task.task_id)}/tests`,
        )
        if (tr.ok) {
          const tb = await tr.json()
          const results = tb.results || []
          const passed = results.filter((r: any) => r.passed).length
          tests = results.length
            ? `${passed}/${results.length} tests passed${
                results[0]?.command ? `\n\n$ ${results[0].command}` : ""
              }`
            : "No test results recorded."
        }
      } catch {
        /* ignore */
      }
      let execLines: string[] = []
      try {
        const er = await fetch(
          `/api/coding/tasks/${encodeURIComponent(task.task_id)}/executions`,
        )
        if (er.ok) {
          const eb = await er.json()
          execLines = (eb.executions || []).flatMap((x: any) => {
            const out = x.stdout || ""
            return [
              `$ ${x.command}`,
              ...String(out).trim().split("\n").slice(0, 40),
            ].filter(Boolean)
          })
        }
      } catch {
        /* ignore */
      }
      if (!execLines.length && (task.result_summary || task.error_message)) {
        execLines = [
          `$ status`,
          task.result_summary
            ? `✓ ${task.result_summary}`
            : "✗ " + (task.error_message || ""),
        ]
      }
      setLiveRepo({
        name: task.title || "OCR project",
        tag: task.status || "completed",
        files,
      })
      setLiveTermLines(execLines)
      setLiveTestStats(tests)
      setLiveMode(true)
      setLiveLoaded(true)
      window.setTimeout(() => {
        setActiveFile(files[0]?.name || "readme.md")
      }, 50)
      setTerminalTab("Terminal")
      return true
    } catch {
      return false
    }
  }

  useEffect(() => {
    setActiveFile(repo.files[0].name)
    setTermLines([])
    setTestStats("")
  }, [repoIdx])

  const runPipeline = () => {
    if (isRunning) return
    if (liveMode) {
      setTerminalTab("Terminal")
      setTermLines(
        liveTermLines.length ? liveTermLines : ["$ no recorded run output"],
      )
      setTestStats(liveTestStats || "No test results for this session.")
      return
    }
    setIsRunning(true)
    setTerminalTab("Terminal")
    setTermLines([
      "$ python vibration_analysis.py --asset P-102",
      "DEMO DATA — SIMULATED VALUES",
    ])
    setTestStats("")

    const out = [
      "Loading 8 monthly readings (Jan–Aug 2026):",
      `  DE bearing max = ${vibDE.slice(-1)[0]} mm/s (SOP limit ${P102.vibrationThreshold} mm/s)`,
      "  -> THRESHOLD EXCEEDED (+" +
        ((vibDE.slice(-1)[0] / P102.vibrationThreshold) * 100 - 100).toFixed(
          1,
        ) +
        "%)",
      `  NDE bearing max = ${vibNDE.slice(-1)[0]} mm/s -> OK`,
      `  DE temperature = ${tempDE.slice(-1)[0]} C (alarm ${P102.tempAlarm} C) -> WATCH`,
      `  Discharge = ${discharge.slice(-1)[0]} kg/cm2 (min ${P102.dischargeMin}) -> BELOW`,
      `  Flow = ${flow.slice(-1)[0]} m3/h (design ${P102.flowDesign}) -> LOW`,
      "Anomalies detected: 2 (DE vibration, discharge pressure)",
      "",
      "$ python -m pytest tests/ -v",
      "collected 12 items",
      "tests/test_analysis.py::test_vibration_threshold PASSED    [ 8%]",
      "tests/test_analysis.py::test_exceedance_calculation PASSED [16%]",
      "tests/test_analysis.py::test_edge_cases PASSED             [25%]",
      "tests/test_utils.py::test_data_loading PASSED              [33%]",
      "tests/test_utils.py::test_normalization PASSED             [41%]",
      "tests/test_utils.py::test_export_formats PASSED            [50%]",
      "...",
      "============================== 12 passed in 1.34s ==============================",
    ]

    let step = 0
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      if (step < out.length) {
        setTermLines((prev) => [...prev, out[step]])
        step++
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setIsRunning(false)
        setTestStats(
          "All 12 tests passed ✓\n\nDE vibration 8.2 mm/s flagged as threshold-exceeded.\nDischarge 7.9 kg/cm2 below 8.0 minimum.\nAction: raise corrective work order.",
        )
      }
    }, 320)
  }

  const send = () => {
    if (!chatInput.trim() || isRunning) return
    const text = chatInput.trim()
    setMessages((prev) => [...prev, { role: "user", text }])
    setChatInput("")
    setIsRunning(true)

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "Analyzing repository structure...\n\n✓ 3 Python files + 1 CSV dataset\n⚠ DE bearing vibration passed the 7.1 mm/s SOP limit in June (7.3) and sits at 8.2 mm/s in Aug.\n⚠ Discharge pressure dropped below the 8.0 kg/cm² minimum in Aug.\n\nFix applied in analysis.py and tests re-run — all 12 passing (see terminal).",
        },
      ])
      runPipeline()
    }, 1600)
  }

  const activeContent =
    repo.files.find((f) => f.name === activeFile)?.content ?? ""

  return (
    <div className="flex flex-col h-full" style={{ background: "#0F172A" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0"
        style={{ background: "#1E293B", borderColor: "#334155" }}
      >
        <span className="text-sm font-semibold" style={{ color: "#F1F5F9" }}>
          Coding Workspace
        </span>
        <select
          value={repoIdx}
          onChange={(e) => setRepoIdx(Number(e.target.value))}
          className="text-xs px-2 py-1 rounded font-medium bg-white text-slate-800 border border-slate-500 outline-none cursor-pointer"
          title="Select demo repository"
        >
          {reposView.map((r, i) => (
            <option key={r.name} value={i}>
              {r.name}
            </option>
          ))}
        </select>
        <span
          className="text-xs px-2 py-0.5 rounded font-medium"
          style={{ background: "#0F766E", color: "white", fontSize: 10 }}
        >
          {repo.tag}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => navigate("sandbox")}
            className="text-xs px-3 py-1.5 rounded font-medium transition-colors hover:bg-slate-700"
            style={{ background: "#1E3A5F", color: "#93C5FD", fontSize: 11 }}
          >
            Open Sandbox
          </button>
          <button
            onClick={runPipeline}
            disabled={isRunning}
            className="text-xs px-3 py-1.5 rounded font-medium transition-colors hover:bg-emerald-800 disabled:opacity-50"
            style={{ background: "#064E3B", color: "#6EE7B7", fontSize: 11 }}
          >
            {isRunning ? "Running..." : "▶ Run Pipeline"}
          </button>
        </div>
      </div>

      {/* Sessions / history */}
      <div
        className="flex items-center gap-2 px-4 py-2 overflow-x-auto flex-shrink-0"
        style={{ background: "#1E293B", borderBottom: "1px solid #334155" }}
      >
        <span
          className="text-[10px] font-bold flex-shrink-0"
          style={{
            color: "#64748B",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Sessions
        </span>
        {allSessions.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setSessionIdx(allSessions.indexOf(s))
              if (liveMode) {
                loadLiveSession(s.id)
                setTerminalTab("Terminal")
              } else {
                setRepoIdx(s.repo)
                runPipeline()
              }
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs flex-shrink-0 transition-colors"
            style={{
              background: sessionIdx === i ? "#0F766E" : "transparent",
              color: sessionIdx === i ? "white" : "#94A3B8",
              border: "1px solid " + (sessionIdx === i ? "#0F766E" : "#334155"),
              fontSize: 11,
            }}
          >
            <span style={{ fontSize: 9 }}>
              {allSessions[sessionIdx]?.id === s.id ? "◉" : "○"}
            </span>
            <span className="font-medium">{s.name}</span>
            <span
              className="text-[10px]"
              style={{
                color:
                  allSessions[sessionIdx]?.id === s.id ? "#A7F3D0" : "#64748B",
              }}
            >
              {s.detail}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {liveMode ? (
            <a
              className="text-xs px-2 py-1 rounded"
              style={{
                background:
                  liveLoaded && liveStatus !== "failed" ? "#0F172A" : "#1E3A5F",
                color: liveStatus !== "failed" ? "#34D399" : "#F87171",
                border:
                  liveStatus !== "failed"
                    ? "1px solid #1F3B2F"
                    : "1px solid #4C1D1D",
                fontSize: 11,
              }}
            >
              {liveLoaded ? `✓ ${liveStatus}` : "agent reviewing…"}
            </a>
          ) : sessionIdx === 0 ? (
            <a
              className="text-xs px-2 py-1 rounded"
              style={{
                background: "#0F172A",
                color: "#34D399",
                border: "1px solid #1F3B2F",
                fontSize: 11,
              }}
            >
              ✓ P-102 analysis checkpoint
            </a>
          ) : (
            <a
              className="text-xs px-2 py-1 rounded"
              style={{
                background: "#1E3A5F",
                color: "#93C5FD",
                border: "1px solid #1E3A5F",
                fontSize: 11,
              }}
            >
              agent reviewing…
            </a>
          )}
          <span
            className="text-[10px] font-mono"
            style={{ color: "#64748B", fontSize: 10 }}
          >
            {liveMode
              ? liveTaskId
                ? `task ${liveTaskId}`
                : "live"
              : "main · 4a19f2c"}
          </span>
        </div>
      </div>

      {/* Execution Timeline */}
      <div
        className="flex items-center gap-2 px-4 py-2 overflow-x-auto flex-shrink-0"
        style={{ background: "#1E293B", borderBottom: "1px solid #334155" }}
      >
        {executionTimeline.map((step, i) => (
          <div
            key={step.step}
            className="flex items-center gap-1.5 flex-shrink-0"
          >
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
              style={{
                background:
                  step.status === "done"
                    ? "#064E3B"
                    : step.status === "running"
                      ? "#1E3A5F"
                      : "#1E293B",
                color:
                  step.status === "done"
                    ? "#6EE7B7"
                    : step.status === "running"
                      ? "#93C5FD"
                      : "#475569",
                border:
                  step.status === "running"
                    ? "1px solid #3B82F6"
                    : "1px solid transparent",
                fontSize: 11,
              }}
            >
              {step.status === "done"
                ? "✓"
                : step.status === "running"
                  ? "◌"
                  : "·"}{" "}
              {step.step}
            </div>
            {i < executionTimeline.length - 1 && (
              <span style={{ color: "#334155" }}>→</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer */}
        <div
          className="w-52 border-r flex flex-col flex-shrink-0 overflow-y-auto"
          style={{ background: "#1E293B", borderColor: "#334155" }}
        >
          <div
            className="px-3 py-2 text-xs font-semibold sticky top-0"
            style={{
              color: "#64748B",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: "#1E293B",
            }}
          >
            Explorer — {repo.name}
          </div>
          {repo.files.map((f) => (
            <button
              key={f.name}
              onClick={() => setActiveFile(f.name)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700/60 transition-colors"
              style={{
                color: activeFile === f.name ? "#6EE7B7" : "#CBD5E1",
                background: activeFile === f.name ? "#0F2937" : "transparent",
                fontSize: 12,
              }}
            >
              {f.type === "python"
                ? "🐍 "
                : f.type === "data"
                  ? "📊 "
                  : f.type === "json"
                    ? "{} "
                    : "· "}
              {f.name.split("/").pop()}
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="flex items-center border-b flex-shrink-0"
            style={{ background: "#1E293B", borderColor: "#334155" }}
          >
            <button
              className="px-4 py-2 text-xs"
              style={{
                background: "#0F172A",
                color: "#F1F5F9",
                borderTop: "1px solid #0F766E",
                borderRight: "1px solid #334155",
              }}
            >
              {activeFile.split("/").pop()}
            </button>
            <span
              className="px-3 py-1.5 text-[10px] text-slate-800"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {activeFile}
            </span>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <pre
              className="text-xs leading-6"
              style={{
                color: "#E2E8F0",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                whiteSpace: "pre",
              }}
            >
              <code>{activeContent}</code>
            </pre>
          </div>

          {/* Terminal */}
          <div
            className="border-t flex-shrink-0"
            style={{ borderColor: "#334155", height: 190 }}
          >
            <div
              className="flex border-b"
              style={{ background: "#1E293B", borderColor: "#334155" }}
            >
              {(["Terminal", "Tests", "Problems"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTerminalTab(t)}
                  className="px-4 py-2 text-xs"
                  style={{
                    color: terminalTab === t ? "#F1F5F9" : "#64748B",
                    borderBottom:
                      terminalTab === t
                        ? "1px solid #0F766E"
                        : "1px solid transparent",
                  }}
                >
                  {t === "Tests" ? "✓ Tests (12/12)" : t}
                </button>
              ))}
            </div>
            <div className="p-3 overflow-y-auto h-full flex flex-col gap-1">
              {terminalTab === "Terminal" ? (
                termLines.length === 0 ? (
                  <div
                    style={{
                      color: "#64748B",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                    }}
                  >
                    Ready. Spin up the demo pipeline to analyze {"P-102"} data.
                  </div>
                ) : (
                  termLines.map((line, i) => (
                    <div
                      key={i}
                      style={{
                        color: line.includes("PASSED")
                          ? "#86EFAC"
                          : line.includes("EXCEEDED") ||
                              line.includes("ANOMALY")
                            ? "#F87171"
                            : line.includes("WATCH") || line.includes("BELOW")
                              ? "#FBBF24"
                              : line.includes("DEMO")
                                ? "#A78BFA"
                                : "#22D3EE",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                      }}
                    >
                      {line}
                    </div>
                  ))
                )
              ) : terminalTab === "Tests" ? (
                <pre
                  className="text-xs"
                  style={{
                    color: "#86EFAC",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    lineHeight: 1.6,
                  }}
                >
                  {testStats || "Run the pipeline to execute the test suite."}
                </pre>
              ) : (
                <pre
                  className="text-xs"
                  style={{
                    color: "#FBBF24",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    lineHeight: 1.6,
                  }}
                >
                  {`analysis.py:31 warning  P102 threshold constant duplicated in vibration_analysis.py
pressure_data.csv:10 info     Reading marked above SOP limit (8.2 mm/s > 7.1 mm/s)
No blocking errors.`}
                </pre>
              )}
              {isRunning && (
                <div className="flex items-center mt-1">
                  <span
                    className="text-xs"
                    style={{ color: "#22D3EE", fontFamily: "var(--font-mono)" }}
                  >
                    ▮
                  </span>
                  <span
                    className="w-1.5 h-3 ml-0.5 animate-pulse"
                    style={{ background: "#22D3EE" }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Coding Agent Chat */}
        <div
          className="w-72 border-l flex flex-col flex-shrink-0"
          style={{ background: "#1E293B", borderColor: "#334155" }}
        >
          <div
            className="px-4 py-2.5 border-b flex items-center gap-2"
            style={{ borderColor: "#334155" }}
          >
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-xs font-semibold"
              style={{ background: "#0F766E", color: "white", fontSize: 9 }}
            >
              CA
            </div>
            <span className="text-xs font-medium" style={{ color: "#F1F5F9" }}>
              Coding Agent
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-bold ml-1"
              style={{
                background: "#0F172A",
                color: "#34D399",
                border: "1px solid #1F3B2F",
              }}
            >
              {liveMode
                ? `${repo.name.toUpperCase()} CONTEXT`
                : "P-102 CONTEXT"}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className="rounded px-3 py-2 text-xs max-w-full"
                  style={{
                    background: msg.role === "user" ? "#0F766E" : "#0F172A",
                    color: msg.role === "user" ? "white" : "#CBD5E1",
                    whiteSpace: "pre-wrap",
                    fontSize: 11,
                    border: msg.role === "ai" ? "1px solid #334155" : "none",
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t" style={{ borderColor: "#334155" }}>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send()
                }}
                placeholder="Ask the coding agent..."
                className="flex-1 px-3 py-2 rounded text-xs outline-none"
                style={{
                  background: "#0F172A",
                  border: "1px solid #334155",
                  color: "#F1F5F9",
                  fontSize: 11,
                }}
              />
              <button
                onClick={send}
                disabled={isRunning}
                className="px-3 py-2 rounded text-xs font-medium disabled:opacity-40"
                style={{ background: "#0F766E", color: "white" }}
              >
                →
              </button>
            </div>
            <p className="text-[9px] mt-2" style={{ color: "#475569" }}>
              {liveMode
                ? "Live project from the Coding Agent service — no demo data."
                : "Demo dataset — simulated values, not actual plant data."}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
