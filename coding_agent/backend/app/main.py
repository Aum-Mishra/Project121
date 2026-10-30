"""Isolated Coding Agent — FastAPI application and routes."""
import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import db as dbmod
from app.config import settings
from app.db import (
    get_db, init_db, CodingTask, CodingPermissionRequest, CodingTestResult,
    CodingFileChange, CodingSession, TaskType, TaskStatus, Decision, PermissionKind,
)
from app.permission import create_request, get_pending, decide, resolve_all_for_task
from app.supervisor import Supervisor, new_task_id, CodingAgentError
from app.workspace import WorkspaceManager, WorkspaceError, Workspace
from app.events import hub
from app.engine_openhands import OpenHandsEngine
from app.ollama_client import list_models as ollama_list_models
from app import security
from app.runner import runner, ProjectRunError

app = FastAPI(title="Coding Agent (isolated)", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    session_id: Optional[str] = None


class GeneratedRequest(ChatMessage):
    title: Optional[str] = None


class NewProjectRequest(ChatMessage):
    project_name: Optional[str] = None
    storage_path: Optional[str] = None


class ExistingProjectRequest(ChatMessage):
    folder_name: str = ""
    folder_path: Optional[str] = None


class DecisionRequest(BaseModel):
    decision: str  # ALLOW_ONCE | ALLOW_FOR_TASK | DENY


class FolderSelect(BaseModel):
    folder_name: str


class SessionCreate(BaseModel):
    title: Optional[str] = None
    mode: Optional[str] = "generate"
    project_name: Optional[str] = None
    folder_name: Optional[str] = None
    folder_path: Optional[str] = None
    storage_path: Optional[str] = None


class SessionMessage(BaseModel):
    role: str  # user | agent
    text: str
    when: Optional[str] = None


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
def _startup():
    init_db()


@app.get("/api/health")
def health():
    from app import llm_provider
    try:
        meta = llm_provider.status()
        extra = {k: meta.get(k) for k in ("mode", "provider", "provider_label", "model")}
    except Exception:  # noqa: BLE001
        extra = {}
    return {"status": "healthy", "service": "coding-agent",
            "environment": "isolated", **extra}


# ---------------------------------------------------------------------------
# Models / workspaces
# ---------------------------------------------------------------------------

@app.get("/api/models")
def models():
    from app import llm_provider
    meta = llm_provider.status()
    try:
        return {**meta, "models": ollama_list_models(),
                "coding_model": settings.coding_model}
    except Exception as e:  # noqa: BLE001
        return {**meta, "models": [], "coding_model": settings.coding_model,
                "error": str(e)}


@app.get("/api/ai/status")
def ai_status():
    from app import llm_provider
    return llm_provider.status()


@app.get("/api/workspaces")
def list_workspaces(db: Session = Depends(get_db)):
    wm = WorkspaceManager()
    return {"workspaces": wm.list_projects()}


@app.post("/api/workspaces")
def create_workspace(payload: FolderSelect, db: Session = Depends(get_db)):
    wm = WorkspaceManager()
    try:
        ws = wm.create_folder(payload.folder_name)
        return {"ok": True, "workspace": {"name": ws.name, "path": str(ws.root)}}
    except WorkspaceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/workspaces/inspect")
def inspect_folder(payload: FolderSelect, db: Session = Depends(get_db)):
    wm = WorkspaceManager()
    try:
        ws = wm.existing(payload.folder_name)
        return {
            "ok": True,
            "workspace": {"name": ws.name, "path": str(ws.root)},
            "tree": ws.tree(),
            "files": ws.list_files(),
            "git": ws.git_status(),
        }
    except WorkspaceError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Folder browser (read-only) for picking any local folder
# ---------------------------------------------------------------------------

_IGNORE_DIRS = {"proc", "sys", "dev", "run", "snap", ".cache", "__pycache__",
                "node_modules", ".venv", ".git", "venv", "tmp"}


@app.get("/api/folders/browse")
def browse_folders(path: Optional[str] = None, db: Session = Depends(get_db)):
    """List a directory's entries so the user can navigate and pick a folder."""
    import os as _os
    raw = (path or "").strip() or str(Path.home())
    target = Path(raw).expanduser().resolve()
    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {raw}")
    try:
        entries = []
        with _os.scandir(target) as it:
            for ent in it:
                name = ent.name
                if name.startswith("."):
                    continue
                try:
                    is_dir = ent.is_dir(follow_symlinks=True)
                except OSError:
                    continue
                if not is_dir and name in _IGNORE_DIRS:
                    continue
                try:
                    size = ent.stat(follow_symlinks=True).st_size if not is_dir else 0
                except OSError:
                    size = 0
                entries.append({
                    "name": name,
                    "path": str(Path(ent.path).resolve()),
                    "is_dir": is_dir,
                    "size": size,
                })
                if len(entries) >= 300:
                    break
    except PermissionError:
        raise HTTPException(status_code=400, detail=f"No permission to read {target}")
    entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
    parent = str(target.parent) if target != target.parent else None
    return {
        "path": str(target),
        "name": target.name or str(target),
        "parent": parent,
        "home": str(Path.home()),
        "entries": entries,
    }


# ---------------------------------------------------------------------------
# Sessions (persistent conversation + workspace state)
# ---------------------------------------------------------------------------

def _new_session_id() -> str:
    return "cs-" + uuid.uuid4().hex[:12]


@app.post("/api/sessions")
def create_session(payload: SessionCreate, db: Session = Depends(get_db)):
    sid = _new_session_id()
    s = CodingSession(
        session_id=sid,
        title=payload.title or "Coding session",
        mode=payload.mode or "generate",
        project_name=payload.project_name,
        folder_name=payload.folder_name,
        folder_path=payload.folder_path,
        storage_path=payload.storage_path,
        chat=[],
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"session": _session_summary(s)}


@app.get("/api/sessions")
def list_sessions(db: Session = Depends(get_db)):
    sessions = db.query(CodingSession).order_by(
        CodingSession.updated_at.desc()).limit(100).all()
    return {"sessions": [_session_summary(s) for s in sessions]}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    s = db.query(CodingSession).filter(CodingSession.session_id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    tasks = (db.query(CodingTask)
             .filter(CodingTask.session_id == session_id)
             .order_by(CodingTask.created_at.asc()).all())
    latest = tasks[-1] if tasks else None
    return {
        "session": _session_summary(s),
        "chat": s.chat or [],
        "tasks": [_task_summary(t) for t in tasks],
        "task": _task_detail(latest) if latest else None,
    }


@app.post("/api/sessions/{session_id}/messages")
def append_session_message(session_id: str, payload: SessionMessage,
                           db: Session = Depends(get_db)):
    s = db.query(CodingSession).filter(CodingSession.session_id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    chat = list(s.chat or [])
    chat.append({
        "role": payload.role if payload.role in ("user", "agent") else "agent",
        "text": payload.text,
        "when": payload.when or datetime.utcnow().isoformat(),
    })
    s.chat = chat
    s.updated_at = datetime.utcnow()
    db.add(s)
    db.commit()
    return {"chat": s.chat}


class RenameRequest(BaseModel):
    title: str


@app.post("/api/sessions/{session_id}/rename")
def rename_session(session_id: str, payload: RenameRequest,
                   db: Session = Depends(get_db)):
    s = db.query(CodingSession).filter(CodingSession.session_id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    s.title = title
    s.updated_at = datetime.utcnow()
    db.add(s)
    db.commit()
    return {"session": _session_summary(s)}


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)):
    s = db.query(CodingSession).filter(CodingSession.session_id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    # Remove the session and its orphan tasks. Workspace folders are kept on
    # disk (they may be reused by other sessions), only DB state is deleted.
    db.query(CodingTask).filter(CodingTask.session_id == session_id).delete()
    db.delete(s)
    db.commit()
    return {"ok": True, "session_id": session_id}


# ---------------------------------------------------------------------------
# Engine control (OpenHands probe endpoint for diagnostics)
# ---------------------------------------------------------------------------

class OpenHandsProbe(BaseModel):
    message: str


@app.post("/api/engine/openhands/probe")
async def probe_openhands(payload: OpenHandsProbe, db: Session = Depends(get_db)):
    return await _run_openhands_turn(payload.message, start="")


async def _run_openhands_turn(message: str, start: str):
    """Utility: run one OpenHands turn against the local Qwen and return the
    markdown transcript. Used for the diagnostics probe (and future engine)."""
    get_project_dir = Path(settings.coding_root_dir) / ".oh_probe"
    get_project_dir.mkdir(parents=True, exist_ok=True)
    loop = asyncio.get_running_loop()

    def _worker():
        from app.engine_openhands import OpenHandsEngine
        eng = OpenHandsEngine()
        eng.start(str(get_project_dir), max_iterations=30,
                  delete_on_close=True)
        eng.send_message(message)
        try:
            eng._run_blocking(timeout_s=settings.openhands_timeout_s)
        finally:
            eng.close()
        return eng.transcript_markdown() or "(no transcript)"

    try:
        md = await loop.run_in_executor(None, _worker)
        return {"ok": True, "transcript": md}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

@app.post("/api/tasks/generate")
async def create_generated(payload: GeneratedRequest):
    return await _start_task(TaskType.GENERATED_CODE, payload.title or "Generated code",
                             payload.message, session_id=payload.session_id)

@app.post("/api/tasks/new-project")
async def create_new_project(payload: NewProjectRequest):
    return await _start_task(TaskType.NEW_PROJECT, payload.project_name or "New project",
                             payload.message, project_name=payload.project_name or "",
                             storage_path=payload.storage_path or "",
                             session_id=payload.session_id)

@app.post("/api/tasks/existing-project")
async def create_existing_project(payload: ExistingProjectRequest):
    return await _start_task(TaskType.EXISTING_PROJECT, payload.folder_name or "Existing project",
                             payload.message, folder_name=payload.folder_name or "",
                             folder_path=payload.folder_path or "",
                             session_id=payload.session_id)


async def _start_task(task_type: TaskType, title: str, message: str,
                     project_name: str = "", folder_name: str = "",
                     folder_path: str = "", storage_path: str = "",
                     session_id: Optional[str] = None):
    """Create the task row, then run the supervisor in a background task that
    manages its OWN SQLAlchemy session (the request session closes on return)."""
    task_id = new_task_id()
    db = dbmod.SessionLocal()
    try:
        task = CodingTask(
            task_id=task_id,
            company_id=settings.seed_company_id,
            user_id=settings.seed_user_id,
            session_id=session_id,
            task_type=task_type,
            title=title,
            request=message,
            status=TaskStatus.RUNNING,
            model_used=settings.coding_model,
            messages=[{"role": "user", "text": message,
                       "when": datetime.utcnow().isoformat()}],
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        if session_id:
            sess = db.query(CodingSession).filter(
                CodingSession.session_id == session_id).first()
            if sess:
                sess.updated_at = datetime.utcnow()
                db.add(sess)
                db.commit()
    finally:
        db.close()

    async def _guard(task_id, coro, session):
        try:
            await coro
        except Exception as e:  # noqa: BLE001
            task = session.query(CodingTask).filter(CodingTask.task_id == task_id).first()
            if task:
                task.status = TaskStatus.FAILED
                task.error_message = str(e)
                session.add(task)
                session.commit()
            hub.publish(task_id, {"kind": "task_error", "error": str(e)})
        finally:
            session.close()

    async def _runner(task_id, coro_factory):
        session = dbmod.SessionLocal()
        try:
            task = session.query(CodingTask).filter(CodingTask.task_id == task_id).first()
            emit = lambda ev: hub.publish(task_id, ev)  # noqa: E731
            sup = Supervisor(task, session, emit)
            coro = coro_factory(sup)
            await _guard(task_id, coro, session)
        except Exception:  # noqa: BLE001
            session.close()

    factory = {
        TaskType.GENERATED_CODE: lambda s: s.run_generated_code(message),
        TaskType.NEW_PROJECT: lambda s: s.run_new_project(message, project_name, storage_path),
        TaskType.EXISTING_PROJECT: lambda s: s.run_existing_project(message, folder_name, folder_path),
    }[task_type]
    asyncio.ensure_future(_runner(task_id, factory))
    return {"task_id": task_id}


def fire_and_forget(task_id: str, coro):
    """Schedule the supervisor coroutine without awaiting it here."""
    task = asyncio.ensure_future(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


_background_tasks = set()


@app.get("/api/tasks")
def list_tasks(db: Session = Depends(get_db)):
    tasks = db.query(CodingTask).order_by(CodingTask.created_at.desc()).limit(50).all()
    return {"tasks": [_task_summary(t) for t in tasks]}


@app.get("/api/tasks/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    return _task_detail(task)


@app.get("/api/tasks/{task_id}/events")
async def task_events(task_id: str, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    replay = list(task.events or [])
    q = hub.subscribe(task_id)
    return StreamingResponse(
        hub.stream(task_id, q, replay),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/tasks/{task_id}/approve")
def approve(task_id: str, payload: DecisionRequest, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    decision = _parse_decision(payload.decision)
    req = get_pending(db, task)
    if not req:
        raise HTTPException(status_code=404, detail="No pending permission request")
    decide(db, req, decision)
    hub.publish(task_id, {"kind": "permission_decided", "request_id": req.request_id,
                          "decision": decision.value})
    return {"ok": True, "decision": decision.value}


@app.post("/api/tasks/{task_id}/approve-all")
def approve_all(task_id: str, payload: DecisionRequest, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    decision = _parse_decision(payload.decision)
    resolve_all_for_task(db, task, decision)
    hub.publish(task_id, {"kind": "permission_batch_decided", "decision": decision.value})
    return {"ok": True, "decision": decision.value}


@app.post("/api/tasks/{task_id}/cancel")
def cancel(task_id: str, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    task.status = TaskStatus.CANCELLED
    task.completed_at = datetime.utcnow()
    db.add(task)
    db.commit()
    hub.publish(task_id, {"kind": "task_cancelled"})
    return {"ok": True}


@app.get("/api/tasks/{task_id}/files")
def task_files(task_id: str, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    if not task.authorized_root:
        return {"files": []}
    ws = Workspace(Path(task.authorized_root))
    return {"files": ws.list_files(), "changes": task.file_changes}


@app.get("/api/tasks/{task_id}/file")
def task_file(task_id: str, path: str, db: Session = Depends(get_db)):
    """Live code view: read a single workspace file's current contents."""
    task = _find_task(task_id, db)
    if not task.authorized_root:
        raise HTTPException(status_code=404, detail="No workspace for this task")
    ws = Workspace(Path(task.authorized_root))
    try:
        content = ws.read_file(path)
    except WorkspaceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"path": path, "content": content}


class SaveFileRequest(BaseModel):
    path: str
    content: str


@app.put("/api/tasks/{task_id}/file")
def save_task_file(task_id: str, payload: SaveFileRequest,
                   db: Session = Depends(get_db)):
    """Live code editor: persist the user's edits directly to the authorized
    workspace folder."""
    task = _find_task(task_id, db)
    if not task.authorized_root:
        raise HTTPException(status_code=404, detail="No workspace for this task")
    ws = Workspace(Path(task.authorized_root))
    if not payload.path:
        raise HTTPException(status_code=400, detail="Missing file path")
    try:
        rel = payload.path.lstrip("/")
        rooted, rel_safe = security.safe_relative_path(ws.root, rel)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    rooted.parent.mkdir(parents=True, exist_ok=True)
    try:
        rooted.write_text(payload.content or "", encoding="utf-8")
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Cannot write file: {e}")
    return {"ok": True, "path": rel_safe, "size": rooted.stat().st_size}


@app.get("/api/tasks/{task_id}/tree")
def task_tree(task_id: str, db: Session = Depends(get_db)):
    """Nested, fully-expandable project tree for the file explorer."""
    task = _find_task(task_id, db)
    if not task.authorized_root:
        raise HTTPException(status_code=404, detail="No workspace for this task")
    ws = Workspace(Path(task.authorized_root))
    return {
        "root": str(ws.root),
        "tree": ws.tree_obj(),
        "files": ws.list_files(),
        "git": ws.git_status(),
    }


@app.get("/api/tasks/{task_id}/diff")
def task_diff(task_id: str, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    changes = [{"path": c.path, "change_type": c.change_type,
                "diff": c.diff} for c in (task.file_changes or [])]
    return {"changes": changes}


@app.get("/api/tasks/{task_id}/tests")
def task_tests(task_id: str, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    results = [
        {"command": t.command, "passed": t.passed, "stdout": t.stdout,
         "return_code": t.return_code, "attempt": t.attempt}
        for t in (task.test_results or [])
    ]
    return {"results": results}


@app.get("/api/tasks/{task_id}/download")
def task_download(task_id: str, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    sup = Supervisor(task, db, lambda e: None)
    try:
        data = sup.produce_zip()
    except CodingAgentError as e:
        raise HTTPException(status_code=404, detail=str(e))
    filename = f"{task.title or task.task_id}.zip".replace(" ", "_")
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/tasks/{task_id}/executions")
def task_executions(task_id: str, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    return {"executions": [
        {"execution_id": e.execution_id, "command": e.command, "label": e.label,
         "status": e.status.value if e.status else None,
         "return_code": e.return_code, "duration_ms": e.duration_ms,
         "stdout": e.stdout, "stderr": e.stderr}
        for e in (task.executions or [])
    ]}


class RunInputRequest(BaseModel):
    text: str


@app.get("/api/tasks/{task_id}/run/detect")
def task_run_detect(task_id: str, db: Session = Depends(get_db)):
    """Detect the project type + runnable command without starting anything."""
    task = _find_task(task_id, db)
    if not task.authorized_root:
        raise HTTPException(status_code=404, detail="No workspace for this task")
    target = runner.detect_project(task.authorized_root)
    return {
        "ok": bool(target.command),
        "command": target.command,
        "label": target.label,
        "kind": target.kind,
        "urls": target.urls,
        "root": task.authorized_root,
    }


@app.post("/api/tasks/{task_id}/run")
async def task_run(task_id: str, db: Session = Depends(get_db)):
    """Start (or re-attach to) the running project. Never duplicates an already
    live process for the same workspace+command."""
    task = _find_task(task_id, db)
    if not task.authorized_root:
        raise HTTPException(status_code=404, detail="No workspace for this task")
    runner.prune()
    try:
        state = await runner.start(task.authorized_root)
    except ProjectRunError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"run": runner.snapshot(state.run_id)}


@app.get("/api/tasks/{task_id}/run/status")
def task_run_status(task_id: str, db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    if not task.authorized_root:
        raise HTTPException(status_code=404, detail="No workspace for this task")
    runs = []
    for run_id, state in runner._runs.items():  # noqa: SLF001
        if Path(state.root) == Path(task.authorized_root):
            runs.append(runner.snapshot(run_id))
    runs.sort(key=lambda r: r.get("started_at") or "", reverse=True)
    return {"runs": runs[:5]}


@app.get("/api/tasks/{task_id}/run/{run_id}/logs")
async def task_run_logs(task_id: str, run_id: str, db: Session = Depends(get_db)):
    """SSE stream of the live runtime output for a running project."""
    state = runner.get(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found")
    q = runner.subscribe(run_id)

    async def _stream():
        yield "event: connected\ndata: {}\n\n"
        try:
            for ev in state.logs:
                yield f"data: {json.dumps(ev)}\n\n"
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=20)
                    yield f"data: {json.dumps(ev)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            runner.unsubscribe(run_id, q)

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/tasks/{task_id}/run/{run_id}/input")
async def task_run_input(task_id: str, run_id: str, payload: RunInputRequest,
                         db: Session = Depends(get_db)):
    """Send stdin to a running single-file script (interactive input)."""
    state = runner.get(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found")
    ok = await runner.send_input(run_id, payload.text)
    if not ok:
        raise HTTPException(status_code=400, detail="Process is not accepting input")
    return {"ok": True}


@app.post("/api/tasks/{task_id}/run/{run_id}/stop")
async def task_run_stop(task_id: str, run_id: str,
                        db: Session = Depends(get_db)):
    task = _find_task(task_id, db)
    if not task.authorized_root:
        raise HTTPException(status_code=404, detail="No workspace for this task")
    stopped = await runner.stop(run_id)
    return {"ok": stopped}


class AiFixRequest(BaseModel):
    error: str = ""


@app.post("/api/tasks/{task_id}/ai-fix")
async def task_ai_fix(task_id: str, payload: AiFixRequest,
                      db: Session = Depends(get_db)):
    """AI fix for a user-edited project: the agent inspects the CURRENT files +
    the runtime error, applies a minimal fix, records diffs, then re-runs the
    project so the UI can verify the fix live."""
    task = _find_task(task_id, db)
    if not task.authorized_root:
        raise HTTPException(status_code=404, detail="No workspace for this task")

    def emit(ev: dict):
        hub.publish(task_id, ev)

    sup = Supervisor(task, db, emit)
    try:
        result = await sup.ai_fix(payload.error or "The project failed to run.")
    except CodingAgentError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Kick off a fresh run so the fix is verified immediately.
    try:
        state = await runner.start(task.authorized_root)
        run = runner.snapshot(state.run_id)
    except ProjectRunError as e:
        run = None
        error = str(e)
        return {"ok": True, "changes": result["changes"], "run": None,
                "run_error": error}
    return {"ok": True, "changes": result["changes"], "run": run}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_task(task_id: str, db: Session) -> CodingTask:
    task = db.query(CodingTask).filter(CodingTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _parse_decision(value: str) -> Decision:
    value = value.upper()
    if value == "ALLOW_ONCE":
        return Decision.ALLOW_ONCE
    if value == "ALLOW_FOR_TASK":
        return Decision.ALLOW_FOR_TASK
    return Decision.DENY


def _task_summary(t: CodingTask) -> dict:
    return {
        "task_id": t.task_id,
        "title": t.title,
        "task_type": t.task_type.value,
        "status": t.status.value,
        "verdict": t.verdict.value if t.verdict else None,
        "engine": t.engine,
        "session_id": t.session_id,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "error_message": t.error_message,
        "result_summary": t.result_summary,
    }


def _task_detail(t: CodingTask) -> dict:
    d = _task_summary(t)
    d["request"] = t.request
    d["authorized_root"] = t.authorized_root
    d["repair_attempts"] = t.repair_attempts
    d["events"] = t.events or []
    d["messages"] = t.messages or []
    d["permission_requests"] = [
        {"request_id": p.request_id, "kind": p.kind.value, "detail": p.detail,
         "command": p.command, "path": p.path,
         "decision": p.decision.value if p.decision else None,
         "created_at": p.created_at.isoformat() if p.created_at else None}
        for p in (t.permission_requests or [])
    ]
    d["executions"] = [
        {"execution_id": e.execution_id, "command": e.command, "label": e.label,
         "status": e.status.value if e.status else None,
         "return_code": e.return_code, "duration_ms": e.duration_ms}
        for e in (t.executions or [])
    ]
    d["file_changes"] = [
        {"path": c.path, "change_type": c.change_type, "diff": c.diff}
        for c in (t.file_changes or [])
    ]
    d["test_results"] = [
        {"command": tr.command, "passed": tr.passed, "stdout": tr.stdout,
         "return_code": tr.return_code, "attempt": tr.attempt}
        for tr in (t.test_results or [])
    ]
    return d


def _session_summary(s: CodingSession) -> dict:
    return {
        "session_id": s.session_id,
        "title": s.title,
        "mode": s.mode,
        "project_name": s.project_name,
        "folder_name": s.folder_name,
        "folder_path": s.folder_path,
        "storage_path": s.storage_path,
        "chat_count": len(s.chat or []),
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }