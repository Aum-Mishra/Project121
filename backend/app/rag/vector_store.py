from typing import List, Dict, Any, Optional
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import (
        Distance, VectorParams, PointStruct, Filter, FieldCondition,
        MatchValue, MatchAny, PayloadSchemaType
    )
    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False
    QdrantClient = None


class VectorStore:
    def __init__(self, url: str = None, collection_name: str = None):
        self.url = url or settings.qdrant_url
        self.collection_name = collection_name or settings.qdrant_collection
        self.client = None
        if QDRANT_AVAILABLE:
            try:
                self.client = QdrantClient(url=self.url)
            except Exception as e:
                logger.warning("qdrant_connection_failed", error=str(e))

    def create_collection(self, vector_size: int = 1024) -> None:
        if not self.client:
            logger.warning("qdrant_not_available_skipping_collection_create")
            return
        try:
            collections = self.client.get_collections().collections
            names = [c.name for c in collections]
            if self.collection_name not in names:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
                )
                logger.info("collection_created", name=self.collection_name, vector_size=vector_size)

            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="company_id",
                field_schema=PayloadSchemaType.KEYWORD,
            )
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="document_id",
                field_schema=PayloadSchemaType.KEYWORD,
            )
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="asset_id",
                field_schema=PayloadSchemaType.KEYWORD,
            )
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="document_type",
                field_schema=PayloadSchemaType.KEYWORD,
            )
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="classification",
                field_schema=PayloadSchemaType.KEYWORD,
            )
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="year",
                field_schema=PayloadSchemaType.KEYWORD,
            )
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="department",
                field_schema=PayloadSchemaType.KEYWORD,
            )
        except Exception as e:
            logger.error("qdrant_create_collection_failed", error=str(e))

    def upsert_points(self, points: List[PointStruct], vector_size: int = 1024) -> None:
        if not self.client:
            logger.warning("qdrant_not_available_skipping_upsert")
            return
        try:
            # Auto-create collection if it doesn't exist
            collections = self.client.get_collections().collections
            names = [c.name for c in collections]
            if self.collection_name not in names:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
                )
                logger.info("collection_created", name=self.collection_name, vector_size=vector_size)
                
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="company_id",
                    field_schema=PayloadSchemaType.KEYWORD,
                )
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="document_id",
                    field_schema=PayloadSchemaType.KEYWORD,
                )
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="asset_id",
                    field_schema=PayloadSchemaType.KEYWORD,
                )
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="document_type",
                    field_schema=PayloadSchemaType.KEYWORD,
                )
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="classification",
                    field_schema=PayloadSchemaType.KEYWORD,
                )
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="year",
                    field_schema=PayloadSchemaType.KEYWORD,
                )
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="department",
                    field_schema=PayloadSchemaType.KEYWORD,
                )
            
            self.client.upsert(collection_name=self.collection_name, points=points)
            logger.info("points_upserted", count=len(points), collection=self.collection_name)
        except Exception as e:
            logger.error("qdrant_upsert_failed", error=str(e))

    def search(
        self,
        vector: List[float],
        company_id: str,
        limit: int = 10,
        score_threshold: float = 0.0,
        metadata_filter: Dict[str, Any] = None,
    ) -> List[Dict[str, Any]]:
        if not self.client:
            logger.warning("qdrant_not_available_returning_empty")
            return []
        try:
            filter_conditions = [FieldCondition(key="company_id", match=MatchValue(value=company_id))]
            if metadata_filter:
                for key, value in metadata_filter.items():
                    if value is None:
                        continue
                    if isinstance(value, (list, tuple, set)):
                        values = list(value)
                        filter_conditions.append(FieldCondition(key=key, match=MatchAny(any=values)))
                    else:
                        filter_conditions.append(FieldCondition(key=key, match=MatchValue(value=value)))

            search_filter = Filter(must=filter_conditions) if filter_conditions else None

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
                {
                    "id": r.id,
                    "score": r.score,
                    "payload": r.payload,
                }
                for r in results
            ]
        except Exception as e:
            logger.error("qdrant_search_failed", error=str(e))
            return []

    def delete_by_document(self, document_id: str, company_id: str) -> None:
        if not self.client:
            return
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=Filter(
                    must=[
                        FieldCondition(key="company_id", match=MatchValue(value=company_id)),
                        FieldCondition(key="document_id", match=MatchValue(value=document_id)),
                    ]
                ),
            )
            logger.info("points_deleted", document_id=document_id, company_id=company_id)
        except Exception as e:
            logger.error("qdrant_delete_failed", error=str(e))

    def upsert_chunks(self, company_id: str, document_id: str, chunks: List[Dict[str, Any]]) -> None:
        if not self.client:
            return
        points = []
        for chunk in chunks:
            payload = chunk.get("metadata", {})
            payload["company_id"] = company_id
            payload["document_id"] = document_id
            import uuid
            points.append(PointStruct(
                id=str(uuid.uuid4()),
                vector=chunk["embedding"],
                payload=payload
            ))
        self.upsert_points(points)

    def get_collection_info(self) -> Dict[str, Any]:
        if not self.client:
            return {"name": self.collection_name, "vectors_count": 0, "points_count": 0, "available": False}
        try:
            info = self.client.get_collection(self.collection_name)
            points_count = getattr(info, "points_count", 0)
            vectors = getattr(info, "vectors", None)
            if vectors is not None:
                vectors_count = getattr(vectors, "count", points_count)
            else:
                vectors_count = getattr(info, "vectors_count", points_count)
            return {
                "name": self.collection_name,
                "vectors_count": vectors_count,
                "points_count": points_count,
                "available": True,
            }
        except Exception as e:
            logger.error("qdrant_get_info_failed", error=str(e))
            return {"name": self.collection_name, "available": False}


vector_store = VectorStore()
