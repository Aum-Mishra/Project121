from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional, List
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Enum, Boolean, Float, JSON, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from app.db.database import Base


class UserRole(PyEnum):
    EMPLOYEE = "EMPLOYEE"
    ENGINEER = "ENGINEER"
    SUPERVISOR = "SUPERVISOR"
    APPROVER = "APPROVER"
    ADMIN = "ADMIN"


class DocumentStatus(PyEnum):
    UPLOADING = "UPLOADING"
    PROCESSING = "PROCESSING"
    OCR = "OCR"
    CHUNKING = "CHUNKING"
    EMBEDDING = "EMBEDDING"
    INDEXING = "INDEXING"
    READY = "READY"
    ERROR = "ERROR"


class DocumentClassification(PyEnum):
    PUBLIC = "PUBLIC"
    INTERNAL = "INTERNAL"
    CONFIDENTIAL = "CONFIDENTIAL"
    RESTRICTED = "RESTRICTED"


class DocumentType(PyEnum):
    PDF = "PDF"
    DOCX = "DOCX"
    XLSX = "XLSX"
    PPTX = "PPTX"
    TXT = "TXT"
    IMAGE = "IMAGE"
    OTHER = "OTHER"


class ArtifactStatus(PyEnum):
    DRAFT = "DRAFT"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ArtifactType(PyEnum):
    DOCX = "DOCX"
    XLSX = "XLSX"
    PPTX = "PPTX"
    PDF = "PDF"
    PY = "PY"
    JSON = "JSON"
    CSV = "CSV"
    TXT = "TXT"
    MD = "MD"
    OTHER = "OTHER"


class ProjectStatus(PyEnum):
    DRAFT = "DRAFT"
    IN_PROGRESS = "IN_PROGRESS"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


class TaskStatus(PyEnum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW = "REVIEW"
    DONE = "DONE"
    BLOCKED = "BLOCKED"


class AgentRunStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class AgentStepStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class ApprovalStatus(PyEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class WorkOrderStatus(PyEnum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class ModelStatus(PyEnum):
    READY = "READY"
    LOADING = "LOADING"
    UNAVAILABLE = "UNAVAILABLE"
    ERROR = "ERROR"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.EMPLOYEE, nullable=False)
    company_id = Column(String(100), ForeignKey("companies.company_id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="users")


class ChatDocument(Base):
    """Documents uploaded by a user into a specific conversation.

    Scope is enforced server-side on (company_id, user_id, conversation_id) —
    never trusted from the client. These documents live in a dedicated chat-only
    Qdrant collection isolated from the permanent company RAG collection.
    """
    __tablename__ = "chat_documents"
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String(100), unique=True, index=True, nullable=False)
    company_id = Column(String(100), ForeignKey("companies.company_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    conversation_id = Column(String(100), index=True, nullable=False)
    filename = Column(String(500), nullable=False)
    file_size = Column(Integer, default=0)
    file_type = Column(String(20))
    mime_type = Column(String(120))
    file_path = Column(String(1000))
    page_count = Column(Integer, nullable=True)
    chunk_count = Column(Integer, default=0)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.UPLOADING, nullable=False)
    ocr_used = Column(Boolean, default=False)
    preview = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_chat_documents_scope", "company_id", "user_id", "conversation_id"),
    )


class Company(Base):
    __tablename__ = "companies"
    company_id = Column(String(100), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    short_name = Column(String(50))
    industry = Column(String(255))
    headquarters = Column(String(255))
    primary_site = Column(String(255))
    established = Column(Integer)
    employees = Column(Integer)
    annual_capacity_mmbpa = Column(Integer)
    classification = Column(Enum(DocumentClassification), default=DocumentClassification.CONFIDENTIAL)
    dataset_version = Column(String(20))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="company")
    documents = relationship("Document", back_populates="company")
    assets = relationship("Asset", back_populates="company")
    projects = relationship("Project", back_populates="company")


class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String(100), unique=True, index=True, nullable=False)
    company_id = Column(String(100), ForeignKey("companies.company_id"), nullable=False)
    file_name = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_type = Column(Enum(DocumentType), nullable=False)
    file_size = Column(Integer)
    page_count = Column(Integer)
    classification = Column(Enum(DocumentClassification), default=DocumentClassification.INTERNAL)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.UPLOADING)
    owner = Column(String(255))
    revision = Column(String(50))
    doc_metadata = Column(SQLiteJSON, default=dict)
    source_path = Column(String(1000))
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    indexed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    company = relationship("Company", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer)
    section = Column(String(255))
    token_count = Column(Integer)
    embedding = Column(SQLiteJSON, nullable=True)
    qdrant_point_id = Column(String(100), index=True)
    chunk_metadata = Column(SQLiteJSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="chunks")

    __table_args__ = (Index("ix_document_chunks_doc_idx", "document_id", "chunk_index"),)


class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(String(100), unique=True, index=True, nullable=False)
    company_id = Column(String(100), ForeignKey("companies.company_id"), nullable=False)
    asset_type = Column(String(100))
    unit = Column(String(100))
    service = Column(String(255))
    criticality = Column(String(50))
    manufacturer = Column(String(100))
    model = Column(String(100))
    year = Column(Integer)
    design_pressure = Column(Float)
    normal_pressure = Column(Float)
    design_temp = Column(Float)
    capacity = Column(String(100))
    specifications = Column(SQLiteJSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="assets")


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String(100), unique=True, index=True, nullable=False)
    company_id = Column(String(100), ForeignKey("companies.company_id"), nullable=False)
    name = Column(String(255), nullable=False)
    unit = Column(String(100))
    asset = Column(String(100))
    status = Column(Enum(ProjectStatus), default=ProjectStatus.DRAFT)
    risk = Column(String(50))
    progress = Column(Integer, default=0)
    classification = Column(Enum(DocumentClassification), default=DocumentClassification.INTERNAL)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="projects")
    tasks = relationship("Task", back_populates="project")
    artifacts = relationship("Artifact", back_populates="project")


