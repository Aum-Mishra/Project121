import json
import asyncio
import re
import secrets
import datetime
from .llm_provider import generate_response, get_embedding


def _ai_meta() -> dict:
    """Provider/model actually serving this response (for UI transparency)."""
    from .ai_provider import status as _status
    s = _status()
    return {
        "provider": s["provider"],
        "provider_label": s["provider_label"],
        "model": s["model"],
        "mode": s["mode"],
    }
from .vector_store import search_documents, find_entity_documents, search_project_documents, project_keywords
from .query_intelligence import (
    fast_route, detect_entities, history_query, normalized_complexity, depth_for,
    per_year_boost_queries, limit_boost_queries, metadata_brief, meta_query,
    OUT_OF_SCOPE_ANSWER, COMPANY_ANSWER,
)

def fast_greeting_check(query: str) -> bool:
    greetings = ["hi", "hello", "hey", "good morning", "how are you"]
    return query.lower().strip() in greetings


def _pause(base: float, comp: str) -> float:
    """Time budget scales with task complexity (SIMPLE answers arrive fast)."""
    if str(comp or "MEDIUM").upper() == "SIMPLE":
        return round(base * 0.45, 2)
    return base


_ABNORMALITY_ASK_WORDS = (
    "abnormal", "abnormality", "anomaly", "risk", "integrity", "health",
    "condition", "status", "inspect", "review", "limit", "threshold",
    "assessment", "critical", "devi", "sop", "compared", "compare", "corrosion",
    "vibration", "recommend",
)


def asks_abnormality(query: str) -> bool:
    """Abnormality detection + approvals only run when the user asks for them,
    never as a side effect of every asset question."""
    q = (query or "").lower()
    return any(w in q for w in _ABNORMALITY_ASK_WORDS)

PLAN_TARGET = {"SIMPLE": 3, "MEDIUM": 5, "COMPLEX": 7}
PLAN_MIN = 3
PLAN_MAX = 24
PLAN_MIN_COMPLEX = 10

PLAN_POOLS = {
    "engineering_inquiry": {
        "SIMPLE": [
            "Retrieve the most relevant MRPL document covering the query",
            "Verify the requested parameters against the retrieved source",
            "Prepare the final grounded response with the verified value",
        ],
        "MEDIUM": [
            "Retrieve relevant MRPL documents and operating data for the entity",
            "Extract the requested parameters from the retrieved sources",
            "Cross-check the values against operating limits and process context",
            "Consolidate the findings into a clear answer",
            "Prepare the final grounded response with the evidence sources",
        ],
        "COMPLEX": [
            "Decompose the query into asset, limits, history and cross-dependency aspects",
            "Retrieve all related MRPL documents, operating data and datasets for the entity",
            "Extract and compare the relevant parameters across the sources",
            "Cross-check the evidence against operating limits and constraints",
            "Correlate the findings with related equipment and process context",
            "Evaluate any deviations and highlight risks found",
            "Synthesize the final grounded response with a complete evidence trail",
        ],
    },
    "report_generation": {
        "SIMPLE": [
            "Retrieve the report scope and source templates",
            "Gather the required data points for the report",
            "Draft the final report with the retrieved evidence",
        ],
        "MEDIUM": [
            "Retrieve the report template and required scope",
            "Gather the relevant data and figures from the sources",
            "Structure the report into sections with findings",
            "Review the draft for completeness and accuracy",
            "Finalize the report with sources and references",
        ],
        "COMPLEX": [
            "Retrieve the report template, scope and any prior revisions",
            "Gather data across multiple documents and datasets",
            "Structure the report into sections with tables and findings",
            "Cross-verify figures against operating data and limits",
            "Review the draft for accuracy, completeness and risk notes",
            "Apply formatting and export the report",
            "Finalize the report with a full evidence trail",
        ],
    },
    "graph_generation": {
        "SIMPLE": [
            "Retrieve the time-series or data source for the chart",
            "Aggregate the relevant data points",
            "Render the final chart with annotations",
        ],
        "MEDIUM": [
            "Retrieve the relevant data series for the chart",
            "Filter and aggregate the series over the requested window",
            "Choose the chart type that best fits the data",
            "Render the chart with axes, labels and trend annotations",
            "Attach the chart to the final response with its source data",
        ],
        "COMPLEX": [
            "Retrieve all relevant data series for the analysis",
            "Cross-check the series against operating data and events",
            "Derive the required statistics and trends",
            "Build the visualization with multiple series and annotations",
            "Review the chart for data gaps and anomalies",
            "Attach the chart and supporting data files",
            "Finalize the response with the chart and an evidence trail",
        ],
    },
    "hr_inquiry": {
        "SIMPLE": [
            "Retrieve the relevant HR policy or record",
            "Extract the requested policy detail",
            "Prepare the final response with the policy source",
        ],
        "MEDIUM": [
            "Retrieve the relevant HR policies and employee records",
            "Extract the requested details from the sources",
            "Cross-check eligibility against the policy",
            "Summarize the findings for the user",
            "Prepare the final grounded response with sources",
        ],
        "COMPLEX": [
            "Retrieve HR policies, employee records and related workflows",
            "Extract the relevant details and statuses",
            "Cross-check eligibility and compliance across policies",
            "Assess exceptions, escalations or approvals required",
            "Summarize the multi-part answer with citations",
            "Highlight any policy conflicts found",
            "Finalize the response with a full evidence trail",
        ],
    },
    "coding_task": {
        "SIMPLE": [
            "Understand the requested code change",
            "Search existing code conventions and helpers",
            "Produce the final code snippet with a short explanation",
        ],
        "MEDIUM": [
            "Parse the requested coding task and constraints",
            "Search existing code, helpers and conventions",
            "Draft the implementation covering the core logic",
            "Review for edge cases and style consistency",
            "Deliver the final code with a brief explanation",
        ],
        "COMPLEX": [
            "Break down the coding task into modules and interfaces",
            "Search existing code, schemas and helper libraries",
            "Draft the implementation module by module",
            "Check edge cases, error handling and security",
            "Validate against existing conventions and tests",
            "Refactor for clarity and performance",
            "Deliver the final code with an explanation and files",
        ],
    },
    "company_inquiry": {
        "SIMPLE": [
            "Identify the company / assistant profile being asked about",
            "Answer with the concise MRPL company profile",
            "Offer the follow-up areas the assistant can cover",
        ],
        "MEDIUM": [
            "Identify the company / assistant profile being asked about",
            "Compose the concise MRPL company profile from the knowledge base",
            "Ground the answer in MRPL context only",
            "Prepare the final response",
        ],
        "COMPLEX": [
            "Identify the company / assistant profile being asked about",
            "Compose the concise MRPL company profile from the knowledge base",
            "Ground the answer in MRPL context only",
            "Prepare the final response",
        ],
    },
    "irrelevant": {
        "SIMPLE": [
            "Classify the query as unrelated to MRPL scope",
            "State the out-of-scope response clearly",
            "Finish with the list of supported areas",
        ],
        "MEDIUM": [
            "Classify the query as unrelated to MRPL scope",
            "State the out-of-scope response clearly",
            "Finish with the list of supported areas",
        ],
        "COMPLEX": [
            "Classify the query as unrelated to MRPL scope",
            "State the out-of-scope response clearly",
            "Finish with the list of supported areas",
        ],
    },
}

