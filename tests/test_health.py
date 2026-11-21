def test_health(client) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["deployment_mode"] in {"dev", "public"}
    assert body["safety_rules_version"].startswith("SAFETY-")
    # 只暴露是否配置，不返回密钥；测试环境没有百度 key
    assert body["tts_provider"] in {"baidu", "zhipu"}
    assert body["tts_configured"] is False


def test_private_devices_require_login(client) -> None:
    assert client.get("/api/devices").status_code == 401
    # 旧 X-User-Id 机制已移除，伪造该头不能获得数据
    assert client.get("/api/devices", headers={"X-User-Id": "1"}).status_code == 401


def test_demo_devices_are_public_read_only(client) -> None:
    resp = client.get("/api/demo/devices")
    assert resp.status_code == 200
    devices = resp.json()
    assert len(devices) == 3
    assert {d["category"] for d in devices} == {"ac", "fridge", "washer"}
    assert all(d["demo"] is True for d in devices)

    # 游客不能修改共享样例或真实数据
    assert client.put("/api/devices/1", json={"name": "被改的样例"}).status_code == 401
    assert client.delete("/api/devices/1").status_code == 401
