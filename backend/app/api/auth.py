"""账号认证：登录 / 注册（会话沿用 X-User-Id 标识，前端登录后携带）。

- POST /api/auth/login    用户名 + 密码 → 用户信息（失败 401）
- POST /api/auth/register 用户名 + 密码 → 创建账号并返回（用户名重复 409）
- GET  /api/auth/me       当前登录用户（X-User-Id）
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.database.session import get_db
from app.models.preference import UserPreference
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=64)


def _user_out(user: User) -> dict:
    return {"id": user.id, "username": user.username, "email": user.email}


@router.post("/login")
def login(payload: AuthIn, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.username == payload.username.strip()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    return _user_out(user)


@router.post("/register", status_code=201)
def register(payload: AuthIn, db: Session = Depends(get_db)) -> dict:
    username = payload.username.strip()
    if db.scalar(select(User).where(User.username == username)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="用户名已存在，请换一个再试",
        )
    user = User(username=username, password_hash=hash_password(payload.password))
    user.preferences = UserPreference()
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return _user_out(user)
