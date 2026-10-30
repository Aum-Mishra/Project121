from typing import Dict, Any
from app.tools.base import BaseTool, ToolInput, ToolOutput, tool_registry
from app.rag.retriever import HybridRetriever
from app.core.logging import get_logger

logger = get_logger(__name__)


class DocumentSearchInput(ToolInput):
    query: str
    limit: int = 10
    asset_id: str = None
    document_type: str = None
    classification: str = None


class DocumentSearchTool(BaseTool):
    name = "search_documents"
    description = "Search company knowledge base for relevant documents using hybrid semantic and keyword search"
    permission = "read"

    async def execute(self, input_data: Dict[str, Any], context: Dict[str, Any]) -> ToolOutput:
        db = context.get("db")
        company_id = context.get("company_id")

        if not db or not company_id:
            return ToolOutput(success=False, error="Missing db or company_id in context")

        retriever = HybridRetriever(db)

        results = await retriever.retrieve_with_metadata(
            query=input_data.get("query", ""),
            company_id=company_id,
            asset_id=input_data.get("asset_id"),
            document_type=input_data.get("document_type"),
            classification=input_data.get("classification"),
            limit=input_data.get("limit", 10),
            user_id=context.get("user_id"),
            user_clearance=context.get("user_clearance"),
        )

        formatted_results = []
        for r in results:
            formatted_results.append({
                "document_id": r.get("document_id"),
                "content": r.get("content", "")[:500],
                "page_number": r.get("page_number"),
                "section": r.get("section"),
                "relevance_score": r.get("score"),
            })

        return ToolOutput(success=True, data={
            "results": formatted_results,
            "total": len(formatted_results),
        })


tool_registry.register(DocumentSearchTool())