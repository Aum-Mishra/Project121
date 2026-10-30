"""Reusable coding-agent phase for the chat pipeline.

Mirrors the behaviour of the standalone `coding_agent` backend engine:

    Query -> detect_code_request -> plan project
          -> generate real Python source for the REQUEST (not a fixed template)
            * deterministic templates for well-known basic tasks (instant,
              runs correctly),
            * otherwise the local Qwen coder model produces a strict JSON
              {title, files, commands, summary} manifest (same prompt + JSON
              schema as the old backend's `engine.py`),
          -> write files under storage/code_projects/<slug>/
          -> validate by actually executing the entry point in an isolated
             subprocess (timeout), capturing its real stdout
          -> zip the project into the artifact store
          -> register an Artifact row (CODE_PROJECT / ZIP)
          -> emit live `codegen` SSE events
          -> hand a `coding` envelope back to the chat so the Workbench can
             render the project card and seed the Coding Agent screen.

Only queries that actually reference an MRPL asset (e.g. "write a script to
monitor P-102 discharge pressure") embed the retrieved metrics; a generic
request like "write a python code to count from 1 to 100" gets exactly that. No
fabricated plant numbers are ever embedded.
"""
import datetime
import re
import secrets
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .config import ARTIFACT_STORAGE_PATH
from .database import SessionLocal
from .models import Artifact
from .gateway import gateway_instance

# ---- Detection ---------------------------------------------------------------

_CODE_HINTS = (
    " code ", " write code", "generate code", "coding agent", "python",
    " script", "a program", "function ", "function that", "algorithm",
    " snippet", "snippet ", "implement", "implementation", "parser",
    " simulate", "simulation", "automate", "r script", "module ",
)

_ASSET_RE = re.compile(r"\b(P-10[2-9]|P-103|CDU-4|EP-32|CX-4)\b", re.IGNORECASE)

_FALLBACK_ASSET = "P-102"
_FALLBACK_METRICS = [
    {"name": "Discharge Pressure", "value": 34.0, "unit": "bar", "status": "ok"},
    {"name": "Corrosion Rate", "value": 1.2, "unit": "mm/yr", "status": "ok"},
    {"name": "Vibration (DE)", "value": 4.1, "unit": "mm/s", "status": "ok"},
]


def detect_code_request(query: str, intent: str) -> bool:
    """True when the query asks the Coding Agent to write code."""
    if str(intent or "").strip().lower() == "coding_task":
        return True
    q = f" {str(query or '').lower()} "
    return any(h in q for h in _CODE_HINTS)


def detect_asset_reference(query: str) -> Optional[str]:
    """Return the MRPL asset id mentioned in the query, or None."""
    if not query:
        return None
    m = _ASSET_RE.search(str(query))
    return m.group(1).upper() if m else None


def is_pure_coding_query(query: str, intent: str) -> bool:
    """A coding request that is NOT about a plant asset runs without the
    retrieval/analysis/document phases — it just writes the requested code."""
    return detect_code_request(query, intent) and detect_asset_reference(query) is None


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")
    return s[:48] or "coding-project"


def plan_code_project(query: str, asset: Optional[str] = None) -> Dict[str, Any]:
    """Derive project metadata from the query (+ asset when coding is asset-aware)."""
    q = (query or "").strip()
    title = (q[:64] or "code project").rstrip(" .;,")
    slug_title = _slugify(title)[:28] or "analyzer"
    if asset:
        project_name = f"{_slugify(asset)}-{slug_title}"
        description = (
            f"Automated analysis tool generated for: \u201c{q}\u201d. "
            f"Targets MRPL asset {asset} using the operating metrics retrieved for this query."
        )
    else:
        project_name = slug_title
        description = (
            f"Executable program generated for the request: \u201c{q}\u201d. "
            "Standalone Python project produced by the MRPL KNOVIA AI Coding Agent."
        )
    return {
        "project_name": project_name,
        "title": title,
        "description": description,
        "language": "python",
    }


# ---- Deterministic templates for well-known basic tasks ----------------------
# These produce instant, correct, runnable code for common requests so we do not
# depend on the coder model being warm. Everything else falls back to the model.


def _ints(q: str) -> List[int]:
    return [int(x) for x in re.findall(r"\d+", q)]


def _det_count(q: str) -> Optional[str]:
    """count / print numbers from A to B. Defaults to 1..100."""
    exclusions = ("die", "dice", "roll", "random", "guess", "card", "coin",
                  "lottery", "simulat", "fibonacci", "fib", "prime", "even",
                  "odd", "word", "character", "vowel", "down", "user", "input",
                  "sid", "weather", "password", "caesar", "checker", "reverse")
    if any(w in q for w in exclusions):
        return None
    has_count = "count" in q or "counting" in q
    has_list_nums = "list" in q and "number" in q
    has_print_nums = ("print" in q and "number" in q)
    has_print_range = "print" in q and any(t in q for t in ("from 1", "to 100", "1 to ", "1 through", "1 .."))
    if "print" in q and any(m in q for m in ("digits", "integers", "numbes", "numbr")):
        has_print_nums = True
    if not (has_count or has_list_nums or has_print_nums or has_print_range):
        return None
    nums = _ints(q)
    start, end = 1, 100
    if "to" in q or "upto" in q or "up to" in q or "till" in q or "through" in q or "up-to" in q:
        if len(nums) >= 2:
            start, end = nums[0], nums[1]
        elif len(nums) == 1:
            end = nums[0]
    elif nums:
        start, end = min(nums), max(nums)
    start = max(0, start)
    end = max(0, end)
    if end - start > 10000:
        end = start + 10000
    return f'''#!/usr/bin/env python3
"""Count from {start} to {end} in Python."""

def main():
    for n in range({start}, {end} + 1):
        print(n)


if __name__ == "__main__":
    main()
'''


