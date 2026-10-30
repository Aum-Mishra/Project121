from typing import List, Dict, Any, Optional
from app.rag.embeddings import get_embedding
from app.rag.vector_store import vector_store
from app.rag.keyword_search import create_keyword_search
from app.db.repositories import DocumentChunkRepository
from app.db.models import DocumentChunk, Document
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


import uuid
from app.core.security import ClassificationLevel
from app.db.models import AuditEvent, User, UserRole

ROLE_CLEARANCE_MAP = {
    "EMPLOYEE": ClassificationLevel.INTERNAL,
    "ENGINEER": ClassificationLevel.CONFIDENTIAL,
    "SUPERVISOR": ClassificationLevel.RESTRICTED,
    "APPROVER": ClassificationLevel.RESTRICTED,
    "ADMIN": ClassificationLevel.CRITICAL,
}


class HybridRetriever:
    def __init__(self, db):
        self.db = db
        self.chunk_repo = DocumentChunkRepository(db)
        self.keyword_search = create_keyword_search(db)

    def _resolve_user_clearance(self, user_id: Optional[int], explicit_clearance: Optional[str] = None) -> str:
        if explicit_clearance:
            return explicit_clearance.upper()
        if user_id:
            user = self.db.query(User).filter(User.id == user_id).first()
            if user and user.role:
                role_name = user.role.value if hasattr(user.role, "value") else str(user.role)
                return ROLE_CLEARANCE_MAP.get(role_name, ClassificationLevel.INTERNAL)
        # Default to CONFIDENTIAL for industrial engineering workbench if unspecified
        return ClassificationLevel.CONFIDENTIAL

    async def retrieve(
        self,
        query: str,
        company_id: str,
        limit: int = 10,
        metadata_filter: Dict[str, Any] = None,
        semantic_weight: float = 0.7,
        keyword_weight: float = 0.3,
        user_id: Optional[int] = None,
        user_clearance: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        query_embedding = await get_embedding(query)

        semantic_results = vector_store.search(
            vector=query_embedding,
            company_id=company_id,
            limit=limit * 2,
            metadata_filter=metadata_filter,
        )

        keyword_results = self.keyword_search.search(query, company_id, limit * 2)

        effective_clearance = self._resolve_user_clearance(user_id, user_clearance)

        combined = self._merge_results(
            semantic_results,
            keyword_results,
            semantic_weight,
            keyword_weight,
            limit,
            user_id=user_id,
            company_id=company_id,
            clearance=effective_clearance,
            query=query,
        )

        return combined

    def _merge_results(
        self,
        semantic: List[Dict[str, Any]],
        keyword: List[Dict[str, Any]],
        sem_weight: float,
        kw_weight: float,
        limit: int,
        user_id: Optional[int] = None,
        company_id: str = settings.company_id,
        clearance: str = ClassificationLevel.CONFIDENTIAL,
        query: str = "",
    ) -> List[Dict[str, Any]]:
        score_map = {}

        for r in semantic:
            chunk_id = r["payload"].get("chunk_id") or r["id"]
            score_map[chunk_id] = score_map.get(chunk_id, 0) + r["score"] * sem_weight

        for r in keyword:
            score_map[r["chunk_id"]] = score_map.get(r["chunk_id"], 0) + r["score"] * kw_weight

        sorted_chunks = sorted(score_map.items(), key=lambda x: x[1], reverse=True)[:limit * 2]

        results = []
        denied_attempts = 0

        for chunk_id, score in sorted_chunks:
            if len(results) >= limit:
                break
            chunk_obj = self.db.query(DocumentChunk).filter(DocumentChunk.id == chunk_id).first()
            if chunk_obj:
                doc = self.db.query(Document).filter(Document.id == chunk_obj.document_id).first()
                doc_id_str = doc.document_id if doc else str(chunk_obj.document_id)
                
                # Check document classification against user clearance
                doc_class = "INTERNAL"
                if doc and doc.classification:
                    doc_class = doc.classification.value if hasattr(doc.classification, "value") else str(doc.classification)
                elif chunk_obj.chunk_metadata and "classification" in chunk_obj.chunk_metadata:
                    doc_class = chunk_obj.chunk_metadata["classification"]
                
                if not ClassificationLevel.can_access(clearance, doc_class):
                    denied_attempts += 1
                    try:
                        self.db.add(AuditEvent(
                            event_id=str(uuid.uuid4()),
                            company_id=company_id,
                            user_id=user_id,
                            event_type="UNAUTHORIZED_ACCESS_ATTEMPT",
                            resource_type="document",
                            resource_id=doc_id_str,
                            details={
                                "user_clearance": clearance,
                                "document_classification": doc_class,
                                "query_snippet": query[:120],
                            },
                        ))
                        self.db.commit()
                    except Exception as e:
                        logger.error("audit_log_denied_attempt_failed", error=str(e))
                        self.db.rollback()
                    continue

                results.append({
                    "chunk_id": chunk_id,
                    "document_id": doc_id_str,
                    "content": chunk_obj.content,
                    "page_number": chunk_obj.page_number,
                    "section": chunk_obj.section,
                    "score": score,
                    "classification": doc_class,
                    "metadata": chunk_obj.chunk_metadata,
                })

        return results

    async def retrieve_with_metadata(
        self,
        query: str,
        company_id: str,
        asset_id: str = None,
        document_type: str = None,
        classification: str = None,
        limit: int = 10,
        user_id: Optional[int] = None,
        user_clearance: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        metadata_filter = {}
        if asset_id:
            metadata_filter["asset_id"] = asset_id
        if document_type:
            metadata_filter["document_type"] = document_type
        if classification:
            metadata_filter["classification"] = classification

        return await self.retrieve(
            query=query,
            company_id=company_id,
            limit=limit,
            metadata_filter=metadata_filter,
            user_id=user_id,
            user_clearance=user_clearance,
        )