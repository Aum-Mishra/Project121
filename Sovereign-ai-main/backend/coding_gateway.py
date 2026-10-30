"""HTTP gateway to the isolated Coding Agent service.

The chat coding phase drives the real `coding_agent` backend (own process, own
venv with `openhands`) over its REST/SSE API instead of re-implementing a
supervisor in-process. This module handles:
  * service lifecycle - health check, detached spawn if it is not running,
  * session/task creation bound to a chat conversation,
  * SSE event collection + polling + chat-context auto approval,
  * zip artifact download and registration,
  * conversation -> workspace binding so follow-ups edit the SAME project.
"""
import asyncio
import json
import os
import re
import subprocess
import time
from pathlib import Path

import httpx

from .config import (CA_CHAT_AUTO_APPROVE, CODING_AGENT_BACKEND_DIR,
                     CODING_AGENT_PYTHON, CODING_AGENT_URL,
                     CODE_PROJECTS_PATH, ARTIFACT_STORAGE_PATH)

_SLUG_RE = re.compile(r'[^a-z0-9]+')
_HTTP = None


def ca_url(path: str) -> str:
    return CODING_AGENT_URL.rstrip("/") + path


def _http() -> httpx.Client:
    global _HTTP
    if _HTTP is None:
        _HTTP = httpx.Client(timeout=httpx.Timeout(connect=5, read=60, write=30, pool=10))
    return _HTTP


def _get(path: str):
    r = _http().get(ca_url(path))
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def _poll(path: str, read_s: float = 12.0):
    """Short-timeout GET used for task polling / health checks.

    Never raises: a slow or hung coding-agent poll returns None so the chat
    phase stays alive (SSE + deadline drive completion) instead of falling over
    with an httpx.ReadTimeout mid-build.
    """
    try:
        with httpx.Client(timeout=httpx.Timeout(
                connect=4, read=read_s, write=25.0, pool=10.0)) as c:
            r = c.get(ca_url(path))
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()
    except Exception:
        return None


def _post(path: str, payload: dict):
    r = _http().post(ca_url(path), json=payload)
    if r.status_code >= 400:
        raise RuntimeError(f"Coding agent error {r.status_code} on {path}: {r.text[:300]}")
    return r.json()


# ── Service lifecycle ────────────────────────────────────────────────────────

def service_health() -> dict:
    try:
        return _poll("/api/health", read_s=5.0) or {}
    except Exception:
        return {}


def _spawn_service() -> None:
    cwd = str(CODING_AGENT_BACKEND_DIR)
    if not os.path.isdir(cwd):
        raise RuntimeError(f"Coding agent backend not found at {cwd}")
    log = Path(CODING_AGENT_BACKEND_DIR) / "coding-agent-gateway.log"
    # Propagate the deployment mode + cloud credentials so the coding agent
    # routes AI calls through the same provider as the workbench.
    from .config import (APP_MODE, NEBIUS_API_KEY, NEBIUS_BASE_URL,
                         NEBIUS_MODEL, NEBIUS_CODER_MODEL,
                         NEBIUS_EMBEDDING_MODEL, NEBIUS_TIMEOUT,
                         LOCAL_API_BASE, LOCAL_CODER_MODEL)
    env = dict(os.environ)
    env.update({
        "APP_MODE": APP_MODE,
        "NEBIUS_API_KEY": NEBIUS_API_KEY,
        "NEBIUS_BASE_URL": NEBIUS_BASE_URL,
        "NEBIUS_MODEL": NEBIUS_MODEL,
        "NEBIUS_CODER_MODEL": NEBIUS_CODER_MODEL,
        "NEBIUS_EMBEDDING_MODEL": NEBIUS_EMBEDDING_MODEL,
        "NEBIUS_TIMEOUT": str(NEBIUS_TIMEOUT),
        "NEBIUS_TIMEOUT_S": str(NEBIUS_TIMEOUT),
        "LOCAL_API_BASE": LOCAL_API_BASE,
        "LOCAL_CODER_MODEL": LOCAL_CODER_MODEL,
        # The coding agent reads these names (see coding_agent/app/config.py).
        "OLLAMA_BASE_URL": LOCAL_API_BASE,
        "CODING_MODEL": LOCAL_CODER_MODEL,
    })
    with open(log, "a") as out:
        subprocess.Popen(
            [str(CODING_AGENT_PYTHON), "-m", "uvicorn", "app.main:app",
             "--host", "127.0.0.1", "--port", "8002"],
            cwd=cwd, stdout=out, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL, start_new_session=True, env=env,
        )


def _service_mode():
    """Deployment mode reported by the running coding agent (or None)."""
    return (_poll("/api/ai/status", read_s=3.0) or {}).get("mode")


def _service_pids() -> list:
    """Find coding-agent processes by their uvicorn command line (Linux)."""
    pids = []
    try:
        for entry in os.listdir("/proc"):
            if not entry.isdigit():
                continue
            try:
                with open(f"/proc/{entry}/cmdline", "rb") as fh:
                    cmd = fh.read().replace(b"\x00", b" ").decode("utf-8", "ignore")
            except Exception:
                continue
            if "app.main:app" in cmd and "8002" in cmd:
                pids.append(int(entry))
    except Exception:
        pass
    return pids


