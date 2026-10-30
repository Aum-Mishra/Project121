from sqlalchemy import Column, Integer, String, Float, JSON, DateTime, Text
import datetime
from .database import Base

def _now():
    return datetime.datetime.utcnow()

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, unique=True, index=True)
    owner = Column(String, nullable=True)
    company_id = Column(String, default="MRPL")
    name = Column(String)
    unit = Column(String, nullable=True)
    asset = Column(String, nullable=True)
    status = Column(String, default="DRAFT")
    risk = Column(String, nullable=True)
    progress = Column(Integer, default=0)
    classification = Column(String, default="INTERNAL")
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

class Artifact(Base):
    __tablename__ = "artifacts"
    id = Column(Integer, primary_key=True, index=True)
    artifact_id = Column(String, unique=True, index=True)
    name = Column(String)
    artifact_type = Column(String, default="DOCUMENT")
    format = Column(String, default="docx")
    file_path = Column(String, nullable=True)
    status = Column(String, default="READY_FOR_REVIEW")
    classification = Column(String, default="CONFIDENTIAL")
    project_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=_now)

class Approval(Base):
    __tablename__ = "approvals"
    id = Column(Integer, primary_key=True, index=True)
    approval_id = Column(String, unique=True, index=True)
    artifact_id = Column(Integer, nullable=False)
    artifact_uuid = Column(String, nullable=True)
    artifact_name = Column(String, nullable=True)
    artifact_type = Column(String, nullable=True)
    download_url = Column(String, nullable=True)
    requested_by = Column(Integer, default=1)
    requested_by_name = Column(String, nullable=True)
    reviewed_by = Column(Integer, nullable=True)
    reviewed_by_name = Column(String, nullable=True)
    status = Column(String, default="PENDING")
    comments = Column(Text, nullable=True)
    requested_at = Column(DateTime, default=_now)
    reviewed_at = Column(DateTime, nullable=True)

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, unique=True, index=True)
    name = Column(String)
    department = Column(String)
    role = Column(String)
    leave_balance = Column(Float)
    metadata_json = Column(JSON, nullable=True)

class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(String, unique=True, index=True)
    name = Column(String)
    category = Column(String)
    operating_pressure = Column(Float, nullable=True)
    max_pressure = Column(Float, nullable=True)
    metadata_json = Column(JSON, nullable=True)

class Inspection(Base):
    __tablename__ = "inspections"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(String, index=True)
    year = Column(Integer)
    pressure = Column(Float)
    corrosion = Column(Float)
    vibration = Column(Float)
    verdict = Column(String)

class ProjectChat(Base):
    """A chat that belongs to exactly one project workspace.

    Every message is stored with the project id and the contributor that sent /
    created it, so project chats are fully isolated between projects and survive
    refresh/restart. ``updated_at`` drives last-modified sorting (newest first).
    """
    __tablename__ = "project_chats"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, index=True)
    title = Column(String, default="New Chat")
    created_by = Column(String, nullable=True, default="Anita Rao")
    messages = Column(JSON, default=list)
    context = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


class CodingChatBinding(Base):
    """Maps a chat conversation to a persistent Coding Agent session/workspace so
    a follow-up coding query in the SAME chat edits the SAME project."""
    __tablename__ = "coding_chat_bindings"
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String, unique=True, index=True)
    session_id = Column(String, nullable=True)
    root = Column(String, nullable=True)
    project_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)
