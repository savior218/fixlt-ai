"""导入全部模型，确保建表与关系注册。"""
from app.models.user import User
from app.models.auth_session import AuthSession
from app.models.preference import UserPreference
from app.models.device import Device
from app.models.diagnosis import Diagnosis
from app.models.message import DiagnosisMessage
from app.models.repair import RepairRecord
from app.models.knowledge import KnowledgeDocument

__all__ = [
    "User",
    "AuthSession",
    "UserPreference",
    "Device",
    "Diagnosis",
    "DiagnosisMessage",
    "RepairRecord",
    "KnowledgeDocument",
]
