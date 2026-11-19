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
    """旧库增量迁移：只加列 / 加索引，不删表、不重建、不清空历史数据。

    SQLite 与 PostgreSQL 均支持 ALTER TABLE ... ADD COLUMN 与
    CREATE [UNIQUE] INDEX IF NOT EXISTS，对已有数据不产生改写。
    """
    target = db_engine or engine
    tables = set(inspect(target).get_table_names())
    for table, columns in _MIGRATION_COLUMNS.items():
        if table not in tables:
            continue
        existing = {col["name"] for col in inspect(target).get_columns(table)}
        for name, ddl in columns:
            if name in existing:
                continue
            with target.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))

    for name, table, columns in _MIGRATION_INDEXES:
        if table not in tables:
            continue
        with target.begin() as conn:
            conn.execute(
                text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {name} "
                    f"ON {table} ({columns})"
                )
            )


# 增量列定义（SQLite / PostgreSQL 通用类型）
_MIGRATION_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "users": [("nickname", "VARCHAR(64)")],
    "diagnoses": [
        ("client_ref", "VARCHAR(64)"),
        ("category", "VARCHAR(16)"),
        ("device_name", "VARCHAR(64)"),
        ("model_name", "VARCHAR(64)"),
        ("risk_rules_version", "VARCHAR(32)"),
        ("verified", "BOOLEAN DEFAULT FALSE"),
        ("imported", "BOOLEAN DEFAULT FALSE"),
    ],
    "repair_records": [
        ("client_ref", "VARCHAR(64)"),
        ("device_name", "VARCHAR(64)"),
        ("fault_description", "TEXT"),
        ("technician", "VARCHAR(64)"),
        ("status", "VARCHAR(16) DEFAULT 'pending'"),
        ("imported", "BOOLEAN DEFAULT FALSE"),
        ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
    ],
    "repair_tickets": [
        ("client_ref", "VARCHAR(64)"),
        ("progress_status", "VARCHAR(32)"),
        ("progress_history", "TEXT DEFAULT '[]'"),
        ("progress_updated_by", "VARCHAR(64)"),
        ("contact_target", "VARCHAR(128)"),
        ("contacted_at", "VARCHAR(32)"),
        ("appointment_at", "VARCHAR(32)"),
        ("contact_note", "TEXT"),
        ("repair_record_id", "INTEGER"),
    ],
}

# 同一用户下客户端记录 ID 唯一：重复提交不会产生多条记录
_MIGRATION_INDEXES: list[tuple[str, str, str]] = [
    ("ux_diagnoses_user_client", "diagnoses", "user_id, client_ref"),
    ("ux_repair_records_user_client", "repair_records", "user_id, client_ref"),
    ("ux_repair_tickets_user_client", "repair_tickets", "user_id, client_ref"),
]
