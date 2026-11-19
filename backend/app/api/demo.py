"""游客只读演示数据。固定样例独立于数据库，不提供任何写入接口。"""
from datetime import datetime

from fastapi import APIRouter

from app.database.seed import DEMO_DEVICES
from app.schemas.device import DemoDeviceOut

router = APIRouter(prefix="/api/demo", tags=["demo"])

_DEMO_CREATED_AT = datetime(2024, 1, 1, 0, 0, 0)


@router.get("/devices", response_model=list[DemoDeviceOut])
def demo_devices() -> list[DemoDeviceOut]:
    return [
        DemoDeviceOut(
            id=index + 1,
            created_at=_DEMO_CREATED_AT,
            demo=True,
            **item,
        )
        for index, item in enumerate(DEMO_DEVICES)
    ]