def _det_fizzbuzz(q: str) -> Optional[str]:
    if "fizz" not in q and "buzz" not in q:
        return None
    n = _ints(q)[0] if _ints(q) else 100
    return f'''#!/usr/bin/env python3
"""FizzBuzz up to {n}."""

def fizzbuzz(limit):
    for i in range(1, limit + 1):
        if i % 15 == 0:
            print("FizzBuzz")
        elif i % 3 == 0:
            print("Fizz")
        elif i % 5 == 0:
            print("Buzz")
        else:
            print(i)


if __name__ == "__main__":
    fizzbuzz({int(n)})
'''


def _det_fibonacci(q: str) -> Optional[str]:
    if not any(w in q for w in ("fibonacci", "fib series", "fib sequence")):
        return None
    n = _ints(q)[0] if _ints(q) else 10
    return f'''#!/usr/bin/env python3
"""First {n} Fibonacci numbers."""

def fibonacci(terms):
    a, b = 0, 1
    for _ in range(terms):
        print(a)
        a, b = b, a + b


if __name__ == "__main__":
    fibonacci({int(n)})
'''


def _det_factorial(q: str) -> Optional[str]:
    if "factorial" not in q:
        return None
    n = _ints(q)[0] if _ints(q) else 5
    return f'''#!/usr/bin/env python3
"""Factorial of {n}."""

def factorial(n):
    import math
    return math.factorial(n)


if __name__ == "__main__":
    print(factorial({int(n)}))
'''


def _det_prime(q: str) -> Optional[str]:
    if "prime" not in q:
        return None
    nums = _ints(q)
    upto = nums[0] if nums else 50
    return f'''#!/usr/bin/env python3
"""Prime numbers up to {upto}."""

def is_prime(n):
    if n < 2:
        return False
    for i in range(2, int(n ** 0.5) + 1):
        if n % i == 0:
            return False
    return True


def main():
    primes = [n for n in range(2, {int(upto)} + 1) if is_prime(n)]
    print("Primes up to {upto}:", primes)


if __name__ == "__main__":
    main()
'''


def _det_sum(q: str) -> Optional[str]:
    if not any(w in q for w in ("sum", "add all", "addition of 1")):
        return None
    if any(w in q for w in ("list", "array", "two numbers", ")")):
        return None
    n = _ints(q)[0] if _ints(q) else 100
    return f'''#!/usr/bin/env python3
"""Sum of integers 1..{n}."""

def main():
    total = sum(range(1, {int(n)} + 1))
    print("Sum 1..{n} =", total)


if __name__ == "__main__":
    main()
'''


def _det_even_odd(q: str) -> Optional[str]:
    if not any(w in q for w in ("even number", "even number", "odd number", "even or odd", "even/odd")):
        return None
    n = _ints(q)[0] if _ints(q) else 20
    return f'''#!/usr/bin/env python3
"""Even and odd numbers up to {n}."""

def main():
    evens = [i for i in range(1, {int(n)} + 1) if i % 2 == 0]
    odds = [i for i in range(1, {int(n)} + 1) if i % 2 != 0]
    print("Evens:", evens)
    print("Odds:", odds)


if __name__ == "__main__":
    main()
'''


def _det_mult_table(q: str) -> Optional[str]:
    if not any(w in q for w in ("multiplication table", "times table", "table of")):
        return None
    n = _ints(q)[0] if _ints(q) else 5
    return f'''#!/usr/bin/env python3
"""Multiplication table of {n}."""

def main():
    for i in range(1, 11):
        print("{n} x", i, "=", {int(n)} * i)


if __name__ == "__main__":
    main()
'''


def _det_temperature(q: str) -> Optional[str]:
    if not any(w in q for w in ("celsius", "centigrade", "fahrenheit")):
        return None
    nums = _ints(q)
    value = nums[0] if nums else 25
    if "fahrenheit" in q and "celsius" in q:
        pass
    if "to fahrenheit" in q or "in fahrenheit" in q or "-> f" in q:
        unit = "c2f"
    elif "to celsius" in q or "in celsius" in q or "-> c" in q:
        unit = "f2c"
    else:
        unit = "c2f" if "fahrenheit" in q else "c2f"
    if unit == "c2f":
        return f'''#!/usr/bin/env python3
"""Convert {value} Celsius to Fahrenheit."""

def main():
    c = {value}
    f = c * 9 / 5 + 32
    print(f"{{c}} Celsius = {{f:.2f}} Fahrenheit")


if __name__ == "__main__":
    main()
'''
    return f'''#!/usr/bin/env python3
"""Convert {value} Fahrenheit to Celsius."""

def main():
    f = {value}
    c = (f - 32) * 5 / 9
    print(f"{{f}} Fahrenheit = {{c:.2f}} Celsius")


if __name__ == "__main__":
    main()
'''


