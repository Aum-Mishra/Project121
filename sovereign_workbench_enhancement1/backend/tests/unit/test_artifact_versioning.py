import pytest
import os
import tempfile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.database import Base
from app.db.models import Artifact, ArtifactType, ArtifactStatus, DocumentClassification
from app.services.artifact_version_service import ArtifactVersionService
from app.services.file_document_generator import render_document, parse_artifact_text


@pytest.fixture
def memory_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


class TestArtifactVersioning:
    def test_version_chain_creation_and_diff(self, memory_db, tmp_path):
        # 1. Create a dummy parent artifact (v1)
        v1_path = tmp_path / "art_v1.txt"
        v1_path.write_text("Title: Inspection P-102\nFinding: Minor wear\nRisk: Low\n")

        v1 = Artifact(
            artifact_id="art-test-001",
            company_id="test_co",
            name="P-102 Review",
            artifact_type=ArtifactType.TXT,
            file_path=str(v1_path),
            status=ArtifactStatus.APPROVED,
            classification=DocumentClassification.CONFIDENTIAL,
            created_by=1,
            version=1,
        )
        memory_db.add(v1)
        memory_db.commit()

        service = ArtifactVersionService(memory_db)
        history_v1 = service.get_version_history("art-test-001")
        assert len(history_v1) == 1
        assert history_v1[0].version == 1

        # 2. Create a dummy child artifact (v2)
        v2_path = tmp_path / "art_v2.txt"
        v2_path.write_text("Title: Inspection P-102\nFinding: Severe cavitation wear\nRisk: High\nRecommendation: Immediate shutdown\n")

        v2 = Artifact(
            artifact_id="art-test-002",
            company_id="test_co",
            name="P-102 Review (v2)",
            artifact_type=ArtifactType.TXT,
            file_path=str(v2_path),
            status=ArtifactStatus.DRAFT,
            classification=DocumentClassification.CONFIDENTIAL,
            created_by=1,
            version=2,
            parent_artifact_id="art-test-001",
        )
        memory_db.add(v2)
        memory_db.commit()

        # 3. Test version history retrieves both versions in order
        history_v2 = service.get_version_history("art-test-002")
        assert len(history_v2) == 2
        assert history_v2[0].version == 1
        assert history_v2[1].version == 2

        # 4. Test diffing between v1 and v2
        diff_res = service.diff_artifacts("art-test-001", "art-test-002")
        assert "unified_diff" in diff_res
        assert diff_res["lines_added"] > 0
        assert diff_res["lines_removed"] > 0
        assert "Severe cavitation wear" in diff_res["unified_diff"]

