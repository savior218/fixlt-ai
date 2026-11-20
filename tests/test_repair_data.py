"""阶段十四：报修事项结果语义、幂等、照片归属与个人数据管理。"""
import uuid

from fastapi.testclient import TestClient

from app.main import app


def register(client: TestClient) -> tuple[dict, str]:
    username = f"d14{uuid.uuid4().hex[:10]}"
    resp = client.post(
        "/api/auth/register", json={"username": username, "password": "SafePass123"}
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return body["user"], body["csrf_token"]


def headers(csrf: str) -> dict:
    return {"X-CSRF-Token": csrf}


def ticket_payload(ref: str, **overrides) -> dict:
    payload = {
        "client_ref": ref,
        "category": "ac",
        "symptom": "制冷效果变差",
        "description": "最近不太凉",
        "brand": "格力",
        "model": "KFR-35GW",
        "checks": ["已检查电源是否正常"],
        "content": "报修说明：空调制冷效果变差。",
        "photo_ids": [],
    }
    payload.update(overrides)
    return payload


def test_ticket_idempotent_and_user_reported_progress(client: TestClient):
    _, csrf = register(client)
    h = headers(csrf)
    ref = f"ticket-{uuid.uuid4().hex}"

    first = client.post("/api/repair-tickets", json=ticket_payload(ref), headers=h)
    assert first.status_code == 201, first.text
    ticket = first.json()
    assert ticket["progress_status"] == "pending_contact"
    assert ticket["status"] == "pending"
    assert ticket["progress_updated_by"]
    assert ticket["progress_history"][0]["source"] == "self_reported"

    # 同一 client_ref 重试：返回同一条，不创建重复事项
    again = client.post("/api/repair-tickets", json=ticket_payload(ref), headers=h)
    assert again.status_code == 201
    assert again.json()["id"] == ticket["id"]

    progress = client.patch(
        f"/api/repair-tickets/{ticket['id']}/progress",
        json={
            "progress_status": "scheduled",
            "contact_target": "格力售后",
            "contacted_at": "2026-11-19",
            "appointment_at": "2026-11-22",
            "contact_note": "已约周六上门",
        },
        headers=h,
    )
    assert progress.status_code == 200, progress.text
    body = progress.json()
    assert body["progress_status"] == "scheduled"
    assert body["contact_target"] == "格力售后"
    assert body["appointment_at"] == "2026-11-22"
    # 旧状态字段不被改写
    assert body["status"] == "pending"

    detail = client.get(f"/api/repair-tickets/{ticket['id']}")
    assert detail.status_code == 200
    assert detail.json()["contact_note"] == "已约周六上门"


def test_ticket_pagination_and_ownership():
    with TestClient(app) as ca, TestClient(app) as cb:
        user_a, csrf_a = register(ca)
        user_b, csrf_b = register(cb)
        ha, hb = headers(csrf_a), headers(csrf_b)

        ids = []
        for i in range(12):
            resp = ca.post(
                "/api/repair-tickets",
                json=ticket_payload(f"ticket-{uuid.uuid4().hex}", symptom=f"故障{i}"),
                headers=ha,
            )
            assert resp.status_code == 201, resp.text
            ids.append(resp.json()["id"])

        page1 = ca.get("/api/repair-tickets?page=1&page_size=10")
        assert page1.status_code == 200
        data = page1.json()
        assert data["total"] == 12
        assert len(data["items"]) == 10
        page2 = ca.get("/api/repair-tickets?page=2&page_size=10")
        assert len(page2.json()["items"]) == 2

        # B 不能读取/更新 A 的事项
        assert cb.get(f"/api/repair-tickets/{ids[0]}", headers=hb).status_code == 404
        assert (
            cb.patch(
                f"/api/repair-tickets/{ids[0]}/progress",
                json={"progress_status": "contacted"},
                headers=hb,
            ).status_code
            == 404
        )
        # 未登录也不能读取
        anon = TestClient(app)
        assert anon.get(f"/api/repair-tickets/{ids[0]}").status_code == 401


def test_photo_link_and_cross_user_denied():
    with TestClient(app) as ca, TestClient(app) as cb:
        user_a, csrf_a = register(ca)
        user_b, csrf_b = register(cb)
        ha, hb = headers(csrf_a), headers(csrf_b)

        photo = ca.post(
            "/api/diagnose/photo",
            files={"file": ("fault.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
            headers=ha,
        )
        assert photo.status_code == 201, photo.text
        photo_id = photo.json()["id"]

        ticket = ca.post(
            "/api/repair-tickets",
            json=ticket_payload(f"ticket-{uuid.uuid4().hex}", photo_ids=[photo_id]),
            headers=ha,
        )
        assert ticket.status_code == 201, ticket.text
        assert ticket.json()["photo_ids"] == [photo_id]

        # B 不能读取 A 的照片，也不能把 A 的照片挂到自己的事项
        assert cb.get(f"/api/diagnose/photo/{photo_id}", headers=hb).status_code == 404
        b_ticket = cb.post(
            "/api/repair-tickets",
            json=ticket_payload(f"ticket-{uuid.uuid4().hex}", photo_ids=[photo_id]),
            headers=hb,
        )
        assert b_ticket.status_code == 404

        # A 本人可读取照片本体
        raw = ca.get(f"/api/diagnose/photo/{photo_id}")
        assert raw.status_code == 200
        assert raw.headers["content-type"] == "image/png"


def test_data_summary_export_and_delete_scope():
    with TestClient(app) as ca, TestClient(app) as cb:
        user_a, csrf_a = register(ca)
        user_b, csrf_b = register(cb)
        ha, hb = headers(csrf_a), headers(csrf_b)

        device = ca.post(
            "/api/devices",
            json={"name": "客厅空调", "category": "ac", "brand": "格力"},
            headers=ha,
        )
        assert device.status_code == 201, device.text
        device_id = device.json()["id"]

        ticket = ca.post(
            "/api/repair-tickets",
            json=ticket_payload(f"ticket-{uuid.uuid4().hex}", device_id=device_id),
            headers=ha,
        ).json()

        photo = ca.post(
            "/api/diagnose/photo",
            files={"file": ("fault.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
            headers=ha,
        ).json()

        summary = ca.get("/api/data/summary").json()
        assert summary["devices"] == 1
        assert summary["tickets"] == 1
        assert summary["photos"] == 1

        export = ca.get("/api/data/export")
        assert export.status_code == 200
        payload = export.json()
        assert payload["account"]["username"] == user_a["username"]
        assert "password_hash" not in export.text
        assert "csrf" not in export.text.lower()
        assert payload["tickets"][0]["id"] == ticket["id"]

        # B 的账号里看不到 A 的数据
        b_summary = cb.get("/api/data/summary", headers=hb).json()
        assert b_summary["devices"] == 0

        # B 删除 A 的工单：整体拒绝，A 数据仍在
        denied = cb.request("DELETE", 
            "/api/data/items",
            json={"items": [{"type": "ticket", "id": ticket["id"]}]},
            headers=hb,
        )
        assert denied.status_code == 404
        assert ca.get("/api/data/summary").json()["tickets"] == 1

        # A 删除设备：事项保留，只解除 device_id
        deleted_device = ca.request("DELETE", 
            "/api/data/items",
            json={"items": [{"type": "device", "id": device_id}]},
            headers=ha,
        )
        assert deleted_device.status_code == 200, deleted_device.text
        remaining = ca.get(f"/api/repair-tickets/{ticket['id']}").json()
        assert remaining["device_id"] is None

        # 删除照片：本体不可再读取，事项中的关联也移除
        assert ca.get(f"/api/diagnose/photo/{photo['id']}").status_code == 200
        ca.request("DELETE", 
            "/api/data/items",
            json={"items": [{"type": "photo", "id": photo["id"]}]},
            headers=ha,
        )
        assert ca.get(f"/api/diagnose/photo/{photo['id']}").status_code == 404
        assert ca.get(f"/api/repair-tickets/{ticket['id']}").json()["photo_ids"] == []


def test_ticket_validation_and_guest(client: TestClient):
    # 未登录保存：401，不创建本地或服务端事项
    resp = client.post(
        "/api/repair-tickets",
        json=ticket_payload(f"ticket-{uuid.uuid4().hex}"),
        headers={"X-CSRF-Token": "guest"},
    )
    assert resp.status_code == 401

    _, csrf = register(client)
    bad = client.post(
        "/api/repair-tickets",
        json={
            "client_ref": f"ticket-{uuid.uuid4().hex}",
            "category": "ac",
            "content": "缺少故障现象",
        },
        headers=headers(csrf),
    )
    assert bad.status_code == 422
    assert client.get("/api/data/summary").json()["tickets"] == 0


def test_data_delete_requires_csrf(client: TestClient):
    _, csrf = register(client)
    resp = client.post(
        "/api/repair-tickets",
        json=ticket_payload(f"ticket-{uuid.uuid4().hex}"),
        headers=headers(csrf),
    )
    ticket_id = resp.json()["id"]
    denied = client.request("DELETE", 
        "/api/data/items",
        json={"items": [{"type": "ticket", "id": ticket_id}]},
        headers={"X-CSRF-Token": "wrong"},
    )
    assert denied.status_code == 403
    assert client.get("/api/data/summary").json()["tickets"] == 1

