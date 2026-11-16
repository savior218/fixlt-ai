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
    # AI 服务占位（DEV-06 统一模型适配层接入）
    ai_text_model: str = ""
    ai_vision_model: str = ""
    ai_api_key: str = ""

    model_config = SettingsConfigDict(
        env_prefix="FIXITAI_",
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
