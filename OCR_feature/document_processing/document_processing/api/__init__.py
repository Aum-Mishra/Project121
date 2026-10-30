"""API package — FastAPI schemas and routes (Phase 8)."""

from document_processing.models import DocumentResult

__all__ = ["DocumentResult", "app", "create_app"]


def __getattr__(name: str):
    if name in {"app", "create_app"}:
        from document_processing.api.app import app, create_app

        return {"app": app, "create_app": create_app}[name]
    raise AttributeError(name)
