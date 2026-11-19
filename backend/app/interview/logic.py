"""受控问题库、事实抽取、规则优先与模型受控选题。

模型只允许从 eligible_question_ids 中选一个；问题文本与选项始终来自本文件。
"""
from __future__ import annotations

import json
import re
import time

from app.ai import glm_client
from app.safety.rules import detect_risk

KB_VERSION = "ac-dynamic-v1"
MAX_ROUNDS = 4

QUESTIONS: dict[str, dict] = {
    "ac_airflow": {
        "id": "ac_airflow",
        "text": "开机运行后，出风口的风量怎么样？",
        "purpose": "区分风量不足和风量正常但不制冷，避免把所有情况都归为缺制冷剂。",
        "options": [
            {"id": "normal", "label": "有风，风量正常，但就是不凉", "value": "airflow_normal"},
            {"id": "weak", "label": "风很小，明显比平时弱", "value": "airflow_weak"},
            {"id": "none", "label": "几乎不出风", "value": "airflow_none"},
            {"id": "unknown", "label": "不知道／没试过", "value": "unknown"},
        ],
    },
    "ac_filter": {
        "id": "ac_filter",
        "text": "过滤网最近清洗过吗？",
        "purpose": "了解滤网状态；清洗过也只记录为自述，不直接认定滤网一定正常。",
        "options": [
            {"id": "cleaned", "label": "最近洗过", "value": "filter_cleaned"},
            {"id": "dirty", "label": "很久没洗／明显很脏", "value": "filter_dirty"},
            {"id": "unknown", "label": "不知道／没注意", "value": "unknown"},
        ],
    },
    "ac_mode": {
        "id": "ac_mode",
        "text": "遥控器当前是什么模式、温度设到多少？",
        "purpose": "排除送风、除湿或温度设置过高造成的“感觉不凉”。",
        "options": [
            {"id": "cooling", "label": "制冷模式，温度已调低", "value": "mode_cooling"},
            {"id": "other", "label": "送风／除湿／其他模式", "value": "mode_other"},
            {"id": "unknown", "label": "不确定／看不清楚", "value": "unknown"},
        ],
    },
    "ac_outdoor": {
        "id": "ac_outdoor",
        "text": "室外机风扇或压缩机有运转的声音吗？（只听/看，不要触碰）",
        "purpose": "判断室外机是否工作；只观察，不要求任何拆卸或带电操作。",
        "options": [
            {"id": "running", "label": "能听到运转声或看到风扇转", "value": "outdoor_running"},
            {"id": "stopped", "label": "没有声音，风扇也不转", "value": "outdoor_stopped"},
            {"id": "unknown", "label": "听不到／看不到／不知道", "value": "unknown"},
        ],
    },
    "ac_power": {
        "id": "ac_power",
        "text": "空调面板或指示灯能正常亮起、开机吗？",
        "purpose": "排除整机未通电或遥控失灵；不需要打开面板检查内部。",
        "options": [
            {"id": "on", "label": "能正常开机、指示灯亮", "value": "power_on"},
            {"id": "off", "label": "完全没反应", "value": "power_off"},
            {"id": "unknown", "label": "没试过／不确定", "value": "unknown"},
        ],
    },
    "ac_clarify_filter": {
        "id": "ac_clarify_filter",
        "text": "你前后对过滤网的描述不一致，以哪个为准？",
        "purpose": "先澄清矛盾，不把两种说法强行合并成事实。",
        "options": [
            {"id": "cleaned", "label": "最近确实洗过", "value": "filter_cleaned"},
            {"id": "dirty", "label": "确实很久没洗", "value": "filter_dirty"},
            {"id": "unknown", "label": "记不清了", "value": "unknown"},
        ],
    },
}

FACT_LABELS = {
    "airflow_normal": "风量正常",
    "airflow_weak": "风量偏小",
    "airflow_none": "几乎不出风",
    "filter_cleaned": "用户自述最近清洗过滤网",
    "filter_dirty": "过滤网很久未洗",
    "mode_cooling": "制冷模式且温度已调低",
    "mode_other": "非制冷模式",
    "outdoor_running": "室外机在运转",
    "outdoor_stopped": "室外机未运转",
    "power_on": "能正常开机",
    "power_off": "完全无反应",
    "unknown": "用户表示不知道/没试过",
}

