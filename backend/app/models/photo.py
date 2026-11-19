"""诊断故障照片（模块③：图片上传 + AI 看图）。

以 base64 存库而非落盘：Render 免费实例重新部署会丢失本地文件。
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class DiagnosisPhoto(Base):
    __tablename__ = "diagnosis_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    mime: Mapped[str] = mapped_column(String(32))  # image/jpeg / image/png
    image_base64: Mapped[str] = mapped_column(Text)  # 不含 data: 前缀的纯 base64
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class RepairTicketPhoto(Base):
    """报修事项与照片的关联：照片仍只归上传者所有，一张照片最多关联一个事项。"""

    __tablename__ = "repair_ticket_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("repair_tickets.id"), index=True
    )
    photo_id: Mapped[int] = mapped_column(
        ForeignKey("diagnosis_photos.id"), unique=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
