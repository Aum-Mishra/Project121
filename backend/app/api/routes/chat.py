from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, AsyncGenerator, Tuple
from app.db.database import get_db
from app.api.dependencies import get_current_user, get_optional_current_user
from app.db.models import User
from app.db.repositories import ConversationRepository
from app.services.chat_service import ChatService
from app.services.chat_document_service import ChatDocumentService, trigger_chat_document_processing
from app.services.chat_attachment_service import clear_conversation_attachments
from app.core.config import settings
from app.core.logging import get_logger
import json
import uuid

logger = get_logger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


def _resolve_chat_scope(
    db: Session,
    conversation_id: str,
    current_user: Optional[User],
) -> Tuple[str, int]:
    """Resolve the authoritative (company, user) scope for a conversation.

    The scope always comes from the server: an authenticated user only ever sees
    conversations they own (403 otherwise); anonymous/legacy requests fall back
    to the documented default (company_id, system user 1) so existing flows and
    e2e tests keep working untouched.
    """
    repo = ConversationRepository(db)
    if current_user is not None:
        conv = repo.get_by_conversation_id(conversation_id)
        if conv is not None and (
            conv.user_id != current_user.id or conv.company_id != current_user.company_id
        ):
            raise HTTPException(
                status_code=403,
                detail="Conversation belongs to a different user or company",
            )
        company_id = current_user.company_id
        user_id = current_user.id
    else:
        company_id = settings.company_id
        user_id = 1
    repo.get_or_create_by_conversation_id(conversation_id, company_id, user_id)
    return company_id, user_id


