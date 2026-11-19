"""阶段十二：云端诊断报告与维修记录的保存、归属、幂等与导入。"""
from fastapi.testclient import TestClient

from app.main import app
from app.services.receipts import issue_diagnosis_receipt


def register(client: TestClient, username: str) -> tuple[dict, str]:
    resp = client.post(
        "/api/auth/register", json={"username": username, "password": "SafePass123"}
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return body["user"], body["csrf_token"]


def content(conclusion: str = "初步判断为滤网积尘。") -> dict:
    return {
        "standard": {
            "conclusion": conclusion,
            "possible_causes": [
                {"title": "滤网积尘", "description": "影响出风量"},
            ],
            "evidence": ["故障现象：制冷效果变差"],
            "unknown_information": ["「是否清洗过滤网」用户回答：不清楚（未知，未作为确认事实）"],
            "suggestions": [
                {"title": "断电清洗滤网", "description": "取出滤网清水冲洗晾干"},
            ],
            "tips": "定期清洗滤网",
            "risk_note": "不要自行拆卸内部部件",
        },
        "elder": {
            "conclusion": "多半是过滤网太脏了。",
            "possible_causes": [
                {"title": "滤网积尘", "description": "影响出风量"},
            ],
            "evidence": ["故障现象：制冷效果变差"],
            "unknown_information": [],
            "suggestions": [
                {"title": "第一步：洗过滤网", "description": "断电后取出冲洗"},
            ],
            "tips": "过滤网要常洗",
            "risk_note": "不要自己拆空调",
        },
    }


def diagnosis_payload(client_ref: str, **overrides) -> dict:
    payload = {
        "client_ref": client_ref,
        "category": "ac",
        "symptom": "制冷效果变差",
        "description": "用了三年，最近不太凉",
        "source": "template",
        "risk_level": "low",
        "qa": [
            {
                "question_id": "q1",
                "question_text": "过滤网多久没洗了？",
                "answer": "不清楚",
                "unknown": True,
            }
        ],
        "content": content(),
    }
    payload.update(overrides)
    return payload


def repair_payload(client_ref: str, **overrides) -> dict:
    payload = {
        "client_ref": client_ref,
        "device_name": "客厅空调",
        "fault_description": "制冷效果变差",
        "repair_method": "清洗滤网",
        "verification_status": "unverified",
        "status": "pending",
        "images": [],
    }
    payload.update(overrides)
    return payload


def test_save_list_and_detail_with_idempotency():
    with TestClient(app) as a:
        user, csrf = register(a, "rec_alpha")
        h = {"X-CSRF-Token": csrf}

        payload = diagnosis_payload("diag-alpha-1")
        first = a.post("/api/diagnoses", json=payload, headers=h)
        assert first.status_code == 201, first.text
        body = first.json()
        assert body["verified"] is False
        assert body["source"] == "template"
        assert body["qa"][0]["unknown"] is True
        assert body["content"]["elder"]["conclusion"].startswith("多半是")

        # 重复提交同一 client_ref：返回同一条，不新增
        again = a.post("/api/diagnoses", json=payload, headers=h)
        assert again.status_code == 201
        assert again.json()["id"] == body["id"]

        listing = a.get("/api/diagnoses")
        assert listing.status_code == 200
        assert len([x for x in listing.json() if x["client_ref"] == "diag-alpha-1"]) == 1

        detail = a.get(f"/api/diagnoses/{body['id']}")
        assert detail.status_code == 200
        assert detail.json()["risk_level"] in {"low", "medium", "high"}
        assert detail.json()["risk_rules_version"] is None


def test_ai_source_requires_valid_server_receipt():
    with TestClient(app) as a:
        user, csrf = register(a, "rec_receipt")
        h = {"X-CSRF-Token": csrf}
        payload = diagnosis_payload("diag-ai-1", source="ai", ai_model="glm-4-flash")

        missing = a.post("/api/diagnoses", json=payload, headers=h)
        assert missing.status_code == 422
        assert missing.json()["detail"]["code"] == "ai_source_unverified"

        forged = dict(payload, receipt="forged.token")
        assert a.post("/api/diagnoses", json=forged, headers=h).status_code == 422

        # 服务端签发的回执：风险等级与模型名以回执为准
        receipt = issue_diagnosis_receipt(
            user_id=user["id"],
            category=payload["category"],
            symptom=payload["symptom"],
            description=payload["description"],
            qa=payload["qa"],
            risk_floor="medium",
            ai_model="glm-4-flash",
            rules_version="SAFETY-TEST",
        )
        ok = a.post(
            "/api/diagnoses",
            json=dict(payload, receipt=receipt, risk_level="low"),
            headers=h,
        )
        assert ok.status_code == 201, ok.text
        body = ok.json()
        assert body["verified"] is True
        assert body["source"] == "ai"
        assert body["risk_level"] == "medium"
        assert body["ai_model"] == "glm-4-flash"

        # 内容被篡改（问答摘要不一致）时拒绝保存
        tampered = dict(payload, receipt=receipt, client_ref="diag-ai-2", symptom="漏水")
        assert a.post("/api/diagnoses", json=tampered, headers=h).status_code == 422


def test_user_isolation_and_direct_id_access():
    with TestClient(app) as a, TestClient(app) as b:
        user_a, csrf_a = register(a, "rec_user_a")
        user_b, csrf_b = register(b, "rec_user_b")

        saved = a.post(
            "/api/diagnoses",
            json=diagnosis_payload("diag-a-private"),
            headers={"X-CSRF-Token": csrf_a},
        )
        assert saved.status_code == 201
        report_id = saved.json()["id"]

        repair = a.post(
            "/api/repairs",
            json=repair_payload("rep-a-private", diagnosis_ref="diag-a-private"),
            headers={"X-CSRF-Token": csrf_a},
        )
        assert repair.status_code == 201, repair.text
        repair_id = repair.json()["id"]
        assert repair.json()["diagnosis_ref"] == "diag-a-private"

        # B 列表为空，猜 ID 也读不到、改不了
        assert b.get("/api/diagnoses").json() == []
        assert b.get(f"/api/diagnoses/{report_id}").status_code == 404
        assert b.get("/api/repairs").json() == []
        assert b.get(f"/api/repairs/{repair_id}").status_code == 404
        assert (
            b.patch(
                f"/api/repairs/{repair_id}",
                json={"verification_status": "recovered"},
                headers={"X-CSRF-Token": csrf_b},
            ).status_code
            == 404
        )

        # CSRF 缺失时写接口拒绝
        assert (
            a.post("/api/diagnoses", json=diagnosis_payload("diag-no-csrf")).status_code
            == 403
        )


def test_repair_update_and_verification_sync():
    with TestClient(app) as a:
        _, csrf = register(a, "rec_repair")
        h = {"X-CSRF-Token": csrf}
        created = a.post("/api/repairs", json=repair_payload("rep-1"), headers=h)
        assert created.status_code == 201, created.text
        rid = created.json()["id"]
        assert created.json()["verification_status"] == "unverified"
        assert created.json()["status"] == "pending"

        patched = a.patch(
            f"/api/repairs/{rid}",
            json={"verification_status": "notRecovered", "technician": "王师傅", "cost": 120},
            headers=h,
        )
        assert patched.status_code == 200
        body = patched.json()
        assert body["verification_status"] == "notRecovered"
        assert body["status"] == "failed"
        assert body["technician"] == "王师傅"
        assert body["cost"] == 120.0


def test_import_is_idempotent_and_not_marked_verified():
    with TestClient(app) as a:
        _, csrf = register(a, "rec_import")
        h = {"X-CSRF-Token": csrf}
        item = diagnosis_payload("local:diag-old-1", source="unknown", imported=True)
        item.pop("imported")

        first = a.post("/api/diagnoses/import", json={"items": [item]}, headers=h)
        assert first.status_code == 200, first.text
        assert first.json()[0]["imported"] is True
        assert first.json()[0]["verified"] is False

        second = a.post("/api/diagnoses/import", json={"items": [item]}, headers=h)
        assert second.status_code == 200
        assert second.json()[0]["id"] == first.json()[0]["id"]
        assert len(a.get("/api/diagnoses").json()) == 1

        repair_item = repair_payload("local:rep-old-1")
        assert (
            a.post("/api/repairs/import", json={"items": [repair_item]}, headers=h).status_code
            == 200
        )
        # 设备未关联时不强行绑定
        assert a.get("/api/repairs").json()[0]["device_id"] is None


def test_device_must_belong_to_current_user():
    with TestClient(app) as a, TestClient(app) as b:
        _, csrf_a = register(a, "rec_dev_a")
        _, csrf_b = register(b, "rec_dev_b")
        dev_b = b.post(
            "/api/devices",
            json={"name": "B 的冰箱", "category": "fridge"},
            headers={"X-CSRF-Token": csrf_b},
        ).json()

        resp = a.post(
            "/api/diagnoses",
            json=diagnosis_payload("diag-dev-x", device_id=dev_b["id"]),
            headers={"X-CSRF-Token": csrf_a},
        )
        assert resp.status_code == 404
