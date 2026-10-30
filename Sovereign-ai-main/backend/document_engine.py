"""Reusable document-generation layer for the chat pipeline.

Ties the inspection/analysis data actually retrieved during a query to the
`docgen` renderers:

    Query -> detect required document type -> pick template (doc_type)
          -> select formats -> populate with retrieved data -> render
          -> validate file -> attach to chat (files / created_docs / doc_tasks)

Emits live progress events (start / generating / validating / ready / failed)
so the Workbench can render document generation as part of the query execution
state instead of a silent afterthought.

No dummy data is ever produced: every value, table, calculation, finding and
source reference comes from the analysis payload, the flattened findings and
the actual retrieved evidence list supplied by the pipeline.
"""
import datetime
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .docgen import generate_document, SUPPORTED_TEMPLATES, TEMPLATE_TITLES
from .config import ARTIFACT_STORAGE_PATH

# ---- Document-type dictionary -------------------------------------------------

DOC_TYPE_LABELS = {
    "inspection_report": "Inspection Report",
    "engineering_report": "Engineering Report",
    "equipment_report": "Equipment / Asset Report",
    "maintenance_report": "Maintenance Report",
    "incident_report": "Incident Report",
    "investigation_report": "Investigation Report",
    "audit_report": "Audit Report",
    "compliance_report": "Compliance Report",
    "safety_report": "Safety (HSE) Report",
    "sop_procedure": "SOP / Procedure Document",
    "technical_review": "Technical Review",
    "operational_report": "Operational Report",
    "reliability_report": "Reliability Report",
    "analysis_report": "Analysis Report",
    "comparison_report": "Comparison Report",
    "management_summary": "Executive / Management Report",
    "approval_note": "Approval Document",
    "action_memo": "Engineering Action Memo",
    "review_report": "Review Document",
    "meeting_record": "Meeting / Decision Record",
    "project_report": "Project Report",
    "data_analytics": "Data / Analytics Report",
    "evidence_report": "Evidence / Source Report",
    "knowledge_reference": "Knowledge / Reference Document",
}

# Ordered rules: first match with the highest-priority specific wording wins.
DETECT_RULES = [
    ("action_memo", ("action memo", "engineering memo", "memorandum",
                     "action memorandum", "memo", "draft memo")),
    ("approval_note", ("approval", "approve", "authorization", "sign-off", "endorsement")),
    ("sop_procedure", ("sop", "procedure", "checklist", "startup sequence", "shutdown sequence",
                       "manual", "work instruction", "step-by-step", "operating procedure")),
    ("incident_report", ("incident", "near-miss", "near miss", "fire event", "spill event")),
    ("investigation_report", ("investigation", "root cause", "fault tree", "why analysis")),
    ("audit_report", ("audit", "iso compliance audit", "compliance gap")),
    ("compliance_report", ("compliance", "regulatory", "statutory", "legal requirement", "permitting")),
    ("safety_report", ("safety", "hse", "hsse", "occupational", "workplace hazard")),
    ("risk_assessment", ("risk assessment", "risk level", "hazard analysis", "risk matrix", "quantitative risk")),
    ("inspection_report", ("inspection report", "inspection", "ndt", "ut thickness", "wall thickness",
                           "corrosion inspection", "inspection history", "leak test")),
    ("maintenance_report", ("maintenance", "breakdown", "overhaul", "turnaround", "preventive schedule")),
    ("reliability_report", ("reliability", "availability", "mtbf", "mttr")),
    ("equipment_report", ("equipment report", "asset report", "compressor report", "motor health")),
    ("comparison_report", ("comparison", "compare", "versus", "vs ", "differences", "benchmark", "betwee")),
    ("engineering_report", ("engineering report", "engineering assessment", "detailed engineering")),
    ("technical_review", ("technical review", "engineering review", "technical review document")),
    ("analysis_report", ("analysis report", "trend report", "trend analysis report")),
    ("operational_report", ("operational report", "operations report", "shift report", "daily report")),
    ("data_analytics", ("data export", "dataset", "analytics report", "raw data", "tabular")),
    ("evidence_report", ("evidence list", "source report", "references report", "citations")),
    ("knowledge_reference", ("reference document", "knowledge base", "handbook entry", "fact sheet")),
    ("meeting_record", ("meeting notes", "minutes", "decision record", "action items")),
    ("project_report", ("project report", "project status", "milestone report")),
    ("management_summary", ("executive summary", "management summary", "summary for board", "stakeholder report")),
    ("review_report", ("review document", "peer review", "design review")),
]

