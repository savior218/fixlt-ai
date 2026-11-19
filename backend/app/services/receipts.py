"""诊断回执：证明某次 AI 结果确由服务端调用模型生成。

保存 source=ai 的报告时，客户端必须提交回执；服务端校验回执签名、
提问内容摘要、风险下限与模型名，避免客户端伪造“真实 AI”来源。
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json

from app.core.config import settings

_SIGN_VERSION = 1


def _secret() -> bytes:
    return (settings.session_secret or "dev-insecure-receipt").encode("utf-8")


def _canonical(payload: dict) -> bytes:
    return json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def input_digest(
    *,
    category: str | None,
    symptom: str | None,
    description: str,
    qa: list[dict],
) -> str:
    """对“用户输入 + 问答”取摘要；保存时必须与生成时一致。"""
    return hashlib.sha256(
        _canonical(
            {
                "category": category,
                "symptom": symptom,
                "description": description,
                "qa": [
                    {
                        "question_id": item.get("question_id"),
                        "question_text": item.get("question_text"),
                        "answer": item.get("answer"),
                        "unknown": bool(item.get("unknown")),
                    }
                    for item in qa
                ],
            }
        )
    ).hexdigest()


def issue_diagnosis_receipt(
    *,
    user_id: int,
    category: str | None,
    symptom: str | None,
    description: str,
    qa: list[dict],
    risk_floor: str,
    ai_model: str,
    rules_version: str,
) -> str:
    body = {
        "v": _SIGN_VERSION,
        "uid": user_id,
        "d": input_digest(
            category=category,
            symptom=symptom,
            description=description,
            qa=qa,
        ),
        "risk": risk_floor,
        "model": ai_model,
        "rules": rules_version,
    }
    raw = base64.urlsafe_b64encode(_canonical(body)).decode("ascii")
    sig = hmac.new(_secret(), raw.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def verify_diagnosis_receipt(token: str | None) -> dict | None:
    if not token or "." not in token:
        return None
    raw, sig = token.rsplit(".", 1)
    expected = hmac.new(_secret(), raw.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        body = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")))
    except (ValueError, json.JSONDecodeError):
        return None
    if body.get("v") != _SIGN_VERSION:
        return None
    return body
