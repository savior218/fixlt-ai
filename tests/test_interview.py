"""动态追问（大模型驱动）：结构、上下文、结束、安全、幂等与失败恢复。"""
import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.ai import glm_client
from app.main import app


def register(client: TestClient):
    username = f"dyn{uuid.uuid4().hex[:10]}"
    r = client.post("/api/auth/register", json={"username": username, "password": "SafePass123"})
    assert r.status_code == 201, r.text
    return r.json()["user"], r.json()["csrf_token"]


def H(csrf):
    return {"X-CSRF-Token": csrf}


def start(client, csrf, desc, photo_id=None):
    return client.post(
        "/api/interview",
        json={
            "category": "ac",
            "symptom": "not_cooling",
            "description": desc,
            "photo_id": photo_id,
        },
        headers=H(csrf),
    )


def answer(client, csrf, sid, version, qid, option_id=None, text=None, source="text", rid=None):
    return client.post(
        f"/api/interview/{sid}/answer",
        json={
            "question_id": qid,
            "answer": text or "已选择",
            "option_id": option_id,
            "input_source": source,
            "request_id": rid or f"req-{uuid.uuid4().hex}",
            "session_version": version,
        },
        headers=H(csrf),
    )


def ask(text, options=None, purpose="用来缩小可能原因。"):
    return {
        "decision": "ask",
        "question": {
            "text": text,
            "purpose": purpose,
            "options": options or ["有风但不凉", "风很小"],
        },
        "known_information": ["用户说空调不凉"],
        "unknown_information": [],
        "conflicts": [],
    }


def recommend(summary="可能与滤网、外机散热或制冷剂有关，需进一步确认。"):
    return {
        "decision": "recommend",
        "recommendation": {
            "summary": summary,
            "possible_causes": [
                {"title": "过滤网积尘", "description": "会降低出风与制冷效率"},
                {"title": "室外机散热受阻", "description": "周围有遮挡时换热变差"},
            ],
            "unknown_information": ["室外机是否运转"],
            "next_steps": ["断电后清洗滤网并晾干", "仍不凉则联系专业人员"],
        },
        "known_information": ["用户自述不凉"],
        "unknown_information": ["室外机是否运转"],
        "conflicts": [],
    }


def cannot():
    return {
        "decision": "cannot",
        "cannot": {"reason": "描述中缺少可观察的运行信息", "next_step": "补充风量与模式后再试"},
        "known_information": [],
        "unknown_information": ["风量", "运行模式"],
        "conflicts": [],
    }


class FakeModel:
    def __init__(self, turns, observations=None, limitations=None):
        self.turns = list(turns)
        self.calls = 0
        self.payloads: list[str] = []
        self.observations = observations or ["外机周围有纸箱遮挡"]
        self.limitations = limitations or ["看不清外机内部"]

    async def __call__(self, system, user, image=None, model=None):
        self.calls += 1
        self.payloads.append(user)
        if "可见现象整理器" in system:
            return {"observations": self.observations, "limitations": self.limitations}
        item = self.turns.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def use_model(monkeypatch, *turns, observations=None, limitations=None) -> FakeModel:
    fake = FakeModel(turns, observations, limitations)
    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", fake)
    return fake


def test_without_key_start_is_blocked_without_rule_fallback(monkeypatch):
    monkeypatch.setattr(glm_client, "is_configured", lambda: False)
    with TestClient(app) as c:
        _, csrf = register(c)
        r = start(c, csrf, "空调不制冷")
        assert r.status_code == 503
        assert r.json()["detail"]["code"] == "ai_not_configured"
        assert "AI" in r.json()["detail"]["message"]


def test_model_generates_question_and_ids(monkeypatch):
    fake = use_model(monkeypatch, ask("室外机风扇现在转吗？"))
    with TestClient(app) as c:
        _, csrf = register(c)
        r = start(c, csrf, "开的是制冷模式，风量正常")
        assert r.status_code == 201, r.text
        s = r.json()
        assert s["current_question"]["text"] == "室外机风扇现在转吗？"
        assert s["current_question"]["id"].startswith("q-")
        assert s["selection_source"] == "model"
        assert s["selection_note"].startswith("本题由大模型")
        assert s["model_calls"] == 1
        # 未知选项由系统补齐，不依赖模型题库
        assert s["current_question"]["options"][-1]["unknown"] is True
        assert len(fake.payloads) == 1
        assert "初始描述" in fake.payloads[0]


def test_answer_sends_dialogue_and_model_decides_next_question(monkeypatch):
    fake = use_model(monkeypatch, ask("风量怎么样？"), ask("遥控器设置的温度是多少？"))
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "空调不制冷").json()
        q = s["current_question"]
        r = answer(c, csrf, s["session_id"], s["version"], q["id"], q["options"][0]["id"], q["options"][0]["label"])
        assert r.status_code == 200, r.text
        s2 = r.json()
        assert s2["round"] == 1
        assert s2["current_question"]["text"] == "遥控器设置的温度是多少？"
        assert s2["qa"][0]["selection_source"] == "model"
        assert s2["model_calls"] == 2
        last_payload = json.loads(fake.payloads[-1])
        assert last_payload["对话"][0]["回答"] == q["options"][0]["label"]
        assert last_payload["初始描述"] == "空调不制冷"


