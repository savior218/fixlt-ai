from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, index=True
    )
    interaction_mode: Mapped[str] = mapped_column(String(32), default="standard")
    font_scale: Mapped[str] = mapped_column(String(16), default="normal")
    voice_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    voice_speed: Mapped[float] = mapped_column(Float, default=1.0)
    high_contrast: Mapped[bool] = mapped_column(Boolean, default=False)
    reduce_motion: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="preferences")
