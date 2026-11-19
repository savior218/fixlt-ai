"""报修事项 API（个人报修跟踪，而非虚构的维修方接单）。

- POST   /api/repair-tickets                 保存报修事项（client_ref 幂等）
- GET    /api/repair-tickets                 分页列出当前用户事项
- GET    /api/repair-tickets/{id}            事项详情（含照片与关联维修结果）
- PATCH  /api/repair-tickets/{id}/progress   更新用户自报进度与联系信息
- POST   /api/repair-tickets/{id}/repair-record 关联/取消关联已有维修结果
- GET    /api/photos/{id}                    查看本人照片（见 diagnose 路由）

安全边界：归属完全由登录会话决定；不属于当前用户一律 404。
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_user, require_csrf
from app.database.session import get_db
from app.models.device import Device
from app.models.photo import DiagnosisPhoto, RepairTicketPhoto
from app.models.repair import PROGRESS_STATUSES, RepairRecord, RepairTicket
from app.models.user import User
from app.schemas.repair import (
    LinkRepairRecord,
    TicketCreate,
    TicketOut,
    TicketPage,
    TicketProgressUpdate,
)

router = APIRouter(prefix="/api/repair-tickets", tags=["repair-tickets"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _load_json_list(raw: str | None) -> list[dict]:
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _display_name(user: User) -> str:
    return user.nickname or user.username


def _photo_ids(db: Session, ticket_id: int) -> list[int]:
    return list(
        db.scalars(
            select(RepairTicketPhoto.photo_id).where(
                RepairTicketPhoto.ticket_id == ticket_id
            )
        )
    )


def to_ticket_out(ticket: RepairTicket, db: Session) -> TicketOut:
    """把 ORM 转成响应模型；照片只返回 ID，不返回 base64。"""
    payload = TicketOut.model_validate(ticket)
    return payload.model_copy(update={"photo_ids": _photo_ids(db, ticket.id)})


def _get_owned(ticket_id: int, db: Session, user: User) -> RepairTicket:
    ticket = db.get(RepairTicket, ticket_id)
    if ticket is None or ticket.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="报修事项不存在")
    return ticket


def _check_device(device_id: int | None, user: User, db: Session) -> None:
    if device_id is None:
        return
    device = db.get(Device, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="关联设备不存在或不属于当前账号"
        )


def _attach_photos(
    ticket: RepairTicket, photo_ids: list[int], user: User, db: Session
) -> None:
    for photo_id in dict.fromkeys(photo_ids):
        photo = db.get(DiagnosisPhoto, photo_id)
        if photo is None or photo.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="照片不存在或不属于当前账号"
            )
        linked = db.scalar(
            select(RepairTicketPhoto).where(RepairTicketPhoto.photo_id == photo_id)
        )
        if linked is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该照片已关联到其他报修事项",
            )
        db.add(
            RepairTicketPhoto(
                user_id=user.id, ticket_id=ticket.id, photo_id=photo_id
            )
        )


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> TicketOut:
    user = ctx.user
    # 幂等：超时重试使用同一个 client_ref，返回已保存的事项而不是再建一条
    if payload.client_ref:
        existing = db.scalar(
            select(RepairTicket).where(
                RepairTicket.user_id == user.id,
                RepairTicket.client_ref == payload.client_ref,
            )
        )
        if existing is not None:
            return to_ticket_out(existing, db)

    _check_device(payload.device_id, user, db)
    now = _now_iso()
    ticket = RepairTicket(
        user_id=user.id,
        client_ref=payload.client_ref,
        device_id=payload.device_id,
        diagnosis_ref=payload.diagnosis_ref,
        category=payload.category,
        brand=payload.brand,
        model=payload.model,
        symptom=payload.symptom,
        description=payload.description,
        found_at=payload.found_at,
        checks=json.dumps(payload.checks, ensure_ascii=False),
        content=payload.content,
        # 旧状态字段保留默认值，不作为对外事实展示
        status="pending",
        status_history="[]",
        progress_status="pending_contact",
        progress_history=json.dumps(
            [
                {
                    "status": "pending_contact",
                    "at": now,
                    "by": _display_name(user),
                    "source": "self_reported",
                }
            ],
            ensure_ascii=False,
        ),
        progress_updated_by=_display_name(user),
    )
    db.add(ticket)
    try:
        db.flush()
        _attach_photos(ticket, payload.photo_ids, user, db)
        db.commit()
    except IntegrityError:
        # 并发重试：以唯一索引兜底，返回已存在的那条
        db.rollback()
        if payload.client_ref:
            existing = db.scalar(
                select(RepairTicket).where(
                    RepairTicket.user_id == user.id,
                    RepairTicket.client_ref == payload.client_ref,
                )
            )
            if existing is not None:
                return to_ticket_out(existing, db)
        raise
    db.refresh(ticket)
    return to_ticket_out(ticket, db)


@router.get("", response_model=TicketPage)
def list_tickets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TicketPage:
    total = db.scalar(
        select(func.count()).select_from(RepairTicket).where(
            RepairTicket.user_id == user.id
        )
    ) or 0
    rows = list(
        db.scalars(
            select(RepairTicket)
            .where(RepairTicket.user_id == user.id)
            .order_by(RepairTicket.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return TicketPage(
        items=[to_ticket_out(row, db) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TicketOut:
    return to_ticket_out(_get_owned(ticket_id, db, user), db)


@router.patch("/{ticket_id}/progress", response_model=TicketOut)
def update_progress(
    ticket_id: int,
    payload: TicketProgressUpdate,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> TicketOut:
    user = ctx.user
    ticket = _get_owned(ticket_id, db, user)
    if payload.progress_status not in PROGRESS_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="进度状态不受支持",
        )

    ticket.progress_status = payload.progress_status
    ticket.contact_target = payload.contact_target
    ticket.contacted_at = payload.contacted_at
    ticket.appointment_at = payload.appointment_at
    ticket.contact_note = payload.contact_note
    ticket.progress_updated_by = _display_name(user)
    history = _load_json_list(ticket.progress_history)
    history.append(
        {
            "status": payload.progress_status,
            "at": _now_iso(),
            "by": _display_name(user),
            "source": "self_reported",
        }
    )
    ticket.progress_history = json.dumps(history, ensure_ascii=False)
    db.commit()
    db.refresh(ticket)
    return to_ticket_out(ticket, db)


@router.post("/{ticket_id}/repair-record", response_model=TicketOut)
def link_repair_record(
    ticket_id: int,
    payload: LinkRepairRecord,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> TicketOut:
    user = ctx.user
    ticket = _get_owned(ticket_id, db, user)
    if payload.repair_record_id is None:
        ticket.repair_record_id = None
        db.commit()
        db.refresh(ticket)
        return to_ticket_out(ticket, db)

    record = db.get(RepairRecord, payload.repair_record_id)
    if record is None or record.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="维修记录不存在或不属于当前账号",
        )
    other = db.scalar(
        select(RepairTicket).where(
            RepairTicket.user_id == user.id,
            RepairTicket.repair_record_id == record.id,
            RepairTicket.id != ticket.id,
        )
    )
    if other is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该维修记录已关联到其他报修事项",
        )
    ticket.repair_record_id = record.id
    db.commit()
    db.refresh(ticket)
    return to_ticket_out(ticket, db)
