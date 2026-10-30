from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from .config import VECTOR_DB_PATH, VECTOR_COLLECTION, LLM_MODE

if LLM_MODE == 'local':
    VECTOR_COLLECTION = 'mrpl_knowledge_local'
import uuid

# Use local disk storage
client = QdrantClient(path=VECTOR_DB_PATH)

_searchable_extensions = ('.json', '.jsonl', '.yaml', '.yml', '.csv', '.md', '.txt')


def get_live_embedding_dim():
    """Returns the dimensionality of the live embedding model (cached after the first probe)."""
    if get_live_embedding_dim._cached is not None:
        return get_live_embedding_dim._cached
    from .llm_provider import get_embedding
    try:
        probe = get_embedding("probe")
        dim = len(probe)
        get_live_embedding_dim._cached = dim
        return dim
    except Exception as e:
        print(f"Failed to probe embedding dimension: {e}")
        return 768


get_live_embedding_dim._cached = None  # type: ignore[attr-defined]


def collection_stats(collection_name: str = None):
    """Diagnostics helper: returns (dim, count) for a collection or None if missing."""
    name = collection_name or VECTOR_COLLECTION
    try:
        collections = [c.name for c in client.get_collections().collections]
        if name not in collections:
            return None
        info = client.get_collection(name)
        count = client.count(collection_name=name).count
        return (info.config.params.vectors.size, count)
    except Exception as e:
        print(f"Failed to read collection stats for {name}: {e}")
        return None


def ensure_collection(collection_name: str = None, vector_size: int = None):
    """
    Creates the collection if missing, or self-heals it when its dimension no
    longer matches the live embedding model (which silently breaks similarity
    search and makes Qdrant return 0 documents).
    """
    name = collection_name or VECTOR_COLLECTION
    target = vector_size or get_live_embedding_dim()

    try:
        collections = [c.name for c in client.get_collections().collections]
        if name not in collections:
            client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=target, distance=Distance.COSINE),
            )
            print(f"[vector_store] Created collection '{name}' with {target} dims.")
            return
        info = client.get_collection(name)
        current = info.config.params.vectors.size
        if current != target:
            print(f"[vector_store] Dimension mismatch in '{name}' ({current} vs {target}); recreating collection...")
            client.delete_collection(name)
            client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=target, distance=Distance.COSINE),
            )
            print(f"[vector_store] Recreated collection '{name}' with {target} dims.")
    except Exception as e:
        print(f"Failed to init Qdrant: {e}")


def init_qdrant(vector_size: int = None):
    ensure_collection(vector_size=vector_size)


def insert_document(text: str, vector: list[float], metadata: dict):
    try:
        point_id = str(uuid.uuid4())
        client.upsert(
            collection_name=VECTOR_COLLECTION,
            points=[
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={"text": text, **metadata}
                )
            ]
        )
    except Exception as e:
        print(f"Failed to insert into Qdrant: {e}")


def search_documents(query_vector: list[float], allowed_roles: list[str], limit=5, query_text: str | None = None):
    try:
        # Check if collection exists to avoid crashes
        collections = [c.name for c in client.get_collections().collections]
        if VECTOR_COLLECTION not in collections:
            ensure_collection()
            collections = [c.name for c in client.get_collections().collections]
            if VECTOR_COLLECTION not in collections:
                print(f"Collection {VECTOR_COLLECTION} does not exist.")
                return lexical_fallback(query_text, limit)

        stats = collection_stats(VECTOR_COLLECTION)
        if stats is None:
            return lexical_fallback(query_text, limit)
        dim, count = stats
        live_dim = get_live_embedding_dim()
        if count == 0:
            print(f"Qdrant collection {VECTOR_COLLECTION} is EMPTY ({count} points). Searches fall back to Lexical.")
            return lexical_fallback(query_text, limit)
        if dim != live_dim or len(query_vector) != dim:
            print(f"Qdrant dimension mismatch ({dim} collection vs {len(query_vector)} query / {live_dim} live). "
                  f"Falling back to Lexical until re-ingestion completes.")
            return lexical_fallback(query_text, limit)

        role_filter = Filter(
            should=[
                FieldCondition(
                    key="access_roles",
                    match=MatchValue(value=role)
                ) for role in allowed_roles
            ]
        )

        # Handle API change dynamically or just use query_points
        if hasattr(client, 'query_points'):
            response = client.query_points(
                collection_name=VECTOR_COLLECTION,
                query=query_vector,
                query_filter=role_filter,
                limit=limit
            )
            # query_points returns QueryResponse containing .points
            return getattr(response, 'points', [])
        else:
            # Fallback if older client
            return client.search(
                collection_name=VECTOR_COLLECTION,
                query_vector=query_vector,
                query_filter=role_filter,
                limit=limit
            )
    except Exception as e:
        print(f"Qdrant Search Error: {e}")
        return lexical_fallback(query_text, limit)


def lexical_fallback(query_text: str | None, limit: int):
    if not query_text:
        return []
    try:
        from .lexical_fallback import lexical_search
        docs = lexical_search(query_text, limit=limit)
        if docs:
            print(f"Lexical fallback returned {len(docs)} docs.")
        return docs
    except Exception as fe:
        print(f"Lexical fallback also failed: {fe}")
        return []