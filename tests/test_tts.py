"""语音合成兜底接口的行为测试。"""
from __future__ import annotations

import pytest

from app.ai import tts_client
from app.core.config import settings
from app.services.tts_cache import get_tts_cache

WAV_BYTES = b"RIFF" + b"\x00" * 96


@pytest.fixture(autouse=True)
def clear_tts_cache():
    get_tts_cache().clear()
    yield


def _mock_synth(monkeypatch: pytest.MonkeyPatch, calls: list[tuple[str, str | None, float]]):
    async def fake(text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
        calls.append((text, voice, speed))
        return WAV_BYTES

    monkeypatch.setattr(tts_client, "synthesize", fake)


def test_tts_returns_wav_and_uses_cache(client, monkeypatch):
    calls: list[tuple[str, str | None, float]] = []
    _mock_synth(monkeypatch, calls)

    first = client.post("/api/tts", json={"text": "您好，我是修必达。", "speed": 1.0})
    assert first.status_code == 200
    assert first.headers["content-type"].startswith("audio/wav")
    assert first.content == WAV_BYTES
    assert first.headers["x-tts-cache"] == "miss"

    second = client.post("/api/tts", json={"text": "您好，我是修必达。", "speed": 1.0})
    assert second.status_code == 200
    assert second.headers["x-tts-cache"] == "hit"
    assert len(calls) == 1


def test_tts_rejects_blank_text(client):
    resp = client.post("/api/tts", json={"text": "   "})
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "empty_text"


def test_tts_rejects_too_long_text(client):
    resp = client.post("/api/tts", json={"text": "字" * 1025})
    assert resp.status_code == 422


def test_tts_returns_503_when_provider_fails(client, monkeypatch):
    async def fail(text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
        raise tts_client.TTSError("upstream", "boom")

    monkeypatch.setattr(tts_client, "synthesize", fail)
    resp = client.post("/api/tts", json={"text": "测试失败降级"})
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "tts_unavailable"


def test_tts_returns_503_when_not_configured(client):
    # 测试环境 FIXITAI_AI_API_KEY 为空，真实调用会直接失败而不访问外网
    resp = client.post("/api/tts", json={"text": "未配置密钥时的朗读"})
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "tts_unavailable"


def test_tts_reports_quota_exhausted(client, monkeypatch):
    async def no_quota(text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
        raise tts_client.TTSError("quota_exhausted", "余额不足或无可用资源包")

    monkeypatch.setattr(tts_client, "synthesize", no_quota)
    resp = client.post("/api/tts", json={"text": "额度不足时的朗读"})
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "tts_quota_exhausted"


def test_baidu_error_codes_map_to_shared_codes():
    cases = {
        "502": "auth",
        "508": "auth",
        "504": "rate_limited",
        "500": "bad_request",
        "503": "upstream",
    }
    for err_no, expected in cases.items():
        with pytest.raises(tts_client.TTSError) as info:
            tts_client._raise_baidu_error(err_no, "")
        assert info.value.code == expected

    with pytest.raises(tts_client.TTSError) as quota:
        tts_client._raise_baidu_error("502", "当前免费额度已用完")
    assert quota.value.code == "quota_exhausted"


def test_media_type_detects_wav_and_mp3():
    assert tts_client.media_type_of(WAV_BYTES) == "audio/wav"
    assert tts_client.media_type_of(b"ID3" + b"\x00" * 64) == "audio/mpeg"
    assert tts_client.media_type_of(b"\xff\xfb" + b"\x00" * 64) == "audio/mpeg"
    assert tts_client.media_type_of(b"not-audio") == ""


def test_cache_key_differs_between_providers():
    from app.services.tts_cache import TTSCache

    baidu_key = TTSCache.make_key("baidu", "你好", "0", 1.0)
    zhipu_key = TTSCache.make_key("zhipu", "你好", "0", 1.0)
    assert baidu_key != zhipu_key


def test_baidu_rejects_text_over_byte_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "tts_provider", "baidu")
    resp = client.post("/api/tts", json={"text": "字" * 400})
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "text_too_long"


def test_baidu_synthesize_protocol(monkeypatch):
    """百度接口参数：aue=6 拿 WAV、必须带 tok、per 取发音人编号。"""
    import asyncio

    import httpx

    from app.ai import tts_client as client_mod

    monkeypatch.setattr(settings, "tts_provider", "baidu")
    monkeypatch.setattr(settings, "baidu_tts_api_key", "ak")
    monkeypatch.setattr(settings, "baidu_tts_secret_key", "sk")

    async def fake_token(_client):
        return "TOKEN"

    monkeypatch.setattr(client_mod, "_baidu_token", fake_token)

    captured: dict = {}

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, **kwargs):
            captured["url"] = url
            captured["data"] = kwargs.get("data", {})
            return httpx.Response(
                200,
                headers={"content-type": "audio/wav"},
                content=WAV_BYTES,
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(client_mod.httpx, "AsyncClient", FakeClient)
    audio = asyncio.run(tts_client.synthesize("你好", speed=1.0))

    assert audio == WAV_BYTES
    assert captured["data"]["aue"] == "6"
    assert captured["data"]["tok"] == "TOKEN"
    assert captured["data"]["per"] == "0"
    assert captured["data"]["spd"] == "5"
    # 百度对 rate=16000 返回 err_no=501 parameter error，音频格式由 aue 决定
    assert "rate" not in captured["data"]


def test_baidu_json_error_body_maps_to_quota(monkeypatch):
    """百度出错时可能仍返回 200，但响应体是 JSON 错误。"""
    import asyncio
    import json

    import httpx

    from app.ai import tts_client as client_mod

    monkeypatch.setattr(settings, "tts_provider", "baidu")
    monkeypatch.setattr(settings, "baidu_tts_api_key", "ak")
    monkeypatch.setattr(settings, "baidu_tts_secret_key", "sk")

    async def fake_token(_client):
        return "TOKEN"

    monkeypatch.setattr(client_mod, "_baidu_token", fake_token)

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, **kwargs):
            body = json.dumps({"err_no": 502, "err_msg": "当前免费额度已用完"}).encode()
            return httpx.Response(
                200,
                headers={"content-type": "application/json"},
                content=body,
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(client_mod.httpx, "AsyncClient", FakeClient)
    with pytest.raises(tts_client.TTSError) as info:
        asyncio.run(tts_client.synthesize("额度测试"))
    assert info.value.code == "quota_exhausted"


def test_tts_rate_limits_guests(client, monkeypatch):
    calls: list[tuple[str, str | None, float]] = []
    _mock_synth(monkeypatch, calls)
    monkeypatch.setattr(settings, "tts_guest_rate_limit_per_minute", 1)

    first = client.post("/api/tts", json={"text": "第一次朗读"})
    assert first.status_code == 200

    second = client.post("/api/tts", json={"text": "第二次朗读"})
    assert second.status_code == 429
    assert second.json()["detail"]["code"] == "rate_limited"
    assert "Retry-After" in second.headers
