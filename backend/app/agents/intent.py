"""Deterministic query understanding & intent classification.

This replaces the old "greeting or search-documents-everything" behaviour.
The classifier decides, at the root of the chat flow:

* whether the query is *conversational* (no RAG, no planner, direct reply)
* whether company information is required (authoritative DB facts, not RAG)
* whether the query asks to summarize an existing knowledge-base document
* whether it is a comparison requiring multiple documents
* whether it is a complex multi-task query that must be decomposed into a plan
* which knowledge targets (asset, year, document type, department) to filter on

Everything is deterministic (regex + phrase signals) so behaviour is
predictable, testable and offline - deliberately no hardcoded per-example
answers, just generic signals. The orchestrator uses the category returned
here to pick the correct path through the existing pipeline.
"""
import re
from typing import Dict, Any, List, Optional
from app.rag.doc_metadata import (
    DOCUMENT_TYPE_SOP, DOCUMENT_TYPE_MANUAL, DOCUMENT_TYPE_POLICY,
    DOCUMENT_TYPE_PROCEDURE, DOCUMENT_TYPE_INSPECTION, DOCUMENT_TYPE_MAINTENANCE,
    DOCUMENT_TYPE_INCIDENT, DOCUMENT_TYPE_EQUIPMENT, DOCUMENT_TYPE_VENDOR,
    DOCUMENT_TYPE_PROJECT, DOCUMENT_TYPE_REGISTER, DOCUMENT_TYPE_REPORT,
    extract_asset_ids, extract_year,
)

_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")

# --------------------------------------------------------------------------- #
# Chat-document reference detection
# --------------------------------------------------------------------------- #
# Detects whether the query refers to a document the user uploaded to this
# conversation, as opposed to the permanent company knowledge base. Only
# specific demonstrative + file-noun forms qualify ("this report", "the file
# i uploaded", "summarize this pdf", ...) so ordinary KB questions ("what does
# the SOP say about X") never match. Matches are conservative: "the document"
# / "the report" alone do NOT count as an upload reference.

_CHAT_ATTACH_PATTERNS = [
    re.compile(r"\bthis\s+(?:uploaded\s+)?(?:document|file|report|attachment|note|pdf|image|photo|picture|scan)\b"),
    re.compile(r"\bthat\s+(?:uploaded\s+)?(?:document|file|report|note|image)\b"),
    re.compile(r"\bthe\s+uploaded\s+(?:document|file|report|attachment|note)\b"),
    re.compile(r"\bthe\s+(?:first|second|latest|last|new(?:est)?)\s+uploaded\s+(?:document|file|report)\b"),
    re.compile(r"\b(?:these|those|the\s+two)\s+(?:uploaded\s+)?(?:documents|files|reports|attachments)\b"),
    re.compile(r"\b(?:document|file|report|image|scan|note)s?\s+(?:i|you|we)\s+(?:just\s+)?(?:uploaded|attached)\b"),
    re.compile(r"\b(?:i|you|we)\s+(?:have\s+)?(?:just\s+)?(?:uploaded|attached)\s+(?:an?\s+)?(?:document|file|report|image|scan|note)\b"),
    re.compile(r"\bin\s+(?:my|this)\s+(?:uploaded\s+)?(?:document|file|report|note)\b"),
    re.compile(r"\bwhat\s+(?:does|do|did|is|'s)\s+(?:this|that|the)\s+(?:uploaded\s+)?(?:document|file|report|image|scan|note)\b"),
    re.compile(r"\bsummari[sz]e\s+(?:this|that|my)\s+(?:uploaded\s+)?(?:document|file|report|note|image)\b"),
    re.compile(r"\b(?:summary|overview|analysis)\s+of\s+(?:this|that|my)\s+(?:uploaded\s+)?(?:document|file|report|note)\b"),
    # "the note uploaded to this chat" / "the file I uploaded" style phrasing
    re.compile(r"\bthe\s+(?:document|file|report|note|attachment|image|scan)\s+uploaded\s+to\s+(?:this|my)\s+(?:chat|conversation)\b"),
    re.compile(r"\b(?:in|inside)\s+(?:that|this|my)\s+same\s+(?:uploaded\s+)?(?:document|file|report|note|image)\b"),
    re.compile(r"\b(?:what|which)\s+(?:is|are|was|were)\s+the\s+(?:document|file|report|note|identifier|code)\s*(?:in|about)?\s+(?:the\s+)?(?:note|file|document|report)\s+(?:i\s+|you\s+|we\s+)?(?:just\s+)?(?:uploaded|attached)\b"),
    re.compile(r"\b(?:the\s+)?(?:note|file|document|report)\s+(?:i|you|we)\s+uploaded\b"),
    re.compile(r"\buploaded\s+(?:\w+\s+){0,2}(?:document|file|report|note|image|scan|pdf|attachment)\b"),
    # plural "uploaded reports/documents/files" references (compare/summarize uploads)
    re.compile(r"\b(?:my|the|both|these|those|all)\s+(?:two|three|both)?\s+uploaded\s+(?:documents|files|reports|attachments)\b"),
    re.compile(r"\b(?:both|these|those|all)\s+(?:my\s+)?(?:two\s+)?uploaded\s+(?:documents|files|reports|attachments)\b"),
]

