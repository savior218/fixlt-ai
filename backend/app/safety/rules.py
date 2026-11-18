"""安全规则引擎（后端独立版本）。

独立性约束：
- 本模块不读取前端提交的风险等级，也不调用 AI；高风险输入在调用模型前直接拦截
- 与前端 `frontend/src/utils/risk.ts` 共用同一份规则版本号与关键词集合
- 规则版本变更时，必须同步更新前端并运行前后端一致性测试

规则来源（专业安全行动文案）：
- 应急管理部消防救援局：电器火灾「先断电、勿用水扑救带电设备」
- 燃气安全通用处置：疑似泄漏时禁止开关任何电器、开窗通风、到户外报警
- 家用电器安全通用要求 GB 4706.1：非专业人员不得拆开外壳进行维修
详见 docs/智修AI_安全规则与文案来源.md（含复核状态）。
"""

from __future__ import annotations

SAFETY_RULES_VERSION = "SAFETY-2026-11-18-A"

# 高风险关键词（命中即拦截；任何模式下等级不变）
HIGH_RISK_KEYWORDS: tuple[str, ...] = (
    "漏电",
    "触电",
    "冒烟",
    "起火",
    "焦糊味",
    "焦味",
    "烧焦",
    "燃气泄漏",
    "燃气",
    "煤气",
    "火花",
    "异味",
    "异常发热",
    "烫手",
)

# 中风险关键词（涉及用户自行拆机 / 电路水路受损）
MEDIUM_RISK_KEYWORDS: tuple[str, ...] = (
    "自行拆机",
    "拆机",
    "拆卸",
    "拆开",
    "打开外壳",
    "更换零件",
    "电源线破损",
    "电线破损",
    "电线裸露",
    "外壳破损",
    "进水",
    "机箱进水",
)

# 症状基础风险（与前端 SYMPTOM_BASE_RISK 保持一致）
SYMPTOM_BASE_RISK: dict[str, str] = {
    "完全不制冷": "medium",
    "漏水": "medium",
    "无法启动": "medium",
    "不进水": "medium",
    "结冰严重": "medium",
    "不制冷": "medium",
    "无法开机": "medium",
}

# 未知 / 未确认回答标记：这类回答只能作为“待确认信息”，不能当成已确认事实
UNKNOWN_ANSWER_MARKERS: tuple[str, ...] = (
    "不知道",
    "不清楚",
    "没注意",
    "没试过",
    "不确定",
    "记不清",
    "说不准",
)

RISK_ORDER = {"low": 0, "medium": 1, "high": 2}


def higher_risk(a: str, b: str) -> str:
    return a if RISK_ORDER.get(a, 0) >= RISK_ORDER.get(b, 0) else b


def detect_risk(text: str) -> dict:
    """扫描文本，返回 {level, matched}。纯函数，不依赖模式 / AI。"""
    high = [k for k in HIGH_RISK_KEYWORDS if k in text]
    if high:
        return {"level": "high", "matched": high}
    medium = [k for k in MEDIUM_RISK_KEYWORDS if k in text]
    if medium:
        return {"level": "medium", "matched": medium}
    return {"level": "low", "matched": []}


def is_unknown_answer(answer: str) -> bool:
    text = (answer or "").strip()
    return any(marker in text for marker in UNKNOWN_ANSWER_MARKERS)


def compute_risk_floor(text: str, symptom: str | None) -> dict:
    """服务端风险下限：输入文本风险 + 症状基础风险取较高者。"""
    detected = detect_risk(text)
    base = SYMPTOM_BASE_RISK.get(symptom or "", "low")
    level = higher_risk(detected["level"], base)
    matched = list(detected["matched"])
    return {"level": level, "matched": matched}


def danger_kind(matched: list[str]) -> str:
    text = " ".join(matched)
    if "燃气" in text or "煤气" in text:
        return "gas"
    if any(
        k in text
        for k in ("冒烟", "起火", "烧焦", "焦糊味", "焦味")
    ):
        return "fire"
    return "electric"


def interception_title(matched: list[str]) -> str:
    kind = danger_kind(matched)
    if kind == "gas":
        return "存在燃气泄漏风险！"
    if kind == "fire":
        return "存在起火风险！"
    text = " ".join(matched)
    if any(k in text for k in ("异常发热", "烫手", "异味")):
        return "存在异常风险！"
    return "存在触电风险！"


