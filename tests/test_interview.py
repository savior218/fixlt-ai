"""动态追问：确定性分支、未知、矛盾、风险、幂等与归属。"""
import uuid

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


def start(client, csrf, desc):
    r = client.post(
        "/api/interview",
        json={"category": "ac", "symptom": "not_cooling", "description": desc},
        headers=H(csrf),
    )
    return r


def answer(client, csrf, sid, version, qid, option_id=None, text=None, source="text", rid=None):
    r = client.post(
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
    return r


def test_dirty_filter_is_not_misread_as_cleaned():
    """“很久没洗了”不能被“洗了”误判成已清洗，否则会凭空产生矛盾。"""
    with TestClient(app) as c:
        _, csrf = register(c)
        r = start(c, csrf, "开的是制冷模式，风量正常，过滤网很久没洗了")
        assert r.status_code == 201, r.text
        s = r.json()
        assert s["conflicts"] == []
        assert s["status"] == "completed"
        assert s["end_reason"] == "filter_actionable"
        assert s["current_question"] is None
        assert [f["value"] for f in s["facts"]].count("filter_dirty") == 1
        assert "filter_cleaned" not in {f["value"] for f in s["facts"]}


def test_known_info_is_not_asked_again():
    with TestClient(app) as c:
        _, csrf = register(c)
        r = start(c, csrf, "空调开的是制冷模式，温度调到22度，过滤网刚洗过，风量正常")
        assert r.status_code == 201, r.text
        s = r.json()
        assert s["current_question"]["id"] == "ac_outdoor"
        assert not any(q["id"] in {"ac_filter", "ac_mode", "ac_airflow"} for q in [])
        # 清洗只作为自述事实，不写成“滤网正常”
        labels = [f["label"] for f in s["facts"]]
        assert any("自述" in (x or "") for x in labels)


def test_cleaned_and_dirty_take_different_paths():
    with TestClient(app) as c:
        _, csrf = register(c)
        clean = start(c, csrf, "制冷模式，风量正常，过滤网刚洗过").json()
        assert clean["current_question"]["id"] == "ac_outdoor"
        dirty = start(c, csrf, "制冷模式，风量正常，过滤网很久没洗").json()
        assert dirty["current_question"] is None
        assert dirty["end_reason"] == "filter_actionable"


def test_airflow_none_and_normal_differ():
    with TestClient(app) as c:
        _, csrf = register(c)
        none = start(c, csrf, "制冷模式，过滤网刚洗过，几乎不出风").json()
        assert none["current_question"]["id"] == "ac_power"
        normal = start(c, csrf, "制冷模式，过滤网刚洗过，风量正常").json()
        assert normal["current_question"]["id"] == "ac_outdoor"


def test_unknown_answers_end_without_fabricating_facts():
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "空调不制冷").json()
        assert s["current_question"]["id"] == "ac_airflow"
        for _ in range(4):
            assert s["status"] == "active"
            q = s["current_question"]
            r = answer(c, csrf, s["session_id"], s["version"], q["id"], "unknown", "不知道")
            assert r.status_code == 200, r.text
            s = r.json()
        assert s["status"] == "completed"
        assert s["end_reason"] == "max_rounds"
        assert len(s["qa"]) == 4
        assert all("不知道" in f.get("evidence", "") for f in s["facts"])
        assert s["unknown_information"]


def test_conflict_is_clarified_then_cleared():
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "过滤网刚洗过，也很久没洗，空调不凉").json()
        assert s["current_question"]["id"] == "ac_clarify_filter"
        assert s["conflicts"]
        r = answer(
            c, csrf, s["session_id"], s["version"], "ac_clarify_filter", "cleaned", "最近确实洗过"
        )
        assert r.status_code == 200, r.text
        s2 = r.json()
        assert s2["conflicts"] == []
        assert s2["round"] == 1