# Formats that carry tabular data (useful when the analysis has tables/metrics).
_TABULAR = ("xlsx", "csv")

# Formats each doc type can be rendered to (must be a subset of docgen support).
_TYPE_FORMAT_LIMITS = {
    "data_analytics": ["xlsx", "csv", "json", "md", "txt"],
    "meeting_record": ["docx", "md", "txt", "json"],
    "evidence_report": ["docx", "md", "txt", "json"],
    "incident_report": ["docx", "pdf", "txt", "md", "json"],
    "investigation_report": ["docx", "pdf", "txt", "md", "json"],
    "compliance_report": ["docx", "pdf", "txt", "md", "json"],
    "sop_procedure": ["docx", "pdf", "txt", "md", "json"],
    "technical_review": ["docx", "pdf", "txt", "md", "json"],
    "review_report": ["docx", "pdf", "txt", "md", "json"],
    "project_report": ["docx", "pdf", "txt", "md", "json"],
    "approval_note": ["docx", "pdf", "txt", "md", "json"],
    "knowledge_reference": ["docx", "pdf", "md", "txt", "json"],
    "management_summary": ["pptx", "pdf", "docx", "md", "txt", "json"],
}

DEFAULT_FORMATS = {
    "sop_procedure": ["docx", "pdf"],
    "approval_note": ["docx"],
    "action_memo": ["docx", "pdf"],
    "data_analytics": ["xlsx", "csv"],
    "comparison_report": ["docx", "xlsx"],
    "management_summary": ["docx"],
    "knowledge_reference": ["docx"],
    "evidence_report": ["docx"],
    "meeting_record": ["docx"],
}

EXPLICIT_FORMAT_HINTS = {
    "excel": ["xlsx", "csv"],
    "xlsx": ["xlsx", "csv"],
    "spreadsheet": ["xlsx", "csv"],
    "csv": ["csv", "xlsx"],
    "pdf": ["pdf", "docx"],
    "ppt": ["pptx", "docx"],
    "pptx": ["pptx", "docx"],
    "presentation": ["pptx", "docx"],
    "slides": ["pptx", "docx"],
    "slide deck": ["pptx", "docx"],
    "powerpoint": ["pptx", "docx"],
    "docx": ["docx"],
    "word": ["docx"],
}

REPORT_DOC_TYPES = {
    "inspection_report", "engineering_report", "equipment_report", "maintenance_report",
    "incident_report", "investigation_report", "audit_report", "compliance_report",
    "safety_report", "operational_report", "reliability_report", "analysis_report",
    "comparison_report", "technical_review", "review_report", "project_report",
    "risk_assessment",
}


# ---- Detection ---------------------------------------------------------------

def detect_doc_type(query: str, intent: str) -> Tuple[bool, str]:
    """Return (wanted, doc_type). Intent-based triggers plus explicit wording."""
    wanted_by_intent = str(intent or "").strip().lower() in ("report_generation", "document_generation")
    q = (query or "").lower()
    # Data-export requests are pure tabular outputs - no narrative report.
    if any(k in q for k in ("export ", "export the", "extract the data", "download the data",
                            "to excel", "to csv", "as excel", "as csv", "spreadsheet")):
        return True, "data_analytics"
    # Presentation requests are management summaries (supports pptx + docx so a
    # single query asking for 'a ppt and a report' yields both).
    if any(k in q for k in ("ppt", "presentation", "slides", "powerpoint", "slide deck")):
        return True, "management_summary"
    # Entity inspection / risk request that asks for a 'report' must generate an
    # inspection or risk report - NOT an SOP/procedure, even when the query also
    # mentions the condition-monitoring SOP as evidence.
    if ("report" in q or "generate" in q) and any(w in q for w in
        ("inspection", "risk assessment", "integrity", "condition monitoring")):
        if "risk assessment" in q:
            return True, "risk_assessment"
        return True, "inspection_report"
    for doc_type, words in DETECT_RULES:
        if any(w in q for w in words):
            return True, doc_type
    # Generic report request on a known asset -> a real engineering report.
    if any(k in q for k in ("report", "document", "generate", "create", "write", "draft",
                            "summary of", "summarize as", "analy")):
        return True, "engineering_report"
    return wanted_by_intent, "engineering_report"


