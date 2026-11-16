from datetime import datetime

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
        "time": datetime.now().isoformat(),
    }
