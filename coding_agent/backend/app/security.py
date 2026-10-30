"""Path validation and command policy for the isolated Coding Agent.

Security model:
- The agent may only write inside the authorized workspace root for a task.
- Commands are classified into policy buckets. Command buckets that could
  reach outside the workspace, touch network, install packages, or escalate
  privileges require user approval before execution.
- Absolute paths pointing outside the workspace root are rejected unless the
  (bucketed) command is explicitly approved.
"""
import os
import re
from pathlib import Path
from typing import List, Tuple


# ---------------------------------------------------------------------------
# Safe path handling
# ---------------------------------------------------------------------------

def is_within(root: Path, target: Path) -> bool:
    """True if ``target`` is inside ``root`` (resolved, symlink-aware within root)."""
    root_res = root.resolve()
    try:
        target_res = (root / target).resolve()
    except (OSError, RuntimeError):
        # Path does not exist yet — resolve relative to root so we can validate
        # future locations safely.
        target_res = Path(os.path.normpath(os.path.join(str(root_res), str(target))))
    return target_res == root_res or target_res.is_relative_to(root_res)


def safe_relative_path(root: Path, raw: str) -> Tuple[Path, str]:
    """Return (rooted_path, normalized_relative)."""
    raw = str(raw).strip().lstrip("/")
    rel = Path(raw)
    # strip out-of-root prefixes like ../ or leading slashes from the relative form
    parts = [p for p in rel.parts if p not in ("", ".", "..")]
    rel = Path(*parts)
    rooted = root / rel
    if not is_within(root, rel):
        raise ValueError(f"Path escapes workspace: {raw}")
    return rooted, rel.as_posix()


# ---------------------------------------------------------------------------
# Command policy buckets
# ---------------------------------------------------------------------------

class CommandPolicy:
    # Buckets that are always allowed (dev/build/test/source control ops).
    SAFE_PREFIXES = [
        "ls", "cat", "pwd", "echo", "printf", "head", "tail", "wc", "grep",
        "find", "tree", "dir", "sort", "uniq", "cut", "tr", "sed", "awk",
        "mkdir", "touch", "cp", "mv", "rm", "python", "python3", "python3.12",
        "pip", "pip3", "py", "node", "npm", "npx", "yarn", "pnpm", "bun",
        "deno", "make", "cmake", "go", "rustc", "cargo", "javac", "java",
        "gcc", "g++", "clang", "cc", "bash", "sh", "zsh", "git", "dotnet",
        "flutter", "dart", "php", "ruby", "bundle", "rake", "perl", "sqlite3",
        "file", "stat", "du", "df", "which", "command", "source",
    ]
    # Buckets that must be macro-approved or denied outright unless user grants.
    SENSITIVE_PREFIXES = [
        "sudo", "su ", "chmod", "chown", "curl", "wget", "git push",
        "git remote", "npm install -g", "pip install", "docker", "podman",
        "systemctl", "apt", "apt-get", "yum", "dnf", "brew", "conda",
        "rm -rf /", "mkfs", "fdisk", "kill", "dd ", ":(){", "> /dev/sda",
    ]

    @staticmethod
    def first_token(cmd: str) -> str:
        cmd = cmd.strip()
        m = re.match(r"^([^\s|;&<>()]+)", cmd)
        return m.group(1) if m else ""

    @classmethod
    def classify(cls, cmd: str) -> str:
        """Return a policy bucket label for a command line."""
        stripped = cmd.strip().lower()
        if not stripped:
            return "skip"
        # Hard safety blocks
        for bad in ["rm -rf /", "mkfs", "fdisk", ":(){", "> /dev/sda",
                    "mv / ", "--no-preserve-root"]:
            if bad in stripped:
                return "blocked"
        token = cls.first_token(stripped)
        # Check sensitive first
        for s in cls.SENSITIVE_PREFIXES:
            if stripped.startswith(s):
                return "approval"
        if token in ("pip", "pip3"):
            return "package_install"
        if token in ("curl", "wget") or (token == "git" and (
                " push" in stripped or " remote" in stripped or " fetch" in stripped
                or " pull" in stripped)):
            return "network"
        if token in cls.SAFE_PREFIXES:
            return "safe"
        # Unknown commands default to sandbox execution (still cwd-scoped).
        return "safe"


def is_always_safe(cmd: str) -> bool:
    return CommandPolicy.classify(cmd) in ("safe", "skip")


def requires_approval(cmd: str) -> bool:
    return CommandPolicy.classify(cmd) in ("approval", "network", "package_install", "blocked")


def sanitize_shell(cmd: str) -> str:
    """Disallow obvious escape sequences for the sandbox layer."""
    forbidden = ["${", "$(", "`", "2>&1 | tee /etc", "> /etc/"]
    for f in forbidden:
        if f in cmd:
            raise ValueError(f"Forbidden shell construct in command: {f}")
    return cmd