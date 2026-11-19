"""密码哈希工具（登录/注册）。开发期使用加盐 SHA-256，生产可平滑升级 bcrypt。"""

import hashlib

_SALT = "fixitai::v1::"


def hash_password(password: str) -> str:
    return hashlib.sha256((_SALT + password).encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    return hash_password(password) == password_hash
