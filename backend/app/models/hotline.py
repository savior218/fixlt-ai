"""品牌官方售后电话目录（结构化字段，前台只读展示，不代用户报修）。"""
from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class HotlineDirectory(Base):
    """一条品牌 / 服务体系的官方售后联系方式。

    号码与来源均按导入资料原样保存，不做模型补全或改写；display_enabled
    为 false 的记录（如证据冲突的小米）不进入前台可拨打目录。
    """

    __tablename__ = "hotline_directory"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    brand_id: Mapped[str] = mapped_column(String(64), index=True)
    brand: Mapped[str] = mapped_column(String(128))
    brand_group: Mapped[str] = mapped_column(String(128), index=True)
    aliases: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组
    phone: Mapped[str] = mapped_column(String(32))
    phone_uri: Mapped[str] = mapped_column(String(64))
    region: Mapped[str | None] = mapped_column(String(32), nullable=True)
    categories: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组
    category_mapping_basis: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    web_status: Mapped[str] = mapped_column(String(32), index=True)
    web_checked_on: Mapped[str] = mapped_column(String(10))
    phone_test_status: Mapped[str] = mapped_column(String(32))
    phone_tested_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    hours: Mapped[str | None] = mapped_column(String(128), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_review_on: Mapped[str] = mapped_column(String(10))
    display_enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    evidence_level: Mapped[str | None] = mapped_column(String(64), nullable=True)
