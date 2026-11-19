"""账号与会话安全：Argon2 密码哈希、随机会话令牌、HMAC CSRF 令牌。"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auth_session import AuthSession

_hasher = PasswordHasher()
_DEV_SECRET = secrets.token_hex(32)
# 用户不存在时也执行一次同等成本的校验，降低通过响应时间探测账号的风险
_DUMMY_PASSWORD_HASH = _hasher.hash("fixitai-dummy-password-for-timing")


def hash_password(password: str) -> str:
    """使用 Argon2id 成熟实现，不自行设计加密算法。"""
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """哈希为空或格式异常一律视为验证失败，不向调用方暴露细节。"""
    if not password_hash:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def verify_dummy_password(password: str) -> None:
    """仅用于用户不存在时的等时校验，返回值没有业务意义。"""
    verify_password(_DUMMY_PASSWORD_HASH, password)


def _secret() -> bytes:
    if settings.session_secret:
        return settings.session_secret.encode("utf-8")
    if settings.deployment_mode == "public":
        raise RuntimeError(
            "生产环境必须配置 FIXITAI_SESSION_SECRET，禁止使用进程内默认密钥"
        )
    return _DEV_SECRET.encode("utf-8")


def ensure_auth_ready() -> None:
    """启动时快速失败：public 模式缺少会话密钥则不启动。"""
    _secret()


def _now() -> datetime:
    """统一使用无时区 UTC，兼容 SQLite 与 PostgreSQL。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def token_hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def csrf_token_for(raw_token: str) -> str:
    return hmac.new(
        _secret(), raw_token.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def verify_csrf(raw_token: str, submitted: str | None) -> bool:
    if not raw_token or not submitted:
        return False
    return hmac.compare_digest(csrf_token_for(raw_token), submitted)


def create_session(db: Session, user_id: int) -> tuple[AuthSession, str, str]:
    """返回（会话记录，原始 Cookie 令牌，CSRF 令牌）。数据库只存令牌摘要。"""
    raw_token = secrets.token_urlsafe(48)
    csrf_token = csrf_token_for(raw_token)
    session = AuthSession(
        user_id=user_id,
        token_hash=token_hash(raw_token),
        expires_at=_now() + timedelta(seconds=settings.session_ttl_seconds),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, raw_token, csrf_token


def resolve_session(db: Session, raw_token: str | None) -> AuthSession | None:
    if not raw_token:
        return None
    session = db.scalar(
        select(AuthSession).where(AuthSession.token_hash == token_hash(raw_token))
    )
    if session is None:
        return None
    if session.revoked_at is not None:
        return None
    if session.expires_at <= _now():
        session.revoked_at = _now()
        db.commit()
        return None
    return session


def revoke_session(db: Session, session: AuthSession) -> None:
    if session.revoked_at is None:
        session.revoked_at = _now()
        db.commit()


def revoke_user_sessions(db: Session, user_id: int) -> None:
    sessions = list(
        db.scalars(
            select(AuthSession).where(
                AuthSession.user_id == user_id,
                AuthSession.revoked_at.is_(None),
            )
        )
    )
    now = _now()
    for session in sessions:
        session.revoked_at = now
    db.commit()
