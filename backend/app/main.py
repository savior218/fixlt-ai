from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import devices, diagnose, health
from app.core.config import settings
from app.database.seed import seed_demo_data
from app.database.session import SessionLocal, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_demo_data(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(devices.router)
app.include_router(diagnose.router)


@app.get("/")
def root() -> dict:
    return {"app": settings.app_name, "docs": "/docs", "health": "/api/health"}


# 生产部署：FastAPI 统一托管前端构建产物（单服务部署，前端与 /api 同源无需跨域）
# 仅当 FRONTEND_DIST_DIR 指向有效目录时启用；本地开发留空走 Vite dev server。
if settings.frontend_dist_dir:
    _dist = Path(settings.frontend_dist_dir).resolve()
    if (_dist / "index.html").is_file():
        app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str) -> FileResponse:
            candidate = _dist / full_path
            # 防目录穿越：解析后必须仍位于 dist 内
            if candidate.is_file() and _dist in candidate.resolve().parents:
                return FileResponse(candidate)
            return FileResponse(_dist / "index.html")
