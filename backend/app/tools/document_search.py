from typing import Dict, Any, List, Optional
from app.tools.base import BaseTool, ToolInput, ToolOutput, tool_registry
from app.rag.retriever import HybridRetriever
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class DocumentSearchInput(ToolInput):
    query: str
    limit: int = 8
    asset_id: str = None
    document_type: str = None
    classification: str = None
    year: int = None
    department: str = None
    doc_ids: List[str] = None
    content_limit: int = None


class DocumentSearchTool(BaseTool):
    name = "search_documents"
    description = (
        "Search the company knowledge base for relevant documents using hybrid "
        "semantic + keyword retrieval. Supports targeted filters (asset, document "
        "type, year, department). Results are always relevance-gated."
    )
    permission = "read"

    async def execute(self, input_data: Dict[str, Any], context: Dict[str, Any]) -> ToolOutput:
        db = context.get("db")
        company_id = context.get("company_id")

        if not db or not company_id:
            return ToolOutput(success=False, error="Missing db or company_id in context")

        retriever = HybridRetriever(db)
        query = input_data.get("query", "")
        asset_id = input_data.get("asset_id")
        document_type = input_data.get("document_type")
        classification = input_data.get("classification")
        year = input_data.get("year")
        department = input_data.get("department")
        doc_ids = input_data.get("doc_ids")
        content_limit = input_data.get("content_limit") or settings.retrieval_max_chars
        limit = input_data.get("limit") or settings.retrieval_default_limit

        results = await retriever.retrieve_with_metadata(
            query=query,
            company_id=company_id,
            asset_id=asset_id,
            document_type=document_type,
            classification=classification,
            year=year,
            department=department,
            doc_ids=doc_ids,
            limit=limit,
        )

        # Progressive relaxation: "SOP for P-102" should still find the P-102
        # inspection documents even if no single document carries BOTH the SOP
        # tag and the asset tag. Drop filters one at a time when over-constrained.
        if not results and (asset_id or document_type):
            for relaxed in (
                {"asset_id": asset_id if asset_id else None, "document_type": None, "year": year},
                {"asset_id": None, "document_type": document_type, "year": year},
                {"asset_id": None, "document_type": None, "year": None},
            ):
                results = await retriever.retrieve_with_metadata(
                    query=query,
                    company_id=company_id,
                    asset_id=relaxed["asset_id"],
                    document_type=relaxed["document_type"],
                    classification=classification,
                    year=relaxed["year"],
                    department=department,
                    doc_ids=doc_ids,
                    limit=limit,
                )
                if results:
                    logger.info("search_filter_relaxed",
                                query=query, asset_id=asset_id, document_type=document_type,
                                relaxed_to={k: v for k, v in relaxed.items() if v})
                    break

        formatted_results = []
        for r in results:
            formatted_results.append({
                "document_id": r.get("document_id"),
                "document_name": r.get("document_name"),
                "document_type": r.get("document_type"),
                "asset_id": r.get("asset_id"),
                "year": r.get("year"),
                "department": r.get("department"),
                "revision": r.get("revision"),
                "page_number": r.get("page_number"),
                "section": r.get("section"),
                "relevance_score": round(r.get("score") or 0.0, 3),
                "content": (r.get("content") or "")[:content_limit],
            })

        return ToolOutput(success=True, data={
            "results": formatted_results,
            "total": len(formatted_results),
        })


tool_registry.register(DocumentSearchTool())