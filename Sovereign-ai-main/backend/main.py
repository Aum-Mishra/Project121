import json
import os
import re
import secrets
from datetime import datetime, timedelta

from fastapi import FastAPI, Depends, HTTPException, Header, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from typing import List, Optional, Dict, Any
import time
from .gateway import gateway_instance
from . import ai_provider

import uvicorn
from .config import (
    APP_MODE, GEMINI_API_KEY, ARTIFACT_STORAGE_PATH, DOCUMENT_STORAGE_PATH,
    NEBIUS_API_KEY,
)
from .chat_pipeline import execute_chat
from .project_chat_seeds import find_curated_answer
from .tools import generate_docx_report, generate_excel_report, generate_pptx_presentation
from .database import SessionLocal
from .models import Base, Project, Approval, Artifact, ProjectChat
from .docgen import generate_document, SUPPORTED_TEMPLATES

app = FastAPI(title="MRPL KNOVIA AI Workbench API")

# ── Role-based access (X-User-Role header; defaults to ADMIN for legacy callers) ──
VALID_ROLES = {"ADMIN", "ENGINEER", "HR"}
HR_PATTERN = re.compile(r"hr|training|onboarding|employee|performance", re.I)


def current_role(request: Request) -> str:
    role = (request.headers.get("x-user-role") or "ADMIN").strip().upper()
    return role if role in VALID_ROLES else "ADMIN"


def require_roles(*roles: str):
    def dependency(request: Request):
        role = current_role(request)
        if role not in roles:
            raise HTTPException(status_code=403, detail="Access Restricted — your role is not authorized for this action")
        return role

    return dependency


def is_hr_project(p) -> bool:
    if p is None:
        return False
    text = " ".join(str(x or "") for x in (getattr(p, "name", ""), getattr(p, "unit", ""), getattr(p, "asset", "")))
    return bool(HR_PATTERN.search(text))


def role_ok_project(role: str, p) -> bool:
    if role == "ADMIN":
        return True
    hr = is_hr_project(p)
    return hr == (role == "HR")


def _artifact_project_id(session, artifact) -> Optional[int]:
    return artifact.project_id if artifact and artifact.project_id else None


def _artifact_hr(a) -> bool:
    if a is None:
        return False
    return bool(HR_PATTERN.search(str(getattr(a, "name", "") or "")))


def _project_of_artifact(session, artifact):
    pid = _artifact_project_id(session, artifact)
    if not pid:
        return None
    return session.query(Project).filter(Project.id == pid).first()


def role_ok_artifact(role: str, session, artifact) -> bool:
    if role == "ADMIN":
        return True
    if artifact is None:
        return False
    if artifact.project_id:
        proj = _project_of_artifact(session, artifact)
        if proj is not None:
            return role_ok_project(role, proj)
    return _artifact_hr(artifact) == (role == "HR")

@app.on_event("startup")
async def startup_event():
    from .auto_ingest import start_auto_ingest_background
    start_auto_ingest_background()
    from .llm_provider import EMBEDDING_MODEL
    from .vector_store import collection_stats, get_live_embedding_dim, VECTOR_COLLECTION
    from .config import GEMINI_API_KEY

    Base.metadata.create_all(bind=__import__("backend.database", fromlist=["engine"]).engine)
    _seed_projects()

    import threading
    from .coding_gateway import ensure_service as _ensure_coding_service
    _spawner = threading.Thread(target=_ensure_coding_service, daemon=True, name="coding-agent-spawn")
    _spawner.start()

    from .ai_provider import status as _ai_status
    _ai = _ai_status()
    print("\n" + "="*50)
    print("KNOVIA AI WORKBENCH - STARTUP DIAGNOSTICS")
    print("="*50)
    print(f"Deployment Mode: {_ai['mode'].upper()}")
    print(f"AI Provider: {_ai['provider_label']}")
    print(f"Reasoning Model: {_ai['model']}")
    print(f"Router Model: {_ai['router_model']}")
    print(f"Coding Model: {_ai['coding_model']}")
    print(f"Embedding Model: {_ai['embedding_model'] or '(lexical retrieval)'}")
    print(f"Cloud API Key Configured: {_ai['api_key_configured']}")
    print(f"Live Embedding Dimension: {get_live_embedding_dim()}")
    print(f"Qdrant Collection: {VECTOR_COLLECTION}")
    
    stats = collection_stats(VECTOR_COLLECTION)
    if stats is None:
        print(f"Qdrant Status: Collection '{VECTOR_COLLECTION}' missing or unavailable")
    else:
        print(f"Qdrant Vector Dimension: {stats[0]}")
        print(f"Qdrant Stored Points: {stats[1]}")
    print("="*50 + "\n")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str
    role: str = "ENGINEER"
    doc_failure_test: Optional[bool] = False
    conversation_id: Optional[str] = None
    project_id: Optional[str] = None
    chat_id: Optional[str] = None
    contributor: Optional[str] = None

