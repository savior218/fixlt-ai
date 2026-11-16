from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class Diagnosis(Base):
    __tablename__ = "diagnoses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id"), nullable=True, index=True
    )
    symptoms: Mapped[str] = mapped_column(Text, default="")
    image_urls: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组
    diagnosis_result: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    risk_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    decision_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
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
