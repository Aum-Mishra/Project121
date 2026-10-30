from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    echo=settings.app_env == "development",
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app.db.models import (
        User, Company, Document, DocumentChunk, Asset,
        Project, Task, AgentRun, AgentStep, Artifact,
        Approval, WorkOrder, AuditEvent, ModelRegistry,
        Conversation, Message, ChatDocument
    )
    Base.metadata.create_all(bind=engine)