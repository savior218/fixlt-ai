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
    option_id: str | None = Field(default=None, max_length=32)
    input_source: Literal["text", "voice", "option"] = "text"
    request_id: str = Field(min_length=4, max_length=64)
    session_version: int = Field(ge=0)


class InterviewFinish(BaseModel):
    session_version: int = Field(ge=0)


class InterviewQuestion(BaseModel):
    id: str
    text: str
    purpose: str
    options: list[dict]


class InterviewQAPoint(BaseModel):
    question_id: str
    question_text: str
    answer: str
    option_id: str | None = None
    unknown: bool = False
    input_source: str = "text"
    selection_source: str | None = None
    asked_at: str


class InterviewFact(BaseModel):
    key: str
    value: str
    label: str | None = None
    evidence: str
    source: str


class InterviewSessionOut(BaseModel):
    session_id: str
    status: Literal["active", "completed", "intercepted"]
    version: int
    round: int
    max_rounds: int
    current_question: InterviewQuestion | None
    qa: list[InterviewQAPoint]
    facts: list[InterviewFact]
    unknown_information: list[str]
    conflicts: list[dict]
    end_reason: str | None
    selection_source: str | None
    selection_note: str | None
    selection_latency_ms: int | None
    kb_version: str
    safety_rules_version: str
    can_finish: bool
