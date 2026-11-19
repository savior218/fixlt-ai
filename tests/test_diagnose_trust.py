"""阶段十：安全拦截、请求约束、输出校验、限流与双文案测试（测试替身，不调用真实模型）。"""
import json

import pytest
from fastapi.testclient import TestClient

from app.ai import glm_client
from app.api import diagnose as diagnose_api
from app.core.config import settings
from app.main import app

client = TestClient(app)


def make_payload(**overrides):
    base = {
        "category": "ac",
        "symptom": "制冷效果变差",
        "description": "空调开了半小时还是不凉",
        "qa": [
            {
                "question_id": "ac_clean_filter",
                "question_text": "最近有清洗过空调过滤网吗？",
                "answer": "上个月洗过",
                "unknown": False,
            },
            {
                "question_id": "ac_cold_wind",
                "question_text": "开机运行时，出风口有冷风吹出吗？",
                "answer": "完全没有冷风",
                "unknown": False,
            },
        ],
    }
    base.update(overrides)
    return base


def valid_model_content(**overrides):
    base = {
        "conclusion": "先检查滤网与室外机散热，再考虑制冷剂压力问题。",
        "conclusion_elder": "先看看过滤网脏不脏，再看看外机有没有被挡住。",
        "possible_causes": [
            {"title": "过滤网积尘", "description": "积尘会降低出风量和制冷效果"},
            {"title": "制冷剂不足", "description": "需专业人员检测压力后确认"},
        ],
        "suggestions": [
            {"title": "断电后清洗滤网", "description": "拔掉电源，清洗滤网并晾干后装回"},
            {"title": "清理室外机遮挡物", "description": "确认外机周围通风顺畅"},
            {"title": "联系专业维修检测", "description": "仍不制冷时请专业人员检测"},
        ],
        "suggestions_elder": [
            {"title": "第一步：先拔电源", "description": "再把过滤网取下来洗干净"},
            {"title": "第二步：看看外机", "description": "外机旁边不要堆东西"},
            {"title": "第三步：找师傅", "description": "还不凉就打维修电话"},
        ],
        "tips": "过滤网建议每 1-2 个月清洁一次。",
        "tips_elder": "过滤网要常洗，空调才凉快。",
        "risk_note": "请勿自行拆卸空调内部部件。",
        "risk_note_elder": "不要自己拆空调，小心触电。",
    }
    base.update(overrides)
    return base


@pytest.fixture(autouse=True)
def _reset_limiter():
    diagnose_api.reset_rate_limiter()
    yield
    diagnose_api.reset_rate_limiter()


# ---------------------------------------------------------------------------
# 1. 后端独立安全拦截
# ---------------------------------------------------------------------------
def test_high_risk_is_blocked_before_model(monkeypatch):
    called = {"hit": False}

    async def _bomb(*args, **kwargs):
        called["hit"] = True
        raise AssertionError("高风险输入不应调用模型")

    monkeypatch.setattr(glm_client, "chat_json", _bomb)
    resp = client.post(
        "/api/diagnose/complete",
        json=make_payload(description="空调冒烟了，还有焦味"),
    )
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["code"] == "high_risk_blocked"
    assert detail["risk"]["kind"] == "fire"
    assert detail["risk"]["standard"]["immediate_actions"]
    assert called["hit"] is False


def test_gas_risk_uses_gas_specific_template(monkeypatch):
    async def _bomb(*args, **kwargs):
        raise AssertionError("不应调用模型")

    monkeypatch.setattr(glm_client, "chat_json", _bomb)
    resp = client.post(
        "/api/diagnose/complete",
        json=make_payload(description="厨房闻到燃气味，疑似燃气泄漏"),
    )
    assert resp.status_code == 409
    risk = resp.json()["detail"]["risk"]
    assert risk["kind"] == "gas"
    action_text = " ".join(
        [a["title"] + a["description"] for a in risk["standard"]["immediate_actions"]]
    )
    assert "断电" not in action_text
    assert "拔插头" not in action_text


def test_client_supplied_risk_level_is_rejected():
    payload = make_payload()
    payload["risk_level"] = "low"
    resp = client.post("/api/diagnose/complete", json=payload)
    assert resp.status_code == 422


def test_legacy_answers_without_questions_are_rejected():
    payload = make_payload()
    payload.pop("qa")
    payload["answers"] = ["上个月洗过", "完全没有冷风"]
    resp = client.post("/api/diagnose/complete", json=payload)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 2. 调用异常与错误分类
# ---------------------------------------------------------------------------
def test_ai_not_configured_returns_structured_error():
    resp = client.post("/api/diagnose/complete", json=make_payload())
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "ai_not_configured"


def test_bad_model_json_returns_invalid_output(monkeypatch):
    async def _bad_json(*args, **kwargs):
        raise glm_client.GLMError("bad_json", "JSON 解析失败")

    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", _bad_json)
    resp = client.post("/api/diagnose/complete", json=make_payload())
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert detail["code"] == "ai_invalid_output"
    assert "JSON" not in detail["message"]  # 不暴露内部异常细节


def test_timeout_maps_to_user_friendly_message(monkeypatch):
    async def _timeout(*args, **kwargs):
        raise glm_client.GLMError("timeout", "read timeout")

    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", _timeout)
    resp = client.post("/api/diagnose/complete", json=make_payload())
    assert resp.status_code == 504
    assert resp.json()["detail"]["code"] == "ai_timeout"


def test_unsafe_model_output_is_rejected(monkeypatch):
    async def _unsafe(*args, **kwargs):
        content = valid_model_content()
        content["suggestions"].append(
            {"title": "打开外壳检查", "description": "直接带电检查内部接线"}
        )
        return content

    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", _unsafe)
    resp = client.post("/api/diagnose/complete", json=make_payload())
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "ai_unsafe_output"


