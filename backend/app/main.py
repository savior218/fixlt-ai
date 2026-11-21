from contextlib import asynccontextmanager
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import auth, data, demo, devices, diagnose, health, hotlines, interview, records, repairs, tts
from app.core.config import ensure_deployment_config, settings
from app.database.hotline_seed import seed_hotline_directory
from app.database.seed import seed_demo_data
from app.database.session import SessionLocal, init_db
from app.services.auth import ensure_auth_ready

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 公开服务先显式核实数据库与 Cookie 配置，不合格直接拒绝启动
    ensure_deployment_config()
    # 生产缺少会话密钥时快速失败，避免使用进程内默认密钥上线
    ensure_auth_ready()
    init_db()
    db = SessionLocal()
    try:
        seed_demo_data(db)
        seed_hotline_directory(db)
    finally:
        db.close()

    if settings.deployment_mode == "public":
        logger.info(
            "公开服务已启动 database=%s cookie_secure=%s",
            settings.database_url.split("://", 1)[0],
            settings.session_cookie_secure,
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


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """把 Pydantic 的校验错误转换为前端可读的统一结构。"""
    first = exc.errors()[0] if exc.errors() else {}
    message = str(first.get("msg", "输入内容不符合要求")).removeprefix("Value error, ")
    loc = first.get("loc") or ()
    field = next((part for part in reversed(loc) if isinstance(part, str)), None)
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "code": "validation_error",
                "message": message,
                "field": field,
            }
        },
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
app.include_router(auth.router)
app.include_router(demo.router)
app.include_router(devices.router)
app.include_router(hotlines.router)
app.include_router(diagnose.router)
app.include_router(records.router)
app.include_router(repairs.router)
app.include_router(data.router)
app.include_router(interview.router)
app.include_router(tts.router)


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