class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(100), unique=True, index=True, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(Enum(TaskStatus), default=TaskStatus.TODO)
    priority = Column(Integer, default=3)
    owner_id = Column(Integer, ForeignKey("users.id"))
    due_date = Column(DateTime, nullable=True)
    asset = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="tasks")


class AgentRun(Base):
    __tablename__ = "agent_runs"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String(100), unique=True, index=True, nullable=False)
    company_id = Column(String(100), ForeignKey("companies.company_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    conversation_id = Column(String(100), index=True)
    query = Column(Text, nullable=False)
    status = Column(Enum(AgentRunStatus), default=AgentRunStatus.PENDING)
    model_used = Column(String(100))
    tools_used = Column(SQLiteJSON, default=list)
    documents_accessed = Column(SQLiteJSON, default=list)
    artifacts_generated = Column(SQLiteJSON, default=list)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    steps = relationship("AgentStep", back_populates="run", cascade="all, delete-orphan")


class AgentStep(Base):
    __tablename__ = "agent_steps"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("agent_runs.id"), nullable=False)
    step_index = Column(Integer, nullable=False)
    label = Column(String(255), nullable=False)
    tool = Column(String(100))
    status = Column(Enum(AgentStepStatus), default=AgentStepStatus.PENDING)
    input_data = Column(SQLiteJSON, default=dict)
    output_data = Column(SQLiteJSON, default=dict)
    duration_ms = Column(Integer)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    run = relationship("AgentRun", back_populates="steps")


class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String(100), unique=True, index=True, nullable=False)
    company_id = Column(String(100), ForeignKey("companies.company_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(String(100), unique=True, index=True, nullable=False)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    run_id = Column(String(100), nullable=True)
    sources = Column(SQLiteJSON, default=list)
    artifacts = Column(SQLiteJSON, default=list)
    meta = Column(SQLiteJSON, default=dict)
    attachments = Column(SQLiteJSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class Artifact(Base):
    __tablename__ = "artifacts"
    id = Column(Integer, primary_key=True, index=True)
    artifact_id = Column(String(100), unique=True, index=True, nullable=False)
    company_id = Column(String(100), ForeignKey("companies.company_id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    name = Column(String(255), nullable=False)
    artifact_type = Column(Enum(ArtifactType), nullable=False)
    file_path = Column(String(1000))
    status = Column(Enum(ArtifactStatus), default=ArtifactStatus.DRAFT)
    classification = Column(Enum(DocumentClassification), default=DocumentClassification.INTERNAL)
    created_by = Column(Integer, ForeignKey("users.id"))
    agent_run_id = Column(Integer, ForeignKey("agent_runs.id"), nullable=True)
    sources = Column(SQLiteJSON, default=list)
    ai_provenance = Column(SQLiteJSON, default=dict)
    version = Column(Integer, default=1, nullable=False)
    parent_artifact_id = Column(String(100), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="artifacts")


class Approval(Base):
    __tablename__ = "approvals"
    id = Column(Integer, primary_key=True, index=True)
    approval_id = Column(String(100), unique=True, index=True, nullable=False)
    artifact_id = Column(Integer, ForeignKey("artifacts.id"), nullable=False)
    requested_by = Column(Integer, ForeignKey("users.id"))
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(Enum(ApprovalStatus), default=ApprovalStatus.PENDING)
    comments = Column(Text, nullable=True)
    requested_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    artifact = relationship("Artifact")


class WorkOrder(Base):
    __tablename__ = "work_orders"
    id = Column(Integer, primary_key=True, index=True)
    wo_id = Column(String(100), unique=True, index=True, nullable=False)
    company_id = Column(String(100), ForeignKey("companies.company_id"), nullable=False)
    asset_id = Column(String(100))
    title = Column(String(255))
    description = Column(Text)
    status = Column(Enum(WorkOrderStatus), default=WorkOrderStatus.OPEN)
    priority = Column(Integer, default=3)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String(100), unique=True, index=True, nullable=False)
    company_id = Column(String(100), ForeignKey("companies.company_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    event_type = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(100))
    resource_id = Column(String(100))
    details = Column(SQLiteJSON, default=dict)
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class ModelRegistry(Base):
    __tablename__ = "model_registry"
    id = Column(Integer, primary_key=True, index=True)
    model_id = Column(String(100), unique=True, index=True, nullable=False)
    role = Column(String(50))
    provider = Column(String(50), default="ollama")
    is_local = Column(Boolean, default=True)
    capabilities = Column(SQLiteJSON, default=list)
    context_length = Column(Integer)
    vram_usage_gb = Column(Float)
    status = Column(Enum(ModelStatus), default=ModelStatus.UNAVAILABLE)
    last_checked = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)