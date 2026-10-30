"""Project runner for the isolated Coding Agent.

Detects the project type inside a workspace, starts the correct command, and
streams the runtime output back to the UI over SSE. Guarantees a duplicate
process is never started for the same workspace+command while one is already
running - re-invoking Run simply re-attaches to the live process.

The runner is intentionally independent of the task lifecycle: it owns a
separate process table and log buffer so running a project never interferes
with the agent's code-generation pipeline.
"""
import asyncio
import json
import os
import signal
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.config import settings


@dataclass
class RunTarget:
    command: str
    label: str
    kind: str  # python | node | static | single_file
    urls: List[str] = field(default_factory=list)
    input_supported: bool = False


@dataclass
class RunState:
    run_id: str
    root: str
    target: RunTarget
    start_command: str = ""
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    exit_code: Optional[int] = None
    error: Optional[str] = None
    is_running: bool = False
    stopped: bool = False
    logs: List[dict] = field(default_factory=list)
    watchers: List[asyncio.Queue] = field(default_factory=list)
    proc: Any = None

    @property
    def status(self) -> str:
        if self.is_running:
            return "running"
        if self.stopped:
            return "stopped"
        if self.exit_code is not None:
            return "exited"
        if self.error:
            return "error"
        return "starting"


_PROJECT_DETECT_FILE_CANDIDATES = (
    "main.py", "app.py", "index.py", "manage.py", "application.py",
    "package.json", "index.html", "server.js", "app.js", "index.js",
)

_NODE_DEV_URL = "http://localhost:5173"
_NODE_START_URL = "http://localhost:3000"
_HTTP_SERVER_URL = "http://localhost:8080"