# Signals that the query ALSO asks about the permanent company knowledge base
# (an uploaded-document question becomes a HYBRID question when it references
# both an upload and company content such as an SOP or a manual).
_CHAT_HYBRID_SIGNALS = [
    "sop", "standard operating", "manual", "policy", "procedure",
    "knowledge base", "permanent", "work order",
    "with the sop", "with the manual", "with the company", "with the policy",
    "against the sop", "against the manual", "against the company", "against the policy",
    "company sop", "company manual", "company policy",
]

CHAT_REFERENCE_NONE = "none"
CHAT_REFERENCE_CHAT_ONLY = "chat_only"
CHAT_REFERENCE_HYBRID = "hybrid"


def extract_years(text: str) -> List[int]:
    """All distinct years in the query (e.g. '2024 and 2025' -> [2024, 2025])."""
    years = []
    for m in _YEAR_RE.finditer(text or ""):
        year = int(m.group(0))
        if 1980 <= year <= 2100 and year not in years:
            years.append(year)
    return years

CONVERSATIONAL = "conversational"
COMPANY_INFO = "company_info"
SUMMARIZATION = "summarization"
COMPARISON = "comparison"
KNOWLEDGE = "knowledge"
CREATE_DOCUMENT = "create_document"
UPDATE_ARTIFACT = "update_artifact"
CONVERT_ARTIFACT = "convert_artifact"
CODE = "code"
ANALYSIS = "analysis"
COMPLEX = "complex"

# Words that indicate a request needs real content even if it *also* looks like
# small talk ("Hi, what is the pressure for P-102?" is NOT conversational).
_SUBJECT_HINTS = [
    "pressure", "corrosion", "vibration", "inspection", "p-102", "p 102", "p-101",
    "pump", "asset", "flow rate", "temperature", "report", "create", "generate",
    "analyz", "analyse", "document", "sop", "manual", "maximum", "minimum", "limit",
    "deviation", "work order", "risk", "how to", "maintenance", "department",
    "company", "refinery", "policy", "procedure", "summar", "compare", "diff",
    "jamnagar", "calculate", "operating", "capacity", "standard", "spec",
    "requirements", "steps", "checks", "compliance", "audit", "incident", "history",
    "during", "before", "after", "allowed", "normal", "design",
]

# Expanded conversational signals. These are generic patterns (not example
# strings) so similar phrasings are recognised too.
_CONVERSATIONAL_PATTERNS = [
    re.compile(r"^\s*(hi|hii+|hello+|hey|heyy+|yo|hi there|hello there|howdy)\b[\s!.?]*$", re.I),
    re.compile(r"\bgood\s*(morning|afternoon|evening|day|night|weekend)\b", re.I),
    re.compile(r"\b(how\s*are\s*you|are\s*you\s*(fine|ok(?:ay)?|good|well)|how('s| is)\s*it\s*going|how\s*are\s*things|how('re| are)\s*you\s*doing|how\s*u\b|hows\s*it)\b", re.I),
    re.compile(r"\b(thanks|thank\s*you|thank\s*you\s+so\s+much|ty|thx|appreciate\s*(it|your\s*help)|much\s*appreciated|that\s*was\s*helpful)\b", re.I),
    re.compile(r"\b(goodbye|bye|see\s*ya|see\s*you|see\s*you\s*soon|take\s*care|have\s*a\s*(good|great)\s*(day|one|weekend)|good\s*night)\b", re.I),
    re.compile(r"^\s*(ok|okay|alright|sure|great|nice|cool|good|fine|sounds\s*good|got\s*it|understood|yep|yeah|no|yes)\s*[.!]?\s*$", re.I),
    re.compile(r"\b(who\s*are\s*you|what\s*(are|is)\s*you(r|)|\w*'s\s*your\s*name|your\s*name|what\s*(can|do|d')?\s*you\s*do|what\s*can\s*you\s*help\s*with|explain\s*what\s*you\s*can\s*do|what\s*are\s*you\s*capable\s*of|can\s*you\s*help\s*me|are\s*you\s*an\s*ai|tell\s*me\s*about\s*yourself)\b", re.I),
    re.compile(r"^\s*(pardon|excuse\s*me|sorry\s*\?|what\?\s*|come\s*again|repeat\s*that)\s*$", re.I),
]

