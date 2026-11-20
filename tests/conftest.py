"""测试环境：每次测试会话使用独立临时 SQLite 文件，避免污染开发数据库。"""
import os
import sys
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

_TEST_DB = Path(tempfile.gettempdir()) / f"fixitai-test-{uuid.uuid4().hex}.db"
os.environ["FIXITAI_DATABASE_URL"] = f"sqlite:///{_TEST_DB.as_posix()}"
# 测试中放开认证限流，避免同一 TestClient IP 触发 429；限流另有专门用例覆盖
os.environ["FIXITAI_AUTH_LOGIN_RATE_LIMIT_PER_MINUTE"] = "1000"
os.environ["FIXITAI_AUTH_REGISTER_RATE_LIMIT_PER_MINUTE"] = "1000"
# 测试必须与开发者的 backend/.env 隔离，避免本地真实密钥影响“未配置”用例
os.environ["FIXITAI_AI_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture
def client():
    """独立 TestClient：独立 Cookie 罐，等价于一个浏览器会话。"""
    from app.main import app

    with TestClient(app) as c:
        yield c
        c.close()
