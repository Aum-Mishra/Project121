from typing import Dict, Any, List, Optional
from app.agents.state import AgentState, AgentPlan, AgentStepModel, AgentPhase
from app.llm.ollama_client import ollama_client
from app.llm.router import model_router
from app.tools.base import tool_registry
from app.core.config import settings
from app.core.logging import get_logger
import json
import re

logger = get_logger(__name__)

PLANNING_PROMPT = """You are a planning agent for an industrial AI workbench.
Your task is to create a step-by-step execution plan for the user's query.

Available tools:
{tools}

Guidelines:
1. Break down complex queries into logical steps
2. Each step should use ONE tool
3. Steps should build on each other
4. Include retrieval, calculation, and reasoning steps as needed
5. End with verification and answer synthesis

Respond with ONLY a JSON object:
{
  "steps": [
    {"label": "Step description", "tool": "tool_name", "input": {{...}}},
    ...
  ]
}"""


class Planner:
    ANALYSIS_KEYWORDS = [
        "analyz", "analyse", "trend", "compare", "average", "summary of",
        "overview", "dashboard", "metrics", "kpi", "risk assessment",
        "review", "overpressure", "health check", "report on", "status of",
        "abnormal", "anomal", "deviat", "conflict", "incident", "investigat",
        "synthesiz", "exceed", "limit", "fouling", "lmtd", "ultrasonic",
        "thickness", "corrosion", "vibration", "crs-", "ups-", "alm-", "wo-",
        "e-301", "p-102", "integrity", "thinning",
    ]

    CREATE_DOC_KEYWORDS = [
        "create a document", "create an approval", "create a report", "create a technical",
        "create an inspection", "create a risk", "create the risk", "generate a document",
        "generate an approval", "generate a report", "generate technical", "generate an inspection",
        "generate a risk", "generate the risk", "generate a management", "prepare an approval",
        "prepare a report", "prepare a technical", "prepare an inspection", "prepare a risk",
        "prepare a management", "write an approval", "write the approval", "draft an approval",
        "draft a report", "draft the report", "draft a technical", "draft an inspection",
        "approval note", "technical review document", "inspection report for", "risk assessment document",
        "management summary document", "document for approval", "approval document",
        "make a ppt", "make a slide", "make a presentation", "put it in a sheet", "make a csv",
        "put this in excel", "generate a spreadsheet", "create a spreadsheet",
        "in a sheet", "as a ppt", "in excel",
    ]

    UPDATE_DOC_KEYWORDS = [
        "update the document", "update the artifact", "edit the document", "edit the artifact",
        "revise the document", "revise the artifact", "update the report", "edit the report",
        "add a section", "add another section", "expand the", "make a version", "new version of",
        "change the document", "revise the approval", "update the approval",
        "update the", "make changes to", "modify the", "draft a revision", "changes to the document",
        "add a note", "add an appendix", "add the recommendation", "add a recommendation",
        "include a section", "extend the document",
    ]

    ADD_SECTION_RE = re.compile(r"add a (risk|mitigation|recommendation|section|note|appendix|paragraph|slide|sheet|finding|comment)")

    CONVERT_DOC_KEYWORDS = [
        "convert the document", "convert the artifact", "convert to", "convert it to",
        "change format to", "turn it into a pdf", "as a pdf instead", "convert the report to",
        "convert to pdf", "convert to excel", "convert to csv", "convert to json", "convert to ppt",
        "convert the", "turn it into", "in pdf format", "as a pdf", "as a csv", "as a json",
        "turn it into a", "turn it into an", "as an excel", "into a pdf", "into an excel",
    ]

    CONVERT_RE = re.compile(
        r"(convert|turn|change)\b[^.]*\b(?:to|into)\b\s+(?:an?\s+)?(pdf|docx|xlsx|csv|json|md|txt|pptx|word|excel|powerpoint|slides)"
        r"|(pdf|docx|xlsx|csv|json|md|txt|pptx)\b\s+instead"
        r"|to\s+(pdf|docx|xlsx|csv|json|md|txt)\b\s+format"
    )

    CODE_KEYWORDS = [
        "write a python", "write python", "python script", "python code",
        "run a python", "run python", "script to compute", "script that computes",
        "write a script", "script to calculate", "script that calculates",
        "compute with code", "calculate using code", "simulate", "simulation",
        "write me code", "generate code", "write code",
    ]

    def __init__(self):
        self.model = settings.primary_model

    async def create_plan(self, state: AgentState) -> AgentPlan:
        return self._fallback_plan(state)

    def _resolve_artifact_id(self, context: Dict[str, Any]) -> Optional[str]:
        if not context:
            return None
        artifacts = context.get("artifacts")
        if artifacts and isinstance(artifacts, list):
            if isinstance(artifacts[0], dict):
                return artifacts[0].get("artifact_id")
            return str(artifacts[0])
        return None

    def _fallback_plan(self, state: AgentState) -> AgentPlan:
        query_lower = state.query.lower()
        steps = []

        wants_analysis = any(kw in query_lower for kw in self.ANALYSIS_KEYWORDS)
        wants_doc = any(kw in query_lower for kw in self.CREATE_DOC_KEYWORDS)
        wants_code = any(kw in query_lower for kw in self.CODE_KEYWORDS)
        wants_update = any(kw in query_lower for kw in self.UPDATE_DOC_KEYWORDS) or bool(self.ADD_SECTION_RE.search(query_lower))
        wants_convert = any(kw in query_lower for kw in self.CONVERT_DOC_KEYWORDS) or bool(self.CONVERT_RE.search(query_lower))

        if wants_update:
            artifact_id = self._resolve_artifact_id(state.context)
            steps.append(AgentStepModel(
                label="Update generated artifact (new version)",
                tool="update_artifact",
                input_data={"artifact_id": artifact_id, "change_instruction": state.query},
            ))
        elif wants_convert:
            artifact_id = self._resolve_artifact_id(state.context)
            target = self._detect_convert_format(query_lower)
            steps.append(AgentStepModel(
                label="Convert artifact to new format",
                tool="convert_artifact",
                input_data={"artifact_id": artifact_id, "format": target},
            ))
        elif wants_doc:
            steps.append(AgentStepModel(
                label="Generate company document",
                tool="generate_document",
                input_data={"query": state.query, "template": None, "format": None},
            ))
        elif wants_code:
            steps.append(AgentStepModel(
                label="Write and run Python in the sandbox",
                tool="coding_agent",
                input_data={"query": state.query, "timeout": 30},
            ))
        else:
            if any(kw in query_lower for kw in ["pressure", "corrosion", "vibration", "inspection", "p-102", "asset"]):
                steps.append(AgentStepModel(
                    label="Search for relevant documents",
                    tool="search_documents",
                    input_data={"query": state.query, "limit": 10},
                ))

                if "pressure" in query_lower or "calculate" in query_lower:
                    steps.append(AgentStepModel(
                        label="Calculate pressure deviation",
                        tool="calculate",
                        input_data={"expression": "42 - 40", "variables": {}},
                    ))

            if wants_analysis:
                steps.append(AgentStepModel(
                    label="Run structured data analysis",
                    tool="analyze_data",
                    input_data={"query": state.query, "asset_id": None},
                ))

            if not steps:
                steps.append(AgentStepModel(
                    label="Search knowledge base",
                    tool="search_documents",
                    input_data={"query": state.query, "limit": 5},
                ))

        steps.append(AgentStepModel(
            label="Synthesize answer",
            tool=None,
            input_data={},
        ))

        plan = AgentPlan(steps=steps)
        state.plan = plan
        state.phase = AgentPhase.TOOL_EXECUTION
        return plan

    def _detect_convert_format(self, query_lower: str) -> str:
        for fmt, hints in {
            "pdf": ["pdf"], "docx": ["word", "docx"], "xlsx": ["excel", "xlsx", "spreadsheet", "a sheet"],
            "pptx": ["powerpoint", "pptx", "slides", "deck", "a ppt"],
            "csv": ["csv"], "json": ["json"], "md": ["markdown", ".md"], "txt": ["txt"],
        }.items():
            if any(h in query_lower for h in hints):
                return fmt
        return "pdf"


planner = Planner()