# Keywords that trigger the "company" path (authoritative DB facts).
_COMPANY_KEYWORDS = [
    "company", "apexpetro", "refinery", "organization", "our firm",
    "corporate", "headquarter", "industry", "employees", "annual capacity",
    "jamnagar", "plant", "facility", "who we are", "about us",
]

_COMPANY_PHRASES = [
    "what does the company do", "what is the name of the company", "name of the company",
    "tell me about the company", "about the company", "company information",
    "company profile", "company overview", "which company", "who owns",
    "where is the", "located at", "what assets does the company",
    "which departments are present", "departments are present",
    "what departments exist", "list the departments", "what does the firm do",
    "what is apexpetro", "tell me about apexpetro", "about apexpetro",
    "what does the organization", "what kind of business", "what business is",
]

# Strong analysis verbs only; weak review-style nouns (risk assessment,
# review, overview) belong to document generation / retrieval and would cause
# false "analysis" intent on "create a risk assessment document".
_ANALYSIS_KEYWORDS = [
    "analy", "trend", "average", "metrics", "kpi",
    "deviation", "calculate", "compute",
    "spike", "anomal", "pattern", "forecast", "predict", "correlat",
]

_SUMMARY_VERBS = [
    "summar", "sum up", "sum-up", "key points", "key findings", "key takeaways",
    "executive summary", "brief summary", "detailed summary", "short summary",
    "quick summary", "overview of the", "give me an overview", "condense", "in 5 points",
    "in 3 points", "in 10 points", "in a few points", "highlight the main",
]

_COMPARISON_WORDS = [
    "compare", "comparison", "differences between", "difference between",
    "what's the difference", " what is the difference", "vs", " vs ", "v/s",
    "year over year", "previous and", "previous versus", "changed between",
    "changes between", "versus", "rather than", "as opposed to", "delta between",
]

_LEVEL_BRIEF = ["brief", "short", "quick", "concise", "summary in a few"]
_LEVEL_DETAILED = ["detailed", "in detail", "comprehensive", "thorough"]
_LEVEL_FINDINGS = ["key finding", "key point", "key takeaway", "main finding", "main point", "highlight"]

# noun phrase -> department (for "which department handles X" questions)
_DEPARTMENT_MAP = {
    "maintenance": "Maintenance",
    "inspection": "Inspection",
    "engineering": "Engineering",
    "procurement": "Procurement",
    "operations": "Operations",
    "hse": "HSE",
    "safety": "HSE",
    "quality": "Quality",
    "instrumentation": "Instrumentation",
    "it security": "IT Security",
    "security": "IT Security",
    "document control": "Document Control",
    "process engineering": "Process Engineering",
}

# topic keyword -> canonical document_type filter value
_TOPIC_MAP = [
    (["sop", "standard operating", "steps required", "checks required",
      "pre-startup", "pre-requisite", "procedure for", "permit to work"], DOCUMENT_TYPE_SOP),
    (["inspection", "inspect", "condition monitoring", "thickness", "ndt",
      "non-destructive", "corrosion monitoring", "visual check", "integrity"], DOCUMENT_TYPE_INSPECTION),
    (["maintenance", "overhaul", "maint", "history of repairs", "work order"], DOCUMENT_TYPE_MAINTENANCE),
    (["manual", "handbook", "guideline", "datasheet", "data sheet", "equipment record"], DOCUMENT_TYPE_MANUAL),
    (["policy", "polic"], DOCUMENT_TYPE_POLICY),
    (["incident", "seal leakage", "leak", "near miss", "spill"], DOCUMENT_TYPE_INCIDENT),
    (["vendor", "supplier", "technical report"], DOCUMENT_TYPE_VENDOR),
    (["register", "backlog", "schedule", "log"], DOCUMENT_TYPE_REGISTER),
]


