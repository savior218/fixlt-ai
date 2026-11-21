"""语音合成端点：浏览器不支持 Web Speech 时的云端兜底。

POST /api/tts
- 入参：文本（≤1024 字）、可选音色与语速
- 出参：audio/wav
- 安全：Key 仅在后端；按用户 / IP 独立限流；相同文本命中缓存不重复计费
- 失败：返回结构化错误码，前端降级为文字阅读或提示手动重试
"""
from __future__ import annotations

import logging
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.ai import tts_client
from app.api.deps import AuthContext, get_optional_auth
from app.core.config import settings
from app.schemas.tts import TtsRequest
from app.services.limiter import RateLimitExceeded, get_tts_limiter
from app.services.tts_cache import get_tts_cache

router = APIRouter(prefix="/api/tts", tags=["tts"])
logger = logging.getLogger(__name__)


def _error(status_code: int, code: str, message: str) -> NoReturn:
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def _client_key(request: Request, ctx: AuthContext | None) -> str:
    if ctx is not None:
        return f"user:{ctx.user.id}"
    host = request.client.host if request.client else "unknown"
    return f"ip:{host}"


async def _limit(request: Request, ctx: AuthContext | None) -> None:
    limiter = get_tts_limiter()
    limit = (
        settings.tts_rate_limit_per_minute
        if ctx is not None
        else settings.tts_guest_rate_limit_per_minute
    )
    try:
        await limiter.hit(_client_key(request, ctx), limit)
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "朗读请求过于频繁，请稍后再试",
            },
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc


@router.post("")
async def synthesize_speech(
    payload: TtsRequest,
    request: Request,
    ctx: AuthContext | None = Depends(get_optional_auth),
) -> Response:
    """把一段文本合成为 WAV；失败时不返回伪音频。"""
    text = payload.text.strip()
    if not text:
        _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "empty_text",
            "朗读文本不能为空",
        )
    if len(text) > settings.tts_max_input_chars:
        _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "text_too_long",
            f"单次朗读最多 {settings.tts_max_input_chars} 字",
        )
    # 百度按 UTF-8 字节限制（中文约 3 字节/字），提前拦截避免供应商报错
    if (
        tts_client.provider_name() == "baidu"
        and len(text.encode("utf-8")) > settings.tts_max_input_bytes
    ):
        _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "text_too_long",
            "单次朗读文本过长，请分段朗读",
        )

    await _limit(request, ctx)

    voice = payload.voice or tts_client.default_voice()
    speed = round(payload.speed, 2)
    cache = get_tts_cache()
    cache_key = cache.make_key(
        tts_client.provider_name(), text, voice, speed
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(
            content=cached,
            media_type=tts_client.media_type_of(cached) or "audio/wav",
            headers={
                "Cache-Control": "private, max-age=3600",
                "X-TTS-Cache": "hit",
            },
        )

    try:
        audio = await tts_client.synthesize(text, voice=voice, speed=speed)
    except tts_client.TTSError as exc:
        logger.warning(
            "语音合成失败 code=%s chars=%s", exc.code, len(text)
        )
        if exc.code == "timeout":
            _error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "tts_timeout",
                "朗读服务响应超时，请稍后重试",
            )
        if exc.code == "rate_limited":
            _error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "tts_busy",
                "朗读服务繁忙，请稍后重试",
            )
        if exc.code == "quota_exhausted":
            _error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "tts_quota_exhausted",
                "云端朗读额度不足，暂时无法使用",
            )
        if exc.code == "text_too_long":
            _error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "text_too_long",
                "单次朗读文本过长，请分段朗读",
            )
        _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "tts_unavailable",
            "云端朗读暂不可用，请稍后重试",
        )

    cache.put(cache_key, audio)
    return Response(
        content=audio,
        media_type=tts_client.media_type_of(audio) or "audio/wav",
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-TTS-Cache": "miss",
        },
    )