def _stop_service(wait_s: float = 6.0) -> None:
    pids = _service_pids()
    for pid in pids:
        try:
            os.kill(pid, 15)
        except Exception:
            pass
    deadline = time.monotonic() + wait_s
    while time.monotonic() < deadline:
        if not _service_pids() and not service_health():
            return
        time.sleep(0.3)


def ensure_service(max_wait_s: float = 45.0) -> dict:
    health = service_health()
    if health.get("status") == "healthy":
        from .config import APP_MODE
        running_mode = _service_mode()
        if running_mode and running_mode != APP_MODE:
            # A stale service from the other deployment mode must never serve
            # cloud requests with local models (or vice versa).
            print(f"Coding Agent gateway: restarting service (mode {running_mode!r} "
                  f"!= APP_MODE {APP_MODE!r})")
            _stop_service()
        else:
            return health
    try:
        _spawn_service()
    except Exception as e:
        print(f"Coding Agent gateway: spawn failed, will fall back to in-process generator: {e}")
        return {}
    deadline = time.monotonic() + max_wait_s
    while time.monotonic() < deadline:
        health = service_health()
        if health.get("status") == "healthy":
            return health
        time.sleep(1.0)
    print("Coding Agent gateway: service did not become healthy within "
          f"{max_wait_s:.0f}s - using in-process generator fallback.")
    return {}


# ── Conversation <-> workspace binding ───────────────────────────────────────

def get_coding_binding(conversation_id: str) -> dict:
    from .database import SessionLocal
    from .models import CodingChatBinding
    session = SessionLocal()
    try:
        row = session.query(CodingChatBinding).filter(
            CodingChatBinding.conversation_id == conversation_id).first()
        if not row:
            return {}
        return {"session_id": row.session_id, "root": row.root,
                "project_name": row.project_name}
    finally:
        session.close()


def bind_coding_session(conversation_id: str, session_id: str | None,
                        root: str | None, project_name: str | None) -> None:
    from .database import SessionLocal
    from .models import CodingChatBinding
    session = SessionLocal()
    try:
        row = session.query(CodingChatBinding).filter(
            CodingChatBinding.conversation_id == conversation_id).first()
        if not row:
            row = CodingChatBinding(conversation_id=conversation_id)
            session.add(row)
        row.session_id = session_id
        row.root = root
        row.project_name = project_name
        session.commit()
    finally:
        session.close()


def _project_slug(name: str) -> str:
    slug = _SLUG_RE.sub("-", name.lower()).strip("-")
    return slug[:48] or f"project-{int(time.time())}"


def _title_from_query(query: str) -> str:
    first = re.split(r"[.,;!?\n]", query)[0].strip()
    words = re.findall(r"[A-Za-z0-9]+", first)
    if not words:
        return "Code project"
    return " ".join(words[:8]).title()


# ── Sessions / tasks ─────────────────────────────────────────────────────────

def plan_chat_coding(conversation_id: str, query: str) -> dict:
    """Return the session for this conversation and the task type to run.

        (session_id, root, project_name, task_type)

    task_type is NEW_PROJECT on the first coding query of a chat and
    EXISTING_PROJECT for follow-ups that edit the already-created workspace.
    """
    # Never collate different chats: a missing conversation id gets a fresh
    # ephemeral key, so it always starts a NEW project.
    if not conversation_id:
        import uuid
        conversation_id = "adhoc-" + uuid.uuid4().hex[:12]
    bind = get_coding_binding(conversation_id)
    if bind.get("root") and os.path.isdir(str(bind["root"])):
        return bind["session_id"], str(bind["root"]), bind.get("project_name"), "EXISTING_PROJECT"
    if bind.get("session_id"):
        return bind["session_id"], None, bind.get("project_name"), "NEW_PROJECT"
    title = _title_from_query(query)
    project_name = _project_slug(title)
    payload = _post("/api/sessions", {"mode": "new_project", "project_name": project_name, "title": title})
    session_obj = payload.get("session") or payload
    session_id = session_obj.get("session_id")
    if session_id:
        bind_coding_session(conversation_id, session_id, None, project_name)
    return session_id, None, project_name, "NEW_PROJECT"


# ── SSE collection + polling ─────────────────────────────────────────────────

async def _sse_queue(task_id: str, q: asyncio.Queue) -> None:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=5, read=45, pool=10)) as client:
            async with client.stream("GET", ca_url(f"/api/tasks/{task_id}/events")) as r:
                async for line in r.aiter_lines():
                    if line.startswith("data: "):
                        raw = line[6:].strip()
                        try:
                            ev = json.loads(raw)
                        except Exception:
                            continue
                        await q.put(ev)
    except Exception as e:
        await q.put({"kind": "stream_error", "error": str(e)})