FACT_QUESTION_KEYS = {
    "airflow_normal": "airflow",
    "airflow_weak": "airflow",
    "airflow_none": "airflow",
    "filter_cleaned": "filter",
    "filter_dirty": "filter",
    "mode_cooling": "mode",
    "mode_other": "mode",
    "outdoor_running": "outdoor",
    "outdoor_stopped": "outdoor",
    "power_on": "power",
    "power_off": "power",
}

# 关键词仅用于把用户原文归类，并保留原文依据；不做推理结论
TEXT_PATTERNS = [
    ("airflow_none", r"不出风|没有风|没风|无风|几乎不出风|风都没有"),
    ("airflow_weak", r"风很小|风量小|风量偏小|风变小|出风很小|风弱"),
    ("airflow_normal", r"风量正常|出风正常|有风.*不凉|有风.*不冷|风挺大|吹风正常"),
    ("filter_cleaned", r"清洗过|洗过|洗了|刚洗|昨天洗|上个月洗"),
    ("filter_dirty", r"没洗过|没有洗|未清洗|很久没洗|滤网很脏|过滤网很脏"),
    ("mode_cooling", r"制冷模式|开的是制冷|调到制冷|温度调到.*低|温度设.*低"),
    ("mode_other", r"送风模式|除湿模式|抽湿模式"),
    ("outdoor_running", r"外机.*转|外机.*运行|压缩机.*工作|室外机.*转"),
    ("outdoor_stopped", r"外机不转|外机没转|外机.*停|压缩机.*不工作|室外机.*不转"),
    ("power_on", r"能开机|可以开机|指示灯亮|通电正常"),
    ("power_off", r"开不了机|无法开机|没反应|指示灯不亮"),
]


def extract_facts(text: str, source: str = "user_text") -> list[dict]:
    """从原文抽取可追溯事实；同一事实保留原句，不产生模型推测。"""
    found: list[dict] = []
    for value, pattern in TEXT_PATTERNS:
        for match in re.finditer(pattern, text):
            evidence = text[max(0, match.start() - 12) : match.end() + 12].strip()
            found.append(
                {
                    "key": FACT_QUESTION_KEYS[value],
                    "value": value,
                    "label": FACT_LABELS[value],
                    "evidence": evidence,
                    "source": source,
                }
            )
            break
    return found


def merge_facts(existing: list[dict], incoming: list[dict]) -> tuple[list[dict], list[dict]]:
    """合并事实并识别冲突：同一问题键出现不同取值时保留两种说法。"""
    facts = list(existing)
    conflicts = []
    for item in incoming:
        key = item["key"]
        same_key = [f for f in facts if f.get("key") == key]
        if same_key and all(f.get("value") != item.get("value") for f in same_key):
            conflicts.append(
                {
                    "key": key,
                    "values": [f.get("value") for f in same_key] + [item.get("value")],
                    "evidence": [f.get("evidence") for f in same_key] + [item.get("evidence")],
                }
            )
        facts.append(item)
    return facts, conflicts


def answered_ids(asked: list[dict]) -> set[str]:
    return {str(a.get("question_id")) for a in asked}


def fact_values(facts: list[dict], key: str) -> list[str]:
    return [str(f.get("value")) for f in facts if f.get("key") == key]


def eligible_question_ids(facts: list[dict], asked: list[dict], conflicts: list[dict]) -> list[str]:
    known = {f.get("key") for f in facts}
    done = answered_ids(asked)
    eligible: list[str] = []
    if conflicts:
        return ["ac_clarify_filter"]
    if "airflow" not in known and "ac_airflow" not in done:
        eligible.append("ac_airflow")
    if "filter" not in known and "ac_filter" not in done:
        eligible.append("ac_filter")
    if "mode" not in known and "ac_mode" not in done:
        eligible.append("ac_mode")
    if "outdoor" not in known and "ac_outdoor" not in done:
        eligible.append("ac_outdoor")
    if "power" not in known and "ac_power" not in done:
        eligible.append("ac_power")
    return eligible


def rule_choice(facts: list[dict], eligible: list[str]) -> str | None:
    """确定性分支优先；无法用规则区分时返回 None，交给受控模型选择。"""
    if not eligible:
        return None
    if eligible == ["ac_clarify_filter"]:
        return "ac_clarify_filter"
    values = {f.get("value") for f in facts}
    # 几乎不出风：先确认通电/开机，比继续问滤网更合理
    if "airflow_none" in values and "ac_power" in eligible:
        return "ac_power"
    # 风量正常且滤网脏：先给出可自行执行的清洗建议，不继续追外机
    # 信息已包含风量偏小，但滤网和模式都未知：两者都合理，属于可交给模型区分的歧义
    if "airflow_weak" in values and "ac_filter" in eligible and len(eligible) > 1:
        return None
    return eligible[0]


