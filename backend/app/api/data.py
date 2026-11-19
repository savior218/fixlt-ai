"""个人数据管理：汇总、分页列表、结构化导出、按归属删除。

- 所有数据只来自当前登录账号，客户端不能指定 user_id
- 导出不包含密码哈希、会话、CSRF 密钥等内部字段
- 删除逐项校验归属；设备/报告删除只解除关联，不静默级联删除历史
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_user, require_csrf
from app.api.records import _to_diagnosis_out, _to_repair_out
from app.api.repairs import to_ticket_out
from app.database.session import get_db
from app.models.device import Device
from app.models.diagnosis import Diagnosis
from app.models.photo import DiagnosisPhoto, RepairTicketPhoto
from app.models.repair import PROGRESS_STATUS_LABELS, RepairRecord, RepairTicket
from app.models.user import User

router = APIRouter(prefix="/api/data", tags=["data"])

DataItemType = Literal["device", "diagnosis", "repair", "ticket", "photo"]


class DataItem(BaseModel):
    type: DataItemType
    id: int
    title: str
    subtitle: str | None = None
    created_at: str | None = None
    meta: dict = Field(default_factory=dict)


class DataPage(BaseModel):
    items: list[DataItem]
    total: int
    page: int
    page_size: int


class DataSummary(BaseModel):
    devices: int
    diagnoses: int
    repairs: int
    tickets: int
    photos: int


class DeleteItem(BaseModel):
    type: DataItemType
    id: int


class DeleteRequest(BaseModel):
    items: list[DeleteItem] = Field(min_length=1, max_length=100)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat(timespec="seconds") if value else None


def _photo_ticket_map(db: Session, user: User) -> dict[int, int]:
    return {
        photo_id: ticket_id
        for photo_id, ticket_id in db.execute(
            select(RepairTicketPhoto.photo_id, RepairTicketPhoto.ticket_id).where(
                RepairTicketPhoto.user_id == user.id
            )
        )
    }


def _summary(db: Session, user: User) -> DataSummary:
    def count(model) -> int:
        return int(
            db.scalar(
                select(func.count()).select_from(model).where(model.user_id == user.id)
            )
            or 0
        )

    return DataSummary(
        devices=count(Device),
        diagnoses=count(Diagnosis),
        repairs=count(RepairRecord),
        tickets=count(RepairTicket),
        photos=count(DiagnosisPhoto),
    )


@router.get("/summary", response_model=DataSummary)
def summary(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DataSummary:
    return _summary(db, user)


@router.get("/items", response_model=DataPage)
def list_items(
    type: DataItemType = Query(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DataPage:
    order_desc = None
    model = None
    if type == "device":
        model = Device
        order_desc = Device.created_at.desc()
    elif type == "diagnosis":
        model = Diagnosis
        order_desc = Diagnosis.created_at.desc()
    elif type == "repair":
        model = RepairRecord
        order_desc = RepairRecord.created_at.desc()
    elif type == "ticket":
        model = RepairTicket
        order_desc = RepairTicket.created_at.desc()
    else:
        model = DiagnosisPhoto
        order_desc = DiagnosisPhoto.created_at.desc()

    total = int(
        db.scalar(
            select(func.count()).select_from(model).where(model.user_id == user.id)
        )
        or 0
    )
    rows = list(
        db.scalars(
            select(model)
            .where(model.user_id == user.id)
            .order_by(order_desc)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )

    items: list[DataItem] = []
    ticket_map = _photo_ticket_map(db, user) if type == "photo" else {}
    for row in rows:
        if type == "device":
            items.append(
                DataItem(
                    type=type,
                    id=row.id,
                    title=row.name,
                    subtitle=f"{row.brand or ''} {row.model or ''}".strip() or row.category,
                    created_at=_iso(row.created_at),
                )
            )
        elif type == "diagnosis":
            items.append(
                DataItem(
                    type=type,
                    id=row.id,
                    title=row.symptoms or "诊断报告",
                    subtitle=row.device_name,
                    created_at=_iso(row.created_at),
                    meta={"client_ref": row.client_ref, "source": row.decision_type},
                )
            )
        elif type == "repair":
            items.append(
                DataItem(
                    type=type,
                    id=row.id,
                    title=row.fault_description or "维修记录",
                    subtitle=row.technician or row.device_name,
                    created_at=_iso(row.created_at),
                    meta={"verification_status": row.verification_status},
                )
            )
        elif type == "ticket":
            items.append(
                DataItem(
                    type=type,
                    id=row.id,
                    title=row.symptom,
                    subtitle=PROGRESS_STATUS_LABELS.get(
                        row.progress_status or "", "旧状态（未经本轮确认）"
                    ),
                    created_at=_iso(row.created_at),
                    meta={
                        "progress_status": row.progress_status,
                        "legacy_status": row.progress_status is None,
                    },
                )
            )
        else:
            items.append(
                DataItem(
                    type=type,
                    id=row.id,
                    title=f"照片 #{row.id}",
                    subtitle=row.mime,
                    created_at=_iso(row.created_at),
                    meta={"ticket_id": ticket_map.get(row.id)},
                )
            )

    return DataPage(items=items, total=total, page=page, page_size=page_size)


def _export_data(db: Session, user: User) -> dict:
    ticket_map = _photo_ticket_map(db, user)
    return {
        "exported_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "account": {
            "id": user.id,
            "username": user.username,
            "nickname": user.nickname,
            "created_at": _iso(user.created_at),
        },
        "devices": [
            {
                "id": d.id,
                "name": d.name,
                "category": d.category,
                "brand": d.brand,
                "model": d.model,
                "purchase_date": d.purchase_date.isoformat() if d.purchase_date else None,
                "created_at": _iso(d.created_at),
            }
            for d in db.scalars(select(Device).where(Device.user_id == user.id))
        ],
        "diagnoses": [
            _to_diagnosis_out(row).model_dump(mode="json")
            for row in db.scalars(
                select(Diagnosis)
                .where(Diagnosis.user_id == user.id)
                .order_by(Diagnosis.id)
            )
        ],
        "repairs": [
            _to_repair_out(row, db).model_dump(mode="json")
            for row in db.scalars(
                select(RepairRecord)
                .where(RepairRecord.user_id == user.id)
                .order_by(RepairRecord.id)
            )
        ],
        "tickets": [
            to_ticket_out(row, db).model_dump(mode="json")
            for row in db.scalars(
                select(RepairTicket)
                .where(RepairTicket.user_id == user.id)
                .order_by(RepairTicket.id)
            )
        ],
        "photos": [
            {
                "id": p.id,
                "mime": p.mime,
                "created_at": _iso(p.created_at),
                "ticket_id": ticket_map.get(p.id),
                "note": "导出仅含照片元数据，不含图片二进制",
            }
            for p in db.scalars(
                select(DiagnosisPhoto).where(DiagnosisPhoto.user_id == user.id)
            )
        ],
    }


@router.get("/export")
def export_data(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    data = _export_data(db, user)
    filename = f"fixitai-{user.username}-data.json"
    return JSONResponse(
        content=json.loads(json.dumps(data, ensure_ascii=False)),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _owned_or_404(db: Session, user: User, item: DeleteItem):
    if item.type == "device":
        row = db.get(Device, item.id)
    elif item.type == "diagnosis":
        row = db.get(Diagnosis, item.id)
    elif item.type == "repair":
        row = db.get(RepairRecord, item.id)
    elif item.type == "ticket":
        row = db.get(RepairTicket, item.id)
    else:
        row = db.get(DiagnosisPhoto, item.id)
    if row is None or row.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{item.type} #{item.id} 不存在或不属于当前账号",
        )
    return row


@router.delete("/items")
def delete_items(
    payload: DeleteRequest,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> dict:
    user = ctx.user
    # 先全部校验归属，任一越权则整体拒绝，避免部分删除
    rows = [_owned_or_404(db, user, item) for item in payload.items]

    deleted = 0
    for item, row in zip(payload.items, rows):
        if item.type == "device":
            # 解除关联，不删除依赖该设备的报告/维修/报修历史
            db.execute(
                update(Diagnosis)
                .where(Diagnosis.user_id == user.id, Diagnosis.device_id == item.id)
                .values(device_id=None)
            )
            db.execute(
                update(RepairRecord)
                .where(RepairRecord.user_id == user.id, RepairRecord.device_id == item.id)
                .values(device_id=None)
            )
            db.execute(
                update(RepairTicket)
                .where(RepairTicket.user_id == user.id, RepairTicket.device_id == item.id)
                .values(device_id=None)
            )
            db.delete(row)
        elif item.type == "diagnosis":
            db.execute(
                update(RepairRecord)
                .where(
                    RepairRecord.user_id == user.id,
                    RepairRecord.diagnosis_id == item.id,
                )
                .values(diagnosis_id=None)
            )
            db.delete(row)
        elif item.type == "repair":
            db.execute(
                update(RepairTicket)
                .where(
                    RepairTicket.user_id == user.id,
                    RepairTicket.repair_record_id == item.id,
                )
                .values(repair_record_id=None)
            )
            db.delete(row)
        elif item.type == "ticket":
            db.execute(
                RepairTicketPhoto.__table__.delete().where(
                    RepairTicketPhoto.ticket_id == item.id,
                    RepairTicketPhoto.user_id == user.id,
                )
            )
            db.delete(row)
        else:
            # 照片：删除关联后删除本体，不只是从页面隐藏
            db.execute(
                RepairTicketPhoto.__table__.delete().where(
                    RepairTicketPhoto.photo_id == item.id,
                    RepairTicketPhoto.user_id == user.id,
                )
            )
            db.delete(row)
        deleted += 1

    db.commit()
    return {"deleted": deleted, "summary": _summary(db, user)}
