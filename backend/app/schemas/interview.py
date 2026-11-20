"""动态追问 API 的请求/响应模型。"""
from typing import Literal

from pydantic import BaseModel, Field


class InterviewStart(BaseModel):
    category: Literal["ac"] = "ac"
    symptom: str = Field(default="not_cooling", max_length=32)
    description: str = Field(min_length=1, max_length=500)
    photo_id: int | None = None


class InterviewAnswer(BaseModel):
    question_id: str = Field(min_length=1, max_length=40)
    answer: str = Field(min_length=1, max_length=300)
    option_id: str | None = Field(default=None, max_length=64)
    input_source: Literal["text", "voice", "option"] = "text"
    request_id: str = Field(min_length=4, max_length=64)
    session_version: int = Field(ge=0)


class InterviewFinish(BaseModel):
    session_version: int = Field(ge=0)


class InterviewOption(BaseModel):
    id: str
    label: str
    unknown: bool = False


class InterviewQuestion(BaseModel):
    id: str
    text: str
    purpose: str
    options: list[InterviewOption]


class InterviewQAPoint(BaseModel):
    question_id: str
    question_text: str
    answer: str
    option_id: str | None = None
    unknown: bool = False
    input_source: str = "text"
    selection_source: str | None = None
    asked_at: str


class InterviewCause(BaseModel):
    title: str
    description: str = ""


class InterviewRecommendation(BaseModel):
    summary: str
    possible_causes: list[InterviewCause] = Field(default_factory=list)
    unknown_information: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


class InterviewCannot(BaseModel):
    reason: str
    next_step: str


class InterviewSessionOut(BaseModel):
    session_id: str
    status: Literal["active", "completed", "intercepted"]
    version: int
    round: int
    max_rounds: int
    photo_id: int | None = None
    current_question: InterviewQuestion | None
    qa: list[InterviewQAPoint]
    known_information: list[str]
    unknown_information: list[str]
    conflicts: list[str]
    end_reason: str | None
    recommendation: InterviewRecommendation | None = None
    cannot: InterviewCannot | None = None
    selection_source: str | None
    selection_note: str | None
    model_calls: int = 0
    model_latency_ms: int = 0
    kb_version: str
    safety_rules_version: str
    can_finish: bool
