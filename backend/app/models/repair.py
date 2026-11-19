from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base

# 验证状态（PRD 6.9）：已恢复 / 部分恢复 / 未恢复 / 暂无法确认 / 待验证
VERIFICATION_STATUSES = (
    "pending",
    "recovered",
    "partially_recovered",
    "not_recovered",
    "unconfirmed",
)


class RepairRecord(Base):
    __tablename__ = "repair_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id"), nullable=True
    )
    diagnosis_id: Mapped[int | None] = mapped_column(
        ForeignKey("diagnoses.id"), nullable=True
    )
    # 客户端记录 ID：同一用户下唯一，用于重复提交去重
    client_ref: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    device_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    fault_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    repair_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    technician: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    repair_cost: Mapped[str | None] = mapped_column(String(32), nullable=True)
    repair_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    verification_status: Mapped[str] = mapped_column(
        String(32), default="pending"
    )
    attachments: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组
    imported: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