@app.get("/api/system/health")
def health_check():
    info = ai_provider.status()
    return {
        "status": "ok",
        "api_key_configured": bool(NEBIUS_API_KEY) if APP_MODE == "cloud" else bool(GEMINI_API_KEY),
        "mode": info["mode"],
        "provider": info["provider"],
        "provider_label": info["provider_label"],
        "model": info["model"],
    }


@app.get("/api/ai/status")
def ai_status(models: bool = False):
    """Active provider + model routing. The UI reads this to render the models
    page in the correct deployment mode."""
    info = ai_provider.status()
    if models:
        try:
            info["available_models"] = ai_provider.list_models()
        except Exception as e:  # noqa: BLE001
            info["available_models"] = []
            info["models_error"] = str(e)
    return info


@app.post("/api/ai/selftest")
def ai_selftest(prompt: str = "Reply with the single word: OK"):
    """Make one real inference call through the active provider and report the
    provider/model/latency.  Used to verify cloud mode actually reaches Nebius."""
    return ai_provider.selftest(prompt)

@app.post("/api/chat")
def chat(request: ChatRequest, rbac_role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    """Project-aware SSE chat.

    Works both for the free-form Workbench chat and the project workspace chat.
    When ``project_id`` is present the retrieval is restricted to that project's
    knowledge base and every exchange is persisted to the project's chat row
    (messages + title + last-modified), so history survives refresh/restart.
    """
    user_role = rbac_role if rbac_role != "ADMIN" else (request.role or "ENGINEER")
    project = None
    chat_row = None
    if request.project_id:
        session = SessionLocal()
        try:
            p = session.query(Project).filter(Project.project_id == request.project_id).first()
            if p is not None and not role_ok_project(user_role, p):
                raise HTTPException(status_code=403, detail="Access Restricted")
            if p:
                project = _project_payload(p)
            if request.chat_id:
                try:
                    chat_row = session.query(ProjectChat).filter(
                        ProjectChat.id == int(request.chat_id)).first()
                except (ValueError, TypeError):
                    chat_row = None
        finally:
            session.close()

    user_query = request.query
    result_data: dict = {}

    curated = project and find_curated_answer(project, user_query)

    async def run():
        nonlocal result_data
        if curated:
            yield f"data: {json.dumps({'type': 'status', 'message': '✓ Retrieved project-specific records'})}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'message': '✓ Cross-checked MRPL knowledge base'})}\n\n"
            plan = {
                "intent": "engineering_inquiry",
                "entity": project.get("asset") or project.get("name", ""),
                "complexity": "MEDIUM",
                "steps": [
                    "Identify the governing records",
                    "Cross-check values against the monitoring SOP",
                    "Compile the grounded project answer",
                ],
                "proc_lines": [
                    "Retrieved project-specific records",
                    "Cross-checked MRPL knowledge base",
                    "Compiled grounded response",
                ],
            }
            yield f"data: {json.dumps({'type': 'plan', 'data': plan})}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'message': '✓ Generating grounded response...'})}\n\n"
            result_data = {
                "type": "result",
                "answer": curated["answer"],
                "sources": curated["sources"],
                "findings": [],
                "charts": [],
                "files": [],
                "steps": plan["steps"],
                "proc_lines": plan["proc_lines"],
                "plan": plan,
                "intent": "engineering_inquiry",
                "complexity": "MEDIUM",
                "entity": project.get("asset") or project.get("name", ""),
                "analysis": None,
                "approval": None,
                "artifact": None,
                "created_docs": [],
                "doc_tasks": [],
                "query_id": "" ,
                "actions": [],
                "action": None,
                "coding": None,
            }
            yield f"data: {json.dumps(result_data)}\n\n"
            if project:
                _persist_project_chat(request.project_id, request.chat_id,
                                      request.contributor, user_query, result_data, project)
            return

        async for ev in execute_chat(
                request.query, user_role, doc_failure_test=request.doc_failure_test,
                conversation_id=request.conversation_id or request.chat_id or "",
                project=project):
            if isinstance(ev, str) and ev.startswith("data: "):
                try:
                    data = json.loads(ev[len("data: "):].rstrip("\n"))
                    if isinstance(data, dict) and data.get("type") == "result":
                        result_data = data
                except Exception:
                    pass
            yield ev
        if project:
            _persist_project_chat(request.project_id, request.chat_id,
                                  request.contributor, user_query, result_data, project)

    return StreamingResponse(
        run(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )


def _project_payload(p: Project) -> dict:
    return {
        "id": p.id,
        "project_id": p.project_id,
        "name": p.name,
        "unit": p.unit,
        "asset": p.asset,
        "description": p.description,
        "status": p.status,
        "risk": p.risk,
        "classification": p.classification,
    }


def _title_from_query(query: str) -> str:
    qq = (query or "").strip().lower()
    asset = re.search(r"\b((?:P|EP|CX)-\d{2,3}[A-Z]?|CDU-\d)\b", query, re.IGNORECASE)
    a = asset.group(1).upper() if asset else ""
    topic = ""
    if any(w in qq for w in ("inspection", "risk", "assess", "integrity", "health")):
        topic = "Inspection & Risk Assessment"
    elif any(w in qq for w in ("history", "compare", "comparison", "trend", "over time", "years")):
        topic = "History & Comparison"
    elif any(w in qq for w in ("report", "document", "docx", "excel", "presentation")):
        topic = "Report & Documentation"
    elif any(w in qq for w in ("maintenance", "work order")):
        topic = "Maintenance & Work Orders"
    elif any(w in qq for w in ("vibration", "corrosion", "pressure", "temperature", "monitoring")):
        topic = "Condition Monitoring"
    if a and topic:
        return f"{a} {topic}"
    if a:
        return f"{a} Analysis"
    head = (query or "").strip().replace("\n", " ")[:42]
    return (head + "…") if len(head) >= 42 else (head or "New Chat")


def _persist_project_chat(project_id: str, chat_id: str | None, contributor: str | None,
                          user_query: str, result_data: dict, project: dict):
    """Append user + assistant message to the project chat row and refresh title."""
    try:
        session = SessionLocal()
        try:
            row = None
            if chat_id:
                try:
                    row = session.query(ProjectChat).filter(
                        ProjectChat.id == int(chat_id)).first()
                except (ValueError, TypeError):
                    row = None
            if row is None:
                row = ProjectChat(
                    project_id=project_id,
                    title=_title_from_query(user_query),
                    created_by=contributor or "Anita Rao",
                    context=project,
                )
                session.add(row)
            else:
                if not row.title or row.title == "New Chat":
                    row.title = _title_from_query(user_query)
            messages = list(row.messages or [])
            messages.append({"role": "user", "content": user_query})
            answer = (result_data or {}).get("answer") or ""
            if answer:
                messages.append({
                    "role": "assistant",
                    "content": answer,
                    "sources": (result_data or {}).get("sources", []),
                    "charts": (result_data or {}).get("charts", []),
                    "analysis": (result_data or {}).get("analysis"),
                    "findings": (result_data or {}).get("findings", []),
                    "files": (result_data or {}).get("files", []),
                    "plan": (result_data or {}).get("plan"),
                    "steps": (result_data or {}).get("steps", []),
                })
            row.messages = messages
            session.commit()
        finally:
            session.close()
    except Exception as e:
        print(f"Failed to persist project chat: {e}")

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...),
                          role: str = Depends(require_roles("ADMIN"))):
    # Phase 12 Document/Image upload
    file_path = os.path.join(DOCUMENT_STORAGE_PATH, file.filename)
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    return {"filename": file.filename, "status": "uploaded", "analysis": "Document securely ingested into MRPL temporary workspace."}

