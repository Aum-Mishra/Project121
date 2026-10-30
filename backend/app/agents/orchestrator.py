from typing import Dict, Any, AsyncGenerator, List
from app.agents.state import AgentState, AgentPhase
from app.agents.planner import planner
from app.agents.executor import executor
from app.agents.verifier import verifier
from app.agents.greetings import is_greeting, fast_path_response, greet
from app.agents.intent import classify_query
from app.llm.ollama_client import ollama_client
from app.llm.router import model_router
from app.core.config import settings
from app.core.logging import get_logger
import json
import re
import uuid
from datetime import datetime
from app.db.models import AgentRun, AgentRunStatus

logger = get_logger(__name__)

# Gated debug logging: set to True while verifying the chat-document routing,
# then flip to False before the final commit.  Only non-sensitive metadata is
# logged (chat_id / document_id / scores / counts, never document text).
_CHAT_DOC_DEBUG = False


class AgentOrchestrator:
    def __init__(self, db, company_id: str, user_id: int, history: List[Dict[str, str]] = None):
        self.db = db
        self.company_id = company_id
        self.user_id = user_id
        self.history = history or []

    async def run(
        self,
        query: str,
        conversation_id: str,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        run_id = str(uuid.uuid4())

        state = AgentState(
            run_id=run_id,
            conversation_id=conversation_id,
            user_id=self.user_id,
            company_id=self.company_id,
            query=query,
        )

        context = {
            "db": self.db,
            "company_id": self.company_id,
            "user_id": self.user_id,
            "run_id": run_id,
            "conversation_id": conversation_id,
        }

        yield {"event": "run_started", "run_id": run_id, "query": query}

        fast_reply = fast_path_response(query)
        if fast_reply is None:
            fast_reply = await greet(query)
        if fast_reply is not None:
            state.final_answer = fast_reply["reply"]
            state.model_used = fast_reply["model"]
            yield {"event": "router_selected", "model": "fast-path-greeting", "reason": "Social/greeting query"}
            yield {"event": "plan_created", "steps": ["Respond conversationally"]}
            yield {"event": "run_completed", "run_id": run_id, "answer": state.final_answer, "evidence": [], "model": "fast-path-greeting", "tools_used": [], "documents_accessed": [], "analysis": {}, "artifacts": []}
            return

        # Intent-aware routing: conversational/general queries are answered
        # directly with the persona model - NO RAG, NO planner, NO evidence.
        intent = classify_query(query)
        state.context["intent"] = intent
        if intent["category"] == "conversational":
            state.final_answer = await self._conversational_reply(query)
            state.model_used = settings.primary_model
            yield {"event": "router_selected", "model": "conversational-direct", "reason": intent.get("reason")}
            yield {"event": "plan_created", "steps": ["Respond conversationally"]}
            yield {
                "event": "run_completed",
                "run_id": run_id,
                "answer": state.final_answer,
                "evidence": [],
                "model": "conversational-direct",
                "tools_used": [],
                "documents_accessed": [],
                "analysis": {},
                "artifacts": [],
            }
            return

        try:
            routing_result = await model_router.route(query)
            selected_model = routing_result.get("model", settings.primary_model)
            state.model_used = selected_model

            yield {"event": "router_selected", "model": selected_model, "reason": routing_result.get("reason")}

            prior_artifacts: List[Dict[str, Any]] = []
            try:
                runs = self.db.query(AgentRun).filter(
                    AgentRun.conversation_id == conversation_id,
                    AgentRun.status == AgentRunStatus.COMPLETED,
                ).order_by(AgentRun.started_at.desc()).all()
                for r in runs:
                    prior_artifacts.extend(r.artifacts_generated or [])
            except Exception as e:
                logger.warning("prior_artifacts_failed", error=str(e))
            state.context["artifacts"] = prior_artifacts

            plan = await planner.create_plan(state)
            yield {"event": "plan_created", "steps": [s.label for s in plan.steps]}
            yield {"event": "retrieval_started"}

            tool_events: List[Dict[str, Any]] = []

            async def _emit_tool_event(e: Dict[str, Any]) -> None:
                tool_events.append(e)

            await executor.execute_plan(state, context, on_event=_emit_tool_event)

            for te in tool_events:
                yield te

            yield {"event": "retrieval_completed"}

            if state.phase == AgentPhase.FAILED:
                yield {"event": "run_failed", "error": state.error or "Execution failed",
                       "steps_status": [
                           {"label": s.label, "tool": s.tool, "status": s.status, "error": s.error}
                           for s in (state.plan.steps if state.plan else [])
                       ]}
                return

            state.evidence = self._collect_evidence(state)

            intent = state.context.get("intent") or classify_query(query)
            chat_reference = intent.get("chat_reference") or "none"
            chat_readiness = await self._chat_doc_readiness(conversation_id)
            document_only = chat_reference == "chat_only" and chat_readiness != "none"

            chat_evidence: List[Dict[str, Any]] = []
            try:
                chat_evidence = await self._retrieve_chat_documents(
                    conversation_id,
                    query,
                    allow_fallback=chat_reference in ("chat_only", "hybrid"),
                )
            except Exception as e:
                logger.warning("chat_doc_retrieval_injection_failed", error=str(e))

            if _CHAT_DOC_DEBUG:
                logger.info(
                    "chat_doc_retrieval",
                    conversation_id=conversation_id,
                    chat_reference=chat_reference,
                    chat_readiness=chat_readiness,
                    document_only=document_only,
                    chat_evidence_count=len(chat_evidence),
                    permanent_evidence_count=len(state.evidence),
                    chat_document_ids=[e.get("document_id") for e in chat_evidence[:5]],
                    chat_scores=[e.get("relevance_score") for e in chat_evidence[:5]],
                )

            if document_only:
                state.evidence = chat_evidence
                state.documents_accessed = list(dict.fromkeys(
                    e.get("document_id") for e in chat_evidence if e.get("document_id")
                ))
                state.tools_used = [t for t in state.tools_used if t in ("search_chat_documents",)]
                if chat_evidence and "search_chat_documents" not in state.tools_used:
                    state.tools_used.append("search_chat_documents")
            else:
                # Chat documents are always retrieved for a question in this chat
                # and rank FIRST as evidence so the upload answers the question;
                # permanent KB evidence is retained as secondary context (the
                # chat + hybrid default). `document_only` is the only case where
                # permanent evidence is excluded entirely.
                if chat_evidence:
                    state.evidence = chat_evidence + state.evidence
                self._merge_chat_accessed(state, chat_evidence)

            state.analysis = self._collect_analysis(state)
            if chat_reference not in ("hybrid",) and not document_only and not chat_evidence:
                state.documents_accessed = self._collect_documents_accessed(state)

            answer_override = None
            if document_only and not chat_evidence:
                if chat_readiness == "processing":
                    answer_override = (
                        "Your uploaded document is still being processed (OCR and "
                        "indexing are currently running). Please wait until the "
                        "attachment shows the ready state, then ask again."
                    )
                else:
                    answer_override = (
                        "I could not find that information in the uploaded document. "
                        "The file attached to this chat does not contain the detail "
                        "you asked about."
                    )

            if answer_override is None:
                answer = await self._synthesize_answer(state, selected_model)
                state.final_answer = answer
            else:
                state.final_answer = answer_override

            yield {"event": "verification_started"}
            verification_result = await verifier.verify(state)
            yield {"event": "verification_completed", "verified": verification_result.get("verified")}

            if state.artifacts_generated:
                for artifact in state.artifacts_generated:
                    yield {"event": "artifact_created", "artifact": artifact}

            state.final_answer = self._verify_answer_codes(
                state.final_answer,
                self._evidence_text(state.evidence),
                state.query,
            )
            display_evidence = self._dedupe_evidence(state.evidence)

            yield {
                "event": "run_completed",
                "run_id": run_id,
                "answer": state.final_answer,
                "evidence": display_evidence,
                "model": selected_model,
                "tools_used": state.tools_used,
                "documents_accessed": state.documents_accessed,
                "analysis": state.analysis,
                "artifacts": state.artifacts_generated,
                "steps_status": [
                    {"label": s.label, "tool": s.tool, "status": s.status, "error": s.error}
                    for s in (state.plan.steps if state.plan else [])
                ],
            }

        except Exception as e:
            logger.error("agent_run_failed", run_id=run_id, error=str(e))
            yield {"event": "run_failed", "error": str(e)}

    def _collect_evidence(self, state: AgentState) -> List[Dict[str, Any]]:
        evidence = []
        for step in state.plan.steps if state.plan else []:
            if not step.tool or not step.output_data:
                continue
            if step.tool == "search_documents":
                for result in step.output_data.get("results", []):
                    evidence.append({
                        "source": step.tool,
                        "document_id": result.get("document_id"),
                        "document_name": result.get("document_name"),
                        "document_type": result.get("document_type"),
                        "year": result.get("year"),
                        "content": result.get("content"),
                        "page": result.get("page_number"),
                        "section": result.get("section"),
                        "relevance": result.get("relevance_score"),
                    })
            elif step.tool == "summarize_documents":
                for doc in step.output_data.get("documents", []):
                    evidence.append({
                        "source": step.tool,
                        "document_id": doc.get("document_id"),
                        "document_name": doc.get("document_name"),
                        "document_type": doc.get("document_type"),
                        "year": doc.get("year"),
                        "content": (doc.get("content") or "")[:4000],
                        "page": doc.get("page_number"),
                        "section": doc.get("section"),
                        "relevance": None,
                    })
            elif step.tool == "company_info":
                evidence.append({
                    "source": "company_info",
                    "document_id": None,
                    "content": json.dumps(step.output_data, default=str)[:1500],
                })
        return evidence

    def _collect_analysis(self, state: AgentState) -> Dict[str, Any]:
        analysis: Dict[str, Any] = {}
        for step in state.plan.steps if state.plan else []:
            if step.tool == "analyze_data" and step.output_data:
                analysis = dict(step.output_data.get("analysis") or {})
                break

        # Deterministic grounding: enrich the analysis with the real inspection
        # trend chart (Pressure/Corrosion/Vibration per year) ONLY when the
        # query actually asks for analysis/metrics/risk (analysis or complex
        # intents, or an analyze_data step). Plain knowledge questions - even
        # ones that mention an asset ("What equipment is associated with
        # P-102?") - must NOT surface inspection chart/table content they never
        # asked for.
        try:
            intent = state.context.get("intent") or classify_query(state.query)
            category = intent.get("category")
            ran_analysis = any(
                s.tool == "analyze_data"
                for s in (state.plan.steps if state.plan else [])
            )
            wants_trends = category in ("analysis", "complex") or ran_analysis or bool(analysis)
            if not wants_trends:
                return analysis
            from app.services.inspection_trends import build_inspection_trends
            asset_ids = intent.get("asset_ids") or []
            target = asset_ids[0] if asset_ids else None
            trends = build_inspection_trends(self.db, self.company_id, target)
            if trends:
                charts = list(analysis.get("charts") or [])
                existing_titles = {
                    re.sub(r"[^a-z0-9]", "", (c.get("title") or "").lower())
                    for c in charts
                    if c.get("title")
                }
                trend_title = re.sub(r"[^a-z0-9]", "", (trends["chart"]["title"] or "").lower())
                if trend_title and trend_title not in existing_titles:
                    charts.insert(0, trends["chart"])
                analysis["charts"] = charts

                current_metrics = {m.get("name", "").lower() for m in (analysis.get("metrics") or [])}
                analysis["metrics"] = list(
                    (analysis.get("metrics") or [])
                    + [m for m in trends["metrics"] if m.get("name", "").lower() not in current_metrics]
                )

                found_titles = {f.get("title", "").lower() for f in (analysis.get("findings") or [])}
                analysis["findings"] = list(
                    (analysis.get("findings") or [])
                    + [f for f in trends["findings"] if f.get("title", "").lower() not in found_titles]
                )

                tables = list(analysis.get("tables") or [])
                if not any(
                    (t.get("title") or "").lower() == (trends["table"]["title"] or "").lower()
                    for t in tables
                ):
                    tables.insert(0, trends["table"])
                analysis["tables"] = tables
        except Exception as e:
            logger.warning("trend_merge_failed", error=str(e))
        return analysis

    def _collect_documents_accessed(self, state: AgentState) -> List[str]:
        doc_ids: List[str] = []
        for step in state.plan.steps if state.plan else []:
            if step.tool == "search_documents":
                results = step.output_data.get("results", [])
                for r in results:
                    doc_id = r.get("document_id")
                    if doc_id and doc_id not in doc_ids:
                        doc_ids.append(doc_id)
        return doc_ids

    async def _retrieve_chat_documents(
        self, conversation_id: str, query: str, allow_fallback: bool = False,
    ) -> List[Dict[str, Any]]:
        """Retrieve chunks from documents uploaded to THIS conversation.

        Empty when the conversation has no READY chat documents, so permanent-RAG
        queries and normal chat flows are completely unaffected.
        """
        try:
            from app.db.models import ChatDocument, DocumentStatus
            has_docs = self.db.query(ChatDocument.id).filter(
                ChatDocument.conversation_id == conversation_id,
                ChatDocument.company_id == self.company_id,
                ChatDocument.user_id == self.user_id,
                ChatDocument.status == DocumentStatus.READY,
                ChatDocument.chunk_count > 0,
            ).first() is not None
        except Exception as e:
            logger.warning("chat_doc_readiness_check_failed", error=str(e))
            return []
        if not has_docs:
            return []
        from app.tools.chat_document_search import search_chat_documents
        return await search_chat_documents(
            query, self.company_id, self.user_id, conversation_id,
            allow_fallback=allow_fallback,
        )

    async def _chat_doc_readiness(self, conversation_id: str) -> str:
        """'none' | 'processing' | 'ready' — whether this chat has uploads."""
        try:
            from app.db.models import ChatDocument, DocumentStatus
            uploaded = self.db.query(ChatDocument.id).filter(
                ChatDocument.conversation_id == conversation_id,
                ChatDocument.company_id == self.company_id,
                ChatDocument.user_id == self.user_id,
            ).first() is not None
            if not uploaded:
                return "none"
            ready = self.db.query(ChatDocument.id).filter(
                ChatDocument.conversation_id == conversation_id,
                ChatDocument.company_id == self.company_id,
                ChatDocument.user_id == self.user_id,
                ChatDocument.status == DocumentStatus.READY,
            ).first() is not None
            return "ready" if ready else "processing"
        except Exception as e:
            logger.warning("chat_doc_readiness_failed", error=str(e))
            return "none"

    def _merge_chat_accessed(self, state: AgentState, chat_evidence: List[Dict[str, Any]]) -> None:
        chat_ids = list(dict.fromkeys(
            e.get("document_id") for e in chat_evidence if e.get("document_id")
        ))
        state.documents_accessed = chat_ids + [
            d for d in self._collect_documents_accessed(state) if d not in chat_ids
        ]
        if "search_chat_documents" not in state.tools_used:
            state.tools_used.append("search_chat_documents")

    def _compact_evidence(
        self, state: AgentState, intent: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Return the evidence the synthesizer should actually read.

        Deep-context intents (summarization, comparison, complex, analysis) keep
        every chunk so no detail is lost. Plain knowledge questions are deduped
        per document (keep the best-ranked chunk only) and capped so the prompt
        stays small, fast and focused - the model no longer has to wade through
        multiple copies of the same noisy document.
        """
        category = intent.get("category")
        needs_full = category in ("summarization", "comparison", "complex", "analysis")
        max_items = None if needs_full else 8
        seen: set = set()
        compact: List[Dict[str, Any]] = []
        for e in state.evidence:
            doc_id = e.get("document_id")
            if not doc_id or doc_id in seen:
                continue
            if max_items is not None and len(compact) >= max_items:
                break
            seen.add(doc_id)
            compact.append(e)
        return compact

    def _dedupe_evidence(self, evidence: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Collapse evidence to one chunk per document (keep first occurrence)."""
        seen: set = set()
        out: List[Dict[str, Any]] = []
        for e in evidence:
            doc_id = e.get("document_id")
            if not doc_id or doc_id in seen:
                continue
            seen.add(doc_id)
            out.append(e)
        return out

    def _evidence_text(self, evidence: List[Dict[str, Any]]) -> str:
        """Flatten evidence dicts into the compact text the synthesizer reads."""
        out = []
        for e in evidence:
            content = e.get("content") or ""
            out.append(f"Source ({e.get('document_id', 'Unknown')}): {content}")
        return "\n\n".join(out)

    def _verify_answer_codes(self, answer: str, evidence_text: str, query: str) -> str:
        """Deterministically drop plant codes from the final answer that are
        NOT plausibly tied to the queried asset.

        Small open-weight LLMs tend to invent plausible-looking instrument
        tags (e.g. PT-102, TT-102, FT-210) almost as if they were part of the
        equipment - even when those codes belong to different assets. This pass
        runs AFTER generation and enforces the guarantee deterministically:

        * if the query names a target code (asset/instrument), a code is kept
          only when the evidence mentions it on the same line as the target
          (i.e. it is a documented association) - or it is the target/unit tag;
        * otherwise a code is kept only when it exists in the knowledge base
          and in the evidence (pure fabrication filter).
        """
        if not answer:
            return answer
        try:
            from app.agents.entity_guard import _CODE_PATTERN

            query_codes = set(_CODE_PATTERN.findall((query or "").upper()))
            evidence_upper = (evidence_text or "").upper()

            if query_codes:
                cooccur: set = set()
                for line in evidence_upper.splitlines():
                    if any(c in line for c in query_codes):
                        cooccur.update(_CODE_PATTERN.findall(line))
                accepted = set(query_codes) | cooccur
            else:
                from app.agents.entity_guard import load_known_codes
                known = load_known_codes(self.db)
                known_all = {c.upper() for c in (known["assets"] | known["units"])}
                accepted = known_all | set(_CODE_PATTERN.findall(evidence_upper))

            found = set(_CODE_PATTERN.findall(answer.upper()))
            flagged = sorted(c for c in found if c not in accepted)
            if not flagged:
                return answer

            kept: List[str] = []
            removed: set = set()
            for line in answer.splitlines():
                upper = line.upper()
                line_codes = set(_CODE_PATTERN.findall(upper))
                bad = sorted({c for c in flagged if c in line_codes})
                if not bad:
                    kept.append(line)
                    continue
                removed.update(bad)
                if any(c for c in line_codes if c not in frozenset(flagged)):
                    scrubbed = line
                    for c in bad:
                        scrubbed = re.sub(r",?\s*" + re.escape(c) + r"\s*,?", ", ", scrubbed)
                        scrubbed = scrubbed.replace(c, "").replace("  ", " ").strip(" ,-")
                    if scrubbed.strip():
                        kept.append(scrubbed.strip())
            verified = "\n".join(kept).strip()
            if removed:
                note = (
                    "\n\n(References to "
                    + ", ".join(sorted(removed))
                    + " have been omitted - those plant codes are not recorded as associated "
                    "with the requested asset in ApexPetro's knowledge base.)"
                )
                verified = (verified.rstrip() + note).strip() if verified else note.strip()
            return verified or answer
        except Exception:
            return answer

    async def _synthesize_answer(self, state: AgentState, model: str) -> str:
        intent = state.context.get("intent") or classify_query(state.query)
        requires_rag = bool(intent.get("requires_rag", True) is not False)

        # Hard no-fabrication guard: RAG-required queries with zero evidence
        # get an honest "not found" answer instead of a confident hallucination.
        if requires_rag and not state.evidence:
            return (
                "I couldn't find the requested information in the available company "
                "knowledge base. The document set may not contain this detail - "
                "rephrase the question or upload the relevant document."
            )

        prompt_evidence = self._compact_evidence(state, intent)

        def _evidence_page(e: Dict[str, Any]):
            p = e.get("page")
            if p is None:
                p = e.get("page_number")
            return p if p is not None else "?"

        evidence_text = "\n\n".join([
            f"Source {i+1} ({e.get('document_id', 'Unknown')}"
            + (f", {e.get('document_name', '')}" if e.get("document_name") else "")
            + (f", {e.get('year', '')}" if e.get("year") else "")
            + (" [uploaded to this chat]" if e.get("is_chat_document") else "")
            + f", p.{_evidence_page(e)}): {(e.get('content', '') or '')[:1200]}"
            for i, e in enumerate(prompt_evidence)
        ])

        # Deterministic entity-consistency guard: catch references to plant codes
        # (assets/units) that don't exist in the knowledge base or that the
        # retrieved evidence never mentions, so the answer never fabricates them.
        entity_note = ""
        try:
            from app.agents.entity_guard import build_consistency_note
            entity_note = build_consistency_note(state.query, evidence_text, db=self.db)
        except Exception as e:
            logger.warning("entity_guard_failed", error=str(e))

        analysis_text = self._analysis_text(state.analysis)

        artifact_text = ""
        if state.artifacts_generated:
            artifact_lines = [
                f"- '{a.get('name')}' ({a.get('format')}) — version {a.get('version', 1)} — download: {a.get('download_url')}"
                for a in state.artifacts_generated
            ]
            artifact_text = (
                "\n\nA fresh document artifact was generated and persisted for this request. "
                "Mention it in your answer with its name and download path:\n" + "\n".join(artifact_lines)
            )

        # Mode-specific synthesis instructions so the answer shape matches the
        # question (summary with the requested depth, comparison, etc.).
        task_hint = self._task_hint(intent)

        # Deterministic structured analysis facts (percent changes, readings,
        # risk level) are injected verbatim so the answer never fabricates them.
        analysis_hint = ""
        if analysis_text:
            analysis_hint = (
                "\n\nStructured analysis results (use these exact figures, do not invent others):\n"
                + analysis_text
            )

        system_prompt = """You are an industrial AI assistant for ApexPetro Energy Limited.
Answer the user's question using ONLY the provided evidence and structured analysis.
Do not invent facts. Cite sources using [Source N] format.
If evidence is insufficient, say "Not specified in the available company knowledge."
Show calculations explicitly with units.
{task_hint}""".format(task_hint=task_hint)

        history_text = ""
        if self.history:
            recent = self.history[-6:]
            history_lines = []
            for h in recent:
                role = h.get("role", "user")
                content = h.get("content", "")
                history_lines.append(f"{role}: {content}")
            history_text = "\n".join(history_lines)

        prompt = f"""{system_prompt}

{("Previous Conversation:\n" + history_text + "\n\n") if history_text else ""}User Question: {state.query}

Evidence:
{evidence_text}{analysis_hint}
{artifact_text}

Provide a clear, well-structured answer with citations."""
        if entity_note:
            prompt = f"{prompt}\n\n{entity_note}"

        try:
            primary_model = settings.primary_model
            # Context window scales with the query type: deep-context intents
            # (summary/comparison/analysis) keep the full 16k window, plain
            # knowledge questions use a tighter 8k window so the (much smaller)
            # prompt is processed fast instead of dragging the whole window.
            deep_context = intent.get("category") in (
                "summarization", "comparison", "complex", "analysis",
            )
            num_ctx = 16384 if deep_context else 8192
            response = await ollama_client.generate(
                model=primary_model,
                prompt=prompt,
                system=system_prompt,
                options={"temperature": 0.2, "top_p": 0.9, "num_ctx": num_ctx},
            )
            answer = (response.get("response") or "").strip()
            if answer:
                return answer
            logger.warning("answer_synthesis_empty")
        except Exception as e:
            logger.error("answer_synthesis_failed", error=str(e))

        # Deterministic fallback built from the already-generated execution
        # results - NEVER surface "Error synthesizing answer".
        return self._fallback_synthesize(state, intent)

    def _analysis_text(self, analysis: Dict[str, Any] | None) -> str:
        if not analysis:
            return ""
        if not isinstance(analysis, dict):
            return str(analysis)[:2000]

        def fmt_chart(chart: Dict[str, Any]) -> str:
            title = chart.get("title") or "Chart"
            parts = []
            for line in chart.get("series") or []:
                points = ", ".join(
                    f"{p.get('label')}={p.get('value')}" for p in (line.get("data") or [])
                )
                parts.append(f"{line.get('name')}: {points}")
            if parts:
                return f"- {title} | " + " | ".join(parts)
            points = ", ".join(
                f"{p.get('label')}={p.get('value')}" for p in (chart.get("data") or [])
            )
            return f"- {title}: {points}"

        sections = []
        if analysis.get("summary"):
            sections.append(f"Summary: {analysis['summary']}")
        metrics = analysis.get("metrics") or []
        if metrics:
            sections.append(
                "Metrics: "
                + "; ".join(
                    f"{m.get('name')}={m.get('value')}{m.get('unit', '')} ({m.get('status', '')})"
                    for m in metrics
                )
            )
        findings = analysis.get("findings") or []
        if findings:
            sections.append(
                "Findings:\n" + "\n".join(f"- {f.get('title')}: {f.get('detail', '')}" for f in findings)
            )
        charts = analysis.get("charts") or []
        if charts:
            sections.append("Charts:\n" + "\n".join(fmt_chart(c) for c in charts))
        tables = analysis.get("tables") or []
        if tables:
            for t in tables:
                rows = (t.get("rows") or [])[:12]
                sections.append(
                    f"Table {t.get('title', '')}:\n"
                    + "\n".join(
                        " | ".join(str(cell) for cell in row) for row in rows
                    )
                )
        scope = analysis.get("_scope") or {}
        if scope.get("risk_level"):
            sections.append(f"Current risk level: {scope['risk_level']}")
        return "\n".join(sections)[:8000]

    def _fallback_synthesize(self, state: AgentState, intent: Dict[str, Any]) -> str:
        """Deterministic answer built from already-generated execution results.

        Used only when the LLM synthesis fails/times out, so the chat never
        shows 'Error synthesizing answer'. All facts come from state.evidence
        and state.analysis - there is no new generation involved."""
        lines: List[str] = []
        category = intent.get("category")
        had_content = False

        if category == "company_info":
            lines.append("## Company Information")
        elif category == "comparison":
            lines.append("## Comparison")
        elif category == "summarization":
            lines.append("## Summary")
        elif category == "analysis":
            lines.append("## Analysis")
        else:
            lines.append("## Answer")

        analysis = state.analysis or {}
        if analysis.get("summary"):
            lines.append("")
            lines.append(str(analysis["summary"]))
            had_content = True

        metrics = (analysis.get("metrics") or [])[:6]
        if metrics:
            lines.append("")
            lines.append("**Key metrics**")
            lines.extend(
                f"- {m.get('name')}: {m.get('value')} {m.get('unit', '')} ({m.get('status', 'INFO')})"
                for m in metrics
            )
            had_content = True

        findings = (analysis.get("findings") or [])[:8]
        if findings:
            lines.append("")
            lines.append("**Findings**")
            for f in findings:
                detail = f.get("detail", "")
                lines.append(f"- **{f.get('title')}**" + (f": {detail}" if detail else ""))
            had_content = True

        tables = analysis.get("tables") or []
        for t in tables[:2]:
            headers = t.get("headers") or []
            rows = (t.get("rows") or [])[:12]
            if headers and rows:
                lines.append("")
                lines.append(f"**{t.get('title', 'Data')}**")
                lines.append("  | " + " | ".join(headers))
                lines.append("  | " + " | ".join("---" for _ in headers))
                lines.extend("  | " + " | ".join(str(cell) for cell in row) for row in rows)
                had_content = True

        charts = analysis.get("charts") or []
        for chart in charts[:4]:
            title = chart.get("title") or ""
            series = chart.get("series") or []
            if series:
                summary_parts = []
                for line in series:
                    points = [p for p in (line.get("data") or []) if p.get("value") not in (None,)]
                    if not points:
                        continue
                    series_range = " → ".join(f"{p.get('label')} {p.get('value')}" for p in points)
                    summary_parts.append(f"{line.get('name')}: {series_range}")
                lines.append("")
                lines.append(f"**{title}**")
                lines.extend(f"- {part}" for part in summary_parts)
                had_content = True
            else:
                points = [p for p in (chart.get("data") or []) if p.get("value") not in (None,)]
                if points:
                    lines.append("")
                    lines.append(f"**{title}**")
                    lines.append(
                        ", ".join(f"{p.get('label')} = {p.get('value')}" for p in points)
                    )
                    had_content = True

        recommendations = (analysis.get("recommendations") or [])[:4]
        if recommendations:
            lines.append("")
            lines.append("**Recommendations**")
            for r in recommendations:
                lines.append(f"- **[{r.get('priority', 'MEDIUM')}]** {r.get('action')}")
            had_content = True

        if state.evidence:
            lines.append("")
            lines.append("**Sources**")
            seen: set = set()
            for e in state.evidence:
                doc_id = e.get("document_id")
                if not doc_id or doc_id in seen:
                    continue
                seen.add(doc_id)
                lines.append(f"- {doc_id}" + (f" ({e.get('year')})" if e.get("year") else ""))
            had_content = True

        if state.artifacts_generated:
            lines.append("")
            lines.append("**Generated document**")
            for artifact in state.artifacts_generated:
                lines.append(
                    f"- {artifact.get('name')} ({artifact.get('format')}, v{artifact.get('version', 1)})"
                    + (f" — {artifact.get('download_url')}" if artifact.get("download_url") else "")
                )
            had_content = True

        if analysis.get("_scope"):
            scope = analysis["_scope"]
            if scope.get("risk_level"):
                lines.append("")
                lines.append(f"**Risk level:** {scope['risk_level']}")
                had_content = True

        if not had_content:
            return (
                "I couldn't find the requested information in the available company knowledge base. "
                "The document set may not contain this detail - rephrase the question or upload the relevant document."
            )

        return "\n".join(lines)

    def _task_hint(self, intent: Dict[str, Any]) -> str:
        category = intent.get("category")
        if category == "summarization":
            level = intent.get("summary_level") or "concise"
            if level == "detailed":
                return "Write a DETAILED summary covering all key sections in the evidence."
            if level == "findings":
                return "Write a summary focused on the KEY FINDINGS and main takeaways from the evidence."
            if level and level.endswith("_points"):
                n = level.split("_")[0]
                return f"Structure the summary as exactly {n} clear numbered points."
            return "Write a concise summary of the evidence."
        if category == "comparison":
            return "Write a COMPARISON that contrasts the retrieved documents side by side, highlighting differences and changes across the compared years/documents."
        if category == "company_info":
            return "Answer from the company records using plain language (name, locations, size, assets, departments). Do not invent figures."
        if category == "knowledge":
            return (
                "Answer directly and concisely using ONLY the retrieved evidence. State facts "
                "(equipment type, service, unit, criticality, readings, dates) only where the "
                "evidence explicitly contains them. Do NOT invent, guess or list plant codes, "
                "instruments, tags, values or documents that are not present in the evidence."
            )
        if category == "complex":
            return (
                "You are fulfilling a multi-part request. Address each requested part clearly while citing "
                "the relevant evidence: company/profile facts, asset details, retrieved documents, comparison, "
                "percentage changes with calculations shown, whether operating limits were exceeded, the "
                "current risk level, the evidence supporting the risk assessment, and any generated report artifact."
            )
        if category == "analysis":
            return (
                "Provide a structured analysis answer reflecting the metrics, percentage changes, limit "
                "breaches and risk level from the analysis results. Show calculations explicitly with units."
            )
        return ""

    async def _conversational_reply(self, query: str) -> str:
        system_prompt = (
            "You are a helpful industrial AI assistant for ApexPetro Energy Limited. "
            "Answer conversationally, briefly and warmly. Do not search documents or "
            "invent company facts."
        )
        try:
            response = await ollama_client.generate(
                model=settings.primary_model,
                prompt=query,
                system=system_prompt,
                options={"temperature": 0.7, "top_p": 0.9},
            )
            return response.get("response", "").strip() or (
                "Hello! I'm here to help you with the ApexPetro knowledge base - "
                "ask me about procedures, inspections, assets or company information."
            )
        except Exception as e:
            logger.error("conversational_reply_failed", error=str(e))
            return "Hello! How can I help you today?"


async def run_agent(
    db,
    company_id: str,
    user_id: int,
    query: str,
    conversation_id: str,
    history: List[Dict[str, str]] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    orchestrator = AgentOrchestrator(db, company_id, user_id, history=history)
    async for event in orchestrator.run(query, conversation_id):
        yield event