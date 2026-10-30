from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pathlib import Path
from pydantic import BaseModel
from datetime import datetime
import uuid
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.db.models import AuditEvent, User
from app.tools.code_executor import CodeExecutorTool
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/code", tags=["code-sandbox"])

executor = CodeExecutorTool()


class CodeRunRequest(BaseModel):
    code: str
    language: str = "python"
    timeout: int = 30


class CodeRunResponse(BaseModel):
    stdout: str
    stderr: str
    return_code: int
    execution_ms: int
    sandbox: str


@router.post("/run", response_model=CodeRunResponse)
async def run_code(
    payload: CodeRunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.code.strip():
        raise HTTPException(status_code=400, detail="No code provided")
    if payload.timeout < 1 or payload.timeout > 60:
        raise HTTPException(status_code=400, detail="timeout must be between 1 and 60 seconds")

    import time
    start = time.time()
    result = await executor.execute(
        {"code": payload.code, "timeout": payload.timeout, "language": payload.language},
        {"db": db, "user_id": current_user.id},
    )
    elapsed = int((time.time() - start) * 1000)

    try:
        db.add(AuditEvent(
            event_id=str(uuid.uuid4()),
            company_id=current_user.company_id,
            user_id=current_user.id,
            event_type="code.run",
            resource_type="sandbox",
            resource_id=f"code-{uuid.uuid4().hex[:10]}",
            details={"language": payload.language, "success": result.success, "return_code": result.data.get("return_code") if result.data else None},
        ))
        db.commit()
    except Exception as e:
        logger.error("code_audit_failed", error=str(e))
        db.rollback()

    if not result.success:
        raise HTTPException(status_code=422, detail=result.error or "Sandbox execution failed")

    return CodeRunResponse(
        stdout=result.data.get("stdout", ""),
        stderr=result.data.get("stderr", ""),
        return_code=result.data.get("return_code", 0),
        execution_ms=elapsed,
        sandbox="isolated temp dir · python -I · no network · CPU/fs limits",
    )


class DebugLoopRequest(BaseModel):
    task_prompt: str
    initial_code: str
    max_iterations: int = 4
    timeout: int = 30


@router.post("/debug-loop")
async def run_debug_loop(
    payload: DebugLoopRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.autonomous_coding_service import autonomous_coding_service
    result = await autonomous_coding_service.execute_debug_loop(
        task_prompt=payload.task_prompt,
        initial_code=payload.initial_code,
        timeout=payload.timeout,
        max_iterations=payload.max_iterations,
    )
    try:
        db.add(AuditEvent(
            event_id=str(uuid.uuid4()),
            company_id=current_user.company_id,
            user_id=current_user.id,
            event_type="code.debug_loop",
            resource_type="coding_agent",
            resource_id=f"loop-{uuid.uuid4().hex[:8]}",
            details={
                "task": payload.task_prompt[:100],
                "iterations": result.get("total_iterations"),
                "success": result.get("success"),
            },
        ))
        db.commit()
    except Exception:
        db.rollback()

    return result


class CheckpointRequest(BaseModel):
    project_path: str
    label: Optional[str] = "Manual snapshot"


@router.post("/checkpoint")
async def create_checkpoint(payload: CheckpointRequest, current_user: User = Depends(get_current_user)):
    from app.services.autonomous_coding_service import autonomous_coding_service
    return autonomous_coding_service.create_checkpoint(payload.project_path, payload.label or "Snapshot")


class RollbackRequest(BaseModel):
    project_path: str
    checkpoint_id: str


@router.post("/rollback")
async def rollback_checkpoint(payload: RollbackRequest, current_user: User = Depends(get_current_user)):
    from app.services.autonomous_coding_service import autonomous_coding_service
    success = autonomous_coding_service.rollback_checkpoint(payload.project_path, payload.checkpoint_id)
    return {"success": success, "restored_checkpoint": payload.checkpoint_id}


class DiffRequest(BaseModel):
    original_text: str
    modified_text: str
    filename: Optional[str] = "file.py"


@router.post("/diff")
async def compute_diff(payload: DiffRequest):
    from app.services.autonomous_coding_service import autonomous_coding_service
    return autonomous_coding_service.compute_diff(
        payload.original_text, payload.modified_text, payload.filename or "file.py"
    )


@router.get("/project-tree")
async def get_project_tree(path: Optional[str] = None):
    from app.services.autonomous_coding_service import autonomous_coding_service
    target_path = path or str(Path(__file__).resolve().parent.parent.parent)
    return autonomous_coding_service.get_project_tree(target_path)
