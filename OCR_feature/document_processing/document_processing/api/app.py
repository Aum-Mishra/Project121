"""FastAPI application factory for the document processing module."""

from __future__ import annotations

from fastapi import FastAPI

from document_processing.api.routes import router


def create_app() -> FastAPI:
    app = FastAPI(
        title="ApexPetro Document Processing API",
        description=(
            "On-premise document processing, OCR, and structured extraction. "
            "Stops before RAG — returns DocumentResult JSON/Markdown for downstream use."
        ),
        version="0.2.0",
    )
    app.include_router(router)
    return app


app = create_app()
