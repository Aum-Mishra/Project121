"""Permission request lifecycle for sensitive operations.

The agent must never silently execute something that could reach outside the
workspace. Sensitive commands, package installs, network, deletes, and config
writes are funneled here. The request goes into the DB and is surfaced through
SSE to the UI; the orchestrator pauses until the user decides.
"""
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app import db as dbmod
from app.db import CodingPermissionRequest, PermissionKind, Decision


def new_request_id() -> str:
    return "ca-pr-" + uuid.uuid4().hex[:12]


def create_request(
    db: Session,
    task: "dbmod.CodingTask",
    kind: PermissionKind,
    detail: str = "",
    command: Optional[str] = None,
    path: Optional[str] = None,
) -> CodingPermissionRequest:
    req = CodingPermissionRequest(
        request_id=new_request_id(),
        task_id=task.id,
        kind=kind,
        detail=detail,
        command=command,
        path=path,
        decision=Decision.PENDING,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def get_pending(db: Session, task: "dbmod.CodingTask") -> Optional[CodingPermissionRequest]:
    return (
        db.query(CodingPermissionRequest)
        .filter(
            CodingPermissionRequest.task_id == task.id,
            CodingPermissionRequest.decision == Decision.PENDING,
        )
        .order_by(CodingPermissionRequest.id.desc())
        .first()
    )


def pending_count(db: Session, task: "dbmod.CodingTask") -> int:
    return (
        db.query(CodingPermissionRequest)
        .filter(
            CodingPermissionRequest.task_id == task.id,
            CodingPermissionRequest.decision == Decision.PENDING,
        )
        .count()
    )


def decide(
    db: Session,
    request: CodingPermissionRequest,
    decision: Decision,
) -> CodingPermissionRequest:
    from datetime import datetime
    request.decision = decision
    request.decided_at = datetime.utcnow()
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def resolve_all_for_task(db: Session, task: "dbmod.CodingTask", decision: Decision) -> None:
    """Approve/deny every still-pending request for a task in one shot."""
    from datetime import datetime
    pendings = (
        db.query(CodingPermissionRequest)
        .filter(
            CodingPermissionRequest.task_id == task.id,
            CodingPermissionRequest.decision == Decision.PENDING,
        )
        .all()
    )
    for req in pendings:
        req.decision = decision
        req.decided_at = datetime.utcnow()
    db.commit()