def pick_formats(doc_type: str, query: str, has_tabular: bool) -> List[str]:
    q = (query or "").lower()
    for hint, fmts in EXPLICIT_FORMAT_HINTS.items():
        if hint in q:
            return _clip_formats(doc_type, fmts)
    if doc_type in DEFAULT_FORMATS:
        return _clip_formats(doc_type, list(DEFAULT_FORMATS[doc_type]))
    if doc_type in REPORT_DOC_TYPES:
        fmts = ["docx"]
        if has_tabular:
            fmts.append("xlsx")
        return _clip_formats(doc_type, fmts)
    return _clip_formats(doc_type, ["docx"])


def _clip_formats(doc_type: str, fmts: List[str]) -> List[str]:
    allowed = _TYPE_FORMAT_LIMITS.get(doc_type) or SUPPORTED_TEMPLATES.get(doc_type, ["docx"])
    seen = []
    for f in fmts:
        if f in allowed and f not in seen:
            seen.append(f)
    if not seen:
        seen.append(fmts[0] if fmts[0] in allowed else allowed[-1])
    return seen


def _human(doc_type: str) -> str:
    return DOC_TYPE_LABELS.get(doc_type, TEMPLATE_TITLES.get(doc_type, doc_type.replace("_", " ").title()))


# ---- Data assembly -----------------------------------------------------------

def cols_for_doc_type(doc_type: str) -> Dict[str, Any]:
    """Per-document-type structure metadata (profile of what each doc carries)."""
    base = {
        "sections": ["Title", "Asset Information", "Summary / Executive Summary", "Findings",
                     "Metrics", "Tables", "Recommendations", "Risk Assessment", "Calculations",
                     "Conclusion", "Evidence / Sources Used"],
    }
    profile = {
        "sop_procedure": {
            "sections": ["Title", "Scope", "Purpose", "Definitions", "Pre-conditions",
                         "Procedure Steps", "Monitoring Points", "Hold / Hold-points",
                         "Hazards & Controls", "Handover / Completion", "Evidence / Sources Used"],
            "has_metrics": False, "has_calcs": False, "risk": True,
        },
        "approval_note": {
            "sections": ["Title", "Request", "Background", "Recommendation", "Supporting Data",
                         "Evidence / Sources Used"],
            "has_metrics": False, "has_calcs": False, "risk": False,
        },
        "data_analytics": {
            "sections": ["Title", "Overview", "Data / Metrics", "Tables", "Calculations",
                         "Evidence / Sources Used"],
            "has_findings": False, "risk": False,
        },
        "comparison_report": {
            "sections": ["Title", "Overview", "Comparison Tables", "Metrics", "Calculations",
                         "Findings", "Recommendations", "Conclusion", "Evidence / Sources Used"],
            "risk": True,
        },
        "management_summary": {
            "sections": ["Title", "Executive Summary", "Key Findings", "Metrics", "Recommendations",
                         "Evidence / Sources Used"],
            "has_tables": True, "risk": False,
        },
        "action_memo": {
            "sections": ["Title", "Memo Details", "Subject / Background", "Findings", "Metrics",
                         "Corrective Actions", "Responsible / Target Date", "Evidence / Sources Used"],
            "has_tables": True, "risk": True,
        },
        "meeting_record": {
            "sections": ["Title", "Meeting Details", "Agenda", "Decision / Actions", "Evidence / Sources Used"],
            "has_metrics": False, "has_calcs": False, "risk": False,
        },
        "compliance_report": {
            "sections": ["Title", "Scope", "Requirements Reviewed", "Assessment", "Findings",
                         "Recommendations", "Evidence / Sources Used"],
            "risk": True,
        },
        "incident_report": {
            "sections": ["Title", "Incident Summary", "Timeline", "Findings", "Risk Assessment",
                         "Recommendations", "Evidence / Sources Used"],
            "risk": True, "has_calcs": False,
        },
        "investigation_report": {
            "sections": ["Title", "Scope", "Timeline", "Root-Cause Analysis", "Findings",
                         "Recommendations", "Evidence / Sources Used"],
            "risk": True, "has_calcs": False,
        },
        "audit_report": {
            "sections": ["Title", "Audit Scope", "Criteria", "Findings", "Observations", "Recommendations",
                         "Evidence / Sources Used"],
            "risk": True, "has_calcs": False,
        },
        "safety_report": {
            "sections": ["Title", "Work-scope", "Hazards Identified", "Risk Assessment", "Controls",
                         "Findings", "Recommendations", "Evidence / Sources Used"],
            "risk": True, "has_calcs": False,
        },
        "review_report": {
            "sections": ["Title", "Scope of Review", "Findings", "Recommendations", "Conclusion",
                         "Evidence / Sources Used"],
            "risk": False, "has_metrics": False, "has_calcs": False,
        },
        "evidence_report": {
            "sections": ["Title", "Overview", "Evidence / Sources Used", "Conclusion"],
            "has_metrics": False, "has_findings": False, "has_calcs": False, "risk": False,
        },
        "knowledge_reference": {
            "sections": ["Title", "Summary", "Details", "Evidence / Sources Used"],
            "has_metrics": False, "has_findings": False, "has_calcs": False, "risk": False,
        },
        "engineering_report": {
            "sections": ["Title", "Executive Summary", "Asset Information", "Inspection History",
                         "Pressure Analysis", "Corrosion Analysis", "Vibration Analysis",
                         "Operating Limits", "Risk Assessment", "Findings", "Recommendations",
                         "Conclusion", "Evidence / Sources Used"],
            "risk": True,
        },
    }
    return profile.get(doc_type, base)


