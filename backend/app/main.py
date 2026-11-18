from contextlib import asynccontextmanager
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import devices, diagnose, health
from app.core.config import settings
from app.database.seed import seed_demo_data
from app.database.session import SessionLocal, init_db

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_demo_data(db)
    finally:
        db.close()

    if settings.deployment_mode == "public":
        logger.warning(
            "公开服务模式：X-User-Id 演示身份仍启用，当前尚不具备多用户隔离能力"
        )
        if any("localhost" in o or "127.0.0.1" in o for o in settings.cors_origins):
            logger.warning("公开服务模式仍包含本机 CORS 来源，请配置 FIXITAI_CORS_ORIGINS")
    yield


docs_enabled = settings.expose_api_docs and settings.deployment_mode != "public"

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def enforce_model_request_size(request: Request, call_next):
    """限制模型接口请求体大小，避免超长输入消耗调用额度。"""
    if request.method == "POST" and request.url.path == "/api/diagnose/complete":
        raw_length = request.headers.get("content-length")
        try:
            length = int(raw_length) if raw_length else 0
        except ValueError:
            length = 0
        if length > settings.ai_max_request_bytes:
            return JSONResponse(
                status_code=413,
                content={
                    "detail": {
                        "code": "request_too_large",
                        "message": "请求内容过大，请精简描述后重试",
                    }
                },
            )
    return await call_next(request)


app.include_router(health.router)
app.include_router(devices.router)
app.include_router(diagnose.router)


# 生产部署：FastAPI 统一托管前端构建产物（单服务部署，前端与 /api 同源无需跨域）
# 仅当 FRONTEND_DIST_DIR 指向有效目录时启用；本地开发留空走 Vite dev server。
# 注意：SPA 回退需注册在显式路由之后，否则 "/" 会被 API 根路由抢占。
if settings.frontend_dist_dir:
    _dist = Path(settings.frontend_dist_dir).resolve()
    if (_dist / "index.html").is_file():
        app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str) -> FileResponse:
            # API 路径不回退（未匹配的 /api/* 返回 404 而非 index.html）
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="Not Found")
            candidate = _dist / full_path
            # 防目录穿越：解析后必须仍位于 dist 内
            if candidate.is_file() and _dist in candidate.resolve().parents:
                return FileResponse(candidate)
            return FileResponse(_dist / "index.html")
