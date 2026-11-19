"""动态追问会话（仅空调“不制冷/制冷效果变差”首版）。"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    category: Mapped[str] = mapped_column(String(16), default="ac")
    symptom: Mapped[str] = mapped_column(String(32), default="not_cooling")
    initial_description: Mapped[str] = mapped_column(Text)
    photo_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    facts: Mapped[str] = mapped_column(Text, default="[]")
    unknown: Mapped[str] = mapped_column(Text, default="[]")
    conflicts: Mapped[str] = mapped_column(Text, default="[]")
    asked: Mapped[str] = mapped_column(Text, default="[]")
    current_question_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    round: Mapped[int] = mapped_column(Integer, default=0)
    max_rounds: Mapped[int] = mapped_column(Integer, default=4)
    status: Mapped[str] = mapped_column(String(16), default="active")
    end_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=0)
    last_request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    selection_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    selection_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kb_version: Mapped[str] = mapped_column(String(32), default="ac-dynamic-v1")
    safety_rules_version: Mapped[str] = mapped_column(String(32), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
