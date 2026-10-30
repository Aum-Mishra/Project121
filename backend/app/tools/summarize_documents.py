from typing import Dict, Any, List
from app.tools.base import BaseTool, ToolInput, ToolOutput, tool_registry
from app.rag.retriever import HybridRetriever
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class SummarizeDocumentsInput(ToolInput):
    query: str
    asset_id: str = None
    document_type: str = None
    year: int = None
    department: str = None
    doc_ids: List[str] = None
    limit: int = None
    content_limit: int = None


class SummarizeDocumentsTool(BaseTool):
    name = "summarize_documents"
    description = (
        "Retrieve the full text of a knowledge-base document (or set of "
        "documents) needed to produce a summary. Use for summarization/"
        "overview requests. Returns per-document content; the assistant writes "
        "the actual summary from this evidence."
    )
    permission = "read"

    async def execute(self, input_data: Dict[str, Any], context: Dict[str, Any]) -> ToolOutput:
        db = context.get("db")
        company_id = context.get("company_id")

        if not db or not company_id:
            return ToolOutput(success=False, error="Missing db or company_id in context")

        retriever = HybridRetriever(db)
        limit = input_data.get("limit") or settings.summarization_max_chunks
        content_limit = input_data.get("content_limit") or settings.summarization_target_chars

        # For a summarization we want the document's breadth, not just the few
        # most similar chunks, so retrieve deeply within the target documents.
        results = await retriever.retrieve_with_metadata(
            query=input_data.get("query", ""),
            company_id=company_id,
            asset_id=input_data.get("asset_id"),
            document_type=input_data.get("document_type"),
            year=input_data.get("year"),
            department=input_data.get("department"),
            doc_ids=input_data.get("doc_ids"),
            limit=limit,
        )

        documents: Dict[str, Dict[str, Any]] = {}
        for r in results:
            doc_id = r.get("document_id") or "unknown"
            entry = documents.setdefault(doc_id, {
                "document_id": doc_id,
                "document_name": r.get("document_name"),
                "document_type": r.get("document_type"),
                "asset_id": r.get("asset_id"),
                "year": r.get("year"),
                "department": r.get("department"),
                "page_number": r.get("page_number"),
                "section": r.get("section"),
                "chunks": 0,
                "content": "",
            })
            entry["chunks"] += 1
            if len(entry["content"]) < content_limit:
                entry["content"] += (r.get("content") or "") + "\n\n"

        return ToolOutput(success=True, data={
            "query": input_data.get("query"),
            "documents": list(documents.values()),
            "total_documents": len(documents),
            "total_chunks": sum(d["chunks"] for d in documents.values()),
        })


tool_registry.register(SummarizeDocumentsTool())