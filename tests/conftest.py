"""测试环境：使用独立 SQLite 文件，避免污染开发数据库。"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("FIXITAI_DATABASE_URL", "sqlite:///./test_fixitai.db")
