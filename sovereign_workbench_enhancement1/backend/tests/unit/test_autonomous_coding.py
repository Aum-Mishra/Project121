import pytest
from pathlib import Path
from app.services.autonomous_coding_service import AutonomousCodingService
from app.core.exceptions import WorkbenchException


class TestAutonomousCodingService:
    def test_project_tree_traversal(self, tmp_path):
        # Setup mock project structure
        src = tmp_path / "src"
        src.mkdir()
        (src / "main.py").write_text("print('hello')", encoding="utf-8")
        (tmp_path / "README.md").write_text("# Project", encoding="utf-8")

        service = AutonomousCodingService()
        tree = service.get_project_tree(str(tmp_path), max_depth=3)
        assert tree["name"] == tmp_path.name
        assert tree["is_dir"] is True
        names = [c["name"] for c in tree["children"]]
        assert "src" in names
        assert "README.md" in names

    def test_safe_file_reading_prevents_path_traversal(self, tmp_path):
        service = AutonomousCodingService()
        sub = tmp_path / "sub"
        sub.mkdir()
        (sub / "code.py").write_text("a = 10", encoding="utf-8")

        # Valid read
        content = service.read_file_safely(str(tmp_path), "sub/code.py")
        assert content == "a = 10"

        # Traversal attempt
        with pytest.raises(WorkbenchException) as exc_info:
            service.read_file_safely(str(sub), "../README.md")
        assert exc_info.value.status_code == 403

    def test_checkpoint_and_rollback(self, tmp_path):
        service = AutonomousCodingService()
        test_file = tmp_path / "app.py"
        test_file.write_text("version = 1\n", encoding="utf-8")

        # 1. Create checkpoint
        chk = service.create_checkpoint(str(tmp_path), label="Initial v1")
        chk_id = chk["checkpoint_id"]
        assert chk_id.startswith("chk_")

        # 2. Modify file
        test_file.write_text("version = 2\ncorrupted = True\n", encoding="utf-8")
        assert "version = 2" in test_file.read_text(encoding="utf-8")

        # 3. Rollback checkpoint
        success = service.rollback_checkpoint(str(tmp_path), chk_id)
        assert success is True
        assert test_file.read_text(encoding="utf-8") == "version = 1\n"

    def test_diff_computation(self):
        service = AutonomousCodingService()
        orig = "def calc():\n    return 10\n"
        mod = "def calc():\n    # updated\n    return 20\n"
        diff_res = service.compute_diff(orig, mod, "calc.py")
        assert diff_res["has_changes"] is True
        assert diff_res["lines_added"] >= 2
        assert diff_res["lines_removed"] >= 1

