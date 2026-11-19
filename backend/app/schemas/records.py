"""云端诊断报告与维修记录：保存 / 查询 / 更新 / 本机历史导入。

安全边界：
- 所有接口由可信登录会话决定归属，客户端不能指定 user_id
- source=ai 必须携带服务端签发的诊断回执；回执验证失败不按 AI 保存
- 本机导入记录标记 imported=True 且 verified=False，不冒充已验证的 AI 结果
"""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal["ac", "fridge", "washer", "other"]
RiskLevel = Literal["low", "medium", "high"]
DiagnosisSource = Literal["ai", "template", "unknown"]
RepairStatus = Literal["pending", "recovered", "partial", "failed"]
# 前端展示枚举（服务端内部映射为 PRD 验证状态）
VerificationStatus = Literal[
    "unverified", "recovered", "partial", "notRecovered", "unknown"
]

VERIFICATION_TO_DB = {
    "unverified": "pending",
    "recovered": "recovered",
    "partial": "partially_recovered",
    "notRecovered": "not_recovered",
    "unknown": "unconfirmed",
}
DB_TO_VERIFICATION = {v: k for k, v in VERIFICATION_TO_DB.items()}


class QAItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: str = Field(min_length=1, max_length=40)
    question_text: str = Field(min_length=1, max_length=160)
    answer: str = Field(min_length=1, max_length=300)
    unknown: bool = False


class ContentItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=400)


class DiagnosisContent(BaseModel):
    """单套文案（标准 / 长辈），与前端 DiagnosisContent 一致。"""

    model_config = ConfigDict(extra="forbid")

    conclusion: str = Field(default="", max_length=600)
    possible_causes: list[ContentItem] = Field(default_factory=list, max_length=4)
    evidence: list[str] = Field(default_factory=list, max_length=8)
    unknown_information: list[str] = Field(default_factory=list, max_length=6)
    suggestions: list[ContentItem] = Field(default_factory=list, max_length=4)
    tips: str | None = Field(default=None, max_length=240)
    risk_note: str | None = Field(default=None, max_length=240)


class ContentPair(BaseModel):
    model_config = ConfigDict(extra="forbid")

    standard: DiagnosisContent
    elder: DiagnosisContent | None = None


class DiagnosisSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_ref: str = Field(min_length=4, max_length=64)
    device_id: int | None = None
    device_name: str | None = Field(default=None, max_length=64)
    category: Category | None = None
    symptom: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=500)
    source: DiagnosisSource = "unknown"
    ai_model: str | None = Field(default=None, max_length=64)
    risk_level: RiskLevel | None = None
    risk_rules_version: str | None = Field(default=None, max_length=32)
    qa: list[QAItem] = Field(default_factory=list, max_length=4)
    content: ContentPair
    receipt: str | None = Field(default=None, max_length=2048)
    created_at: datetime | None = None
    imported: bool = False


class DiagnosisOut(BaseModel):
    id: int
    client_ref: str
    device_id: int | None
    device_name: str | None
    category: str | None
    symptom: str
    description: str
    source: str
    ai_model: str | None
    risk_level: str
    risk_rules_version: str | None
    qa: list[QAItem]
    content: ContentPair
    verified: bool
    imported: bool
    created_at: datetime


class DiagnosisImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[DiagnosisSave] = Field(min_length=1, max_length=200)


class RepairSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_ref: str = Field(min_length=4, max_length=64)
    device_id: int | None = None
    device_name: str = Field(default="未关联设备", max_length=64)
    diagnosis_ref: str | None = Field(default=None, max_length=64)
    diagnosis_source: DiagnosisSource | None = None
    fault_description: str = Field(default="", max_length=1000)
    repair_method: str = Field(default="", max_length=2000)
    repair_time: date | None = None
    technician: str | None = Field(default=None, max_length=64)
    cost: float | None = Field(default=None, ge=0, le=1_000_000)
    status: RepairStatus = "pending"
    images: list[str] = Field(default_factory=list, max_length=9)
    verification_status: VerificationStatus = "unverified"
    created_at: datetime | None = None
    imported: bool = False


class RepairUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verification_status: VerificationStatus | None = None
    status: RepairStatus | None = None
    technician: str | None = Field(default=None, max_length=64)
    repair_method: str | None = Field(default=None, max_length=2000)
    repair_time: date | None = None
    cost: float | None = Field(default=None, ge=0, le=1_000_000)


class RepairOut(BaseModel):
    id: int
    client_ref: str
    device_id: int | None
    device_name: str
    diagnosis_ref: str | None
    diagnosis_source: str | None
    fault_description: str
    repair_method: str
    repair_time: date | None
    technician: str | None
    cost: float | None
    status: str
    images: list[str]
    verification_status: str
    imported: bool
    created_at: datetime
    updated_at: datetime | None


class RepairImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[RepairSave] = Field(min_length=1, max_length=200)