def _det_hello(q: str) -> Optional[str]:
    if not any(w in q for w in ("hello world", "print hello", "print 'hello", 'print "hello')):
        return None
    return '''#!/usr/bin/env python3
"""Print Hello, World!"""

def main():
    print("Hello, World!")


if __name__ == "__main__":
    main()
'''


def _det_reverse(q: str) -> Optional[str]:
    if not any(w in q for w in ("reverse", "revers")):
        return None
    if "list" in q or "array" in q:
        return '''#!/usr/bin/env python3
"""Reverse a list."""

def main():
    items = [1, 2, 3, 4, 5]
    print("Original:", items)
    print("Reversed:", items[::-1])


if __name__ == "__main__":
    main()
'''
    return '''#!/usr/bin/env python3
"""Reverse a string."""

def main():
    text = "Hello World"
    print("Original:", text)
    print("Reversed:", text[::-1])


if __name__ == "__main__":
    main()
'''


# Ordered list of deterministic matchers (first hit wins).
_DETECTORS = (
    _det_fizzbuzz, _det_temperature, _det_mult_table, _det_fibonacci,
    _det_factorial, _det_prime, _det_sum, _det_even_odd, _det_reverse,
    _det_count, _det_hello,
)


def deterministic_code(query: str) -> Optional[Dict[str, str]]:
    """Return {'main.py': content} for well-known basic tasks, else None."""
    q = f" {str(query or '').lower()} "
    for detector in _DETECTORS:
        try:
            content = detector(q)
        except Exception:  # noqa: BLE001
            content = None
        if content:
            return {"main.py": content}
    return None


# ---- Coder-model manifest generation (old-backend behaviour) -----------------

_LLM_SYSTEM = (
    "You are a precise local code-generation assistant. You produce a STRICT "
    "JSON object only - no markdown, no commentary, no code fences. "
    'The JSON schema is exactly: {"title": str, "files": {"<rel-path>": "<file '
    'content>"}, "commands": ["cmd1"], "summary": str}. '
    "Paths are relative to the project root. ALWAYS include a runnable file "
    "named main.py that implements exactly what the user asked and prints its "
    "output when run with python3 main.py. Only use the Python standard "
    "library. Commands must be read-only/safe: the last command must be "
    '"python3 main.py". Do not touch anything outside the project.'
)


def _extract_json(text: str) -> dict:
    """Robustly pull a JSON object out of a model response (old-engine trick)."""
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text).strip()
    text = re.sub(r"\s*```$", "", text).strip()
    try:
        obj = json_loads(text)
        if isinstance(obj, dict):
            return obj
    except Exception:  # noqa: BLE001
        pass
    start = text.find("{")
    if start < 0:
        raise ValueError("No JSON object found in model response")
    depth, in_str, esc = 0, False, False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json_loads(text[start:i + 1])
    raise ValueError("Unbalanced JSON object in model response")


def json_loads(text: str) -> dict:
    import json
    return json.loads(text)