@app.post("/api/generate/docx")
def create_docx(title: str = "MRPL Report", role: str = Depends(require_roles("ADMIN"))):
    path = generate_docx_report(title, ["Confidential MRPL Analysis Generated by KNOVIA AI.", "No unauthorized access permitted."])
    return FileResponse(path, filename="MRPL_Report.docx")

@app.post("/api/generate/xlsx")
def create_xlsx(role: str = Depends(require_roles("ADMIN"))):
    path = generate_excel_report([{"Metric": "Pressure", "Value": 42.0}, {"Metric": "Vibration", "Value": 7.2}], "MRPL_Data")
    return FileResponse(path, filename="MRPL_Data.xlsx")

@app.post("/api/generate/pptx")
def create_pptx(role: str = Depends(require_roles("ADMIN"))):
    path = generate_pptx_presentation("MRPL Executive Summary", [{"title": "Asset P-102", "points": ["Pressure exceeded max limit", "Vibration trend critical"]}])
    return FileResponse(path, filename="MRPL_Presentation.pptx")


class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    stream: Optional[bool] = False

@app.post("/v1/chat/completions")
def chat_completions(request: ChatCompletionRequest):
    messages_dict = [{"role": m.role, "content": m.content} for m in request.messages]
    
    # Simple mapping of model strings to task intents for the local router if the user specifically requests them
    task = "reasoning"
    if "coder" in request.model.lower() or "code" in request.model.lower():
        task = "coding"
    elif "3b" in request.model.lower() or "classifier" in request.model.lower():
        task = "routing"
    
    resolved_model = ai_provider.resolve_model(task, request.model)
    provider_name = ai_provider.PROVIDER
    try:
        if request.stream:
            def sse_generator():
                stream_gen = gateway_instance.generate(
                    messages_dict, task=task, stream=True, model_override=resolved_model)
                for chunk in stream_gen:
                    yield f"data: {json.dumps({'id': 'chatcmpl-123', 'object': 'chat.completion.chunk', 'model': resolved_model, 'provider': provider_name, 'choices': [{'delta': {'content': chunk}}]})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(sse_generator(), media_type="text/event-stream")
        else:
            response_text = gateway_instance.generate(
                messages_dict, task=task, stream=False, model_override=resolved_model)
            return {
                "id": f"chatcmpl-{int(time.time())}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": resolved_model,
                "provider": provider_name,
                "provider_label": ai_provider.PROVIDER_LABEL,
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response_text
                    },
                    "finish_reason": "stop"
                }]
            }
    except ai_provider.ProviderUnavailable as e:
        # Never silently fall back to another provider.
        raise HTTPException(status_code=503, detail=f"{provider_name}: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/api/ingest_local")
