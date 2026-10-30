from typing import Dict, Any

from app.tools.base import BaseTool, ToolInput, ToolOutput, tool_registry
from app.services.analysis_service import AnalysisEngine
from app.core.logging import get_logger

logger = get_logger(__name__)


class AnalyzeDataInput(ToolInput):
    query: str
    asset_id: str = None


class AnalyzeDataTool(BaseTool):
    name = "analyze_data"
    description = (
        "Produce a structured data analysis (findings, metrics, charts, tables, recommendations) "
        "grounded in the knowledge base and live database facts."
    )
    permission = "read"

    async def execute(self, input_data: Dict[str, Any], context: Dict[str, Any]) -> ToolOutput:
        db = context.get("db")
        company_id = context.get("company_id")

        if not db or not company_id:
            return ToolOutput(success=False, error="Missing db or company_id in context")

        query = input_data.get("query", "")
        asset_id = input_data.get("asset_id") or None
        engine = AnalysisEngine(db, company_id)
        envelope = await engine.run(query, asset_id=asset_id)

        return ToolOutput(success=True, data={
            "query": query,
            "analysis": envelope,
            "charts": envelope.get("charts", []),
            "findings": envelope.get("findings", []),
            "metrics": envelope.get("metrics", []),
            "tables": envelope.get("tables", []),
            "recommendations": envelope.get("recommendations", []),
        })


tool_registry.register(AnalyzeDataTool())