def test_high_risk_stops_midway_and_marks_session():
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "空调不制冷").json()
        q = s["current_question"]
        r = answer(c, csrf, s["session_id"], s["version"], q["id"], "normal", "有风")
        s = r.json()
        q2 = s["current_question"]
        blocked = answer(
            c, csrf, s["session_id"], s["version"], q2["id"], None, "空调外机冒烟，还有焦味"
        )
        assert blocked.status_code == 409
        detail = blocked.json()["detail"]
        assert detail["code"] == "high_risk_blocked"
        resumed = c.get(f"/api/interview/{s['session_id']}").json()
        assert resumed["status"] == "intercepted"
        assert resumed["current_question"] is None


def test_initial_high_risk_does_not_create_session():
    with TestClient(app) as c:
        _, csrf = register(c)
        r = start(c, csrf, "空调冒烟了，还有焦味")
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "high_risk_blocked"


def test_invalid_model_choice_falls_back_with_explicit_source(monkeypatch):
    async def fake_chat_json(system, user):
        return {"question_id": "ac_not_exist"}

    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", fake_chat_json)
    with TestClient(app) as c:
        _, csrf = register(c)
        r = start(c, csrf, "开的是制冷模式，风很小")
        assert r.status_code == 201, r.text
        s = r.json()
        assert s["selection_source"] == "rule_fallback"
        assert s["selection_note"]
        assert s["current_question"]["id"] == "ac_filter"


def test_model_valid_choice_is_used(monkeypatch):
    async def fake_chat_json(system, user):
        return {"question_id": "ac_outdoor"}

    monkeypatch.setattr(glm_client, "is_configured", lambda: True)
    monkeypatch.setattr(glm_client, "chat_json", fake_chat_json)
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "开的是制冷模式，风很小").json()
        assert s["selection_source"] == "model"
        assert s["current_question"]["id"] == "ac_outdoor"
        assert s["selection_latency_ms"] is not None


def test_idempotent_answer_stale_question_and_ownership():
    with TestClient(app) as ca, TestClient(app) as cb:
        _, csrf = register(ca)
        _, csrf_b = register(cb)
        s = start(ca, csrf, "空调不制冷").json()
        q = s["current_question"]
        rid = "same-request-id"
        first = answer(ca, csrf, s["session_id"], s["version"], q["id"], "unknown", "不知道", rid=rid)
        assert first.status_code == 200, first.text
        repeat = answer(ca, csrf, s["session_id"], s["version"], q["id"], "unknown", "不知道", rid=rid)
        assert repeat.status_code == 200
        assert repeat.json()["version"] == first.json()["version"]

        # 旧版本号不能推进新会话
        stale = answer(
            ca, csrf, s["session_id"], first.json()["version"] - 1, q["id"], "unknown", "不知道"
        )
        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "stale_session"

        # B 无法读取或回答 A 的会话
        assert cb.get(f"/api/interview/{s['session_id']}").status_code == 404
        denied = answer(cb, csrf_b, s["session_id"], first.json()["version"], q["id"], "unknown", "不知道")
        assert denied.status_code == 404


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
                    "question_id": "ac_outdoor",
                    "question_text": "室外机风扇或压缩机有运转的声音吗？",
                    "answer": "听不到",
                    "unknown": True,
                    "input_source": "voice",
                    "selection_source": "rule",
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
        assert detail["qa"][0]["selection_source"] == "rule"
        assert detail["qa"][0]["unknown"] is True

        # 另一个浏览器登录同一账号后可读取完整问答来源与未知标记
        login = b.post(
            "/api/auth/login",
            json={"username": user["username"], "password": "SafePass123"},
        )
        assert login.status_code == 200, login.text
        other = b.get(f"/api/diagnoses/{report_id}")
        assert other.status_code == 200
        assert other.json()["qa"][0]["input_source"] == "voice"
        assert other.json()["qa"][0]["unknown"] is True


def test_voice_source_is_preserved_in_qa():
    with TestClient(app) as c:
        _, csrf = register(c)
        s = start(c, csrf, "空调不制冷").json()
        q = s["current_question"]
        r = answer(c, csrf, s["session_id"], s["version"], q["id"], "normal", "有风，但吹出来不凉", source="voice")
        assert r.status_code == 200
        assert r.json()["qa"][0]["input_source"] == "voice"
        assert r.json()["qa"][0]["selection_source"]