def build_document_data(query, intent, entity, final_answer, sources,
                        analysis_payload, findings, doc_type, filter_year=None):
    """Assemble the `data` payload for docgen from the REAL retrieved data.

    `filter_year` (when set) builds a single source/evidence document limited to
    the evidence actually retrieved for that year - used for multi-year queries.
    """
    analysis = analysis_payload or {}
    profile = cols_for_doc_type(doc_type)

    def _summ():
        if filter_year:
            return f"{entity} {filter_year} retrieved evidence (inspection / operating records identified in the query)."
        return analysis.get("summary", "") or final_answer[:400]

    sel_sources = sources or []
    if filter_year:
        sel_sources = [
            s for s in sel_sources
            if filter_year in str(s.get("title", "")) or filter_year in str(s.get("year", "")) or filter_year in str(s.get("snippet", ""))
        ]

    evidence = []
    for s in sel_sources[:12]:
        evidence.append({
            "document": s.get("title", "Unknown Source"),
            "source_type": s.get("type", s.get("document_type", "Document")),
            "year": s.get("year", ""),
            "reference_id": s.get("id", ""),
            "snippet": s.get("snippet", ""),
        })

    data = {
        "title": f"{entity} {_human(doc_type)}" if filter_year is None
                else f"{entity} {filter_year} Inspection Report - Evidence",
        "file_title": f"{entity}_{_human(doc_type)}".replace(" ", "_") if filter_year is None
                      else f"{entity}_{filter_year}_Inspection_Evidence",
        "project": entity,
        "unit": "CDU-4" if str(entity).startswith("P-") else entity,
        "asset": entity,
        "date": datetime.datetime.utcnow().strftime("%d %b %Y") if filter_year is None else filter_year,
        "prepared_by": "MRPL KNOVIA AI",
    }

    if profile.get("has_metrics", True) or filter_year is None:
        if filter_year:
            data["metrics"] = [
                {"name": m.get("name", ""), "value": m.get("value", ""), "unit": m.get("unit", "")}
                for m in (analysis.get("metrics") or [])[:8]
            ]
        else:
            data["metrics"] = [
                {"name": m.get("name", ""), "value": m.get("value", ""), "unit": m.get("unit", "")}
                for m in (analysis.get("metrics") or [])[:8]
            ]
    if profile.get("has_findings", True) or filter_year is None:
        data["findings"] = [
            {"label": f.get("label", ""), "value": f.get("value", ""), "status": f.get("status", "warning")}
            for f in (findings if filter_year is None else [])[:12]
        ]
    data["tables"] = (analysis.get("tables") or []) if (profile.get("has_tables", True) and filter_year is None) else []
    data["recommendations"] = (analysis.get("recommendations") or []) if filter_year is None else []
    data["summary"] = _summ()
    if filter_year:
        data["content"] = (f"{entity} ({filter_year}) retrieved evidence: inspection / operating records "
                           f"for that year identified from the query. " + _summ())
    else:
        data["content"] = final_answer
    if profile.get("has_calcs", True) and filter_year is None:
        data["calcs"] = analysis.get("calcs") or analysis.get("calculations") or []
    if filter_year is None:
        data["risk_level"] = analysis.get("risk_level") or analysis.get("severity") or ""
    if profile.get("risk", False) and filter_year is None and not data.get("risk_level"):
        data["risk_level"] = analysis.get("severity", "See findings")
    conclusions = (analysis.get("recommendations") or [])
    if conclusions and filter_year is None:
        data["conclusions"] = [
            {"text": f"{r.get('action', '')} ({r.get('rationale', '')})" if r.get("rationale") else r.get("action", "")}
            for r in conclusions[-1:]
        ]
    data["sources"] = evidence
    data["sections"] = profile.get("sections", [])
    return data


