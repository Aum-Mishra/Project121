import re
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue, MatchText
from .config import VECTOR_DB_PATH, VECTOR_COLLECTION, LLM_MODE

if LLM_MODE == 'local':
    VECTOR_COLLECTION = 'mrpl_knowledge_local'
elif LLM_MODE == 'cloud':
    # Keep cloud embeddings in their own namespace. Switching modes must never
    # delete/recreate (i.e. wipe) the existing local RAG index.
    _base = VECTOR_COLLECTION[:-6] if VECTOR_COLLECTION.endswith('_local') else VECTOR_COLLECTION
    VECTOR_COLLECTION = f'{_base}_cloud'
import uuid

# Use local disk storage
client = QdrantClient(path=VECTOR_DB_PATH)

_searchable_extensions = ('.json', '.jsonl', '.yaml', '.yml', '.csv', '.md', '.txt')


def get_live_embedding_dim():
    """Dimensionality of the live embedding model, or ``None`` when the active
    provider cannot serve embeddings.

    Returning ``None`` (instead of a guessed 768) is important: it prevents the
    collection from being silently recreated with the wrong size — which is
    guaranteed to happen in cloud mode when no Nebius embedding model is
    configured.  Retrieval then falls back to the lexical index.
    """
    if get_live_embedding_dim._cached is not None:
        return get_live_embedding_dim._cached
    from .llm_provider import get_embedding
    try:
        probe = get_embedding("probe")
        dim = len(probe)
        if not dim:
            raise ValueError("empty embedding vector")
        get_live_embedding_dim._cached = dim
        return dim
    except Exception as e:
        print(f"Failed to probe embedding dimension: {e}")
        return None


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
    if not target:
        print(f"[vector_store] No live embedding provider; leaving '{name}' untouched "
              f"(retrieval will use lexical search).")
        return

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


def project_keywords(project: dict | None) -> list[str]:
    """Return lowercase anchor terms linking knowledge-base documents to a project.

    Anchors are built from the project's asset/unit codes, its DB id and topic
    words extracted from the project name. Retrieval is then restricted to this
    anchor set so answers never mix in documents from other projects.
    """
    if not project:
        return []
    anchors: list[str] = []
    for key in ("asset", "unit", "project_id", "name"):
        val = project.get(key)
        if not val:
            continue
        raw = str(val)
        anchors.append(raw.lower())
        for token in re.split(r"[^A-Za-z0-9]+", raw):
            if len(token) >= 2:
                anchors.append(token.lower())
        # Hyphen-less variant of asset/unit codes so production doc names like
        # "CDU4_maintenance_backlog.pdf" (no hyphen) also match "CDU-4".
        compact = re.sub(r"[^A-Za-z0-9]+", "", raw).lower()
        if len(compact) >= 3 and compact != raw.lower():
            anchors.append(compact)
    name = str(project.get("name") or "").lower()
    topic_map = [
        ("pump", "pump"), ("inspection", "inspection"), ("risk", "risk"),
        ("corrosion", "corrosion"), ("cui", "cui"), ("under insulation", "under"),
        ("turnaround", "turnaround"), ("vendor", "vendor"), ("c-4", "cx-4"),
        ("reformer", "reformer"), ("training", "training"), ("onboarding", "onboarding"),
        ("performance", "performance"), ("maintenance", "maintenance"),
        ("reliability", "reliability"), ("evaluation", "evaluation"),
        ("anomaly", "anomaly"), ("pipeline", "pipeline"), ("optimisation", "optimis"),
        ("study", "study"), ("planning", "planning"), ("analysis", "analysis"),
    ]
    for needle, anchor in topic_map:
        if needle in name:
            anchors.append(anchor)
    unit = str(project.get("unit") or "").lower()
    if unit in ("hr", "human resources", "people"):
        anchors.append("hr")
    seen: set[str] = set()
    out: list[str] = []
    for a in anchors:
        a = a.strip().lower()
        if a and a not in seen and not str(a).startswith("prj-"):
            seen.add(a)
            out.append(a)
    return out