def build_interception(matched: list[str]) -> dict:
    """后端独立拦截内容，按危险类型区分行动模板。

    安全约束：等级恒为 high；行动项与禁止项固定 3 项；
    燃气场景禁止给出“断电 / 拔插头 / 操作电器开关”类建议。
    """
    kind = danger_kind(matched)
    content = {
        "electric": {
            "description": "该设备可能存在电路异常，建议立即停止使用，并联系专业维修人员。",
            "description_elder": "这个情况比较危险，可能触电或起火。请先拔掉电源，人离远一点，马上找专业人员来处理。",
            "immediate_actions": [
                {"title": "立即断电", "description": "拔掉电源插头"},
                {"title": "停止自行维修", "description": "避免二次风险"},
                {"title": "联系专业维修", "description": "获取专业帮助"},
            ],
            "immediate_actions_elder": [
                {"title": "立即断电", "description": "把电源插头拔掉，别用手碰电线"},
                {"title": "停止自行维修", "description": "先不要自己修，避免发生危险"},
                {"title": "联系专业维修", "description": "马上找专业人员来帮忙"},
            ],
            "forbidden_actions": [
                "请勿用水清洁",
                "请勿自行拆机或更换零件",
                "请勿继续使用损坏的电源线",
            ],
            "forbidden_actions_elder": [
                "不要用水去擦或冲洗设备",
                "不要自己拆机器、换零件",
                "电源线坏了就不要再用了",
            ],
        },
        "fire": {
            "description": "设备可能已出现起火或过热损毁，请立即断电；火势不可控时先撤离并拨打火警电话。",
            "description_elder": "设备冒烟或有烧焦味很危险。先把电源拔掉，人离开远一点；火烧大了就赶紧撤到安全的地方打电话求助。",
            "immediate_actions": [
                {"title": "立即断电", "description": "拔掉电源插头或断开空开"},
                {"title": "火势可控时用干粉灭火器", "description": "勿用水浇带电设备"},
                {"title": "火势不可控立即撤离报警", "description": "人身安全优先，不要恋战"},
            ],
            "immediate_actions_elder": [
                {"title": "立即断电", "description": "把电源插头拔掉，别用手碰烧坏的地方"},
                {"title": "火小可用干粉灭火器", "description": "千万不要用水浇，会触电"},
                {"title": "火大就赶紧撤离报警", "description": "先保住自己安全，别管东西"},
            ],
            "forbidden_actions": [
                "请勿用水扑救带电设备",
                "请勿自行拆机检查起火原因",
                "请勿在火情处理前继续使用",
            ],
            "forbidden_actions_elder": [
                "不要用水浇电器，会触电",
                "不要自己拆开看烧在哪里",
                "处理好之前不要再开机了",
            ],
        },
        "gas": {
            "description": "疑似燃气泄漏。禁止操作任何电器开关（含拔插头），请关闭气源、开窗通风并撤离，再联系燃气公司或专业维修。",
            "description_elder": "可能是燃气漏了，很危险。不要去碰任何电器开关（开灯、关灯、拔插头都不行）。先关掉燃气阀门，打开窗户，人离开屋子，再给燃气公司打电话。",
            "immediate_actions": [
                {"title": "关闭气源阀门", "description": "只动燃气阀门，不要碰电器开关"},
                {"title": "开窗通风并撤离", "description": "转移到户外或远离泄漏点"},
                {"title": "撤离后报警求助", "description": "联系燃气公司抢修或拨打应急电话"},
            ],
            "immediate_actions_elder": [
                {"title": "关闭燃气阀门", "description": "只关气罐/管道的阀门"},
                {"title": "打开窗户，人离开屋子", "description": "让气味散掉，离远一点"},
                {"title": "到屋外打电话求助", "description": "给燃气公司或物业打电话，别在屋里打"},
            ],
            "forbidden_actions": [
                "请勿开关任何电器（包括灯、插头、排风扇）",
                "请勿使用明火或点火",
                "请勿在泄漏区域内使用手机",
            ],
            "forbidden_actions_elder": [
                "不要开灯、关灯、拔插头，任何电器都别碰",
                "不要点火、不要抽烟",
                "不要在漏气的屋子里打电话",
            ],
        },
    }[kind]

    return {
        "kind": kind,
        "level": "high",
        "title": interception_title(matched),
        "matched": matched,
        "standard": {
            "description": content["description"],
            "immediate_actions": content["immediate_actions"],
            "forbidden_actions": content["forbidden_actions"],
        },
        "elder": {
            "description": content["description_elder"],
            "immediate_actions": content["immediate_actions_elder"],
            "forbidden_actions": content["forbidden_actions_elder"],
        },
    }


# ---------------------------------------------------------------------------
# 模型输出安全检查：危险 / 不合格建议不得直接展示
# ---------------------------------------------------------------------------
HARMFUL_OUTPUT_PATTERNS: tuple[str, ...] = (
    "拆开外壳",
    "打开外壳",
    "拆卸内部",
    "带电操作",
    "带电检查",
    "带电维修",
    "不断电",
    "无需断电",
    "不用断电",
    "用水冲洗内部",
    "用水冲电路",
    "短接",
    "绕过保护",
    "拔掉接地",
    "自行加注制冷剂",
    "自己加注制冷剂",
    "自行更换压缩机",
    "湿手操作",
    "湿手插拔",
    "湿手触碰",
    "湿手接触",
    "徒手接触带电",
)

NEGATION_MARKERS: tuple[str, ...] = (
    "不要",
    "请勿",
    "禁止",
    "切勿",
    "不可",
    "不得",
    "不能",
    "不建议",
    "避免",
    "勿",
    "别",
)


def find_unsafe_output(text: str) -> list[str]:
    """返回未处于否定语境中的危险操作片段（空列表表示通过）。"""
    hits: list[str] = []
    for pattern in HARMFUL_OUTPUT_PATTERNS:
        start = 0
        while True:
            idx = text.find(pattern, start)
            if idx < 0:
                break
            window = text[max(0, idx - 12) : idx]
            if not any(marker in window for marker in NEGATION_MARKERS):
                hits.append(pattern)
                break
            start = idx + len(pattern)
    return hits
