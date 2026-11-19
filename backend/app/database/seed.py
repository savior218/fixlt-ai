"""首次启动写入演示数据：demo 用户（id=1）与三台示例设备。"""
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.device import Device
from app.models.preference import UserPreference
from app.models.user import User

DEMO_DEVICES = [
    {
        "name": "客厅空调",
        "category": "ac",
        "brand": "格力",
        "model": "KFR-35GW",
        "purchase_date": date(2021, 6, 15),
        "location": "客厅",
        "note": None,
    },
    {
        "name": "双门冰箱",
        "category": "fridge",
        "brand": "海尔",
        "model": "BCD-215",
        "purchase_date": date(2019, 3, 20),
        "location": "厨房",
        "note": None,
    },
    {
        "name": "滚筒洗衣机",
        "category": "washer",
        "brand": "小天鹅",
        "model": "XQG80",
        "purchase_date": date(2022, 9, 1),
        "location": "阳台",
        "note": "房东购置",
    },
]


def seed_demo_data(db: Session) -> None:
    demo = db.scalar(select(User).where(User.username == "demo"))
    if demo is None and db.scalar(select(func.count()).select_from(User)) == 0:
        user = User(
            username="demo",
            password_hash=hash_password("123456"),
            email="demo@fixitai.local",
        )
        user.preferences = UserPreference()
        db.add(user)
        db.flush()
        for item in DEMO_DEVICES:
            db.add(Device(user_id=user.id, **item))
        db.commit()
    elif demo is not None and not demo.password_hash:
        # 旧库升级：早期 demo 账号无密码，补上默认密码 123456
        demo.password_hash = hash_password("123456")
        db.commit()
