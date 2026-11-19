from datetime import datetime

from fastapi import APIRouter

from app.ai import glm_client
from app.core.config import settings
from app.safety.rules import SAFETY_RULES_VERSION

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
        "time": datetime.now().isoformat(),
        "deployment_mode": settings.deployment_mode,
        "ai_configured": glm_client.is_configured(),
        "safety_rules_version": SAFETY_RULES_VERSION,
    }
