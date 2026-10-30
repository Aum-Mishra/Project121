import asyncio
from typing import List, Dict, Any
from qdrant_client.models import PointStruct
from pathlib import Path
from sqlalchemy.orm import Session
from app.db.models import Document, DocumentChunk, DocumentStatus
from app.db.repositories import DocumentRepository, DocumentChunkRepository
from app.rag.parser import parse_document
from app.rag.ocr import ocr_engine, needs_ocr
from app.rag.chunker import chunk_pages
from app.rag.doc_metadata import doc_metadata_for_env, derive_document_metadata
from app.rag.embeddings import get_embeddings_batch
from app.rag.vector_store import vector_store
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


async def ingest_document(db: Session, document_id: str, company_id: str) -> Dict[str, Any]:
    doc_repo = DocumentRepository(db)
    chunk_repo = DocumentChunkRepository(db)

    doc = doc_repo.get_by_id(document_id, company_id)
    if not doc:
        return {"error": "Document not found"}

    doc_repo.update_status(doc.id, DocumentStatus.PROCESSING)

    file_path = Path(doc.file_path)
    if not file_path.exists():
        doc_repo.update_status(doc.id, DocumentStatus.ERROR, error="File not found")
        return {"error": "File not found"}

    pages = parse_document(file_path)

    ocr_pages = needs_ocr(pages)
    if ocr_pages and file_path.suffix.lower() == ".pdf":
        doc_repo.update_status(doc.id, DocumentStatus.OCR)
        for page_num in ocr_pages:
            ocr_result = ocr_engine.ocr_pdf_page(file_path, page_num)
            pages[page_num] = ocr_result

    doc_repo.update_status(doc.id, DocumentStatus.CHUNKING)

    doc_metadata = doc_metadata_for_env(doc)
    derived = derive_document_metadata(doc)

    chunks_data = chunk_pages(pages, doc_metadata=doc_metadata)

    if not chunks_data:
        doc_repo.update_status(doc.id, DocumentStatus.ERROR, error="No text extracted")
        return {"error": "No text extracted"}

    doc_repo.update_status(doc.id, DocumentStatus.EMBEDDING)

    texts = [c["content"] for c in chunks_data]
    embeddings = await get_embeddings_batch(texts)

    doc_repo.update_status(doc.id, DocumentStatus.INDEXING)

    qdrant_points = []
    db_chunks = []

    for i, (chunk_data, embedding) in enumerate(zip(chunks_data, embeddings)):
        chunk = DocumentChunk(
            document_id=doc.id,
            chunk_index=chunk_data["chunk_index"],
            content=chunk_data["content"],
            page_number=chunk_data["page_number"],
            section=chunk_data.get("section"),
            token_count=chunk_data["token_count"],
            embedding=embedding,
            chunk_metadata=chunk_data["metadata"],
        )
        db_chunks.append(chunk)

    chunk_repo.create_batch(db_chunks)

    for db_chunk, embedding in zip(db_chunks, embeddings):
        point = PointStruct(
            id=db_chunk.id,
            vector=embedding,
            payload={
                "company_id": company_id,
                "document_id": doc.document_id,
                "document_name": doc.file_name,
                "chunk_id": db_chunk.id,
                "page_number": db_chunk.page_number,
                "section": db_chunk.section,
                "file_type": doc.file_type,
                "classification": doc.classification,
                "asset_id": derived.get("asset_id"),
                "document_type": derived.get("document_type"),
                "year": derived.get("year"),
                "department": derived.get("department"),
                "revision": doc.revision,
            },
        )
        qdrant_points.append(point)

    vector_store.upsert_points(qdrant_points, vector_size=1024)

    doc_repo.update_status(doc.id, DocumentStatus.READY, indexed_at=True)

    logger.info("document_ingested", document_id=document_id, chunks=len(db_chunks))
    return {"document_id": document_id, "chunks": len(db_chunks), "status": "READY"}


async def ingest_all_documents(db: Session, company_id: str) -> Dict[str, Any]:
    doc_repo = DocumentRepository(db)
    docs = doc_repo.list(company_id)

    results = []
    for doc in docs:
        if doc.status != DocumentStatus.READY:
            result = await ingest_document(db, doc.document_id, company_id)
            results.append(result)

    return {"ingested": len(results), "results": results}