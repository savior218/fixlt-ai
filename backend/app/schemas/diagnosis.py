"""AI 诊断请求 / 模型输出 / 响应模型（阶段十：可信性与安全）。

安全边界：
- 风险等级不接受客户端提交；服务端独立扫描输入并计算风险下限
- 已确认事实由服务端根据用户输入生成，不直接采用模型自述的“事实”
- 模型只负责诊断内容；输出还需通过危险建议检查
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal["ac", "fridge", "washer", "other"]
RiskLevel = Literal["low", "medium", "high"]


class QAItem(BaseModel):
    """单轮问诊：问题 ID、实际展示的问题文本、用户回答、是否未知。"""

    model_config = ConfigDict(extra="forbid")

    question_id: str = Field(min_length=1, max_length=40)
    question_text: str = Field(min_length=1, max_length=160)
    answer: str = Field(min_length=1, max_length=300)
    unknown: bool = False


class ChatTurn(BaseModel):
    """自由问答中的一条对话消息（用户 / 助手）。"""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=600)


class DiagnoseChatRequest(BaseModel):
    """自由聊天式问诊的一轮请求：携带完整对话历史与设备上下文。"""

    model_config = ConfigDict(extra="forbid")

    category: Category
    symptom: str | None = Field(default=None, max_length=80)
    description: str = Field(default="", max_length=500)
    messages: list[ChatTurn] = Field(default_factory=list, max_length=12)
    device_name: str | None = Field(default=None, max_length=64)
    device_brand: str | None = Field(default=None, max_length=64)
    device_model: str | None = Field(default=None, max_length=64)
    photo_id: int | None = None
    tone: Literal["standard", "elder"] = "standard"


class DiagnoseRequest(BaseModel):
    """问诊上下文（严格约束字段长度、类别与问答数量）。"""

    model_config = ConfigDict(extra="forbid")

    category: Category
    symptom: str | None = Field(default=None, max_length=80)
    description: str = Field(default="", max_length=500)
    qa: list[QAItem] = Field(default_factory=list, max_length=12)
    # 自由聊天的完整对话：模型据此理解上下文，qa 仅作为可追溯的问答摘要
    conversation: list[ChatTurn] = Field(default_factory=list, max_length=12)
    device_name: str | None = Field(default=None, max_length=64)
    device_brand: str | None = Field(default=None, max_length=64)
    device_model: str | None = Field(default=None, max_length=64)
    photo_id: int | None = Field(
        default=None, description="故障照片 ID（/api/diagnose/photo 上传后返回）"
    )


class PossibleCause(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=400)


class RepairSuggestion(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=400)


class ModelDiagnosisContent(BaseModel):
    """模型输出内容：standard / elder 双文案，一次调用同时产出。

    不包含 evidence 与风险等级：前者由服务端生成，后者由安全规则引擎判定。
    """

    model_config = ConfigDict(extra="ignore")

    conclusion: str = Field(min_length=5, max_length=600)
    conclusion_elder: str = Field(min_length=5, max_length=600)
    possible_causes: list[PossibleCause] = Field(min_length=1, max_length=4)
    # 看图诊断时模型可能给不出照片证据，允许为空数组
    evidence: list[str] = Field(default_factory=list, max_length=6)
    suggestions: list[RepairSuggestion] = Field(min_length=1, max_length=4)
    suggestions_elder: list[RepairSuggestion] = Field(min_length=1, max_length=4)
    tips: str = Field(default="", max_length=240)
    tips_elder: str = Field(default="", max_length=240)
    risk_note: str = Field(default="", max_length=240)
    risk_note_elder: str = Field(default="", max_length=240)


class DiagnoseContent(ModelDiagnosisContent):
    """返回给前端的完整内容：双文案 + 服务端生成的事实/未知信息。"""

    evidence: list[str] = Field(min_length=1, max_length=8)
    unknown_information: list[str] = Field(default_factory=list, max_length=6)


class DiagnoseResponse(BaseModel):
    source: Literal["ai"] = "ai"
    model: str
    content: DiagnoseContent
    risk_floor: RiskLevel
    risk_matched: list[str] = Field(default_factory=list)
    safety_rules_version: str
    # 登录用户的保存回执：保存报告时服务端据此确认“真实 AI 来源”
    receipt: str | None = None


class ModelChatReply(BaseModel):
    """对话模型输出：本轮回复 + 信息是否足够 + 快捷回答选项。"""

    model_config = ConfigDict(extra="ignore")

    reply: str = Field(min_length=5, max_length=800)
    ready: bool = False
    suggestions: list[str] = Field(default_factory=list, max_length=4)


class DiagnoseChatResponse(BaseModel):
    source: Literal["ai"] = "ai"
    model: str
    reply: str
    ready: bool
    suggestions: list[str] = Field(default_factory=list)
    safety_rules_version: str


class PhotoOut(BaseModel):
    """照片上传结果（base64 存库，前端用它做本地预览与后续诊断关联）。"""

    id: int
    mime: str
    image_base64: str
