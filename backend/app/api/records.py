"""云端诊断报告 / 维修记录（阶段十二）。

- 归属完全由服务端会话决定；不属于当前用户的记录一律 404
- 保存使用客户端记录 ID（client_ref）做幂等去重，重复提交返回同一条
- source=ai 必须携带服务端回执；本机导入标记 imported 且不标为已验证
"""
from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_user, require_csrf
from app.database.session import get_db
from app.models.device import Device
from app.models.diagnosis import Diagnosis
from app.models.repair import RepairRecord
from app.models.user import User
from app.safety.rules import compute_risk_floor, higher_risk
from app.schemas.records import (
    VERIFICATION_TO_DB,
    DB_TO_VERIFICATION,
    ContentPair,
    DiagnosisContent,
    DiagnosisImportRequest,
    DiagnosisOut,
    DiagnosisSave,
    QAItem,
    RepairImportRequest,
    RepairOut,
    RepairSave,
    RepairUpdate,
)
from app.services.receipts import input_digest, verify_diagnosis_receipt

router = APIRouter(prefix="/api", tags=["records"])


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code, detail={"code": code, "message": message}
    )


def _not_found(message: str = "记录不存在或不属于当前账号") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)


def _check_device(device_id: int | None, user: User, db: Session) -> None:
    if device_id is None:
        return
    device = db.get(Device, device_id)
    if device is None or device.user_id != user.id:
        raise _not_found("关联设备不存在或不属于当前账号")


def _scan_text(payload: DiagnosisSave) -> str:
    parts = [payload.symptom or "", payload.description]
    parts.extend(f"{item.question_text} {item.answer}" for item in payload.qa)
    return "\n".join(parts)


def _naive(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=None) if value.tzinfo else value


def _safe_qa(raw: object) -> list[QAItem]:
    if not isinstance(raw, list):
        return []
    items: list[QAItem] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        try:
            items.append(QAItem.model_validate(entry))
        except Exception:  # noqa: BLE001 旧数据字段不完整时跳过，不补造
            continue
    return items[:4]


def _safe_content(raw: object) -> ContentPair:
    fallback = DiagnosisContent()
    if not isinstance(raw, dict):
        return ContentPair(standard=fallback, elder=None)
    try:
        return ContentPair.model_validate(raw)
    except Exception:  # noqa: BLE001 旧数据缺字段时回退空内容，避免整条记录不可读
        return ContentPair(standard=fallback, elder=None)


def _payload(row: Diagnosis) -> dict:
    try:
        parsed = json.loads(row.diagnosis_result or "{}")
    except (TypeError, json.JSONDecodeError):
        parsed = {}
    return parsed if isinstance(parsed, dict) else {}


def _to_diagnosis_out(row: Diagnosis) -> DiagnosisOut:
    data = _payload(row)
    return DiagnosisOut(
        id=row.id,
        client_ref=row.client_ref or f"server-d-{row.id}",
        device_id=row.device_id,
        device_name=row.device_name,
        category=row.category,
        symptom=row.symptoms or "",
        description=str(data.get("description") or ""),
        source=row.decision_type or "unknown",
        ai_model=row.model_name,
        risk_level=row.risk_level or "low",
        risk_rules_version=row.risk_rules_version,
        qa=_safe_qa(data.get("qa")),
        content=_safe_content(data.get("content")),
        verified=bool(row.verified),
        imported=bool(row.imported),
        created_at=row.created_at or datetime.now(),
    )


@router.get("/diagnoses", response_model=list[DiagnosisOut])
def list_diagnoses(
    device_id: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DiagnosisOut]:
    stmt = select(Diagnosis).where(Diagnosis.user_id == user.id)
    if device_id is not None:
        stmt = stmt.where(Diagnosis.device_id == device_id)
    rows = list(db.scalars(stmt.order_by(Diagnosis.created_at.desc(), Diagnosis.id.desc())))
    return [_to_diagnosis_out(row) for row in rows]