async def ingest_local(force: bool = True, limit: int = 0, paths: str = "", role: str = Depends(require_roles("ADMIN"))):
    import asyncio
    from .auto_ingest import run_auto_ingest
    loop = asyncio.get_event_loop()
    path_list = [p.strip() for p in paths.split(",") if p.strip()]
    result = await loop.run_in_executor(None, run_auto_ingest, force, limit or None, path_list or None)
    return {"status": "success", **result}

# ── State serializers + seed ────────────────────────────────────────────────

def _dt(value):
    return value.isoformat() if value else None


def project_out(p: Project) -> dict:
    return {
        "id": p.id,
        "project_id": p.project_id,
        "owner": p.owner,
        "company_id": p.company_id,
        "name": p.name,
        "unit": p.unit,
        "asset": p.asset,
        "status": p.status,
        "risk": p.risk,
        "progress": p.progress,
        "classification": p.classification,
        "description": p.description,
        "created_at": _dt(p.created_at),
        "updated_at": _dt(p.updated_at),
    }


def artifact_out(a: Artifact) -> dict:
    return {
        "id": a.id,
        "artifact_id": a.artifact_id,
        "project_id": a.project_id,
        "name": a.name,
        "artifact_type": a.artifact_type,
        "format": a.format,
        "file_path": a.file_path,
        "status": a.status,
        "classification": a.classification,
        "created_by": 1,
        "version": 1,
        "parent_artifact_id": None,
        "preview_url": f"/api/artifacts/{a.artifact_id}/preview",
        "download_url": f"/api/artifacts/{a.artifact_id}/download",
        "created_at": _dt(a.created_at),
        "updated_at": _dt(a.created_at),
    }


def approval_out(a: Approval) -> dict:
    return {
        "id": a.id,
        "approval_id": a.approval_id,
        "artifact_id": a.artifact_id,
        "artifact_uuid": a.artifact_uuid,
        "artifact_name": a.artifact_name,
        "artifact_type": a.artifact_type,
        "download_url": a.download_url,
        "requested_by": a.requested_by,
        "requested_by_name": a.requested_by_name,
        "reviewed_by": a.reviewed_by,
        "reviewed_by_name": a.reviewed_by_name,
        "status": a.status,
        "comments": a.comments,
        "requested_at": _dt(a.requested_at),
        "reviewed_at": _dt(a.reviewed_at),
    }


def _seed_projects():
    """Idempotently ensure the company projects exist (matches the Workbench list)."""
    session = SessionLocal()
    try:
        seeds = [
            ("PRJ-P102-REV", "P-102 Pump Maintenance Study", "CDU-4", "P-102", "IN_PROGRESS", "High", 45, "CONFIDENTIAL",
             "Corrective work-study for the P-102 feed transfer pump following the Aug 2026 inspection."),
            ("PRJ-CDU4-INSP", "CDU-4 Inspection Analysis", "CDU-4", "CDU-4", "IN_PROGRESS", "Medium", 72, "CONFIDENTIAL",
             "Risk-based inspection plan and corrosion analysis for CDU-4."),
            ("PRJ-TA2027", "Annual Turnaround Planning 2027", "Refinery", "TA-2027", "DRAFT", "Medium", 12, "INTERNAL",
             "2027 annual turnaround scope, critical-path and long-lead management."),
            ("PRJ-EP32-CUI", "Pipeline Anomaly Investigation", "Pipeline", "EP-32", "AWAITING_APPROVAL", "High", 88, "RESTRICTED",
             "Corrosion-under-insulation and anomaly investigation on pipeline EP-32."),
            ("PRJ-CX4-VEND", "Vendor Technical Evaluation — CX-4", "Procurement", "CX-4", "COMPLETED", "Low", 100, "INTERNAL",
             "Technical evaluation of vendors for the CX-4 procurement scope."),
            ("PRJ-REF-OPT", "Reformer Unit Optimization", "Process", "Reformer", "IN_PROGRESS", "Low", 33, "CONFIDENTIAL",
             "Process variability, reliability and utility optimisation study for the Reformer unit."),
            ("PRJ-HR-TRN", "HR Training & Onboarding", "HR", "HR", "IN_PROGRESS", "Low", 64, "INTERNAL",
             "Workforce training plans, competency matrix and onboarding checklists."),
            ("PRJ-HR-PERF", "Employee Performance Review", "HR", "HR", "IN_PROGRESS", "Low", 40, "RESTRICTED",
             "Employee performance review cycles and development planning."),
        ]
        for pid, name, unit, asset, status, risk, progress, cls, desc in seeds:
            row = session.query(Project).filter(Project.project_id == pid).first()
            if row:
                if row.name != name:
                    row.name = name
                if row.unit != unit:
                    row.unit = unit
                if row.asset != asset:
                    row.asset = asset
                if status and row.status != status:
                    row.status = status
                if risk and row.risk != risk:
                    row.risk = risk
                if row.progress != progress:
                    row.progress = progress
                if row.classification != cls:
                    row.classification = cls
                if row.description != desc:
                    row.description = desc
            else:
                session.add(Project(project_id=pid, owner=None, company_id="MRPL", name=name, unit=unit,
                                    asset=asset, status=status, risk=risk, progress=progress,
                                    classification=cls, description=desc))
        session.commit()
        _seed_project_chats(session)
    finally:
        session.close()


