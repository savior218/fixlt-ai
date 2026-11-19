from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DeviceCategory = Literal["ac", "fridge", "washer"]


class DeviceBase(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    category: DeviceCategory
    brand: str | None = Field(default=None, max_length=64)
    model: str | None = Field(default=None, max_length=64)
    purchase_date: date | None = None
    location: str | None = Field(default=None, max_length=64)
    image_url: str | None = Field(default=None, max_length=255)
    note: str | None = None


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    category: DeviceCategory | None = None
    brand: str | None = Field(default=None, max_length=64)
    model: str | None = Field(default=None, max_length=64)
    purchase_date: date | None = None
    location: str | None = Field(default=None, max_length=64)
    image_url: str | None = Field(default=None, max_length=255)
    note: str | None = None


class DeviceOut(DeviceBase):
    id: int
    created_at: datetime
    demo: bool = False

    model_config = ConfigDict(from_attributes=True)


class DemoDeviceOut(DeviceBase):
    """游客只读样例：不归属任何可登录账号，也没有写接口。"""

    id: int
    created_at: datetime
    demo: bool = True
