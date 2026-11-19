"""阶段十一：注册登录、会话撤销、CSRF、设备归属隔离与非破坏迁移。"""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text

from app.core.config import settings
from app.database.session import SessionLocal, ensure_schema_migrations
from app.main import app
from app.models.auth_session import AuthSession
from app.services.auth import token_hash
from app.services.limiter import reset_auth_limiter


@contextmanager
def browser():
    with TestClient(app) as c:
        yield c


def register(client, username: str, password: str = "SafePass123", nickname=None):
    payload = {"username": username, "password": password}
    if nickname:
        payload["nickname"] = nickname
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return body["user"], body["csrf_token"]


def login(client, username: str, password: str = "SafePass123"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_register_login_profile_and_logout(client):
    user, csrf = register(client, "alpha_user", nickname="小阿")
    assert user["username"] == "alpha_user"
    assert user["nickname"] == "小阿"

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["nickname"] == "小阿"

    updated = client.patch(
        "/api/auth/profile",
        json={"nickname": "新的昵称"},
        headers={"X-CSRF-Token": csrf},
    )
    assert updated.status_code == 200
    assert updated.json()["user"]["nickname"] == "新的昵称"

    # 模拟刷新：新客户端仅携带 Cookie，通过服务端恢复登录态
    fresh = TestClient(app)
    try:
        fresh.cookies.set(
            settings.session_cookie_name,
            client.cookies.get(settings.session_cookie_name),
        )
        restored = fresh.get("/api/auth/me")
        assert restored.status_code == 200
        assert restored.json()["user"]["nickname"] == "新的昵称"
    finally:
        fresh.close()

    # 退出必须携带 CSRF；退出后原会话失效
    assert client.post("/api/auth/logout").status_code == 403
    assert (
        client.post(
            "/api/auth/logout", headers={"X-CSRF-Token": csrf}
        ).status_code
        == 204
    )
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/api/auth/logout", headers={"X-CSRF-Token": csrf}
        ).status_code
        == 204
    )


