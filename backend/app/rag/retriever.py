from typing import List, Dict, Any, Optional
from app.rag.embeddings import get_embedding
from app.rag.vector_store import vector_store
from app.rag.keyword_search import create_keyword_search
from app.db.repositories import DocumentChunkRepository, DocumentRepository
from app.db.models import DocumentChunk, Document
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class HybridRetriever:
    def __init__(self, db):
        self.db = db
        self.chunk_repo = DocumentChunkRepository(db)
        self.keyword_search = create_keyword_search(db)

    async def retrieve(
        self,
        query: str,
        company_id: str,
        limit: int = None,
        metadata_filter: Dict[str, Any] = None,
        doc_ids: List[str] = None,
        semantic_weight: float = 0.7,
        keyword_weight: float = 0.3,
    ) -> List[Dict[str, Any]]:
        """Hybrid retrieval with relevance gating and per-document grouping.

        * semantic results (Qdrant) are filtered by a cosine similarity floor
        * keyword results (BM25) are filtered by a fraction of the best BM25 hit
        * chunks are grouped per document (best ``per_document`` each)
        * every hit is enriched with its semantic document metadata
        """
        limit = limit or settings.retrieval_default_limit
        min_semantic = settings.retrieval_min_semantic_score
        min_kw_ratio = settings.retrieval_min_keyword_score
        per_document = max(1, min(limit, 3))

        query_embedding = await get_embedding(query)

        semantic_results = vector_store.search(
            vector=query_embedding,
            company_id=company_id,
            limit=limit * 4,
            score_threshold=min_semantic,
            metadata_filter=metadata_filter,
        )

        # Keyword search is restricted to the semantically-gated document set so
        # that filters (asset/year/type/department) also constrain BM25 results
        # and irrelevant documents never sneak in via keyword-only matches.
        semantic_doc_ids = {r["payload"].get("document_id") for r in semantic_results if r["payload"].get("document_id")}
        if doc_ids:
            semantic_doc_ids &= set(doc_ids)
        if not semantic_doc_ids:
            return []
        target_row_ids = self._resolve_doc_row_ids(company_id, sorted(semantic_doc_ids))
        if not target_row_ids:
            return []

        keyword_results = self.keyword_search.search(
            query, company_id, limit * 4,
            doc_ids=target_row_ids, min_score_ratio=min_kw_ratio,
        )

        kw_chunk_ids = {r["chunk_id"] for r in keyword_results}

        combined = self._merge_results(
            semantic_results,
            keyword_results,
            company_id,
            semantic_weight,
            1.0 - semantic_weight,
            limit,
            per_document=per_document,
            kw_chunk_ids=kw_chunk_ids,
            strong_sem_threshold=0.50,
        )

        return combined

    def _resolve_doc_row_ids(self, company_id: str, doc_ids: List[str]) -> List[int]:
        row_ids = []
        repo = DocumentRepository(self.db)
        for doc_id in doc_ids:
            doc = repo.get_by_id(doc_id, company_id)
            if doc:
                row_ids.append(doc.id)
        return row_ids

    def _merge_results(
        self,
        semantic: List[Dict[str, Any]],
        keyword: List[Dict[str, Any]],
        company_id: str,
        sem_weight: float,
        kw_weight: float,
        limit: int,
        per_document: int,
        kw_chunk_ids: set = None,
        strong_sem_threshold: float = 0.50,
    ) -> List[Dict[str, Any]]:
        sem_map: Dict[int, float] = {}
        kw_map: Dict[int, float] = {}

        for r in semantic:
            chunk_id = r["payload"].get("chunk_id") or r["id"]
            sem_map[chunk_id] = max(sem_map.get(chunk_id, 0), r["score"])

        for r in keyword:
            kw_map[r["chunk_id"]] = max(kw_map.get(r["chunk_id"], 0), r["score"])

        kw_max = max(kw_map.values()) if kw_map else 0.0

        chunk_ids = set(sem_map) | set(kw_map)
        if not chunk_ids:
            return []

        chunks = self.db.query(DocumentChunk).filter(DocumentChunk.id.in_(chunk_ids)).all()
        chunk_by_id = {c.id: c for c in chunks}

        doc_cache: Dict[int, Document] = {}
        doc_repo = DocumentRepository(self.db)

        ranked = []
        for chunk_id in chunk_ids:
            if chunk_id not in chunk_by_id:
                continue
            sem = sem_map.get(chunk_id, 0.0)
            kw = kw_map.get(chunk_id, 0.0)
            kw_norm = (kw / kw_max) if (kw_max > 0 and kw > 0) else 0.0
            # Relevance gate: keep a chunk only if it got a lexical (BM25) hit
            # OR a strong semantic match. Nonsense/off-topic queries must not
            # retrieve anything just because cosine rarely falls to 0.
            if kw_chunk_ids is not None and chunk_id not in kw_chunk_ids and sem < strong_sem_threshold:
                continue
            score = sem * sem_weight + kw_norm * kw_weight
            ranked.append((score, chunk_id))

        ranked.sort(key=lambda x: x[1])
        ranked.sort(key=lambda x: x[0], reverse=True)

        # Per-document diversity: keep the best ``per_document`` chunks per doc.
        kept: List[int] = []
        counts: Dict[int, int] = {}
        for score, chunk_id in ranked:
            doc_row_id = chunk_by_id[chunk_id].document_id
            if counts.get(doc_row_id, 0) >= per_document:
                continue
            counts[doc_row_id] = counts.get(doc_row_id, 0) + 1
            kept.append(chunk_id)
            if len(kept) >= limit:
                break

        results = []
        for chunk_id in kept:
            chunk_obj = chunk_by_id[chunk_id]
            doc = doc_cache.get(chunk_obj.document_id)
            if doc is None:
                doc = doc_repo.get_by_db_id(chunk_obj.document_id, company_id)
                doc_cache[chunk_obj.document_id] = doc
            doc_id_str = doc.document_id if doc else str(chunk_obj.document_id)
            meta = chunk_obj.chunk_metadata or {}
            results.append({
                "chunk_id": chunk_id,
                "document_id": doc_id_str,
                "document_name": (doc.file_name if doc else meta.get("file_name")),
                "document_type": meta.get("document_type"),
                "asset_id": meta.get("asset_id"),
                "year": meta.get("year"),
                "department": meta.get("department"),
                "revision": doc.revision if doc else meta.get("revision"),
                "file_type": meta.get("file_type"),
                "classification": meta.get("classification"),
                "content": chunk_obj.content,
                "page_number": chunk_obj.page_number,
                "section": chunk_obj.section,
                "score": score,
                "metadata": meta,
            })

        return results

    async def retrieve_with_metadata(
        self,
        query: str,
        company_id: str,
        asset_id: str = None,
        document_type: str = None,
        classification: str = None,
        year: str = None,
        department: str = None,
        doc_ids: List[str] = None,
        limit: int = None,
    ) -> List[Dict[str, Any]]:
        metadata_filter = {}
        if asset_id:
            metadata_filter["asset_id"] = asset_id
        if document_type:
            metadata_filter["document_type"] = document_type
        if classification:
            metadata_filter["classification"] = classification
        if year is not None:
            metadata_filter["year"] = year
        if department:
            metadata_filter["department"] = department
        return await self.retrieve(query, company_id, limit, metadata_filter, doc_ids=doc_ids)

    async def get_asset_info(self, asset_id: str, company_id: str) -> Optional[Dict[str, Any]]:
        from app.db.repositories import AssetRepository
        asset = AssetRepository(self.db).get_by_id(asset_id, company_id)
        if not asset:
            return None
        return {
            "asset_id": asset.asset_id,
            "asset_type": asset.asset_type,
            "service": asset.service,
            "status": getattr(asset, "status", None),
        }