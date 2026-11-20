"""报修事项请求/响应模型（模块②：个人报修跟踪）。

- 旧工单状态保留在 status/status_history 中，只读展示
- 新流程使用 progress_status：用户自报“待联系/已联系/已预约/已完成/已取消”
- 不产生“维修方已受理/维修中”等未经确认的事实
"""

import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.repair import PROGRESS_STATUSES

ProgressStatus = Literal[
    "pending_contact", "contacted", "scheduled", "completed", "canceled"
]


class TicketCreate(BaseModel):
    """保存报修事项入参。"""

    client_ref: str | None = Field(
        default=None, min_length=4, max_length=64, description="客户端幂等标识"
    )
    category: str = Field(..., max_length=32, description="设备类型 ac/fridge/washer/tv/other")
    symptom: str = Field(..., min_length=1, max_length=64, description="故障现象")
    description: str | None = Field(None, max_length=2000, description="故障描述")
    brand: str | None = Field(None, max_length=64)
    model: str | None = Field(None, max_length=64)
    found_at: str | None = Field(None, max_length=32, description="发现时间（yyyy-mm-dd）")
    checks: list[str] = Field(default_factory=list, max_length=20, description="已完成的检查")
    content: str = Field(..., min_length=1, max_length=8000, description="报修说明全文")
    device_id: int | None = None
    diagnosis_ref: str | None = Field(None, max_length=64, description="关联的前端本地诊断 ID")
    photo_ids: list[int] = Field(default_factory=list, max_length=3)


class TicketProgressUpdate(BaseModel):
    """用户自报进度与联系信息。"""

    progress_status: ProgressStatus
    contact_target: str | None = Field(None, max_length=128)
    contacted_at: str | None = Field(None, max_length=32)
    appointment_at: str | None = Field(None, max_length=32)
    contact_note: str | None = Field(None, max_length=2000)


class TicketStatusPoint(BaseModel):
    status: str
    at: str  # ISO 时间
    by: str | None = None
    source: str | None = None


class TicketOut(BaseModel):
    id: int
    client_ref: str | None
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
    # 旧状态：原样保留，前端明确标注“旧状态”
    status: str
    status_history: list[TicketStatusPoint]
    # 用户自报进度
    progress_status: str | None
    progress_history: list[TicketStatusPoint]
    progress_updated_by: str | None
    contact_target: str | None
    contacted_at: str | None
    appointment_at: str | None
    contact_note: str | None
    repair_record_id: int | None
    photo_ids: list[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("checks", "status_history", "progress_history", mode="before")
    @classmethod
    def _parse_json_str(cls, v):
        """ORM 里存的是 JSON 字符串，响应前解析为数组。"""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return []
        return v


class TicketPage(BaseModel):
    items: list[TicketOut]
    total: int
    page: int
    page_size: int


class LinkRepairRecord(BaseModel):
    repair_record_id: int | None = Field(
        default=None, description="传 null 表示取消关联"
    )


# 供路由校验使用
PROGRESS_VALUES = set(PROGRESS_STATUSES)