def heuristic_complexity(query: str) -> str:
    q = query.lower()
    complex_hints = [
        " vs ", "compare", "comparison", "difference", "history", "trend",
        "matrix", "comprehensive", "analy", "analysis", "risk", "schedule",
        "plan for", "multiple", "summary", "report", "across", "all",
    ]
    simple_hints = ["what is", "who", "when", "where", "how much", "define", "status of"]
    score = sum(1 for h in complex_hints if h in q)
    if score >= 2 or len(q) > 90:
        return "COMPLEX"
    if len(q) <= 45 or any(q.startswith(h) for h in simple_hints):
        return "SIMPLE"
    return "MEDIUM"

HEURISTIC_STEPS = {
    "engineering_inquiry": ["Retrieve the most relevant MRPL documents", "Cross-check the values against operating limits", "Prepare the final grounded response with the verified value"],
    "report_generation": ["Retrieve the report template and scope", "Gather the relevant data across sources", "Draft and finalize the report with references"],
    "graph_generation": ["Retrieve the relevant data series", "Aggregate the series over the requested window", "Render the final chart and attach source data"],
    "hr_inquiry": ["Retrieve the relevant HR policy", "Extract the requested detail", "Prepare the final grounded response with the policy source"],
    "coding_task": ["Understand the requested task", "Search existing code conventions", "Produce the final code with an explanation"],
}

def _expand_complex_plan(query: str, intent: str, steps: list) -> list:
    """Guarantee genuinely long, query-specific plans for COMPLEX queries.

    The model sometimes answers a multi-part query with a short, generic plan
    (e.g. 7 generic report steps). This expander decomposes the user's query
    into additional concrete sub-task steps (per-metric comparison, history
    extraction, limit checks, risk + recommendations, charts, report) so the
    delivered plan is long and reflects the real work requested.
    """
    if intent not in ("engineering_inquiry", "report_generation", "graph_generation"):
        return steps
    steps = list(steps)
    if len(steps) >= PLAN_MIN_COMPLEX:
        return steps
    q = (query or "").lower()
    m = re.search(r"\b((?:P|EP|CX)-\d{2,3}[A-Z]?|CDU-\d)\b", query or "", re.IGNORECASE)
    entity = m.group(1).upper() if m else "the asset"
    years = [int(y) for y in ("2026", "2025", "2024") if y in q]
    metrics = []
    for kw, name in (
        ("pressure", "discharge pressure"),
        ("corrosion", "corrosion / wall thickness"),
        ("vibration", "bearing vibration"),
        ("temperatur", "seal temperature"),
    ):
        if kw in q:
            metrics.append(name)
    add: list = []
    if years:
        add.append(f"Pull the inspection records for {entity} covering {', '.join(str(y) for y in years)}")
        for y in sorted(years):
            add.append(f"Extract the {y} measured values for pressure, corrosion, vibration and seal temperature")
        add.append("Tabulate the extracted series so each metric is comparable year-over-year")
    for name in metrics:
        add.append(f"Compare {name} across the retrieved years and compute the absolute and % change")
    if any(w in q for w in ("limit", "exceed", "threshold", "sop", "compare", "risk")):
        add.append("Check each metric against the published operating limits in the pump condition monitoring SOP")
        add.append("Flag the parameters that exceed their review or immediate limits and quote the source thresholds")
    if any(w in q for w in ("risk", "assess", "integrity", "health")):
        add.append("Assess the overall integrity risk from the number and severity of exceeded limits")
        add.append("Propose prioritized recommendations for each exceeded or watch-listed parameter")
    if any(w in q for w in ("chart", "graph", "trend", "plot", "dashboard")):
        add.append("Prepare trend charts for each measured parameter with the published limit line")
    if intent == "report_generation" or any(w in q for w in ("report", "document", "docx", "excel", "ppt", "presentation")):
        add.append("Structure the full analysis into sections: context, comparison table, charts, limit analysis, risk assessment")
        add.append("Generate the formatted report artifact in the requested format")
    add.append("Finalize the grounded response with the complete analysis, charts, tables and evidence trail")

    merged: list = []
    for s in list(steps) + add:
        if s not in merged:
            merged.append(s)
    return merged[:PLAN_MAX]


def build_plan(intent: str, complexity: str, custom_steps=None) -> list:
    """Assemble the execution plan.

    The model-provided steps are kept in FULL so a multi-part query gets a
    genuinely long plan (see :func:`classify_query` - up to ~20 steps for
    complex work), instead of being clipped to a fixed pool size.
    """
    intent = str(intent or "engineering_inquiry").strip().lower()
    complexity = str(complexity or "MEDIUM").upper()
    if complexity not in ("SIMPLE", "MEDIUM", "COMPLEX"):
        complexity = "MEDIUM"
    if intent == "greeting":
        return []
    pool = PLAN_POOLS.get(intent, PLAN_POOLS["engineering_inquiry"]).get(complexity)
    if pool is None:
        pool = PLAN_POOLS.get(intent, PLAN_POOLS["engineering_inquiry"])["MEDIUM"]
    steps = [s.strip() for s in (custom_steps or []) if isinstance(s, str) and s.strip()]
    has_final = any(("response" in s.lower()) or ("answer" in s.lower()) or ("final" in s.lower()) for s in steps)
    if len(steps) >= PLAN_MIN and has_final:
        deduped = []
        for s in steps:
            if deduped and s.lower() == deduped[-1].lower():
                continue
            deduped.append(s)
        steps = deduped[:PLAN_MAX]
        if not any(("response" in s.lower()) or ("answer" in s.lower()) or ("final" in s.lower()) for s in steps):
            steps[-1] = pool[-1]
        return steps
    # No usable model plan -> fall back to the untruncated pool for that intent.
    steps = list(pool)
    if not any(("response" in s.lower()) or ("answer" in s.lower()) or ("final" in s.lower()) for s in steps):
        steps[-1] = pool[-1]
    return steps

