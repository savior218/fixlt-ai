from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class Diagnosis(Base):
    __tablename__ = "diagnoses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id"), nullable=True, index=True
    )
    # 客户端记录 ID：同一用户下唯一，用于重复提交去重（服务端唯一索引保证）
    client_ref: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    symptoms: Mapped[str] = mapped_column(Text, default="")
    image_urls: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组
    diagnosis_result: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    risk_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 内容来源：ai / template / unknown（decision_type 保留旧字段语义）
    decision_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    category: Mapped[str | None] = mapped_column(String(16), nullable=True)
    device_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    risk_rules_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 是否由服务端回执验证为真实 AI 结果；本机导入恒为 False
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    imported: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(32), default="in_progress")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    messages: Mapped[list["DiagnosisMessage"]] = relationship(
        back_populates="diagnosis"
    )
