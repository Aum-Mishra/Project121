"""Coding Agent — isolated backend configuration.

This module is intentionally self-contained: it does NOT import anything from
the main Sovereign AI Workbench backend. The Coding Agent runs as a separate
service (port 8002 by default) behind CORS, sharing only the local Ollama model
server that already runs on this machine.
"""
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = 8002

    # --- Deployment mode: local (Ollama) or cloud (Nebius Token Factory) ---
    app_mode: str = "local"

    # --- Local model infrastructure (same Ollama server the workbench uses) ---
    ollama_base_url: str = "http://localhost:11434"
    coding_model: str = "qwen2.5-coder:7b"

    # --- Nebius Token Factory (cloud mode, NVIDIA Nemotron, OpenAI-compatible) ---
    nebius_api_key: str = ""
    nebius_base_url: str = "https://api.tokenfactory.us-central1.nebius.com/v1"
    nebius_model: str = "nvidia/nemotron-3-super-120b-a12b"
    nebius_coder_model: str = "nvidia/nemotron-3-super-120b-a12b"
    nebius_timeout_s: int = 600

    # --- Storage (isolated from the workbench). Paths are CWD-independent:
    # they resolve relative to the coding_agent/backend package location. ---
    database_url: str = ""
    coding_root: str = ""

    # --- Execution policy ---
    sandbox_timeout_s: int = 120
    max_command_timeout_s: int = 300
    allow_network: bool = False
    max_repair_attempts: int = 3

    # OpenHands engine can be disabled to force the reliable local Ollama engine.
    openhands_enabled: bool = True
    openhands_timeout_s: int = 240

    # Bootstrap a fixed demo user/company for local isolated operation.
    seed_company_id: str = "apexpetro"
    seed_user_id: int = 1
    seed_user_name: str = "Coding Agent User"

    @property
    def base_dir(self) -> Path:
        return Path(__file__).resolve().parent.parent  # coding_agent/backend

    @property
    def data_dir(self) -> Path:
        d = self.base_dir.parent / "data"
        d.mkdir(parents=True, exist_ok=True)
        return d

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return "sqlite:///" + str(self.data_dir / "runtime" / "coding_agent.db")

    @property
    def coding_root_dir(self) -> Path:
        if self.coding_root:
            return Path(self.coding_root).expanduser().resolve()
        root = self.data_dir / "coding"
        root.mkdir(parents=True, exist_ok=True)
        return root


settings = Settings()

# In cloud mode the coding agent must use the Nebius model everywhere the
# command-line/engine code reads ``settings.coding_model``.
if (settings.app_mode or "local").strip().lower() == "cloud":
    settings.coding_model = settings.nebius_coder_model or settings.nebius_model
    # OpenHands is hard-wired to litellm's Ollama provider; disable it so cloud
    # deployments cannot reach a local model.
    settings.openhands_enabled = False