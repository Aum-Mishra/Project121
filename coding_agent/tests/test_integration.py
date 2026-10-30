"""Integration tests against the live isolated Coding Agent server (port 8002).

These require the backend to be running (`backend/run.sh`). They are best-run
selectively because they make real local LLM calls that take seconds each.
"""
import time
import urllib.request
import json

BASE = "http://localhost:8002"


def _req(method, path, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _wait_done(task_id, timeout=300, interval=3):
    deadline = time.time() + timeout
    while time.time() < deadline:
        d = _req("GET", f"/api/tasks/{task_id}", timeout=30)
        if d["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
            return d
        time.sleep(interval)
    raise TimeoutError(f"task {task_id} did not finish in {timeout}s")


def test_health():
    d = _req("GET", "/api/health")
    assert d["status"] == "healthy"


def test_models_ready():
    d = _req("GET", "/api/models")
    assert "qwen2.5-coder:7b" in d["models"]


def test_workspaces_list_and_inspect():
    ws = _req("GET", "/api/workspaces")
    assert isinstance(ws["workspaces"], list)


def test_generate_flow_completes():
    t = _req("POST", "/api/tasks/generate", {
        "message": "Write a Python file hello.py that prints 'hello isolated'.",
        "title": "hello",
    })
    d = _wait_done(t["task_id"], timeout=300)
    assert d["status"] == "COMPLETED"
    assert d["verdict"] in ("IMPLEMENTED", "TESTED")
    assert d["authorized_root"]
    # download
    data = urllib.request.urlopen(f"{BASE}/api/tasks/{t['task_id']}/download", timeout=30).read()
    assert data[:2] == b"PK"  # zip magic


def test_new_project_flow_tested():
    t = _req("POST", "/api/tasks/new-project", {
        "message": "Project with add.py (def add(a,b): return a+b) and test_add.py asserting add(2,3)==5.",
        "project_name": "iproj",
    })
    d = _wait_done(t["task_id"], timeout=420)
    assert d["status"] == "COMPLETED"
    assert d["verdict"] == "TESTED"
    assert d["test_results"], "expected at least one test result"
    assert any(r["passed"] for r in d["test_results"])


def test_existing_project_edits_and_tests():
    t = _req("POST", "/api/tasks/existing-project", {
        "message": "Make a file util.py defining double(x)=x*2 and a test_double.py checking double(4)==8.",
        "folder_name": "legacy-app",
    })
    d = _wait_done(t["task_id"], timeout=420)
    assert d["status"] == "COMPLETED"
    assert any(c["path"] == "util.py" for c in d["file_changes"])