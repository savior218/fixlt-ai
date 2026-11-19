"""数据库引擎与会话管理（本地开发 SQLite；线上可配置 PostgreSQL）。"""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

connect_args = (
    {"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {}
)
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """导入全部模型后建表，并执行非破坏性增量迁移。"""
    from app import models  # noqa: F401 确保模型已注册

    Base.metadata.create_all(bind=engine)
    ensure_schema_migrations()


def ensure_schema_migrations(db_engine=None) -> None:
    """旧库增量迁移：只加列，不删表、不重建、不清空历史数据。

    当前版本为 users.nickname（账号昵称）。SQLite 与 PostgreSQL 均支持
    ALTER TABLE ... ADD COLUMN，且对已有数据不产生改写。
    """
    target = db_engine or engine
    inspector = inspect(target)
    if "users" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "nickname" not in columns:
        with target.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN nickname VARCHAR(64)"))
