"""全局配置：仅通过环境变量注入，密钥不写入代码。"""
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "修必达 FixIt AI"
    app_version: str = "0.2.0-stage10"

    # 运行边界：dev = 本机/比赛演示；public = 对外公开服务
    # public 模式会关闭交互式 API 文档，并要求显式配置 CORS 与调用额度
    deployment_mode: Literal["dev", "public"] = "dev"
    expose_api_docs: bool = True

    database_url: str = "sqlite:///./fixitai.db"
    # 前端构建产物目录（生产部署时由 FastAPI 统一托管；留空 = 本地开发模式，不托管）
    # 环境变量名：FIXITAI_FRONTEND_DIST_DIR
    frontend_dist_dir: str = ""
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # 演示用户（仅用于设备 CRUD 演示；不是正式身份认证）
    demo_user_id: int = 1

    # AI 服务（智谱 GLM，OpenAI 兼容协议）
    ai_base_url: str = "https://open.bigmodel.cn/api/paas/v4"
    ai_text_model: str = "glm-4-flash"
    ai_vision_model: str = ""
    ai_api_key: str = ""
    ai_timeout_seconds: float = 60.0
    ai_max_output_tokens: int = 1500

    # 模型接口保护（单实例内存限流；多实例部署需改用 Redis 等共享存储）
    ai_rate_limit_per_minute: int = 8
    ai_max_concurrent: int = 2
    ai_max_request_bytes: int = 16 * 1024

    model_config = SettingsConfigDict(
        env_prefix="FIXITAI_",
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
