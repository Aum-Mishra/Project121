"""Deterministic query intelligence shared by the chat pipeline.

Pure, rule-based helpers that run BEFORE the LLM classifier so that routing,
complexity and response depth never depend on the language model. Also gives
the pipeline explicit out-of-scope and company(MRPL) short-circuits, multi-asset
recognition, history/comparison detection and per-year retrieval boosts.
"""
import re

OUT_OF_SCOPE_PATTERNS = [
    r"prime minister", r"president of", r"chief minister", r"politician",
    r"election", r"parliament", r"government of",
    r"cricket match", r"football", r"world cup", r"olympics", r"ipl ",
    r"movies?", r"film star", r"actor", r"celebrity", r"hollywood", r"bollywood",
    r"weather (in|at|today)", r"forecast", r"temperature in (delhi|mumbai|karnataka)",
    r"famous (singer|song|person|place)",
    r"capital of", r"national anthem", r"currency of", r"population of",
    r"time in", r"translate ", r"spell ", r"synonym", r"antonym",
    r"what is the meaning of", r"pi (\d|equals)", r"value of pi", r"unpaid education detail",
    r"recipe", r"cooking", r"how to lose weight",
    r"super bowl", r"formula 1", r"\bf1\b (race|driver)",
]

COMPANY_PATTERNS = [
    r"\bwhat is mrpl\b", r"\babout mrpl\b", r"\bwho owns mrpl\b",
    r"\bwhere is mrpl\b", r"\bmrpl company\b", r"\bcompany profile\b",
    r"\bintroduce mrpl\b", r"\bwhat does mrpl stand for\b",
    r"\brefinery.*mrpl\b", r"\bmrpl.*refinery\b",
    r"\b(brief|short|full)?\s*profile of\b.*\bmrpl\b",
    r"\boverview of\b.*\bmrpl\b", r"\bdescribe\b.*\bmrpl\b",
    r"\btell me about\b.*\bmrpl\b", r"\bgive me.*\bmrpl\b (profile|overview|intro)",
    r"\bwho are you\b", r"\bwhat can you do\b", r"\bhow can you help\b",
    r"\byour capabilities\b", r"\bwhat is this\b",
]

HISTORY_HINTS = [
    "history", "historical", "over the years", "year over year", "year-on-year",
    "year on year", "across the years", "every year", "annual", "annually",
    "since 202", "from 2024", "last three years", "3 years", "previous years",
    "compare", "comparison", "trend", "how has", "changed since", "evolution",
]

HISTORY_YEARS = ["2024", "2025", "2026"]

COMPLEX_HINTS = [
    "history", "compare", "comparison", "trend", "analysis", "risk",
    "assessment", "integrity", "comprehensive", "all years", "each year",
    "evaluate", "report", "summary", "across", "recommendation",
]

SIMPLE_HINTS = [
    "what is the current", "what is the latest", "what is the pressure",
    "what is the vibration", "what is the temperature", "current reading",
    "what was the 2026", "what is p-102", "status of", "specification",
    "design pressure", "flow rate", "capacity", "what is the seal",
]

ASSET_PATTERN = re.compile(r"\b((?:P|EP|CX|PSV)\s*-\s*\d{2,4}[A-Z]?|CDU-\s*\d|C-\d{2,3}|E-\d{2,3}[A-Z]?)\b", re.IGNORECASE)


# Registered asset facts (equipment register): type / service / unit / criticality.
ASSET_METADATA = {
    "P-102": {"type": "Centrifugal Pump", "service": "Primary / main process transfer pump",
              "unit": "CDU-4", "criticality": "HIGH", "region": "Crude Distillation Unit",
              "envelope": "Discharge pressure ≤40 bar, bearing vibration ≤7.1 mm/s, casing thickness ≥3.5 mm"},
    "P-102A": {"type": "Centrifugal Pump", "service": "Standby / parallel duty pump on the pump deck",
               "unit": "CDU-4", "criticality": "HIGH", "region": "Crude Distillation Unit",
               "envelope": "Discharge pressure ≤40 bar, bearing vibration ≤7.1 mm/s"},
    "P-103": {"type": "Centrifugal Pump", "service": "Cooling water circulation pump",
              "unit": "CDU-4", "criticality": "LOW", "region": "Cooling Circuit",
              "envelope": "Discharge pressure ≤40 bar, bearing vibration ≤7.1 mm/s"},
}


def metadata_brief(entity: str) -> dict | None:
    """Registered facts for an asset, or None when the asset is not registered."""
    return ASSET_METADATA.get(str(entity or "").upper().replace(" ", ""), None)


_META_WORDS = ("type", "kind", "class", "category", "specification", "service",
               "manufacturer", "make", "duty", "purpose", "function", "role of",
               "rated", "criticality", "used for", "what kind", "what type", "what is it",
               "pump is", "about", "overview")


def meta_query(query: str) -> bool:
    """True when the user asks about an asset's identity/description, NOT about
    measured readings, history or trends. These questions need register facts,
    never measurement tables or charts."""
    q = (query or "").lower()
    hits = sum(1 for w in _META_WORDS if w in q)
    if not hits:
        return False
    # A question that clearly asks for a reading/history must never be meta.
    if any(h in q for h in ("pressure", "vibration", "corrosion", "status", "limit",
                            "trend", "history", "compare", "readings", "beyond")):
        return False
    # "What kind of pump is P-103" style questions.
    if any(h in q for h in ("what type", "what kind", "what is it", "pump is", "type of")):
        return True
    return hits >= 2 and bool(detect_entities(query))


