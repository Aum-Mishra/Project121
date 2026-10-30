"""Deterministic per-year inspection trend extraction.

Grounds the "Pressure, Corrosion, and Vibration Levels" chart in the actual
inspection report measurements instead of relying on unstructured LLM output.
The readings are parsed from the indexed chunk text of the inspection documents
(APEL-INS-<ASSET>-<YYYY>), so the numbers always match the source reports.
"""
import re
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.db.models import Document, DocumentStatus

logger = get_logger(__name__)

YEAR_TAIL_RE = re.compile(r"(20\d{2})$")
INS_SEGMENT = "INS"

# Documented operating/approval limits for common engineering metrics.
# ApproveD maximum operating pressure for P-102 = 35 bar (recorded in the 2026
# inspection report). Figures not present here are derived from the report text
# keywords instead of invented numbers.
PRESSURE_APPROVED_MAX = 35.0

METRIC_LABELS = {
    "pressure": "Pressure (bar)",
    "corrosion": "Corrosion (mm)",
    "vibration": "Vibration (mm/s)",
    "seal_temp": "Seal temperature (°C)",
}


def normalize_token(token: Optional[str]) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", token or "").upper()


def extract_measurements(text: str) -> Dict[str, float]:
    """Parse a 'Measured values ...' block such as
    'Pressure 34.0 bar Corrosion 1.2 mm Vibration 4.1 mm/s Seal temperature 74 °C'."""
    if not text:
        return {}
    out: Dict[str, float] = {}
    m = re.search(r"Pressure\s+([\d.]+)\s*(?:bar)", text, re.I)
    if m and m.group(1):
        out["pressure"] = float(m.group(1))
    m = re.search(r"Corrosion\s+([\d.]+)\s*(?:mm)", text, re.I)
    if m and m.group(1):
        out["corrosion"] = float(m.group(1))
    m = re.search(r"Vibration\s+([\d.]+)\s*(?:mm/s)", text, re.I)
    if m and m.group(1):
        out["vibration"] = float(m.group(1))
    m = re.search(r"Seal temp(?:erature)?\s+([\d.]+)\s*°?\s*C", text, re.I)
    if m and m.group(1):
        out["seal_temp"] = float(m.group(1))
    return out


def _extract_condition_flags(text: str) -> Dict[str, bool]:
    """Determine limit-breach flags from the report's own condition findings."""
    flags = {
        "pressure_above_limit": False,
        "engineering_review": False,
        "elevated_motion": False,
    }
    if re.search(r"Pressure above approved limit|above (?:the )?approved limit", text, re.I):
        flags["pressure_above_limit"] = True
    if re.search(r"require\s+engineering review|engineering review", text, re.I):
        flags["engineering_review"] = True
    if re.search(r"elevated vibration|vibration investigation|increasing.*vibration", text, re.I):
        flags["elevated_motion"] = True
    return flags


def _inspection_documents(
    db: Session,
    company_id: str,
    asset_id: Optional[str],
) -> List[Document]:
    norm = normalize_token(asset_id)
    docs = (
        db.query(Document)
        .filter(
            Document.company_id == company_id,
            Document.status == DocumentStatus.READY,
        )
        .all()
    )
    matched = []
    for doc in docs:
        document_id = (doc.document_id or "").upper()
        if INS_SEGMENT not in document_id.split("-"):
            continue
        if norm and norm not in normalize_token(document_id):
            continue
        if YEAR_TAIL_RE.search(document_id):
            matched.append(doc)
    return matched


def _document_text(doc: Document) -> str:
    return "\n".join((c.content or "") for c in (doc.chunks or []))


def _percent_change(before: Optional[float], after: Optional[float]) -> Optional[float]:
    if before in (None, 0) or after is None:
        return None
    return round((after - before) / before * 100.0, 1)


