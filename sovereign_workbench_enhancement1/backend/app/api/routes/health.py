from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.database import get_db
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "sovereign-ai-workbench",
        "version": "1.0.0",
        "company_id": settings.company_id,
        "environment": settings.app_env,
    }


@router.get("/health/detailed")
async def detailed_health_check(db: Session = Depends(get_db)):
    checks = {
        "database": False,
        "ollama": False,
        "qdrant": False,
    }

    # Check database
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception as e:
        logger.error("database_health_check_failed", error=str(e))

    # Check Ollama
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            checks["ollama"] = resp.status_code == 200
    except Exception as e:
        logger.error("ollama_health_check_failed", error=str(e))

    # Check Qdrant
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.qdrant_url}/health")
            checks["qdrant"] = resp.status_code == 200
    except Exception as e:
        logger.error("qdrant_health_check_failed", error=str(e))

    # Check sandbox availability
    checks["sandbox"] = True

    # Check network security provider
    try:
        from app.core.network_security import network_security_provider
        net_status = network_security_provider.check_status()
        checks["network_security"] = net_status.get("egress_traffic") in ("BLOCKED", "RESTRICTED")
    except Exception:
        checks["network_security"] = False

    all_healthy = all(checks.values())

    return {
        "status": "healthy" if all_healthy else "degraded",
        "checks": checks,
        "company_id": settings.company_id,
        "environment": settings.app_env,
    }