@router.post("/attachments")
async def upload_chat_attachment(
    conversation_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    company_id, user_id = _resolve_chat_scope(db, conversation_id, current_user)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    service = ChatDocumentService(db)
    try:
        result = service.save_upload(conversation_id, company_id, user_id, file.filename or "file", content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    trigger_chat_document_processing(result["document_id"])
    return result


@router.get("/attachments")
async def list_chat_attachments(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    company_id, user_id = _resolve_chat_scope(db, conversation_id, current_user)
    service = ChatDocumentService(db)
    docs = service.list_documents(conversation_id, company_id, user_id)
    return {
        "conversation_id": conversation_id,
        "attachments": [service.serialize(d) for d in docs],
        "total": len(docs),
    }


@router.delete("/attachments/{document_id}")
async def delete_chat_attachment(
    document_id: str,
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    company_id, user_id = _resolve_chat_scope(db, conversation_id, current_user)
    service = ChatDocumentService(db)
    deleted = service.delete_document(conversation_id, company_id, user_id, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat document not found")
    return {"document_id": document_id, "deleted": True}


@router.post("/attachments/{document_id}/process")
async def process_chat_attachment(
    document_id: str,
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    company_id, user_id = _resolve_chat_scope(db, conversation_id, current_user)
    service = ChatDocumentService(db)
    doc = service.get_document(conversation_id, company_id, user_id, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Chat document not found")
    status_value = doc.status.value if hasattr(doc.status, "value") else str(doc.status)
    if status_value == "READY":
        return {"document_id": document_id, "status": "READY", "triggered": False}
    trigger_chat_document_processing(document_id)
    return {"document_id": document_id, "status": status_value, "triggered": True}


class ChatRequest(BaseModel):
    query: str
    conversation_id: Optional[str] = None
    model: Optional[str] = None


class ChatResponse(BaseModel):
    conversation_id: str
    run_id: str
    answer: str
    evidence: list
    model: str


async def event_generator(
    query: str,
    company_id: str,
    user_id: int,
    conversation_id: str,
    db: Session,
) -> AsyncGenerator[str, None]:
    chat_service = ChatService(db)
    async for event in chat_service.process_chat(query, company_id, user_id, conversation_id):
        yield f"data: {json.dumps(event)}\n\n"


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    conversation_id = request.conversation_id or str(uuid.uuid4())
    company_id, user_id = _resolve_chat_scope(db, conversation_id, current_user)

    chat_service = ChatService(db)
    final = {"answer": "", "evidence": [], "model": "", "run_id": ""}
    async for event in chat_service.process_chat(request.query, company_id, user_id, conversation_id):
        if event.get("event") == "run_completed":
            final["answer"] = event.get("answer", "")
            final["evidence"] = event.get("evidence", [])
            final["model"] = event.get("model", "")
            final["run_id"] = event.get("run_id", "")

    return ChatResponse(
        conversation_id=conversation_id,
        run_id=final["run_id"],
        answer=final["answer"],
        evidence=final["evidence"],
        model=final["model"],
    )


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    conversation_id = request.conversation_id or str(uuid.uuid4())
    company_id, user_id = _resolve_chat_scope(db, conversation_id, current_user)

    return StreamingResponse(
        event_generator(request.query, company_id, user_id, conversation_id, db),
        media_type="text/event-stream",
    )


@router.post("/conversations")
async def create_conversation(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    conversation_id = str(uuid.uuid4())
    company_id, user_id = _resolve_chat_scope(db, conversation_id, current_user)
    repo = ConversationRepository(db)
    conv = repo.get_by_conversation_id(conversation_id)
    return {
        "conversation_id": conv.conversation_id,
        "title": conv.title,
        "created_at": str(conv.created_at),
    }


@router.get("/conversations")
async def list_conversations(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    if current_user is not None:
        company_id = current_user.company_id
        user_id = current_user.id
    else:
        company_id = settings.company_id
        user_id = 1
    repo = ConversationRepository(db)
    conversations = repo.list_by_user(company_id, user_id)
    return {
        "conversations": [
            {
                "conversation_id": c.conversation_id,
                "title": c.title,
                "created_at": str(c.created_at),
                "updated_at": str(c.updated_at),
            }
            for c in conversations
        ],
        "total": len(conversations),
    }


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    company_id, user_id = _resolve_chat_scope(db, conversation_id, current_user)
    repo = ConversationRepository(db)
    messages = repo.get_messages(conversation_id)
    return {
        "conversation_id": conversation_id,
        "messages": [
            {
                "message_id": m.message_id,
                "role": m.role,
                "content": m.content,
                "run_id": m.run_id,
                "sources": m.sources or [],
                "artifacts": m.artifacts or [],
                "meta": m.meta or {},
                "attachments": m.attachments or [],
                "created_at": str(m.created_at),
            }
            for m in messages
        ],
        "total": len(messages),
    }


class RenameConversationRequest(BaseModel):
    title: str


def _enforce_ownership(db: Session, conversation_id: str, current_user: User):
    repo = ConversationRepository(db)
    conv = repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.user_id != current_user.id or conv.company_id != current_user.company_id:
        raise HTTPException(
            status_code=403,
            detail="Conversation belongs to a different user or company",
        )
    return conv


@router.patch("/conversations/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    request: RenameConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = ConversationRepository(db)
    title = (request.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    _enforce_ownership(db, conversation_id, current_user)
    conv = repo.rename(conversation_id, title)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "conversation_id": conv.conversation_id,
        "title": conv.title,
        "created_at": str(conv.created_at),
        "updated_at": str(conv.updated_at),
    }


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = ConversationRepository(db)
    conv = _enforce_ownership(db, conversation_id, current_user)
    try:
        clear_conversation_attachments(conversation_id)
    except Exception:
        pass
    try:
        service = ChatDocumentService(db)
        service.delete_conversation_documents(conversation_id, conv.company_id, conv.user_id)
    except Exception as e:
        logger.warning("chat_doc_conversation_cleanup_failed", error=str(e))
    existed = repo.delete(conversation_id)
    if not existed:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"conversation_id": conversation_id, "deleted": True}


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    company_id, user_id = _resolve_chat_scope(db, conversation_id, current_user)
    from app.db.models import AgentRun
    runs = db.query(AgentRun).filter(
        AgentRun.conversation_id == conversation_id
    ).order_by(AgentRun.started_at.desc()).all()

    return {"conversation_id": conversation_id, "runs": [r.run_id for r in runs]}