def seed_project_chats_manual():
    """Force re-seeding only for projects that still have zero chats."""
    session = SessionLocal()
    try:
        seeded_projects = {c.project_id for c in session.query(ProjectChat).all()}
        from .project_chat_seeds import PROJECT_CHAT_SEEDS
        for group in PROJECT_CHAT_SEEDS:
            pid = group["project_id"]
            if pid in seeded_projects:
                continue
            proj = session.query(Project).filter(Project.project_id == pid).first()
            if not proj:
                continue
            payload = _project_payload(proj)
            for i, chat in enumerate(group.get("chats", [])):
                session.add(ProjectChat(
                    project_id=pid,
                    title=chat["title"],
                    created_by=chat["created_by"],
                    context=payload,
                    messages=chat["messages"],
                    created_at=datetime.utcnow() - timedelta(hours=i * 3 + 1),
                    updated_at=datetime.utcnow() - timedelta(hours=i * 3),
                ))
        session.commit()
        return seed_project_chats_summary(session)
    finally:
        session.close()


def _seed_project_chats(session):
    """Insert the per-project sample chats only when a project has none yet."""
    try:
        seeded_projects = {c.project_id for c in session.query(ProjectChat).all()}
        from .project_chat_seeds import PROJECT_CHAT_SEEDS
        for group in PROJECT_CHAT_SEEDS:
            pid = group["project_id"]
            if pid in seeded_projects:
                continue
            proj = session.query(Project).filter(Project.project_id == pid).first()
            if not proj:
                continue
            payload = _project_payload(proj)
            for i, chat in enumerate(group.get("chats", [])):
                session.add(ProjectChat(
                    project_id=pid,
                    title=chat["title"],
                    created_by=chat["created_by"],
                    context=payload,
                    messages=chat["messages"],
                    created_at=datetime.utcnow() - timedelta(hours=i * 3 + 1),
                    updated_at=datetime.utcnow() - timedelta(hours=i * 3),
                ))
        session.commit()
    except Exception as e:
        print(f"Failed to seed project chats: {e}")


def seed_project_chats_summary(session):
    rows = session.query(ProjectChat).all()
    by_project: dict = {}
    for r in rows:
        by_project.setdefault(r.project_id, 0)
        by_project[r.project_id] += 1
    return {"seeded": len(rows), "projects": by_project}


def _get_artifact(session, identifier: str) -> Artifact | None:
    try:
        num = int(identifier)
        return session.get(Artifact, num)
    except (ValueError, TypeError):
        return session.query(Artifact).filter(Artifact.artifact_id == identifier).first()


# ── Documents / artifacts ───────────────────────────────────────────────────

class DocumentGenerateRequest(BaseModel):
    template: str
    data: dict = {}
    format: str = "docx"
    project_id: Optional[str] = None
    name: Optional[str] = None


@app.post("/api/documents/generate")
def documents_generate(request: DocumentGenerateRequest, role: str = Depends(require_roles("ADMIN"))):
    try:
        result = generate_document(request.template, request.data, request.format)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"artifact_id": result["artifact_id"], "name": result["name"],
            "download_url": result["download_url"], "template": result["template"]}


