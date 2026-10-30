import os
import difflib
import uuid
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from pathlib import Path

from app.db.models import Artifact, ArtifactStatus, ArtifactType, DocumentClassification, Project
from app.services.file_document_generator import render_document, parse_artifact_text
from app.core.config import settings
from app.core.logging import get_logger
from app.core.exceptions import WorkbenchException

logger = get_logger(__name__)

ARTIFACT_DIR = str(Path(__file__).resolve().parent.parent.parent / "artifacts")
os.makedirs(ARTIFACT_DIR, exist_ok=True)


class ArtifactVersionService:
    def __init__(self, db: Session):
        self.db = db

    def get_version_history(self, artifact_id: str) -> List[Artifact]:
        """
        Retrieves the complete version history chain for an artifact.
        Traces back to the root parent, then finds all descendants.
        """
        current = self.db.query(Artifact).filter(Artifact.artifact_id == artifact_id).first()
        if not current:
            return []

        # Find the root artifact
        root = current
        visited = set()
        while root.parent_artifact_id and root.artifact_id not in visited:
            visited.add(root.artifact_id)
            parent = self.db.query(Artifact).filter(Artifact.artifact_id == root.parent_artifact_id).first()
            if not parent:
                break
            root = parent

        # Collect all descendants from root
        all_versions = [root]
        pending = [root.artifact_id]
        while pending:
            curr_id = pending.pop(0)
            children = self.db.query(Artifact).filter(Artifact.parent_artifact_id == curr_id).all()
            for child in children:
                if child.id not in [v.id for v in all_versions]:
                    all_versions.append(child)
                    pending.append(child.artifact_id)

        all_versions.sort(key=lambda a: a.version)
        return all_versions

    def create_version(
        self,
        parent_artifact_id: str,
        updated_data: Dict[str, Any],
        user_id: int,
        template: Optional[str] = None,
        custom_name: Optional[str] = None,
    ) -> Artifact:
        """
        Creates a new version of an existing artifact by applying updated content
        and preserving the immutable parent record.
        """
        parent = self.db.query(Artifact).filter(Artifact.artifact_id == parent_artifact_id).first()
        if not parent:
            raise WorkbenchException("Parent artifact not found.", status_code=404)

        new_version = (parent.version or 1) + 1
        new_artifact_id = str(uuid.uuid4())
        ext = parent.artifact_type.value.lower() if hasattr(parent.artifact_type, "value") else str(parent.artifact_type).lower()

        tpl = template or "technical_review"
        if not template:
            # Infer template from name or default
            name_lower = (parent.name or "").lower()
            if "approval" in name_lower:
                tpl = "approval_note"
            elif "inspection" in name_lower:
                tpl = "inspection_report"
            elif "sop" in name_lower:
                tpl = "standard_operating_procedure"
            elif "ecr" in name_lower or "change" in name_lower:
                tpl = "engineering_change_request"
            elif "rca" in name_lower or "root" in name_lower:
                tpl = "root_cause_analysis"
            elif "work_order" in name_lower:
                tpl = "work_order_summary"

        new_file_name = f"{new_artifact_id}_v{new_version}.{ext}"
        new_file_path = os.path.join(ARTIFACT_DIR, new_file_name)

        try:
            rendered_bytes = render_document(tpl, ext, updated_data)
            with open(new_file_path, "wb") as f:
                f.write(rendered_bytes)
        except Exception as e:
            logger.error("version_rendering_failed", error=str(e), parent_id=parent_artifact_id)
            raise WorkbenchException(f"Failed to render artifact version {new_version}: {str(e)}", status_code=500)

        name = custom_name or f"{parent.name} (v{new_version})"

        new_artifact = Artifact(
            artifact_id=new_artifact_id,
            company_id=parent.company_id,
            project_id=parent.project_id,
            name=name,
            artifact_type=parent.artifact_type,
            file_path=new_file_path,
            status=ArtifactStatus.DRAFT,
            classification=parent.classification,
            created_by=user_id,
            version=new_version,
            parent_artifact_id=parent.artifact_id,
            sources=parent.sources,
            ai_provenance={"previous_version_id": parent.artifact_id, "version": new_version},
        )
        self.db.add(new_artifact)
        self.db.commit()
        self.db.refresh(new_artifact)

        logger.info(
            "artifact_version_created",
            artifact_id=new_artifact_id,
            parent_id=parent.artifact_id,
            version=new_version,
        )
        return new_artifact

    def diff_artifacts(self, artifact_id_a: str, artifact_id_b: str) -> Dict[str, Any]:
        """
        Computes line-by-line unified diff between two artifacts.
        """
        art_a = self.db.query(Artifact).filter(Artifact.artifact_id == artifact_id_a).first()
        art_b = self.db.query(Artifact).filter(Artifact.artifact_id == artifact_id_b).first()

        if not art_a or not art_b:
            raise WorkbenchException("One or both artifacts not found for comparison.", status_code=404)

        text_a = parse_artifact_text(art_a.file_path, art_a.artifact_type)
        text_b = parse_artifact_text(art_b.file_path, art_b.artifact_type)

        lines_a = text_a.splitlines(keepends=True)
        lines_b = text_b.splitlines(keepends=True)

        diff = difflib.unified_diff(
            lines_a,
            lines_b,
            fromfile=f"{art_a.name} (v{art_a.version})",
            tofile=f"{art_b.name} (v{art_b.version})",
        )
        diff_text = "".join(diff)

        added = sum(1 for l in diff_text.splitlines() if l.startswith("+") and not l.startswith("+++"))
        removed = sum(1 for l in diff_text.splitlines() if l.startswith("-") and not l.startswith("---"))

        return {
            "artifact_a": {
                "artifact_id": art_a.artifact_id,
                "name": art_a.name,
                "version": art_a.version,
            },
            "artifact_b": {
                "artifact_id": art_b.artifact_id,
                "name": art_b.name,
                "version": art_b.version,
            },
            "unified_diff": diff_text,
            "lines_added": added,
            "lines_removed": removed,
        }

