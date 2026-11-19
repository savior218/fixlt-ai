"""报修工单请求/响应模型（模块②：报修工单闭环）。"""

import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.repair import TICKET_STATUSES


class TicketCreate(BaseModel):
    """创建报修工单入参。"""

    category: str = Field(..., max_length=32, description="设备类型 ac/fridge/washer/tv/other")
    symptom: str = Field(..., max_length=64, description="故障现象")
    description: str | None = Field(None, max_length=2000, description="故障描述")
    brand: str | None = Field(None, max_length=64)
    model: str | None = Field(None, max_length=64)
    found_at: str | None = Field(None, max_length=32, description="发现时间（yyyy-mm-dd）")
    checks: list[str] = Field(default_factory=list, description="已完成的检查")
    content: str = Field(..., min_length=1, description="报修说明全文")
    device_id: int | None = None
    diagnosis_ref: str | None = Field(None, max_length=64, description="关联的前端本地诊断 ID")


class TicketStatusUpdate(BaseModel):
    status: Literal["pending", "accepted", "in_progress", "completed"]


class TicketStatusPoint(BaseModel):
    status: str
    at: str  # ISO 时间


class TicketOut(BaseModel):
    id: int
    device_id: int | None
    diagnosis_ref: str | None
    category: str
    brand: str | None
    model: str | None
    symptom: str
    description: str | None
    found_at: str | None
    checks: list[str]
    content: str
    status: str
    status_history: list[TicketStatusPoint]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("checks", "status_history", mode="before")
    @classmethod
    def _parse_json_str(cls, v):
        """ORM 里存的是 JSON 字符串，响应前解析为数组。"""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return []
        return v
