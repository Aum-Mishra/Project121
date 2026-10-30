from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Union, Any
from datetime import datetime
from app.db.database import get_db
from app.db.models import Project, ProjectStatus, DocumentClassification
from app.core.config import settings

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectBase(BaseModel):
    name: str
    unit: Optional[str] = None
    asset: Optional[str] = None
    status: str = "DRAFT"
    risk: Optional[str] = None
    progress: int = 0
    classification: str = "INTERNAL"
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    project_id: str


class ProjectUpdate(ProjectBase):
    pass


class ProjectResponse(BaseModel):
    id: int
    project_id: str
    name: str
    unit: Optional[str] = None
    asset: Optional[str] = None
    status: Any
    risk: Optional[str] = None
    progress: int = 0
    classification: Any = "INTERNAL"
    description: Optional[str] = None
    created_at: Union[datetime, str]
    updated_at: Union[datetime, str]

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    projects: List[ProjectResponse]
    total: int


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    company_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Project)
    if company_id:
        query = query.filter(Project.company_id == company_id)
    else:
        query = query.filter(Project.company_id == settings.company_id)
    if status:
        query = query.filter(Project.status == status)
    total = query.count()
    projects = query.order_by(Project.created_at.desc()).offset(offset).limit(limit).all()
    return ProjectListResponse(
        projects=[ProjectResponse.model_validate(p) for p in projects],
        total=total,
    )


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    try:
        proj_status = ProjectStatus[project.status.upper()]
    except KeyError:
        proj_status = ProjectStatus.DRAFT
    try:
        classification = DocumentClassification[project.classification.upper()]
    except KeyError:
        classification = DocumentClassification.INTERNAL

    db_project = Project(
        project_id=project.project_id,
        company_id=settings.company_id,
        name=project.name,
        unit=project.unit,
        asset=project.asset,
        status=proj_status,
        risk=project.risk,
        progress=project.progress,
        classification=classification,
        description=project.description,
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return ProjectResponse.model_validate(db_project)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, project: ProjectUpdate, db: Session = Depends(get_db)):
    db_project = db.query(Project).filter(Project.project_id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = project.model_dump(exclude_unset=True)
    if "status" in update_data:
        try:
            db_project.status = ProjectStatus[update_data.pop("status").upper()]
        except KeyError:
            pass
    if "classification" in update_data:
        try:
            db_project.classification = DocumentClassification[update_data.pop("classification").upper()]
        except KeyError:
            pass

    for key, value in update_data.items():
        setattr(db_project, key, value)

    db_project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_project)
    return ProjectResponse.model_validate(db_project)