@router.get("/diagnoses/{diagnosis_id}", response_model=DiagnosisOut)
def get_diagnosis(
    diagnosis_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DiagnosisOut:
    row = db.get(Diagnosis, diagnosis_id)
    if row is None or row.user_id != user.id:
        raise _not_found("诊断记录不存在或不属于当前账号")
    return _to_diagnosis_out(row)


def _save_diagnosis(
    payload: DiagnosisSave, user: User, db: Session, *, imported: bool
) -> DiagnosisOut:
    existing = db.scalar(
        select(Diagnosis).where(
            Diagnosis.user_id == user.id,
            Diagnosis.client_ref == payload.client_ref,
        )
    )
    if existing is not None:
        return _to_diagnosis_out(existing)

    _check_device(payload.device_id, user, db)
    server_risk = compute_risk_floor(_scan_text(payload), payload.symptom or None)[
        "level"
    ]
    ai_model: str | None = None
    rules_version = payload.risk_rules_version
    verified = False

    if payload.source == "ai":
        if imported:
            # 本机历史无法补发回执：保留原模型名，但不标记为服务端已验证
            ai_model = payload.ai_model
        else:
            receipt = verify_diagnosis_receipt(payload.receipt)
            if receipt is None or receipt.get("uid") != user.id:
                # 未携带有效回执：不按真实 AI 保存，避免客户端伪造来源
                raise _error(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "ai_source_unverified",
                    "AI 来源未经服务端验证，无法保存为真实 AI 结果",
                )
            expected = input_digest(
                category=payload.category,
                symptom=payload.symptom,
                description=payload.description,
                qa=[item.model_dump() for item in payload.qa],
            )
            if receipt.get("d") != expected:
                raise _error(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "ai_receipt_mismatch",
                    "报告内容与生成时不一致，请重新生成后再保存",
                )
            server_risk = higher_risk(str(receipt.get("risk", "low")), server_risk)
            ai_model = str(receipt.get("model") or "") or None
            rules_version = str(receipt.get("rules") or "") or rules_version
            # 回执只证明“这次 AI 调用确实发生”
            verified = True
    elif payload.source == "template":
        ai_model = None

    row = Diagnosis(
        user_id=user.id,
        device_id=payload.device_id,
        client_ref=payload.client_ref,
        symptoms=payload.symptom,
        diagnosis_result=json.dumps(
            {
                "description": payload.description,
                "qa": [item.model_dump() for item in payload.qa],
                "content": payload.content.model_dump(exclude_none=True),
            },
            ensure_ascii=False,
        ),
        risk_level=server_risk,
        decision_type=payload.source,
        category=payload.category,
        device_name=payload.device_name,
        model_name=ai_model,
        risk_rules_version=rules_version,
        verified=verified,
        imported=imported,
        status="completed",
        created_at=_naive(payload.created_at) or datetime.now(),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        # 并发重复提交：唯一索引冲突后返回已存在的那一条
        db.rollback()
        found = db.scalar(
            select(Diagnosis).where(
                Diagnosis.user_id == user.id,
                Diagnosis.client_ref == payload.client_ref,
            )
        )
        if found is None:
            raise
        return _to_diagnosis_out(found)
    db.refresh(row)
    return _to_diagnosis_out(row)


@router.post(
    "/diagnoses", response_model=DiagnosisOut, status_code=status.HTTP_201_CREATED
)
def save_diagnosis(
    payload: DiagnosisSave,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> DiagnosisOut:
    if payload.imported:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "use_import_endpoint",
            "本机历史请使用导入接口",
        )
    return _save_diagnosis(payload, ctx.user, db, imported=False)


@router.post("/diagnoses/import", response_model=list[DiagnosisOut])
def import_diagnoses(
    payload: DiagnosisImportRequest,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> list[DiagnosisOut]:
    return [
        _save_diagnosis(item, ctx.user, db, imported=True) for item in payload.items
    ]


# ---------- 维修记录 ----------


def _to_repair_out(row: RepairRecord, db: Session) -> RepairOut:
    diagnosis_ref = None
    diagnosis_source = None
    if row.diagnosis_id is not None:
        diag = db.get(Diagnosis, row.diagnosis_id)
        if diag is not None and diag.user_id == row.user_id:
            diagnosis_ref = diag.client_ref or f"server-d-{diag.id}"
            diagnosis_source = diag.decision_type
    try:
        images = json.loads(row.attachments or "[]")
    except (TypeError, json.JSONDecodeError):
        images = []
    if not isinstance(images, list):
        images = []
    try:
        cost = float(row.repair_cost) if row.repair_cost not in (None, "") else None
    except ValueError:
        cost = None
    return RepairOut(
        id=row.id,
        client_ref=row.client_ref or f"server-r-{row.id}",
        device_id=row.device_id,
        device_name=row.device_name or "未关联设备",
        diagnosis_ref=diagnosis_ref,
        diagnosis_source=diagnosis_source,
        fault_description=row.fault_description or "",
        repair_method=row.repair_description or "",
        repair_time=row.repair_date,
        technician=row.technician,
        cost=cost,
        status=row.status or "pending",
        images=[str(x) for x in images][:9],
        verification_status=DB_TO_VERIFICATION.get(
            row.verification_status, "unverified"
        ),
        imported=bool(row.imported),
        created_at=row.created_at or datetime.now(),
        updated_at=row.updated_at,
    )


@router.get("/repairs", response_model=list[RepairOut])
def list_repairs(
    device_id: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RepairOut]:
    stmt = select(RepairRecord).where(RepairRecord.user_id == user.id)
    if device_id is not None:
        stmt = stmt.where(RepairRecord.device_id == device_id)
    rows = list(
        db.scalars(stmt.order_by(RepairRecord.created_at.desc(), RepairRecord.id.desc()))
    )
    return [_to_repair_out(row, db) for row in rows]


@router.get("/repairs/{repair_id}", response_model=RepairOut)
def get_repair(
    repair_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RepairOut:
    row = db.get(RepairRecord, repair_id)
    if row is None or row.user_id != user.id:
        raise _not_found("维修记录不存在或不属于当前账号")
    return _to_repair_out(row, db)


def _save_repair(
    payload: RepairSave, user: User, db: Session, *, imported: bool
) -> RepairOut:
    existing = db.scalar(
        select(RepairRecord).where(
            RepairRecord.user_id == user.id,
            RepairRecord.client_ref == payload.client_ref,
        )
    )
    if existing is not None:
        return _to_repair_out(existing, db)

    _check_device(payload.device_id, user, db)

    diagnosis_id = None
    if payload.diagnosis_ref:
        diag = db.scalar(
            select(Diagnosis).where(
                Diagnosis.user_id == user.id,
                Diagnosis.client_ref == payload.diagnosis_ref,
            )
        )
        if diag is not None:
            diagnosis_id = diag.id

    row = RepairRecord(
        user_id=user.id,
        device_id=payload.device_id,
        diagnosis_id=diagnosis_id,
        client_ref=payload.client_ref,
        device_name=payload.device_name,
        fault_description=payload.fault_description,
        repair_description=payload.repair_method,
        technician=payload.technician,
        status=payload.status,
        repair_cost=None if payload.cost is None else str(payload.cost),
        repair_date=payload.repair_time,
        verification_status=VERIFICATION_TO_DB[payload.verification_status],
        attachments=json.dumps(payload.images, ensure_ascii=False),
        imported=imported,
        created_at=_naive(payload.created_at) or datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        found = db.scalar(
            select(RepairRecord).where(
                RepairRecord.user_id == user.id,
                RepairRecord.client_ref == payload.client_ref,
            )
        )
        if found is None:
            raise
        return _to_repair_out(found, db)
    db.refresh(row)
    return _to_repair_out(row, db)


@router.post("/repairs", response_model=RepairOut, status_code=status.HTTP_201_CREATED)
def save_repair(
    payload: RepairSave,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> RepairOut:
    if payload.imported:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "use_import_endpoint",
            "本机历史请使用导入接口",
        )
    return _save_repair(payload, ctx.user, db, imported=False)


@router.post("/repairs/import", response_model=list[RepairOut])
def import_repairs(
    payload: RepairImportRequest,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> list[RepairOut]:
    return [_save_repair(item, ctx.user, db, imported=True) for item in payload.items]


@router.patch("/repairs/{repair_id}", response_model=RepairOut)
def update_repair(
    repair_id: int,
    payload: RepairUpdate,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> RepairOut:
    row = db.get(RepairRecord, repair_id)
    if row is None or row.user_id != ctx.user.id:
        raise _not_found("维修记录不存在或不属于当前账号")

    if payload.verification_status is not None:
        row.verification_status = VERIFICATION_TO_DB[payload.verification_status]
        # 验证结果同步维修状态（与前端规则一致）
        if payload.status is None:
            if payload.verification_status == "recovered":
                row.status = "recovered"
            elif payload.verification_status == "partial":
                row.status = "partial"
            elif payload.verification_status == "notRecovered":
                row.status = "failed"
    if payload.status is not None:
        row.status = payload.status
    if payload.technician is not None:
        row.technician = payload.technician
    if payload.repair_method is not None:
        row.repair_description = payload.repair_method
    if payload.repair_time is not None:
        row.repair_date = payload.repair_time
    if payload.cost is not None:
        row.repair_cost = str(payload.cost)
    row.updated_at = datetime.now()

    db.commit()
    db.refresh(row)
    return _to_repair_out(row, db)
