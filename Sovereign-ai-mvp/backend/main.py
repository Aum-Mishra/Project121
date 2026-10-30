import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from .chat_pipeline import execute_chat
from .mvp_docgen import resolve_download

app = FastAPI(title="Sovereign AI MVP Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str
    role: str = "ENGINEER"
    
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    return StreamingResponse(
        execute_chat(request.query, request.role),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )

@app.get("/api/artifacts/{artifact_id}/download")
def download_artifact(artifact_id: str):
    resolved = resolve_download(artifact_id)
    if not resolved:
        raise HTTPException(status_code=404, detail="Artifact not found")
    path, name = resolved
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        filename=name)

@app.on_event("startup")
async def startup_event():
    print("==================================================")
    print("SOVEREIGN AI MVP - LIGHTWEIGHT ORCHESTRATOR STARTED")
    print("==================================================")
    print("Architecture: Frontend-First + Deterministic Chat Pipeline")
    print("LLM Provider: Local")
