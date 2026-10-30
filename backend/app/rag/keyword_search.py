from typing import List, Dict, Any, Optional
from app.db.repositories import DocumentChunkRepository, DocumentRepository
from app.core.logging import get_logger

logger = get_logger(__name__)

try:
    from rank_bm25 import BM25Okapi
    BM25_AVAILABLE = True
except ImportError:
    BM25_AVAILABLE = False
    BM25Okapi = None


class KeywordSearch:
    def __init__(self, db):
        self.db = db
        self.chunk_repo = DocumentChunkRepository(db)
        # cache is keyed per company so switching tenants does not leak corpora
        self._caches: Dict[str, Dict[str, Any]] = {}

    def _initialize(self, company_id: str):
        if company_id in self._caches or not BM25_AVAILABLE:
            return

        doc_repo = DocumentRepository(self.db)
        docs = doc_repo.list(company_id)
        doc_rows = {d.id: d for d in docs}

        cache = {"corpus": [], "chunk_ids": [], "doc_row_ids": [], "contents": [], "bm25": None}
        for doc_row_id in doc_rows:
            try:
                doc_chunks = self.chunk_repo.get_by_document(doc_row_id)
            except Exception:
                continue
            for chunk in doc_chunks:
                cache["corpus"].append((chunk.content or "").lower().split())
                cache["chunk_ids"].append(chunk.id)
                cache["doc_row_ids"].append(int(chunk.document_id))
                cache["contents"].append(chunk.content)

        if cache["corpus"] and BM25Okapi:
            cache["bm25"] = BM25Okapi(cache["corpus"])
        self._caches[company_id] = cache

    def search(
        self,
        query: str,
        company_id: str,
        limit: int = 10,
        min_score_ratio: float = 0.5,
        doc_ids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        self._initialize(company_id)
        cache = self._caches.get(company_id)
        if not cache or not cache.get("bm25") or not cache.get("corpus"):
            return []

        tokenized_query = (query or "").lower().split()
        if not tokenized_query:
            return []
        scores = cache["bm25"].get_scores(tokenized_query)
        if hasattr(scores, "tolist"):
            scores = scores.tolist()

        max_score = max(scores) if scores else 0.0
        if max_score <= 0:
            return []

        allowed = None
        if doc_ids:
            allowed = set(int(i) for i in doc_ids)

        scored = []
        for idx, score in enumerate(scores):
            if allowed is not None and cache["doc_row_ids"][idx] not in allowed:
                continue
            if score <= 0:
                continue
            if score < max_score * min_score_ratio:
                continue
            scored.append((score, idx))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:limit]

        return [
            {
                "chunk_id": cache["chunk_ids"][idx],
                "document_id": str(cache["doc_row_ids"][idx]),
                "content": cache["contents"][idx],
                "score": float(score),
            }
            for score, idx in top
        ]


def create_keyword_search(db) -> KeywordSearch:
    return KeywordSearch(db)