def test_duplicate_username_and_wrong_password(client):
    register(client, "Beta_User")
    duplicate = client.post(
        "/api/auth/register",
        json={"username": "beta_user", "password": "SafePass123"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "username_taken"

    assert login(client, "Beta_User", "WrongPass123").status_code == 401
    assert login(client, "Beta_User").status_code == 200


def test_short_password_is_rejected(client):
    resp = client.post(
        "/api/auth/register", json={"username": "short_pwd", "password": "1234567"}
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "validation_error"


def test_change_password_revokes_old_sessions(client):
    user, csrf = register(client, "gamma_user")
    old_cookie = client.cookies.get(settings.session_cookie_name)

    wrong = client.post(
        "/api/auth/password",
        json={"current_password": "bad", "new_password": "NewPass123"},
        headers={"X-CSRF-Token": csrf},
    )
    assert wrong.status_code == 400
    assert wrong.json()["detail"]["code"] == "invalid_current_password"

    changed = client.post(
        "/api/auth/password",
        json={"current_password": "SafePass123", "new_password": "NewPass123"},
        headers={"X-CSRF-Token": csrf},
    )
    assert changed.status_code == 200
    assert changed.json()["relogin_required"] is True

    # 旧 Cookie 会话已被服务端撤销
    assert client.get("/api/auth/me").status_code == 401
    fresh = TestClient(app)
    try:
        fresh.cookies.set(settings.session_cookie_name, old_cookie)
        assert fresh.get("/api/auth/me").status_code == 401
    finally:
        fresh.close()

    assert login(client, "gamma_user", "SafePass123").status_code == 401
    assert login(client, "gamma_user", "NewPass123").status_code == 200


def test_expired_and_invalid_session_are_rejected(client):
    register(client, "delta_user")
    raw = client.cookies.get(settings.session_cookie_name)
    db = SessionLocal()
    try:
        session = db.scalar(
            select(AuthSession).where(AuthSession.token_hash == token_hash(raw))
        )
        session.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
            seconds=1
        )
        db.commit()
    finally:
        db.close()

    assert client.get("/api/auth/me").status_code == 401
    invalid = TestClient(app)
    try:
        invalid.cookies.set(settings.session_cookie_name, "not-a-real-token")
        assert invalid.get("/api/auth/me").status_code == 401
    finally:
        invalid.close()


def test_device_ownership_isolation_and_csrf(client):
    a_user, a_csrf = register(client, "owner_a")
    created = client.post(
        "/api/devices",
        json={"name": "A 的空调", "category": "ac"},
        headers={"X-CSRF-Token": a_csrf},
    )
    assert created.status_code == 201
    device_id = created.json()["id"]
    assert client.get("/api/devices").json()[0]["name"] == "A 的空调"

    # 缺少 CSRF 的写请求被拒绝
    no_csrf = client.put(f"/api/devices/{device_id}", json={"name": "改名"})
    assert no_csrf.status_code == 403
    assert no_csrf.json()["detail"]["code"] == "csrf_failed"

    with browser() as b:
        b_user, b_csrf = register(b, "owner_b")
        assert b.get("/api/devices").json() == []
        # 直接猜设备 ID 也拿不到 A 的数据
        assert b.get(f"/api/devices/{device_id}").status_code == 404
        assert (
            b.put(
                f"/api/devices/{device_id}",
                json={"name": "B 篡改"},
                headers={"X-CSRF-Token": b_csrf},
            ).status_code
            == 404
        )
        assert (
            b.delete(
                f"/api/devices/{device_id}", headers={"X-CSRF-Token": b_csrf}
            ).status_code
            == 404
        )
        # 伪造 X-User-Id 不能冒充 A
        assert (
            b.get(f"/api/devices/{device_id}", headers={"X-User-Id": str(a_user["id"])}).status_code
            == 404
        )
        assert b.get("/api/devices", headers={"X-User-Id": str(a_user["id"])}).json() == []

    # 未登录直接猜 ID 也不可访问
    anonymous = TestClient(app)
    try:
        assert anonymous.get(f"/api/devices/{device_id}").status_code == 401
        assert (
            anonymous.get(
                f"/api/devices/{device_id}", headers={"X-User-Id": str(a_user["id"])}
            ).status_code
            == 401
        )
    finally:
        anonymous.close()


def test_guest_demo_is_read_only(client):
    assert client.get("/api/demo/devices").status_code == 200
    assert client.put("/api/devices/1", json={"name": "x"}).status_code == 401


def test_login_rate_limit(client, monkeypatch):
    register(client, "login_limit_user")
    monkeypatch.setattr(settings, "auth_login_rate_limit_per_minute", 1)
    reset_auth_limiter()
    first = login(client, "login_limit_user")
    assert first.status_code == 200
    second = login(client, "login_limit_user", "WrongPass123")
    assert second.status_code == 429
    assert second.json()["detail"]["code"] == "rate_limited"


def test_register_rate_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_register_rate_limit_per_minute", 1)
    reset_auth_limiter()
    first = client.post(
        "/api/auth/register",
        json={"username": "limit_user_1", "password": "SafePass123"},
    )
    assert first.status_code == 201
    second = client.post(
        "/api/auth/register",
        json={"username": "limit_user_2", "password": "SafePass123"},
    )
    assert second.status_code == 429
    assert second.json()["detail"]["code"] == "rate_limited"


def test_schema_migration_is_non_destructive(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'legacy.db').as_posix()}")
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    username VARCHAR(64) NOT NULL UNIQUE,
                    password_hash VARCHAR(256) NOT NULL DEFAULT '',
                    email VARCHAR(255),
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )
        conn.execute(
            text(
                "INSERT INTO users (id, username, password_hash) "
                "VALUES (1, 'legacy_user', 'legacy-hash')"
            )
        )

    before = {c["name"] for c in inspect(engine).get_columns("users")}
    assert "nickname" not in before

    ensure_schema_migrations(engine)

    after = {c["name"] for c in inspect(engine).get_columns("users")}
    assert "nickname" in after
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, username, password_hash FROM users")).all()
    assert rows == [(1, "legacy_user", "legacy-hash")]
