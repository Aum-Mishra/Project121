from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.logging import get_logger
from app.rag.chat_vector_store import chat_vector_store
from app.rag.embeddings import get_embedding
from app.tools.base import BaseTool, ToolInput, ToolOutput, tool_registry

logger = get_logger(__name__)


async def search_chat_documents(
    query: str,
    company_id: str,
    user_id: int,
    conversation_id: str,
    limit: Optional[int] = None,
    content_limit: Optional[int] = None,
    allow_fallback: bool = False,
    document_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Semantic search over documents uploaded to THIS conversation only.

    Scope (company + user + conversation) is always enforced server-side inside
    the vector store - results can never leak across chats or users.

    When `allow_fallback` is set and semantic search returns nothing, the
    caller-provided `document_id` (or the first READY/uploaded document in the
    conversation) is fetched unscored as a last-resort grounding source so a
    document-only question is answered from the upload, never hallucinated from
    the permanent KB.
    """
    limit = limit or settings.chat_doc_retrieval_limit
    content_limit = content_limit or settings.retrieval_max_chars
    try:
        query_vector = await get_embedding(query)
        results = chat_vector_store.search(
            query_vector,
            company_id,
            user_id,
            conversation_id,
            limit=limit,
        )
    except Exception as e:
        logger.warning("chat_doc_search_failed", conversation_id=conversation_id, error=str(e))
        results = []

    if results:
        return _format_results(results, content_limit)

    if not allow_fallback:
        return []

    target_id = document_id
    if target_id is None:
        try:
            from app.db.models import ChatDocument, DocumentStatus
            from app.db.database import SessionLocal
            db = SessionLocal()
            try:
                row = db.query(ChatDocument).filter(
                    ChatDocument.company_id == company_id,
                    ChatDocument.user_id == user_id,
                    ChatDocument.conversation_id == conversation_id,
                    ChatDocument.status == DocumentStatus.READY,
                    ChatDocument.chunk_count > 0,
                ).order_by(ChatDocument.created_at.asc()).first()
                target_id = row.document_id if row else None
            finally:
                db.close()
        except Exception as e:
            logger.warning("chat_fallback_doc_lookup_failed", error=str(e))
            target_id = None

    if target_id is None:
        return []

    try:
        fallback = chat_vector_store.fetch_document_chunks(
            company_id, user_id, conversation_id, target_id, limit=limit
        )
    except Exception as e:
        logger.warning("chat_doc_fallback_fetch_failed", error=str(e))
        fallback = []
    return _format_results(fallback, content_limit)


def _format_results(results: List[Dict[str, Any]], content_limit: int) -> List[Dict[str, Any]]:
    formatted: List[Dict[str, Any]] = []
    for r in results:
        p = r.get("payload") or {}
        formatted.append({
            "document_id": p.get("document_id"),
            "document_name": p.get("filename"),
            "document_type": "CHAT_UPLOAD",
            "is_chat_document": True,
            "source": "search_chat_documents",
            "filename": p.get("filename"),
            "file_type": p.get("file_type"),
            "page_number": p.get("page_number"),
            "ocr_used": p.get("ocr_used", False),
            "relevance_score": round(r.get("score") or 0.0, 3),
            "content": (p.get("content") or "")[:content_limit],
        })
    return formatted


class ChatDocumentSearchInput(ToolInput):
    query: str
    limit: int = 8
    content_limit: int = None


class ChatDocumentSearchTool(BaseTool):
    name = "search_chat_documents"
    description = (
        "Search documents the user uploaded to this conversation (chat-scoped). "
        "Isolated from the permanent company knowledge base."
    )
    permission = "read"

    async def execute(self, input_data: Dict[str, Any], context: Dict[str, Any]) -> ToolOutput:
        conversation_id = context.get("conversation_id")
        company_id = context.get("company_id")
        user_id = context.get("user_id")
        if not conversation_id:
            return ToolOutput(success=False, error="Missing conversation_id in context")
        results = await search_chat_documents(
            input_data.get("query", ""),
            company_id,
            user_id,
            conversation_id,
            limit=input_data.get("limit"),
            content_limit=input_data.get("content_limit"),
        )
        return ToolOutput(success=True, data={"results": results, "total": len(results)})


tool_registry.register(ChatDocumentSearchTool())