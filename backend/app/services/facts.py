"""已确认事实 / 未知信息的服务端构造。

原则：
- evidence 只能来自用户明确提供的信息（设备字段、所选症状、文字描述、问答回答）
- “不知道 / 没试过 / 不清楚”等回答进入 unknown_information，不能升级为确认事实
- 不采用模型自称的 evidence，避免编造用户没有说过的事实
"""

from __future__ import annotations

from app.safety.rules import is_unknown_answer

CATEGORY_LABELS = {
    "ac": "空调",
    "fridge": "冰箱",
    "washer": "洗衣机",
    "other": "其他家电",
}

MAX_TEXT = 200


def _clip(text: str) -> str:
    return (text or "").strip()[:MAX_TEXT]


def build_facts(
    *,
    category: str,
    symptom: str | None,
    description: str,
    device_name: str | None,
    device_brand: str | None,
    device_model: str | None,
    qa: list[dict],
    user_summary: str = "",
) -> tuple[list[str], list[str]]:
    evidence: list[str] = []
    unknown: list[str] = []

    device_text = " ".join(
        part for part in (device_name, device_brand, device_model) if part
    ).strip()
    if device_text:
        evidence.append(f"设备：{_clip(device_text)}（{CATEGORY_LABELS.get(category, '家电')}）")
    else:
        evidence.append(f"设备类型：{CATEGORY_LABELS.get(category, '家电')}")

    if symptom:
        evidence.append(f"故障现象：{_clip(symptom)}")
    else:
        evidence.append("故障现象：用户以文字描述了问题")

    summary = _clip(user_summary)
    if summary:
        evidence.append(f"用户描述：{summary}")
    elif description.strip():
        evidence.append(f"用户描述：{_clip(description)}")

    for item in qa:
        question = _clip(str(item.get("question_text", "")))
        answer = _clip(str(item.get("answer", "")))
        if not question or not answer:
            continue
        # 自由聊天的轮次由 user_summary 统一概括，不再逐条展示原始问答
        if str(item.get("question_id", "")).startswith("chat_"):
            continue
        if item.get("unknown") or is_unknown_answer(answer):
            unknown.append(f"「{question}」用户回答：{answer}（未知，未作为确认事实）")
        else:
            evidence.append(f"「{question}」用户回答：{answer}")

    return evidence[:8], unknown[:6]
