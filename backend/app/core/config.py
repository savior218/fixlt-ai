"""全局配置：仅通过环境变量注入，密钥不写入代码。"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "修必达 FixIt AI"
    app_version: str = "0.1.0"
    database_url: str = "sqlite:///./fixitai.db"
    # 前端构建产物目录（生产部署时由 FastAPI 统一托管；留空 = 本地开发模式，不托管）
    # 环境变量名：FIXITAI_FRONTEND_DIST_DIR
    frontend_dist_dir: str = ""
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
