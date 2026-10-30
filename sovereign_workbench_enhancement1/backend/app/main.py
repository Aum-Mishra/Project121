from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.exceptions import WorkbenchException
from app.db.database import init_db
from app.api.routes import health, models, knowledge, chat, documents, assets, projects, tasks, artifacts, approvals, work_orders, security, document_generation, auth, code

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info("application_starting", company_id=settings.company_id, env=settings.app_env)
    init_db()
    from app.db.database import SessionLocal
    from app.api.routes.auth import ensure_seed_user
    _db = SessionLocal()
    try:
        ensure_seed_user(_db)
    finally:
        _db.close()
    logger.info("database_initialized")
    yield
    logger.info("application_shutting_down")


app = FastAPI(
    title="Sovereign AI Workbench",
    description="On-premise agentic AI workbench for confidential industrial work",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.app_env == "development" else None,
    redoc_url="/redoc" if settings.app_env == "development" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8443", "http://127.0.0.1:5173", "http://127.0.0.1:8443"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.core.waf_middleware import WebApplicationFirewallMiddleware
app.add_middleware(WebApplicationFirewallMiddleware, enabled=True, max_requests_per_min=180)


@app.exception_handler(WorkbenchException)
async def workbench_exception_handler(request, exc: WorkbenchException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(models.router, prefix="/api")
app.include_router(knowledge.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(artifacts.router, prefix="/api")
app.include_router(approvals.router, prefix="/api")
app.include_router(work_orders.router, prefix="/api")
app.include_router(security.router, prefix="/api")
app.include_router(document_generation.router, prefix="/api")
app.include_router(code.router, prefix="/api")


@app.get("/metrics")
@app.get("/api/metrics")
async def prometheus_metrics():
    from fastapi import Response
    from app.core.metrics import get_metrics_payload
    payload, content_type = get_metrics_payload()
    return Response(content=payload, media_type=content_type)


if settings.app_env == "development":
    @app.get("/")
    async def root():
        return {"message": "Sovereign AI Workbench API", "docs": "/docs"}