def build_inspection_trends(
    db: Session,
    company_id: str,
    asset_id: Optional[str],
    years: Optional[List[int]] = None,
) -> Optional[Dict[str, Any]]:
    """Return a deterministic multi-year trend payload for the target asset.

    Returns None when no usable inspection measurements are found. The payload
    contains a ready-to-render multi-series chart plus metrics, findings, a
    comparison table and the computed percentage changes.
    """
    if not asset_id:
        return None

    readings: Dict[int, Dict[str, float]] = {}
    conditions: Dict[int, Dict[str, bool]] = {}
    found_docs = []
    for doc in _inspection_documents(db, company_id, asset_id):
        text = _document_text(doc)
        measurements = extract_measurements(text)
        if not measurements:
            continue
        year = int(YEAR_TAIL_RE.search(doc.document_id).group(1))
        if years and year not in years:
            continue
        readings[year] = measurements
        conditions[year] = _extract_condition_flags(text)
        found_docs.append(doc.document_id)

    if not readings:
        return None

    ordered_years = sorted(readings)
    latest_year = ordered_years[-1]
    latest = readings[latest_year]
    latest_conditions = conditions.get(latest_year, {})

    def metric_series(key: str) -> Dict[str, Any]:
        return {
            "name": METRIC_LABELS[key],
            "data": [
                {"label": str(year), "value": readings[year][key]}
                for year in ordered_years
                if readings[year].get(key) is not None
            ],
        }

    chart = {
        "type": "line",
        "title": f"Pressure, Corrosion, and Vibration Levels ({ordered_years[0]}–{ordered_years[-1]})",
        "series": [
            metric_series("pressure"),
            metric_series("corrosion"),
            metric_series("vibration"),
        ],
    }

    percent_changes: Dict[str, List[Dict[str, Any]]] = {}
    for key in ("pressure", "corrosion", "vibration"):
        changes = []
        for before_year, after_year in zip(ordered_years, ordered_years[1:]):
            change = _percent_change(
                readings[before_year].get(key), readings[after_year].get(key)
            )
            if change is not None:
                changes.append({
                    "from": before_year,
                    "to": after_year,
                    "percent": change,
                    "unit": METRIC_LABELS[key],
                })
        percent_changes[key] = changes

    pressure = latest.get("pressure")
    corrosion = latest.get("corrosion")
    vibration = latest.get("vibration")

    pressure_status = "NORMAL"
    if pressure is not None:
        if latest_conditions.get("pressure_above_limit") or pressure > PRESSURE_APPROVED_MAX:
            pressure_status = "CRITICAL"
        elif pressure > (readings[ordered_years[0]].get("pressure") or pressure):
            pressure_status = "WARNING"

    def risk_status(value: Optional[float]) -> str:
        if value is None:
            return "INFO"
        if latest_conditions.get("engineering_review"):
            return "CRITICAL"
        return "WARNING" if value > (readings[ordered_years[0]].get("corrosion") or value) else "NORMAL"

    metrics = [
        {
            "name": "Pressure",
            "value": f"{pressure:.1f}" if pressure is not None else "n/a",
            "unit": "bar",
            "status": pressure_status,
        },
        {
            "name": "Corrosion",
            "value": f"{corrosion:.1f}" if corrosion is not None else "n/a",
            "unit": "mm",
            "status": risk_status(corrosion),
        },
        {
            "name": "Vibration",
            "value": f"{vibration:.1f}" if vibration is not None else "n/a",
            "unit": "mm/s",
            "status": risk_status(vibration),
        },
    ]

    findings = []
    for key, label in (
        ("pressure", "Pressure"),
        ("corrosion", "Corrosion"),
        ("vibration", "Vibration"),
    ):
        changes = percent_changes.get(key) or []
        first = readings[ordered_years[0]].get(key)
        last = readings[latest_year].get(key)
        if first is None or last is None:
            continue
        delta = last - first
        change_text = ""
        if changes:
            change_text = " | ".join(
                f"{c['to']} vs {c['from']}: {c['percent']:+g}%"
                for c in changes
            )
        status = "exceeded the approved maximum operating pressure" if (
            key == "pressure" and (latest_conditions.get("pressure_above_limit") or last > PRESSURE_APPROVED_MAX)
        ) else ("flagged for engineering review" if (
            latest_conditions.get("engineering_review")
        ) else "trending upward")
        findings.append({
            "title": f"{label} trend ({ordered_years[0]} → {latest_year})",
            "detail": (
                f"{label} changed from {first:g} to {last:g} ({delta:+g}); {change_text}; "
                f"latest value {status}."
            ),
            "confidence": "HIGH",
        })

    if latest_conditions.get("pressure_above_limit") or (pressure is not None and pressure > PRESSURE_APPROVED_MAX):
        findings.append({
            "title": "Operating limit exceeded",
            "detail": (
                f"Operating pressure {pressure:g} bar exceeds the approved maximum of "
                f"{PRESSURE_APPROVED_MAX:g} bar per the {latest_year} inspection report."
            ),
            "confidence": "HIGH",
        })

    table = {
        "title": "P-102 Inspection Readings",
        "headers": ["Year", "Pressure (bar)", "Corrosion (mm)", "Vibration (mm/s)", "Seal temp (°C)"],
        "rows": [
            [
                str(year),
                f"{readings[year].get('pressure'):.1f}" if readings[year].get("pressure") is not None else "—",
                f"{readings[year].get('corrosion'):.1f}" if readings[year].get("corrosion") is not None else "—",
                f"{readings[year].get('vibration'):.1f}" if readings[year].get("vibration") is not None else "—",
                f"{readings[year].get('seal_temp'):.1f}" if readings[year].get("seal_temp") is not None else "—",
            ]
            for year in ordered_years
        ],
    }

    risk_level = "HIGH" if (
        latest_conditions.get("pressure_above_limit") or latest_conditions.get("engineering_review")
    ) else "MEDIUM"

    return {
        "asset_id": asset_id,
        "years": ordered_years,
        "latest_year": latest_year,
        "documents": found_docs,
        "readings": {str(year): value for year, value in readings.items()},
        "percent_changes": percent_changes,
        "risk_level": risk_level,
        "chart": chart,
        "metrics": metrics,
        "findings": findings,
        "table": table,
    }