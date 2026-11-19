"""设备管理 CRUD（PRD DEVICE-001）。归属由服务端会话决定，不接受客户端指定用户。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_user, require_csrf
from app.database.session import get_db
from app.models.device import Device
from app.models.user import User
from app.schemas.device import DeviceCreate, DeviceOut, DeviceUpdate

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _get_owned_device(device_id: int, db: Session, user: User) -> Device:
    """列表、详情、修改、删除共用同一归属检查；不属于当前用户一律 404。"""
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


@router.get("/{device_id}", response_model=DeviceOut)
def get_device(
    device_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Device:
    return _get_owned_device(device_id, db, user)


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def create_device(
    payload: DeviceCreate,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> Device:
    device = Device(user_id=ctx.user.id, **payload.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.put("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: int,
    payload: DeviceUpdate,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> Device:
    device = _get_owned_device(device_id, db, ctx.user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, field, value)
    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: int,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> None:
    device = _get_owned_device(device_id, db, ctx.user)
    db.delete(device)
    db.commit()
