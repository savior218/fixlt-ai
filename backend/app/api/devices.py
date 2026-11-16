"""设备管理 CRUD（PRD DEVICE-001）。用户体系接入前通过 X-User-Id 隔离数据。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.device import Device
from app.models.user import User
from app.schemas.device import DeviceCreate, DeviceOut, DeviceUpdate

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _get_owned_device(
    device_id: int, db: Session, user: User
) -> Device:
    device = db.get(Device, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="设备不存在"
        )
    return device


@router.get("", response_model=list[DeviceOut])
def list_devices(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Device]:
    stmt = select(Device).where(Device.user_id == user.id).order_by(Device.id)
    return list(db.scalars(stmt))


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def create_device(
    payload: DeviceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Device:
    device = Device(user_id=user.id, **payload.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.put("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: int,
    payload: DeviceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Device:
    device = _get_owned_device(device_id, db, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, field, value)
    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    device = _get_owned_device(device_id, db, user)
    db.delete(device)
    db.commit()
