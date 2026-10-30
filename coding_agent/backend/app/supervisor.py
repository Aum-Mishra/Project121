"""Task supervisor for the isolated Coding Agent.

Orchestrates the three workflows:
1. GENERATED_CODE — quick code blurb from a prompt, downloadable as a ZIP.
2. NEW_PROJECT — create a fresh full project (folder + files + run + test + fix).
3. EXISTING_PROJECT — open an existing local folder, edit with permission,
   run test commands, surface the changes.

Common safety spine: authorization root, command classification, permission
requests surfaced to the UI, verification gated by the user, and a repair loop
capped at the configured attempt limit.
"""
import asyncio
import json
import re
import shutil
import subprocess
import tempfile
import time
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from app import security
from app.config import settings
from app.db import (
    CodingTask, CodingPermissionRequest, CodingExecution, CodingFileChange,
    CodingTestResult, TaskType, TaskStatus, Verdict, PermissionKind, Decision,
    ExecutionStatus,
)
from app.permission import (
    create_request, get_pending, pending_count, decide, resolve_all_for_task,
)
from app.sandbox import Sandbox
from app.workspace import WorkspaceManager, Workspace, WorkspaceError


class CodingAgentError(Exception):
    pass


# ---------------------------------------------------------------------------
# Event abstraction
# ---------------------------------------------------------------------------

