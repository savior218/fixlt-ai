"""动态追问会话 API（首版：空调不制冷/制冷效果变差）。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_user, require_csrf
from app.database.session import get_db
from app.interview import logic
from app.models.interview import InterviewSession
from app.models.photo import DiagnosisPhoto
from app.models.user import User
from app.safety.rules import (
    SAFETY_RULES_VERSION,
    build_interception,
    detect_risk,
)
from app.schemas.interview import (
    InterviewAnswer,
    InterviewFinish,
    InterviewSessionOut,
    InterviewStart,
)

router = APIRouter(prefix="/api/interview", tags=["interview"])

SYMPTOM_ALIASES = {
    "not_cooling",
    "weak_cooling",
    "不制冷",
    "制冷效果变差",
    "制冷差",
}


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _load(raw: str | None, default):
    try:
        data = json.loads(raw or "")
        return data if isinstance(data, type(default)) else default
    except json.JSONDecodeError:
        return default


def _state(session: InterviewSession) -> InterviewSessionOut:
    asked = _load(session.asked, [])
    facts = _load(session.facts, [])
    unknown = _load(session.unknown, [])
    conflicts = _load(session.conflicts, [])
    # 尚未确认的信息明确列出，不写成“正常”
    missing = []
    labels = {
        "airflow": "尚未确认出风口风量",
        "filter": "尚未确认过滤网状态",
        "mode": "尚未确认运行模式与温度设置",
        "outdoor": "尚未确认室外机是否运转",
        "power": "尚未确认通电/开机状态",
    }
    known_keys = {f.get("key") for f in facts}
    for key, label in labels.items():
        if key not in known_keys:
            missing.append(label)
    return InterviewSessionOut(
        session_id=session.id,
        status=session.status,
        version=session.version,
        round=session.round,
        max_rounds=session.max_rounds,
        current_question=logic.question_public(session.current_question_id)
        if session.status == "active"
        else None,
        qa=asked,
        facts=facts,
        unknown_information=list(dict.fromkeys(unknown + missing)),
        conflicts=conflicts,
        end_reason=session.end_reason,
        selection_source=session.selection_source,
        selection_note=(
            "该问题由确定性规则选择，不是模型生成"
            if session.selection_source == "rule"
            else "模型不可用，已按规则继续，不是模型生成的问题"
            if session.selection_source == "rule_fallback"
            else None
        ),
        selection_latency_ms=session.selection_latency_ms,
        kb_version=session.kb_version,
        safety_rules_version=session.safety_rules_version,
        can_finish=session.round > 0,
    )


def _risk_text(session: InterviewSession, extra: str = "") -> str:
    asked = _load(session.asked, [])
    return "\n".join(
        [session.initial_description]
        + [str(a.get("answer") or "") for a in asked]
        + [extra]
    )


def _check_risk(session: InterviewSession | None, text: str, db: Session | None = None):
    detected = detect_risk(text)
    if detected["level"] != "high":
        return
    if session is not None:
        session.status = "intercepted"
        session.end_reason = "safety_interception"
        session.current_question_id = None
        session.version += 1
        if db is not None:
            db.commit()
    risk = build_interception(detected["matched"])
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "high_risk_blocked",
            "message": "检测到高风险情况，已停止普通追问，请先按安全提示处理。",
            "safety_rules_version": SAFETY_RULES_VERSION,
            "risk": risk,
            "session_id": session.id if session else None,
        },
    )


def _owned(session_id: str, user: User, db: Session) -> InterviewSession:
    row = db.get(InterviewSession, session_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="问诊会话不存在")
    return row


def _ask_question(
    session: InterviewSession,
    facts: list[dict],
    asked: list[dict],
    conflicts: list[dict],
    requested_id: str | None = None,
    requested_source: str | None = None,
    requested_latency: int | None = None,
    requested_note: str | None = None,
) -> None:
    """设置下一题；requested_id 由调用方传入模型结果，否则走规则/模型选择。"""
    if requested_id is not None:
        session.current_question_id = requested_id
        session.selection_source = requested_source
        session.selection_latency_ms = requested_latency
        return


async def _select_and_set(session: InterviewSession) -> None:
    facts = _load(session.facts, [])
    asked = _load(session.asked, [])
    conflicts = _load(session.conflicts, [])
    if logic.enough_information(facts, asked) and not conflicts:
        session.status = "completed"
        session.end_reason = "enough_info"
        session.current_question_id = None
        session.selection_source = None
        return
    if logic.filter_actionable(facts) and not conflicts:
        session.status = "completed"
        session.end_reason = "filter_actionable"
        session.current_question_id = None
        return
    qid, source, latency, note = await logic.choose_question(facts, asked, conflicts)
    session.current_question_id = qid
    session.selection_source = source
    session.selection_latency_ms = latency
    if qid is None:
        session.status = "completed"
        session.end_reason = session.end_reason or "enough_info"
    elif logic.enough_information(facts, asked) and source is None:
        session.status = "completed"
        session.end_reason = "enough_info"
        session.current_question_id = None


@router.post("", response_model=InterviewSessionOut, status_code=status.HTTP_201_CREATED)
async def start_interview(
    payload: InterviewStart,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> InterviewSessionOut:
    user = ctx.user
    if payload.symptom not in SYMPTOM_ALIASES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "dynamic_not_supported",
                "message": "动态追问首版仅支持空调不制冷/制冷效果变差",
                "field": "symptom",
            },
        )

    if payload.photo_id is not None:
        photo = db.get(DiagnosisPhoto, payload.photo_id)
        if photo is None or photo.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="照片不存在或不属于当前账号"
            )

    facts = logic.extract_facts(payload.description, source="initial_description")
    conflicts = []
    if {"filter_cleaned", "filter_dirty"} <= {f.get("value") for f in facts}:
        conflicts = [
            {
                "key": "filter",
                "values": ["filter_cleaned", "filter_dirty"],
                "evidence": [f.get("evidence") for f in facts],
            }
        ]

    # 初始输入先做风险检查，高风险不创建模型会话
    fake = InterviewSession(
        initial_description=payload.description,
        asked="[]",
        status="active",
        version=0,
    )
    _check_risk(fake, payload.description)

    session = InterviewSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        category="ac",
        symptom=payload.symptom,
        initial_description=payload.description,
        photo_id=payload.photo_id,
        facts=json.dumps(facts, ensure_ascii=False),
        unknown="[]",
        conflicts=json.dumps(conflicts, ensure_ascii=False),
        asked="[]",
        current_question_id=None,
        round=0,
        max_rounds=logic.MAX_ROUNDS,
        status="active",
        version=0,
        kb_version=logic.KB_VERSION,
        safety_rules_version=SAFETY_RULES_VERSION,
    )
    if conflicts:
        session.current_question_id = "ac_clarify_filter"
        session.selection_source = "rule"
    elif logic.enough_information(facts, []):
        session.status = "completed"
        session.end_reason = "enough_info"
    else:
        await _select_and_set(session)
    db.add(session)
    db.commit()
    db.refresh(session)
    return _state(session)


@router.get("/{session_id}", response_model=InterviewSessionOut)
def get_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InterviewSessionOut:
    return _state(_owned(session_id, user, db))


@router.post("/{session_id}/answer", response_model=InterviewSessionOut)
async def answer_question(
    session_id: str,
    payload: InterviewAnswer,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> InterviewSessionOut:
    session = _owned(session_id, ctx.user, db)
    if session.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="会话已结束，不能继续回答"
        )
    # 同一请求重复提交：只处理一次，直接返回当前状态
    if payload.request_id and payload.request_id == session.last_request_id:
        return _state(session)
    if payload.session_version != session.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "stale_session",
                "message": "这道题已过期，请刷新后继续",
            },
        )
    current = session.current_question_id
    if not current or payload.question_id != current:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "stale_question",
                "message": "这不是当前问题，请刷新后按新问题回答",
            },
        )
    asked = _load(session.asked, [])
    if current in logic.answered_ids(asked):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "question_already_answered", "message": "这道题已经回答过"},
        )
    question = logic.QUESTIONS[current]
    option_ids = {o["id"] for o in question["options"]}
    if payload.option_id and payload.option_id not in option_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_option", "message": "选项不属于当前问题"},
        )
    if not payload.answer.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "empty_answer", "message": "回答不能为空"},
        )

    _check_risk(session, _risk_text(session, payload.answer), db)

    facts = _load(session.facts, [])
    conflicts = _load(session.conflicts, [])
    unknown = _load(session.unknown, [])
    new_facts = logic.apply_answer_facts(question, payload.option_id or "", payload.answer)
    unknown_flag = any(f.get("value") == "unknown" for f in new_facts)
    facts, new_conflicts = logic.merge_facts(facts, new_facts)
    conflicts.extend(new_conflicts)
    if current == "ac_clarify_filter":
        # 已通过澄清题解决过滤网矛盾；保留原始回答，但不再循环追问
        conflicts = [c for c in conflicts if c.get("key") != "filter"]
    if unknown_flag:
        unknown.append(question["text"])

    record = {
        "question_id": current,
        "question_text": question["text"],
        "answer": payload.answer.strip(),
        "option_id": payload.option_id,
        "unknown": unknown_flag,
        "input_source": payload.input_source,
        "selection_source": session.selection_source,
        "asked_at": _now(),
    }
    asked.append(record)
    session.facts = json.dumps(facts, ensure_ascii=False)
    session.conflicts = json.dumps(conflicts, ensure_ascii=False)
    session.unknown = json.dumps(unknown, ensure_ascii=False)
    session.asked = json.dumps(asked, ensure_ascii=False)
    session.round = len(asked)
    session.version += 1
    session.last_request_id = payload.request_id

    if new_conflicts:
        session.current_question_id = "ac_clarify_filter"
        session.selection_source = "rule"
    elif session.round >= session.max_rounds:
        session.status = "completed"
        session.end_reason = "max_rounds"
        session.current_question_id = None
    elif logic.enough_information(facts, asked):
        session.status = "completed"
        session.end_reason = "enough_info"
        session.current_question_id = None
    else:
        await _select_and_set(session)

    db.commit()
    db.refresh(session)
    return _state(session)


@router.post("/{session_id}/finish", response_model=InterviewSessionOut)
def finish_interview(
    session_id: str,
    payload: InterviewFinish,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> InterviewSessionOut:
    session = _owned(session_id, ctx.user, db)
    if payload.session_version != session.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "stale_session", "message": "会话已变化，请刷新后重试"},
        )
    if session.status == "active":
        session.status = "completed"
        session.end_reason = "user_finish"
        session.current_question_id = None
        session.version += 1
        db.commit()
        db.refresh(session)
    return _state(session)