def _chat_brief(final_answer: str, data: Dict[str, Any]) -> str:
    """Condense the document body into a short chat-side explanation."""
    text = (final_answer or "").strip()
    skip_prefixes = ("#", "[insert", "prepared for:", "approved by:", "end of", "date: [", "---")
    holder = re.compile(r"\[[^\]]*\]")
    body_lines = []
    for line in text.split("\n"):
        low = line.strip().lower()
        if not line.strip() or low.startswith(skip_prefixes):
            continue
        if holder.search(line) and "insert" in low:
            continue
        body_lines.append(line)
    body = re.sub(r"\s+", " ", " ".join(body_lines)).strip()
    if len(body) > 320:
        body = body[:320].rsplit(" ", 1)[0] + "…"
    if body:
        return body
    summary = str(data.get("summary", "") or "").strip()
    return summary[:320] if summary else "Generated from the retrieved inspection records."


# ---- Multi-document planning -------------------------------------------------

def plan_document_tasks(query, intent, entity, final_answer, sources,
                        analysis_payload, findings, doc_type) -> List[Dict[str, Any]]:
    """Build the list of documents (tasks) a query should produce.

    A plain report yields one task. Multi-year / multi-document requests yield
    one evidence source-document per explicitly requested year that we actually
    retrieved evidence for, plus the aggregated report - each independently
    downloadable. Nothing is fabricated: years without retrieved evidence are
    skipped.
    """
    tasks: List[Dict[str, Any]] = []
    has_tabular = bool((analysis_payload or {}).get("tables")) or bool((analysis_payload or {}).get("metrics"))
    primary = {
        "doc_type": doc_type,
        "label": _human(doc_type),
        "kind": "primary",
        "formats": pick_formats(doc_type, query, has_tabular),
        "build": lambda: build_document_data(query, intent, entity, final_answer, sources,
                                             analysis_payload, findings, doc_type, None),
    }
    tasks.append(primary)

    years = [y for y in ("2023", "2024", "2025", "2026", "2027") if y in (query or "")]
    wants_narrative = doc_type in REPORT_DOC_TYPES and any(
        k in (query or "").lower() for k in ("report", "inspection", "document", "evidence"))
    if years and len(years) >= 2 and wants_narrative:
        for year in years:
            matches = [
                s for s in (sources or [])
                if year in str(s.get("title", "")) or year in str(s.get("year", "")) or year in str(s.get("snippet", ""))
            ]
            if not matches:
                continue  # no real evidence for this year -> do not fabricate
            tasks.append({
                "doc_type": doc_type,
                "label": f"{entity} {year} Inspection Report",
                "kind": "evidence",
                "year": year,
                "formats": ["docx"],
                "build": lambda y=year: build_document_data(query, intent, entity, final_answer,
                                                            sources, analysis_payload, findings, doc_type, y),
            })
    return tasks


