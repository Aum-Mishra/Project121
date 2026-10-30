from typing import Dict, Any, AsyncGenerator, List
from app.agents.state import AgentState, AgentPhase
from app.agents.planner import planner
from app.agents.executor import executor
from app.agents.verifier import verifier
from app.agents.greetings import is_greeting, fast_path_response, greet
from app.llm.ollama_client import ollama_client
from app.llm.router import model_router
from app.core.config import settings
from app.core.logging import get_logger
import json
import uuid
from datetime import datetime
from app.db.models import AgentRun, AgentRunStatus

logger = get_logger(__name__)


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
        }

        yield {"event": "run_started", "run_id": run_id, "query": query}

        # Multi-tier prompt injection defense inspection
        from app.core.prompt_defense import prompt_defense
        is_safe, attack_type, reason = prompt_defense.inspect_query(query)
        if not is_safe:
            from app.db.models import AuditEvent
            try:
                self.db.add(AuditEvent(
                    event_id=str(uuid.uuid4()),
                    company_id=self.company_id,
                    user_id=self.user_id,
                    event_type="PROMPT_INJECTION_BLOCKED",
                    resource_type="query",
                    resource_id=run_id,
                    details={"attack_type": attack_type, "reason": reason, "query": query[:120]},
                ))
                self.db.commit()
            except Exception as e:
                logger.error("audit_log_injection_failed", error=str(e))
                self.db.rollback()

            yield {
                "event": "run_completed",
                "run_id": run_id,
                "answer": f"**Security Violation:** {reason}",
                "evidence": [],
                "model": "security-shield",
                "tools_used": [],
                "documents_accessed": [],
                "analysis": {},
                "artifacts": [],
            }
            return


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
                yield {"event": "run_failed", "error": state.error or "Execution failed"}
                return

            state.evidence = self._collect_evidence(state)
            state.analysis = self._collect_analysis(state)
            state.documents_accessed = self._collect_documents_accessed(state)

            answer = await self._synthesize_answer(state, selected_model)
            state.final_answer = answer

            yield {"event": "verification_started"}
            verification_result = await verifier.verify(state)
            yield {"event": "verification_completed", "verified": verification_result.get("verified")}

            if state.artifacts_generated:
                for artifact in state.artifacts_generated:
                    yield {"event": "artifact_created", "artifact": artifact}

            yield {
                "event": "run_completed",
                "run_id": run_id,
                "answer": state.final_answer,
                "evidence": state.evidence,
                "model": selected_model,
                "tools_used": state.tools_used,
                "documents_accessed": state.documents_accessed,
                "analysis": state.analysis,
                "artifacts": state.artifacts_generated,
            }

        except Exception as e:
            logger.error("agent_run_failed", run_id=run_id, error=str(e))
            yield {"event": "run_failed", "error": str(e)}

    def _collect_evidence(self, state: AgentState) -> List[Dict[str, Any]]:
        evidence = []
        for step in state.plan.steps if state.plan else []:
            if step.tool and step.output_data:
                if step.tool == "search_documents":
                    for result in step.output_data.get("results", []):
                        evidence.append({
                            "source": step.tool,
                            "document_id": result.get("document_id"),
                            "content": result.get("content"),
                            "page": result.get("page_number"),
                            "section": result.get("section"),
                            "relevance": result.get("relevance_score"),
                        })
        return evidence

    def _collect_analysis(self, state: AgentState) -> Dict[str, Any]:
        for step in state.plan.steps if state.plan else []:
            if step.tool == "analyze_data" and step.output_data:
                return step.output_data.get("analysis") or {}
        return {}

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

    async def _synthesize_answer(self, state: AgentState, model: str) -> str:
        evidence_text = "\n\n".join([
            f"Source {i+1} ({e.get('document_id', 'Unknown')}, p.{e.get('page', '?')}): {e.get('content', '')[:500]}"
            for i, e in enumerate(state.evidence)
        ])

        artifact_text = ""
        if state.artifacts_generated:
            artifact_lines = [
                f"- '{a.get('name')}' ({a.get('format')}) — download: {a.get('download_url')}"
                for a in state.artifacts_generated
            ]
            artifact_text = (
                "\n\nA fresh document artifact was generated and persisted for this request. "
                "Mention it in your answer with its name and download path:\n" + "\n".join(artifact_lines)
            )

        system_prompt = """You are an industrial AI assistant for ApexPetro Energy Limited.
Answer the user's question using ONLY the provided evidence.
Do not invent facts. Cite sources using [Source N] format.
If evidence is insufficient, say "Not specified in the available company knowledge."
Show calculations explicitly with units."""

        history_text = ""
        if self.history:
            history_lines = []
            for h in self.history:
                role = h.get("role", "user")
                content = h.get("content", "")
                history_lines.append(f"{role}: {content}")
            history_text = "\n".join(history_lines)

        prompt = f"""{system_prompt}

{("Previous Conversation:\n" + history_text + "\n\n") if history_text else ""}User Question: {state.query}

Evidence:
{evidence_text}
{artifact_text}

Provide a clear, well-structured answer with citations."""

        try:
            primary_model = settings.primary_model
            response = await ollama_client.generate(
                model=primary_model,
                prompt=prompt,
                system=system_prompt,
                options={"temperature": 0.2, "top_p": 0.9},
            )
            raw_answer = response.get("response", "").strip()
            from app.core.dlp_service import dlp_service
            redacted_answer, dlp_violations = dlp_service.scan_and_redact(raw_answer)
            if dlp_violations:
                from app.db.models import AuditEvent
                try:
                    self.db.add(AuditEvent(
                        event_id=str(uuid.uuid4()),
                        company_id=self.company_id,
                        user_id=self.user_id,
                        event_type="DLP_SENSITIVE_DATA_DETECTED",
                        resource_type="answer",
                        resource_id=state.run_id,
                        details={"violations_count": len(dlp_violations), "rules": [v["rule"] for v in dlp_violations]},
                    ))
                    self.db.commit()
                except Exception as e:
                    logger.error("audit_log_dlp_failed", error=str(e))
                    self.db.rollback()
            return redacted_answer
        except Exception as e:
            logger.error("answer_synthesis_failed", error=str(e))
            return f"Error synthesizing answer: {str(e)}"


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