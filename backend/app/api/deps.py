"""认证依赖：会话由服务端 HttpOnly Cookie 决定，不再接受 X-User-Id 指定用户。"""
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.auth import resolve_session, revoke_session, verify_csrf


@dataclass
class AuthContext:
    user: User
    session: AuthSession
    raw_token: str


def get_optional_auth(
    request: Request, db: Session = Depends(get_db)
) -> AuthContext | None:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if not raw_token:
        return None
    session = resolve_session(db, raw_token)
    if session is None:
        return None
    user = db.get(User, session.user_id)
    if user is None:
        revoke_session(db, session)
        return None
    return AuthContext(user=user, session=session, raw_token=raw_token)


def get_auth_context(
    ctx: AuthContext | None = Depends(get_optional_auth),
) -> AuthContext:
    if ctx is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "not_authenticated",
                "message": "登录状态已失效，请重新登录",
            },
        )
    return ctx


def get_current_user(ctx: AuthContext = Depends(get_auth_context)) -> User:
    return ctx.user


def require_csrf(
    ctx: AuthContext = Depends(get_auth_context),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> AuthContext:
    """修改数据请求必须携带与会话匹配的 CSRF 令牌。"""
    if not verify_csrf(ctx.raw_token, x_csrf_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "csrf_failed",
                "message": "安全校验失败，请刷新页面后重试",
            },
        )
    return ctx