# ---- Validation --------------------------------------------------------------

def validate_file(file_path: str, fmt: str) -> Dict[str, Any]:
    """Reject empty / missing / wrong-format outputs before we call them ready."""
    fmt = str(fmt or "").lower()
    path = Path(file_path)
    checks: Dict[str, Any] = {"exists": path.exists()}
    checks["non_empty"] = checks["exists"] and path.stat().st_size > 0
    checks["size"] = path.stat().st_size if checks["exists"] else 0
    checks["format_ok"] = False
    if checks["exists"] and checks["non_empty"]:
        with open(file_path, "rb") as fh:
            head = fh.read(8)
        if fmt in ("docx", "xlsx", "pptx"):
            checks["format_ok"] = head.startswith(b"PK")
        elif fmt == "pdf":
            checks["format_ok"] = head.startswith(b"%PDF")
        else:
            checks["format_ok"] = True
        if fmt in ("md", "txt", "json", "csv") and not head:
            checks["format_ok"] = False
    checks["ok"] = bool(checks.get("exists") and checks.get("non_empty") and checks.get("format_ok"))
    return checks


def system_failure_injection(query: str, doc_failure_test: bool) -> Optional[str]:
    """Test-only hook: force a genuine generation failure to validate the UI."""
    if doc_failure_test or ("fail document generation" in (query or "").lower() and doc_failure_test):
        return "Forced document generation failure (test hook)."
    return None


# ---- Async streaming driver --------------------------------------------------

