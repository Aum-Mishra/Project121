"""Workspace management: open an existing folder for modification, or create a
fresh project folder for generation. All workspace paths are strictly confined
under the configured coding root.
"""
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
import subprocess

from app.config import settings
from app import security


class WorkspaceError(Exception):
    pass


class Workspace:
    def __init__(self, root: Path):
        self.root = root

    @property
    def name(self) -> str:
        return self.root.name

    def init_git_if_absent(self) -> bool:
        if (self.root / ".git").exists():
            return False
        self.run_git(["init"])
        return True

    def run_git(self, args) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", *args],
            cwd=str(self.root),
            capture_output=True,
            text=True,
            timeout=60,
        )

    def git_status(self) -> dict:
        status = self.run_git(["status", "--short"])
        branch = self.run_git(["rev-parse", "--abbrev-ref", "HEAD"])
        return {
            "branch": branch.stdout.strip() if branch.returncode == 0 else None,
            "changes": status.stdout.strip(),
        }

    def git_diff(self) -> str:
        diff = self.run_git(["diff"])
        return diff.stdout

    def list_files(self, max_depth: int = 3) -> list:
        items = []
        skip = {"node_modules", ".git", "__pycache__", ".venv", "venv", ".next", "dist", "build", ".cache"}
        for base, dirs, files in os.walk(self.root):
            rel = Path(base).relative_to(self.root)
            dirs[:] = [d for d in dirs if d not in skip]
            if len(rel.parts) > max_depth:
                dirs[:] = []
                continue
            for f in sorted(files):
                fpath = Path(base) / f
                try:
                    size = fpath.stat().st_size
                except OSError:
                    size = 0
                items.append({"path": (rel / f).as_posix(), "size": size})
        return items

    def read_file(self, rel: str) -> str:
        """Return the decoded contents of a workspace file (UTF-8 safe)."""
        rooted, _ = security.safe_relative_path(self.root, rel)
        if not rooted.exists():
            raise WorkspaceError(f"File not found: {rel}")
        if not rooted.is_file():
            raise WorkspaceError(f"Not a file: {rel}")
        try:
            raw = rooted.read_bytes()
        except OSError as e:
            raise WorkspaceError(f"Cannot read {rel}: {e}")
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode("utf-8", errors="replace")

    def tree(self) -> str:
        self.init_git_if_absent()
        status = self.git_status()
        if not _has_tree_binary():
            files = self.list_files(max_depth=5)
            lines = ["."]
            for it in files:
                lines.append(it["path"])
            tree_txt = "\n".join(lines)
        else:
            r = subprocess.run(
                ["tree", "-L", "4", "-I", "node_modules|.git|__pycache__|.venv|dist|build"],
                cwd=str(self.root), capture_output=True, text=True, timeout=60,
            )
            tree_txt = r.stdout if r.returncode == 0 else ""
        return f"branch: {status['branch']}\n\n{tree_txt}"

    def tree_obj(self, max_depth: int = None) -> dict:
        """Return the full workspace as a nested directory tree for the file
        explorer (folders expandable, files clickable, kept in sync by the UI
        re-fetching after every create/delete/modify event)."""
        root_node = {
            "name": self.root.name or self.root.parent.name,
            "path": "",
            "type": "dir",
            "size": 0,
            "children": [],
        }
        skip = {"node_modules", ".git", "__pycache__", ".venv", "venv",
                ".next", "dist", "build", ".cache", ".pytest_cache", "target"}
        for base, dirs, files in os.walk(self.root):
            rel = Path(base).relative_to(self.root)
            if max_depth is not None and len(rel.parts) > max_depth:
                dirs[:] = []
                continue
            dirs[:] = sorted(d for d in dirs if d not in skip)

            # Walk down the tree, creating any missing directories.
            node = root_node
            acc = ""
            for part in rel.parts:
                acc = f"{acc}/{part}".lstrip("/")
                child = next(
                    (c for c in node["children"] if c["type"] == "dir" and c["name"] == part),
                    None,
                )
                if child is None:
                    child = {"name": part, "path": acc, "type": "dir",
                             "size": 0, "children": []}
                    node["children"].append(child)
                node = child

            for f in sorted(files):
                fpath = Path(base) / f
                try:
                    size = fpath.stat().st_size
                except OSError:
                    size = 0
                if any(part in skip for part in (rel / f).parts):
                    continue
                node["children"].append({
                    "name": f,
                    "path": (rel / f).as_posix(),
                    "type": "file",
                    "size": size,
                    "children": [],
                })
        root_node["children"].sort(
            key=lambda c: (c["type"] != "dir", c["name"].lower())
        )
        return root_node