def filter_actionable(facts: list[dict]) -> bool:
    """滤网明显脏且风量正常：先建议清洗，避免直接跳到缺制冷剂等结论。"""
    values = {f.get("value") for f in facts}
    return "filter_dirty" in values and "airflow_normal" in values


def enough_information(facts: list[dict], asked: list[dict]) -> bool:
    keys = {f.get("key") for f in facts}
    # 风量、模式、室外机三项已确认即可提前结束；滤网清洗只是风险线索，不是结论
    return {"airflow", "mode", "outdoor"} <= keys


def unknown_items(facts: list[dict], asked: list[dict]) -> list[str]:
    items = []
    for answer in asked:
        if answer.get("unknown"):
            items.append(str(answer.get("question_text") or answer.get("question_id")))
    return items


SELECT_SYSTEM = """你是家电问诊的“选题器”，只能从给定问题 ID 列表中选一个最有助于区分原因的问题。
规则：
1. 只能输出 JSON：{"question_id":"<ID>"}，不得输出问题文本、解释或其他字段。
2. ID 必须来自 allowed_question_ids；不得选择已问过或不适用的问题。
3. 用户“不知道”不等于正常，也不等于异常。
4. 不判断风险、不生成诊断结论。"""


async def choose_question(
    facts: list[dict], asked: list[dict], conflicts: list[dict]
) -> tuple[str | None, str | None, int | None, str | None]:
    """返回 (question_id, source, latency_ms, note)。"""
    eligible = eligible_question_ids(facts, asked, conflicts)
    if not eligible:
        return None, None, None, None
    rule = rule_choice(facts, eligible)
    if rule is not None:
        return rule, "rule", None, None
    if not glm_client.is_configured():
        return eligible[0], "rule_fallback", None, "模型未配置，已按规则继续"
    started = time.monotonic()
    try:
        payload = json.dumps(
            {
                "known_facts": [
                    {"value": f.get("value"), "evidence": f.get("evidence")}
                    for f in facts
                ],
                "asked_question_ids": sorted(answered_ids(asked)),
                "allowed_question_ids": eligible,
            },
            ensure_ascii=False,
        )
        raw = await glm_client.chat_json(SELECT_SYSTEM, payload)
        chosen = str(raw.get("question_id") or "")
        if chosen not in eligible:
            raise glm_client.GLMError(
                "invalid_question", f"模型选择了不允许的问题：{chosen}"
            )
        latency = int((time.monotonic() - started) * 1000)
        return chosen, "model", latency, None
    except glm_client.GLMError as e:
        latency = int((time.monotonic() - started) * 1000)
        return eligible[0], "rule_fallback", latency, f"模型选题失败（{e.code}），已按规则继续"


def apply_answer_facts(question: dict, option_id: str, answer_text: str) -> list[dict]:
    """把选项/文本转成事实；未知只记为 unknown，不改写为正常或异常。"""
    for option in question["options"]:
        if option["id"] == option_id:
            value = option["value"]
            if value == "unknown":
                return [
                    {
                        "key": "unknown",
                        "value": "unknown",
                        "label": FACT_LABELS["unknown"],
                        "evidence": answer_text,
                        "source": "user_answer",
                    }
                ]
            return [
                {
                    "key": FACT_QUESTION_KEYS[value],
                    "value": value,
                    "label": FACT_LABELS[value],
                    "evidence": answer_text or option["label"],
                    "source": "user_answer",
                }
            ]
    found = [f for f in extract_facts(answer_text, source="user_answer")]
    if not found and re.search(r"不知道|没试过|不清楚|不确定|记不清", answer_text):
        return [
            {
                "key": "unknown",
                "value": "unknown",
                "label": FACT_LABELS["unknown"],
                "evidence": answer_text,
                "source": "user_answer",
            }
        ]
    return found


def question_public(question_id: str | None) -> dict | None:
    if not question_id:
        return None
    q = QUESTIONS[question_id]
    return {
        "id": q["id"],
        "text": q["text"],
        "purpose": q["purpose"],
        "options": q["options"],
    }
