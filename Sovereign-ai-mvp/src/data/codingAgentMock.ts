// Coding Agent — frontend-only mock of the isolated backend API client.
// Mirrors the exact surface + types of the real `codingApi` service, but is
// driven entirely by seeded metadata and a simulated agent on a timer so the
// demo works with no server. No real network calls are made.

// ── Types (mirror of CodingAgentScreen's API contract) ─────────────────────

export interface CodingTaskSummary {
  task_id: string;
  title: string;
  task_type: "GENERATED_CODE" | "NEW_PROJECT" | "EXISTING_PROJECT";
  status: "PENDING" | "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
  verdict: "IMPLEMENTED" | "TESTED" | "FAILED" | "PARTIALLY_COMPLETED" | "REQUIRES_USER_ACTION" | null;
  engine: string;
  created_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  result_summary: string | null;
}

export interface CodingEvent {
  kind: string;
  task_id: string;
  at: string;
  [key: string]: any;
}

export interface CodingPermissionRequest {
  request_id: string;
  kind: string;
  detail: string;
  command: string | null;
  path: string | null;
  decision: string | null;
  created_at: string | null;
}

export interface CodingExecution {
  execution_id: string;
  command: string | null;
  label: string | null;
  status: string | null;
  return_code: number | null;
  duration_ms: number | null;
  stdout?: string | null;
  stderr?: string | null;
}

export interface CodingTestResult {
  command: string;
  passed: boolean;
  stdout: string;
  return_code: number | null;
  attempt: number;
}

export interface CodingFileChange {
  path: string;
  change_type: string;
  diff: string | null;
}

export interface CodingTaskDetail extends CodingTaskSummary {
  request: string;
  authorized_root: string | null;
  repair_attempts: number;
  events: CodingEvent[];
  messages: string[];
  permission_requests: CodingPermissionRequest[];
  executions: CodingExecution[];
  file_changes: CodingFileChange[];
  test_results: CodingTestResult[];
}

export interface WorkspaceEntry {
  name: string;
  path: string;
}

export interface WorkspaceInspect {
  ok: boolean;
  workspace: { name: string; path: string };
  tree: string;
  files: { path: string; size: number }[];
  git: { branch: string | null; changes: string };
}

export interface CodingSession {
  session_id: string;
  title: string;
  mode: "generate" | "new_project" | "existing_project";
  project_name: string | null;
  folder_name: string | null;
  folder_path: string | null;
  storage_path: string | null;
  chat_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ChatLineDTO {
  role: "user" | "agent";
  text: string;
  when: string;
}

export interface CodingSessionDetail {
  session: CodingSession;
  chat: ChatLineDTO[];
  tasks: CodingTaskSummary[];
  task: CodingTaskDetail | null;
}

export interface FolderEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface FolderBrowse {
  path: string;
  name: string;
  parent: string | null;
  home: string;
  entries: FolderEntry[];
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  children?: TreeNode[];
}

export interface TaskTree {
  root: string;
  tree: TreeNode;
  files: { path: string; size: number }[];
  git: { branch: string | null; changes: string };
}

export interface RunDetect {
  ok: boolean;
  command: string;
  label: string;
  kind: string;
  urls: string[];
  root: string;
}

export interface RunLogEntry {
  at: string;
  type: string;
  message?: string;
  line?: string;
  exit?: number | null;
  urls?: string[];
  [key: string]: any;
}

export interface RunSnapshot {
  run_id: string;
  root: string;
  command: string;
  kind: string;
  label: string;
  urls: string[];
  status: string;
  is_running: boolean;
  started_at: string | null;
  stopped_at: string | null;
  exit_code: number | null;
  logs: RunLogEntry[];
}

export interface AiFixResult {
  ok: boolean;
  changes: CodingFileChange[];
  run: RunSnapshot | null;
  run_error?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let seq = 0;
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.floor(Math.random() * 1e4)
    .toString(36)}`;

const agoSec = (n: number) => new Date(Date.now() - n * 1000).toISOString();
const nowIso = () => new Date().toISOString();
const lineTime = () => new Date().toLocaleTimeString();

function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return s || "workspace";
}

// ── Stream simulation (stands in for EventSource) ──────────────────────────

type StreamMsg = { data: string };

class MockES {
  onmessage: ((msg: StreamMsg) => void) | null = null;

  constructor(private readonly key: string) {
    let set = streamClients.get(key);
    if (!set) {
      set = new Set();
      streamClients.set(key, set);
    }
    set.add(this);
  }

  close() {
    const set = streamClients.get(this.key);
    if (set) set.delete(this);
  }
}

const streamClients = new Map<string, Set<MockES>>();

function publish(key: string, payload: unknown) {
  const set = streamClients.get(key);
  if (!set) return;
  const msg: StreamMsg = { data: JSON.stringify(payload) };
  [...set].forEach((c) => c.onmessage?.(msg));
}

// ── In-memory store ────────────────────────────────────────────────────────

interface MockFile {
  path: string;
  content: string;
  size: number;
}

interface MockTask extends CodingTaskDetail {
  files: MockFile[];
  runs: RunSnapshot[];
}

interface MockSession extends CodingSession {
  chat: ChatLineDTO[];
  taskId: string | null;
}

const sessions = new Map<string, MockSession>();
const tasks = new Map<string, MockTask>();

// ── Seed content (MRPL-flavored, consistent with the rest of the demo) ─────

const analysisPyContent = `import pandas as pd
import numpy as np

def analyze_vibration_data(sensor_file: str) -> dict:
    """Analyze P-102 pump vibration readings against SOP thresholds."""
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
    print(f"Exceed months: {r['exceed_months']}")
`;

const vibrationPyContent = `"""Trend + anomaly screening for the P-102 feed transfer pump (CDU-4)."""
from analysis import analyze_vibration_data
import pandas as pd

DATA = "pressure_data.csv"

def run_trend_check():
    r = analyze_vibration_data(DATA)
    latest = vib_last_reading()
    print("=== P-102 Vibration Trend (Jan-Aug 2026) ===")
    print(f"Latest DE bearing: {latest} mm/s  (SOP limit 7.1)")
    status = "THRESHOLD EXCEEDED" if latest > 7.1 else "OK"
    print(f"Status -> {status}")
    return r

def vib_last_reading():
    df = pd.read_csv(DATA)
    return df["vibration_mms"].iloc[-1]

if __name__ == "__main__":
    run_trend_check()
`;

const telemetryPyContent = `import pandas as pd
from analysis import analyze_vibration_data

def ingest(file: str):
    raw = pd.read_csv(file)
    enriched = raw.copy()
    enriched["efficiency_pct"] = (enriched["flow_m3h"] / 320) * 100
    return enriched

if __name__ == "__main__":
    df = ingest("pressure_data.csv")
    print(df.tail(3).to_string(index=False))
`;

const requirementsTxtContent = `pandas==2.2.2
numpy==1.26.4
matplotlib==3.9.0
pytest==8.2.1`;

const testAnalysisPyContent = `from analysis import analyze_vibration_data
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
    assert r["threshold_exceeded"] is False
`;

const pressureCsvContent = `# P-102 Demo dataset (simulated) - inspection measurements 2026
month,de_bearing_mms,nde_bearing_mms,temp_degc,discharge_kgcm2,flow_m3h
Jan,5.9,5.4,71,8.4,287
Feb,6.1,5.6,72,8.3,290
Mar,6.4,5.9,74,8.3,292
Apr,6.7,6.1,76,8.2,296
May,7.0,6.4,78,8.1,301
Jun,7.3,6.6,79,7.9,308
Jul,7.8,7.0,80,7.7,312
Aug,8.2,7.3,81,7.6,315`;

const decokePyContent = `def plan_decoke_windows(furnaces, turnaround_start, window_days=12):
    """Generate CDU-4 furnace decoke windows ahead of TA-2027."""
    windows = []
    for i, f in enumerate(furnaces):
        start = turnaround_start + i * 3
        windows.append({"furnace": f, "start_d": start, "window_days": window_days})
    return windows

if __name__ == "__main__":
    for w in plan_decoke_windows(["heater-101", "heater-102", "heater-401"], 0):
        print(w)
`;

const testSchedulerContent = `from decoke_scheduler import plan_decoke_windows

def test_returns_windows():
    w = plan_decoke_windows(["heater-101", "heater-102"], 0)
    assert len(w) == 2
    assert w[0]["window_days"] == 12

def test_non_overlapping():
    w = plan_decoke_windows(["heater-101", "heater-102", "heater-401"], 0)
    assert w[0]["start_d"] != w[1]["start_d"]
`;

const parseCasesBuggy = `import csv

def process(path: str) -> None:
    with open(path, newline="") as fh:
        rows = list(csv.DictReader(fh))
    print(f"Loaded {len(rows)} cases")
    for i, row in enumerate(rows, 1):
        severity = float(row["severity"])  # BUG: severity may be text like 'HIGH'
        print(f"row {i}: {row['case_id']} severity={severity}")

if __name__ == "__main__":
    process("cases.csv")
`;

const parseCasesFixed = `import csv

SEVERITY = {"LOW": 1.0, "MED": 2.0, "HIGH": 3.0, "CRITICAL": 4.0}

def _to_float(value: str) -> float:
    return SEVERITY.get(value, float(value))

def process(path: str) -> None:
    with open(path, newline="") as fh:
        rows = list(csv.DictReader(fh))
    print(f"Loaded {len(rows)} cases")
    for i, row in enumerate(rows, 1):
        severity = _to_float(row["severity"])
        print(f"row {i}: {row['case_id']} severity={severity}")

if __name__ == "__main__":
    process("cases.csv")
`;

const casesCsvContent = `case_id,reformer,severity,target_days
r1,reformer-furnace-1,LOW,5
r2,reformer-furnace-1,MED,4
r3,reformer-furnace-2,LOW,6
r4,reformer-furnace-2,MED,4
r5,reformer-furnace-2,HIGH,3
r6,reformer-furnace-3,MED,4
r7,reformer-furnace-3,HIGH,3
r8,reformer-furnace-3,CRITICAL,2`.replace('"', '"');

function scaffold(title: string, files: Record<string, string>): MockFile[] {
  const base: Record<string, string> = {
    "main.py": `"""${title} — demo scaffold generated by the local coding agent."""
def run():
    print("Generated scaffold for: ${title}")

if __name__ == "__main__":
    run()
`,
    "analysis.py": `"""Data analysis helpers (demo)."""
import csv

def load_rows(path: str) -> list:
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))

