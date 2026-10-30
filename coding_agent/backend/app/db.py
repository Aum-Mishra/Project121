"""Coding Agent — isolated SQLite database and ORM models."""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Enum, Boolean
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

engine = create_engine(
    settings.resolved_database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.resolved_database_url else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class TaskType(PyEnum):
    NEW_PROJECT = "NEW_PROJECT"
    EXISTING_PROJECT = "EXISTING_PROJECT"
    GENERATED_CODE = "GENERATED_CODE"


class TaskStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Verdict(PyEnum):
    IMPLEMENTED = "IMPLEMENTED"
    TESTED = "TESTED"
    FAILED = "FAILED"
    PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED"
    REQUIRES_USER_ACTION = "REQUIRES_USER_ACTION"


class PermissionKind(PyEnum):
    COMMAND = "COMMAND"
    FILE_WRITE = "FILE_WRITE"
    PACKAGE_INSTALL = "PACKAGE_INSTALL"
    DELETE = "DELETE"
    CONFIG = "CONFIG"
    NETWORK = "NETWORK"
    GIT_REMOTE = "GIT_REMOTE"
    SYSTEM_LEVEL = "SYSTEM_LEVEL"


class Decision(PyEnum):
    PENDING = "PENDING"
    ALLOW_ONCE = "ALLOW_ONCE"
    ALLOW_FOR_TASK = "ALLOW_FOR_TASK"
    DENY = "DENY"


class ExecutionStatus(PyEnum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True)
    full_name = Column(String(255))
    company_id = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CodingSession(Base):
    __tablename__ = "coding_sessions"
    id = Column(Integer, primary_key=True)
    session_id = Column(String(100), unique=True, index=True, nullable=False)
    title = Column(String(255), default="Coding session")
    mode = Column(String(50), default="generate")  # generate | new_project | existing_project
    project_name = Column(String(255), nullable=True)
    folder_name = Column(String(500), nullable=True)       # quick-name of the opened folder
    folder_path = Column(String(1000), nullable=True)      # absolute user-picked folder
    storage_path = Column(String(1000), nullable=True)     # parent dir for new projects
    chat = Column(SQLiteJSON, default=list)                # [{role, text, when}]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CodingTask(Base):
    __tablename__ = "coding_tasks"
    id = Column(Integer, primary_key=True)
    task_id = Column(String(100), unique=True, index=True, nullable=False)
    company_id = Column(String(100), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_id = Column(String(100), index=True, nullable=True)
    task_type = Column(Enum(TaskType), nullable=False, default=TaskType.GENERATED_CODE)
    title = Column(String(255), default="")
    request = Column(Text, nullable=False)
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING, nullable=False)
    verdict = Column(Enum(Verdict), nullable=True)
    model_used = Column(String(100))
    engine = Column(String(50), default="ollama")  # 'openhands' | 'ollama'
    messages = Column(SQLiteJSON, default=list)
    events = Column(SQLiteJSON, default=list)
    error_message = Column(Text, nullable=True)
    result_summary = Column(Text, nullable=True)
    repair_attempts = Column(Integer, default=0)
    repair_limit = Column(Integer, default=3)
    authorized_root = Column(String(1000), nullable=True)
    is_git = Column(Boolean, default=False)
    git_branch = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    executions = relationship("CodingExecution", back_populates="task", cascade="all, delete-orphan")
    file_changes = relationship("CodingFileChange", back_populates="task", cascade="all, delete-orphan")
    test_results = relationship("CodingTestResult", back_populates="task", cascade="all, delete-orphan")
    permission_requests = relationship("CodingPermissionRequest", back_populates="task", cascade="all, delete-orphan")


class CodingPermissionRequest(Base):
    __tablename__ = "coding_permission_requests"
    id = Column(Integer, primary_key=True)
    request_id = Column(String(100), unique=True, index=True, nullable=False)
    task_id = Column(Integer, ForeignKey("coding_tasks.id"), nullable=False)
    kind = Column(Enum(PermissionKind), nullable=False)
    detail = Column(Text, default="")
    command = Column(Text, nullable=True)
    path = Column(String(1000), nullable=True)
    decision = Column(Enum(Decision), default=Decision.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    decided_at = Column(DateTime, nullable=True)

    task = relationship("CodingTask", back_populates="permission_requests")


class CodingExecution(Base):
    __tablename__ = "coding_executions"
    id = Column(Integer, primary_key=True)
    execution_id = Column(String(100), unique=True, index=True, nullable=False)
    task_id = Column(Integer, ForeignKey("coding_tasks.id"), nullable=False)
    command = Column(Text, nullable=True)
    label = Column(String(255), nullable=True)
    status = Column(Enum(ExecutionStatus), default=ExecutionStatus.RUNNING)
    stdout = Column(Text, nullable=True)
    stderr = Column(Text, nullable=True)
    return_code = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    task = relationship("CodingTask", back_populates="executions")


class CodingFileChange(Base):
    __tablename__ = "coding_file_changes"
    id = Column(Integer, primary_key=True)
    change_id = Column(String(100), unique=True, index=True, nullable=False)
    task_id = Column(Integer, ForeignKey("coding_tasks.id"), nullable=False)
    path = Column(String(1000), nullable=False)
    change_type = Column(String(20), nullable=False)  # create | modify | delete
    diff = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("CodingTask", back_populates="file_changes")


class CodingTestResult(Base):
    __tablename__ = "coding_test_results"
    id = Column(Integer, primary_key=True)
    result_id = Column(String(100), unique=True, index=True, nullable=False)
    task_id = Column(Integer, ForeignKey("coding_tasks.id"), nullable=False)
    command = Column(String(1000), nullable=True)
    passed = Column(Boolean, default=False)
    stdout = Column(Text, nullable=True)
    return_code = Column(Integer, nullable=True)
    attempt = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("CodingTask", back_populates="test_results")


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _migrate_sqlite()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == settings.seed_user_id).first()
        if not user:
            db.add(User(
                id=settings.seed_user_id,
                email="coding@local.workbench",
                full_name=settings.seed_user_name,
                company_id=settings.seed_company_id,
                is_active=True,
            ))
            db.commit()
    finally:
        db.close()


def _migrate_sqlite() -> None:
    """create_all() does not add columns to existing tables; add them manually."""
    if "sqlite" not in settings.resolved_database_url:
        return
    with engine.begin() as conn:
        cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(coding_tasks)").fetchall()]
        if cols and "session_id" not in cols:
            conn.exec_driver_sql("ALTER TABLE coding_tasks ADD COLUMN session_id VARCHAR(100)")