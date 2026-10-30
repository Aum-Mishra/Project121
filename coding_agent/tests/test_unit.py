"""Unit tests for the isolated Coding Agent backend core modules."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

os.environ.setdefault("OPENHANDS_SUPPRESS_BANNER", "1")

from app import security  # noqa: E402
from app.engine import _extract_json  # noqa: E402
from app.workspace import Workspace, WorkspaceManager, WorkspaceError  # noqa: E402
from app.sandbox import Sandbox  # noqa: E402


# --- security / command policy --------------------------------------------

def test_safe_path_validation():
    root = Path("/tmp/ca_test/root")
    rooted, rel = security.safe_relative_path(root, "src/main.py")
    assert rel == "src/main.py"
    assert str(rooted).startswith(str(root))


def test_path_escape_stripped_within_root():
    # '../' and leading '/' are stripped so the path can never escape root.
    root = Path("/tmp/ca_test/root")
    rooted, rel = security.safe_relative_path(root, "../../etc/passwd")
    assert rel == "etc/passwd"
    assert security.is_within(root, rel)


def test_is_within():
    root = Path("/tmp/ca_test/root").resolve()
    assert security.is_within(root, Path("sub/file"))
    assert security.is_within(root, Path("../root_sub_only_check")) is False


def test_command_classification_safe():
    for c in ["ls -la", "python3 test.py", "git status", "cd src && make", "grep foo bar.txt"]:
        assert security.CommandPolicy.classify(c) == "safe", c


def test_command_classification_approval():
    for c in ["pip install requests", "curl http://x", "git push origin main", "chmod 777 file"]:
        assert security.CommandPolicy.classify(c) in ("approval", "network", "package_install"), c


def test_command_classification_blocked():
    assert security.CommandPolicy.classify("rm -rf /") == "blocked"
    assert security.CommandPolicy.classify("mkfs /dev/sda1") == "blocked"


# --- engine JSON extraction ----------------------------------------------

def test_extract_json_plain():
    assert _extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_with_fence():
    assert _extract_json('```json\n{"files": {"x.py": "print(1)"}}\n```') == {"files": {"x.py": "print(1)"}}


def test_extract_json_embedded():
    text = 'Here you go:\n{"title": "t", "ok": true, "n": [1,2]}'
    assert _extract_json(text) == {"title": "t", "ok": True, "n": [1, 2]}


def test_extract_json_nested_strings():
    text = '{"files": {"a.py": "print(\\"hi{}\\")"}}'
    obj = _extract_json(text)
    assert obj["files"]["a.py"] == 'print("hi{}")'


# --- workspace ------------------------------------------------------------

def test_workspace_manager_creates_project(tmp_path):
    wm = WorkspaceManager(tmp_path)
    ws = wm.new_project("demo project")
    assert ws.root.exists()
    assert (ws.root / ".git").exists()


def test_workspace_manager_rejects_outside(tmp_path):
    wm = WorkspaceManager(tmp_path)
    try:
        wm.existing("/etc")
        assert False, "should reject absolute outside path"
    except WorkspaceError:
        pass


def test_workspace_list_files(tmp_path):
    wm = WorkspaceManager(tmp_path)
    ws = wm.new_project("proj")
    (ws.root / "a.py").write_text("x")
    (ws.root / "sub").mkdir()
    (ws.root / "sub" / "b.py").write_text("y")
    names = [f["path"] for f in ws.list_files()]
    assert "a.py" in names
    assert "sub/b.py" in names


# --- sandbox --------------------------------------------------------------

def test_sandbox_runs_command(tmp_path):
    s = Sandbox(str(tmp_path))
    r = s.run("echo hello")
    assert r.ok
    assert "hello" in r.stdout


def test_sandbox_python_normalized(tmp_path):
    s = Sandbox(str(tmp_path))
    r = s.run("python -c 'print(1)'")
    assert r.ok, r.summary()


def test_sandbox_timeout(tmp_path):
    s = Sandbox(str(tmp_path), timeout=1)
    r = s.run("sleep 5")
    assert r.timed_out


def test_sandbox_python_runs_script(tmp_path):
    (tmp_path / "hello.py").write_text("print('hi from script')")
    s = Sandbox(str(tmp_path))
    r = s.run("python hello.py")
    assert r.ok
    assert "hi from script" in r.stdout