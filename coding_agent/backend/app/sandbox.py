"""Sandboxed command execution for the isolated Coding Agent.

The sandbox runs commands in the workspace cwd with a hard timeout, a capped
environment (no network unless explicitly enabled globally), and captures
stdout/stderr. Path access is further validated by the supervisor against the
task's authorized root, so this layer stays minimal and predictable.
"""
import os
import re
import shlex
import subprocess
import time
from dataclasses import dataclass, field
from typing import Optional

from app.config import settings


@dataclass
class CommandResult:
    command: str
    return_code: Optional[int]
    stdout: str
    stderr: str
    duration_ms: int
    timed_out: bool = False
    error: Optional[str] = None

    @property
    def ok(self) -> bool:
        return not self.timed_out and self.return_code == 0 and not self.error

    def summary(self, max_chars: int = 2000) -> str:
        out = (self.stdout or "")[-max_chars:]
        err = (self.stderr or "")[-max_chars:]
        if self.timed_out:
            verdict = "TIMED OUT"
        elif self.return_code is None:
            verdict = "ERROR: " + (self.error or "unknown")
        elif self.return_code == 0:
            verdict = "OK"
        else:
            verdict = f"EXIT {self.return_code}"
        return f"[{verdict}] {self.command}\n--- stdout ---\n{out}\n--- stderr ---\n{err}".strip()


class Sandbox:
    def __init__(self, cwd: str, timeout: Optional[int] = None,
                 allow_network: Optional[bool] = None):
        self.cwd = str(cwd)
        self.timeout = timeout if timeout is not None else settings.sandbox_timeout_s
        allow_network = settings.allow_network if allow_network is None else allow_network
        self.env = os.environ.copy()
        self._python = self._resolve_python()
        if not allow_network:
            self.env["NO_PROXY"] = "*"
            self.env["no_proxy"] = "*"
            self.env.pop("http_proxy", None)
            self.env.pop("https_proxy", None)
            self.env.pop("HTTP_PROXY", None)
            self.env.pop("HTTPS_PROXY", None)
            self.env["PYTHONUNBUFFERED"] = "1"

    @staticmethod
    def _resolve_python() -> str:
        import shutil
        for cand in ("python3", "python"):  # prefer python3; fall back to python
            p = shutil.which(cand)
            if p:
                return p
        return "python3"

    def run(self, command: str, timeout: Optional[int] = None,
            env_extra: Optional[dict] = None,
            input_text: str = "5\nGuest\n\n\n\n\n\n") -> CommandResult:
        command = self._normalize_command(command)
        t0 = time.monotonic()
        try:
            proc = subprocess.run(
                command, shell=True, cwd=self.cwd, env=self.env,
                capture_output=True, text=True,
                input=input_text,
                timeout=timeout or self.timeout,
            )
            return CommandResult(
                command=command,
                return_code=proc.returncode,
                stdout=proc.stdout or "",
                stderr=proc.stderr or "",
                duration_ms=int((time.monotonic() - t0) * 1000),
            )
        except subprocess.TimeoutExpired as e:
            return CommandResult(
                command=command, return_code=None,
                stdout=(e.stdout or b"").decode() if isinstance(e.stdout, bytes) else (e.stdout or ""),
                stderr=(e.stderr or b"").decode() if isinstance(e.stderr, bytes) else (e.stderr or ""),
                duration_ms=int((time.monotonic() - t0) * 1000),
                timed_out=True,
            )
        except Exception as e:  # noqa: BLE001
            return CommandResult(
                command=command, return_code=None, stdout="", stderr="",
                duration_ms=int((time.monotonic() - t0) * 1000),
                error=str(e),
            )

    def _normalize_command(self, command: str) -> str:
        """Rewrite bare `python ...` to the actual interpreter on this machine.

        The resolved interpreter path may contain spaces (e.g. "Smart India
        Hackathon"), so it is shell-quoted before substitution to avoid the
        shell splitting it and reporting the fragment as "command not found".
        """
        stripped = command.lstrip()
        if stripped == "python" or stripped.startswith("python "):
            interpreter = shlex.quote(self._python)
            # Replace every bare `python` token; never touch `python3` etc.
            return re.sub(r"\bpython\b", interpreter, command)
        return command