def _has_tree_binary() -> bool:
    return shutil.which("tree") is not None


def coding_root() -> Path:
    root = settings.coding_root_dir
    root.mkdir(parents=True, exist_ok=True)
    return root


class WorkspaceManager:
    """Manages both 'existing project' (user-supplied root) and 'new project'
    (code-generated folder) workspaces."""
    def __init__(self, base: Optional[Path] = None):
        self.base = base or coding_root()

    def new_project(self, project_name: str, parent: Optional[Path] = None) -> Workspace:
        base = Path(parent) if parent is not None else self.base
        base = base.expanduser().resolve()
        if not base.is_dir():
            raise WorkspaceError(f"Storage location does not exist: {base}")
        safe = _slug(project_name) or f"project-{uuid.uuid4().hex[:8]}"
        ws_path = base / safe
        if ws_path.exists():
            ws_path = base / f"{safe}-{uuid.uuid4().hex[:6]}"
        ws_path.mkdir(parents=True, exist_ok=True)
        ws = Workspace(ws_path)
        ws.init_git_if_absent()
        return ws

    def open_anywhere(self, path: str) -> Workspace:
        """Open an arbitrary local folder the USER explicitly picked via the UI.

        This intentionally bypasses the coding-root confinement: the folder
        becomes the task's authorized root, and the existing sandbox/path
        security still confines all agent writes and commands to that root.
        """
        target = Path(path).expanduser().resolve()
        if not target.exists():
            raise WorkspaceError(f"Folder does not exist: {path}")
        if not target.is_dir():
            raise WorkspaceError(f"Not a directory: {path}")
        ws = Workspace(target)
        ws.init_git_if_absent()
        return ws

    def existing(self, folder_name: str) -> Workspace:
        """Open a subfolder under the coding root (typed by the user, e.g. the
        name of a folder they placed there, or an absolute path under root)."""
        raw = folder_name.strip()
        target = Path(raw)
        if not target.is_absolute():
            target = os.path.join(self.base, raw)
        target = Path(os.path.normpath(target))
        if not security.is_within(self.base, target):
            raise WorkspaceError(f"Cannot open {folder_name}: outside coding root {self.base}")
        if not target.exists():
            raise WorkspaceError(f"Folder does not exist: {folder_name}")
        if not target.is_dir():
            raise WorkspaceError(f"Not a directory: {folder_name}")
        ws = Workspace(target)
        ws.init_git_if_absent()
        return ws

    def list_projects(self) -> list:
        if not self.base.exists():
            return []
        return sorted(
            [{"name": p.name, "path": str(p)} for p in self.base.iterdir() if p.is_dir()],
            key=lambda x: x["name"],
        )

    def create_folder(self, folder_name: str) -> Workspace:
        safe = _slug(folder_name) or f"folder-{uuid.uuid4().hex[:6]}"
        target = self.base / safe
        if target.exists():
            raise WorkspaceError(f"Folder already exists: {folder_name}")
        target.mkdir(parents=True)
        ws = Workspace(target)
        ws.init_git_if_absent()
        return ws


def _slug(name: str) -> str:
    import re
    s = re.sub(r"[^A-Za-z0-9_.-]+", "-", name).strip("-")
    return s[:80]