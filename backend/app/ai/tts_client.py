"""云端语音合成客户端：百度短文本在线合成 / 智谱 GLM-TTS。

- 仅在浏览器不支持 Web Speech、或原生合成失败时调用
- Key 只存于后端环境变量，不下发前端
- 非流式返回音频字节（优先 WAV），便于移动端直接用 <audio> 播放
- 供应商通过 FIXITAI_TTS_PROVIDER 切换，默认百度（有免费测试额度）
"""
from __future__ import annotations

import logging
import time

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ZHIPU_TTS_PATH = "/audio/speech"

# 智谱当前提供的系统音色
ZHIPU_VOICES = (
    "tongtong",
    "chuichui",
    "xiaochen",
    "jam",
    "kazi",
    "douji",
    "luodo",
)

# 百度 access_token 有效期 30 天；这里提前 5 分钟过期，避免边界失效
_TOKEN_SAFETY_SECONDS = 300
_token_cache: tuple[str, float] | None = None


class TTSError(RuntimeError):
    """语音合成失败；code 用于 API 层分类，message 只写日志。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def provider_name() -> str:
    """当前生效的供应商；用于缓存键，切换供应商后不会复用旧音频。"""
    return settings.tts_provider


def is_configured() -> bool:
    if provider_name() == "baidu":
        return bool(settings.baidu_tts_api_key and settings.baidu_tts_secret_key)
    return bool(settings.ai_api_key)


def default_voice() -> str:
    if provider_name() == "baidu":
        return settings.baidu_tts_voice or "0"
    return settings.tts_voice


def media_type_of(content: bytes) -> str:
    """按文件头判断音频类型；无法识别时返回空串。"""
    if content[:4] == b"RIFF":
        return "audio/wav"
    if content[:3] == b"ID3" or content[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg"
    return ""


def _json_body(resp: httpx.Response) -> dict:
    try:
        data = resp.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _zhipu_error(resp: httpx.Response) -> tuple[str, str]:
    """提取智谱错误码与说明；只用于分类和日志，不回显给终端用户。"""
    error = _json_body(resp).get("error")
    if not isinstance(error, dict):
        return "", ""
    return str(error.get("code", "")), str(error.get("message", ""))


def _raise_baidu_error(err_no: str, message: str) -> None:
    """把百度 err_no / err_msg 归一到统一错误码。"""
    if any(k in message for k in ("额度", "配额", "余额", "资源包", "欠费")):
        raise TTSError("quota_exhausted", message or f"百度语音额度不足（{err_no}）")
    if err_no == "502" or "token" in message.lower():
        raise TTSError("auth", message or "百度语音 token 校验失败")
    if err_no == "508":
        raise TTSError("auth", message or "百度语音未授权，请检查 API Key / 应用状态")
    if err_no == "504" or any(k in message for k in ("频率", "并发", "限额", "超限")):
        raise TTSError("rate_limited", message or "百度语音请求超过限额")
    if err_no in {"500", "501", "506", "507"}:
        raise TTSError("bad_request", message or f"百度语音参数不合法（{err_no}）")
    raise TTSError("upstream", message or f"百度语音返回错误 {err_no}")


def _baidu_per(voice: str | None) -> int:
    if voice and voice.isdigit():
        return int(voice)
    return 0


def _baidu_speed(speed: float) -> int:
    """前端语速 0.5-2.0 映射到百度 0-15 档位（1.0 对应默认 5）。"""
    return max(0, min(15, round(speed * 5)))


async def _baidu_token(client: httpx.AsyncClient) -> str:
    """获取并缓存 access_token；并发重复获取无害，因此不加锁。"""
    global _token_cache
    now = time.monotonic()
    if _token_cache is not None and _token_cache[1] > now:
        return _token_cache[0]

    try:
        resp = await client.post(
            settings.baidu_tts_token_url,
            params={
                "grant_type": "client_credentials",
                "client_id": settings.baidu_tts_api_key,
                "client_secret": settings.baidu_tts_secret_key,
            },
        )
    except httpx.TimeoutException as exc:
        raise TTSError("timeout", "百度语音鉴权请求超时") from exc
    except httpx.HTTPError as exc:
        raise TTSError("network", "百度语音鉴权网络错误") from exc

    data = _json_body(resp)
    token = data.get("access_token")
    if resp.status_code >= 400 or not isinstance(token, str) or not token:
        description = str(
            data.get("error_description") or data.get("error") or resp.status_code
        )
        logger.warning("百度语音鉴权失败：%s", description[:200])
        raise TTSError("auth", f"百度语音鉴权失败：{description}")

    expires_in = data.get("expires_in")
    ttl = (
        int(expires_in)
        if isinstance(expires_in, (int, float)) and expires_in > _TOKEN_SAFETY_SECONDS
        else 3600
    )
    _token_cache = (token, now + ttl - _TOKEN_SAFETY_SECONDS)
    return token


async def _synthesize_baidu(text: str, voice: str | None, speed: float) -> bytes:
    if len(text.encode("utf-8")) >= 1024:
        raise TTSError("text_too_long", "百度语音单次合成文本超过 1024 字节")

    timeout = httpx.Timeout(settings.tts_timeout_seconds, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        token = await _baidu_token(client)
        try:
            resp = await client.post(
                settings.baidu_tts_endpoint,
                data={
                    "tex": text,
                    "tok": token,
                    "cuid": "fixitai-web",
                    "ctp": "1",
                    "lan": "zh",
                    "spd": str(_baidu_speed(speed)),
                    "pit": str(settings.baidu_tts_pitch),
                    "vol": str(settings.baidu_tts_volume),
                    "per": str(_baidu_per(voice)),
                    "aue": "6",
                },
            )
        except httpx.TimeoutException as exc:
            raise TTSError("timeout", "百度语音合成请求超时") from exc
        except (httpx.HTTPError, UnicodeError) as exc:
            raise TTSError("network", "百度语音合成网络错误") from exc

    content = resp.content
    content_type = resp.headers.get("content-type", "").lower()
    # 百度出错时仍可能返回 HTTP 200，但响应体是 JSON
    if "json" in content_type or content[:1] == b"{":
        data = _json_body(resp)
        err_no = str(data.get("err_no", ""))
        err_msg = str(data.get("err_msg", ""))
        logger.warning(
            "百度语音合成错误 status=%s err_no=%s err_msg=%s",
            resp.status_code,
            err_no,
            err_msg[:200],
        )
        _raise_baidu_error(err_no, err_msg)

    if resp.status_code >= 400:
        logger.warning("百度语音合成失败 status=%s", resp.status_code)
        raise TTSError("upstream", f"百度语音返回 {resp.status_code}")

    if not media_type_of(content):
        logger.warning("百度语音返回了无法识别的音频：%s bytes", len(content))
        raise TTSError("bad_response", "百度语音返回内容不是有效音频")

    return content


async def _synthesize_zhipu(text: str, voice: str | None, speed: float) -> bytes:
    payload = {
        "model": settings.tts_model,
        "input": text,
        "voice": voice or settings.tts_voice,
        "speed": speed,
        "response_format": "wav",
        "stream": False,
    }
    url = settings.ai_base_url.rstrip("/") + ZHIPU_TTS_PATH
    headers = {
        "Authorization": f"Bearer {settings.ai_api_key}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(settings.tts_timeout_seconds, connect=10.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        raise TTSError("timeout", "语音合成请求超时") from exc
    except (httpx.HTTPError, UnicodeError) as exc:
        raise TTSError("network", "语音合成网络错误") from exc

    if resp.status_code in {401, 403}:
        raise TTSError("auth", f"语音合成鉴权失败：{resp.status_code}")
    if resp.status_code == 429:
        provider_code, provider_message = _zhipu_error(resp)
        if (
            provider_code == "1113"
            or "余额" in provider_message
            or "资源包" in provider_message
        ):
            raise TTSError(
                "quota_exhausted",
                provider_message or "语音合成额度不足",
            )
        raise TTSError("rate_limited", provider_message or "语音合成供应商限流")
    if resp.status_code >= 400:
        provider_code, provider_message = _zhipu_error(resp)
        logger.warning(
            "语音合成供应商错误 status=%s code=%s message=%s",
            resp.status_code,
            provider_code,
            provider_message[:200],
        )
        raise TTSError("upstream", f"语音合成供应商返回 {resp.status_code}")

    content = resp.content
    # 非流式 WAV 至少包含 44 字节头；顺便拦截供应商用 200 返回 JSON 错误的情况
    if len(content) < 44 or content[:4] != b"RIFF":
        logger.warning("语音合成返回了非 WAV 内容：%s bytes", len(content))
        raise TTSError("bad_response", "语音合成返回内容不是有效音频")

    return content


async def synthesize(text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
    """按当前供应商合成一段音频。

    文本长度与音色由调用方校验；这里只负责协议与错误分类。
    """
    if not is_configured():
        raise TTSError("not_configured", "未配置云端语音合成密钥")

    chosen = voice or default_voice()
    if provider_name() == "baidu":
        return await _synthesize_baidu(text, chosen, speed)
    return await _synthesize_zhipu(text, chosen, speed)