def search_project_documents(query_vector: list[float], allowed_roles: list[str],
                             project: dict | None, limit: int = 8):
    """Project-scoped vector search.

    Only documents whose ``document_name`` contains a project anchor qualify, so
    the result set is restricted to the selected project's knowledge base. Falls
    back to the generic search when no project scope is provided.
    """
    if not project:
        return search_documents(query_vector, allowed_roles, limit=limit)
    anchors = project_keywords(project)
    if not anchors:
        return search_documents(query_vector, allowed_roles, limit=limit)
    try:
        collections = [c.name for c in client.get_collections().collections]
        if VECTOR_COLLECTION not in collections:
            return lexical_fallback("", limit)
        name_conds = [FieldCondition(key="document_name", match=MatchText(text=a)) for a in anchors]
        role_conds = [FieldCondition(key="access_roles", match=MatchValue(value=r)) for r in allowed_roles]
        query_filter = Filter(must=[Filter(should=name_conds), Filter(should=role_conds)])
        if hasattr(client, "query_points"):
            response = client.query_points(
                collection_name=VECTOR_COLLECTION,
                query=query_vector,
                query_filter=query_filter,
                limit=limit,
            )
            return getattr(response, "points", [])
        return client.search(
            collection_name=VECTOR_COLLECTION,
            query_vector=query_vector,
            query_filter=query_filter,
            limit=limit,
        )
    except Exception as e:
        print(f"Project-scoped search failed for {project.get('project_id')}: {e}")
        return []


def _entity_doc_rank(payload: dict) -> int:
    """Score a chunk so measurement / threshold / trend pages surface first."""
    text = str(payload.get("text", "") or "")
    score = 0
    for token in ("Measured values", "threshold", "Threshold", "2024", "2025", "2026",
                  "historical context", "trend", "Trend", "Findings", "Inspection",
                  "pressure", "corrosion", "vibration", "Seal temperature"):
        score += text.count(token)
    page = payload.get("page")
    if page in (2, 3, 4):
        score += 5
    return score


def find_entity_documents(entity: str | None, allowed_roles: list[str] | None = None, limit: int = 12):
    """Deterministically pull the documents tied to an asset entity (e.g. ``P-102``):
    its inspection reports, equipment record / datasheet, and the applicable pump
    inspection/maintenance SOPs.

    Pure vector similarity often ranks metadata JSON (registries, relationship graphs)
    above the actual measurement chunks; this lookup guarantees a history / inspection /
    risk query sees the grounded source documents. Returns point objects with the same
    ``.payload`` / ``.id`` shape as :func:`search_documents`.
    """
    try:
        if not entity:
            return []
        asset = re.sub(r"[^A-Za-z0-9_-]", "", str(entity)).upper()
        if not asset:
            return []
        name_matchers = [
            FieldCondition(key="document_name", match=MatchText(text=f"{asset}-")),
            FieldCondition(key="document_name", match=MatchText(text=f"{asset}_")),
            FieldCondition(key="document_name", match=MatchText(text=asset)),
        ]
        for sop in ("pump_condition_monitoring", "pump_maintenance", "sop-ops-203",
                    "corrosion_thickness", "rotating_equipment_reliability",
                    "rotating_equipment_abnormal_operation"):
            name_matchers.append(FieldCondition(key="document_name", match=MatchText(text=sop)))
        cond: Filter = Filter(must=[Filter(should=name_matchers)])
        if allowed_roles:
            role_cond = Filter(should=[
                FieldCondition(key="access_roles", match=MatchValue(value=r)) for r in allowed_roles
            ])
            cond = Filter(must=[Filter(should=name_matchers), role_cond])

        points = client.scroll(
            collection_name=VECTOR_COLLECTION,
            scroll_filter=cond,
            limit=300,
            with_payload=True,
            with_vectors=False,
        )[0]

        keyed: dict[str, object] = {}
        for pt in points:
            payload = pt.payload or {}
            name = str(payload.get("document_name", ""))
            page = payload.get("page")
            key = f"{name}|{page}" if page is not None else name
            if key in keyed:
                continue
            keyed[key] = pt
        ranked = sorted(keyed.values(), key=lambda p: _entity_doc_rank(p.payload or {}), reverse=True)
        return ranked[:limit]
    except Exception as e:
        print(f"Entity document lookup failed: {e}")
        return []