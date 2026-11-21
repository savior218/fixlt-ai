"""模型接口单实例内存限流（开发 / 演示部署边界）。

- 滑动窗口：每客户端每分钟最多 N 次
- 并发上限：同时最多 M 个模型请求
- 仅适用于单进程演示；公开多实例部署需改为 Redis 等共享存储
"""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: int) -> None:
        super().__init__("too many requests")
        self.retry_after = retry_after


class ConcurrencyExceeded(Exception):
    pass


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._inflight = 0
        self._lock = asyncio.Lock()

    async def hit(self, key: str, limit: int) -> None:
        """只计数不占用并发额度（用于登录 / 注册等短请求限流）。"""
        async with self._lock:
            now = time.monotonic()
            window_start = now - 60
            hits = [t for t in self._hits[key] if t >= window_start]
            self._hits[key] = hits
            if len(hits) >= limit:
                retry_after = max(1, int(60 - (now - hits[0])) if hits else 60)
                raise RateLimitExceeded(retry_after)
            hits.append(now)

    async def acquire(self, key: str, limit: int, max_inflight: int) -> None:
        async with self._lock:
            now = time.monotonic()
            window_start = now - 60
            hits = [t for t in self._hits[key] if t >= window_start]
            self._hits[key] = hits
            if len(hits) >= limit:
                retry_after = max(1, int(60 - (now - hits[0])) if hits else 60)
                raise RateLimitExceeded(retry_after)
            if self._inflight >= max_inflight:
                raise ConcurrencyExceeded()
            hits.append(now)
            self._inflight += 1

    async def release(self) -> None:
        async with self._lock:
            self._inflight = max(0, self._inflight - 1)

    def reset(self) -> None:
        self._hits.clear()
        self._inflight = 0


_limiter = SlidingWindowLimiter()
_auth_limiter = SlidingWindowLimiter()
# 语音合成独立计数：避免连续朗读挤占诊断模型的额度
_tts_limiter = SlidingWindowLimiter()


def get_limiter() -> SlidingWindowLimiter:
    return _limiter


def get_auth_limiter() -> SlidingWindowLimiter:
    return _auth_limiter


def get_tts_limiter() -> SlidingWindowLimiter:
    return _tts_limiter


def reset_limiter() -> None:
    _limiter.reset()


def reset_auth_limiter() -> None:
    _auth_limiter.reset()


def reset_tts_limiter() -> None:
    _tts_limiter.reset()