class ProjectRunner:
    def __init__(self) -> None:
        self._runs: Dict[str, RunState] = {}

    # ------------------------------------------------------------------
    # project type detection
    # ------------------------------------------------------------------

    @staticmethod
    def _python() -> str:
        p = shutil.which("python3") or shutil.which("python")
        return p or "python3"

    @staticmethod
    def _candidate_files(root: str, max_depth: int = 3) -> List[Path]:
        root_path = Path(root)
        out: List[Path] = []
        for path in root_path.rglob("*"):
            if path.is_file() and not any(
                part in _IGNORED_PARTS for part in path.relative_to(root_path).parts
            ):
                try:
                    rel = path.relative_to(root_path)
                except ValueError:
                    continue
                if len(rel.parts) <= max_depth:
                    out.append(path)
        return out

    def detect_project(self, root: str) -> RunTarget:
        """Return the runnable command + metadata for a workspace folder."""
        root_path = Path(root)
        files = self._candidate_files(root)

        # 1) Node / npm project
        pkg_json = root_path / "package.json"
        if pkg_json.exists():
            try:
                pkg = json.loads(pkg_json.read_text(encoding="utf-8"))
            except Exception:  # noqa: BLE001
                pkg = {}
            scripts = pkg.get("scripts") or {}
            # Vite / React style dev servers
            if scripts.get("dev"):
                port = _extract_port(scripts["dev"])
                return RunTarget(
                    command="npm run dev",
                    label="npm run dev",
                    kind="node",
                    urls=[f"http://localhost:{port}" if port else _NODE_DEV_URL],
                )
            if scripts.get("start"):
                port = _extract_port(scripts.get("start", ""))
                return RunTarget(
                    command="npm start",
                    label="npm start",
                    kind="node",
                    urls=[f"http://localhost:{port}" if port else _NODE_START_URL],
                )
            if scripts:
                first = sorted(scripts.keys())[0]
                command = f"npm run {first}"
                return RunTarget(command=command, label=command, kind="node",
                                 urls=[], input_supported=True)

        # 2) Python application entry points (prefer app/main).
        py_files = [p for p in files if p.suffix.lower() == ".py"]
        py_entry = _pick_python_entry(root_path, py_files)
        if py_entry:
            return RunTarget(
                command=f"{self._python()} {py_entry}",
                label=f"python {py_entry}",
                kind="python",
                urls=[],
                input_supported=True,
            )

        # 3) Plain HTML → static server.
        if (root_path / "index.html").exists() or any(
            p.name.lower() == "index.html" for p in files
        ):
            return RunTarget(
                command=f"{self._python()} -m http.server 8080",
                label="python -m http.server 8080",
                kind="static",
                urls=[_HTTP_SERVER_URL],
            )

        # 4) A single source file (any script) → run directly.
        if len(py_files) == 1:
            rel = py_files[0].relative_to(root_path).as_posix()
            return RunTarget(
                command=f"{self._python()} {rel}",
                label=f"python {rel}",
                kind="single_file",
                urls=[],
                input_supported=True,
            )
        single_js = [p for p in files if p.suffix.lower() == ".js"]
        if len(single_js) == 1 and len(files) == 1:
            rel = single_js[0].relative_to(root_path).as_posix()
            return RunTarget(
                command=f"node {rel}",
                label=f"node {rel}",
                kind="single_file",
                urls=[],
                input_supported=True,
            )

        return RunTarget(
            command="", label="", kind="unknown", urls=[], input_supported=False
        )

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    def find_running(self, root: str, command: str) -> Optional[RunState]:
        """Find a live process that is already running this workspace+command."""
        for state in self._runs.values():
            if (state.is_running and not state.stopped
                    and Path(state.root) == Path(root)
                    and state.start_command == command):
                return state
        return None

    async def start(self, root: str) -> RunState:
        target = self.detect_project(root)
        if not target.command:
            raise ProjectRunError(
                "Could not detect how to run this project "
                "(no package.json, main.py/app.py, index.html or single script)."
            )
        existing = self.find_running(root, target.command)
        if existing:
            return existing
        state = RunState(
            run_id="run-" + uuid.uuid4().hex[:12],
            root=str(Path(root)),
            target=target,
            start_command=target.command,
        )
        self._runs[state.run_id] = state
        asyncio.create_task(self._spawn(state))
        return state

    async def stop(self, run_id: str) -> bool:
        state = self._runs.get(run_id)
        if not state or not state.is_running:
            return False
        await self._terminate(state)
        return True

    async def _terminate(self, state: RunState) -> None:
        proc = state.proc
        state.stopped = True
        state.is_running = False
        state.stopped_at = datetime.utcnow()
        self._push(state, {"type": "status", "message": "Stopping process…"})
        if proc and proc.returncode is None:
            # Terminate the whole process group so children (python/node/etc.
            # launched via the shell) are torn down too, not just the shell.
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except (ProcessLookupError, PermissionError, OSError):
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=3)
            except asyncio.TimeoutError:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except (ProcessLookupError, PermissionError, OSError):
                    pass
                try:
                    await asyncio.wait_for(proc.wait(), timeout=2)
                except asyncio.TimeoutError:
                    pass
        self._push(state, {"type": "status", "message": "Stopped."})

    async def send_input(self, run_id: str, text: str) -> bool:
        state = self._runs.get(run_id)
        if not state or not state.is_running or not state.proc or not state.proc.stdin:
            return False
        try:
            state.proc.stdin.write((text + "\n").encode("utf-8"))
            await state.proc.stdin.drain()
            return True
        except (BrokenPipeError, OSError, ValueError):
            return False

    async def _spawn(self, state: RunState) -> None:
        state.started_at = datetime.utcnow()
        state.is_running = True
        env = os.environ.copy()
        env.pop("http_proxy", None)
        env.pop("https_proxy", None)
        env.pop("HTTP_PROXY", None)
        env.pop("HTTPS_PROXY", None)
        env["PYTHONUNBUFFERED"] = "1"

        try:
            proc = await asyncio.create_subprocess_shell(
                state.start_command,
                cwd=state.root,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                stdin=asyncio.subprocess.PIPE,
                env=env,
                start_new_session=True,
            )
        except Exception as e:  # noqa: BLE001
            state.is_running = False
            state.error = str(e)
            self._push(state, {"type": "status", "message": f"Failed to start: {e}"})
            return
        state.proc = proc
        self._push(state, {
            "type": "status",
            "message": f"Started `{state.start_command}` (pid {proc.pid or '?'})",
            "target": state.target.label,
            "kind": state.target.kind,
            "urls": state.target.urls,
        })

        async def _reader():
            while True:
                try:
                    b = await proc.stdout.readline()
                except Exception:  # noqa: BLE001
                    break
                if not b:
                    break
                line = b.decode("utf-8", errors="replace").rstrip("\n")
                self._push(state, {"type": "stdout", "line": line})

        await asyncio.gather(_reader(), proc.wait())
        try:
            state.exit_code = proc.returncode
        except Exception:  # noqa: BLE001
            state.exit_code = None
        if state.exit_code == -9:
            state.exit_code = None
        state.is_running = False
        state.stopped_at = datetime.utcnow()
        self._push(state, {
            "type": "status",
            "message": f"Process exited rc={state.exit_code}.",
            "exit": state.exit_code,
        })

    # ------------------------------------------------------------------
    # log plumbing
    # ------------------------------------------------------------------

    def get(self, run_id: str) -> Optional[RunState]:
        return self._runs.get(run_id)

    def snapshot(self, run_id: str) -> Optional[dict]:
        state = self._runs.get(run_id)
        if not state:
            return None
        return {
            "run_id": state.run_id,
            "root": state.root,
            "command": state.start_command,
            "kind": state.target.kind,
            "label": state.target.label,
            "urls": state.target.urls,
            "status": state.status,
            "is_running": state.is_running,
            "started_at": state.started_at.isoformat() if state.started_at else None,
            "stopped_at": state.stopped_at.isoformat() if state.stopped_at else None,
            "exit_code": state.exit_code,
            "logs": list(state.logs),
        }

    def _push(self, state: RunState, event: dict) -> None:
        event = {"at": datetime.utcnow().isoformat(), **event}
        state.logs.append(event)
        for q in state.watchers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    pass

    def subscribe(self, run_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=1500)
        state = self._runs.get(run_id)
        if state:
            state.watchers.append(q)
        return q

    def unsubscribe(self, run_id: str, q: asyncio.Queue) -> None:
        state = self._runs.get(run_id)
        if state and q in state.watchers:
            try:
                state.watchers.remove(q)
            except ValueError:
                pass

    # ------------------------------------------------------------------
    # prune finished runs to keep the table bounded
    # ------------------------------------------------------------------

    def prune(self, max_age_min: int = 60) -> None:
        import time
        now = time.monotonic()
        drop = []
        for run_id, state in self._runs.items():
            if state.is_running:
                continue
            age = (now - (state.stopped_at.timestamp()
                          if state.stopped_at is not None else 0))
            if age > max_age_min * 60:
                drop.append(run_id)
        for run_id in drop:
            self._runs.pop(run_id, None)


class ProjectRunError(Exception):
    pass


_IGNORED_PARTS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv", ".next", "dist",
    "build", ".cache", ".pytest_cache", "target", ".idea", ".vscode",
}


def _pick_python_entry(root: Path, py_files: List[Path]) -> Optional[str]:
    """Choose the best python entry point (app.py/main.py preferred)."""
    pref = ("app.py", "main.py", "index.py", "server.py")
    best: Optional[str] = None
    best_key = (99, 99)
    for p in py_files:
        try:
            rel = p.relative_to(root)
        except ValueError:
            continue
        if len(rel.parts) > 2:
            continue
        name = p.name
        if name in pref:
            key = (len(rel.parts), pref.index(name))
        else:
            key = (len(rel.parts), 99)
        if key < best_key:
            best_key = key
            best = rel.as_posix()
    return best


def _extract_port(command: str) -> Optional[int]:
    import re
    m = re.search(r"--?port\s+(\d+)", command)
    if m:
        return int(m.group(1))
    return None


runner = ProjectRunner()