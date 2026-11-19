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

# 报修工单状态机：待受理 → 已受理 → 维修中 → 已完成（只允许正向流转）
TICKET_STATUSES = ("pending", "accepted", "in_progress", "completed")
TICKET_STATUS_LABELS = {
    "pending": "待受理",
    "accepted": "已受理",
    "in_progress": "维修中",
    "completed": "已完成",
}


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


class RepairTicket(Base):
    """报修工单（模块②：报修工单闭环）。

    status_history 为 JSON 数组：[{"status": "pending", "at": ISO 时间}, ...]
    """

    __tablename__ = "repair_tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id"), nullable=True
    )
    # 前端本地诊断 ID（如 diag-xxxx），仅作来源展示，不做外键
    diagnosis_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    category: Mapped[str] = mapped_column(String(32))
    brand: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    symptom: Mapped[str] = mapped_column(String(64))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    found_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    checks: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组
    content: Mapped[str] = mapped_column(Text)  # 报修说明全文
    status: Mapped[str] = mapped_column(String(32), default="pending")
    status_history: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
