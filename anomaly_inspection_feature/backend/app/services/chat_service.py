from typing import AsyncGenerator, Dict, Any, Optional, List
from sqlalchemy.orm import Session
from app.agents.orchestrator import run_agent
from app.db.models import (
    AgentRun, AgentStep, AgentRunStatus, AgentStepStatus,
    Project, ProjectStatus, Task, TaskStatus,
    Artifact, ArtifactType, ArtifactStatus,
    Approval, ApprovalStatus, DocumentClassification,
)
from app.db.repositories import ConversationRepository
from app.core.logging import get_logger
import json
import uuid
from datetime import datetime

logger = get_logger(__name__)


class ChatService:
    def __init__(self, db: Session):
        self.db = db
        self.conversation_repo = ConversationRepository(db)

    def _load_history(self, conversation_id: str) -> List[Dict[str, str]]:
        messages = self.conversation_repo.get_messages(conversation_id, limit=50)
        return [{"role": m.role, "content": m.content} for m in messages]

    def _auto_title_conversation(self, conversation_id: str, query: str) -> None:
        conv = self.conversation_repo.get_by_conversation_id(conversation_id)
        if not conv or (conv.title or "").strip():
            return
        from app.services.conversation_titles import generate_title
        title = generate_title(query)
        if title:
            conv.title = title
            self.db.commit()

    def _save_user_message(self, conversation_id: str, user_id: int, query: str) -> None:
        attachments = None
        try:
            from app.services.chat_attachment_service import get_conversation_attachments
            existing = get_conversation_attachments(conversation_id)
            attachments = [
                {
                    "attachment_id": a.get("attachment_id"),
                    "filename": a.get("filename"),
                    "ext": a.get("ext"),
                    "file_path": a.get("file_path"),
                    "size": a.get("size"),
                    "summary": a.get("summary"),
                }
                for a in existing
            ]
        except Exception as e:
            logger.error("chat_attachments_index_failed", error=str(e))
        self.conversation_repo.add_message(conversation_id, user_id, "user", query, attachments=attachments)

    def _ensure_anomaly_records(
        self, conversation_id: str, user_id: int, company_id: str, analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        proj_sugg = analysis.get("project_suggestion") or {}
        appr_sugg = analysis.get("approval_suggestion") or {}

        linked_project = None
        linked_approval = None

        try:
            # 1. Ensure Project
            project_id = proj_sugg.get("project_id") or f"PRJ-{analysis.get('asset_id', 'ANOMALY')}-REV"
            project = self.db.query(Project).filter(Project.project_id == project_id).first()
            if not project:
                project = Project(
                    project_id=project_id,
                    company_id=company_id,
                    name=proj_sugg.get("name") or f"{analysis.get('title', 'Anomaly Review')} Remediation",
                    unit=proj_sugg.get("unit") or "CDU-4",
                    asset=proj_sugg.get("asset") or analysis.get("asset_id"),
                    status=ProjectStatus.IN_PROGRESS,
                    risk=proj_sugg.get("risk") or analysis.get("severity", "HIGH"),
                    progress=25,
                    classification=DocumentClassification.CONFIDENTIAL,
                    description=proj_sugg.get("description") or analysis.get("summary"),
                )
                self.db.add(project)
                self.db.flush()

                # Add associated tasks
                tasks_data = proj_sugg.get("tasks") or [
                    {"title": f"Investigate {analysis.get('title', 'anomaly')}", "priority": 1},
                    {"title": "Verify sensor telemetry and field inspection findings", "priority": 2},
                ]
                for idx, t in enumerate(tasks_data):
                    title_text = t.get("title") if isinstance(t, dict) else str(t)
                    priority_val = t.get("priority", 2) if isinstance(t, dict) else 2
                    task_rec = Task(
                        task_id=f"TSK-{project_id[-6:]}-{idx+1:02d}",
                        project_id=project.id,
                        title=title_text,
                        status=TaskStatus.IN_PROGRESS if idx == 0 else TaskStatus.TODO,
                        priority=priority_val,
                    )
                    self.db.add(task_rec)
                self.db.commit()

            linked_project = {
                "id": project.id,
                "project_id": project.project_id,
                "name": project.name,
                "unit": project.unit,
                "asset": project.asset,
                "risk": project.risk,
                "status": project.status.value if hasattr(project.status, "value") else str(project.status),
            }

            # 2. Ensure Artifact & Approval
            appr_id = appr_sugg.get("approval_id") or f"APR-{project_id[-6:]}-001"
            approval = self.db.query(Approval).filter(Approval.approval_id == appr_id).first()
            if not approval:
                art_id = f"ART-{project_id[-6:]}-NOTE"
                artifact = self.db.query(Artifact).filter(Artifact.artifact_id == art_id).first()
                if not artifact:
                    artifact = Artifact(
                        artifact_id=art_id,
                        company_id=company_id,
                        project_id=project.id,
                        name=appr_sugg.get("title") or f"{analysis.get('title')} Approval Note",
                        artifact_type=ArtifactType.MD,
                        status=ArtifactStatus.READY_FOR_REVIEW,
                        classification=DocumentClassification.CONFIDENTIAL,
                        created_by=user_id,
                    )
                    self.db.add(artifact)
                    self.db.flush()

                approval = Approval(
                    approval_id=appr_id,
                    artifact_id=artifact.id,
                    requested_by=user_id,
                    status=ApprovalStatus.PENDING,
                    comments=appr_sugg.get("comments") or analysis.get("summary"),
                )
                self.db.add(approval)
                self.db.commit()

            linked_approval = {
                "id": approval.id,
                "approval_id": approval.approval_id,
                "status": approval.status.value if hasattr(approval.status, "value") else str(approval.status),
                "comments": approval.comments,
            }

        except Exception as e:
            self.db.rollback()
            logger.error("ensure_anomaly_records_failed", error=str(e))

        return {"project": linked_project, "approval": linked_approval}

    def _save_assistant_message(
        self,
        conversation_id: str,
        user_id: int,
        answer: str,
        run_id: str,
        sources: Optional[list] = None,
        artifacts: Optional[list] = None,
        metadata: Optional[dict] = None,
    ) -> None:
        self.conversation_repo.add_message(
            conversation_id,
            user_id,
            "assistant",
            answer,
            run_id=run_id,
            sources=sources or [],
            artifacts=artifacts or [],
            metadata=metadata or {},
        )

    async def process_chat(
        self,
        query: str,
        company_id: str,
        user_id: int,
        conversation_id: str,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        self.conversation_repo.get_or_create_by_conversation_id(conversation_id, company_id, user_id)
        self._auto_title_conversation(conversation_id, query)
        self._save_user_message(conversation_id, user_id, query)

        history = self._load_history(conversation_id)

        attachment_ctx = ""
        try:
            from app.services.chat_attachment_service import build_attachment_context
            attachment_ctx = build_attachment_context(conversation_id, db=self.db)
        except Exception as e:
            logger.error("attachment_ctx_failed", error=str(e))

        effective_query = query
        if attachment_ctx:
            effective_query = (
                f"{query}\n\nContext from files you uploaded in this conversation "
                f"(temporary, chat-scoped; treat as authoritative for this request):\n{attachment_ctx}"
            )

        agent_run = AgentRun(
            run_id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            company_id=company_id,
            user_id=user_id,
            query=query,
            status=AgentRunStatus.RUNNING,
        )
        self.db.add(agent_run)
        self.db.commit()
        self.db.refresh(agent_run)

        try:
            verified = None
            async for event in run_agent(
                self.db,
                company_id,
                user_id,
                effective_query,
                conversation_id,
                history=history,
            ):
                event_type = event.get("event")

                if event_type == "plan_created":
                    self._save_steps(agent_run, event.get("steps", []))

                elif event_type in ["tool_started", "tool_completed"]:
                    self._update_step(agent_run, event)

                elif event_type == "artifact_created":
                    artifact = event.get("artifact", {})
                    artifacts = agent_run.artifacts_generated or []
                    artifacts.append(artifact)
                    agent_run.artifacts_generated = artifacts
                    self.db.commit()

                elif event_type == "run_completed":
                    agent_run.status = AgentRunStatus.COMPLETED
                    agent_run.completed_at = datetime.utcnow()
                    agent_run.model_used = event.get("model")
                    agent_run.tools_used = event.get("tools_used", [])
                    agent_run.documents_accessed = event.get("documents_accessed", [])

                    analysis = event.get("analysis") or {}
                    if isinstance(analysis, dict) and analysis.get("anomaly_detected"):
                        linked = self._ensure_anomaly_records(conversation_id, user_id, company_id, analysis)
                        if linked.get("project"):
                            analysis["linked_project"] = linked["project"]
                        if linked.get("approval"):
                            analysis["linked_approval"] = linked["approval"]
                        event["analysis"] = analysis

                    artifacts = agent_run.artifacts_generated or []
                    for art in event.get("artifacts", []):
                        if all(a.get("artifact_id") != art.get("artifact_id") for a in artifacts):
                            artifacts.append(art)
                    agent_run.artifacts_generated = artifacts
                    self.db.commit()
                    answer = event.get("answer")
                    if answer:
                        try:
                            self._save_assistant_message(
                                conversation_id,
                                user_id,
                                answer,
                                str(agent_run.run_id),
                                sources=event.get("evidence", []),
                                artifacts=artifacts,
                                metadata={
                                    "model": event.get("model"),
                                    "verified": event.get("verified", verified),
                                    "analysis": event.get("analysis"),
                                },
                            )
                        except Exception as msg_err:
                            logger.error("save_assistant_message_failed", error=str(msg_err))

                elif event_type == "verification_completed":
                    verified = event.get("verified")

                yield event

        except Exception as e:
            logger.error("chat_process_failed", error=str(e))
            agent_run.status = AgentRunStatus.FAILED
            agent_run.error_message = str(e)
            agent_run.completed_at = datetime.utcnow()
            self.db.commit()
            yield {"event": "run_failed", "error": str(e)}

    def _save_steps(self, agent_run: AgentRun, steps: list) -> None:
        for i, step_label in enumerate(steps):
            step = AgentStep(
                run_id=agent_run.id,
                step_index=i,
                label=step_label,
                status=AgentStepStatus.PENDING,
            )
            self.db.add(step)
        self.db.commit()

    def _update_step(self, agent_run: AgentRun, event: Dict[str, Any]) -> None:
        step_index = event.get("step_index")
        if step_index is None:
            return

        step = self.db.query(AgentStep).filter(
            AgentStep.run_id == agent_run.id,
            AgentStep.step_index == step_index,
        ).first()

        if step:
            if event.get("event") == "tool_started":
                step.status = AgentStepStatus.RUNNING
                step.started_at = datetime.utcnow()
            elif event.get("event") == "tool_completed":
                step.status = AgentStepStatus.COMPLETED if event.get("success", True) else AgentStepStatus.FAILED
                step.output_data = event.get("output", {})
                step.duration_ms = event.get("duration_ms", 0)
                step.error = event.get("error")
                step.completed_at = datetime.utcnow()
            self.db.commit()