def test_photo_analysis_limits_are_fed_into_model(monkeypatch):
    fake = use_model(monkeypatch, ask("外机周围是否被遮挡？"))
    with TestClient(app) as c:
        _, csrf = register(c)
        up = c.post(
            "/api/diagnose/photo",
            files={"file": ("fault.png", b"\x89PNG\r\n\x1a\n", "image/png")},
            headers=H(csrf),
        )
        photo_id = up.json()["id"]
        r = start(c, csrf, "开的是制冷模式，风量正常", photo_id=photo_id)
        assert r.status_code == 201, r.text
        s = r.json()
        assert s["photo_id"] == photo_id
        assert s["model_calls"] == 2  # 1 次看图整理 + 1 次出题
        payload = json.loads(fake.payloads[-1])
        assert payload["图片分析"]["可见现象"] == ["外机周围有纸箱遮挡"]
        assert payload["图片分析"]["看不清或无法确认"] == ["看不清外机内部"]


def test_recommendation_and_cannot_end_dialogue(monkeypatch):
    fake = use_model(monkeypatch, recommend())
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "制冷模式，风量正常，过滤网刚洗过").json()
        assert s["status"] == "completed"
        assert s["end_reason"] == "model_recommend"
        assert s["recommendation"]["possible_causes"]
        assert s["current_question"] is None

    fake = use_model(monkeypatch, cannot())
    with TestClient(app) as c2:
        _, csrf = register(c2)
        s = start(c2, csrf, "空调不制冷").json()
        assert s["status"] == "completed"
        assert s["end_reason"] == "model_cannot"
        assert s["cannot"]["next_step"]


def test_max_rounds_stops_without_extra_model_call(monkeypatch):
    fake = use_model(monkeypatch, *[ask(f"第 {i} 项观察？") for i in range(6)])
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "空调不制冷").json()
        for _ in range(6):
            assert s["status"] == "active"
            q = s["current_question"]
            r = answer(c, csrf, s["session_id"], s["version"], q["id"], None, "不知道")
            assert r.status_code == 200, r.text
            s = r.json()
        assert s["status"] == "completed"
        assert s["end_reason"] == "max_rounds"
        assert s["current_question"] is None
        assert s["round"] == 6
        assert s["model_calls"] == 6  # 第 6 个回答达到上限，不再调用模型
        assert "第 1 项观察？" in s["unknown_information"]


def test_unsafe_generated_question_is_rejected(monkeypatch):
    unsafe = ask("请拆开外壳检查内部电路", ["现在就拆", "稍后再拆"])
    fake = use_model(monkeypatch, unsafe, unsafe)
    with TestClient(app) as c:
        _, csrf = register(c)
        r = start(c, csrf, "空调不制冷")
        assert r.status_code == 502
        assert r.json()["detail"]["code"] == "ai_unsafe_output"
        assert fake.calls == 2


def test_invalid_output_retries_then_fails_without_rule_fallback(monkeypatch):
    fake = use_model(monkeypatch, {"decision": "ask"}, {"decision": "ask"})
    with TestClient(app) as c:
        _, csrf = register(c)
        r = start(c, csrf, "空调不制冷")
        assert r.status_code == 502
        assert r.json()["detail"]["code"] == "ai_invalid_output"
        assert fake.calls == 2


def test_duplicate_question_is_retried_and_replaced(monkeypatch):
    fake = use_model(monkeypatch, ask("风量怎么样？"), ask("风量怎么样？"), ask("室外机有声音吗？"))
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "空调不制冷").json()
        q = s["current_question"]
        r = answer(c, csrf, s["session_id"], s["version"], q["id"], q["options"][0]["id"], q["options"][0]["label"])
        assert r.status_code == 200, r.text
        assert r.json()["current_question"]["text"] == "室外机有声音吗？"
        assert fake.calls == 3


def test_model_failure_keeps_answer_retryable(monkeypatch):
    fake = use_model(
        monkeypatch,
        ask("风量怎么样？"),
        glm_client.GLMError("timeout", "模拟超时"),
        ask("室外机有声音吗？"),
    )
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "空调不制冷").json()
        q = s["current_question"]
        rid = "retry-answer"
        failed = answer(c, csrf, s["session_id"], s["version"], q["id"], None, "有风", rid=rid)
        assert failed.status_code == 504
        unchanged = c.get(f"/api/interview/{s['session_id']}").json()
        assert unchanged["version"] == s["version"]
        assert unchanged["round"] == 0
        retried = answer(c, csrf, s["session_id"], unchanged["version"], q["id"], None, "有风", rid=rid)
        assert retried.status_code == 200, retried.text
        assert retried.json()["qa"][0]["answer"] == "有风"
        assert retried.json()["current_question"]["text"] == "室外机有声音吗？"


