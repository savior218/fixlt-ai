"""前后端安全规则一致性测试。

做法：直接解析前端 risk.ts 中的规则常量，与后端规则模块逐项比对。
任何一侧修改关键词、版本号或症状基础风险而未同步，测试立即失败。
"""
import re
from pathlib import Path

from app.safety import rules

RISK_TS = Path(__file__).resolve().parents[1] / "frontend" / "src" / "utils" / "risk.ts"


def _ts() -> str:
    assert RISK_TS.exists(), f"未找到前端规则文件：{RISK_TS}"
    return RISK_TS.read_text(encoding="utf-8")


def _extract_array(text: str, name: str) -> list[str]:
    match = re.search(rf"const {name}[\s\S]*?=\s*\[([\s\S]*?)\]\s*as const", text)
    assert match, f"未找到 {name}"
    return re.findall(r'"([^"]+)"', match.group(1))


def _extract_symptom_risk(text: str) -> dict[str, str]:
    match = re.search(
        r"const SYMPTOM_BASE_RISK[\s\S]*?=\s*\{([\s\S]*?)\};", text
    )
    assert match, "未找到 SYMPTOM_BASE_RISK"
    return dict(re.findall(r'"([^"]+)":\s*"(low|medium|high)"', match.group(1)))


def test_rule_version_matches():
    text = _ts()
    assert f'SAFETY_RULES_VERSION = "{rules.SAFETY_RULES_VERSION}"' in text


def test_high_risk_keywords_match():
    assert set(_extract_array(_ts(), "HIGH_RISK_KEYWORDS")) == set(
        rules.HIGH_RISK_KEYWORDS
    )


def test_medium_risk_keywords_match():
    assert set(_extract_array(_ts(), "MEDIUM_RISK_KEYWORDS")) == set(
        rules.MEDIUM_RISK_KEYWORDS
    )


def test_unknown_answer_markers_match():
    assert set(_extract_array(_ts(), "UNKNOWN_ANSWER_MARKERS")) == set(
        rules.UNKNOWN_ANSWER_MARKERS
    )


def test_symptom_base_risk_matches():
    assert _extract_symptom_risk(_ts()) == rules.SYMPTOM_BASE_RISK
