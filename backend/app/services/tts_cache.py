"""语音合成结果的内存缓存（单实例）。

- 相同文本 / 音色 / 语速只向供应商付费一次
- 同时限制条数与总字节数，避免长音频在 Render 免费档占满内存
- 仅适用于单进程演示；多实例部署需改用 Redis 等共享存储
"""
from __future__ import annotations

import hashlib
import time
from collections import OrderedDict

from app.core.config import settings


class TTSCache:
    def __init__(self, max_entries: int, max_bytes: int, ttl_seconds: int) -> None:
        self._max_entries = max_entries
        self._max_bytes = max_bytes
        self._ttl = ttl_seconds
        self._items: OrderedDict[str, tuple[float, bytes]] = OrderedDict()
        self._total_bytes = 0

    @staticmethod
    def make_key(provider: str, text: str, voice: str, speed: float) -> str:
        raw = f"{provider}|{voice}|{speed:.2f}|{text}".encode("utf-8")
        return hashlib.sha256(raw).hexdigest()

    def get(self, key: str) -> bytes | None:
        item = self._items.get(key)
        if item is None:
            return None
        expires_at, audio = item
        if expires_at <= time.monotonic():
            self._remove(key)
            return None
        self._items.move_to_end(key)
        return audio

    def put(self, key: str, audio: bytes) -> None:
        if len(audio) > self._max_bytes:
            return
        if key in self._items:
            self._remove(key)
        self._items[key] = (time.monotonic() + self._ttl, audio)
        self._total_bytes += len(audio)
        while (
            len(self._items) > self._max_entries
            or self._total_bytes > self._max_bytes
        ):
            oldest = next(iter(self._items), None)
            if oldest is None:
                break
            self._remove(oldest)

    def clear(self) -> None:
        self._items.clear()
        self._total_bytes = 0

    def _remove(self, key: str) -> None:
        item = self._items.pop(key, None)
        if item is not None:
            self._total_bytes = max(0, self._total_bytes - len(item[1]))


_cache = TTSCache(
    max_entries=settings.tts_cache_max_entries,
    max_bytes=settings.tts_cache_max_bytes,
    ttl_seconds=settings.tts_cache_ttl_seconds,
)


def get_tts_cache() -> TTSCache:
    return _cache
