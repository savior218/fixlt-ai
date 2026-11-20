"""大模型驱动的动态追问会话（空调“不制冷/制冷效果变差”）。"""
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
    # 图片一次分析结果：只记录可见现象与局限
    photo_observations: Mapped[str] = mapped_column(Text, default="[]")
    photo_limitations: Mapped[str] = mapped_column(Text, default="[]")
    # 模型对已知/未知/矛盾的整理（仅作上下文，不作为最终报告事实）
    known: Mapped[str] = mapped_column(Text, default="[]")
    unknown: Mapped[str] = mapped_column(Text, default="[]")
    conflicts: Mapped[str] = mapped_column(Text, default="[]")
    # 完整问答：问题 ID/文本/选项/回答/来源
    asked: Mapped[str] = mapped_column(Text, default="[]")
    # 当前问题完整结构（模型生成的问题文本与选项）
    current_question: Mapped[str] = mapped_column(Text, default="{}")
    current_question_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    round: Mapped[int] = mapped_column(Integer, default=0)
    max_rounds: Mapped[int] = mapped_column(Integer, default=6)
    status: Mapped[str] = mapped_column(String(16), default="active")
    end_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    recommendation: Mapped[str] = mapped_column(Text, default="{}")
    cannot_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cannot_next_step: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=0)
    last_request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    selection_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    model_calls: Mapped[int] = mapped_column(Integer, default=0)
    model_latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    kb_version: Mapped[str] = mapped_column(String(32), default="ac-ai-interview-v1")
    safety_rules_version: Mapped[str] = mapped_column(String(32), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
