"""Entity reference consistency guard.

Deterministic check: if the user's query references a plant code (asset ids like
P-102/FT-101, unit tags like CDU-4/HDS-1/UTY), verify that code actually exists in
the ApexPetro knowledge base and in the retrieved evidence. The resulting note is
injected into the synthesis prompt so the LLM never fabricates details about a
plant item that does not exist or that the evidence never mentions.
"""
import re
from typing import Dict, List, Set

from app.rag.doc_metadata import extract_asset_ids

_UNIT_SOURCE_DOCS = [
    "assets_asset_hierarchy",
    "assets_asset_relationships",
    "specs_unit_design_parameters",
    "specs_apexpetro_master",
]


def load_known_codes(db) -> Dict[str, Set[str]]:
    """Read distinct asset/instrument codes (chunk metadata) + unit tags."""
    from app.db.models import Document, DocumentChunk

    codes: Set[str] = set()
    units: Set[str] = set()
    try:
        rows = (
            db.query(DocumentChunk.chunk_metadata)
            .filter(DocumentChunk.embedding.isnot(None))
            .all()
        )
        for (meta,) in rows:
            meta = meta or {}
            a = meta.get("asset_id")
            if a:
                codes.add(str(a).strip().upper())
            for aa in meta.get("asset_ids") or []:
                if aa:
                    codes.add(str(aa).strip().upper())
    except Exception:
        pass
    try:
        stmt = (
            db.query(DocumentChunk.content)
            .join(Document, Document.id == DocumentChunk.document_id)
            .filter(Document.document_id.in_(_UNIT_SOURCE_DOCS))
        )
        for (text,) in stmt.all():
            for m in re.finditer(r"(?im)^\s*unit(?:_id)?\s*[:=]\s*([A-Za-z0-9_-]+)", text):
                u = m.group(1).strip().upper()
                if u:
                    units.add(u)
    except Exception:
        pass
    return {"assets": codes, "units": units}


def _norm_unit(tok: str) -> str:
    return re.sub(r"[\s-]+", "", tok).upper()


_CODE_PATTERN = re.compile(r"\b[A-Z]{1,3}-?\d{2,4}\b")


def referenced_codes(query: str, known_units: Set[str] = None) -> List[str]:
    """Codes explicitly mentioned by the user query.

    Only trustworthy signal classes are used so ordinary English words are never
    treated as plant codes:
      1. asset/instrument pattern codes (P-102, FT-101, ...),
      2. query tokens that exactly match a known unit tag (CDU-4, HDS-1, UTY, ...),
      3. generic letter-number plant-code tokens (U-101, V-999) so references to
         codes that do not exist at all are still detected.
    """
    codes = set(extract_asset_ids(query))
    for m in _CODE_PATTERN.finditer(query or ""):
        codes.add(m.group(0).upper())
    if known_units:
        unit_norms = {_norm_unit(u): u for u in known_units}
        for tok in re.findall(r"[\w-]+", query or ""):
            if _norm_unit(tok) in unit_norms:
                codes.add(unit_norms[_norm_unit(tok)])
    return sorted(codes)


def build_consistency_note(query: str, evidence_text: str, db=None) -> str:
    """Return a synthesis hint (or "") validating entity references vs the corpus."""
    known = load_known_codes(db) if db is not None else {"assets": set(), "units": set()}
    codes = referenced_codes(query, known["units"])
    if not codes:
        return ""
    known_all = known["assets"] | known["units"]

    checks: List[str] = []
    evidence_upper = evidence_text.upper()
    for code in codes:
        if code in known_all:
            if code not in evidence_upper:
                checks.append(
                    f"- '{code}' exists in the knowledge base but is not covered by the retrieved "
                    f"evidence below; do not state specific values for it unless the evidence "
                    f"mentions it, and say so if it is not covered."
                )
        else:
            checks.append(
                f"- '{code}' does NOT occur anywhere in the ApexPetro knowledge base (no asset, "
                f"instrument, unit or report references it). Do NOT attribute any equipment, value, "
                f"location, date or event to '{code}'. State clearly it was not found in the "
                f"knowledge base."
            )

    if not checks:
        return ""
    known_units = ", ".join(sorted(known["units"])) or "none"
    return (
        "\n\nEntity-reference verification (IMPORTANT - follow strictly):\n"
        + "\n".join(checks)
        + f"\nKnown plant units are: {known_units}."
    )