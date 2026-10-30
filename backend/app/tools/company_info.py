from typing import Dict, Any, List
from app.tools.base import BaseTool, ToolInput, ToolOutput, tool_registry
from app.db.repositories import CompanyRepository, AssetRepository, DocumentRepository
from app.rag.doc_metadata import derive_document_metadata
from app.core.logging import get_logger

logger = get_logger(__name__)


class CompanyInfoInput(ToolInput):
    include_assets: bool = True
    include_departments: bool = True


class CompanyInfoTool(BaseTool):
    name = "company_info"
    description = (
        "Get authoritative company information: profile (name, industry, "
        "headquarters, primary site, employees, annual capacity) plus the list "
        "of refinery assets and departments. Use for company-level questions. "
        "This comes from structured company records, not the knowledge base."
    )
    permission = "read"

    async def execute(self, input_data: Dict[str, Any], context: Dict[str, Any]) -> ToolOutput:
        db = context.get("db")
        company_id = context.get("company_id")

        if not db or not company_id:
            return ToolOutput(success=False, error="Missing db or company_id in context")

        company = CompanyRepository(db).get_by_id(company_id)
        if not company:
            return ToolOutput(success=False, error="Company not found")

        data: Dict[str, Any] = {
            "company": {
                "company_id": company.company_id,
                "name": company.name,
                "short_name": company.short_name,
                "industry": company.industry,
                "headquarters": company.headquarters,
                "primary_site": company.primary_site,
                "established": company.established,
                "employees": company.employees,
                "annual_capacity_mmbpa": company.annual_capacity_mmbpa,
                "dataset_version": company.dataset_version,
                "classification": getattr(company.classification, "value", company.classification),
            },
        }

        if input_data.get("include_assets", True):
            assets = AssetRepository(db).list(company_id)
            data["assets"] = sorted([
                {
                    "asset_id": a.asset_id,
                    "asset_type": a.asset_type,
                    "service": a.service,
                    "unit": a.unit,
                    "criticality": a.criticality,
                }
                for a in assets if a.asset_id
            ], key=lambda x: x["asset_id"])

        if input_data.get("include_departments", True):
            departments = set()
            for doc in DocumentRepository(db).list(company_id, limit=500):
                meta = derive_document_metadata(doc)
                if meta.get("department"):
                    departments.add(meta["department"])
            data["departments"] = sorted(departments)

        return ToolOutput(success=True, data=data)


tool_registry.register(CompanyInfoTool())