"""全局配置：仅通过环境变量注入，密钥不写入代码。"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "智修AI FixItAI"
    app_version: str = "0.1.0"
    database_url: str = "sqlite:///./fixitai.db"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    # AI 服务（DEV-06 统一模型适配层：智谱 GLM，OpenAI 兼容协议）
    ai_base_url: str = "https://open.bigmodel.cn/api/paas/v4"
    ai_text_model: str = "glm-4-flash"
    ai_vision_model: str = ""
    ai_api_key: str = ""
    ai_timeout_seconds: float = 60.0

    model_config = SettingsConfigDict(
        env_prefix="FIXITAI_",
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