def fast_route(query: str, role: str) -> str:
    """Deterministic pre-classification gate.

    Returns one of: ``out_of_scope``, ``company_inquiry``,
    ``flagged_hr`` (force HR intent) or ``None`` (defer to the LLM).
    """
    q = (query or "").strip().lower()
    if len(q) < 3:
        return None
    # General-knowledge / world-affairs questions are NEVER in scope for any role.
    if any(re.search(p, q) for p in OUT_OF_SCOPE_PATTERNS):
        return "out_of_scope"
    # Company-identity questions about MRPL (or about this assistant).
    # Asset-bearing questions ("MRPL's P-102 ...") are NEVER company questions.
    if any(re.search(p, q) for p in COMPANY_PATTERNS) and "leave policy" not in q \
            and not detect_entities(q):
        return "company_inquiry"
    # Clear-cut HR signals take precedence even if the ML classifier hesitates.
    if any(k in q for k in ("leave policy", "hr policy", "attendance", "employee",
                            "5-day week", "probation", "payroll", "hr manager",
                            "paid leave", "casual leave", "sick leave")):
        if role in ("HR", "ENGINEER", "ADMIN"):
            return "flagged_hr"
    return None


def detect_entities(query: str) -> list:
    """Return every asset tag mentioned in the query, in order (tags are
    normalized: 'P -102', 'P-102' and 'P 102' all become 'P-102')."""
    found = [m.group(1).upper().replace(" ", "") for m in ASSET_PATTERN.finditer(query or "")]
    return list(dict.fromkeys(found))


def history_query(query: str) -> bool:
    q = (query or "").lower()
    return any(h in q for h in HISTORY_HINTS)


def trend_worth(query: str, intent: str) -> bool:
    """Whether trend charts genuinely add value for this query."""
    q = (query or "").lower()
    if intent == "graph_generation":
        return True
    if any(k in q for k in ("graph", "chart", "plot", "dashboard", "visualiz")):
        return True
    return history_query(q) or any(
        k in q for k in ("analy", "how has", "changed", "deviation", "inspection",
                         "risk", "review", "comparison"))


def normalized_complexity(query: str, llm_complexity: str) -> str:
    """Pin the complexity so response depth tracks the actual question."""
    comp = (llm_complexity or "MEDIUM").upper()
    if comp not in ("SIMPLE", "MEDIUM", "COMPLEX"):
        comp = "MEDIUM"
    q = (query or "").lower()
    if any(h in q for h in COMPLEX_HINTS) and len(q) >= 8:
        if len(q) > 60 or sum(1 for h in COMPLEX_HINTS if h in q) >= 2:
            comp = "COMPLEX" if comp in ("MEDIUM", "COMPLEX") else comp
        elif comp == "SIMPLE":
            comp = "MEDIUM"
    elif any(h in q for h in ("limit", "limits", "beyond", "status", "inspection",
                              "risk", "exceed", "check")):
        status_hits = sum(1 for h in ("limit", "limits", "beyond", "status", "inspection",
                                      "risk", "exceed", "check") if h in q)
        if status_hits >= 2 or any(h in q for h in ("compare", "history", "trend")):
            comp = "COMPLEX" if comp != "SIMPLE" else "MEDIUM"
        else:
            comp = "MEDIUM"
    elif any(q.startswith(h) for h in SIMPLE_HINTS) or len(q) <= 40:
        comp = "SIMPLE"
    return comp


def depth_for(comp: str, intent: str) -> str:
    intent = (intent or "").lower()
    if comp == "COMPLEX" or intent == "report_generation":
        return "full"
    if comp == "MEDIUM":
        return "standard"
    if intent == "company_inquiry":
        return "compact"
    return "compact"


def per_year_boost_queries(entities: list, query: str) -> list:
    """Extra vector queries that force each inspection year into context."""
    if not history_query(query) and "2024" not in (query or ""):
        return []
    pieces = [e for e in (entities or []) if re.match(r"P-\d", e)]
    tag = pieces[0] if pieces else "P-102"
    base = f"{tag} inspection records per year"
    return [f"{tag} 2024 inspection pressure corrosion vibration seal temperature values year 2024",
            f"{tag} 2025 inspection pressure corrosion vibration seal temperature values year 2025",
            f"{tag} 2026 inspection pressure corrosion vibration seal temperature values year 2026"] + [base]


def limit_boost_queries(entities: list) -> list:
    """Retrieval welcomes the SOP thresholds page and the asset operating
    envelope (operating_limits) whenever limits/status are in question."""
    pieces = [e for e in (entities or []) if re.match(r"P-\d", e)]
    tag = pieces[0] if pieces else "P-102"
    return [
        f"{tag} operating limits alarm high bar trip limit vibration mm/s retirement "
        f"minimum thickness normal review immediate thresholds",
        f"{tag} thresholds normal review immediate pump condition monitoring SOP "
        f"condition monitoring philosophy",
    ]


OUT_OF_SCOPE_ANSWER = (
    "That is outside the scope of what I can help with. I only answer questions "
    "related to MRPL — engineering/asset information, integrity, HR policies, and "
    "coding tasks inside the MRPL knowledge base."
)

COMPANY_ANSWER = (
    "**MRPL — Mangalore Refinery and Petrochemicals Limited** is a public-sector "
    "refining company headquartered in Mangaluru, Karnataka, India and a subsidiary "
    "of ONGC. It operates a grass-root refinery complex that processes crude oil "
    "(~15 MMTPA capacity) into fuels, LPG and petrochemical feedstocks. I am "
    "**MRPL KNOVIA AI**, the engineering copilot for MRPL — I can answer "
    "questions from the MRPL knowledge base on assets (e.g. P-102), integrity, "
    "inspection history, operating limits, HR policies and coding tasks."
)