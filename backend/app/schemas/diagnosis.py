"""AI 诊断请求/响应模型（阶段九：真实 LLM 接入）。

安全边界：风险等级判断由前端本地规则引擎（utils/risk.ts）完成，
LLM 只产出诊断内容，不参与风险判定。
"""
from pydantic import BaseModel, Field


class DiagnoseRequest(BaseModel):
    """问诊上下文（P1 四步流程收集的全部信息）。"""

    category: str = Field(..., description="ac / fridge / washer / other")
    symptom: str | None = Field(None, description="故障现象卡片标题，自定义描述时为 null")
    description: str = Field("", description="用户自定义故障描述")
    answers: list[str] = Field(default_factory=list, description="AI 问诊逐题回答")
    device_name: str | None = Field(None, description="关联设备名称")
    device_brand: str | None = None
    device_model: str | None = None
    photo_id: int | None = Field(None, description="故障照片 ID（/api/diagnose/photo 上传后返回）")


class PossibleCause(BaseModel):
    title: str
    description: str


class RepairSuggestion(BaseModel):
    title: str
    description: str


class DiagnoseContent(BaseModel):
    """LLM 输出内容：standard / elder 双文案，一次调用同时产出。"""

    conclusion: str
    conclusion_elder: str
    possible_causes: list[PossibleCause] = Field(min_length=1, max_length=4)
    # 看图诊断时模型可能给不出照片证据，允许为空数组
    evidence: list[str] = Field(min_length=0, max_length=6)
    suggestions: list[RepairSuggestion] = Field(min_length=1, max_length=4)
    suggestions_elder: list[RepairSuggestion] = Field(min_length=1, max_length=4)
    # 提示类字段允许模型省略：空值时前端回退本地文案
    tips: str = ""
    tips_elder: str = ""
    risk_note: str = ""
    risk_note_elder: str = ""


class DiagnoseResponse(BaseModel):
    source: str = "ai"
    model: str
    content: DiagnoseContent


class PhotoOut(BaseModel):
    """照片上传结果（base64 存库，前端用它做本地预览与后续诊断关联）。"""

    id: int
    mime: str
    image_base64: str
