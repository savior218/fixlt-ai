"""智谱 GLM 文本模型客户端（OpenAI 兼容协议）。

- key 仅存于后端环境变量（FIXITAI_AI_API_KEY），绝不进入前端
- 统一要求 JSON 输出，并对空输出 / 代码围栏 / 非对象 / 超长内容做严格解析
- 错误按类别抛出，由 API 层转换为面向用户的简洁提示
"""
from __future__ import annotations

import json
import logging
import re

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

CHAT_COMPLETIONS_PATH = "/chat/completions"
MAX_OUTPUT_CHARS = 20_000

_FENCE_RE = re.compile(r"^```(?:json|JSON)?\s*(.*?)\s*```$", re.DOTALL)


class GLMError(RuntimeError):
    """GLM 调用失败（网络 / 鉴权 / 限流 / 输出解析）。

    code 用于前端分类与用户提示，message 仅用于服务端日志，不直接返回给用户。
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def is_configured() -> bool:
    return bool(settings.ai_api_key)


def parse_json_object(content: str) -> dict:
    """把模型输出解析为 JSON 对象，容忍标准 markdown 代码围栏。"""
    if not content or not content.strip():
        raise GLMError("empty_output", "模型返回空内容")

    text = content.strip()
    if len(text) > MAX_OUTPUT_CHARS:
        raise GLMError("oversize_output", f"模型输出超过 {MAX_OUTPUT_CHARS} 字符")

    fence = _FENCE_RE.match(text)
    if fence:
        text = fence.group(1).strip()

    # 少数情况下模型会在 JSON 前后附加说明文字：截取首个 { 到最后一个 }
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]

    try:
        obj = json.loads(text)
    except json.JSONDecodeError as e:
        raise GLMError("bad_json", f"JSON 解析失败：{e}") from e

    if not isinstance(obj, dict):
        raise GLMError("invalid_shape", "模型输出不是 JSON 对象")
    return obj


async def chat_json(
    system: str,
    user: str,
    image: dict | None = None,
    model: str | None = None,
    max_tokens: int | None = None,
) -> dict:
    """单轮调用：把 user 作为唯一用户消息，返回解析后的 JSON dict。"""
    return await chat_json_messages(
        system,
        [{"role": "user", "content": user}],
        image=image,
        model=model,
        max_tokens=max_tokens,
    )


def _attach_image(messages: list[dict], image: dict) -> list[dict]:
    """把图片附到最近一条用户消息上（多轮对话中即用户的新问题）。"""
    out = [dict(message) for message in messages]
    for index in range(len(out) - 1, -1, -1):
        if out[index].get("role") == "user":
            content = out[index].get("content") or ""
            out[index]["content"] = [
                {"type": "text", "text": content},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{image['mime']};base64,{image['base64']}"
                    },
                },
            ]
            return out
    out.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{image['mime']};base64,{image['base64']}"
                    },
                }
            ],
        }
    )
    return out


async def _request_content(
    system: str,
    messages: list[dict],
    image: dict | None = None,
    model: str | None = None,
    max_tokens: int | None = None,
    json_mode: bool = True,
) -> str:
    """调用 GLM chat/completions，返回 assistant 的原始文本内容。"""
    if not is_configured():
        raise GLMError("not_configured", "GLM API key 未配置（FIXITAI_AI_API_KEY）")

    history = [dict(message) for message in messages]
    if image:
        history = _attach_image(history, image)

    payload = {
        "model": model or settings.ai_text_model,
        "messages": [{"role": "system", "content": system}, *history],
        "temperature": 0.4,
        "max_tokens": max_tokens or settings.ai_max_output_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    url = settings.ai_base_url.rstrip("/") + CHAT_COMPLETIONS_PATH
    headers = {"Authorization": f"Bearer {settings.ai_api_key}"}

    timeout = httpx.Timeout(settings.ai_timeout_seconds, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException as e:
        raise GLMError("timeout", f"GLM 请求超时：{e}") from e
    except (httpx.HTTPError, UnicodeError) as e:
        raise GLMError("network", f"GLM 网络请求失败：{e}") from e

    if resp.status_code == 401 or resp.status_code == 403:
        logger.warning("GLM 鉴权失败 HTTP %s", resp.status_code)
        raise GLMError("auth", "GLM 鉴权失败")
    if resp.status_code == 429:
        logger.warning("GLM 限流 HTTP 429: %s", resp.text[:200])
        raise GLMError("rate_limited", "GLM 接口限流")
    if resp.status_code >= 500:
        logger.warning("GLM 服务异常 HTTP %s: %s", resp.status_code, resp.text[:200])
        raise GLMError("upstream", f"GLM 服务异常 HTTP {resp.status_code}")
    if resp.status_code != 200:
        logger.warning("GLM 接口返回 %s: %s", resp.status_code, resp.text[:200])
        raise GLMError("http", f"GLM 接口错误 HTTP {resp.status_code}")

    try:
        data = resp.json()
    except ValueError as e:
        raise GLMError("bad_response", f"GLM 响应不是 JSON：{e}") from e

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise GLMError("bad_response", f"GLM 响应结构异常：{e}") from e
    if not isinstance(content, str):
        raise GLMError("bad_response", "GLM 响应内容不是文本")
    return content


async def chat_json_messages(
    system: str,
    messages: list[dict],
    image: dict | None = None,
    model: str | None = None,
    max_tokens: int | None = None,
) -> dict:
    """多轮对话调用：messages 为 [{"role": "user"|"assistant", "content": str}]。

    image（可选）：{"mime": "image/jpeg", "base64": "..."}，传入时以
    OpenAI 兼容的 image_url 消息格式附在最近一条用户消息上（模块③ AI 看图）。
    model（可选）：覆盖默认文本模型（看图时使用视觉模型）。
    """
    content = await _request_content(
        system,
        messages,
        image=image,
        model=model,
        max_tokens=max_tokens,
        json_mode=True,
    )
    return parse_json_object(content)


async def chat_reply_messages(
    system: str,
    messages: list[dict],
    image: dict | None = None,
    model: str | None = None,
    max_tokens: int | None = None,
) -> dict:
    """自由聊天专用：优先按 JSON 解析；模型不支持 JSON 时回退为纯文本回复。

    部分轻量模型（如 glm-4-flash）会忽略 response_format 直接返回自然语言。
    对话场景可直接把这段文字作为 reply，避免整轮对话失败。
    """
    content = await _request_content(
        system,
        messages,
        image=image,
        model=model,
        max_tokens=max_tokens,
        json_mode=True,
    )
    try:
        obj = parse_json_object(content)
    except GLMError as e:
        if e.code not in {"bad_json", "invalid_shape", "oversize_output"}:
            raise
        text = content.strip()
        if not text:
            raise GLMError("empty_output", "模型返回空内容") from e
        return {"reply": text[:800], "ready": False, "suggestions": []}

    if not isinstance(obj.get("reply"), str) or not obj["reply"].strip():
        raise GLMError("invalid_shape", "对话 JSON 缺少 reply 字段")
    return obj