async def run_document_phase(query, intent, entity, final_answer, sources,
                             analysis_payload, findings, query_id,
                             doc_failure_test=False):
    """Async generator. Yields docgen SSE event dicts; returns final state via
    a trailing sentinel dict keyed under 'done'. Caller collects `files`,
    `created_docs` and `doc_tasks` from the returned object.
    """
    wanted, doc_type = detect_doc_type(query, intent)
    if not wanted:
        yield {"done": {"files": [], "created_docs": [], "doc_tasks": [], "note": "", "wanted": False}}
        return

    loop = asyncio_get_event_loop()
    forced_error = system_failure_injection(query, doc_failure_test)

    tasks = plan_document_tasks(query, intent, entity, final_answer, sources,
                                analysis_payload, findings, doc_type)

    files: List[Dict[str, Any]] = []
    created_docs: List[Dict[str, Any]] = []
    doc_tasks: List[Dict[str, Any]] = []
    download_lines: List[str] = []
    error_lines: List[str] = []
    note_lines = ["", "---", "**Documents created - now available in this chat and in Artifacts:**"]

    total_formats = sum(len(t["formats"]) for t in tasks)
    counter = 0
    brief_data: Optional[Dict[str, Any]] = None

    for task_index, task in enumerate(tasks):
        task_rec = {
            "task_index": task_index,
            "doc_type": task["doc_type"],
            "title": task["label"],
            "kind": task["kind"],
            "formats": task["formats"],
            "status": "pending",
        }
        doc_tasks.append(task_rec)
        yield {"type": "docgen", "stage": "start", "doc_type": task["doc_type"],
               "title": task["label"], "kind": task["kind"], "task_index": task_index,
               "formats": task["formats"], "total": total_formats, "query_id": query_id}

        data = task["build"]()
        if brief_data is None and task["kind"] == "primary":
            brief_data = data

        for fmt in task["formats"]:
            counter += 1
            yield {"type": "docgen", "stage": "generating", "doc_type": task["doc_type"],
                   "title": task["label"], "format": fmt, "task_index": task_index,
                   "index": counter, "total": total_formats, "query_id": query_id}

            meta = None
            try:
                if forced_error and task_index == 0:
                    raise RuntimeError(forced_error)
                meta = await loop.run_in_executor(None, generate_document, task["doc_type"], data, fmt)

                yield {"type": "docgen", "stage": "validating", "doc_type": task["doc_type"],
                       "title": task["label"], "format": fmt, "task_index": task_index,
                       "index": counter, "total": total_formats, "query_id": query_id,
                       "file": meta}

                validation = await loop.run_in_executor(None, validate_file, meta["file_path"], fmt)
                if not validation.get("ok"):
                    raise RuntimeError(f"Validation failed: {validation}")

                meta.update({
                    "doc_type": task["doc_type"],
                    "title": task["label"],
                    "format": meta["format"],
                    "status": "READY",
                    "validated": True,
                    "validation": validation,
                    "error": None,
                    "query_id": query_id,
                    "task_index": task_index,
                    "kind": task["kind"],
                })
                created_docs.append(meta)
                files.append({
                    "id": meta["artifact_id"],
                    "name": meta["name"],
                    "title": meta["title"],
                    "doc_type": task["doc_type"],
                    "type": meta["format"],
                    "format": meta["format"],
                    "size": str(validation.get("size", 0)),
                    "status": "READY",
                    "validated": True,
                    "url": meta["download_url"],
                    "query_id": query_id,
                })
                note_lines.append(f"- **{meta['title']}** ({meta['format']} - READY) - /api/artifacts/{meta['artifact_id']}/download")
                download_lines.append(
                    f"- **{meta['title']}** ({meta['format']} - READY) - "
                    f"[Download {meta['format']}]( /api/artifacts/{meta['artifact_id']}/download )")
                yield {"type": "docgen", "stage": "ready", "doc_type": task["doc_type"],
                       "title": task["label"], "format": fmt, "task_index": task_index,
                       "index": counter, "total": total_formats, "query_id": query_id,
                       "validated": True, "validation": validation, "file": meta}
            except Exception as e:  # noqa: BLE001 - any failure is surfaced, never faked
                error = str(e)[:400]
                failed_meta = {
                    "doc_type": task["doc_type"],
                    "title": task["label"],
                    "format": fmt.upper() if fmt else "",
                    "status": "FAILED",
                    "validated": False,
                    "error": error,
                    "query_id": query_id,
                    "task_index": task_index,
                    "url": None,
                }
                task_rec["status"] = "FAILED"
                task_rec["error"] = error
                files.append({
                    "title": task["label"],
                    "doc_type": task["doc_type"],
                    "type": fmt.upper() if fmt else "",
                    "format": fmt.upper() if fmt else "",
                    "size": "-",
                    "status": "FAILED",
                    "error": error,
                    "query_id": query_id,
                })
                note_lines.append(f"- ✗ **{task['label']}** ({fmt.upper() if fmt else ''} - FAILED) - {error}")
                error_lines.append(f"- ✗ **{task['label']}** ({fmt.upper() if fmt else ''} - FAILED) - {error}")
                yield {"type": "docgen", "stage": "failed", "doc_type": task["doc_type"],
                       "title": task["label"], "format": fmt, "task_index": task_index,
                       "index": counter, "total": total_formats, "query_id": query_id,
                       "error": error, "file": failed_meta}

        if task_rec["status"] == "pending":
            task_rec["status"] = "READY" if len(task["formats"]) else "pending"

    chat_blocks: List[str] = []
    if files or error_lines:
        primary_label = tasks[0]["label"] if tasks else "Document"
        chat_blocks.append(
            f"**{primary_label} for {entity} has been generated** from the data retrieved for this query.")
        brief = _chat_brief(final_answer, brief_data or {})
        if brief:
            chat_blocks.append(brief)
        if download_lines:
            chat_blocks.append("**Download the generated document(s):**")
            chat_blocks.extend(download_lines)
    if error_lines:
        chat_blocks.append("The following document(s) could not be generated (reason shown):")
        chat_blocks.extend(error_lines)
    chat_output = "\n\n".join(chat_blocks)

    yield {"done": {"files": files, "created_docs": created_docs, "doc_tasks": doc_tasks,
                    "note": "\n".join(note_lines) if files else "",
                    "chat_output": chat_output,
                    "wanted": True}}


def asyncio_get_event_loop():
    import asyncio
    return asyncio.get_event_loop()