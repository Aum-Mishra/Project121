"""Enrich a Document row into searchable semantic metadata.

The raw ingest pipeline only stores physical file metadata (``file_type`` =
PDF/XLSX, ``classification``). Company/SOP/department/asset/year questions
need *semantic* metadata - what the document is about - so filters can
actually match. Everything here is derived deterministically from fields that
already exist on the ``Document`` row (``document_id``, ``file_name``,
``source_path``, ``owner``, ``revision``), so it works for both new ingestion
and a re-index of the existing knowledge base without any schema change.
"""
import re
from typing import Dict, Any, Optional, List

# Canonical semantic document types used everywhere (filters, intent, tools).
DOCUMENT_TYPE_SOP = "sop"
DOCUMENT_TYPE_MANUAL = "manual"
DOCUMENT_TYPE_POLICY = "policy"
DOCUMENT_TYPE_PROCEDURE = "procedure"
DOCUMENT_TYPE_INSPECTION = "inspection"
DOCUMENT_TYPE_MAINTENANCE = "maintenance"
DOCUMENT_TYPE_INCIDENT = "incident"
DOCUMENT_TYPE_EQUIPMENT = "equipment"
DOCUMENT_TYPE_VENDOR = "vendor"
DOCUMENT_TYPE_PROJECT = "project"
DOCUMENT_TYPE_REGISTER = "register"
DOCUMENT_TYPE_REPORT = "report"

DEPARTMENT_UNKNOWN = "General"

# owner -> canonical department name (the document registry uses owners that
# are department/business-area names in practice).
_DEPARTMENT_ALIASES = {
    "operations": "Operations",
    "maintenance": "Maintenance",
    "inspection": "Inspection",
    "hse": "HSE",
    "safety": "HSE",
    "quality": "Quality",
    "procurement": "Procurement",
    "instrumentation": "Instrumentation",
    "it security": "IT Security",
    "it": "IT Security",
    "process engineering": "Process Engineering",
    "engineering": "Engineering",
    "project": "Projects",
    "projects": "Projects",
    "enterprise data": "Enterprise Data",
    "data": "Enterprise Data",
    "document control": "Document Control",
    "ai governance": "AI Governance",
    "vendor": "Procurement",
    "security": "IT Security",
}

_ASSET_PATTERN = re.compile(
    r"(?i)\b(P|PT|TT|LT|FT|V|T|E|C|F|M|R|B|D|K)-?\s?(\d{2,3})\b"
)


def normalize_asset_token(token: str) -> Optional[str]:
    """Normalize 'p102'/'P-102'/'P 102'/'p-102' -> 'P-102'."""
    if not token:
        return None
    m = re.match(r"(?i)^([A-Za-z]{1,3})-?[\s-]?(\d{2,3})$", token.strip())
    if not m:
        return None
    prefix = m.group(1).upper()
    number = m.group(2)
    return f"{prefix}-{number}"


def extract_asset_ids(text: str) -> List[str]:
    """Find asset tags (P-102, V-201, PT-102, ...) inside a document id or name.

    Returns every distinct asset in first-seen order so queries like
    "P-101 and P-102" preserve both targets.
    """
    seen = set()
    result = []
    for m in _ASSET_PATTERN.finditer(text or ""):
        prefix = m.group(1).upper()
        number = m.group(2)
        asset = f"{prefix}-{int(number)}"
        if asset not in seen:
            seen.add(asset)
            result.append(asset)
    return result


def extract_year(text: str) -> Optional[int]:
    m = re.search(r"\b(19|20)\d{2}\b", text or "")
    if not m:
        return None
    year = int(m.group(0))
    if 1980 <= year <= 2100:
        return year
    return None


def _canonical_document_type(document_id: str, file_name: str, source_path: str) -> str:
    did = (document_id or "").upper()
    name = (file_name or "").lower()
    path = (source_path or "").lower().replace("\\", "/")
    if path and not path.startswith("/"):
        path = "/" + path

    if did.startswith("APEL-SOP") or "/sops/" in path:
        return DOCUMENT_TYPE_SOP
    if did.startswith("APEL-MAN") or "/manuals/" in path:
        return DOCUMENT_TYPE_MANUAL
    if did.startswith("APEL-INS") or "inspection" in name or "/inspection" in path:
        return DOCUMENT_TYPE_INSPECTION
    if did.startswith("APEL-MNT"):
        return DOCUMENT_TYPE_MAINTENANCE
    if "maintenance" in name or "/maintenance/" in path:
        return DOCUMENT_TYPE_MAINTENANCE
    if did.startswith("APEL-INC") or "/incidents/" in path or "incident" in name:
        return DOCUMENT_TYPE_INCIDENT
    if did.startswith("APEL-VND") or "vendor" in name or "/vendors/" in path:
        return DOCUMENT_TYPE_VENDOR
    if did.startswith("APEL-PRJ") or "/projects/" in path:
        return DOCUMENT_TYPE_PROJECT
    if did.startswith("APEL-AS") or "equipment_record" in name or "datasheet" in name:
        return DOCUMENT_TYPE_EQUIPMENT
    if did.startswith(("APEL-SEC", "APEL-DOC", "APEL-AI", "APEL-PROC")) or "/policies/" in path:
        return DOCUMENT_TYPE_POLICY
    if did in ("ASSET_REGISTER", "WORK_ORDER_REGISTER", "SHIFT_LOG_2026", "PRODUCTION_MONTHLY_SUMMARY_2026") \
            or name.endswith("register.xlsx") or name.endswith("_register") or "shift_log" in name or "monthly_summary" in name:
        return DOCUMENT_TYPE_REGISTER
    if "/assets/" in path and "register" not in name:
        return DOCUMENT_TYPE_EQUIPMENT
    if "/condition_monitoring/" in path or "/integrity/" in path:
        return DOCUMENT_TYPE_INSPECTION
    if "/instrumentation/" in path:
        return DOCUMENT_TYPE_PROCEDURE
    if "condition" in name and "monitor" in name:
        return DOCUMENT_TYPE_INSPECTION
    if did.startswith(("APEL-I&C", "APEL-QA", "APEL-OPS", "APEL-HSE", "APEL-PROC")):
        return DOCUMENT_TYPE_PROCEDURE
    return DOCUMENT_TYPE_REPORT


