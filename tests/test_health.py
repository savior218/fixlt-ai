import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["deployment_mode"] in {"dev", "public"}
    assert body["safety_rules_version"].startswith("SAFETY-")


def test_devices_require_known_user(client) -> None:
    resp = client.get("/api/devices", headers={"X-User-Id": "999"})
    assert resp.status_code == 401


def test_demo_devices_seeded(client) -> None:
    resp = client.get("/api/devices", headers={"X-User-Id": "1"})
    assert resp.status_code == 200
    devices = resp.json()
    assert len(devices) == 3
    assert {d["category"] for d in devices} == {"ac", "fridge", "washer"}
