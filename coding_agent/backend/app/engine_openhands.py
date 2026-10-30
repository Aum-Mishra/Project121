"""OpenHands engine wrapper for the isolated Coding Agent.

Runs a LocalConversation in a background thread (LocalConversation.run() is
blocking) connected to the local Ollama Qwen-Coder model. Key fix: the SDK
defaults to reasoning_effort='high', which Ollama's qwen2.5-coder:7b rejects
with "does not support thinking" — we force reasoning_effort='none' and strip
the built-in think tool so agent turns complete against the local model.

Any OpenHands failure raises, and the caller falls back to the deterministic
Ollama engine.
"""
import asyncio
import os
import uuid
import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Optional
from pathlib import Path

os.environ.setdefault("OPENHANDS_SUPPRESS_BANNER", "1")

from openhands.sdk.llm import LLM  # noqa: E402
from openhands.sdk.agent import Agent  # noqa: E402
from openhands.sdk.conversation import LocalConversation  # noqa: E402
from openhands.sdk.event import MessageEvent, ConversationStateUpdateEvent  # noqa: E402
from openhands.sdk.event.conversation_error import ConversationErrorEvent  # noqa: E402
from openhands.tools import FileEditorTool, TerminalTool, TaskTrackerTool  # noqa: E402


@dataclass
class TurnOutcome:
    ok: bool
    events: list = field(default_factory=list)
    error: Optional[str] = None


class OpenHandsEngine:
    name = "openhands"

    def __init__(self, model: Optional[str] = None):
        if (settings.app_mode or "local").strip().lower() == "cloud":
            # This engine is hard-wired to litellm's Ollama provider. In cloud
            # mode every AI call must go through Nebius, so refuse to start
            # instead of silently reaching for a local model.
            raise RuntimeError(
                "OpenHands engine is disabled in cloud mode; "
                "all inference must use Nebius Token Factory."
            )
        model = model or "ollama/qwen2.5-coder:7b"
        # litellm needs the provider prefix; default any bare model name to ollama.
        if "/" not in model:
            model = f"ollama/{model}"
        self.model = model
        self._conv: Optional[LocalConversation] = None
        self._events: list = []

    # -- lifecycle ---------------------------------------------------------

    def _make_llm(self) -> LLM:
        return LLM(
            model=self.model,
            reasoning_effort="none",
            capability_overrides={
                "thinking_mode": "none",
                "supports_reasoning_effort": True,
            },
        )

    def _make_agent(self) -> Agent:
        # Real host-executing tools (no Docker runtime needed). Tools are
        # registered on import of openhands.tools; reference them by name.
        from openhands.tools.preset.default import register_default_tools
        register_default_tools(enable_browser=False)
        from openhands.sdk.tool import Tool
        agent = Agent(
            llm=self._make_llm(),
            tools=[
                Tool(name=tool_name)
                for tool_name in (
                    TerminalTool.name,
                    FileEditorTool.name,
                    TaskTrackerTool.name,
                )
            ],
            # Drop the 'think' tool (defaults are not subject to regex
            # filtering), keeping only 'finish'.
            include_default_tools=["FinishTool"],
        )
        self._agent_tools = [t.name for t in agent.tools]
        return agent

    def start(self, workspace: str, max_iterations: int = 50,
              on_event: Optional[Callable[[object], None]] = None,
              conversation_id: Optional[uuid.UUID] = None,
              persistence_dir: Optional[str] = None,
              delete_on_close: bool = True):
        agent = self._make_agent()
        self._events = []
        self._on_event = on_event

        def _cb(event):
            self._events.append(event)
            if on_event:
                on_event(event)

        self._conv = LocalConversation(
            agent=agent,
            workspace=workspace,
            callbacks=[_cb],
            max_iteration_per_run=max_iterations,
            delete_on_close=delete_on_close,
            conversation_id=conversation_id,
            persistence_dir=persistence_dir,
        )
        return self

    # -- turn execution ----------------------------------------------------

    def send_message(self, text: str):
        if not self._conv:
            raise RuntimeError("OpenHands engine not started")
        self._conv.send_message(text)

    def _run_blocking(self, message: Optional[str] = None,
                      timeout_s: int = 300) -> "object":
        """Blocking call; intended to be executed in a worker thread."""
        import concurrent.futures
        if not self._conv:
            raise RuntimeError("OpenHands engine not started")
        error_holder = {}

        exception_wrapper = os.environ.get("OH_ENGINE_EXCEPTIONS", "0") == "1"

        def _run():
            try:
                if message:
                    self._conv.send_message(message)
                result = self._conv.run()
                return result
            except Exception as e:  # noqa: BLE001
                error_holder["error"] = str(e)
                if exception_wrapper:
                    raise
                return None

        # run() is blocking; wrap in a thread so we can apply our own timeout
        fut_result = {}

        def _runner():
            fut_result["value"] = _run()

        t = threading.Thread(target=_runner, daemon=True)
        t.start()
        t.join(timeout=timeout_s)
        if t.is_alive():
            t.join(0)
            self._conv.interrupt()
            raise TimeoutError(f"OpenHands engine timed out after {timeout_s}s")
        if "error" in error_holder:
            raise RuntimeError(error_holder["error"])
        return fut_result.get("value")

    async def arun(self, message: Optional[str] = None,
                   timeout_s: int = 300) -> "object":
        """Async wrapper: runs the blocking turn in the default thread pool."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, lambda: self._run_blocking(message, timeout_s))

    def close(self):
        if self._conv:
            try:
                self._conv.close()
            except Exception:  # noqa: BLE001
                pass
            self._conv = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # -- transcript helpers ------------------------------------------------

    def transcript_markdown(self) -> str:
        """Render the OpenHands event stream as readable markdown for the chat panel."""
        lines = []
        for ev in self._events:
            name = type(ev).__name__
            if isinstance(ev, MessageEvent):
                source = getattr(ev, "source", "") or "agent"
                content = getattr(ev, "message", "") or ""
                if content:
                    lines.append(f"**{source}:** {content}")
                elif getattr(ev, "content", None):
                    lines.append(f"**{source}:** {ev.content}")
            elif name == "ActionEvent":
                a = getattr(ev, "action", None) or {}
                tool = getattr(a, "tool", None) or a.get("tool") if isinstance(a, dict) else getattr(getattr(ev, "action", None), "tool", None)
                args = getattr(a, "arguments", None) or a.get("arguments") if isinstance(a, dict) else {}
                if tool == "bash":
                    cmd = (args or {}).get("command", "")
                    if cmd:
                        lines.append(f"```\n$ {cmd}\n```")
                elif tool != "think":
                    lines.append(f"- *{tool}* {str(args)[:400]}")
            elif isinstance(ev, ConversationErrorEvent) and getattr(ev, "error", None):
                lines.append(f"⚠️ error: {ev.error}")
        return "\n\n".join(lines)


class OpenHandsConnectionError(RuntimeError):
    pass