def _derive_department(doc: Any, source_path: str) -> str:
    owner = (getattr(doc, "owner", None) or "").strip().lower()
    if owner:
        for key, dept in _DEPARTMENT_ALIASES.items():
            if key in owner:
                return dept
    path = (source_path or "").lower().replace("\\", "/")
    segments = [s for s in path.split("/") if s]
    if not segments:
        return DEPARTMENT_UNKNOWN
    folder = segments[0]
    if folder == "sops" and len(segments) > 1:
        folder = segments[1]
    # Normalise singular/plural folder names.
    for key, dept in {
        "operation": "Operations",
        "maintenance": "Maintenance",
        "inspection": "Inspection",
        "hse": "HSE",
        "safety": "HSE",
        "quality": "Quality",
        "procurement": "Procurement",
        "instrumentation": "Instrumentation",
        "manuals": "Engineering",
        "policies": "Governance",
        "assets": "Asset Management",
        "historical_records": "Inspection",
        "vendor": "Procurement",
        "vendors": "Procurement",
        "projects": "Projects",
        "condition_monitoring": "Inspection",
        "integrity": "Inspection",
        "reliability": "Maintenance",
        "process_safety": "HSE",
        "human_factors": "HSE",
        "organizational_factors": "HSE",
        "risk_intelligence": "Engineering",
        "production_intelligence": "Engineering",
        "environment": "HSE",
        "events": "Engineering",
        "business_context": "Enterprise Data",
        "utilities": "Operations",
        "specs": "Engineering",
        "metadata": "Enterprise Data",
        "company": "Enterprise Data",
    }.items():
        if folder.startswith(key):
            return dept
    return folder.capitalize()


def derive_document_metadata(doc: Any) -> Dict[str, Any]:
    """Return the searchable semantic metadata for a Document row.

    The returned dict uses the same keys the retriever/vector store filters
    expect (``document_type``, ``asset_id``, ``year``, ``department``) plus a
    few display fields. Purely deterministic - no LLM.
    """
    document_id = getattr(doc, "document_id", "") or ""
    file_name = getattr(doc, "file_name", "") or ""
    source_path = getattr(doc, "source_path", "") or file_name

    assets = extract_asset_ids(f"{document_id} {file_name}")
    year = extract_year(f"{document_id} {file_name}")

    classification = getattr(doc, "classification", None)
    if hasattr(classification, "value"):
        classification = classification.value

    file_type = getattr(doc, "file_type", None)
    if hasattr(file_type, "value"):
        file_type = file_type.value

    return {
        "document_id": document_id,
        "document_name": file_name,
        "document_type": _canonical_document_type(document_id, file_name, source_path),
        "asset_id": assets[0] if assets else None,
        "asset_ids": assets,
        "year": year,
        "department": _derive_department(doc, source_path),
        "owner": getattr(doc, "owner", None),
        "revision": getattr(doc, "revision", None),
        "classification": classification,
        "file_type": file_type,
        "source_folder": (source_path or "").replace("\\", "/").split("/")[0]
        if (source_path or "").replace("\\", "/").split("/")[0] else None,
    }


def doc_metadata_for_env(doc: Any) -> Dict[str, Any]:
    """Merge derived metadata with the base chunk metadata dict.

    Used by both ``ingest_document`` and the re-index script so the SQLite
    chunk metadata and the Qdrant payload stay in sync.
    """
    base = {
        "company_id": getattr(doc, "company_id", None),
        "document_id": getattr(doc, "document_id", None),
        "file_name": getattr(doc, "file_name", None),
        "classification": getattr(doc, "classification", None),
    }
    derived = derive_document_metadata(doc)
    base.update({k: v for k, v in derived.items() if v is not None})
    return base