import os
import shutil
import difflib
import uuid
import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from app.tools.code_executor import CodeExecutorTool
from app.llm.ollama_client import ollama_client
from app.llm.router import model_router
from app.core.logging import get_logger
from app.core.exceptions import WorkbenchException

logger = get_logger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
CHECKPOINT_DIR = BACKEND_DIR / "data" / "checkpoints"
CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)

CODE_FENCE = re.compile(r"```(?:python)?\s*\n(.*?)```", re.DOTALL)


class AutonomousCodingService:
    def __init__(self):
        self.executor = CodeExecutorTool()

    def get_project_tree(self, root_dir: str, max_depth: int = 4) -> Dict[str, Any]:
        """
        Recursively inspects project directory structure while respecting max_depth
        and ignoring build artifacts / virtual environments.
        """
        root = Path(root_dir).resolve()
        if not root.exists() or not root.is_dir():
            raise WorkbenchException(f"Invalid project directory: {root_dir}", status_code=400)

        ignore_dirs = {
            ".git", "__pycache__", "node_modules", ".pytest_cache",
            "venv", "venv-win", "dist", "build", ".idea", ".vscode"
        }

        def _traverse(current: Path, depth: int) -> Dict[str, Any]:
            node: Dict[str, Any] = {
                "name": current.name,
                "path": str(current.relative_to(root)).replace("\\", "/"),
                "is_dir": current.is_dir(),
            }
            if current.is_file():
                node["size_bytes"] = current.stat().st_size
                return node

            if depth >= max_depth:
                node["children"] = []
                return node

            children = []
            try:
                for item in sorted(current.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
                    if item.name in ignore_dirs:
                        continue
                    children.append(_traverse(item, depth + 1))
            except PermissionError:
                pass

            node["children"] = children
            return node

        return _traverse(root, 0)

    def read_file_safely(self, root_dir: str, rel_path: str) -> str:
        root = Path(root_dir).resolve()
        target = (root / rel_path).resolve()
        if not str(target).startswith(str(root)):
            raise WorkbenchException("Access Denied: Path traversal detected.", status_code=403)
        if not target.exists() or not target.is_file():
            raise WorkbenchException(f"File not found: {rel_path}", status_code=404)

        try:
            with open(target, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        except Exception as e:
            raise WorkbenchException(f"Failed to read file: {str(e)}", status_code=500)

    def create_checkpoint(self, project_path: str, label: str = "Pre-modification snapshot") -> Dict[str, Any]:
        """
        Creates an immutable snapshot of project files for instant rollback.
        """
        root = Path(project_path).resolve()
        if not root.exists():
            raise WorkbenchException("Project path does not exist", status_code=400)

        checkpoint_id = f"chk_{uuid.uuid4().hex[:12]}"
        dest_dir = CHECKPOINT_DIR / checkpoint_id
        dest_dir.mkdir(parents=True, exist_ok=True)

        ignore = shutil.ignore_patterns(
            "*.pyc", "__pycache__", ".git", "node_modules", "venv*", ".pytest_cache"
        )
        shutil.copytree(str(root), str(dest_dir / "files"), ignore=ignore, dirs_exist_ok=True)

        meta = {
            "checkpoint_id": checkpoint_id,
            "project_path": str(root),
            "label": label,
            "timestamp": str(Path(dest_dir).stat().st_mtime),
        }
        with open(dest_dir / "meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        return meta

    def rollback_checkpoint(self, project_path: str, checkpoint_id: str) -> bool:
        """
        Rolls back the project directory to the state saved in the checkpoint.
        """
        src_dir = CHECKPOINT_DIR / checkpoint_id / "files"
        if not src_dir.exists():
            raise WorkbenchException(f"Checkpoint not found: {checkpoint_id}", status_code=404)

        target_dir = Path(project_path).resolve()
        # Copy snapshot files back
        shutil.copytree(str(src_dir), str(target_dir), dirs_exist_ok=True)
        return True

    def compute_diff(self, original_text: str, modified_text: str, filename: str) -> Dict[str, Any]:
        lines_orig = original_text.splitlines(keepends=True)
        lines_mod = modified_text.splitlines(keepends=True)
        diff = difflib.unified_diff(lines_orig, lines_mod, fromfile=f"a/{filename}", tofile=f"b/{filename}")
        diff_str = "".join(diff)
        return {
            "diff": diff_str,
            "has_changes": bool(diff_str.strip()),
            "lines_added": sum(1 for l in diff_str.splitlines() if l.startswith("+") and not l.startswith("+++")),
            "lines_removed": sum(1 for l in diff_str.splitlines() if l.startswith("-") and not l.startswith("---")),
        }

    async def execute_debug_loop(
        self,
        task_prompt: str,
        initial_code: str,
        timeout: int = 30,
        max_iterations: int = 4,
    ) -> Dict[str, Any]:
        """
        Self-Healing Autonomous Debug Loop:
        ANALYZE -> PLAN -> EXECUTE -> TEST -> ERROR? -> DIAGNOSE -> FIX -> RETEST -> VERIFY
        Repeats automatically up to max_iterations.
        """
        model = model_router.pick("coding")
        history_steps: List[Dict[str, Any]] = []
        current_code = initial_code
        iteration = 0
        success = False

        while iteration < max_iterations:
            iteration += 1
            step_record: Dict[str, Any] = {
                "iteration": iteration,
                "code": current_code,
            }

            # 1. Execute code in isolated sandbox
            exec_result = await self.executor.execute(
                {"code": current_code, "timeout": timeout, "language": "python"},
                context={},
            )

            stdout = exec_result.data.get("stdout", "") if exec_result.data else ""
            stderr = exec_result.data.get("stderr", "") if exec_result.data else ""
            ret_code = exec_result.data.get("return_code", -1) if exec_result.data else -1

            step_record["stdout"] = stdout
            step_record["stderr"] = stderr
            step_record["return_code"] = ret_code
            step_record["success"] = exec_result.success and ret_code == 0

            # If successful with 0 exit code, break!
            if exec_result.success and ret_code == 0:
                step_record["action"] = "VERIFIED_PASS"
                history_steps.append(step_record)
                success = True
                break

            # Error detected -> Diagnose and auto-fix
            error_details = stderr or exec_result.error or f"Exited with non-zero code {ret_code}"
            step_record["action"] = "DIAGNOSE_AND_FIX"
            step_record["error_diagnosed"] = error_details

            if iteration >= max_iterations:
                history_steps.append(step_record)
                break

            # Prompt LLM to diagnose and generate fixed code
            fix_prompt = f"""You are an autonomous debugging agent for an on-premise industrial AI workbench.
The following Python script was executed to solve this task:
Task: {task_prompt}

Current Code:
```python
{current_code}
```

Execution failed with Error / Stderr:
{error_details}

Output received:
{stdout}

Analyze the root cause and produce the complete corrected Python 3 script.
Requirements:
- Fix the error completely.
- Use only standard library modules.
- Ensure proper output is printed.
- Respond with ONLY the corrected code inside a ```python ``` fenced code block. No conversational filler."""

            try:
                resp = await ollama_client.generate(
                    model=model,
                    prompt=fix_prompt,
                    options={"temperature": 0.1},
                )
                response_text = resp.get("response", "")
                match = CODE_FENCE.search(response_text)
                new_code = match.group(1).strip() if match else response_text.strip()
                step_record["fix_explanation"] = "Generated corrected code block"
                current_code = new_code
            except Exception as e:
                step_record["fix_error"] = str(e)
                history_steps.append(step_record)
                break

            history_steps.append(step_record)

        return {
            "success": success,
            "final_code": current_code,
            "total_iterations": iteration,
            "steps": history_steps,
            "model_used": model,
        }


autonomous_coding_service = AutonomousCodingService()