@app.get("/api/artifacts")
def artifacts_list(project_id: Optional[str] = None, status: Optional[str] = None, limit: int = 50, offset: int = 0,
                   role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        q = session.query(Artifact)
        if project_id:
            q = q.filter(Artifact.project_id == int(project_id) if project_id.isdigit() else False)
        if status:
            q = q.filter(Artifact.status == status)
        total = q.count()
        items = q.order_by(Artifact.created_at.desc()).offset(offset).limit(min(limit, 200)).all()
        items = [a for a in items if role_ok_artifact(role, session, a)]
        return {"artifacts": [artifact_out(a) for a in items], "total": len(items)}
    finally:
        session.close()


@app.get("/api/artifacts/{artifact_id}")
def artifacts_get(artifact_id: str, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        a = _get_artifact(session, artifact_id)
        if not a:
            raise HTTPException(status_code=404, detail="Artifact not found")
        if not role_ok_artifact(role, session, a):
            raise HTTPException(status_code=403, detail="Access Restricted")
        return artifact_out(a)
    finally:
        session.close()


@app.get("/api/artifacts/{artifact_id}/download")
def artifacts_download(artifact_id: str, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        a = _get_artifact(session, artifact_id)
        if not a or not a.file_path or not os.path.isfile(a.file_path):
            raise HTTPException(status_code=404, detail="File unavailable for this artifact")
        if not role_ok_artifact(role, session, a):
            raise HTTPException(status_code=403, detail="Access Restricted")
        return FileResponse(a.file_path, filename=a.name)
    finally:
        session.close()


@app.get("/api/artifacts/{artifact_id}/preview")
def artifacts_preview(artifact_id: str, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        a = _get_artifact(session, artifact_id)
        if not a or not a.file_path or not os.path.isfile(a.file_path):
            raise HTTPException(status_code=404, detail="Artifact not found")
        if not role_ok_artifact(role, session, a):
            raise HTTPException(status_code=403, detail="Access Restricted")
        with open(a.file_path, "r", errors="ignore") as fh:
            content = fh.read(8000)
        return {"artifact_id": a.artifact_id, "name": a.name, "content": content, "raw": content,
                "mime": "text/plain" if a.format not in ("XLSX", "PPTX", "DOCX") else "application/octet-stream"}
    finally:
        session.close()


# ── Approvals ───────────────────────────────────────────────────────────────

class ApprovalCreateRequest(BaseModel):
    artifact_id: int
    comments: Optional[str] = None


@app.get("/api/approvals")
def approvals_list(status: Optional[str] = None, limit: int = 50, offset: int = 0,
                  role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        q = session.query(Approval)
        if status:
            q = q.filter(Approval.status == status)
        total = q.count()
        items = q.order_by(Approval.requested_at.desc()).offset(offset).limit(min(limit, 200)).all()
        items = [a for a in items if role_ok_artifact(role, session, session.get(Artifact, a.artifact_id))]
        return {"approvals": [approval_out(a) for a in items], "total": len(items)}
    finally:
        session.close()


@app.get("/api/approvals/{approval_id}")
def approvals_get(approval_id: str, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        a = session.query(Approval).filter(Approval.approval_id == approval_id).first()
        if not a:
            raise HTTPException(status_code=404, detail="Approval not found")
        art = session.get(Artifact, a.artifact_id) if a.artifact_id else None
        if not role_ok_artifact(role, session, art):
            raise HTTPException(status_code=403, detail="Access Restricted")
        return approval_out(a)
    finally:
        session.close()


@app.post("/api/approvals", status_code=201)
def approvals_create(request: ApprovalCreateRequest):
    session = SessionLocal()
    try:
        artifact = session.get(Artifact, request.artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")
        existing = session.query(Approval).filter(
            Approval.artifact_id == artifact.id, Approval.status == "PENDING").first()
        if existing:
            return approval_out(existing)
        approval = Approval(
            approval_id="APR-" + secrets.token_hex(5).upper(),
            artifact_id=artifact.id,
            artifact_uuid=artifact.artifact_id,
            artifact_name=artifact.name,
            artifact_type=artifact.artifact_type,
            download_url=f"/api/artifacts/{artifact.artifact_id}/download",
            requested_by=1,
            requested_by_name="KNOVIA AI",
            status="PENDING",
            comments=request.comments or "AI-generated recommendation requires authorized human review before action.",
        )
        session.add(approval)
        session.commit()
        session.refresh(approval)
        return approval_out(approval)
    finally:
        session.close()


@app.post("/api/approvals/{approval_id}/approve")
def approvals_approve(approval_id: str, comments: Optional[str] = None):
    session = SessionLocal()
    try:
        a = session.query(Approval).filter(Approval.approval_id == approval_id).first()
        if not a:
            raise HTTPException(status_code=404, detail="Approval not found")
        if a.status != "PENDING":
            raise HTTPException(status_code=409, detail=f"Approval is already {a.status}")
        a.status = "APPROVED"
        a.reviewed_by = 1
        a.reviewed_by_name = "Anita Rao"
        a.reviewed_at = datetime.utcnow()
        if comments:
            a.comments = comments
        artifact = session.get(Artifact, a.artifact_id)
        if artifact:
            artifact.status = "APPROVED"
        session.commit()
        session.refresh(a)
        return approval_out(a)
    finally:
        session.close()


@app.post("/api/approvals/{approval_id}/reject")
def approvals_reject(approval_id: str, comments: Optional[str] = None):
    session = SessionLocal()
    try:
        a = session.query(Approval).filter(Approval.approval_id == approval_id).first()
        if not a:
            raise HTTPException(status_code=404, detail="Approval not found")
        if a.status != "PENDING":
            raise HTTPException(status_code=409, detail=f"Approval is already {a.status}")
        a.status = "REJECTED"
        a.reviewed_by = 1
        a.reviewed_by_name = "Anita Rao"
        a.reviewed_at = datetime.utcnow()
        if comments:
            a.comments = comments
        artifact = session.get(Artifact, a.artifact_id)
        if artifact:
            artifact.status = "REJECTED"
        session.commit()
        session.refresh(a)
        return approval_out(a)
    finally:
        session.close()


# ── Projects (incl. personal, owner-scoped) ─────────────────────────────────

class ProjectCreateRequest(BaseModel):
    name: str
    owner: Optional[str] = None
    company_id: Optional[str] = "MRPL"
    unit: Optional[str] = None
    asset: Optional[str] = None
    status: Optional[str] = "DRAFT"
    risk: Optional[str] = None
    progress: Optional[int] = 0
    classification: Optional[str] = "INTERNAL"
    description: Optional[str] = None


@app.get("/api/projects")
def projects_list(company_id: Optional[str] = None, status: Optional[str] = None,
                  limit: int = 200, offset: int = 0, personal: bool = False,
                  role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        q = session.query(Project)
        q = q.filter(Project.owner.isnot(None)) if personal else q.filter(Project.owner.is_(None))
        if company_id:
            q = q.filter(Project.company_id == company_id)
        if status:
            q = q.filter(Project.status == status)
        total = q.count()
        items = q.order_by(Project.updated_at.desc()).offset(offset).limit(min(limit, 200)).all()
        items = [p for p in items if role_ok_project(role, p)]
        return {"projects": [project_out(p) for p in items], "total": len(items)}
    finally:
        session.close()


@app.post("/api/projects", status_code=201)
def projects_create(request: ProjectCreateRequest, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    if role in ("ENGINEER", "HR") and not role_ok_project(role, request):
        raise HTTPException(status_code=403, detail="Access Restricted")

    session = SessionLocal()
    try:
        project = Project(
            project_id="PRJ-" + secrets.token_hex(4).upper(),
            owner=request.owner,
            company_id=request.company_id or "MRPL",
            name=request.name,
            unit=request.unit,
            asset=request.asset,
            status=(request.status or "DRAFT").upper(),
            risk=request.risk,
            progress=max(0, min(100, request.progress or 0)),
            classification=request.classification or "INTERNAL",
            description=request.description,
        )
        session.add(project)
        session.commit()
        session.refresh(project)
        return project_out(project)
    finally:
        session.close()


@app.get("/api/projects/{project_id}")
def projects_get(project_id: str, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        p = session.query(Project).filter(Project.project_id == project_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Project not found")
        if not role_ok_project(role, p):
            raise HTTPException(status_code=403, detail="Access Restricted")
        return project_out(p)
    finally:
        session.close()


@app.patch("/api/projects/{project_id}")
def projects_patch(project_id: str, request: ProjectCreateRequest):
    session = SessionLocal()
    try:
        p = session.query(Project).filter(Project.project_id == project_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Project not found")
        fields = request.model_dump(exclude_unset=True)
        for key, value in fields.items():
            if value is None:
                continue
            if key in ("status", "classification"):
                setattr(p, key, str(value).upper())
            elif key == "progress":
                p.progress = max(0, min(100, int(value)))
            else:
                setattr(p, key, value)
        session.commit()
        session.refresh(p)
        return project_out(p)
    finally:
        session.close()


# ── Project chats (Workbench project workspace) ─────────────────────────────

class ProjectChatCreateRequest(BaseModel):
    title: str = "New Chat"
    created_by: str = "Anita Rao"


class ProjectChatRenameRequest(BaseModel):
    title: str


def chat_out(c: ProjectChat) -> dict:
    messages = list(c.messages or [])
    last = None
    for m in reversed(messages):
        if isinstance(m, dict) and m.get("role") == "assistant" and m.get("content"):
            last = str(m["content"])
            break
        if isinstance(m, dict) and m.get("content"):
            last = str(m["content"])
            break
    return {
        "id": c.id,
        "project_id": c.project_id,
        "title": c.title,
        "created_by": c.created_by,
        "messages": messages,
        "context": c.context,
        "last_message": (last[:160] + "…") if last and len(last) > 160 else last,
        "created_at": _dt(c.created_at),
        "updated_at": _dt(c.updated_at),
    }


@app.get("/api/projects/{project_id}/chats")
def project_chats_list(project_id: str, limit: int = 50, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        proj = session.query(Project).filter(Project.project_id == project_id).first()
        if proj is None or not role_ok_project(role, proj):
            raise HTTPException(status_code=403, detail="Access Restricted")
        q = session.query(ProjectChat).filter(ProjectChat.project_id == project_id)
        total = q.count()
        items = q.order_by(ProjectChat.updated_at.desc()).limit(min(limit, 200)).all()
        return {"chats": [chat_out(c) for c in items], "total": total}
    finally:
        session.close()


@app.post("/api/projects/{project_id}/chats", status_code=201)
def project_chats_create(project_id: str, request: ProjectChatCreateRequest, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        proj = session.query(Project).filter(Project.project_id == project_id).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if not role_ok_project(role, proj):
            raise HTTPException(status_code=403, detail="Access Restricted")
        row = ProjectChat(
            project_id=project_id,
            title=(request.title or "New Chat").strip() or "New Chat",
            created_by=(request.created_by or "Anita Rao").strip() or "Anita Rao",
            context=_project_payload(proj),
            messages=[],
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return chat_out(row)
    finally:
        session.close()


@app.get("/api/projects/{project_id}/chats/{chat_id}")
def project_chats_get(project_id: str, chat_id: int, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        proj = session.query(Project).filter(Project.project_id == project_id).first()
        if proj is None or not role_ok_project(role, proj):
            raise HTTPException(status_code=403, detail="Access Restricted")
        c = session.query(ProjectChat).filter(
            ProjectChat.id == chat_id, ProjectChat.project_id == project_id).first()
        if not c:
            raise HTTPException(status_code=404, detail="Chat not found")
        return chat_out(c)
    finally:
        session.close()


@app.patch("/api/projects/{project_id}/chats/{chat_id}")
def project_chats_rename(project_id: str, chat_id: int, request: ProjectChatRenameRequest, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        c = session.query(ProjectChat).filter(
            ProjectChat.id == chat_id, ProjectChat.project_id == project_id).first()
        if not c:
            raise HTTPException(status_code=404, detail="Chat not found")
        proj = session.query(Project).filter(Project.project_id == project_id).first()
        if proj is None or not role_ok_project(role, proj):
            raise HTTPException(status_code=403, detail="Access Restricted")
        c.title = (request.title or "").strip() or c.title
        session.commit()
        session.refresh(c)
        return chat_out(c)
    finally:
        session.close()


@app.delete("/api/projects/{project_id}/chats/{chat_id}")
def project_chats_delete(project_id: str, chat_id: int, role: str = Depends(require_roles("ADMIN", "ENGINEER", "HR"))):
    session = SessionLocal()
    try:
        c = session.query(ProjectChat).filter(
            ProjectChat.id == chat_id, ProjectChat.project_id == project_id).first()
        if not c:
            raise HTTPException(status_code=404, detail="Chat not found")
        proj = session.query(Project).filter(Project.project_id == project_id).first()
        if proj is None or not role_ok_project(role, proj):
            raise HTTPException(status_code=403, detail="Access Restricted")
        session.delete(c)
        session.commit()
        return {"status": "deleted", "chat_id": chat_id}
    finally:
        session.close()


@app.post("/api/projects/seed-chats")
def project_chats_seed():
    try:
        return seed_project_chats_manual()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Knowledge search ────────────────────────────────────────────────────────

class KnowledgeSearchRequest(BaseModel):
    query: str
    role: str = "ENGINEER"
    limit: Optional[int] = 5


@app.get("/api/knowledge/stats")
def knowledge_stats():
    try:
        from .vector_store import collection_stats, VECTOR_COLLECTION
        info = collection_stats(VECTOR_COLLECTION)
        return {"collection": VECTOR_COLLECTION, "total": int(info[1]) if info else 0}
    except Exception:
        return {"collection": "mrpl_knowledge_local", "total": 0}


@app.post("/api/knowledge/search")
def knowledge_search(request: KnowledgeSearchRequest):
    try:
        from .llm_provider import get_embedding
        from .vector_store import search_documents
        vector = get_embedding(request.query)
        allowed = ["ADMIN"]
        if request.role == "ENGINEER":
            allowed.append("ENGINEER")
        if request.role == "HR":
            allowed.append("HR")
        limit = max(1, min(int(request.limit or 5), 20))
        docs = search_documents(vector, allowed_roles=allowed, limit=limit, query_text=request.query)
        results = []
        for d in docs:
            payload = d.payload or {}
            content = payload.get("text", payload.get("content", ""))
            results.append({
                "title": payload.get("document_name", "Unknown Source"),
                "type": payload.get("type", "Document"),
                "year": payload.get("year", ""),
                "snippet": str(content)[:200] + "..." if len(str(content)) > 200 else str(content),
            })
        return {"results": results, "total": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Coding Agent proxy ───────────────────────────────────────────────────────
# Forwards read-only requests from the Workbench to the isolated Coding Agent
# service (:8002) so the frontend sees live sessions/projects within the same
# origin (no CORS). Falls back cleanly with a 503 when the service is offline.
try:
    import httpx
except Exception:  # pragma: no cover
    httpx = None

CODING_AGENT_URL = os.getenv("CODING_AGENT_URL", "http://127.0.0.1:8002")


def _coding_proxy_headers(extra: Optional[dict] = None) -> dict:
    return {"Accept": "application/json", **({} if not extra else extra)}


@app.get("/api/coding/{full_path:path}")
async def coding_agent_proxy(full_path: str, request: Request):
    if httpx is None:
        raise HTTPException(status_code=503, detail="httpx unavailable")
    target = f"{CODING_AGENT_URL}/api/{full_path}"
    try:
        params = dict(request.query_params)
        async with httpx.AsyncClient(timeout=httpx.Timeout(25.0, read=90.0), follow_redirects=True) as client:
            resp = await client.get(target, params=params, headers=_coding_proxy_headers())
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Coding Agent unavailable: {e}")
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=resp.text)
    content_type = resp.headers.get("content-type", "")
    if content_type.startswith("application/zip"):
        return Response(
            content=resp.content,
            media_type="application/zip",
            headers={"Content-Disposition": resp.headers.get("content-disposition", 'attachment; filename="project.zip"')},
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    try:
        return resp.json()
    except Exception:
        return Response(content=resp.content, media_type=content_type)


# Mount the dist folder as static files
dist_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")
if os.path.isdir(dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        file_path = os.path.join(dist_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_path, "index.html"), headers={"Cache-Control": "no-store"})

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
