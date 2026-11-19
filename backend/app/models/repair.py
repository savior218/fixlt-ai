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

# 旧工单状态机（仅用于历史数据展示，不再产生“已受理/维修中”等未经确认的事实）
TICKET_STATUSES = ("pending", "accepted", "in_progress", "completed")
TICKET_STATUS_LABELS = {
    "pending": "待受理",
    "accepted": "已受理",
    "in_progress": "维修中",
    "completed": "已完成",
}

# 用户自报进度：只代表用户自己的联系/预约情况，不代表维修方确认
PROGRESS_STATUSES = (
    "pending_contact",
    "contacted",
    "scheduled",
    "completed",
    "canceled",
)
PROGRESS_STATUS_LABELS = {
    "pending_contact": "待联系",
    "contacted": "已联系",
    "scheduled": "已预约",
    "completed": "已完成",
    "canceled": "已取消",
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
    # 客户端幂等标识：同一用户下唯一，超时重试返回同一条，不产生重复工单
    client_ref: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
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
    # 旧状态机字段：保留旧数据原值，不由新流程改写
    status: Mapped[str] = mapped_column(String(32), default="pending")
    status_history: Mapped[str] = mapped_column(Text, default="[]")
    # 用户自报进度（与旧状态分开，避免把用户操作当成维修方受理）
    progress_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    progress_history: Mapped[str] = mapped_column(Text, default="[]")
    progress_updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    contact_target: Mapped[str | None] = mapped_column(String(128), nullable=True)
    contacted_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    appointment_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contact_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 关联已有维修结果：只关联，不复制，避免与 /api/repairs 记录重复
    repair_record_id: Mapped[int | None] = mapped_column(
        ForeignKey("repair_records.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
