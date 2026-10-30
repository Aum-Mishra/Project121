from typing import Dict, Any, List, Optional
from uuid import uuid4

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import (
        Distance, VectorParams, PointStruct, Filter,
        FieldCondition, MatchValue, PayloadSchemaType,
    )
    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False
    QdrantClient = None


class ChatVectorStore:
    """Qdrant store for chat-scoped document chunks.

    Lives in its own dedicated collection (settings.chat_doc_collection) that is
    fully separated from the permanent company RAG collection. Membership is
    enforced server-side via mandatory payload filtering on (company_id, user_id,
    conversation_id) for EVERY query/delete - a document uploaded to one chat can
    never be retrieved from another chat or user, and chat uploads never mix with
    the permanent knowledge base.
    """

    SCOPE_FIELDS = ["company_id", "user_id", "conversation_id"]

    def __init__(self, url: Optional[str] = None, collection_name: Optional[str] = None):
        self.url = url or settings.qdrant_url
        self.collection_name = collection_name or settings.chat_doc_collection
        self.client = None
        if QDRANT_AVAILABLE:
            try:
                self.client = QdrantClient(url=self.url)
            except Exception as e:
                logger.warning("chat_qdrant_connection_failed", error=str(e))

    def ensure_collection(self, vector_size: Optional[int] = None) -> None:
        vector_size = vector_size or settings.chat_doc_embedding_size
        if not self.client:
            logger.warning("chat_qdrant_not_available_skipping_collection")
            return
        try:
            names = [c.name for c in self.client.get_collections().collections]
            if self.collection_name not in names:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
                )
                logger.info("chat_collection_created", name=self.collection_name, vector_size=vector_size)
            for field in self.SCOPE_FIELDS + ["document_id"]:
                try:
                    self.client.create_payload_index(
                        collection_name=self.collection_name,
                        field_name=field,
                        field_schema=PayloadSchemaType.KEYWORD,
                    )
                except Exception:
                    pass  # index already exists
        except Exception as e:
            logger.error("chat_collection_init_failed", error=str(e))

    def _scope_filter(self, company_id: str, user_id: int, conversation_id: str) -> Filter:
        return Filter(must=[
            FieldCondition(key="company_id", match=MatchValue(value=company_id)),
            FieldCondition(key="user_id", match=MatchValue(value=str(user_id))),
            FieldCondition(key="conversation_id", match=MatchValue(value=conversation_id)),
        ])

    def upsert_chunks(
        self,
        company_id: str,
        user_id: int,
        conversation_id: str,
        document_id: str,
        chunks: List[Dict[str, Any]],
    ) -> int:
        if not self.client or not chunks:
            return 0
        points = []
        for i, c in enumerate(chunks):
            points.append(PointStruct(
                id=str(uuid4()),
                vector=c["embedding"],
                payload={
                    "company_id": company_id,
                    "user_id": str(user_id),
                    "conversation_id": conversation_id,
                    "document_id": document_id,
                    "chunk_id": c.get("chunk_id") or f"{document_id}-{i}",
                    "filename": c.get("filename"),
                    "file_type": c.get("file_type"),
                    "page_number": c.get("page_number"),
                    "content": c.get("content"),
                    "ocr_used": bool(c.get("ocr_used")),
                    "source": "chat_upload",
                },
            ))
        try:
            self.client.upsert(collection_name=self.collection_name, points=points)
            logger.info("chat_chunks_upserted", count=len(points), document_id=document_id)
            return len(points)
        except Exception as e:
            logger.error("chat_chunks_upsert_failed", document_id=document_id, error=str(e))
            raise

    def search(
        self,
        vector: List[float],
        company_id: str,
        user_id: int,
        conversation_id: str,
        limit: Optional[int] = None,
        score_threshold: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        limit = limit or settings.chat_doc_retrieval_limit
        score_threshold = settings.chat_doc_retrieval_min_score if score_threshold is None else score_threshold
        if not self.client:
            logger.warning("chat_qdrant_not_available_returning_empty")
            return []
        try:
            search_filter = self._scope_filter(company_id, user_id, conversation_id)
            if hasattr(self.client, "query_points"):
                response = self.client.query_points(
                    collection_name=self.collection_name,
                    query=vector,
                    query_filter=search_filter,
                    limit=limit,
                    score_threshold=score_threshold,
                    with_payload=True,
                )
                results = response.points
            else:
                results = self.client.search(
                    collection_name=self.collection_name,
                    query_vector=vector,
                    query_filter=search_filter,
                    limit=limit,
                    score_threshold=score_threshold,
                    with_payload=True,
                )
            return [
                {"id": r.id, "score": r.score, "payload": r.payload}
                for r in results
            ]
        except Exception as e:
            logger.error("chat_search_failed", error=str(e))
            return []

    def fetch_document_chunks(
        self,
        company_id: str,
        user_id: int,
        conversation_id: str,
        document_id: str,
        limit: Optional[int] = None,
        page_number=None,
    ) -> List[Dict[str, Any]]:
        """Unscored (scroll/prefix) fetch of a document's chunks.

        Used as a fallback when semantic search returns nothing for a
        document-only query (e.g. EllipticNaturalLanguage queries like
        'what does this image show' that are poor vector queries). Scope is
        always enforced server-side: the retrieval is restricted to (company,
        user, conversation, document)."""
        limit = limit or settings.chat_doc_retrieval_limit
        if not self.client:
            logger.warning("chat_qdrant_not_available_returning_empty")
            return []
        try:
            scope = list(self._scope_filter(company_id, user_id, conversation_id).must)
            scope.append(FieldCondition(key="document_id", match=MatchValue(value=document_id)))
            if page_number is not None:
                scope.append(FieldCondition(
                    key="page_number", match=MatchValue(value=int(page_number))
                ))
            f = Filter(must=scope)
            response = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=f,
                limit=limit,
                with_payload=True,
                with_vectors=False,
            )
            points, _next = (response if isinstance(response, tuple) else (response.points, None))
            return [
                {"score": 0.0, "payload": r.payload}
                for r in (points or [])
            ]
        except Exception as e:
            logger.error("chat_fetch_chunks_failed", document_id=document_id, error=str(e))
            return []

    def delete_document(
        self,
        company_id: str,
        user_id: int,
        conversation_id: str,
        document_id: str,
    ) -> int:
        return self._delete_filtered(
            company_id, user_id, conversation_id,
            must_extra=[FieldCondition(key="document_id", match=MatchValue(value=document_id))],
            label=document_id,
        )

    def delete_conversation(
        self,
        company_id: str,
        user_id: int,
        conversation_id: str,
    ) -> int:
        return self._delete_filtered(company_id, user_id, conversation_id, must_extra=[], label=conversation_id)

    def _delete_filtered(
        self,
        company_id: str,
        user_id: int,
        conversation_id: str,
        must_extra: List[FieldCondition],
        label: str,
    ) -> int:
        if not self.client:
            return 0
        try:
            scope = self._scope_filter(company_id, user_id, conversation_id)
            f = Filter(must=list(scope.must) + must_extra)
            count = self.count(f)
            self.client.delete(collection_name=self.collection_name, points_selector=f)
            logger.info("chat_points_deleted", scope=label, count=count)
            return count
        except Exception as e:
            logger.error("chat_delete_failed", scope=label, error=str(e))
            return 0

    def count(self, filter_: Optional[Filter] = None) -> int:
        if not self.client:
            return 0
        try:
            result = self.client.count(collection_name=self.collection_name, count_filter=filter_)
            return int(getattr(result, "count", 0) or 0)
        except Exception as e:
            logger.error("chat_count_failed", error=str(e))
            return 0

    def get_collection_info(self) -> Dict[str, Any]:
        if not self.client:
            return {"name": self.collection_name, "available": False}
        try:
            info = self.client.get_collection(self.collection_name)
            points_count = getattr(info, "points_count", 0)
            return {"name": self.collection_name, "points_count": points_count, "available": True}
        except Exception as e:
            logger.error("chat_get_info_failed", error=str(e))
            return {"name": self.collection_name, "available": False}


chat_vector_store = ChatVectorStore()


async def ensure_collection() -> None:
    chat_vector_store.ensure_collection()