async def collect_task(task_id: str, auto_approve: bool | None = None,
                       poll_interval: float = 2.5,
                       max_wait_s: float = 900.0) -> dict:
    """Drive a task to completion. Returns the final task detail.
    Yields {"kind": "started"|"event"|"approval", ...} as it goes so the caller
    can forward progress events to the chat stream."""
    if auto_approve is None:
        auto_approve = CA_CHAT_AUTO_APPROVE
    q: asyncio.Queue = asyncio.Queue()
    reader = asyncio.create_task(_sse_queue(task_id, q))
    deadline = time.monotonic() + max_wait_s
    last_events = time.monotonic()
    try:
        yield {"kind": "started", "task_id": task_id}
        while True:
            flow = time.monotonic()
            while not q.empty():
                yield {"kind": "event", "event": q.get_nowait()}
            if flow - last_events >= 2.0 and not q.empty():
                pass
            detail = await asyncio.to_thread(_poll, f"/api/tasks/{task_id}")
            status = (detail or {}).get("status")
            if status == "AWAITING_APPROVAL" and auto_approve:
                try:
                    await asyncio.to_thread(
                        _post, f"/api/tasks/{task_id}/approve-all", {"decision": "ALLOW_FOR_TASK"})
                except Exception as e:
                    print(f"Coding Agent gateway: auto-approve failed: {e}")
                yield {"kind": "approval", "detail": detail}
            if status in ("COMPLETED", "FAILED", "CANCELLED"):
                yield {"kind": "final", "detail": detail}
                return
            if time.monotonic() > deadline:
                yield {"kind": "final", "detail": detail or {"status": "FAILED",
                        "verdict": "FAILED", "error_summary": "Coding service timed out."}}
                return
            await asyncio.sleep(poll_interval)
            last_events = time.monotonic()
    finally:
        reader.cancel()
        try:
            await reader
        except (asyncio.CancelledError, Exception):
            pass


# ── Task creation ────────────────────────────────────────────────────────────

def create_task(session_id: str, task_type: str, message: str,
                folder_path: str | None = None) -> dict:
    payload = {
        "message": message,
        "session_id": session_id,
        "conversation_id": f"chat-{session_id}",
    }
    if task_type == "EXISTING_PROJECT":
        payload["folder_path"] = folder_path
    else:
        payload["project_name"] = _project_slug(_title_from_query(message))
    seg = "existing-project" if task_type == "EXISTING_PROJECT" else "new-project"
    resp = _post(f"/api/tasks/{seg}", payload)
    return resp


# ── File details / zip ───────────────────────────────────────────────────────

def task_files(task_id: str) -> list:
    return (_get(f"/api/tasks/{task_id}/files") or {}).get("files") or []


def task_file_content(task_id: str, path: str) -> str:
    try:
        r = _get(f"/api/tasks/{task_id}/file?path={path}")
        if isinstance(r, dict):
            return r.get("content") or ""
    except Exception:
        pass
    return ""


def task_details(task_id: str) -> dict:
    return _get(f"/api/tasks/{task_id}") or {}


def download_zip(task_id: str, root: str | None) -> str | None:
    """Download the task's project zip into our artifact storage. Returns the
    absolute zip path (or None)."""
    zip_dir = CODE_PROJECTS_PATH if root is None else Path(root).parent
    try:
        r = _http().get(ca_url(f"/api/tasks/{task_id}/download"))
        r.raise_for_status()
        name = _project_slug(os.path.basename(root or "") or task_id) or task_id
        zip_path = Path(zip_dir) / f"{name}-{task_id}.zip"
        zip_path.parent.mkdir(parents=True, exist_ok=True)
        zip_path.write_bytes(r.content)
        return str(zip_path)
    except Exception as e:
        print(f"Coding Agent gateway: zip download failed: {e}")
        return None


# ── Chat output rendering ────────────────────────────────────────────────────

def render_chat_output(query: str, title: str, task_type: str, detail: dict,
                       file_changes: list, test_results: list, entry_content: str,
                       project_name: str, root: str, task_id: str) -> str:
    verdict = detail.get("verdict", "COMPLETED").upper()
    status = (detail.get("status") or "").upper()
    change_label = {"create": "created", "modify": "modified", "delete": "deleted"}.get
    md = f"### {title}\n\n"
    md += f"**{task_type}** - {project_name}\n\n"
    md += f"{detail.get('summary') or detail.get('result_summary') or ''}\n\n"
    if file_changes:
        md += "**Files**\n"
        for path, change in file_changes[:25]:
            md += f"- `{change_label(change) or change} {path}`\n"
        md += "\n"
    if test_results:
        md += "**Verification**\n"
        for cmd, ok, out in test_results[:12]:
            md += f"- `{'✓' if ok else '✗'} {cmd}`\n"
        md += "\n"
    if status in ("FAILED", "CANCELLED"):
        md += f"**Status:** failed (`{verdict}`)\n\n"
        md += detail.get("error_output", "") or ""
        md += "\n\n**Task id:** `" + task_id + "`\n"
        return md
    if entry_content:
        md += "**Generated code**\n"
        md += "```\n" + entry_content + "\n```\n"
    md += "\n**Download**\n" + f"`{root}`\n"
    md += "\n**Task id:** `" + task_id + "`\n"
    return md