def flag_over_limit(rows, col, limit):
    return [r for r in rows if float(r[col]) > limit]
`,
    "requirements.txt": "pandas==2.2.2\npytest==8.2.1\n",
    "tests/test_main.py": `from main import run

def test_run():
    run()
`,
    "preseed_data.csv": "month,reading_mms\nJan,5.9\nFeb,6.1\nMar,6.4\nApr,6.7\nMay,7.0\nJun,7.3\nJul,7.8\nAug,8.2\n",
  };
  const merged: Record<string, string> = { ...base, ...files };
  return Object.entries(merged).map(([path, content]) => ({
    path,
    content,
    size: content.length,
  }));
}

const seedFiles = (): MockFile[] => [
  { path: "analysis.py", content: analysisPyContent, size: analysisPyContent.length },
  { path: "vibration_analysis.py", content: vibrationPyContent, size: vibrationPyContent.length },
  { path: "telemetry.py", content: telemetryPyContent, size: telemetryPyContent.length },
  { path: "pressure_data.csv", content: pressureCsvContent, size: pressureCsvContent.length },
  { path: "requirements.txt", content: requirementsTxtContent, size: requirementsTxtContent.length },
  { path: "tests/test_analysis.py", content: testAnalysisPyContent, size: testAnalysisPyContent.length },
];

const pytestLogLines = [
  "============================= test session starts =============================",
  "test_analysis.py::test_vibration_threshold .                              [ 16%]",
  "test_analysis.py::test_exceedance_calculation .                           [ 33%]",
  "test_analysis.py::test_edge_cases PASSED                                  [ 50%]",
  "telemetry.py smoke ok                                                     [ 66%]",
  "============================== 12 passed in 12.34s ============================",
];

function parseCasesLogs(ok: boolean): RunLogEntry[] {
  const t0 = Date.now();
  const lines: RunLogEntry[] = [
    { at: new Date(t0 + 100).toISOString(), type: "status", message: "starting: python parse_cases.py" },
    { at: new Date(t0 + 500).toISOString(), type: "stdout", line: "Loaded 8 cases" },
    { at: new Date(t0 + 900).toISOString(), type: "stdout", line: "row 1: r1 severity=1.0" },
    { at: new Date(t0 + 1300).toISOString(), type: "stdout", line: "row 2: r2 severity=2.0" },
    { at: new Date(t0 + 1700).toISOString(), type: "stdout", line: "row 3: r3 severity=1.0" },
    { at: new Date(t0 + 2100).toISOString(), type: "stdout", line: "row 4: r4 severity=2.0" },
    { at: new Date(t0 + 2500).toISOString(), type: "stdout", line: "row 5: r5 severity=3.0" },
    { at: new Date(t0 + 2900).toISOString(), type: "stdout", line: "row 6: r6 severity=2.0" },
    { at: new Date(t0 + 3300).toISOString(), type: "stdout", line: "row 7: r7 severity=3.0" },
    { at: new Date(t0 + 3700).toISOString(), type: "stdout", line: "row 8: r8 severity=4.0" },
  ];
  if (ok) {
    lines.push({ at: new Date(t0 + 4300).toISOString(), type: "status", message: "All 8 rows processed — severity ranks resolved.", exit: 0 });
  } else {
    lines.push(
      { at: new Date(t0 + 3500).toISOString(), type: "stderr", line: "Traceback (most recent call last):" },
      { at: new Date(t0 + 3700).toISOString(), type: "stderr", line: '  File "parse_cases.py", line 12, in process' },
      { at: new Date(t0 + 3900).toISOString(), type: "stderr", line: '    severity = float(row["severity"])' },
      { at: new Date(t0 + 4100).toISOString(), type: "stderr", line: "ValueError: could not convert string to float: 'HIGH'" },
      { at: new Date(t0 + 4200).toISOString(), type: "status", message: "process exited rc=1", exit: 1 }
    );
  }
  return lines;
}

// ── Seed sessions/tasks ─────────────────────────────────────────────────────

function seed() {
  const P102_ROOT = "/home/mrpl/coding-workspaces/p102-vibration-analyzer";
  const REF_ROOT = "/home/mrpl/workspaces/reformer-cases";
  const CDU4_ROOT = "/home/mrpl/coding-workspaces/cdu4-decoke-scheduler";

  const t102: MockTask = {
    task_id: "t-p102",
    title: "P-102 vibration analyzer",
    task_type: "NEW_PROJECT",
    status: "COMPLETED",
    verdict: "IMPLEMENTED",
    engine: "local-model-v2 (128k)",
    created_at: agoSec(7400),
    completed_at: agoSec(7060),
    error_message: null,
    result_summary: "Created a Python analyzer + test suite for P-102 bearing vibration vs the 7.1 mm/s SOP limit. 12 tests pass.",
    request: "Build a Python tool that flags P-102 bearing vibration readings that exceed the 7.1 mm/s SOP limit.",
    authorized_root: P102_ROOT,
    repair_attempts: 0,
    events: [
      { kind: "manifest_generated", task_id: "t-p102", at: agoSec(7400), count: 6 },
      { kind: "workspace_created", task_id: "t-p102", at: agoSec(7390), root: P102_ROOT },
      { kind: "project_files_written", task_id: "t-p102", at: agoSec(7360), count: 6 },
      { kind: "command_started", task_id: "t-p102", at: agoSec(7340), command: "python -m pytest -q -x" },
      { kind: "verification_started", task_id: "t-p102", at: agoSec(7310), attempt: 1 },
      { kind: "verification_result", task_id: "t-p102", at: agoSec(7070), ok: true, return_code: 0, command: "python -m pytest -q -x", attempt: 1 },
      { kind: "command_started", task_id: "t-p102", at: agoSec(7065), command: "python telemetry.py" },
      { kind: "command_finished", task_id: "t-p102", at: agoSec(7062), return_code: 0, command: "python telemetry.py" },
      { kind: "task_completed", task_id: "t-p102", at: agoSec(7060), verdict: "IMPLEMENTED" },
    ],
    messages: [],
    permission_requests: [
      {
        request_id: "r-p102-1",
        kind: "WRITE_FILE",
        detail: "Write new project files into the coding workspace",
        command: "agent writes → p102-vibration-analyzer/",
        path: P102_ROOT,
        decision: "ALLOW_FOR_TASK",
        created_at: agoSec(7395),
      },
    ],
    executions: [
      { execution_id: "e-p102-1", command: "python -m pytest -q -x", label: null, status: "completed", return_code: 0, duration_ms: 12340 },
      { execution_id: "e-p102-2", command: "python telemetry.py", label: null, status: "completed", return_code: 0, duration_ms: 1210 },
    ],
    file_changes: seedFiles().map((f) => ({ path: f.path, change_type: "added", diff: null })),
    test_results: [
      { command: "python -m pytest -q -x ::test_vibration_threshold", passed: true, stdout: "", return_code: 0, attempt: 1 },
      { command: "python -m pytest -q -x ::test_exceedance_calculation", passed: true, stdout: "", return_code: 0, attempt: 1 },
      { command: "python -m pytest -q -x ::test_edge_cases", passed: true, stdout: "", return_code: 0, attempt: 1 },
    ],
    files: seedFiles(),
    runs: [
      {
        run_id: "r-p102-tests",
        root: P102_ROOT,
        command: "python -m pytest -q -x",
        kind: "pytest",
        label: "Run tests",
        urls: [],
        status: "exited",
        is_running: false,
        started_at: agoSec(7340),
        stopped_at: agoSec(7070),
        exit_code: 0,
        logs: [
          { at: agoSec(7335), type: "status", message: "starting: python -m pytest -q -x" },
          ...pytestLogLines.map((l, i) => ({ at: agoSec(7330 - i * 30), type: "stdout" as const, line: l })),
          { at: agoSec(7070), type: "status", message: "process exited rc=0", exit: 0 },
        ],
      },
    ],
  };

  const tCdu4: MockTask = {
    task_id: "t-cdu4",
    title: "CDU-4 decoke scheduler",
    task_type: "GENERATED_CODE",
    status: "COMPLETED",
    verdict: "TESTED",
    engine: "local-model-v2 (128k)",
    created_at: agoSec(9300),
    completed_at: agoSec(9050),
    error_message: null,
    result_summary: "Snippet that schedules CDU-4 furnace decoke windows ahead of TA-2027; unit tests pass.",
    request: "Write a script that plans the CDU-4 furnace decoke windows ahead of TA-2027.",
    authorized_root: CDU4_ROOT,
    repair_attempts: 0,
    events: [
      { kind: "manifest_generated", task_id: "t-cdu4", at: agoSec(9300), count: 2 },
      { kind: "workspace_created", task_id: "t-cdu4", at: agoSec(9290), root: CDU4_ROOT },
      { kind: "files_written", task_id: "t-cdu4", at: agoSec(9260), count: 2 },
      { kind: "command_started", task_id: "t-cdu4", at: agoSec(9240), command: "python -m pytest -q" },
      { kind: "verification_started", task_id: "t-cdu4", at: agoSec(9070), attempt: 1 },
      { kind: "verification_result", task_id: "t-cdu4", at: agoSec(9055), ok: true, return_code: 0, command: "python -m pytest -q", attempt: 1 },
      { kind: "task_completed", task_id: "t-cdu4", at: agoSec(9050), verdict: "TESTED" },
    ],
    messages: [],
    permission_requests: [],
    executions: [
      { execution_id: "e-cdu4-1", command: "python -m pytest -q", label: null, status: "completed", return_code: 0, duration_ms: 1840 },
    ],
    file_changes: [
      { path: "decoke_scheduler.py", change_type: "added", diff: null },
      { path: "tests/test_scheduler.py", change_type: "added", diff: null },
    ],
    test_results: [
      { command: "python -m pytest -q ::test_returns_windows", passed: true, stdout: "", return_code: 0, attempt: 1 },
      { command: "python -m pytest -q ::test_non_overlapping", passed: true, stdout: "", return_code: 0, attempt: 1 },
    ],
    files: [
      { path: "decoke_scheduler.py", content: decokePyContent, size: decokePyContent.length },
      { path: "tests/test_scheduler.py", content: testSchedulerContent, size: testSchedulerContent.length },
    ],
    runs: [],
  };

  const parseCasesDiff = `-    severity = float(row["severity"])  # BUG: severity may be text like 'HIGH'
