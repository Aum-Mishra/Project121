from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid
from app.db.database import get_db
from app.api.dependencies import get_optional_current_user
from app.db.models import Approval, ApprovalStatus, Artifact, Project, User, AuditEvent
from app.core.config import settings


def _resolve_user(db: Session, current_user: Optional[User]) -> User:
    """Authenticated request uses the actor's identity/scoping.

    Anonymous/local requests fall back to the default company's principal user
    (same pattern as the chat endpoints) so the single-company on-prem app keeps
    working without a token, while scoping stays correct per company.
    """
    if current_user:
        return current_user
    user = (
        db.query(User)
        .filter(User.company_id == settings.company_id)
        .order_by(User.id.asc())
        .first()
    )
    if not user:
        user = db.query(User).order_by(User.id.asc()).first()
    if not user:
        raise HTTPException(status_code=401, detail="No user available")
    return user

router = APIRouter(prefix="/approvals", tags=["approvals"])


class ApprovalResponse(BaseModel):
    id: int
    approval_id: str
    artifact_id: int
    artifact_uuid: Optional[str] = None
    artifact_name: Optional[str] = None
    artifact_type: Optional[str] = None
    download_url: Optional[str] = None
    requested_by: int
    requested_by_name: Optional[str] = None
    reviewed_by: Optional[int]
    reviewed_by_name: Optional[str] = None
    status: str
    comments: Optional[str]
    requested_at: datetime
    reviewed_at: Optional[datetime]

    class Config:
        from_attributes = True


class ApprovalListResponse(BaseModel):
    approvals: List[ApprovalResponse]
    total: int


class ApprovalAction(BaseModel):
    comments: Optional[str] = None


class ApprovalCreate(BaseModel):
    artifact_id: str
    comments: Optional[str] = None


def _approval_to_response(appr: Approval, db: Session) -> ApprovalResponse:
    artifact = db.query(Artifact).filter(Artifact.id == appr.artifact_id).first()
    requester = db.query(User).filter(User.id == appr.requested_by).first() if appr.requested_by else None
    reviewer = db.query(User).filter(User.id == appr.reviewed_by).first() if appr.reviewed_by else None
    return ApprovalResponse(
        id=appr.id,
        approval_id=appr.approval_id,
        artifact_id=appr.artifact_id,
        artifact_uuid=artifact.artifact_id if artifact else None,
        artifact_name=artifact.name if artifact else None,
        artifact_type=artifact.artifact_type.value if artifact and hasattr(artifact.artifact_type, "value") else (artifact.artifact_type if artifact else None),
        download_url=f"/api/artifacts/{artifact.artifact_id}/download" if artifact else None,
        requested_by=appr.requested_by or 0,
        requested_by_name=requester.full_name if requester else None,
        reviewed_by=appr.reviewed_by,
        reviewed_by_name=reviewer.full_name if reviewer else None,
        status=appr.status.value if hasattr(appr.status, "value") else appr.status,
        comments=appr.comments,
        requested_at=appr.requested_at,
        reviewed_at=appr.reviewed_at,
    )


def _log_audit(db: Session, user: User, event_type: str, resource: str, details: dict) -> None:
    try:
        db.add(AuditEvent(
            event_id=str(uuid.uuid4()),
            company_id=user.company_id,
            user_id=user.id,
            event_type=event_type,
            resource_type="approval",
            resource_id=resource,
            details=details,
        ))
    except Exception:
        db.rollback()


@router.get("", response_model=ApprovalListResponse)
async def list_approvals(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_optional_current_user),
):
    current_user = _resolve_user(db, current_user)
    query = db.query(Approval).join(Artifact).join(Project, Artifact.project_id == Project.id, isouter=True).filter(
        (Project.company_id == current_user.company_id) | (Artifact.company_id == current_user.company_id)
    )
    if status:
        query = query.filter(Approval.status == status)
    total = query.count()
    approvals = query.order_by(Approval.requested_at.desc()).offset(offset).limit(limit).all()
    return ApprovalListResponse(
        approvals=[_approval_to_response(a, db) for a in approvals],
        total=total,
    )


@router.get("/{approval_id}", response_model=ApprovalResponse)
async def get_approval(approval_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_optional_current_user)):
    approval = db.query(Approval).filter(Approval.approval_id == approval_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    return _approval_to_response(approval, db)


@router.post("", response_model=ApprovalResponse, status_code=201)
async def create_approval(
    payload: ApprovalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_optional_current_user),
):
    current_user = _resolve_user(db, current_user)
    artifact = db.query(Artifact).filter(Artifact.artifact_id == payload.artifact_id).first()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    existing = (
        db.query(Approval)
        .filter(Approval.artifact_id == artifact.id, Approval.status == ApprovalStatus.PENDING)
        .first()
    )
    if existing:
        return _approval_to_response(existing, db)

    approval = Approval(
        approval_id=f"APR-{uuid.uuid4().hex[:10].upper()}",
        artifact_id=artifact.id,
        requested_by=current_user.id,
        status=ApprovalStatus.PENDING,
        comments=payload.comments,
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)
    _log_audit(db, current_user, "approval.requested", approval.approval_id, {"artifact": artifact.artifact_id})
    db.commit()
    return _approval_to_response(approval, db)


@router.post("/{approval_id}/approve", response_model=ApprovalResponse)
async def approve_approval(
    approval_id: str,
    action: ApprovalAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_optional_current_user),
):
    current_user = _resolve_user(db, current_user)
    approval = db.query(Approval).filter(Approval.approval_id == approval_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.status != ApprovalStatus.PENDING:
        raise HTTPException(status_code=409, detail=f"Cannot approve an approval in state {approval.status.value}")

    approval.status = ApprovalStatus.APPROVED
    approval.reviewed_by = current_user.id
    approval.reviewed_at = datetime.utcnow()
    approval.comments = action.comments or approval.comments
    db.commit()
    _log_audit(db, current_user, "approval.approved", approval.approval_id, {"artifact_id": str(approval.artifact_id)})
    db.commit()
    db.refresh(approval)
    return _approval_to_response(approval, db)


@router.post("/{approval_id}/reject", response_model=ApprovalResponse)
async def reject_approval(
    approval_id: str,
    action: ApprovalAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_optional_current_user),
):
    current_user = _resolve_user(db, current_user)
    approval = db.query(Approval).filter(Approval.approval_id == approval_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.status != ApprovalStatus.PENDING:
        raise HTTPException(status_code=409, detail=f"Cannot reject an approval in state {approval.status.value}")

    approval.status = ApprovalStatus.REJECTED
    approval.reviewed_by = current_user.id
    approval.reviewed_at = datetime.utcnow()
    approval.comments = action.comments or approval.comments
    db.commit()
    _log_audit(db, current_user, "approval.rejected", approval.approval_id, {"artifact_id": str(approval.artifact_id)})
    db.commit()
    db.refresh(approval)
    return _approval_to_response(approval, db)