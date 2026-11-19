import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# 账号标识：3-32 位，字母 / 数字 / 下划线 / 连字符 / 中文
USERNAME_RE = re.compile(r"^[A-Za-z0-9_\-\u4e00-\u9fff]{3,32}$")


def _strip(value: str) -> str:
    return value.strip()


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    nickname: str | None = Field(default=None, max_length=32)

    @field_validator("username")
    @classmethod
    def _validate_username(cls, value: str) -> str:
        value = _strip(value)
        if not USERNAME_RE.fullmatch(value):
            raise ValueError("用户名需为 3-32 位字母、数字、下划线、连字符或中文")
        return value

    @field_validator("password")
    @classmethod
    def _validate_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("密码不能全部为空格")
        return value

    @field_validator("nickname")
    @classmethod
    def _validate_nickname(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = _strip(value)
        if not value:
            raise ValueError("昵称不能为空")
        if len(value) > 32:
            raise ValueError("昵称最多 32 个字符")
        return value


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def _validate_username(cls, value: str) -> str:
        return _strip(value)


class UpdateProfileRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=32)

    @field_validator("nickname")
    @classmethod
    def _validate_nickname(cls, value: str) -> str:
        value = _strip(value)
        if not value:
            raise ValueError("昵称不能为空")
        return value


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _validate_new_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("新密码不能全部为空格")
        return value


class UserOut(BaseModel):
    """对外只暴露账号标识与会话昵称，不展示未验证的邮箱 / 手机号。"""

    id: int
    username: str
    nickname: str
    created_at: datetime

    @classmethod
    def from_user(cls, user) -> "UserOut":
        return cls(
            id=user.id,
            username=user.username,
            nickname=user.nickname or user.username,
            created_at=user.created_at,
        )


class AuthResponse(BaseModel):
    user: UserOut
    csrf_token: str


class MessageResponse(BaseModel):
    message: str
    relogin_required: bool = False
