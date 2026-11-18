from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"


def test_devices_require_known_user() -> None:
    resp = client.get("/api/devices", headers={"X-User-Id": "999"})
    assert resp.status_code == 401


def test_demo_devices_seeded() -> None:
    resp = client.get("/api/devices", headers={"X-User-Id": "1"})
    assert resp.status_code == 200
    devices = resp.json()
    # 种子数据包含空调/冰箱/洗衣机三类；测试期额外添加的设备不影响该断言
    assert {"ac", "fridge", "washer"} <= {d["category"] for d in devices}
