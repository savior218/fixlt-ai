from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class DiagnosisMessage(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    diagnosis_id: Mapped[int] = mapped_column(
        ForeignKey("diagnoses.id"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))  # user | assistant | system
    content: Mapped[str] = mapped_column(Text)
    attachments: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    diagnosis: Mapped["Diagnosis"] = relationship(back_populates="messages")