def test_safe_negated_advice_is_not_flagged():
    from app.safety.rules import find_unsafe_output

    assert find_unsafe_output("请勿打开外壳，不要带电操作") == []
    assert find_unsafe_output("请勿湿手操作，不要徒手接触带电部位") == []
    assert find_unsafe_output("打开外壳后带电检查") != []
    assert find_unsafe_output("湿手插拔插头") != []


@pytest.mark.parametrize(
    "content,expected_error",
    [
        ("```json\n{\"a\": 1}\n```", None),
        ("```\n{\"a\": 1}\n```", None),
        ("  {\"a\": 1}  ", None),
        ("说明文字 {\"a\": 1} 结束", None),
        ("", "empty_output"),
        ("[]", "invalid_shape"),
        ("```json\n不是 JSON\n```", "bad_json"),
        ("x" * 20001, "oversize_output"),
    ],
)
def test_json_fence_and_invalid_shapes(content, expected_error):
    from app.ai.glm_client import GLMError, parse_json_object

    if expected_error:
        with pytest.raises(GLMError) as exc:
            parse_json_object(content)
        assert exc.value.code == expected_error
    else:
        assert parse_json_object(content) == {"a": 1}


def test_request_too_large_is_rejected():
    payload = make_payload(description="很长" * 12000)
    resp = client.post("/api/diagnose/complete", json=payload)
    assert resp.status_code == 413
    assert resp.json()["detail"]["code"] == "request_too_large"


def test_rate_limit(monkeypatch):
    monkeypatch.setattr(settings, "guest_ai_rate_limit_per_minute", 1)
    monkeypatch.setattr(glm_client, "is_configured", lambda: True)

    async def _ok(*args, **kwargs):
        return valid_model_content()

    monkeypatch.setattr(glm_client, "chat_json", _ok)
    first = client.post("/api/diagnose/complete", json=make_payload())
    second = client.post("/api/diagnose/complete", json=make_payload())
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["detail"]["code"] == "rate_limited"


# ---------------------------------------------------------------------------
# 3. 事实可追溯、未知信息与双文案
# ---------------------------------------------------------------------------
def test_facts_trace_to_user_input_and_unknown_stays_unknown(monkeypatch):
    qa = make_payload()["qa"]
    qa[0]["answer"] = "不知道"
    qa[0]["unknown"] = True

    async def _ok(*args, **kwargs):
        return valid_model_content()

    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", _ok)
    resp = client.post(
        "/api/diagnose/complete",
        json=make_payload(qa=qa, device_name="客厅空调", device_brand="格力"),
    )
    assert resp.status_code == 200
    body = resp.json()
    content = body["content"]
    assert body["source"] == "ai"
    assert content["conclusion"] and content["conclusion_elder"]
    assert content["suggestions"] and content["suggestions_elder"]

    evidence = " ".join(content["evidence"])
    assert "客厅空调" in evidence
    assert "制冷效果变差" in evidence
    assert "上个月洗过" not in evidence
    assert "不知道" not in evidence
    assert any("不知道" in item for item in content["unknown_information"])
    assert body["safety_rules_version"].startswith("SAFETY-")
    assert body["risk_floor"] in {"low", "medium"}


def test_missing_model_fields_returns_invalid_output(monkeypatch):
    async def _incomplete(*args, **kwargs):
        return {"conclusion": "只有结论，缺少长辈版与建议"}

    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", _incomplete)
    resp = client.post("/api/diagnose/complete", json=make_payload())
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "ai_invalid_output"


def test_auth_error_is_user_friendly(monkeypatch):
    async def _auth(*args, **kwargs):
        raise glm_client.GLMError("auth", "401 unauthorized")

    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", _auth)
    resp = client.post("/api/diagnose/complete", json=make_payload())
    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert detail["code"] == "ai_unavailable"
    assert "401" not in detail["message"]
    assert "unauthorized" not in detail["message"]


def test_field_and_qa_count_constraints():
    too_many_qa = make_payload()
    too_many_qa["qa"] = [
        {
            "question_id": f"q{i}",
            "question_text": "问题",
            "answer": "回答",
            "unknown": False,
        }
        for i in range(5)
    ]
    assert client.post("/api/diagnose/complete", json=too_many_qa).status_code == 422

    long_answer = make_payload()
    long_answer["qa"][0]["answer"] = "长" * 301
    assert client.post("/api/diagnose/complete", json=long_answer).status_code == 422

    long_desc = make_payload(description="长" * 501)
    assert client.post("/api/diagnose/complete", json=long_desc).status_code == 422


def test_unknown_marker_is_detected_even_if_flag_false(monkeypatch):
    qa = make_payload()["qa"]
    qa[0]["answer"] = "没试过"
    qa[0]["unknown"] = False

    async def _ok(*args, **kwargs):
        return valid_model_content()

    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", _ok)
    resp = client.post("/api/diagnose/complete", json=make_payload(qa=qa))
    assert resp.status_code == 200
    content = resp.json()["content"]
    assert any("没试过" in item for item in content["unknown_information"])
    assert "没试过" not in " ".join(content["evidence"])


def test_model_evidence_is_not_trusted(monkeypatch):
    async def _ok(*args, **kwargs):
        content = valid_model_content()
        content["evidence"] = ["压缩机压力为零，已确认损坏"]
        return content

    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", _ok)
    resp = client.post("/api/diagnose/complete", json=make_payload())
    assert resp.status_code == 200
    assert "压缩机压力为零" not in json.dumps(resp.json(), ensure_ascii=False)
