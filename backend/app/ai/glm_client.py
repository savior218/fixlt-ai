"""智谱 GLM 文本模型客户端（OpenAI 兼容协议，阶段九）。

- key 仅存于后端环境变量（FIXITAI_AI_API_KEY），绝不进入前端
- 统一输出 JSON（response_format: json_object + 严格解析双保险）
"""
import json
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

CHAT_COMPLETIONS_PATH = "/chat/completions"


class GLMError(RuntimeError):
    """GLM 调用失败（网络 / 鉴权 / 输出解析）。"""


def is_configured() -> bool:
    return bool(settings.ai_api_key)


def _parse_json(content: str) -> dict:
    """解析模型输出为 JSON，容忍 markdown 代码围栏。"""
    text = content.strip()
    if text.startswith("```"):
        text = text.split("`", 2)[-1] if text.count("`") >= 2 else text
        # 去掉 ```json / ``` 围栏行
        if text.startswith("json"):
            text = text[4:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise GLMError(f"GLM 输出 JSON 解析失败：{e}") from e


async def chat_json(system: str, user: str) -> dict:
    """调用 GLM chat/completions，返回解析后的 JSON dict。"""
    if not is_configured():
        raise GLMError("GLM API key 未配置（FIXITAI_AI_API_KEY）")

    payload = {
        "model": settings.ai_text_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
    }
    url = settings.ai_base_url.rstrip("/") + CHAT_COMPLETIONS_PATH
    headers = {"Authorization": f"Bearer {settings.ai_api_key}"}

    try:
        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except (httpx.HTTPError, UnicodeError) as e:
        raise GLMError(f"GLM 网络请求失败：{e}") from e

    if resp.status_code != 200:
        logger.warning("GLM 接口返回 %s: %s", resp.status_code, resp.text[:300])
        raise GLMError(f"GLM 接口错误 HTTP {resp.status_code}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise GLMError(f"GLM 响应结构异常：{e}") from e

    return _parse_json(content)
