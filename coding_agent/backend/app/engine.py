"""Deterministic local Ollama engine for the isolated Coding Agent.

Generates a strict JSON manifest of file writes given the user request, plus
procedures (commands) to run. Used for the GENERATED_CODE (greenfield) flow and
as a fallback when the OpenHands engine cannot complete a turn. Everything stays
local and offline-safe.
"""
import json
import re
import uuid
from typing import Any, Callable, Optional

from app.config import settings
from app import ollama_client
from app.workspace import Workspace


SYSTEM = (
    "You are a precise local code-generation assistant. You produce a STRICT "
    "JSON object only — no markdown, no commentary, no code fences. "
    "The JSON schema is exactly:\n"
    '{"title": str, "files": {"<abs-or-rel-path>": "<file content>"}, '
    '"commands": ["cmd1", "cmd2"], "summary": str}\n'
    "Paths are relative to the project root. Commands must be read-only/safe "
    "(test/build/run) and must never touch anything outside the project."
)


def _extract_json(text: str) -> dict:
    """Robustly pull a JSON object out of an LLM response."""
    text = text.strip()
    # strip code fences
    text = re.sub(r"^```(?:json)?\s*", "", text).strip()
    text = re.sub(r"\s*```$", "", text).strip()
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except Exception:  # noqa: BLE001
        pass
    # Find the first balanced {...} block
    start = text.find("{")
    if start < 0:
        raise ValueError("No JSON object found in model response")
    depth = 0
    in_str = False
    esc = False
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
                return json.loads(text[start:i + 1])
    raise ValueError("Unbalanced JSON object in model response")


class OllamaEngine:
    name = "ollama"

    def __init__(self, model: Optional[str] = None):
        self.model = model or settings.coding_model
        self.ollama_client = ollama_client

    def build_manifest(self, request: str, context: Optional[dict] = None,
                       on_event: Optional[Callable[[str], None]] = None) -> dict:
        """Return {'title','files': {relpath: content}, 'commands': [...], 'summary': str}."""
        ctx = ""
        if context and context.get("workspace_tree"):
            ctx = "\nWorkspace tree:\n" + context["workspace_tree"]
        if context and context.get("workspace_files"):
            ctx += "\nNote: modify the EXISTING files, do not wholesale rewrite unrelated ones."
        prompt = (
            "User's coding request:\n" + request + "\n\n"
            "If this is a NEW project, design files for a complete, runnable "
            "project. If it is an EXISTING project, you may ONLY edit/add/remove "
            "the specific files needed for the request; keep unrelated files "
            "untouched and minimize diffs. Always include a commands list with at "
            "least the exact test/verification command to run at the end.\n"
            "CRITICAL self-consistency rule: any unit-test assertions you write "
            "MUST exactly match the values you define in the data files, and any "
            "function logic must agree with the expected outputs. Never write a "
            "test that asserts an outcome your own data/logic cannot produce. "
            "BOUNDARY RULE: when checking a value against a limit, equality means "
            "NORMAL (value <= limit is NORMAL, NOT HIGH); only a value strictly "
            "greater than the limit is HIGH.\n"
            + ctx + "\n"
            "Respond with the strict JSON object."
        )
        if on_event:
            on_event("ollama: generating code manifest")
        raw = self.ollama_client.generate(
            self.model, prompt, system=SYSTEM, format_json=True,
            options={"temperature": 0.2, "num_predict": 16000},
        )
        manifest = _extract_json(raw)
        if not isinstance(manifest.get("files"), dict):
            # fall back to a single-file project-less response
            manifest = {
                "title": manifest.get("title", "generated-code"),
                "files": {"README.md": raw},
                "commands": [],
                "summary": "Model did not return a structured manifest.",
            }
        return manifest

    def repair(self, request: str, error_text: str,
               context: Optional[dict] = None,
               on_event: Optional[Callable[[str], None]] = None) -> dict:
        """Given a failing verification, produce corrective file edits + commands."""
        ctx = ""
        if context and context.get("workspace_tree"):
            ctx = "\nCurrent workspace tree:\n" + context["workspace_tree"]
        if context and context.get("workspace_files"):
            ctx += (
                "\nInspect the CURRENT file contents above and fix exactly what "
                "caused the error. Minimize diffs; do not rewrite unrelated files."
            )
        if context and context.get("workspace_contents"):
            ctx += "\n\nCurrent file contents:\n" + context["workspace_contents"]
        if "is not defined" in (error_text or ""):
            ctx += (
                "\n\nAUTO-ANALYSIS: The failure is a NameError ('X is not defined'). "
                "The referenced name is missing from the failing module's namespace. "
                "Fix it by adding the correct import of that name (or its defining "
                "module) at the top of the failing file, e.g. 'from <module> import X' "
                "or 'import <module>'. Rewrite and return the COMPLETE corrected "
                "content of the failing file so the import is present."
            )
        if "AssertionError" in (error_text or ""):
            ctx += (
                "\n\nAUTO-ANALYSIS: The failure is a test assertion mismatch. The "
                "asserted expected value does not match what the current code + data "
                "actually produce. Recompute the expected value from the data files "
                "themselves. BOUNDARY RULE: value <= limit is NORMAL; only "
                "value > limit is HIGH — value EQUAL to the limit is NORMAL."
            )
        prompt = (
            "A previous attempt failed. User request:\n"
            + request + "\n\nFailure output:\n" + error_text + "\n\n"
            "Produce a STRICT JSON repair manifest with 'files' (paths+contents of "
            "ONLY the files that need changing) and 'commands' (the re-run test "
            "commands). Do not rewrite files that are fine."
            + ctx
        )
        if on_event:
            on_event("ollama: generating repair manifest")
        raw = self.ollama_client.generate(
            self.model, prompt, system=SYSTEM, format_json=True,
            options={"temperature": 0.2, "num_predict": 12000},
        )
        return _extract_json(raw)