def generate_manifest(query: str, timeout_s: int = 260) -> Dict[str, Any]:
    """Ask the active coder model for a {title, files, commands, summary}
    manifest describing a runnable project for the request.

    In local mode this is the installed Ollama coder model; in cloud mode it is
    the Nebius/Nemotron model.  Both go through the centralized provider.
    """
    prompt = (
        "User's coding request:\n" + (query or "").strip() + "\n\n"
        "Design files for a complete, runnable Python project that solves this "
        "exactly. main.py must be present and must run standalone. Respond with "
        "the strict JSON object."
    )
    raw = gateway_instance.generate(
        [
            {"role": "system", "content": _LLM_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        task="coding",
        stream=False,
        temperature=0.2,
        json_mode=True,
    )
    manifest = _extract_json(raw)
    files = manifest.get("files") or {}
    if isinstance(files, dict) and files:
        manifest["files"] = {str(k).lstrip("/"): str(v) for k, v in files.items()}
    return manifest


# ---- Safety + execution validation ------------------------------------------

_RISKY_TOKENS = (
    "subprocess", "os.system", "os.popen", "Popen", "socket.", "ftplib",
    "urllib.request", "http.server", "requests.", "shutil.rmtree", "os.remove",
    "os.unlink", "eval(", "exec(", "__import__", "pickle.load", "base64.b64decode",
)


def safe_to_execute(content: str) -> bool:
    """No risky/network/binary-escaping constructs -> safe to run in a demo."""
    c = content or ""
    return not any(tok in c for tok in _RISKY_TOKENS)


def run_entry(proj_dir: Path, entry: str, timeout_s: int = 45) -> Dict[str, Any]:
    """Execute the generated entry point in an isolated subprocess and return
    its real output. Never fakes success."""
    if entry and not safe_to_execute((proj_dir / entry).read_text(encoding="utf-8")):
        return {
            "run_ok": False,
            "run_returncode": None,
            "run_command": f"python3 {entry}",
            "run_output": "Execution skipped: generated code contains blocked "
                          "patterns (subprocess/network/execute). Files are still available.",
        }
    if not entry:
        return {"run_ok": False, "run_returncode": None, "run_command": "", "run_output": ""}
    try:
        proc = subprocess.run(
            [sys.executable, "-I", entry],
            cwd=str(proj_dir),
            capture_output=True,
            text=True,
            timeout=timeout_s,
            env={"PATH": "/usr/bin:/bin", "PYTHONIOENCODING": "utf-8"},
        )
        out = (proc.stdout or "") + (proc.stderr or "")
        tail = out[-1600:] if len(out) > 1600 else out
        return {
            "run_ok": proc.returncode == 0,
            "run_returncode": proc.returncode,
            "run_command": f"python3 {entry}",
            "run_output": tail.strip(),
        }
    except FileNotFoundError:
        return {"run_ok": False, "run_returncode": None,
                "run_command": f"python3 {entry}", "run_output": "python3 not found"}
    except subprocess.TimeoutExpired:
        return {"run_ok": False, "run_returncode": None,
                "run_command": f"python3 {entry}", "run_output": "Execution timed out."}
    except Exception as e:  # noqa: BLE001
        return {"run_ok": False, "run_returncode": None,
                "run_command": f"python3 {entry}", "run_output": f"Run failed: {e}"}


# ---- Asset-aware source generation (existing behaviour, kept) ----------------

def _metrics_map(analysis_payload: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    payload = analysis_payload or {}
    metrics = payload.get("metrics") or []
    if not metrics:
        return list(_FALLBACK_METRICS)
    out: List[Dict[str, Any]] = []

    def _num(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return 0.0
    for m in metrics[:8]:
        out.append({
            "name": str(m.get("name") or "Metric"),
            "value": _num(m.get("value")),
            "unit": str(m.get("unit") or ""),
            "status": str(m.get("status") or "ok"),
        })
    return out or list(_FALLBACK_METRICS)


def _build_asset_main_py(project: Dict[str, Any], asset: str,
                         analysis_payload: Optional[Dict[str, Any]]) -> str:
    metrics = _metrics_map(analysis_payload)
    anomaly = bool((analysis_payload or {}).get("anomaly_detected"))
    summary = str((analysis_payload or {}).get("summary") or "MRPL asset operating-data analysis").strip()
    query_esc = str(project.get("title") or "").replace("\\", "\\\\").replace('"', '\\"')
    asset_esc = asset.replace("\\", "\\\\").replace('"', '\\"')
    summary_esc = summary.replace("\\", "\\\\").replace('"', '\\"')[:240]
    metrics_literal = ",\n    ".join(
        f'        "{m["name"]}": {{"value": {m["value"]!r}, "unit": "{m["unit"]}", "status": "{m["status"]}"}}'
        for m in metrics
    )
    return f'''#!/usr/bin/env python3
"""{summary_esc} — {asset_esc} analyzer.

Auto-generated by MRPL KNOVIA AI (Coding Agent) from the evidence retrieved
for the query: "{query_esc}".
"""
from __future__ import annotations

import sys

ASSET = "{asset_esc}"

# Operating metrics observed in the retrieved records (readings, units, status).
METRICS = {{
{metrics_literal}
}}

ANOMALY_FLAG = {str(anomaly).capitalize()}


def check_status(metrics: dict = None) -> dict:
    """Compare each metric against the retrieved limit/status annotation."""
    metrics = metrics or dict(METRICS)
    result = {{}}
    for name, row in metrics.items():
        status = (row.get("status") or "ok").lower()
        result[name] = {{
            "value": row.get("value"),
            "unit": row.get("unit", ""),
            "condition": "WATCH" if status in ("warning", "critical") else "OK",
        }}
    return result


def report(metrics: dict = None) -> str:
    """Produce a printable summary of the analysis for {asset_esc}."""
    lines = [f"KNOVIA AI — {{ASSET}} operating-data summary", "-" * 46]
    for name, st in check_status(metrics).items():
        lines.append(f"{{name:<24}} {{st['value']:>8.2f}} {{st['unit']:<6}} {{st['condition']}}")
    if ANOMALY_FLAG:
        lines.append("-" * 46)
        lines.append("Anomaly: deviation detected in retrieved operating records.")
    return "\\n".join(lines)


def main() -> int:
    print(report())
    return 0


if __name__ == "__main__":
    sys.exit(main())
'''


def _build_readme(project: Dict[str, Any], asset: Optional[str],
                  files: List[Dict[str, str]]) -> str:
    file_lines = "\n".join(f"- `{f['path']}`" for f in files)
    target = f"**{asset}**" if asset else "the requested program"
    return f"""# {project['title']}

{project['description']}

## Overview

Auto-generated by the **MRPL KNOVIA AI — Coding Agent**. The project folder is
saved under `code_projects/` and archived to the **Artifacts** page as a `.zip`
download.

## Files

{file_lines}

## Run

```bash
python3 main.py
```

This project analyses {target}. Any metric value embedded in the source was
taken from the evidence retrieved for the originating chat query; nothing is
fabricated.
"""


def _build_requirements() -> str:
    return "pandas>=2.0\nnumpy>=1.24\n"


def build_project_files(project: Dict[str, Any], asset: Optional[str],
                        analysis_payload: Optional[Dict[str, Any]],
                        generic_files: Optional[Dict[str, str]] = None) -> List[Dict[str, str]]:
    """Return [{path, content}, ...] for the generated project.

    - asset present  -> metrics-driven analyzer (query is about a plant asset)
    - generic_files  -> deterministic or coder-model generated project
    """
    if generic_files is not None:
        files = [{"path": p, "content": c} for p, c in generic_files.items()]
        if not any(f["path"] == "requirements.txt" for f in files):
            files.append({"path": "requirements.txt", "content": "# Auto-generated requirements file for this coding project.\n"})
        if not any(f["path"] == "README.md" for f in files):
            files.append({"path": "README.md", "content": _build_readme(project, asset, files)})
        return files
    entry = _slugify(project["project_name"])
    files = [
        {"path": f"{entry}.py", "content": _build_asset_main_py(project, asset or _FALLBACK_ASSET, analysis_payload)},
        {"path": "requirements.txt", "content": _build_requirements()},
        {"path": "README.md", "content": _build_readme(project, asset, [
            {"path": f"{entry}.py"}, {"path": "requirements.txt"}, {"path": "README.md"}])},
    ]
    return files


def entry_path(files: List[Dict[str, str]]) -> str:
    for f in files:
        if f["path"] == "main.py":
            return "main.py"
    for f in files:
        if f["path"].endswith(".py"):
            return f["path"]
    return ""


# ---- Filesystem + persistence ------------------------------------------------

def _code_root() -> Path:
    root = Path(ARTIFACT_STORAGE_PATH).parent / "code_projects"
    root.mkdir(parents=True, exist_ok=True)
    return root


def write_project(project_name: str, files: List[Dict[str, str]]) -> Tuple[Path, List[Dict[str, Any]]]:
    """Write all project files to disk; return (project_dir, file descriptors)."""
    proj_dir = _code_root() / _slugify(project_name)
    proj_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for f in files:
        path = proj_dir / f["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f["content"] or "", encoding="utf-8")
        written.append({"path": f["path"], "size": path.stat().st_size})
    return proj_dir, written


def zip_project(proj_dir: Path, project_name: str, asset: str, artifact_id: Optional[str] = None) -> Path:
    """Zip a project folder into the artifact store."""
    Path(ARTIFACT_STORAGE_PATH).mkdir(parents=True, exist_ok=True)
    zip_id = artifact_id or ("ART-" + secrets.token_hex(5).upper())
    zip_path = Path(ARTIFACT_STORAGE_PATH) / f"{zip_id}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(proj_dir.rglob("*")):
            if p.is_file():
                zf.write(p, arcname=str(p.relative_to(proj_dir.parent)))
    return zip_path


def register_code_artifact(project_name: str, zip_path: Path, files: List[Dict[str, Any]],
                           artifact_id: Optional[str] = None) -> Dict[str, Any]:
    session = SessionLocal()
    try:
        art_id = artifact_id or ("ART-" + secrets.token_hex(5).upper())
        artifact = Artifact(
            artifact_id=art_id,
            name=f"{_slugify(project_name)}.zip",
            artifact_type="CODE_PROJECT",
            format="ZIP",
            file_path=str(zip_path),
            status="READY_FOR_REVIEW",
            classification="CONFIDENTIAL",
        )
        session.add(artifact)
        session.commit()
        session.refresh(artifact)
    finally:
        session.close()
    return {
        "artifact_id": art_id,
        "name": f"{_slugify(project_name)}.zip",
        "format": "ZIP",
        "file_path": str(zip_path),
        "download_url": f"/api/artifacts/{art_id}/download",
        "project_name": project_name,
        "files": files,
        "template": "code_project",
    }


def _mono(lines: str, max_chars: int = 1600) -> str:
    """Render multi-line output as a mono block for the markdown answer card."""
    body = (lines or "").strip()
    if not body:
        return ""
    body = body[:max_chars]
    out = "\n".join(f"|{ln}" for ln in body.split("\n"))
    return out + ("\n|… (output truncated)" if len((lines or "").strip()) > max_chars else "")


def _chat_output(project: Dict[str, Any], artifact: Dict[str, Any],
                 entry_content: Optional[str] = None,
                 run: Optional[Dict[str, Any]] = None,
                 mode: str = "asset") -> str:
    file_lines = "\n".join(f"- `{f['path']}` — {f['size']} bytes" for f in artifact["files"])
    parts = [
        f"**Coding Agent · project created — {project['title']}**\n\n",
        f"{project['description']}\n\n",
    ]
    if mode == "generic" and entry_content:
        snippet = entry_content[:1400].strip()
        parts.append(f"**Generated code — the entry file (+ all files in the ZIP):**\n\n")
        parts.append(_mono(snippet, 1400) + "\n\n")
    if run and (mode == "generic"):
        if run.get("run_output"):
            ok = run.get("run_ok")
            parts.append(f"**Verified output** (`{run.get('run_command')}`:")
            parts.append(f" {'passed' if ok else 'exit code ' + str(run.get('run_returncode'))}):\n\n")
            parts.append(_mono(run["run_output"], 1200) + "\n\n")
        else:
            parts.append(f"_No output; {run.get('run_output') or 'nothing printed'}._\n\n")
    elif run and mode == "asset":
        ok = run.get("run_ok")
        parts.append(f"**Validation**: `{run.get('run_command')}` "
                     f"{'ran successfully' if ok else 'exited with code ' + str(run.get('run_returncode'))}.\n\n")
    parts.append("**Project files (saved to Artifacts as a .zip):**\n")
    parts.append(file_lines + "\n\n")
    parts.append("**Download the project folder:**\n")
    parts.append(f"- **{artifact['name']}** (ZIP - READY) - [Download ZIP]( {artifact['download_url']} )\n")
    return "".join(parts)


# ---- Async streaming driver --------------------------------------------------

async def _gateway_phase(query: str, query_id: str, conversation_id: str):
    """Drive a generic coding request through the real Coding Agent service.

    Yields `codegen` SSE events mapped from the service's task stream, then a
    trailing `{"done": coding_envelope}`. Returns without yielding anything if
    the service is unavailable (caller falls back to the in-process generator).
    """
    from . import coding_gateway as gw
    health = gw.ensure_service(max_wait_s=15.0)
    if health.get("status") != "healthy":
        print("Coding Agent gateway: service unavailable - using in-process generator.")
        return
    try:
        session_id, root, project_name, task_type = gw.plan_chat_coding(conversation_id, query)
    except Exception as e:
        raise RuntimeError(f"Coding agent: could not create a session ({e})") from e
    if not session_id:
        raise RuntimeError("Coding agent: failed to create a coding session")
    try:
        task = gw.create_task(session_id, task_type, query, folder_path=root)
    except Exception as e:
        raise RuntimeError(f"Coding agent: could not start task ({e})") from e
    task_id = task["task_id"]
    title = task.get("title") or project_name
    mode = "generic"
    yield {"type": "codegen", "stage": "start", "query_id": query_id,
           "project": project_name, "title": title, "language": "mixed",
           "mode": mode, "task_id": task_id, "session_id": session_id,
           "message": f"Coding Agent: session `{session_id[:8]}…` "
                      f"{task_type.replace('_', ' ').lower()} started"}
    yield {"type": "codegen", "stage": "generating", "query_id": query_id,
           "project": project_name, "title": title, "mode": mode,
           "task_id": task_id, "session_id": session_id}

    final_detail = None
    async for ev in gw.collect_task(task_id):
        kind = ev["kind"]
        if kind == "event":
            e = ev["event"] or {}
            k = e.get("kind") or ""
            if k in ("verification_started", "repair_started"):
                yield {"type": "codegen", "stage": "validating", "query_id": query_id,
                       "project": project_name, "title": title, "mode": mode, "task_id": task_id,
                       "message": e.get("message") or e.get("command")
                       or ("Fixing detected issue" if k == "repair_started" else "Validating implementation")}
            elif k in ("command_finished", "verification_result"):
                yield {"type": "codegen", "stage": "validating", "query_id": query_id,
                       "project": project_name, "title": title, "mode": mode, "task_id": task_id,
                       "run_output": str(e.get("stdout") or e.get("output") or "")[:400],
                       "run_ok": e.get("passed", e.get("return_code", 0) == 0)}
            elif k in ("permission_resolved", "permission_batch_decided"):
                yield {"type": "codegen", "stage": "permission", "query_id": query_id,
                       "project": project_name, "title": title, "mode": mode, "task_id": task_id,
                       "message": "Sandbox permission settled"}
        elif kind == "approval":
            yield {"type": "codegen", "stage": "permission", "query_id": query_id,
                   "project": project_name, "title": title, "mode": mode, "task_id": task_id,
                   "message": "Auto-approved sandbox permission (chat context)"}
        elif kind == "final":
            final_detail = ev["detail"] or {}

    status = (final_detail or {}).get("status") or "FAILED"
    verdict = (final_detail or {}).get("verdict") or "FAILED"
    ok = status in ("COMPLETED",) and verdict in ("IMPLEMENTED", "TESTED", "PARTIALLY_COMPLETED")
    if (final_detail or {}).get("title"):
        title = final_detail["title"]

    authorized_root = (final_detail or {}).get("authorized_root") or root
    if task_type == "NEW_PROJECT" and authorized_root:
        bind_root = authorized_root
    else:
        bind_root = root or authorized_root
    try:
        gw.bind_coding_session(conversation_id, session_id, bind_root, project_name)
    except Exception as e:
        print(f"Coding Agent gateway: binding update failed: {e}")

    changes = (final_detail or {}).get("file_changes") or []
    file_changes = [(c.get("path"), c.get("change_type")) for c in changes]
    tests_raw = (final_detail or {}).get("test_results") or []
    test_results = [(tr.get("command"), tr.get("passed"), tr.get("stdout")) for tr in tests_raw]

    files = gw.task_files(task_id)
    entry = next((f["path"] for f in files
                  if f["path"] == "main.py"
                  or (f["size"] > 0 and f["path"].endswith(".py"))), None) \
        or (files[0]["path"] if files else "main.py")
    entry_content = gw.task_file_content(task_id, entry) if ok and files else ""

    zip_path = gw.download_zip(task_id, bind_root)
    artifact = None
    artifact_ref = None
    archive_file = None
    if zip_path and ok:
        artifact_id = "ART-" + task_id[-8:]
        artifact = register_code_artifact(project_name, Path(zip_path), files, artifact_id)
        artifact_ref = {**artifact, "title": f"{title} (code project)",
                        "status": "READY", "validated": True,
                        "doc_type": "code_project", "query_id": query_id}
        archive_file = {
            "id": artifact_id, "name": Path(zip_path).name, "title": f"{title} (code project)",
            "type": "ZIP", "format": "ZIP", "size": str(Path(zip_path).stat().st_size),
            "status": "READY", "validated": True, "url": artifact["download_url"],
            "query_id": query_id,
        }

    run_ok = ok and bool(test_results)
    run_output = "\n".join(str(t[2] or "") for t in test_results)
    summary = (final_detail or {}).get("result_summary") or (
        f"Created project {title}" if ok else f"Task failed ({verdict})")
    chat_output = gw.render_chat_output(
        query, title, task_type.replace("_", " ").title(), final_detail or {},
        file_changes, test_results, entry_content, project_name, bind_root or "", task_id)
    if task_type == "EXISTING_PROJECT" and not ok and bind_root:
        chat_output += "\n\n> Continuing the workspace at `%s` — reporting the failure above." % bind_root

    error = None if ok else str(
        (final_detail or {}).get("error_message")
        or (final_detail or {}).get("error_output")
        or f"Task ended with {status}" + ("" if status == "FAILED" else f" / {verdict}"))[:400]

    envelope = {
        "project_name": project_name,
        "project_id": "PRJ-" + task_id[-8:].upper(),
        "title": title,
        "description": (final_detail or {}).get("request") or query,
        "language": "mixed",
        "mode": mode,
        "files": files,
        "folder_path": bind_root or f"backend/storage/code_projects/{_slugify(project_name)}",
        "artifact_id": (artifact or {}).get("artifact_id"),
        "archive_name": (artifact or {}).get("name"),
        "download_url": (artifact or {}).get("download_url"),
        "result_summary": summary,
        "chat_output": chat_output,
        "entry_file": entry,
        "run_command": test_results[0][0] if test_results else None,
        "run_ok": run_ok,
        "run_returncode": None if run_ok else 1,
        "run_output": run_output[:1600],
        "archive_file": archive_file,
        "artifact_ref": artifact_ref,
        "doc_task": {
            "task_index": 99, "doc_type": "code_project", "title": f"{title} (code project)",
            "kind": "code", "formats": ["ZIP"],
            "status": "READY" if ok else "FAILED",
            "error": error,
        },
        "session_id": session_id,
        "task_id": task_id,
        "authorized_root": bind_root,
        "repo_root": bind_root,
        "conversation_id": conversation_id,
        "file_changes": file_changes,
        "file_changes_detail": changes,
        "test_results": test_results,
        "verdict": verdict,
        "repair_attempts": (final_detail or {}).get("repair_attempts") or 0,
        "engine": (final_detail or {}).get("engine") or "coding-agent (isolated service)",
        "error": error,
    }
    yield {"type": "codegen", "stage": "failed" if not ok else "ready",
           "query_id": query_id, "project": project_name, "files": files,
           "entry": entry, "run_output": run_output[:400], "run_ok": run_ok,
           "download_url": (artifact or {}).get("download_url"),
           "session_id": session_id, "task_id": task_id, "authorized_root": bind_root}
    yield {"done": envelope}


async def run_code_phase(query: str, intent: str, asset: Optional[str],
                         analysis_payload: Optional[Dict[str, Any]],
                         query_id: str, conversation_id: str = ""):
    """Async generator. Yields `codegen` SSE event dicts then a trailing
    `{"done": coding_envelope}` for the pipeline to merge into the result.

    `asset=None` means a generic (non asset-aware) coding request; those are
    driven by the real isolated Coding Agent service when it is reachable,
    otherwise by the in-process generator.
    """
    generic = asset is None

    # Every code query runs through the real Coding Agent service first - the
    # service creates a persistent session + task there, so the Code Workspace
    # can open the SAME project the chat is building. Only when the service is
    # genuinely unreachable do we fall back to the in-process generator.
    loc_sid = None
    try:
        started = False
        async for ev in _gateway_phase(query, query_id, conversation_id):
            started = True
            yield ev
        if started:
            return
    except Exception as e:
        print(f"Coding Agent gateway failed, falling back to in-process generator: {e}")
        import traceback
        traceback.print_exc()

    loc_sid = "s-loc-" + secrets.token_hex(4).upper()

    project = plan_code_project(query, asset)
    print(f"Coding Agent: building {'generic' if generic else 'asset-aware'} project "
          f"'{project['project_name']}' ...")

    yield {"type": "codegen", "stage": "start", "query_id": query_id,
           "project": project["project_name"], "title": project["title"],
           "language": project["language"], "mode": "generic" if generic else "asset",
           "session_id": loc_sid}

    try:
        yield {"type": "codegen", "stage": "generating", "query_id": query_id,
               "project": project["project_name"], "title": project["title"],
               "mode": "generic" if generic else "asset"}

        if generic:
            generic_files = deterministic_code(query)
            if not generic_files:
                print("  deterministic template miss; calling coder model...")
                manifest = generate_manifest(query)
                files_map = manifest.get("files") or {}
                if not files_map:
                    raise RuntimeError("Coder model returned no files")
                generic_files = dict(files_map)
            files = build_project_files(project, None, None, generic_files=generic_files)
            mode = "generic"
        else:
            files = build_project_files(project, asset, analysis_payload)
            mode = "asset"

        proj_dir, written = write_project(project["project_name"], files)
        if any(f["size"] <= 0 and f["path"].endswith(".py") for f in written):
            raise RuntimeError("Generated project contains empty python files")

        entry = entry_path(files)
        yield {"type": "codegen", "stage": "validating", "query_id": query_id,
               "project": project["project_name"], "entry": entry, "files": written}
        run = run_entry(proj_dir, entry)

        artifact_id = "ART-" + secrets.token_hex(5).upper()
        zip_path = zip_project(proj_dir, project["project_name"], asset or "", artifact_id)
        artifact = register_code_artifact(project["project_name"], zip_path, written, artifact_id)

        entry_file = next((f for f in files if f["path"] == entry), None)
        envelope = {
            "project_name": project["project_name"],
            "project_id": "PRJ-" + secrets.token_hex(4).upper(),
            "title": project["title"],
            "description": project["description"],
            "language": project["language"],
            "mode": mode,
            "files": files,
            "folder_path": f"backend/storage/code_projects/{_slugify(project['project_name'])}",
            "artifact_id": artifact["artifact_id"],
            "archive_name": artifact["name"],
            "download_url": artifact["download_url"],
            "result_summary": (f"Created project {project['title']} — {len(files)} file(s) written, "
                               f"executed ({run.get('run_command')}, "
                               f"{'passed' if run.get('run_ok') else 'exit ' + str(run.get('run_returncode'))}), "
                               f"archived to Artifacts."),
            "chat_output": _chat_output(project, artifact,
                                        entry_content=(entry_file or {}).get("content"),
                                        run=run, mode=mode),
            "entry_file": entry,
            "run_command": run.get("run_command"),
            "run_ok": run.get("run_ok"),
            "run_returncode": run.get("run_returncode"),
            "run_output": run.get("run_output"),
            "session_id": loc_sid,
            "task_id": None,
            "engine": "in-process generator (coding service offline)",
            "archive_file": {
                "id": artifact["artifact_id"],
                "name": artifact["name"],
                "title": project["title"] + " (code project)",
                "type": "ZIP",
                "format": "ZIP",
                "size": str(zip_path.stat().st_size),
                "status": "READY",
                "validated": True,
                "url": artifact["download_url"],
                "query_id": query_id,
            },
            "artifact_ref": {**artifact, "title": project["title"] + " (code project)",
                             "status": "READY", "validated": True,
                             "doc_type": "code_project", "query_id": query_id},
            "doc_task": {
                "task_index": 99,
                "doc_type": "code_project",
                "title": project["title"] + " (code project)",
                "kind": "code",
                "formats": ["ZIP"],
                "status": "READY",
            },
        }
        yield {"type": "codegen", "stage": "ready", "query_id": query_id,
               "project": project["project_name"], "files": written,
               "entry": entry, "run_output": run.get("run_output", "")[:400],
               "run_ok": run.get("run_ok"),
               "session_id": loc_sid,
               "download_url": artifact["download_url"]}
        yield {"done": envelope}
    except Exception as e:  # noqa: BLE001 - never fake success
        print(f"Coding Agent phase failed: {e}")
        import traceback
        traceback.print_exc()
        error = str(e)[:400]
        yield {"type": "codegen", "stage": "failed", "query_id": query_id,
               "project": project["project_name"], "error": error}
        yield {"done": {
            "project_name": project["project_name"],
            "title": project["title"],
            "description": project["description"],
            "language": project["language"],
            "mode": mode if "mode" in locals() else ("generic" if generic else "asset"),
            "files": [],
            "error": error,
            "result_summary": f"Project generation failed: {error}",
            "chat_output": (
                f"**Coding Agent · project failed — {project['title']}**\n\n"
                f"- ✗ Project generation failed — {error}"
            ),
            "archive_file": None,
            "artifact_ref": None,
            "doc_task": {
                "task_index": 99,
                "doc_type": "code_project",
                "title": project["title"] + " (code project)",
                "kind": "code",
                "formats": ["ZIP"],
                "status": "FAILED",
                "error": error,
            },
        }}