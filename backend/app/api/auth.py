"""账号注册 / 登录 / 当前用户 / 退出 / 资料与密码修改。"""
from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_csrf
from app.core.config import settings
from app.database.session import get_db
from app.models.preference import UserPreference
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UpdateProfileRequest,
    UserOut,
)
from app.services.auth import (
    create_session,
    csrf_token_for,
    hash_password,
    resolve_session,
    revoke_session,
    revoke_user_sessions,
    verify_csrf,
    verify_dummy_password,
    verify_password,
)
from app.services.limiter import RateLimitExceeded, get_auth_limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def _limit(request: Request, action: str, limit: int) -> None:
    limiter = get_auth_limiter()
    try:
        await limiter.hit(f"{action}:{_client_key(request)}", limit)
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "尝试次数过多，请稍后再试",
            },
            headers={"Retry-After": str(e.retry_after)},
        ) from e


def _set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=raw_token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.effective_cookie_secure,
        samesite=settings.session_cookie_samesite,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.effective_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )


def _auth_payload(user: User, raw_token: str) -> AuthResponse:
    return AuthResponse(
        user=UserOut.from_user(user),
        csrf_token=csrf_token_for(raw_token),
    )


def _bad_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "code": "invalid_credentials",
            "message": "用户名或密码不正确",
        },
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    await _limit(request, "register", settings.auth_register_rate_limit_per_minute)

    existing = db.scalar(
        select(User).where(func.lower(User.username) == payload.username.lower())
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "username_taken",
                "message": "该用户名已被使用，请换一个",
            },
        )

    user = User(
        username=payload.username,
        nickname=payload.nickname or payload.username,
        password_hash=hash_password(payload.password),
    )
    user.preferences = UserPreference()
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "username_taken",
                "message": "该用户名已被使用，请换一个",
            },
        )
    db.refresh(user)

    _, raw_token, _ = create_session(db, user.id)
    _set_session_cookie(response, raw_token)
    return _auth_payload(user, raw_token)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    await _limit(request, "login", settings.auth_login_rate_limit_per_minute)

    user = db.scalar(
        select(User).where(func.lower(User.username) == payload.username.lower())
    )
    if user is None:
        # 用户不存在时也执行一次哈希校验，避免通过响应时间探测账号是否存在
        verify_dummy_password(payload.password)
        raise _bad_credentials()
    if not verify_password(user.password_hash, payload.password):
        raise _bad_credentials()

    _, raw_token, _ = create_session(db, user.id)
    _set_session_cookie(response, raw_token)
    return _auth_payload(user, raw_token)


@router.get("/me", response_model=AuthResponse)
def me(
    request: Request, response: Response, db: Session = Depends(get_db)
) -> AuthResponse:
    raw_token = request.cookies.get(settings.session_cookie_name)
    session = resolve_session(db, raw_token)
    if session is None or not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "not_authenticated", "message": "尚未登录"},
        )
    user = db.get(User, session.user_id)
    if user is None:
        revoke_session(db, session)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "not_authenticated", "message": "账号不存在"},
        )
    response.headers["Cache-Control"] = "no-store"
    return _auth_payload(user, raw_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> Response:
    raw_token = request.cookies.get(settings.session_cookie_name)
    session = resolve_session(db, raw_token)
    if session is not None and raw_token:
        if not verify_csrf(raw_token, x_csrf_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "csrf_failed",
                    "message": "安全校验失败，请刷新页面后重试",
                },
            )
        revoke_session(db, session)
    _clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.patch("/profile", response_model=AuthResponse)
def update_profile(
    payload: UpdateProfileRequest,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> AuthResponse:
    user = ctx.user
    user.nickname = payload.nickname
    db.commit()
    db.refresh(user)
    return _auth_payload(user, ctx.raw_token)


@router.post("/password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> MessageResponse:
    user = ctx.user
    if not verify_password(user.password_hash, payload.current_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_current_password", "message": "旧密码不正确"},
        )
    if hmac.compare_digest(payload.current_password, payload.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "password_unchanged",
                "message": "新密码不能与旧密码相同",
            },
        )

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    # 修改密码后撤销该用户的全部旧会话（含当前会话），要求重新登录
    revoke_user_sessions(db, user.id)
    _clear_session_cookie(response)
    return MessageResponse(
        message="密码已修改，旧登录状态已失效，请重新登录",
        relogin_required=True,
    )
