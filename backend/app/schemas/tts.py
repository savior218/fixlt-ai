"""语音合成接口的请求模型。"""
from __future__ import annotations

from pydantic import BaseModel, Field


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1024)
    # 百度为发音人编号（如 "0"），智谱为音色名（如 "tongtong"）
    voice: str | None = Field(default=None, max_length=32)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
