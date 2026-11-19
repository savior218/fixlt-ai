"""报修工单 API（模块②：报修工单闭环）。

- POST /api/repairs            创建工单（状态 pending，记录初始流转历史）
- GET  /api/repairs            当前用户工单列表（倒序）
- POST /api/repairs/{id}/status 工单状态流转（仅允许正向，不可回退）

客观上不存在可对接的真实第三方售后平台开放 API，本模块以
「报修工单闭环」作为诚实替代方案：状态流转接口用于演示/运维侧推进。
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.repair import TICKET_STATUSES, RepairTicket
from app.models.user import User
from app.schemas.repair import (
    TicketCreate,
    TicketOut,
    TicketStatusUpdate,
)

router = APIRouter(prefix="/api/repairs", tags=["repairs"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _history_of(ticket: RepairTicket) -> list[dict]:
    try:
        data = json.loads(ticket.status_history or "[]")
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _get_owned_ticket(ticket_id: int, db: Session, user: User) -> RepairTicket:
    ticket = db.get(RepairTicket, ticket_id)
    if ticket is None or ticket.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="工单不存在"
        )
    return ticket


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RepairTicket:
    ticket = RepairTicket(
        user_id=user.id,
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
        status="pending",
        status_history=json.dumps(
            [{"status": "pending", "at": _now_iso()}], ensure_ascii=False
        ),
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("", response_model=list[TicketOut])
def list_tickets(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RepairTicket]:
    stmt = (
        select(RepairTicket)
        .where(RepairTicket.user_id == user.id)
        .order_by(RepairTicket.id.desc())
    )
    return list(db.scalars(stmt))


@router.post("/{ticket_id}/status", response_model=TicketOut)
def update_ticket_status(
    ticket_id: int,
    payload: TicketStatusUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RepairTicket:
    ticket = _get_owned_ticket(ticket_id, db, user)

    current_idx = TICKET_STATUSES.index(ticket.status)
    next_idx = TICKET_STATUSES.index(payload.status)
    if next_idx <= current_idx:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"工单状态只能正向流转（当前：{ticket.status}）",
        )

    ticket.status = payload.status
    history = _history_of(ticket)
    history.append({"status": payload.status, "at": _now_iso()})
    ticket.status_history = json.dumps(history, ensure_ascii=False)
    db.commit()
    db.refresh(ticket)
    return ticket
