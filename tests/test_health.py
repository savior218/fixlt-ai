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
    assert len(devices) == 3
    assert {d["category"] for d in devices} == {"ac", "fridge", "washer"}