class IntentAnalysis(Dict[str, Any]):
    """Structured result of query classification."""

    def __init__(self, **kwargs: Any):
        defaults = {
            "category": KNOWLEDGE,
            "requires_rag": True,
            "requires_planner": True,
            "multi_document": False,
            "asset_ids": [],
            "years": [],
            "document_type": None,
            "summary_level": None,
            "company_related": False,
            "department": None,
            "comparison": False,
            "complex": False,
            "task_signals": [],
            "reason": "",
            "query": "",
            "chat_reference": CHAT_REFERENCE_NONE,
        }
        defaults.update(kwargs)
        super().__init__(defaults)

    @property
    def category(self) -> str:
        return self["category"]


class IntentClassifier:
    def analyse_query(self, query: str) -> IntentAnalysis:
        q = (query or "").strip()
        ql = q.lower()
        asset_ids = extract_asset_ids(q)
        years = extract_years(q)

        task_signals: List[str] = []
        company_related = self._is_company(ql)
        if company_related:
            task_signals.append("company")

        if asset_ids:
            task_signals.append("asset")

        topics = self._detect_topics(ql)
        if topics:
            task_signals.append("knowledge")
        if any(k in ql for k in _ANALYSIS_KEYWORDS):
            task_signals.append("analysis")
        if any(k in ql for k in _COMPARISON_WORDS):
            task_signals.append("comparison")
        if any(k in ql for k in _SUMMARY_VERBS):
            task_signals.append("summarization")
        if self._is_create_document(ql):
            task_signals.append("create_document")

        department = self._detect_department(ql)

        # --- 1. Conversational?  (strongest guard: never RAG on chitchat) ---
        if self._is_conversational(ql):
            return IntentAnalysis(
                category=CONVERSATIONAL,
                requires_rag=False,
                requires_planner=False,
                asset_ids=asset_ids,
                years=years,
                document_type=topics[0] if topics else None,
                department=department,
                task_signals=task_signals,
                reason="Conversational/general query - answered directly, no RAG/planner",
                query=q,
            )

        # --- 2. Update / convert / code intents (existing capabilities) ---
        if self._is_update(ql):
            return IntentAnalysis(
                category=UPDATE_ARTIFACT,
                requires_rag=False,
                requires_planner=True,
                asset_ids=asset_ids, years=years,
                document_type=topics[0] if topics else None,
                task_signals=task_signals,
                reason="Request to update an existing generated artifact",
                query=q,
            )
        if self._is_convert(ql):
            return IntentAnalysis(
                category=CONVERT_ARTIFACT,
                requires_rag=False,
                requires_planner=True,
                asset_ids=asset_ids, years=years,
                document_type=topics[0] if topics else None,
                task_signals=task_signals,
                reason="Request to convert an existing generated artifact",
                query=q,
            )
        if self._is_code(ql):
            return IntentAnalysis(
                category=CODE,
                requires_rag=False,
                requires_planner=True,
                asset_ids=asset_ids, years=years,
                task_signals=task_signals,
                reason="Code/scripting request routed to the coding sandbox",
                query=q,
            )

        # --- 3. Complex multi-task? (checked before single-task intents so a
        #        multi-part request decomposes into a visible plan) ---
        if self._is_complex(ql, task_signals):
            return IntentAnalysis(
                category=COMPLEX,
                requires_rag=True,
                requires_planner=True,
                multi_document=True,
                asset_ids=asset_ids, years=years,
                document_type=topics[0] if topics else None,
                summary_level=self._detect_summary_level(ql),
                company_related=company_related,
                department=department,
                comparison=any(k in ql for k in _COMPARISON_WORDS),
                complex=True,
                task_signals=list(dict.fromkeys(task_signals)),
                reason="Complex multi-task query decomposed into a visible execution plan",
                query=q,
            )

        if self._is_create_document(ql):
            return IntentAnalysis(
                category=CREATE_DOCUMENT,
                requires_rag=True,
                requires_planner=True,
                asset_ids=asset_ids, years=years,
                document_type=topics[0] if topics else None,
                company_related=company_related,
                task_signals=task_signals,
                reason="Document/artifact generation request",
                query=q,
            )

        # --- 3. Complex multi-task? ---
        if self._is_complex(ql, task_signals):
            return IntentAnalysis(
                category=COMPLEX,
                requires_rag=True,
                requires_planner=True,
                multi_document=True,
                asset_ids=asset_ids, years=years,
                document_type=topics[0] if topics else None,
                summary_level=self._detect_summary_level(ql),
                company_related=company_related,
                department=department,
                comparison=any(k in ql for k in _COMPARISON_WORDS),
                complex=True,
                task_signals=list(dict.fromkeys(task_signals)),
                reason="Complex multi-task query decomposed into a visible execution plan",
                query=q,
            )

        # --- 4. Summarization of an existing KB document ---
        if any(k in ql for k in _SUMMARY_VERBS):
            return IntentAnalysis(
                category=SUMMARIZATION,
                requires_rag=True,
                requires_planner=True,
                multi_document=False,
                asset_ids=asset_ids, years=years,
                document_type=topics[0] if topics else None,
                summary_level=self._detect_summary_level(ql),
                company_related=company_related,
                task_signals=task_signals,
                reason="Summarization of an indexed knowledge-base document",
                query=q,
            )

        # --- 5. Comparison (multi-document, first-class) ---
        if any(k in ql for k in _COMPARISON_WORDS):
            two_targets = self._count_targets(ql, asset_ids, years, topics)
            return IntentAnalysis(
                category=COMPARISON,
                requires_rag=True,
                requires_planner=True,
                multi_document=two_targets >= 2 or "vs" in ql or "versus" in ql or "compare" in ql,
                asset_ids=asset_ids, years=years,
                document_type=topics[0] if topics else None,
                department=department,
                comparison=True,
                task_signals=task_signals,
                reason="Comparison request requiring multi-document retrieval and a comparison answer",
                query=q,
            )

        # --- 6. Company information (authoritative DB facts) ---
        if company_related:
            return IntentAnalysis(
                category=COMPANY_INFO,
                requires_rag=False,
                requires_planner=True,
                asset_ids=asset_ids, years=years,
                document_type=topics[0] if topics else None,
                department=department,
                task_signals=task_signals,
                reason="Company question answered from authoritative company records",
                query=q,
            )

        # --- 7. Analysis ---
        if any(k in ql for k in _ANALYSIS_KEYWORDS):
            return IntentAnalysis(
                category=ANALYSIS,
                requires_rag=True,
                requires_planner=True,
                asset_ids=asset_ids, years=years,
                document_type=topics[0] if topics else None,
                department=department,
                task_signals=task_signals,
                reason="Analysis query routed to retrieval + structured analysis",
                query=q,
            )

        # --- 8. Knowledge base question (SOP/department/asset/document) ---
        return IntentAnalysis(
            category=KNOWLEDGE,
            requires_rag=True,
            requires_planner=True,
            asset_ids=asset_ids, years=years,
            document_type=topics[0] if topics else None,
            department=department,
            task_signals=task_signals,
            reason="Knowledge-base question with targeted retrieval",
            query=q,
        )

    # ------------------------------------------------------------------ #
    def _is_conversational(self, ql: str) -> bool:
        if not ql:
            return False
        # Identity/capability questions ("Who are you?", "What can you do?")
        # are conversational even though they contain interrogatives.
        identity = any(p.search(ql) for p in _CONVERSATIONAL_PATTERNS)
        if identity and not any(h in ql for h in _SUBJECT_HINTS):
            return True
        if any(h in ql for h in _SUBJECT_HINTS):
            return False
        return identity

    def _is_company(self, ql: str) -> bool:
        if any(k in ql for k in _COMPANY_PHRASES):
            return True
        if any(k in ql for k in _COMPANY_KEYWORDS):
            # "company" alone is often followed by a subject that needs RAG
            # (e.g. "company SOP"), so require company-specific phrasing OR a
            # bare company/profiling mention.
            if any(h in ql for h in ["department", "sop", "policy", "procedure",
                                     "inspection report", "p-102", "asset", "maintenance record"]):
                return False
            return True
        return False

    def _detect_topics(self, ql: str) -> List[str]:
        found: List[str] = []
        for keywords, canonical in _TOPIC_MAP:
            if any((k in ql) for k in keywords):
                if canonical not in found:
                    found.append(canonical)
        return found

    def _detect_department(self, ql: str) -> Optional[str]:
        dept_trigger = any(t in ql for t in [
            "department", "responsible for", "handles", "approved", "which dept",
            "owned by", "who is responsible", "who handles", "in charge of",
        ])
        if not dept_trigger:
            return None
        for noun, dept in _DEPARTMENT_MAP.items():
            if noun in ql:
                return dept
        # Fall back: explicit "the X department"
        m = re.search(r"(?:department|dept)?\b(?:the\s+)?([a-z\- ]+)\s+department\b", ql)
        if m:
            return m.group(1).strip().capitalize()
        return None

    def _detect_summary_level(self, ql: str) -> str:
        m = re.search(r"in\s+(\d{1,2})\s*points?", ql)
        if m:
            return f"{m.group(1)}_points"
        if any(k in ql for k in _LEVEL_DETAILED):
            return "detailed"
        if any(k in ql for k in _LEVEL_FINDINGS):
            return "findings"
        if any(k in ql for k in _LEVEL_BRIEF):
            return "brief"
        return "concise"

    def _is_create_document(self, ql: str) -> bool:
        if any(h in ql for h in [
            "create a", "create an", "generate a", "generate an", "prepare a",
            "prepare an", "write a", "write an", "draft a", "draft an", "make a",
            "make an", "put it in a sheet", "put this in excel", "in a sheet",
            "as a ppt", "as a pdf", "create the risk", "generate the risk",
        ]):
            # "make a ppt" / "generate a report" -> document generation
            if any(h in ql for h in ["document", "report", "approval", "technical",
                                     "inspection", "risk", "management summary", "ppt",
                                     "presentation", "sheet", "excel", "csv", "pdf", "deck"]):
                return True
        return False

    def _is_update(self, ql: str) -> bool:
        return any(h in ql for h in [
            "update the document", "update the artifact", "edit the document",
            "revise the document", "add a section", "expand the", "make a version",
            "new version of", "change the document", "revise the approval",
            "modify the", "draft a revision", "add a note", "add an appendix",
            "include a section", "extend the document",
        ])

    def _is_convert(self, ql: str) -> bool:
        return any(h in ql for h in [
            "convert", "turn it into", "change format to", "as a pdf instead",
            "into a pdf", "into an excel", "as an excel", "as a pdf", "as a csv",
        ]) and any(h in ql for h in ["pdf", "docx", "xlsx", "csv", "json", "md",
                                    "txt", "pptx", "word", "excel", "powerpoint", "slides"])

    def _is_code(self, ql: str) -> bool:
        return any(h in ql for h in [
            "write a python", "write python", "python script", "python code",
            "run a python", "run python", "script to compute", "script that computes",
            "write a script", "script to calculate", "simulate", "simulation",
            "generate code", "write code", "compute deviation using",
        ])

    def _is_complex(self, ql: str, signals: List[str]) -> bool:
        s = set(signals)
        # Four+ distinct sub-tasks joined in one query -> always complex.
        if len(s) >= 4:
            return True
        # Doc generation plus another distinct request (retrieve/compare/
        # company/summarize/analyze) -> multi-part, not a single generation.
        if "create_document" in s and (s & {"company", "comparison", "summarization", "analysis"}):
            return True
        # Comparison combined with company/generation/summary context.
        if "comparison" in s and len(s) >= 3 and (s & {"company", "create_document", "summarization"}):
            return True
        return False

    def _detect_chat_reference(self, ql: str) -> str:
        """'chat_only' | 'hybrid' | 'none' - does this query reference uploads?"""
        if not ql:
            return CHAT_REFERENCE_NONE
        matched = any(p.search(ql) for p in _CHAT_ATTACH_PATTERNS)
        if not matched:
            return CHAT_REFERENCE_NONE
        if any(s in ql for s in _CHAT_HYBRID_SIGNALS):
            return CHAT_REFERENCE_HYBRID
        return CHAT_REFERENCE_CHAT_ONLY

    def _count_targets(self, ql: str, asset_ids: List[str], years: List[int], topics: List[str]) -> int:
        count = len(asset_ids) + len(years)
        if len(topics) >= 2:
            count += len(topics)
        # year ranges phrased as "2024 and 2025"
        years_in_text = re.findall(r"(19|20)\d{2}", ql)
        if len(set(years_in_text)) > 1:
            count += 1
        for sep in [" and ", " & ", " vs ", " versus ", ", ", " with "]:
            if sep in ql:
                # heuristic: separated references indicate multiple targets
                count += 1
        return count


intent_classifier = IntentClassifier()


def classify_query(query: str) -> IntentAnalysis:
    result = intent_classifier.analyse_query(query)
    result["chat_reference"] = intent_classifier._detect_chat_reference((query or "").lower())
    return result