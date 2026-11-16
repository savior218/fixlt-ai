"""公共依赖。DEV-02（用户体系）接入前，用 X-User-Id 请求头标识用户。"""
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User


def get_current_user(
    x_user_id: int = Header(default=1, alias="X-User-Id"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在，请先登录或使用演示账号（X-User-Id: 1）",
        )
    return user
