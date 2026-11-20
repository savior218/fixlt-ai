"""全局配置：仅通过环境变量注入，密钥不写入代码。"""
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "修必达 FixIt AI"
    app_version: str = "0.5.0-stage13"

    # 运行边界：dev = 本机/比赛演示；public = 对外公开服务
    # public 模式会关闭交互式 API 文档，并要求显式配置 CORS 与调用额度
    deployment_mode: Literal["dev", "public"] = "dev"
    expose_api_docs: bool = True

    # 同时兼容 Render 关联数据库时默认注入的 DATABASE_URL
    database_url: str = Field(
        default="sqlite:///./fixitai.db",
        validation_alias=AliasChoices("FIXITAI_DATABASE_URL", "DATABASE_URL"),
    )
    # 前端构建产物目录（生产部署时由 FastAPI 统一托管；留空 = 本地开发模式，不托管）
    # 环境变量名：FIXITAI_FRONTEND_DIST_DIR
    frontend_dist_dir: str = ""
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # 历史演示用户（仅作为旧种子数据的归属，不可登录；游客演示改用只读样例接口）
    demo_user_id: int = 1

    # 账号会话（HttpOnly Cookie + 服务端可撤销会话）
    session_cookie_name: str = "fixitai_session"
    session_ttl_seconds: int = 7 * 24 * 60 * 60
    # None = 自动：public 模式启用 Secure，本地 HTTP 开发不启用
    session_cookie_secure: bool | None = None
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    # 生产必须通过环境变量提供；dev 模式缺失时使用进程内随机值（重启后 CSRF 令牌失效）
    session_secret: str = ""

    # 认证接口限流（单实例内存；多实例部署需改用 Redis 等共享存储）
    auth_login_rate_limit_per_minute: int = 10
    auth_register_rate_limit_per_minute: int = 5
    # 游客（未登录）真实的模型调用额度更低
    guest_ai_rate_limit_per_minute: int = 2

    # AI 服务（智谱 GLM，OpenAI 兼容协议）
    ai_base_url: str = "https://open.bigmodel.cn/api/paas/v4"
    ai_text_model: str = "glm-4-air"
    # 视觉模型（模块③ AI 看图）：glm-4v-flash 免费、支持视觉；留空则回退文本模型
    ai_vision_model: str = "glm-4v"
    ai_api_key: str = ""
    ai_timeout_seconds: float = 60.0
    ai_max_output_tokens: int = 1500

    # 模型接口保护（单实例内存限流；多实例部署需改用 Redis 等共享存储）
    ai_rate_limit_per_minute: int = 8
    # 自由聊天每轮调用一次模型，额度单独计算，避免对话被 8 次/分钟误伤
    ai_chat_rate_limit_per_minute: int = 30
    guest_ai_chat_rate_limit_per_minute: int = 10
    ai_max_concurrent: int = 2
    ai_max_request_bytes: int = 16 * 1024
    # 动态问诊每轮调用模型，额度比单次诊断更宽；仍由后端限流
    interview_rate_limit_per_minute: int = 14

    model_config = SettingsConfigDict(
        env_prefix="FIXITAI_",
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        """兼容 Render / 云厂商常见的 postgres:// 连接串，统一使用 psycopg 驱动。"""
        # 从控制台复制时经常带上首尾空格、换行或引号，先清理再校验
        cleaned = value.strip().strip("\"'").strip()
        if any(ch in cleaned for ch in "\r\n\t"):
            raise ValueError(
                "FIXITAI_DATABASE_URL 中含换行或制表符，请重新粘贴为单行连接串"
            )
        if "://" not in cleaned:
            raise ValueError(
                "FIXITAI_DATABASE_URL 不是合法的连接串（缺少 '://'），"
                f"当前值长度 {len(cleaned)}。"
                "请在 Render 的 fixitai-db → Connections 中复制 Internal Database URL"
                "（以 postgres:// 开头），确认整串粘贴完整、无空格无引号。"
            )
        if cleaned.startswith("postgres://"):
            return "postgresql+psycopg://" + cleaned[len("postgres://") :]
        if cleaned.startswith("postgresql://"):
            return "postgresql+psycopg://" + cleaned[len("postgresql://") :]
        return cleaned

    @property
    def effective_cookie_secure(self) -> bool:
        if self.session_cookie_secure is not None:
            return self.session_cookie_secure
        return self.deployment_mode == "public"


settings = Settings()


def ensure_deployment_config() -> None:
    """公开服务启动前显式核实配置，禁止静默回退到不安全的本地默认值。

    - 数据库：public 模式必须使用托管 PostgreSQL，不能落回容器内 SQLite
    - Cookie：必须显式配置 FIXITAI_SESSION_COOKIE_SECURE=true，
      不能仅凭 deployment_mode=public 推断 Secure 已开启
    """
    if settings.deployment_mode != "public":
        return
    if settings.database_url.startswith("sqlite"):
        raise RuntimeError(
            "公开服务模式禁止使用 SQLite（数据会随重新部署丢失）："
            "请配置 FIXITAI_DATABASE_URL 指向托管 PostgreSQL"
        )
    if settings.session_cookie_secure is not True:
        raise RuntimeError(
            "公开服务模式必须显式配置 FIXITAI_SESSION_COOKIE_SECURE=true"
        )