class Supervisor:
    """One supervisor owns one task and drives it to completion."""

    def __init__(self, task: CodingTask, db: Session,
                 emit: Callable[[dict], None]):
        self.task = task
        self.db = db
        self.emit = emit or (lambda e: None)
        self.ws: Optional[Workspace] = None
        self.sandbox: Optional[Sandbox] = None
        self.workspace_manager = WorkspaceManager()

    # -- helpers -----------------------------------------------------------

    def _event(self, kind: str, **data):
        payload = {"kind": kind, "task_id": self.task.task_id, "at": datetime.utcnow().isoformat(), **data}
        self.emit(payload)
        evs = list(self.task.events or [])
        evs.append(payload)
        self.task.events = evs
        self.db.add(self.task)
        self.db.commit()

    def _set_status(self, status: TaskStatus, error: Optional[str] = None):
        self.task.status = status
        if error:
            self.task.error_message = error
        self.db.add(self.task)
        self.db.commit()

    def _new_execution(self, command: str, label: Optional[str] = None) -> CodingExecution:
        ex = CodingExecution(
            execution_id="ca-ex-" + uuid.uuid4().hex[:12],
            task_id=self.task.id,
            command=command,
            label=label,
            status=ExecutionStatus.RUNNING,
        )
        self.db.add(ex)
        self.db.commit()
        self.db.refresh(ex)
        return ex

    def _finish_execution(self, ex: CodingExecution, res) -> CodingExecution:
        ex.status = ExecutionStatus.COMPLETED if res.ok else ExecutionStatus.FAILED
        ex.stdout = res.stdout
        ex.stderr = res.stderr
        ex.return_code = res.return_code
        ex.duration_ms = res.duration_ms
        ex.completed_at = datetime.utcnow()
        self.db.add(ex)
        self.db.commit()
        self.db.refresh(ex)
        return ex

    def _record_change(self, path: str, change_type: str, diff: Optional[str] = None):
        ch = CodingFileChange(
            change_id="ca-ch-" + uuid.uuid4().hex[:12],
            task_id=self.task.id,
            path=path,
            change_type=change_type,
            diff=diff,
        )
        self.db.add(ch)
        self.db.commit()

    # -- authorization gate ------------------------------------------------

    def _ensure_authorized(self, request: CodingPermissionRequest,
                           decision: Decision = Decision.ALLOW_FOR_TASK) -> bool:
        """If a pending request exists for this task and the policy bucket is
        not auto-approved, block until the user decides via the UI."""
        if request is None:
            return True
        if decision in (Decision.ALLOW_ONCE, Decision.ALLOW_FOR_TASK):
            self._event("permission_resolved", request_id=request.request_id,
                        decision=decision.value)
            decide(self.db, request, decision)
            return True
        if decision == Decision.DENY:
            self._event("permission_denied", request_id=request.request_id)
            decide(self.db, request, decision)
            return False
        return False

    async def _wait_for_decision(self, request: CodingPermissionRequest,
                                 timeout_s: int = 300) -> Decision:
        """Poll the DB until the UI resolves the request (or timeout)."""
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            await asyncio.sleep(0.5)
            refreshed = (
                self.db.query(CodingPermissionRequest)
                .filter(CodingPermissionRequest.request_id == request.request_id)
                .first()
            )
            if refreshed and refreshed.decision != Decision.PENDING:
                return refreshed.decision
        return Decision.DENY

    async def _require(self, request: CodingPermissionRequest,
                       ask: bool = True) -> bool:
        if request is None:
            return True
        self._event("permission_requested", request_id=request.request_id,
                    kind=request.kind.value, detail=request.detail,
                    command=request.command, path=request.path)
        # Pause the task visibly while waiting for the user's decision.
        if self.task.status != TaskStatus.AWAITING_APPROVAL:
            self._set_status(TaskStatus.AWAITING_APPROVAL)
        decision = await self._wait_for_decision(request, timeout_s=300)
        if not decision or decision != Decision.PENDING:
            # Wake back up once a decision has been made.
            self._set_status(TaskStatus.RUNNING)
        return self._ensure_authorized(request, decision)

    # -- execution primitives ----------------------------------------------

    async def run_command(self, command: str, label: Optional[str] = None,
                          needs_approval: bool = False,
                          timeout: Optional[int] = None) -> dict:
        if not command.strip():
            return {"ok": True, "return_code": 0, "stdout": "", "stderr": "", "summary": ""}

        policy = security.CommandPolicy.classify(command)
        if policy == "blocked":
            self._event("blocked_command", command=command)
            raise CodingAgentError(f"Command blocked by policy: {command}")

        needs_approval = needs_approval or security.requires_approval(command)

        if needs_approval:
            request = create_request(
                self.db, self.task, PermissionKind.COMMAND, detail=command, command=command,
            )
            allowed = await self._require(request)
            if not allowed:
                return {"ok": False, "summary": f"Denied: {command}"}

        self._event("command_started", command=command, policy=policy)
        ex = self._new_execution(command, label)
        res = await asyncio.to_thread(self.sandbox.run, command, timeout)
        self._finish_execution(ex, res)
        self._event("command_finished", command=command, execution_id=ex.execution_id,
                    return_code=res.return_code, timed_out=res.timed_out)
        return {
            "ok": res.ok,
            "return_code": res.return_code,
            "stdout": res.stdout,
            "stderr": res.stderr,
            "summary": res.summary(),
            "timed_out": res.timed_out,
            "execution_id": ex.execution_id,
        }

    # ------------------------------------------------------------------
    # Workflows
    # ------------------------------------------------------------------

    async def run_generated_code(self, request_text: str):
        """Workflow 1: quick generated snippet → return text + offer download."""
        from app.engine import OllamaEngine
        engine = OllamaEngine()
        manifest = engine.build_manifest(request_text)
        title = manifest.get("title", "generated-code")
        files = manifest.get("files", {})
        commands = manifest.get("commands", [])
        summary = manifest.get("summary", "")
        self.task.title = title
        self.task.model_used = settings.coding_model
        self.task.engine = engine.name
        self._set_status(TaskStatus.RUNNING)
        self._event("manifest_generated", files=list(files.keys()))
        # Persist as isolated pseudo-workspace for download.
        ws = self.workspace_manager.new_project(title)
        self.ws = ws
        self._write_manifest(files)
        self.task.authorized_root = str(ws.root)
        self.db.add(self.task)
        self.db.commit()
        self._event("workspace_ready", root=str(ws.root))
        # Best-effort validation run.
        for cmd in commands:
            res = await self._run_command_local(cmd)
            if not res["ok"] and not security.requires_approval(cmd):
                # Some commands are just scaffolding; don't hard-fail generation.
                continue
        for path, content in files.items():
            rel = path.lstrip("/")
            self._record_change(rel, "create", diff=None)
        self.task.verdict = Verdict.IMPLEMENTED
        self.task.result_summary = summary or f"Generated {len(files)} file(s) in folder {self.ws.name}."
        self.task.completed_at = datetime.utcnow()
        self._set_status(TaskStatus.COMPLETED)
        self._event("task_completed", verdict=self.task.verdict.value,
                    workspace=ws.name, files=len(files))

    async def _run_command_local(self, command: str, timeout: Optional[int] = None) -> dict:
        if not self.sandbox:
            self.sandbox = Sandbox(str(self.ws.root))
        res = await asyncio.to_thread(self.sandbox.run, command, timeout)
        return {
            "ok": res.ok,
            "return_code": res.return_code,
            "stdout": res.stdout,
            "stderr": res.stderr,
            "summary": res.summary(),
            "timed_out": res.timed_out,
            "command": command,
        }

    async def run_new_project(self, request_text: str, project_name: str,
                              storage_path: str = ""):
        """Workflow 2: create fresh project under a user-chosen (or default) dir,
        run, test, fix, download."""
        from app.engine import OllamaEngine
        self._set_status(TaskStatus.RUNNING)
        parent = Path(storage_path).expanduser().resolve() if storage_path else None
        if parent is not None and not parent.is_dir():
            raise CodingAgentError(f"Storage location does not exist: {storage_path}")
        ws = self.workspace_manager.new_project(project_name or "new-project", parent)
        self.ws = ws
        self.task.authorized_root = str(ws.root)
        self.db.add(self.task)
        self.db.commit()
        self._event("workspace_created", root=str(ws.root), project=ws.name)
        engine = OllamaEngine()
        manifest = engine.build_manifest(
            request_text,
            context={"workspace_tree": ws.tree(), "workspace_files": True},
        )
        files = manifest.get("files", {})
        commands = manifest.get("commands", [])
        self.task.title = manifest.get("title", project_name or ws.name)
        if not files:
            raise CodingAgentError("Model returned no files to create.")
        self._write_manifest(files)
        for rel, content in files.items():
            self._record_change(rel, "create")
        self._event("project_files_written", files=list(files.keys()), count=len(files))
        self.task.status = TaskStatus.RUNNING
        self.db.add(self.task)
        self.db.commit()
        await self._verification_loop(request_text, commands, engine)

    async def run_existing_project(self, request_text: str, folder_name: str,
                                   folder_path: str = ""):
        """Workflow 3: edit an existing local project with permission.
        folder_name is a quick subfolder under the coding root (legacy path);
        folder_path is an absolute folder the user picked in the UI browser."""
        from app.engine import OllamaEngine
        self._set_status(TaskStatus.RUNNING)
        if folder_path:
            ws = self.workspace_manager.open_anywhere(folder_path)
        else:
            ws = self.workspace_manager.existing(folder_name)
        self.ws = ws
        self.task.authorized_root = str(ws.root)
        self.task.is_git = (ws.root / ".git").exists()
        self.db.add(self.task)
        self.db.commit()
        tree = ws.tree()
        self._event("workspace_opened", root=str(ws.root), project=ws.name,
                    branch=ws.git_status()["branch"])
        engine = OllamaEngine()
        manifest = engine.build_manifest(
            request_text,
            context={"workspace_tree": tree, "workspace_files": True},
        )
        files = manifest.get("files", {})
        commands = manifest.get("commands", [])
        if not files:
            raise CodingAgentError("Model returned no file changes to apply.")
        # Diff-before for existing files.
        before = ws.git_status()
        self._apply_file_edits(files)
        self._record_changes_for_existing(files, before)
        self._event("edits_applied", files=list(files.keys()), count=len(files))
        await self._verification_loop(request_text, commands, engine)

    # -- shared internals --------------------------------------------------

    def _write_manifest(self, files: dict):
        written = []
        for rel, content in files.items():
            rel = rel.lstrip("/")
            target, rel_of = security.safe_relative_path(self.ws.root, rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            content_str = content if isinstance(content, str) else json.dumps(content)
            target.write_text(content_str, encoding="utf-8")
            written.append(rel)
        self._event("files_written", count=len(files), files=written)

    def _apply_file_edits(self, files: dict):
        self._write_manifest(files)

    def _record_changes_for_existing(self, files: dict, before: dict):
        after = self.ws.git_status()
        before_changes = before.get("changes") or ""
        # compute per-file diff via git diff -- <path>
        for rel in files.keys():
            rel_clean = rel.lstrip("/")
            diff_proc = self.ws.run_git(["diff", "--", rel_clean])
            diff_txt = diff_proc.stdout
            self._record_change(rel_clean, "modify", diff=diff_txt or None)

    async def _verification_loop(self, request_text: str, commands: list,
                                 engine):
        """Run the manifest's test commands; on failure, repair up to the cap."""
        attempts = 0
        prev_failure = ""
        while True:
            if not commands:
                self.task.verdict = Verdict.IMPLEMENTED
                self.task.result_summary = "Project created; no verification commands were provided."
                self._set_status(TaskStatus.COMPLETED)
                self.task.completed_at = datetime.utcnow()
                self.db.add(self.task)
                self.db.commit()
                self._event("task_completed", verdict=self.task.verdict.value)
                return

            self._event("verification_started", attempt=attempts + 1)
            all_ok = True
            results = []
            for cmd in commands:
                if security.requires_approval(cmd):
                    request = create_request(
                        self.db, self.task, PermissionKind.COMMAND,
                        detail=cmd, command=cmd,
                    )
                    allowed = await self._require(request)
                    if not allowed:
                        self._event("verification_skipped", command=cmd)
                        continue
                res = await self._run_command_local(cmd)
                results.append(res)
                self._event("verification_result", command=cmd,
                            ok=res["ok"], return_code=res["return_code"],
                            stdout=(res["stdout"] or "")[-300:])
                if not res["ok"]:
                    all_ok = False
                    break
            if all_ok:
                # record test results
                for res in results:
                    tr = CodingTestResult(
                        result_id="ca-tr-" + uuid.uuid4().hex[:12],
                        task_id=self.task.id,
                        command=res.get("command", "") or res.get("summary", ""),
                        passed=True,
                        stdout=(res.get("stdout") or "")[-2000:],
                        return_code=res.get("return_code"),
                        attempt=attempts + 1,
                    )
                    self.db.add(tr)
                self.db.commit()
                self.task.verdict = Verdict.TESTED
                self.task.result_summary = f"All {len(commands)} verification command(s) passed."
                self.task.completed_at = datetime.utcnow()
                self._set_status(TaskStatus.COMPLETED)
                self._event("task_completed", verdict=self.task.verdict.value,
                            attempts=attempts + 1)
                return

            # --- failure path: repair up to cap
            self.task.repair_attempts = attempts + 1
            self.db.add(self.task)
            self.db.commit()
            fingerprint = "|".join(
                f"{r.get('command')}|{r.get('return_code')}|{(r.get('stderr') or '')[-240:]}"
                for r in results if not r.get("ok")
            ).strip()
            # Fail fast when the exact same failure repeats even though the
            # (now context-aware) repair changed files: further model rebuilds
            # will only burn time re-loops, never succeed.
            if prev_failure and fingerprint == prev_failure:
                self.task.verdict = Verdict.FAILED
                self.task.result_summary = (
                    "Identical failure repeated after repair — the code model "
                    "could not produce a consistent implementation. "
                )
                self._set_status(TaskStatus.FAILED)
                self._event("task_failed", attempts=attempts + 1,
                            reason="identical_repeat")
                self._persist_failure_results(results, attempts + 1)
                return
            prev_failure = fingerprint or prev_failure
            if attempts + 1 >= settings.max_repair_attempts:
                self.task.verdict = Verdict.FAILED
                self.task.result_summary = (
                    f"Exceeded {settings.max_repair_attempts} repair attempts. "
                    "Last failure attached to test results."
                )
                self._set_status(TaskStatus.FAILED)
                self._event("task_failed", attempts=attempts + 1)
                self._persist_failure_results(results, attempts + 1)
                return
            self._event("repair_started", attempt=attempts + 1)
            error_text = "\n\n".join(r["summary"] for r in results if not r["ok"])
            # Deterministic fixer for the common "NameError: name X is not
            # defined" bug: injects the missing import based on the traceback +
            # workspace definitions, so a weak model repair can't loop uselessly.
            patched = self._deterministic_nameerror_patch(results)
            if patched:
                self._event("repair_files_written", files=patched)
            else:
                # Give the model the CURRENT workspace tree + file contents so
                # the repair fixes the actual root cause instead of guessing.
                repair_ctx: dict = {}
                try:
                    contents: list = []
                    total = 0
                    for item in self.ws.list_files(max_depth=4)[:12]:
                        if total > 16000:
                            break
                        try:
                            text = self.ws.read_file(item["path"])
                        except Exception:
                            continue
                        if not text or "\x00" in text:
                            continue
                        snippet = text[:4000]
                        contents.append(f"=== {item['path']} ===\n{snippet}")
                        total += len(snippet)
                    repair_ctx = {
                        "workspace_tree": self.ws.tree(),
                        "workspace_files": True,
                        "workspace_contents": "\n\n".join(contents),
                    }
                except Exception:
                    repair_ctx = {}
                repair = engine.repair(request_text, error_text,
                                       context=repair_ctx or None,
                                       on_event=lambda m: self._event("engine_message", message=m))
                fix_files = repair.get("files", {})
                if fix_files:
                    self._apply_file_edits(fix_files)
                    for rel in fix_files.keys():
                        self._record_change(rel.lstrip("/"), "modify",
                                            diff=self.ws.run_git(["diff", "--", rel.lstrip("/")]).stdout or None)
                    self._event("repair_files_written", files=list(fix_files.keys()))
                else:
                    self._event("repair_no_files", detail=repair)
            attempts += 1

    def _deterministic_nameerror_patch(self, results: list) -> Optional[list]:
        """Best-effort deterministic fix for NameError import bugs, independent
        of model quality. Returns the patched file paths or None if it cannot
        help (so the model repair path still runs for other failures).
        """
        try:
            stderr = "\n".join(
                (r.get("stderr") or "") or (r.get("summary") or "")
                for r in results if not r.get("ok")
            )
            file_match = re.search(r'File "([^"]+\.py)", line \d+', stderr)
            name_match = re.search(
                r"NameError:\s*name\s+'(\w+)' is not defined", stderr)
            if not file_match or not name_match:
                return None
            bad_path = Path(file_match.group(1))
            bad_name = name_match.group(1)
            root = Path(self.ws.root)
            try:
                rel = bad_path.resolve().relative_to(root.resolve())
            except ValueError:
                return None
            target = root / rel
            if not target.exists():
                return None
            # Find the workspace module that defines the missing name.
            defining_file = None
            for item in self.ws.list_files(max_depth=4):
                p = root / item["path"]
                try:
                    if p.resolve() == target.resolve():
                        continue
                    head = p.read_text(encoding="utf-8", errors="ignore")[:4000]
                except OSError:
                    continue
                if (re.search(rf"^(class|def)\s+{re.escape(bad_name)}\b", head, re.M)
                        or re.search(rf"^{re.escape(bad_name)}\s*=", head, re.M)):
                    defining_file = item["path"]
                    break
            if not defining_file:
                return None
            module = Path(defining_file).stem
            source = target.read_text(encoding="utf-8", errors="ignore")
            # Already imported somewhere in the failing file -> nothing to add.
            if re.search(
                    rf"^\s*from\s+{re.escape(module)}\s+import\b[^\n]*\b{re.escape(bad_name)}\b",
                    source, re.M):
                return None
            line = f"from {module} import {bad_name}"
            lines = source.splitlines()
            insert_at = 0
            for i, ln in enumerate(lines):
                if ln.lstrip().startswith("import ") or ln.lstrip().startswith("from "):
                    insert_at = i + 1
            lines.insert(insert_at if insert_at <= len(lines) else len(lines), line)
            target.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
            try:
                diff = self.ws.run_git(["diff", "--", str(rel)]).stdout or None
            except Exception:
                diff = None
            self._record_change(str(rel), "modify", diff=diff)
            return [str(rel)]
        except Exception:
            return None

    def _persist_failure_results(self, results: list, attempt: int):
        for res in results:
            tr = CodingTestResult(
                result_id="ca-tr-" + uuid.uuid4().hex[:12],
                task_id=self.task.id,
                command=(res.get("stdout") or "")[:400] or res.get("summary", "")[:200],
                passed=False,
                stdout=(res.get("stderr") or res.get("stdout") or "")[-2000:],
                return_code=res.get("return_code"),
                attempt=attempt,
            )
            self.db.add(tr)
        self.db.commit()

    async def ai_fix(self, error_text: str) -> dict:
        """User-invoked repair: inspect the CURRENT (possibly user-edited) files
        plus the runtime error, ask the model for a minimal fix, apply it to the
        workspace, record the exact diffs, and return the changes so the caller
        can re-run the project to verify the fix.
        """
        from app.engine import OllamaEngine
        ws = self.ws
        if ws is None and self.task.authorized_root:
            ws = Workspace(Path(self.task.authorized_root))
        if ws is None or not ws.root.exists():
            raise CodingAgentError("No workspace for this task.")
        self.ws = ws
        ws.init_git_if_absent()

        self._event("fix_started", attempt=self.task.repair_attempts + 1)

        # Read the current source contents so the model inspects the actual
        # edited files, not the pre-edit state.
        contents: list = []
        total = 0
        for item in ws.list_files(max_depth=4)[:12]:
            if total > 16000:
                break
            try:
                text = ws.read_file(item["path"])
            except WorkspaceError:
                continue
            if not text or "\x00" in text:
                continue
            snippet = text[:4000]
            contents.append(f"=== {item['path']} ===\n{snippet}")
            total += len(snippet)

        engine = OllamaEngine()
        repair = engine.repair(
            self.task.request or "Fix the failing code.",
            error_text,
            context={
                "workspace_tree": ws.tree(),
                "workspace_files": True,
                "workspace_contents": "\n\n".join(contents),
            },
            on_event=lambda m: self._event("engine_message", message=m),
        )
        fix_files = repair.get("files", {})
        if not fix_files:
            raise CodingAgentError(
                "Model could not suggest a fix. Try rephrasing or fixing manually."
            )
        self._write_manifest(fix_files)
        changes = []
        for rel in fix_files.keys():
            rel_clean = rel.lstrip("/")
            diff = ws.run_git(["diff", "--", rel_clean]).stdout or None
            if not diff:
                # Untracked/recreated file — no git baseline, mark as modified.
                diff = None
            self._record_change(rel_clean, "modify", diff=diff)
            changes.append({"path": rel_clean, "change_type": "modify", "diff": diff})
        self.task.repair_attempts = (self.task.repair_attempts or 0) + 1
        self.db.add(self.task)
        self.db.commit()
        self._event("fix_applied", files=list(fix_files.keys()), count=len(fix_files))
        return {"changes": changes}

    # -- zip export --------------------------------------------------------

    def produce_zip(self, out_bytes: Optional[bytes] = None) -> bytes:
        ws = self.ws
        if ws is None and self.task.authorized_root:
            ws = Workspace(Path(self.task.authorized_root))
        if ws is None or not ws.root.exists():
            raise CodingAgentError("No workspace for this task.")
        buf = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        try:
            with zipfile.ZipFile(buf.name, "w", zipfile.ZIP_DEFLATED) as z:
                for path in sorted(ws.root.rglob("*")):
                    if path.is_dir():
                        continue
                    if any(part in (".git", "__pycache__", ".pytest_cache", ".venv")
                           for part in path.relative_to(ws.root).parts):
                        continue
                    z.write(path, path.relative_to(ws.root).as_posix())
            buf.close()
            data = Path(buf.name).read_bytes()
            return data
        finally:
            Path(buf.name).unlink(missing_ok=True)


def new_task_id() -> str:
    return "ca-" + uuid.uuid4().hex[:12]