def classify_query(query: str, role: str) -> dict:
    if fast_greeting_check(query):
        return {
            "intent": "greeting",
            "complexity": "simple",
            "steps": [],
            "proc_lines": ["Identifying greeting..."]
        }

    # Deterministic pre-classification gate (company identity & out-of-scope).
    route = fast_route(query, role)
    if route == "out_of_scope":
        return {
            "intent": "irrelevant",
            "complexity": "SIMPLE",
            "steps": build_plan("irrelevant", "SIMPLE"),
            "proc_lines": [
                "Classified the query as unrelated to MRPL scope",
                "Intent identified: Out of Scope",
            ],
        }
    if route == "company_inquiry":
        return {
            "intent": "company_inquiry",
            "complexity": "SIMPLE",
            "steps": build_plan("company_inquiry", "SIMPLE"),
            "proc_lines": [
                "Classified the query as a company / assistant profile question",
                "Intent identified: Company Inquiry",
            ],
        }

    # Deterministic metadata questions ("what type of pump is P-103?") NEVER go
    # through measurements/trends - they are answered straight from the asset
    # register with entity facts, no tables or charts.
    _meta_entities = detect_entities(query)
    if _meta_entities and meta_query(query):
        _me = _meta_entities[0]
        return {
            "intent": "engineering_inquiry",
            "entity": _me,
            "complexity": "SIMPLE",
            "meta": True,
            "steps": build_plan("engineering_inquiry", "SIMPLE"),
            "proc_lines": [
                "Identified a descriptive asset question",
                f"Entity identified: {_me}",
                "Answering from the equipment register (no measurement tables)",
            ],
        }

    # Deterministic fast path for direct single-asset parameter questions:
    # no LLM round-trip needed to know this is a simple engineering lookup.
    _qc = (query or "").strip().lower()
    if heuristic_complexity(query) == "SIMPLE" and detect_entities(query) and not asks_abnormality(query) and any(
            k in _qc for k in ("pressure", "vibration", "corrosion", "temperature",
                               "seal", "reading", "status of", "spec", "capacity",
                               "flow", "what is p-", "design", "current")):
        _ent = detect_entities(query)
        return {
            "intent": "engineering_inquiry",
            "entity": _ent[0],
            "complexity": "SIMPLE",
            "steps": build_plan("engineering_inquiry", "SIMPLE"),
            "proc_lines": [
                "Identified a direct asset parameter question",
                f"Entity identified: {_ent[0]}",
                "Complexity detected: SIMPLE",
            ],
        }

    prompt = f"""
    Analyze the user query: "{query}"
    The user's role is: {role}.
    
    Determine the query's intent from these options:
    - "engineering_inquiry" (Asset / Equipment Information)
    - "hr_inquiry" (HR policies, employees)
    - "coding_task"
    - "graph_generation"
    - "report_generation"
    - "greeting"
    - "irrelevant"
    
    Extract the main entity (e.g. "P-102"). If none, use null.
    Determine the complexity based on the query workload:
    - "SIMPLE" -> short factual lookup of a single value (use 2-4 steps)
    - "MEDIUM" -> needs several facts or light analysis (use 5-9 steps)
    - "COMPLEX" -> multi-step analysis, comparisons, calculations, history, risk assessment, broad synthesis (use 10-20 steps)

    Generate one step per distinct sub-task the query asks for. Complex queries
    that request multiple metrics, comparison across years, operating-limit
    checks and a risk assessment need a LONG plan - give every requested
    sub-task its own step (e.g. separate steps for pressure, corrosion,
    vibration and seal-temperature comparison). Steps must be specific to this
    query and reflect real work: retrieval, extraction, verification,
    comparison, correlation, analysis, and a FINAL step that prepares the
    grounded response. DO NOT use a generic plan.
    
    Return ONLY a JSON object with:
    "intent": string,
    "entity": string,
    "complexity": string,
    "steps": list of strings,
    "proc_lines": list of strings (e.g. ["Understanding query...", "Intent identified: Asset Information", "Entity identified: {{entity}}", "Complexity detected: {{complexity}}"])
    """
    try:
        response = generate_response(prompt, system_instruction="You are a strict JSON-only classifier.", task="routing")
        if "```json" in response:
            response = response.split("```json")[1].split("```")[0]
        data = json.loads(response)
        intent = str(data.get("intent", "engineering_inquiry")).strip().lower()
        complexity = str(data.get("complexity", "MEDIUM")).strip().upper()
        if route == "flagged_hr":
            intent = "hr_inquiry"
        complexity = normalized_complexity(query, complexity)
        if complexity not in ("SIMPLE", "MEDIUM", "COMPLEX"):
            complexity = "MEDIUM"
        proc_lines = data.get("proc_lines") if isinstance(data.get("proc_lines"), list) else [
            "Understanding query...",
            f"Intent identified: {intent.replace('_', ' ').title()}",
            f"Entity identified: {data.get('entity') or 'general'}",
            f"Complexity detected: {complexity}",
        ]
        data["intent"] = intent
        data["complexity"] = complexity
        data["entity"] = data.get("entity") or None
        data["proc_lines"] = proc_lines
        data["steps"] = build_plan(intent, complexity, data.get("steps"))
        if complexity == "COMPLEX":
            data["steps"] = _expand_complex_plan(query, intent, data["steps"])
        return data
    except Exception as e:
        q = query.lower()
        intent = None
        route = fast_route(query, role)
        if route == "out_of_scope":
            intent = "irrelevant"
        elif route == "company_inquiry":
            intent = "company_inquiry"
        if intent is None:
            if any(k in q for k in ("leave", "employee", "hr", "policy", "hiring", "attendance")):
                intent = "hr_inquiry"
            elif any(k in q for k in ("code", "coding", "script", "function", "bug", "api")):
                intent = "coding_task"
            elif any(k in q for k in ("graph", "chart", "plot", "trend", "dashboard")):
                intent = "graph_generation"
            elif any(k in q for k in ("report", "document", "excel", "ppt", "presentation")):
                intent = "report_generation"
            else:
                intent = "engineering_inquiry"
        if route == "flagged_hr":
            intent = "hr_inquiry"
        complexity = heuristic_complexity(q)
        steps = build_plan(intent, complexity, HEURISTIC_STEPS.get(intent, []))
        if complexity == "COMPLEX":
            steps = _expand_complex_plan(query, intent, steps)
        return {
            "intent": intent,
            "entity": None,
            "complexity": complexity,
            "steps": steps,
            "proc_lines": [
                "Processing...",
                f"Intent identified: {intent.replace('_', ' ').title()}",
                f"Complexity detected: {complexity}",
            ],
        }

def _build_generation_prompt(query: str, intent: str, role: str, retrieved_context: str,
                             entity: str | None, comp: str, analysis_summary: str = "",
                             project_context: str = "", entities=None, depth: str | None = None) -> str:
    """Prompt used to produce the grounded chat answer.

    Response depth is derived from the query complexity so a simple factual
    question gets a compact answer while analytical queries get the full
    structured output. When the deterministic analysis has already run, its
    exact figures are injected as the AUTHORITATIVE numbers so the narrative
    can never contradict them.
    """
    labels = []
    for e in [e for e in (entities or []) if e]:
        if str(e).upper() not in [str(x).upper() for x in labels]:
            labels.append(e)
    entity_label = ", ".join(labels) if labels else (entity or "general")

    base = (
        f"USER QUERY:\n{query}\n\n"
        f"QUERY UNDERSTANDING:\nIntent: {intent}\nDomain: {role}\n"
        f"Entities: {entity_label}\nComplexity: {comp}\n\n"
        f"VERIFIED EVIDENCE (RETRIEVED DOCUMENTS):\n{retrieved_context}\n\n"
        "INSTRUCTION:\n"
        "Answer the user's question using ONLY the verified evidence above. Do not invent "
        "figures, thresholds or limits that are not present in the evidence; if a value is "
        "unavailable, say it is unavailable. Reference the exact source document names you "
        "used. Always operate for the company MRPL - introduce 'MRPL' naturally in the "
        "response (for example when naming the company the asset belongs to). NEVER say "
        "MRPL; always say MRPL. NEVER end with a hardcoded 'Evidence Used: 0' count."
    )
    if project_context:
        base += (
            "\n\nPROJECT SCOPE (authoritative - the active project chat workspace).\n"
            f"{project_context}\n"
            "Answer ONLY from knowledge that belongs to this project. If the question "
            "asks for something unrelated to this project, say the answer is outside "
            "this project's scope rather than borrowing information from other projects."
        )
    if analysis_summary:
        base += (
            "\n\nCOMPUTED ANALYSIS (authoritative - extracted deterministically from the "
            "retrieved documents). Use THESE exact figures, limits, statuses and risk level "
            "in your narrative, comparison table, charts description and risk assessment. "
            "Do not introduce different numbers, even if other retrieved snippets look similar:\n"
            f"{analysis_summary}\n"
        )

    depth = depth or depth_for(str(comp or "MEDIUM").upper(), intent)
    if depth == "compact" and len(retrieved_context or "") > 4000:
        retrieved_context = "…(earlier source excerpts omitted)…\n" + retrieved_context[-4000:]
    if depth == "full":
        base += (
            "\n\nRESPONSE STRUCTURE (follow these sections in order; keep all of them, do not drop any):\n"
            "1. Query Understanding\n"
            "2. Asset & Context Overview\n"
            "3. Retrieved Sources (list the exact MRPL document names you used)\n"
            "4. Historical Data / Comparison (per metric: 2024, 2025 and 2026 values with units, "
            "absolute change and percentage change)\n"
            "5. Analytical Results / Findings\n"
            "6. Graphs & Trend Analysis (describe each metric's trend and what it implies)\n"
            "7. Operating Limit Analysis (compare each reading against the published SOP thresholds)\n"
            "8. Risk Assessment (state an overall risk level HIGH / MEDIUM / LOW and justify it)\n"
            "9. Evidence Details (for every finding, name the source document)\n"
            "10. Engineering Interpretation\n"
            "11. Recommendations\n"
            "12. Action Plan\n"
            "13. Generated Documents (reference the documents produced by the system)\n"
            "14. Sources\n\n"
            "Use concise markdown. Present the inspection history as a markdown table with columns "
            "Parameter | 2024 | 2025 | 2026 | Absolute Change | % Change | Limit | Status. "
            "Give actual numbers from the evidence, not placeholders."
        )
    elif depth == "standard":
        base += (
            "\n\nRESPONSE STRUCTURE (medium depth - keep these sections, keep it tight):\n"
            "1. Direct Answer (the key figures first)\n"
            "2. Relevant Data (table of values/metrics where available)\n"
            "3. Operating Limit Check (compare against the published thresholds)\n"
            "4. Findings / Notes\n"
            "5. Recommendations & Sources\n\n"
            "Use concise markdown. Give actual numbers from the evidence, not placeholders."
        )
    else:
        base += (
            "\n\nEMPLOY A COMPACT ANSWER: give a short, direct answer (a few sentences, or a "
            "brief table if it genuinely helps). Do NOT use long section headings, do NOT pad "
            "with generic subsections, and do not mention every retrieved document unless it "
            "directly supports the answer."
        )
    base += (
        "\n\nProvide the complete, detailed answer in the chat - do NOT summarize away the "
        "analysis and do NOT redirect the user to a generated document instead of answering."
    )
    return base