+    severity = _to_float(row["severity"])`;

  const tRef: MockTask = {
    task_id: "t-ref",
    title: "reformer-case matrix parser",
    task_type: "EXISTING_PROJECT",
    status: "FAILED",
    verdict: "FAILED",
    engine: "local-model-v2 (128k)",
    created_at: agoSec(5100),
    completed_at: agoSec(4950),
    error_message: "parse_cases.py crashed on row 5 — severity='HIGH' is not numeric.",
    result_summary: null,
    request: "Fix the reformer case matrix parser so it handles severity as text.",
    authorized_root: REF_ROOT,
    repair_attempts: 1,
    events: [
      { kind: "manifest_generated", task_id: "t-ref", at: agoSec(5100), count: 1 },
      { kind: "workspace_opened", task_id: "t-ref", at: agoSec(5090), root: REF_ROOT },
      { kind: "command_started", task_id: "t-ref", at: agoSec(5070), command: "python parse_cases.py" },
      { kind: "command_finished", task_id: "t-ref", at: agoSec(5060), return_code: 1, command: "python parse_cases.py" },
      { kind: "verification_started", task_id: "t-ref", at: agoSec(5055), attempt: 1 },
      { kind: "verification_result", task_id: "t-ref", at: agoSec(5050), ok: false, return_code: 1, command: "python parse_cases.py", attempt: 1 },
      { kind: "repair_started", task_id: "t-ref", at: agoSec(5040), attempt: 1 },
      { kind: "repair_files_written", task_id: "t-ref", at: agoSec(5020), count: 1 },
      { kind: "command_started", task_id: "t-ref", at: agoSec(5000), command: "python parse_cases.py" },
      { kind: "command_finished", task_id: "t-ref", at: agoSec(4990), return_code: 1, command: "python parse_cases.py" },
      { kind: "verification_started", task_id: "t-ref", at: agoSec(4985), attempt: 2 },
      { kind: "verification_result", task_id: "t-ref", at: agoSec(4980), ok: false, return_code: 1, command: "python parse_cases.py", attempt: 2 },
      {
        kind: "task_error",
        task_id: "t-ref",
        at: agoSec(4955),
        error: "ValueError: could not convert string to float: 'HIGH' (parse_cases.py, row 5)",
      },
    ],
    messages: [],
    permission_requests: [
      {
        request_id: "r-ref-1",
        kind: "WRITE_FILE",
        detail: "Edit parse_cases.py inside the selected folder",
        command: "agent writes → reformer-cases/parse_cases.py",
        path: REF_ROOT,
        decision: "ALLOW_FOR_TASK",
        created_at: agoSec(5020),
      },
    ],
    executions: [
      { execution_id: "e-ref-1", command: "python parse_cases.py", label: null, status: "failed", return_code: 1, duration_ms: 410 },
      { execution_id: "e-ref-2", command: "python parse_cases.py", label: null, status: "failed", return_code: 1, duration_ms: 390 },
    ],
    file_changes: [{ path: "parse_cases.py", change_type: "modified", diff: parseCasesDiff }],
    test_results: [
      {
        command: "python parse_cases.py",
        passed: false,
        stdout: "Traceback (most recent call last):\n  File \"parse_cases.py\", line 12, in process\n    severity = float(row[\"severity\"])\nValueError: could not convert string to float: 'HIGH'",
        return_code: 1,
        attempt: 2,
      },
    ],
    files: [
      { path: "parse_cases.py", content: parseCasesBuggy, size: parseCasesBuggy.length },
      { path: "cases.csv", content: casesCsvContent, size: casesCsvContent.length },
    ],
    runs: [
      {
        run_id: "r-ref-1",
        root: REF_ROOT,
        command: "python parse_cases.py",
        kind: "python",
        label: "Run parser",
        urls: [],
        status: "exited",
        is_running: false,
        started_at: agoSec(5070),
        stopped_at: agoSec(4955),
        exit_code: 1,
        logs: [
          { at: agoSec(5065), type: "status", message: "starting: python parse_cases.py" },
          { at: agoSec(5059), type: "stdout", line: "Loaded 8 cases" },
          { at: agoSec(5055), type: "stdout", line: "row 1: r1 severity=1.0" },
          { at: agoSec(5050), type: "stdout", line: "row 4: r4 severity=2.0" },
          { at: agoSec(5045), type: "stderr", line: "Traceback (most recent call last):" },
          { at: agoSec(5040), type: "stderr", line: '  File "parse_cases.py", line 12, in process' },
          { at: agoSec(5035), type: "stderr", line: '    severity = float(row["severity"])' },
          { at: agoSec(5030), type: "stderr", line: "ValueError: could not convert string to float: 'HIGH'" },
          { at: agoSec(5025), type: "status", message: "process exited rc=1", exit: 1 },
        ],
      },
    ],
  };

  const initTask = (m: MockTask) => {
    if (!tasks.has(m.task_id)) tasks.set(m.task_id, m);
  };
  initTask(t102);
  initTask(tCdu4);
  initTask(tRef);

  const makeSession = (
    id: string,
    title: string,
    mode: CodingSession["mode"],
    taskId: string | null,
    createdSec: number,
    chat: ChatLineDTO[]
  ): MockSession => {
    return {
      session_id: id,
      title,
      mode,
      project_name: null,
      folder_name: null,
      folder_path: null,
      storage_path: null,
      chat_count: chat.length,
      created_at: agoSec(createdSec),
      updated_at: agoSec(createdSec - Math.floor(createdSec * 0.1)),
      chat,
      taskId,
    };
  };

  const s102 = makeSession("s-p102", "P-102 vibration analyzer", "new_project", "t-p102", 7400, [
    { role: "user", text: "Build a Python tool that flags P-102 bearing vibration readings that exceed the 7.1 mm/s SOP limit.", when: lineTime() },
    { role: "agent", text: `📁 Workspace ready at ${P102_ROOT}`, when: lineTime() },
    { role: "agent", text: "📝 Wrote 6 file(s)", when: lineTime() },
    { role: "agent", text: "⚙️  $ python -m pytest -q -x", when: lineTime() },
    { role: "agent", text: "🧪 Verification — attempt 1", when: lineTime() },
    { role: "agent", text: "✅ Done — IMPLEMENTED. Created a Python analyzer + test suite for P-102 bearing vibration vs the 7.1 mm/s SOP limit. 12 tests pass.", when: lineTime() },
  ]);
  s102.project_name = "p102-vibration-analyzer";
  s102.storage_path = P102_ROOT.replace("/p102-vibration-analyzer", "");
  sessions.set("s-p102", s102);

  const sCdu4 = makeSession("s-cdu4", "CDU-4 decoke scheduler", "generate", "t-cdu4", 9300, [
    { role: "user", text: "Write a script that plans the CDU-4 furnace decoke windows ahead of TA-2027.", when: lineTime() },
    { role: "agent", text: `📁 Workspace ready at ${CDU4_ROOT}`, when: lineTime() },
    { role: "agent", text: "📝 Wrote 2 file(s)", when: lineTime() },
    { role: "agent", text: "✅ Done — TESTED. Snippet that schedules CDU-4 furnace decoke windows ahead of TA-2027; unit tests pass.", when: lineTime() },
  ]);
  sCdu4.project_name = "cdu4-decoke-scheduler";
  sessions.set("s-cdu4", sCdu4);

  const sRef = makeSession("s-ref", "reformer-case matrix parser", "existing_project", "t-ref", 5100, [
    { role: "user", text: "Open the reformer case matrix folder and fix the parser so it handles severity as text.", when: lineTime() },
    { role: "agent", text: `📁 Workspace ready at ${REF_ROOT}`, when: lineTime() },
    { role: "agent", text: "⚙️  $ python parse_cases.py", when: lineTime() },
    { role: "agent", text: "⛔ ValueError: could not convert string to float: 'HIGH' (parse_cases.py, row 5)", when: lineTime() },
  ]);
  sRef.folder_name = "reformer-cases";
  sRef.folder_path = REF_ROOT;
  sessions.set("s-ref", sRef);
}

seed();

// Restore the last-active session so first paint is immediately rich.
try {
  if (!localStorage.getItem("ca_active_session")) {
    localStorage.setItem("ca_active_session", "s-p102");
  }
} catch {
  /* non-browser env */
}

// ── Shared tree/run internals ───────────────────────────────────────────────

function buildTree(files: MockFile[]): TreeNode {
  const root: TreeNode = { name: "workspace", path: "/", type: "dir", size: 0, children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    let cur = "";
    parts.forEach((part, i) => {
      cur = cur ? `${cur}/${part}` : part;
      if (i === parts.length - 1) {
        node.children!.push({ name: part, path: cur, type: "file", size: f.size });
      } else {
        let dir = node.children!.find((c) => c.type === "dir" && c.name === part);
        if (!dir) {
          dir = { name: part, path: cur, type: "dir", size: 0, children: [] };
          node.children!.push(dir);
        }
        node = dir as TreeNode;
      }
    });
  }
  return root;
}

function runWillFail(files: MockFile[]): boolean {
  return files.some((f) => f.content.includes('severity = float(row["'));
}

function pickCommand(files: MockFile[]): { command: string; kind: string; label: string } {
  if (files.some((f) => f.path.startsWith("tests/"))) {
    return { command: "python -m pytest -q -x", kind: "pytest", label: "Run tests" };
  }
  if (files.some((f) => f.path === "parse_cases.py")) {
    return { command: "python parse_cases.py", kind: "python", label: "Run parser" };
  }
  return { command: "python main.py", kind: "python", label: "Run main" };
}

function attachLogs(run: RunSnapshot, files: MockFile[], willFail: boolean) {
  const t0 = Date.now();
  if (run.command.startsWith("python -m pytest")) {
    run.logs = [
      { at: new Date(t0 + 200).toISOString(), type: "status", message: "starting: python -m pytest -q -x" },
      ...pytestLogLines.map((l, i) => ({ at: new Date(t0 + 500 + i * 500).toISOString(), type: "stdout" as const, line: l })),
    ];
    if (willFail) {
      run.logs.push(
        { at: new Date(t0 + 3600).toISOString(), type: "stderr", line: "FAILED tests/test_main.py::test_run — check logs" },
        { at: new Date(t0 + 3700).toISOString(), type: "status", message: "process exited rc=1", exit: 1 }
      );
      run.exit_code = 1;
    } else {
      run.logs.push({ at: new Date(t0 + 3700).toISOString(), type: "status", message: "process exited rc=0", exit: 0 });
      run.exit_code = 0;
    }
  } else if (files.some((f) => f.path === "parse_cases.py")) {
    run.logs = parseCasesLogs(!willFail);
    run.exit_code = willFail ? 1 : 0;
  } else {
    run.logs = [
      { at: new Date(t0 + 200).toISOString(), type: "status", message: `starting: ${run.command}` },
      { at: new Date(t0 + 600).toISOString(), type: "stdout", line: "Generated scaffold for: demo project" },
      { at: new Date(t0 + 1000).toISOString(), type: "status", message: "process exited rc=0", exit: 0 },
    ];
    run.exit_code = 0;
  }
  void files;
}

function streamRun(key: string, run: RunSnapshot) {
  const startTs = new Date(run.started_at || 0).getTime();
  const endAt = startTs + 5200;
  let idx = 0;
  let done = false;
  const tick = () => {
    if (done) return;
    const now = Date.now();
    while (idx < run.logs.length) {
      const l = run.logs[idx];
      const t = new Date(l.at).getTime();
      if (t > now) break;
      if (t >= startTs) publish(key, l);
      idx++;
    }
    if (now >= endAt) {
      done = true;
      for (let j = idx; j < run.logs.length; j++) publish(key, run.logs[j]);
      run.status = "exited";
      run.is_running = false;
      run.stopped_at = new Date().toISOString();
    } else {
      setTimeout(tick, 240);
    }
  };
  setTimeout(tick, 160);
}

// ── Simulated agent for brand-new tasks ─────────────────────────────────────

function startAgent(task: MockTask, mode: CodingSession["mode"], message: string) {
  const files: MockFile[] =
    mode === "existing_project"
      ? [
          { path: "main.py", content: "def run():\n    print('hello from existing project')\n", size: 42 },
          { path: "requirements.txt", content: "pandas==2.2.2\n", size: 13 },
        ]
      : scaffold(slugify(message), {});
  task.files = files;

  const pushEvent = (ev: CodingEvent) => {
    task.events.push(ev);
    publish(task.task_id, ev);
    if (ev.kind === "project_files_written" || ev.kind === "files_written") {
      task.file_changes = files.map((f) => ({ path: f.path, change_type: "added", diff: null }));
    }
  };

  const cmd = pickCommand(files).command;
  const evList: CodingEvent[] = [
    { kind: "manifest_generated", task_id: task.task_id, at: nowIso(), count: files.length },
    ...(mode === "existing_project"
      ? [{ kind: "workspace_opened", task_id: task.task_id, at: nowIso(), root: task.authorized_root }]
      : [{ kind: "workspace_created", task_id: task.task_id, at: nowIso(), root: task.authorized_root }]),
    { kind: mode === "new_project" ? "project_files_written" : "files_written", task_id: task.task_id, at: nowIso(), count: files.length },
    { kind: "command_started", task_id: task.task_id, at: nowIso(), command: cmd },
    { kind: "verification_started", task_id: task.task_id, at: nowIso(), attempt: 1 },
    { kind: "verification_result", task_id: task.task_id, at: nowIso(), ok: true, return_code: 0, command: cmd, attempt: 1 },
    { kind: "task_completed", task_id: task.task_id, at: nowIso(), verdict: "IMPLEMENTED" },
  ];

  let i = 0;
  const pushNext = () => {
    if (i >= evList.length) return;
    pushEvent(evList[i]);
    i++;
    setTimeout(pushNext, i <= 3 ? 420 : 900);
  };
  setTimeout(pushNext, 380);

  setTimeout(() => {
    task.executions.push({
      execution_id: uid("e"),
      command: cmd,
      label: null,
      status: "completed",
      return_code: 0,
      duration_ms: 3400,
    });
    task.test_results.push({ command: cmd, passed: true, stdout: "", return_code: 0, attempt: 1 });
    const run: RunSnapshot = {
      run_id: uid("r"),
      root: task.authorized_root || "",
      ...pickCommand(files),
      urls: [],
      status: "exited",
      is_running: false,
      started_at: nowIso(),
      stopped_at: nowIso(),
      exit_code: 0,
      logs: [],
    };
    task.runs.unshift(run);
  }, 380 + 420 * 3 + 900);

  setTimeout(() => {
    task.status = "COMPLETED";
    task.verdict = "IMPLEMENTED";
    task.completed_at = nowIso();
    task.result_summary =
      mode === "existing_project"
        ? "Opened the folder, applied the requested change and verified it locally."
        : "Generated the requested project and verified it — all checks pass locally.";
  }, 380 + 420 * 3 + 900 * 3 + 700);
}

// ── Mock API client ─────────────────────────────────────────────────────────

const WORKSPACES: WorkspaceEntry[] = [
  { name: "P-102 Analysis", path: "/home/mrpl/coding-workspaces/p102-vibration-analyzer" },
  { name: "Pump Monitoring", path: "/home/mrpl/coding-workspaces/pump-monitoring" },
  { name: "CDU-4 scheduler", path: "/home/mrpl/coding-workspaces/cdu4-decoke-scheduler" },
  { name: "reformer-cases", path: "/home/mrpl/workspaces/reformer-cases" },
];

const VFS: Record<string, { dirs: { name: string }[]; files: { name: string; size: number }[] }> = {
  "/home/mrpl": {
    dirs: [{ name: "coding-workspaces" }, { name: "workspaces" }, { name: "projects" }],
    files: [{ name: "baseline_2025.csv", size: 89 }],
  },
  "/home/mrpl/coding-workspaces": {
    dirs: [
      { name: "p102-vibration-analyzer" },
      { name: "pump-monitoring" },
      { name: "cdu4-decoke-scheduler" },
    ],
    files: [{ name: "README.md", size: 212 }],
  },
  "/home/mrpl/coding-workspaces/p102-vibration-analyzer": {
    dirs: [{ name: "tests" }],
    files: [
      { name: "analysis.py", size: 812 },
      { name: "telemetry.py", size: 314 },
      { name: "pressure_data.csv", size: 268 },
    ],
  },
  "/home/mrpl/coding-workspaces/pump-monitoring": {
    dirs: [{ name: "tests" }],
    files: [{ name: "telemetry_ingest.py", size: 402 }],
  },
  "/home/mrpl/coding-workspaces/cdu4-decoke-scheduler": {
    dirs: [],
    files: [{ name: "decoke_scheduler.py", size: 366 }],
  },
  "/home/mrpl/workspaces": {
    dirs: [{ name: "reformer-cases" }],
    files: [],
  },
  "/home/mrpl/workspaces/reformer-cases": {
    dirs: [],
    files: [
      { name: "parse_cases.py", size: 420 },
      { name: "cases.csv", size: 314 },
    ],
  },
  "/home/mrpl/projects": {
    dirs: [{ name: "TA-2027" }, { name: "pipeline-anomaly" }],
    files: [],
  },
  "/home/mrpl/projects/TA-2027": {
    dirs: [],
    files: [
      { name: "gantt.py", size: 512 },
      { name: "tasks.csv", size: 240 },
    ],
  },
  "/home/mrpl/projects/pipeline-anomaly": {
    dirs: [],
    files: [
      { name: "investigate.py", size: 388 },
      { name: "log_extract.py", size: 244 },
    ],
  },
};

function browse(path?: string): FolderBrowse {
  const key = path ? path.replace(/\/+$/, "") : "/home/mrpl";
  const node = VFS[key] || { dirs: [], files: [] };
  const parent =
    key === "/home/mrpl" ? null : key.slice(0, key.lastIndexOf("/")) || "/home/mrpl";
  const entries: FolderEntry[] = [
    ...node.dirs.map((d) => ({ name: d.name, path: `${key}/${d.name}`, is_dir: true, size: 0 })),
    ...node.files.map((f) => ({ name: f.name, path: `${key}/${f.name}`, is_dir: false, size: f.size })),
  ];
  return {
    path: key,
    name: key.split("/").pop() || key,
    parent,
    home: "/home/mrpl",
    entries,
  };
}

function copyTask(t: MockTask): CodingTaskDetail {
  return {
    ...t,
    events: [...t.events],
    messages: [...t.messages],
    permission_requests: [...t.permission_requests],
    executions: [...t.executions],
    file_changes: [...t.file_changes],
    test_results: [...t.test_results],
  };
}

function sessionPayload(s: MockSession): CodingSession {
  return {
    session_id: s.session_id,
    title: s.title,
    mode: s.mode,
    project_name: s.project_name,
    folder_name: s.folder_name,
    folder_path: s.folder_path,
    storage_path: s.storage_path,
    chat_count: s.chat.length,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

function listSessions(): CodingSession[] {
  return [...sessions.values()]
    .map(sessionPayload)
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
    .slice(0, 20);
}

function beginTask(
  sessionId: string | undefined,
  mode: CodingSession["mode"],
  message: string,
  title: string,
  storagePath: string | null,
  folderName: string | null,
  folderPath: string | null
): { task_id: string } {
  let sid = sessionId;
  if (!sid || !sessions.has(sid)) {
    const id = uid("s");
    const s: MockSession = {
      session_id: id,
      title: title || message.slice(0, 48),
      mode,
      project_name: mode === "new_project" ? title || null : null,
      folder_name: mode === "existing_project" ? folderName || null : null,
      folder_path: folderPath || null,
      storage_path: storagePath || null,
      chat_count: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
      chat: [],
      taskId: null,
    };
    sessions.set(id, s);
    sid = id;
  }

  const root =
    mode === "existing_project"
      ? folderPath || `/home/mrpl/workspaces/${folderName || slugify(message)}`
      : storagePath && mode === "new_project"
        ? `${storagePath.replace(/\/+$/, "")}/${slugify(title)}`
        : `/home/mrpl/coding-workspaces/${slugify(title)}`;

  const task: MockTask = {
    task_id: uid("t"),
    title: title || message.slice(0, 48),
    task_type:
      mode === "generate" ? "GENERATED_CODE" : mode === "new_project" ? "NEW_PROJECT" : "EXISTING_PROJECT",
    status: "RUNNING",
    verdict: null,
    engine: "local-model-v2 (128k)",
    created_at: nowIso(),
    completed_at: null,
    error_message: null,
    result_summary: null,
    request: message,
    authorized_root: root,
    repair_attempts: 0,
    events: [],
    messages: [],
    permission_requests: [],
    executions: [],
    file_changes: [],
    test_results: [],
    files: [],
    runs: [],
  };
  tasks.set(task.task_id, task);

  const s = sessions.get(sid);
  if (s) {
    s.taskId = task.task_id;
    s.updated_at = nowIso();
  }

  startAgent(task, mode, message);
  return { task_id: task.task_id };
}

export const codingApi = {
  base: "mock://local-coding-agent",

  health: async () => ({ status: "ok", service: "coding-agent (mock, on-device)" }),

  models: async () => ({
    models: ["local-model-v2 (128k)", "local-model-v2 (32k)"],
    coding_model: "local-model-v2 (128k)",
  }),

  workspaces: {
    list: async () => ({ workspaces: WORKSPACES }),
    inspect: async (folderName: string) => ({
      ok: true,
      workspace: { name: folderName, path: `/home/mrpl/workspaces/${folderName}` },
      tree: "",
      files: [] as { path: string; size: number }[],
      git: { branch: "main", changes: "" },
    }),
    create: async (folderName: string) => ({
      ok: true,
      workspace: { name: folderName, path: `/home/mrpl/coding-workspaces/${folderName}` },
    }),
  },

  folders: {
    browse: async (path?: string) => browse(path),
  },

  sessions: {
    create: async (payload: {
      title?: string;
      mode?: string;
      project_name?: string | null;
      folder_name?: string | null;
      folder_path?: string | null;
      storage_path?: string | null;
    }) => {
      await wait(120);
      const id = uid("s");
      const mode = payload.mode as CodingSession["mode"];
      const s: MockSession = {
        session_id: id,
        title: payload.title || "New coding session",
        mode,
        project_name: payload.project_name ?? null,
        folder_name: payload.folder_name ?? null,
        folder_path: payload.folder_path ?? null,
        storage_path: payload.storage_path ?? null,
        chat_count: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
        chat: [],
        taskId: null,
      };
      sessions.set(id, s);
      return { session: sessionPayload(s) };
    },
    list: async () => {
      await wait(60);
      return { sessions: listSessions() };
    },
    get: async (sessionId: string): Promise<CodingSessionDetail> => {
      await wait(80);
      const s = sessions.get(sessionId);
      if (!s) throw new Error("session not found");
      const t = s.taskId ? tasks.get(s.taskId) : null;
      return {
        session: sessionPayload(s),
        chat: [...s.chat],
        tasks: t ? [copyTask(t)] : [],
        task: t ? copyTask(t) : null,
      };
    },
    appendMessage: async (sessionId: string, role: string, text: string, when?: string) => {
      const s = sessions.get(sessionId);
      if (s) {
        s.chat.push({ role: role as ChatLineDTO["role"], text, when: when || lineTime() });
        s.updated_at = nowIso();
      }
      return { chat: s ? [...s.chat] : [] };
    },
    rename: async (sessionId: string, title: string) => {
      const s = sessions.get(sessionId);
      if (s) {
        s.title = title;
        s.updated_at = nowIso();
      }
      return { session: s ? sessionPayload(s) : ({} as CodingSession) };
    },
    delete: async (sessionId: string) => {
      sessions.delete(sessionId);
      return { ok: true };
    },
  },

  tasks: {
    list: async () => ({ tasks: [...tasks.values()].map(copyTask) }),

    get: async (taskId: string): Promise<CodingTaskDetail> => {
      await wait(40);
      const t = tasks.get(taskId);
      if (!t) throw new Error("task not found");
      return copyTask(t);
    },

    generate: async (message: string, title?: string, sessionId?: string) => {
      await wait(260);
      return beginTask(sessionId, "generate", message, title || message.slice(0, 48), null, null, null);
    },
    newProject: async (
      message: string,
      projectName?: string,
      sessionId?: string,
      storagePath?: string
    ) => {
      await wait(260);
      return beginTask(sessionId, "new_project", message, projectName || message.slice(0, 48), storagePath || null, null, null);
    },
    existingProject: async (
      message: string,
      folderName: string,
      folderPath?: string,
      sessionId?: string
    ) => {
      await wait(260);
      return beginTask(sessionId, "existing_project", message, folderName || message.slice(0, 48), null, folderName, folderPath || null);
    },

    approve: async (taskId: string, decision: "ALLOW_ONCE" | "ALLOW_FOR_TASK" | "DENY") => {
      const t = tasks.get(taskId);
      if (t) {
        t.permission_requests.forEach((p) => {
          if (p.decision === null) p.decision = decision;
        });
      }
      return { ok: true, decision };
    },
    approveAll: async (taskId: string, decision: "ALLOW_ONCE" | "ALLOW_FOR_TASK" | "DENY") => {
      const t = tasks.get(taskId);
      if (t) t.permission_requests.forEach((p) => (p.decision = decision));
      return { ok: true, decision };
    },
    cancel: async (taskId: string) => {
      const t = tasks.get(taskId);
      if (t) {
        t.status = "CANCELLED";
        t.verdict = null;
        t.error_message = "Cancelled by user.";
      }
      return { ok: true };
    },

    files: async (taskId: string) => {
      const t = tasks.get(taskId);
      return {
        files: (t?.files || []).map((f) => ({ path: f.path, size: f.size })),
        changes: t?.file_changes || [],
      };
    },
    file: async (taskId: string, path: string) => {
      const t = tasks.get(taskId);
      const f = t?.files.find((x) => x.path === path);
      if (!f) throw new Error("file not found");
      return { path: f.path, content: f.content };
    },
    saveFile: async (taskId: string, path: string, content: string) => {
      const t = tasks.get(taskId);
      const f = t?.files.find((x) => x.path === path);
      if (f) {
        f.content = content;
        f.size = content.length;
      }
      return { ok: true, path, size: content.length };
    },
    tree: async (taskId: string): Promise<TaskTree> => {
      const t = tasks.get(taskId);
      const files = t?.files || [];
      return {
        root: t?.authorized_root || "",
        tree: buildTree(files),
        files: files.map((f) => ({ path: f.path, size: f.size })),
        git: { branch: "main", changes: files.length > 0 ? "ready" : "" },
      };
    },
    diff: async (taskId: string) => ({ changes: tasks.get(taskId)?.file_changes || [] }),
    tests: async (taskId: string) => ({ results: tasks.get(taskId)?.test_results || [] }),
    executions: async (taskId: string) => ({ executions: tasks.get(taskId)?.executions || [] }),
    download: (taskId: string) => `mock://${taskId}/download.zip`,

    events: (taskId: string) => new MockES(taskId),

    runDetect: async (taskId: string): Promise<RunDetect> => {
      const t = tasks.get(taskId);
      const cmdInfo = pickCommand(t?.files || []);
      return { ok: true, ...cmdInfo, urls: [], root: t?.authorized_root || "" };
    },
    run: async (taskId: string) => {
      const t = tasks.get(taskId);
      if (!t) throw new Error("task not found");
      const willFail = runWillFail(t.files);
      const cmdInfo = pickCommand(t.files);
      const run: RunSnapshot = {
        run_id: uid("r"),
        root: t.authorized_root || "",
        ...cmdInfo,
        urls: [],
        status: "starting",
        is_running: true,
        started_at: nowIso(),
        stopped_at: null,
        exit_code: null,
        logs: [],
      };
      t.runs.unshift(run);
      setTimeout(() => {
        attachLogs(run, t.files, willFail);
        streamRun(`${t!.task_id}:${run.run_id}`, run);
      }, 120);
      return { run };
    },
    runStatus: async (taskId: string) => {
      const t = tasks.get(taskId);
      return { runs: (t?.runs || []).map((r) => ({ ...r, logs: [...r.logs] })) };
    },
    runLogs: (taskId: string, runId: string) => new MockES(`${taskId}:${runId}`),
    runInput: async (taskId: string, runId: string, text: string) => {
      const t = tasks.get(taskId);
      const run = t?.runs.find((r) => r.run_id === runId);
      const entry: RunLogEntry = { at: nowIso(), type: "stdin", line: `⏎ ${text}` };
      if (run) run.logs.push(entry);
      publish(`${taskId}:${runId}`, entry);
      return { ok: true };
    },
    runStop: async (taskId: string, runId: string) => {
      const t = tasks.get(taskId);
      const run = t?.runs.find((r) => r.run_id === runId);
      if (run) {
        run.status = "stopped";
        run.is_running = false;
        run.stopped_at = nowIso();
        run.exit_code = null;
        run.logs.push({ at: nowIso(), type: "status", message: "process stopped by user" });
      }
      return { ok: true };
    },
    aiFix: async (taskId: string, _error: string): Promise<AiFixResult> => {
      const t = tasks.get(taskId);
      if (!t) throw new Error("task not found");
      await wait(1600);

      t.files = t.files.map((f) =>
        f.path === "parse_cases.py"
          ? { ...f, content: parseCasesFixed, size: parseCasesFixed.length }
          : f
      );
      t.repair_attempts = (t.repair_attempts || 0) + 1;

      const change: CodingFileChange = {
        path: "parse_cases.py",
        change_type: "modified",
        diff: `-    severity = float(row["severity"])  # BUG: severity may be text like 'HIGH'
+    severity = _to_float(row["severity"])`,
      };
      t.file_changes.unshift(change);

      const fixEv: CodingEvent = { kind: "fix_applied", task_id: t.task_id, at: nowIso(), count: 1 };
      t.events.push(fixEv);
      publish(t.task_id, fixEv);

      const run: RunSnapshot = {
        run_id: uid("r"),
        root: t.authorized_root || "",
        ...pickCommand(t.files),
        urls: [],
        status: "starting",
        is_running: true,
        started_at: nowIso(),
        stopped_at: null,
        exit_code: null,
        logs: [],
      };
      t.runs.unshift(run);

      setTimeout(() => {
        attachLogs(run, t.files, false);
        streamRun(`${t!.task_id}:${run.run_id}`, run);
        t.status = "COMPLETED";
        t.verdict = "PARTIALLY_COMPLETED";
        t.completed_at = nowIso();
        t.result_summary = "Fixed the severity column parser (parse_cases.py) and re-ran successfully.";
        t.error_message = null;
        t.events.push({
          kind: "task_completed",
          task_id: t.task_id,
          at: nowIso(),
          verdict: "PARTIALLY_COMPLETED",
        });
      }, 2200);

      return {
        ok: true,
        changes: [change],
        run,
        run_error: null,
      };
    },
  },
};