def test_high_risk_blocks_before_model(monkeypatch):
    fake = use_model(monkeypatch, ask("风量怎么样？"))
    with TestClient(app) as c:
        _, csrf = register(c)
        initial = start(c, csrf, "空调冒烟了，还有焦味")
        assert initial.status_code == 409
        assert fake.calls == 0

        s = start(c, csrf, "空调不制冷").json()
        q = s["current_question"]
        blocked = answer(c, csrf, s["session_id"], s["version"], q["id"], None, "外机冒烟了，有焦味")
        assert blocked.status_code == 409
        assert blocked.json()["detail"]["code"] == "high_risk_blocked"
        assert fake.calls == 1  # 只有首轮出题，风险回答没有调用模型
        resumed = c.get(f"/api/interview/{s['session_id']}").json()
        assert resumed["status"] == "intercepted"
        assert resumed["qa"] == []


def test_idempotent_stale_question_and_ownership(monkeypatch):
    use_model(monkeypatch, ask("风量怎么样？"), ask("外机有声音吗？"))
    with TestClient(app) as ca, TestClient(app) as cb:
        _, csrf = register(ca)
        _, csrf_b = register(cb)
        s = start(ca, csrf, "空调不制冷").json()
        q = s["current_question"]
        rid = "same-request-id"
        first = answer(ca, csrf, s["session_id"], s["version"], q["id"], None, "不知道", rid=rid)
        assert first.status_code == 200, first.text
        repeat = answer(ca, csrf, s["session_id"], s["version"], q["id"], None, "不知道", rid=rid)
        assert repeat.status_code == 200
        assert repeat.json()["version"] == first.json()["version"]

        stale = answer(ca, csrf, s["session_id"], first.json()["version"] - 1, q["id"], None, "不知道")
        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "stale_session"

        assert cb.get(f"/api/interview/{s['session_id']}").status_code == 404
        denied = answer(cb, csrf_b, s["session_id"], first.json()["version"], q["id"], None, "不知道")
        assert denied.status_code == 404


def test_voice_source_and_model_selection_persisted(monkeypatch):
    use_model(monkeypatch, ask("风量怎么样？"), ask("室外机有声音吗？"))
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "空调不制冷").json()
        q = s["current_question"]
        r = answer(c, csrf, s["session_id"], s["version"], q["id"], None, "有风，但吹出来不凉", source="voice")
        assert r.status_code == 200, r.text
        assert r.json()["qa"][0]["input_source"] == "voice"
        assert r.json()["qa"][0]["selection_source"] == "model"


def test_dynamic_qa_source_and_unknown_survive_report_roundtrip():
    with TestClient(app) as a, TestClient(app) as b:
        user, csrf = register(a)
        payload = {
            "client_ref": f"dyn-report-{uuid.uuid4().hex}",
            "category": "ac",
            "symptom": "制冷效果变差",
            "description": "制冷模式，过滤网刚洗过，风量正常",
            "source": "template",
            "risk_level": "low",
            "qa": [
                {
                    "question_id": "q-model-1",
                    "question_text": "室外机风扇有运转的声音吗？",
                    "answer": "听不到",
                    "unknown": True,
                    "input_source": "voice",
                    "selection_source": "model",
                }
            ],
            "content": {
                "standard": {
                    "conclusion": "信息有限，建议先观察室外机并联系售后。",
                    "possible_causes": [{"title": "待确认", "description": "需要进一步检查"}],
                    "evidence": ["用户自述过滤网刚洗过"],
                    "unknown_information": ["室外机是否运转"],
                    "suggestions": [{"title": "联系售后", "description": "请专业人员检查"}],
                    "tips": None,
                    "risk_note": None,
                },
                "elder": {
                    "conclusion": "信息有限，建议先联系售后。",
                    "possible_causes": [{"title": "待确认", "description": "需要进一步检查"}],
                    "evidence": ["用户自述过滤网刚洗过"],
                    "unknown_information": ["室外机是否运转"],
                    "suggestions": [{"title": "联系售后", "description": "请专业人员检查"}],
                    "tips": None,
                    "risk_note": None,
                },
            },
        }
        saved = a.post("/api/diagnoses", json=payload, headers=H(csrf))
        assert saved.status_code == 201, saved.text
        report_id = saved.json()["id"]
        detail = a.get(f"/api/diagnoses/{report_id}").json()
        assert detail["qa"][0]["input_source"] == "voice"
        assert detail["qa"][0]["selection_source"] == "model"
        assert detail["qa"][0]["unknown"] is True

        login = b.post(
            "/api/auth/login",
            json={"username": user["username"], "password": "SafePass123"},
        )
        assert login.status_code == 200, login.text
        other = b.get(f"/api/diagnoses/{report_id}")
        assert other.status_code == 200
        assert other.json()["qa"][0]["input_source"] == "voice"
        assert other.json()["qa"][0]["unknown"] is True
    