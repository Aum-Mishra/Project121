"""Re-push document chunk embeddings from SQLite into Qdrant.

Documents were ingested when Qdrant was using an in-memory client,
so the vectors never reached the persistent Qdrant server. This script
reads the stored embeddings from SQLite and upserts them back into
the running Qdrant collection.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.database import SessionLocal
from app.db.models import Document, DocumentChunk
from app.rag.vector_store import vector_store
from app.rag.doc_metadata import derive_document_metadata
from app.core.config import settings
from qdrant_client.models import PointStruct


def _enum_value(value):
    return getattr(value, "value", value)


def main() -> None:
    db = SessionLocal()
    chunks = db.query(DocumentChunk).join(Document).filter(
        Document.company_id == settings.company_id
    ).order_by(DocumentChunk.id.asc()).all()

    derived_by_doc = {}
    points = []
    for chunk in chunks:
        doc = db.query(Document).filter(Document.id == chunk.document_id).first()
        if not doc or not chunk.embedding:
            continue
        meta = derived_by_doc.get(doc.id)
        if meta is None:
            meta = derive_document_metadata(doc)
            derived_by_doc[doc.id] = meta
        payload = {
            "company_id": settings.company_id,
            "document_id": doc.document_id if doc else None,
            "document_name": doc.file_name if doc else None,
            "chunk_id": chunk.id,
            "page_number": chunk.page_number,
            "section": chunk.section,
            "file_type": _enum_value(doc.file_type) if doc else None,
            "classification": _enum_value(doc.classification) if doc else None,
            "asset_id": meta.get("asset_id"),
            "document_type": meta.get("document_type"),
            "year": meta.get("year"),
            "department": meta.get("department"),
            "owner": meta.get("owner"),
            "revision": meta.get("revision"),
            "content": chunk.content,
        }
        points.append(PointStruct(
            id=chunk.id,
            vector=chunk.embedding,
            payload=payload,
        ))

    print(f"Loaded {len(chunks)} chunks, {len(points)} with embeddings")

    vector_store.create_collection(vector_size=1024)
    vector_store.upsert_points(points, vector_size=1024)
    print("Qdrant re-indexing complete:", vector_store.get_collection_info())

    # Reset docs to READY (in case any were ERROR)
    for doc in db.query(Document).filter(Document.company_id == settings.company_id).all():
        doc.status = doc.status.__class__.READY

    db.commit()
    db.close()


if __name__ == "__main__":
    main()
