from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import devices, health
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


@app.get("/")
def root() -> dict:
    return {"app": settings.app_name, "docs": "/docs", "health": "/api/health"}
