from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Union, Any
from datetime import datetime
from app.db.database import get_db
from app.db.models import Task, TaskStatus, Project
from app.core.config import settings

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "TODO"
    priority: int = 3
    owner_id: Optional[int] = None
    due_date: Optional[str] = None
    asset: Optional[str] = None


class TaskCreate(TaskBase):
    task_id: str
    project_id: int


class TaskUpdate(TaskBase):
    pass


class TaskResponse(BaseModel):
    id: int
    task_id: str
    project_id: int
    title: str
    description: Optional[str] = None
    status: Any = "TODO"
    priority: int = 3
    owner_id: Optional[int] = None
    due_date: Optional[Union[datetime, str]] = None
    asset: Optional[str] = None
    created_at: Union[datetime, str]
    updated_at: Union[datetime, str]

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    tasks: List[TaskResponse]
    total: int


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    project_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Task).join(Project).filter(Project.company_id == settings.company_id)
    if project_id:
        query = query.filter(Task.project_id == project_id)
    if status:
        query = query.filter(Task.status == status)
    total = query.count()
    tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
    return TaskListResponse(
        tasks=[TaskResponse.model_validate(t) for t in tasks],
        total=total,
    )


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == task.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        task_status = TaskStatus[task.status.upper()]
    except KeyError:
        task_status = TaskStatus.TODO

    due_date = None
    if task.due_date:
        due_date = datetime.fromisoformat(task.due_date.replace("Z", "+00:00"))

    db_task = Task(
        task_id=task.task_id,
        project_id=task.project_id,
        title=task.title,
        description=task.description,
        status=task_status,
        priority=task.priority,
        owner_id=task.owner_id,
        due_date=due_date,
        asset=task.asset,
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return TaskResponse.model_validate(db_task)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskResponse.model_validate(task)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, task: TaskUpdate, db: Session = Depends(get_db)):
    db_task = db.query(Task).filter(Task.task_id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = task.model_dump(exclude_unset=True)
    if "status" in update_data:
        try:
            db_task.status = TaskStatus[update_data.pop("status").upper()]
        except KeyError:
            pass
    if "due_date" in update_data and update_data["due_date"]:
        db_task.due_date = datetime.fromisoformat(update_data.pop("due_date").replace("Z", "+00:00"))

    for key, value in update_data.items():
        setattr(db_task, key, value)

    db_task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_task)
    return TaskResponse.model_validate(db_task)