def _collect_doc_texts(docs) -> list[dict]:
    """Flatten retrieved chunks into [{name, page, text}] for rule-based analysis."""
    texts = []
    for d in docs:
        payload = d.payload if hasattr(d, "payload") else {}
        texts.append({
            "name": str(payload.get("document_name", "") or ""),
            "page": payload.get("page"),
            "text": str(payload.get("text", payload.get("content", "")) or ""),
        })
    return texts


async def execute_chat(query: str, role: str, doc_failure_test: bool = False,
                       conversation_id: str = "", project: dict | None = None):
    print(f"\n--- New Chat Request ---")
    print(f"Role: {role}, Query: {query}, Conversation: {conversation_id}")

    query_id = secrets.token_hex(8)
    print(f"Query ID: {query_id}")
    
    yield f"data: {json.dumps({'type': 'status', 'message': '⟳ Processing your query...', 'query_id': query_id})}\n\n"
    await asyncio.sleep(0.6)
    
    yield f"data: {json.dumps({'type': 'status', 'message': '⟳ Understanding the query...'})}\n\n"
    
    loop = asyncio.get_event_loop()
    plan_data = await loop.run_in_executor(None, classify_query, query, role)
    comp = str(plan_data.get('complexity', 'MEDIUM')).upper()

    for line in plan_data.get("proc_lines", []):
        if not str(line).startswith("✓") and not str(line).startswith("⟳") and not str(line).startswith("○") and not str(line).startswith("✗"):
            line = "✓ " + str(line)
        yield f"data: {json.dumps({'type': 'status', 'message': line})}\n\n"
        await asyncio.sleep(_pause(0.4, comp))
        
    yield f"data: {json.dumps({'type': 'status', 'message': '⟳ Creating a plan for this query...'})}\n\n"
    await asyncio.sleep(_pause(0.8, comp))
    
    intent = plan_data.get("intent", "engineering_inquiry")
    comp = str(plan_data.get('complexity', 'MEDIUM')).upper()
    plan_data["complexity"] = comp
    plan_data["intent"] = intent
    plan_data["steps"] = build_plan(intent, comp, plan_data.get("steps"))
    depth = depth_for(comp, intent)

    # Hard routing guard: an MRPL company question (no asset tag, no measurement
    # vocabulary) is ALWAYS a company profile answer - even if the classifier
    # mislabelled it as engineering.
    _ql = (query or "").lower()
    if not detect_entities(query) and "mrpl" in _ql and not any(
            m in _ql for m in ("pressure", "vibration", "corrosion", "temperature",
                               "reading", "trend", "history", "status", "limit")):
        intent = "company_inquiry"
        plan_data["intent"] = intent
        plan_data["steps"] = build_plan(intent, comp, [])
        plan_data["proc_lines"] = [
            "Classified the query as a company / assistant profile question",
            "Intent identified: Company Inquiry",
        ]
        depth = "compact"

    # Early routing exits: out-of-scope and company-identity questions never
    # touch retrieval, analytics or document generation.
    if intent in ("irrelevant", "company_inquiry"):
        if intent == "irrelevant":
            yield f"data: {json.dumps({'type': 'status', 'message': '⟳ Query out of scope...'})}\n\n"
            final_answer = OUT_OF_SCOPE_ANSWER
            sources, findings, charts, files = [], [], [], []
            plan_steps = plan_data.get("steps", [])
            proc_lines = plan_data.get("proc_lines", [])
            yield f"data: {json.dumps({'type': 'result', **_ai_meta(), 'answer': final_answer, 'sources': sources, 'findings': findings, 'charts': charts, 'files': files, 'steps': plan_steps, 'proc_lines': proc_lines, 'plan': plan_data, 'intent': intent, 'complexity': comp, 'entity': None, 'analysis': None, 'approval': None, 'artifact': None, 'created_docs': [], 'doc_tasks': [], 'query_id': query_id, 'actions': [], 'action': None, 'coding': None})}\n\n"
            return
        yield f"data: {json.dumps({'type': 'status', 'message': '⟳ Answering the company/assistant profile question...'})}\n\n"
        final_answer = COMPANY_ANSWER
        plan_steps = plan_data.get("steps", [])
        proc_lines = plan_data.get("proc_lines", [])
        yield f"data: {json.dumps({'type': 'result', **_ai_meta(), 'answer': final_answer, 'sources': [], 'findings': [], 'charts': [], 'files': [], 'steps': plan_steps, 'proc_lines': proc_lines, 'plan': plan_data, 'intent': intent, 'complexity': comp, 'entity': None, 'analysis': None, 'approval': None, 'artifact': None, 'created_docs': [], 'doc_tasks': [], 'query_id': query_id, 'actions': [], 'action': None, 'coding': None})}\n\n"
        return

    yield f"data: {json.dumps({'type': 'plan', 'data': plan_data})}\n\n"
    await asyncio.sleep(_pause(1.5, comp))
    
    # Pre-checks
    if intent == "greeting":
        yield f"data: {json.dumps({'type': 'status', 'message': '⟳ Generating greeting...'})}\n\n"
        await asyncio.sleep(0.1)
        final_answer = "Hello! I am MRPL KNOVIA AI. How can I assist you with your project today?"
        yield f"data: {json.dumps({'type': 'result', **_ai_meta(), 'answer': final_answer, 'sources': [], 'findings': []})}\n\n"
        return

    # Pure coding shortcut: "write a python code to count 1..100" and friends do
    # not need retrieval/analysis/document generation - only the code project.
    from .coding_engine import detect_asset_reference, detect_code_request, run_code_phase
    coding_request = detect_code_request(query, intent)
    pure_coding = bool(coding_request) and detect_asset_reference(query) is None
    if pure_coding:
        yield f"data: {json.dumps({'type': 'status', 'message': '✓ Coding request detected - analysis & document steps skipped'})}\n\n"
        await asyncio.sleep(0.4)

    # Authorized Query -> Retrieval
    sources = []
    findings = []
    retrieved_context = ""
    docs = []

    # Resolve the entities EARLY so the deterministic entity-document lookup can
    # guarantee the right source documents (inspection reports, SOPs, equipment
    # record) are retrieved regardless of pure vector ranking. Multi-asset
    # queries ("P-102 and P-103") are fully supported.
    entities = detect_entities(query)
    entity = plan_data.get("entity")
    # Only genuine asset tags are valid entity values - the LLM occasionally
    # emits "MRPL" or other prose as the entity, which would poison the analysis.
    if entity and not re.match(r"^(P|EP|CX|PSV|CDU)-\d", str(entity).upper().replace(" ", "")):
        entity = None
    entity = (str(entity).upper().replace(" ", "") if entity else None)
    if entity and entity not in entities:
        entities = [entity] + list(entities)
    elif not entity and entities:
        entity = entities[0]
    if not entities and entity:
        entities = [entity]
    if not pure_coding and not entities:
        entities = []

    if not pure_coding:
        try:
            vector = None
            docs = []
            try:
                from .ai_provider import embeddings_available
                _emb_ok = embeddings_available()
            except Exception:
                _emb_ok = True
            if _emb_ok:
                allowed_roles = ["ADMIN"]
                if role == "ENGINEER": allowed_roles.append("ENGINEER")
                if role == "HR": allowed_roles.append("HR")
                limit = 8 if comp == "COMPLEX" else (5 if comp == "MEDIUM" else 3)
                try:
                    vector = get_embedding(query)
                    docs = search_documents(vector, allowed_roles=allowed_roles, limit=limit, query_text=query)
                except Exception as ve:
                    print(f"Vector retrieval unavailable ({ve}); falling back to lexical.")
                    vector = None
                    docs = []
            else:
                allowed_roles = ["ADMIN"]
                if role == "ENGINEER": allowed_roles.append("ENGINEER")
                if role == "HR": allowed_roles.append("HR")
                limit = 8 if comp == "COMPLEX" else (5 if comp == "MEDIUM" else 3)
                print("Embeddings unavailable for the active provider; using lexical retrieval.")
            if len(docs) > 0:
                print(f"Qdrant returned {len(docs)} docs (vector retrieval).")
            else:
                print("Qdrant returned 0 docs, triggering Lexical Fallback...")
                try:
                    from .lexical_fallback import lexical_search
                    docs = lexical_search(query, limit=limit)
                    if docs:
                        print(f"Lexical fallback returned {len(docs)} docs")
                except Exception as le:
                    print(f"Lexical fallback failed: {le}")

            # Merge the deterministic entity-document lookup ahead of the vector
            # hits so inspection/SOP/equipment chunks always appear in context.
            entity_docs = []
            for e in list(entities) or [entity]:
                if e:
                    entity_docs = list(entity_docs) + list(
                        find_entity_documents(e, allowed_roles=allowed_roles, limit=12))
            merged_docs = []
            seen_keys = set()
            for d in list(entity_docs) + list(docs):
                d_name = d.payload.get("document_name", "Unknown Source")
                page = d.payload.get("page")
                key = f"{d_name}|{page}" if page is not None else d_name
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                merged_docs.append(d)
                if len(merged_docs) >= 18:
                    break
            if merged_docs:
                docs = merged_docs
                print(f"Merged retrieval: {len(docs)} chunks ({len(entity_docs)} entity-doc chunks).")

            # Completeness boost: comparison / history queries explicitly fetch
            # each inspection year so all three years reach the analysis stage.
            if not project and vector and comp in ("MEDIUM", "COMPLEX") and history_query(query):
                try:
                    for extra_q in per_year_boost_queries(list(entities) or [entity], query):
                        try:
                            boost = search_documents(get_embedding(extra_q),
                                                     allowed_roles=allowed_roles,
                                                     limit=4, query_text=extra_q)
                        except Exception:
                            boost = []
                        for d in boost:
                            d_name = d.payload.get("document_name", "Unknown Source")
                            page = d.payload.get("page")
                            key = f"{d_name}|{page}" if page is not None else d_name
                            if key in seen_keys:
                                continue
                            seen_keys.add(key)
                            docs.append(d)
                    print(f"History-boosted retrieval: context now has {len(docs)} chunks.")
                except Exception as e:
                    print(f"History-boost retrieval failed: {e}")

            # Limits boost: thresholds/SOP and the asset operating envelope must be
            # present whenever limits/status/inspection are in question, so the
            # analysis can compute real CRITICAL bands instead of "all OK".
            if not project and vector and (asks_abnormality(query) or comp in ("MEDIUM", "COMPLEX")):
                try:
                    for extra_q in limit_boost_queries(list(entities) or [entity]):
                        try:
                            boost = search_documents(get_embedding(extra_q),
                                                     allowed_roles=allowed_roles,
                                                     limit=6, query_text=extra_q)
                        except Exception:
                            boost = []
                        for d in boost:
                            d_name = d.payload.get("document_name", "Unknown Source")
                            page = d.payload.get("page")
                            key = f"{d_name}|{page}" if page is not None else d_name
                            if key in seen_keys:
                                continue
                            seen_keys.add(key)
                            docs.append(d)
                    print(f"Limits-boosted retrieval: context now has {len(docs)} chunks.")
                except Exception as e:
                    print(f"Limits-boost retrieval failed: {e}")

            # Project-scoped retrieval: when the chat lives in a project workspace,
            # restrict every retrieved chunk to that project's knowledge base so
            # answers never mix content from other projects.
            if project:
                try:
                    anchors = project_keywords(project)
                    keep = lambda d: any(
                        a in str(d.payload.get("document_name", "") + " " + str(d.payload.get("path", ""))).lower()
                        for a in anchors
                    )
                    scoped = [d for d in docs if keep(d)]
                    proj_docs = search_project_documents(vector, allowed_roles, project, limit=limit) if vector else []
                    merged = []
                    seen2 = set()
                    for d in list(proj_docs) + list(scoped):
                        dn = d.payload.get("document_name", "Unknown Source")
                        pg = d.payload.get("page")
                        key = f"{dn}|{pg}" if pg is not None else dn
                        if key in seen2:
                            continue
                        seen2.add(key)
                        merged.append(d)
                        if len(merged) >= 18:
                            break
                    if merged:
                        docs = merged
                        print(f"Project-scoped retrieval: {len(docs)} chunks for "
                              f"{project.get('project_id') or project.get('name')} ({len(anchors)} anchors).")
                except Exception as e:
                    print(f"Project-scoped retrieval error: {e}")
        except Exception as e:
            print(f"Retrieval error: {e}")
            import traceback
            traceback.print_exc()
        
    final_answer = "No response generated."

    # Authoritative project scope injected into the answer prompt so the reply is
    # framed inside the active project workspace (and only its knowledge base).
    project_context_text = ""
    if project:
        _ctx_parts = []
        for k, label in (("name", "Project"), ("project_id", "Project ID"),
                         ("unit", "Unit"), ("asset", "Asset"),
                         ("description", "Description")):
            v = project.get(k)
            if v:
                _ctx_parts.append(f"{label}: {v}")
        _contribs = project.get("contributors")
        if _contribs:
            _ctx_parts.append(f"Contributors: {', '.join(str(c) for c in _contribs)}")
        project_context_text = "\n".join(_ctx_parts)

    # Deterministic analysis runs BEFORE the narrative is generated so the LLM
    # can be handed the authoritative extracted figures, charts and risk level.
    analysis_payload = None
    charts = []
    findings = []

    def _run_analysis():
        nonlocal analysis_payload, charts, findings
        # Descriptive asset questions are answered from the equipment register;
        # measurement extraction/tables/charts would only introduce noise.
        if plan_data.get("meta"):
            return
        if analysis_payload is not None or pure_coding:
            return
        try:
            from .analysis import analyze_query
            queries = [{"snippet": s.get("snippet", "")} for s in sources]
            doc_texts = _collect_doc_texts(docs)
            result = analyze_query(query, intent, queries, docs=doc_texts, entities=entities)
            analysis_payload = result.get("analysis")
            findings = result.get("findings", []) or []
            charts = result.get("charts", []) or []
            # Simple single-fact lookups get the figure, not the full comparison
            # table - tables/charts are reserved for status, trend and compare questions.
            if comp == "SIMPLE" and analysis_payload:
                analysis_payload["tables"] = []
        except Exception as e:
            print(f"Analysis synthesis failed: {e}")
            import traceback; traceback.print_exc()

    def _analysis_summary() -> str:
        if not analysis_payload:
            return ""
        lines: list = []
        if analysis_payload.get("risk_level"):
            lines.append(f"- Overall integrity risk: {analysis_payload.get('risk_level')} "
                         f"({analysis_payload.get('summary') or 'no summary'})")
        for c in (charts or []):
            pts = " → ".join(
                f"{d.get('label')}: {d.get('value')} {c.get('unit') or ''}".strip()
                for d in (c.get("data") or []))
            lines.append(f"- {c.get('title')} | values: {pts} | limit: "
                         f"{c.get('limit') if c.get('limit') is not None else 'n/a'} "
                         f"{c.get('unit') or ''} | status: {c.get('status')}")
        for t in (analysis_payload.get("tables") or []):
            lines.append(f"Table '{t.get('title')}':")
            lines.append("| " + " | ".join(str(h) for h in (t.get("headers") or [])) + " |")
            for r in (t.get("rows") or []):
                lines.append("| " + " | ".join(str(x) for x in r) + " |")
        return "\n".join(lines)

    context_compiled = False
    def compile_context():
        nonlocal retrieved_context, docs, sources, context_compiled
        if context_compiled: return
        # Domain-based Evidence Filtering Verification
        filtered_docs = []
        for d in docs:
            d_name = d.payload.get("document_name", "Unknown").lower()
            is_hr = "hr_" in d_name or "employee" in d_name or "policy" in d_name
            if intent == "engineering_inquiry" and is_hr:
                continue # Filter out irrelevant HR docs
            filtered_docs.append(d)
            
        docs = filtered_docs
        seen_docs = set()
        for d in docs:
            doc_name = d.payload.get("document_name", "Unknown Source")
            doc_content = d.payload.get("text", d.payload.get("content", ""))
            
            retrieved_context += f"\n\n[DOCUMENT: {doc_name}]\n{doc_content}"
            if doc_name not in seen_docs:
                seen_docs.add(doc_name)
                sources.append({
                    "id": str(getattr(d, "id", "") or ""),
                    "title": doc_name,
                    "type": d.payload.get("type", "Inspection Report" if "INS" in doc_name else "Document"),
                    "document_type": d.payload.get("type", "Document"),
                    "year": d.payload.get("year", ""),
                    "snippet": doc_content[:150] + "..." if len(doc_content) > 150 else doc_content
                })
        context_compiled = True
        _run_analysis()

    def _ensure_mrpl(text: str) -> str:
        if "MRPL" in text:
            return text
        for w in ("MRPL", "the refinery", "the plant"):
            idx = text.lower().find(w.lower())
            if idx >= 0:
                return text[:idx] + "MRPL" + text[idx + len(w):]
        return text

    def _compact_factual_answer():
        """Ground a short engineering answer directly on the deterministic
        analysis - no LLM round-trip, so simple questions return in seconds."""
        if depth != "compact" or intent != "engineering_inquiry" or not analysis_payload:
            return None
        metrics = list(analysis_payload.get("metrics") or [])
        if not metrics:
            return None
        _q = (query or "").lower()
        wanted = [w for w in ("pressure", "vibration", "corrosion", "seal", "temperature") if w in _q]
        if wanted:
            metrics = [m for m in metrics if any(w in m["name"].lower() for w in wanted)]
        if not metrics:
            # Nothing specific asked: fall back to the LLM narrative.
            return None
        metrics = metrics[:3]
        lines = []
        for m in metrics:
            st = str(m.get("status") or "good").lower()
            phrase = {
                "critical": "exceeds the applicable limit - corrective action required",
                "watch": "is above the normal operating band - review required",
                "good": "is within the normal operating band",
            }.get(st, "is recorded")
            lines.append(f"**{m['name']}**: {m['value']} {m['unit']} {phrase}.")
        ans = " ".join(lines)
        src = "; ".join(dict.fromkeys(s["title"] for s in (sources or [])))
        if src:
            ans += f" Source: {src[:200]}."
        return ans

    def _meta_factual_answer():
        """Deterministic equipment-register answer for 'what type of pump is X?'
        style questions. No measurements, no tables, no charts."""
        if not plan_data.get("meta"):
            return None
        meta_entity = entity or plan_data.get("entity")
        brief = metadata_brief(meta_entity)
        if not brief:
            return (f"I could not find a registered asset record for {meta_entity}. "
                    f"The equipment register in the MRPL knowledge base does not "
                    f"contain a record for this tag - please verify the asset ID.")
        lines = [
            f"**{meta_entity}** is a **{brief['type'] or 'registered asset'}** "
            f"({brief['service'] or 'service not stated'}) in the {brief['region'] or brief['unit'] or 'plant'}.",
            f"- Unit: {brief['unit'] or 'n/a'}",
            f"- Service: {brief['service'] or 'n/a'}",
            f"- Criticality: {brief['criticality'] or 'n/a'}",
        ]
        if brief.get("envelope"):
            lines.append(f"- Operating envelope: {brief['envelope']}")
        lines.append("Source: MRPL equipment register / asset master data.")
        return "\n".join(lines)

    def _meta_findings():
        if not plan_data.get("meta"):
            return []
        meta_entity = entity or plan_data.get("entity")
        brief = metadata_brief(meta_entity)
        if not brief:
            return [{"label": f"{meta_entity} record", "value": "No registered equipment record found in the MRPL asset master.",
                     "status": "good"}]
        return [
            {"label": f"{meta_entity} pump type", "value": brief.get("type") or "—", "status": "good"},
            {"label": f"{meta_entity} service", "value": brief.get("service") or "—", "status": "good"},
            {"label": f"{meta_entity} unit", "value": brief.get("unit") or "—", "status": "good"},
            {"label": f"{meta_entity} criticality", "value": brief.get("criticality") or "—",
             "status": "good" if str(brief.get("criticality") or "LOW").upper() != "HIGH" else "warning"},
        ]
        
    # Actually execute steps iteratively
    generated = False
    for i, step in enumerate(plan_data.get("steps", [])):
        yield f"data: {json.dumps({'type': 'step_start', 'step_index': i})}\n\n"
        await asyncio.sleep(_pause(0.6, comp))
        
        step_lower = step.lower()
        if any(k in step_lower for k in ("retrieve", "search", "fetch", "collect", "gather")):
            await asyncio.sleep(_pause(0.6, comp))
        elif any(k in step_lower for k in ("verify", "cross-check", "crosscheck", "extract", "compare", "validate", "confirm", "review")):
            if not pure_coding:
                compile_context()
            await asyncio.sleep(_pause(0.6, comp))
        elif any(k in step_lower for k in ("generate", "response", "prepare", "answer", "synthesize", "finalize")):
            if not generated:
                generated = True
                if pure_coding:
                    yield f"data: {json.dumps({'type': 'status', 'message': '✓ Preparing generated code...'})}\n\n"
                    await asyncio.sleep(0.5)
                else:
                    # THIS IS THE GENERATION STEP!
                    compile_context()
                    meta_ans = _meta_factual_answer()
                    if meta_ans:
                        final_answer = meta_ans
                        findings = _meta_findings()
                        charts = []
                        yield f"data: {json.dumps({'type': 'status', 'message': '✓ Answered from the equipment register'})}\n\n"
                        print("Used deterministic equipment-register answer (no LLM).")
                    else:
                        compact = _compact_factual_answer()
                        if compact:
                            final_answer = compact
                            yield f"data: {json.dumps({'type': 'status', 'message': '✓ Grounded compact answer generated'})}\n\n"
                            print("Used deterministic compact answer (no LLM).")
                        else:
                            yield f"data: {json.dumps({'type': 'status', 'message': '⟳ Generating grounded response...'})}\n\n"

                            print("Calling Reasoning Model for final response...")
                            prompt_payload = _build_generation_prompt(query, intent, role, retrieved_context, entity, comp,
                                                                      analysis_summary=_analysis_summary(),
                                                                      project_context=project_context_text,
                                                                      entities=entities)
                            system_instruction = "You are MRPL's KNOVIA AI. NEVER say MRPL, replace it with MRPL."

                            try:
                                loop = asyncio.get_event_loop()
                                final_answer = await loop.run_in_executor(None, generate_response, prompt_payload, system_instruction)
                                final_answer = _ensure_mrpl(final_answer.replace("MRPL", "MRPL"))
                                yield f"data: {json.dumps({'type': 'status', 'message': '✓ Response generated'})}\n\n"
                            except Exception as e:
                                print(f"Error generating response: {e}")
                                final_answer = f"An error occurred while generating the response from the LLM: {str(e)}"
                                yield f"data: {json.dumps({'type': 'status', 'message': '✗ LLM response generation failed'})}\n\n"
            else:
                await asyncio.sleep(_pause(0.4, comp))
        else:
            await asyncio.sleep(_pause(0.4, comp))
            
        yield f"data: {json.dumps({'type': 'step_complete', 'step_index': i})}\n\n"
        await asyncio.sleep(_pause(0.3, comp))
        
    print(f"Response Length: {len(final_answer)}")

    if not pure_coding and final_answer == "No response generated.":
        compile_context()
        print("Plan lacked a generation step; generating final response...")
        prompt_payload = _build_generation_prompt(query, intent, role, retrieved_context, entity, comp,
                                                  analysis_summary=_analysis_summary(),
                                                  project_context=project_context_text,
                                                  entities=entities)
        system_instruction = "You are MRPL's KNOVIA AI. NEVER say MRPL, replace it with MRPL."
        try:
            loop = asyncio.get_event_loop()
            final_answer = await loop.run_in_executor(None, generate_response, prompt_payload, system_instruction)
            final_answer = _ensure_mrpl(final_answer.replace("MRPL", "MRPL"))
        except Exception as e:
            print(f"Error generating final response: {e}")
            final_answer = f"An error occurred while generating the response from the LLM: {str(e)}"

    files = []
    doc_tasks = []
    approval_payload = None
    artifact_payload = None
    created_docs = []

    # ── Post-processing: analytics, document generation, anomaly → approval ──
    # Analysis already ran before the narrative; this is idempotent.
    _run_analysis()

    entity = plan_data.get("entity") or entity
    if not entity and not pure_coding:
        m = re.search(r"\b(P-10[2-9]|P-103|CDU-4|EP-32|CX-4)\b", query, re.IGNORECASE)
        entity = m.group(1).upper() if m else "P-102"

    # ── Document generation (reusable engine, part of the execution state) ──
    # SIMPLE queries answer fast and compact: document generation is reserved
    # for MEDIUM / COMPLEX / report work.
    if not pure_coding and comp != "SIMPLE":
        try:
            from .document_engine import run_document_phase
            doc_phase = run_document_phase(query, intent, entity, final_answer, sources,
                                           analysis_payload, findings, query_id,
                                           doc_failure_test=doc_failure_test)
            async for event in doc_phase:
                if "done" in event:
                    doc_state = event["done"]
                else:
                    yield f"data: {json.dumps(event)}\n\n"
                    await asyncio.sleep(0.12)
            files = list(doc_state["files"])
            created_docs = list(doc_state["created_docs"])
            doc_tasks = list(doc_state["doc_tasks"])
            if files and doc_state.get("chat_output"):
                # Append the generated-document brief to the full analysis instead of
                # replacing the analysis with it - the chat must show BOTH outputs.
                final_answer = f"{final_answer}\n\n---\n\n### Generated Documents\n{doc_state['chat_output'].strip()}"
            elif doc_state.get("note") and files:
                final_answer += doc_state["note"]
            if created_docs:
                artifact_payload = created_docs[0]
        except Exception as e:
            print(f"Document generation phase failed: {e}")
            import traceback
            traceback.print_exc()
            doc_tasks = [{"doc_type": "error", "title": "Document generation", "kind": "error",
                          "formats": [], "status": "FAILED",
                          "error": f"Internal phase failure: {e}"}]

    # ── Coding Agent phase (write code, archive project, ready for the UI) ──
    coding_payload = None
    try:
        if coding_request:
            yield f"data: {json.dumps({'type': 'status', 'message': '⟳ Coding Agent: creating project and writing code...'})}\n\n"
            async for ev in run_code_phase(query, intent, (None if pure_coding else entity),
                                           analysis_payload, query_id,
                                           conversation_id=f"{conversation_id}::{query_id}"):
                if "done" in ev:
                    coding_payload = ev["done"]
                else:
                    yield f"data: {json.dumps(ev)}\n\n"
                    await asyncio.sleep(0.12)
                    # Redirect the Workbench into the Coding Agent as soon as the
                    # session + project exist, while code is still being built
                    # (not at the very end of the build).
                    if ev.get("type") == "codegen" and ev.get("stage") == "start":
                        yield f"data: {json.dumps({'type': 'coding_redirect', 'coding': {
                            'session_id': ev.get('session_id'),
                            'task_id': ev.get('task_id'),
                            'project': ev.get('project'),
                            'title': ev.get('title'),
                            'mode': ev.get('mode'),
                        }})}\n\n"
            if coding_payload:
                if coding_payload.get("archive_file"):
                    files = list(files) + [coding_payload["archive_file"]]
                if coding_payload.get("artifact_ref"):
                    created_docs = list(created_docs) + [coding_payload["artifact_ref"]]
                if coding_payload.get("doc_task"):
                    doc_tasks = list(doc_tasks) + [coding_payload["doc_task"]]
                if coding_payload.get("chat_output"):
                    if pure_coding:
                        final_answer = coding_payload["chat_output"]
                    else:
                        final_answer = final_answer + "\n\n---\n\n" + coding_payload["chat_output"]
                print(f"Coding Agent: {coding_payload['result_summary']}")
    except Exception as e:
        print(f"Coding Agent phase failed: {e}")
        import traceback
        traceback.print_exc()
        coding_payload = None

    # ── Summary of every action executed for this multi-part query ──────────
    actions = []
    if analysis_payload and analysis_payload.get("anomaly_detected"):
        actions.append("Anomaly Detection")
    if charts or ((analysis_payload or {}).get("charts")):
        actions.append("Graph Analytics / Charts")
    if created_docs or doc_tasks:
        actions.append("Document / Presentation Generation")
    if coding_payload:
        actions.append("Coding Agent")

    if analysis_payload and analysis_payload.get("anomaly_detected") and asks_abnormality(query):
        try:
            from .database import SessionLocal
            from .models import Approval, Artifact, Project as ProjectRow
            session = SessionLocal()
            try:
                name = f"{entity} Abnormality Review"
                cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=2)
                cards = analysis_payload.get("anomaly_cards") or []
                readings = " | ".join(
                    f"{c.get('label')} {c.get('value')} (limit {c.get('limit', 'n/a')}) "
                    f"{c.get('status', '')}"
                    for c in cards) or "see analysis"
                severity = str(analysis_payload.get("severity") or analysis_payload.get("risk_level") or "MEDIUM")
                reason = str(analysis_payload.get("summary") or "").replace("\n", " ")
                rec_action = str(analysis_payload.get("recommendation") or "").replace("\n", " ")
                approval_comments = (
                    f"Equipment: {entity} | Parameter: {analysis_payload.get('category', 'Anomaly')} | "
                    f"Readings: {readings} | Reason: {reason[:240]} | "
                    f"Severity: {severity} | Recommended action: {rec_action[:240]}"
                )
                existing = session.query(Approval).filter(
                    Approval.artifact_name == name,
                    Approval.status == "PENDING",
                    Approval.requested_at >= cutoff).first()
                if not existing:
                    artifact = Artifact(
                        artifact_id="ART-" + secrets.token_hex(5).upper(),
                        name=name,
                        artifact_type="DOCUMENT",
                        format="DOCX",
                        file_path=None,
                        status="READY_FOR_REVIEW",
                        classification="CONFIDENTIAL",
                    )
                    session.add(artifact)
                    session.flush()
                    approval = Approval(
                        approval_id="APR-" + secrets.token_hex(5).upper(),
                        artifact_id=artifact.id,
                        artifact_uuid=artifact.artifact_id,
                        artifact_name=name,
                        artifact_type="DOCUMENT",
                        download_url=f"/api/artifacts/{artifact.artifact_id}/download",
                        requested_by=1,
                        requested_by_name="KNOVIA AI",
                        status="PENDING",
                        comments=approval_comments,
                    )
                    session.add(approval)
                    session.commit()
                    session.refresh(approval)
                else:
                    approval = existing
                approval_payload = {
                    "action": f"Operational approval required — {analysis_payload.get('category', 'Anomaly')} on {entity}",
                    "equipment": entity,
                    "parameter": analysis_payload.get("category", "Anomaly"),
                    "readings": readings,
                    "severity": severity,
                    "reason": reason[:240],
                    "recommended_action": rec_action[:240],
                    "artifact": approval.artifact_name,
                    "due": "within 14 days",
                    "approval_id": approval.approval_id,
                }
                analysis_payload["linked_approval"] = {
                    "id": approval.id,
                    "approval_id": approval.approval_id,
                    "artifact_id": approval.artifact_uuid,
                    "status": approval.status,
                    "comments": approval.comments,
                }
                risk = str(analysis_payload.get("severity") or analysis_payload.get("risk_level") or "").upper()
                actionable = risk in ("HIGH", "CRITICAL")
                proj = None
                if entity:
                    proj = session.query(ProjectRow).filter(ProjectRow.asset == entity).first()
                if entity and actionable:
                    if proj is None:
                        proj = session.query(ProjectRow).filter(
                            ProjectRow.name.like(f"{entity}%"), ProjectRow.created_at >= cutoff).first()
                    if proj is None:
                        unit_hint = "CDU-4"
                        doc_blob = " ".join(
                            str(d.payload.get("document_name", "")) for d in docs)
                        for d0 in docs:
                            doc_blob += " " + str(d0.payload.get("text", d0.payload.get("content", "")))[:1200]
                        mu = re.search(r"unit[:\s]+([A-Za-z0-9\-]{2,12})", doc_blob)
                        if mu:
                            unit_hint = mu.group(1)
                        proj = ProjectRow(
                            project_id="PRJ-" + secrets.token_hex(5).upper(),
                            owner="KNOVIA AI",
                            company_id="MRPL",
                            name=f"{entity} Repair & Engineering Review",
                            unit=unit_hint,
                            asset=entity,
                            status="IN_PROGRESS",
                            risk=risk,
                            progress=10,
                            classification="CONFIDENTIAL",
                            description=(f"AI-detected anomaly on {entity} ({risk} risk): "
                                         f"{analysis_payload.get('summary', '')[:400]}"),
                        )
                        session.add(proj)
                        session.commit()
                        session.refresh(proj)
                        print(f"Created remediation project {proj.project_id} for {entity}")
                if proj:
                    analysis_payload["linked_project"] = {
                        "id": proj.id,
                        "project_id": proj.project_id,
                        "name": proj.name,
                        "unit": proj.unit,
                        "risk": proj.risk,
                        "status": proj.status,
                    }
            finally:
                session.close()
        except Exception as e:
            print(f"Approval interlock failed: {e}")
            import traceback
            traceback.print_exc()

    # Surface the Human-Approval interlock directly in the chat answer so it is
    # visible even without the structured approval card rendering.
    if approval_payload:
        final_answer = final_answer.rstrip() + "\n\n" + (
            f"⚠ HUMAN APPROVAL REQUIRED — {approval_payload['action']}.\n"
            f"Equipment: {approval_payload['equipment']} | Parameter: {approval_payload['parameter']} | "
            f"Readings: {approval_payload['readings']} | Severity: {approval_payload['severity']} | "
            f"Recommended action: {approval_payload['recommended_action']}\n"
            f"Awaiting your review in the Approvals section ({approval_payload['approval_id']})."
        )

    # Add plan steps to the final result so the UI can render the historical execution record
    plan_steps = plan_data.get("steps", [])
    proc_lines = plan_data.get("proc_lines", [])
    yield f"data: {json.dumps({'type': 'result', **_ai_meta(), 'answer': final_answer, 'sources': sources, 'findings': findings, 'charts': charts, 'files': files, 'steps': plan_steps, 'proc_lines': proc_lines, 'plan': plan_data, 'intent': intent, 'complexity': comp, 'entity': entity, 'analysis': analysis_payload, 'approval': approval_payload, 'artifact': artifact_payload, 'created_docs': created_docs, 'doc_tasks': doc_tasks, 'query_id': query_id, 'actions': actions, 'action': ('redirect_coding' if coding_payload else None), 'coding': coding_payload})}\n\n"
