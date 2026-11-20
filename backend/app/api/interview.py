"""动态追问会话 API（空调不制冷/制冷效果变差，大模型驱动）。

模型决定下一问与结束；后端负责身份、上下文、结构校验、安全、限流与持久化。
"""
from __future__ import annotations

import base64
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.ai import glm_client
from app.api.deps import AuthContext, get_current_user, require_csrf
from app.core.config import settings
from app.database.session import get_db
from app.interview import ai_driver
from app.models.interview import InterviewSession
from app.models.photo import DiagnosisPhoto
from app.models.user import User
from app.safety.rules import SAFETY_RULES_VERSION, build_interception, detect_risk, is_unknown_answer
from app.schemas.interview import (
    InterviewAnswer,
    InterviewCannot,
    InterviewFinish,
    InterviewRecommendation,
    InterviewSessionOut,
    InterviewStart,
)
from app.services.limiter import ConcurrencyExceeded, RateLimitExceeded, get_limiter

router = APIRouter(prefix="/api/interview", tags=["interview"])
logger = logging.getLogger(__name__)

SYMPTOM_ALIASES = {"not_cooling", "weak_cooling", "不制冷", "制冷效果变差", "制冷差"}


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _load(raw: str | None, default):
    try:
        data = json.loads(raw or "")
        return data if isinstance(data, type(default)) else default
    except json.JSONDecodeError:
        return default


def _dump(data) -> str:
    return json.dumps(data, ensure_ascii=False)


def _state(session: InterviewSession) -> InterviewSessionOut:
    asked = _load(session.asked, [])
    known = _load(session.known, [])
    unknown = list(dict.fromkeys(_load(session.unknown, [])))
    conflicts = list(dict.fromkeys(_load(session.conflicts, [])))
    current = _load(session.current_question, {})
    recommendation = _load(session.recommendation, {})
    return InterviewSessionOut(
        session_id=session.id,
        status=session.status,
        version=session.version,
        round=session.round,
        max_rounds=session.max_rounds,
        photo_id=session.photo_id,
        current_question=current or None if session.status == "active" else None,
        qa=asked,
        known_information=known,
        unknown_information=unknown,
        conflicts=conflicts,
        end_reason=session.end_reason,
        recommendation=(
            InterviewRecommendation.model_validate(recommendation)
            if session.end_reason == "model_recommend" and recommendation
            else None
        ),
        cannot=(
            InterviewCannot(
                reason=session.cannot_reason or "",
                next_step=session.cannot_next_step or "",
            )
            if session.end_reason == "model_cannot"
            else None
        ),
        selection_source=session.selection_source,
        selection_note=(
            "本题由大模型根据当前对话生成"
            if session.status == "active" and session.selection_source == "model"
            else None
        ),
        model_calls=session.model_calls or 0,
        model_latency_ms=session.model_latency_ms or 0,
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
        session.current_question = "{}"
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


def _dialog(asked: list[dict]) -> list[dict]:
    return [
        {
            "轮次": index + 1,
            "问题": item.get("question_text"),
            "回答": item.get("answer"),
            "回答来源": item.get("input_source"),
            "回答为不知道/没试过": bool(item.get("unknown")),
        }
        for index, item in enumerate(asked)
    ]


def _context(
    session: InterviewSession,
    asked: list[dict],
    round_no: int,
) -> dict:
    return ai_driver.build_context(
        description=session.initial_description,
        dialogue=_dialog(asked),
        round_no=round_no,
        max_rounds=session.max_rounds,
        photo_observations=_load(session.photo_observations, []),
        photo_limitations=_load(session.photo_limitations, []),
        known_information=_load(session.known, []),
        unknown_information=_load(session.unknown, []),
        conflicts=_load(session.conflicts, []),
    )


def _model_error(err: Exception) -> HTTPException:
    if isinstance(err, glm_client.GLMError):
        code = err.code
        if code == "not_configured":
            return _http_error(503, "ai_not_configured", "AI 服务未配置，暂时无法进行动态问诊")
        if code == "timeout":
            return _http_error(504, "ai_timeout", "AI 服务响应超时，请保留回答后重试")
        if code in {"auth", "rate_limited", "upstream", "network", "http", "bad_response"}:
            return _http_error(503, "ai_unavailable", "AI 服务暂不可用，请稍后重试")
        return _http_error(502, "ai_invalid_output", "AI 返回内容不合格，请重试")
    if isinstance(err, ai_driver.InterviewModelError):
        if err.code == "unsafe_output":
            return _http_error(
                502, "ai_unsafe_output", "AI 生成的问题或建议未通过安全检查，请重试"
            )
        if err.code == "duplicate_question":
            return _http_error(502, "ai_invalid_output", "AI 重复询问已问过的问题，请重试")
        return _http_error(502, "ai_invalid_output", "AI 返回内容不合格，请重试")
    logger.exception("动态问诊模型调用异常")
    return _http_error(502, "ai_invalid_output", "AI 返回内容不合格，请重试")


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


async def _acquire_limit(request: Request, user: User):
    limiter = get_limiter()
    key = f"interview:{request.client.host if request.client else 'unknown'}:{user.id}"
    try:
        await limiter.acquire(
            key,
            settings.interview_rate_limit_per_minute,
            settings.ai_max_concurrent,
        )
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "rate_limited", "message": "问诊请求过于频繁，请稍后再试"},
            headers={"Retry-After": str(e.retry_after)},
        ) from e
    except ConcurrencyExceeded as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "ai_busy", "message": "AI 服务正忙，请稍后再试"},
            headers={"Retry-After": "5"},
        ) from e
    return limiter


def _apply_meta(session: InterviewSession, result: dict) -> None:
    session.known = _dump(result.get("known_information") or [])
    # 未知信息只增不减：本轮模型整理的 + 用户此前明确回答“不知道”的
    previous_unknown = _load(session.unknown, [])
    session.unknown = _dump(
        list(dict.fromkeys([*previous_unknown, *(result.get("unknown_information") or [])]))
    )
    session.conflicts = _dump(result.get("conflicts") or [])


def _apply_decision(session: InterviewSession, result: dict) -> None:
    decision = result["decision"]
    session.selection_source = "model"
    if decision == "ask":
        session.status = "active"
        session.end_reason = None
        session.current_question = _dump(result["question"])
        session.current_question_id = result["question"]["id"]
        session.recommendation = "{}"
        session.cannot_reason = None
        session.cannot_next_step = None
        return
    session.current_question = "{}"
    session.current_question_id = None
    if decision == "recommend":
        session.status = "completed"
        session.end_reason = "model_recommend"
        session.recommendation = _dump(result["recommendation"])
        return
    session.status = "completed"
    session.end_reason = "model_cannot"
    session.cannot_reason = result["cannot"]["reason"]
    session.cannot_next_step = result["cannot"]["next_step"]


@router.post("", response_model=InterviewSessionOut, status_code=status.HTTP_201_CREATED)
async def start_interview(
    payload: InterviewStart,
    request: Request,
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

    photo = None
    if payload.photo_id is not None:
        photo = db.get(DiagnosisPhoto, payload.photo_id)
        if photo is None or photo.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="照片不存在或不属于当前账号"
            )

    # 1) 风险检查先于任何模型调用
    fake = InterviewSession(
        initial_description=payload.description,
        asked="[]",
        status="active",
        version=0,
    )
    _check_risk(fake, payload.description)

    # 2) 未配置模型时明确阻塞，不切回本地题库
    if not glm_client.is_configured():
        raise _http_error(503, "ai_not_configured", "AI 服务未配置，暂时无法进行动态问诊")

    limiter = await _acquire_limit(request, user)
    try:
        calls = 0
        latency = 0
        observations: list[str] = []
        limitations: list[str] = []
        if photo is not None:
            try:
                observations, limitations, c, ms = await ai_driver.analyze_photo(
                    {"mime": photo.mime, "base64": photo.image_base64}
                )
                calls += c
                latency += ms
            except (glm_client.GLMError, ai_driver.InterviewModelError) as e:
                logger.warning("图片分析失败 code=%s", getattr(e, "code", e))
                raise _model_error(e) from e

        session = InterviewSession(
            id=str(uuid.uuid4()),
            user_id=user.id,
            category="ac",
            symptom=payload.symptom,
            initial_description=payload.description,
            photo_id=payload.photo_id,
            photo_observations=_dump(observations),
            photo_limitations=_dump(limitations),
            known="[]",
            unknown="[]",
            conflicts="[]",
            asked="[]",
            current_question="{}",
            current_question_id=None,
            round=0,
            max_rounds=ai_driver.MAX_ROUNDS,
            status="active",
            version=0,
            recommendation="{}",
            model_calls=calls,
            model_latency_ms=latency,
            kb_version=ai_driver.INTERVIEW_MODEL_VERSION,
            safety_rules_version=SAFETY_RULES_VERSION,
        )

        try:
            result, c, ms = await ai_driver.generate_turn(
                context=_context(session, [], 0), previous_question_texts=[]
            )
        except (glm_client.GLMError, ai_driver.InterviewModelError) as e:
            logger.warning("动态问诊首轮失败 code=%s", getattr(e, "code", e))
            raise _model_error(e) from e

        session.model_calls += c
        session.model_latency_ms += ms
        _apply_meta(session, result)
        _apply_decision(session, result)

        db.add(session)
        db.commit()
        db.refresh(session)
        return _state(session)
    finally:
        await limiter.release()


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
    request: Request,
    ctx: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> InterviewSessionOut:
    session = _owned(session_id, ctx.user, db)
    if session.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="会话已结束，不能继续回答"
        )
    if payload.request_id == session.last_request_id:
        return _state(session)
    if payload.session_version != session.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "stale_session", "message": "这道题已过期，请刷新后继续"},
        )
    current = _load(session.current_question, {})
    if not current or payload.question_id != current.get("id"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "stale_question", "message": "这不是当前问题，请刷新后按新问题回答"},
        )
    asked = _load(session.asked, [])
    if any(item.get("question_id") == payload.question_id for item in asked):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "question_already_answered", "message": "这道题已经回答过"},
        )
    answer_text = payload.answer.strip()
    if not answer_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "empty_answer", "message": "回答不能为空"},
        )
    options = current.get("options") or []
    option = next((o for o in options if o.get("id") == payload.option_id), None)
    if payload.option_id and option is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_option", "message": "选项不属于当前问题"},
        )
    unknown_flag = bool(option and option.get("unknown")) or is_unknown_answer(answer_text)

    # 每轮风险检查覆盖累计上下文 + 本轮回答；高风险不调用模型
    _check_risk(session, _risk_text(session, answer_text), db)

    record = {
        "question_id": payload.question_id,
        "question_text": current.get("text"),
        "answer": answer_text,
        "option_id": payload.option_id,
        "unknown": unknown_flag,
        "input_source": payload.input_source,
        "selection_source": "model",
        "asked_at": _now(),
    }
    next_asked = [*asked, record]
    round_no = len(next_asked)
    unknown = _load(session.unknown, [])
    if unknown_flag and current.get("text"):
        unknown.append(str(current["text"]))

    session.asked = _dump(next_asked)
    session.round = round_no
    session.unknown = _dump(list(dict.fromkeys(unknown)))
    session.version += 1
    session.last_request_id = payload.request_id

    # 达到会话上限：停止追问；不额外调用模型
    if round_no >= session.max_rounds:
        session.status = "completed"
        session.end_reason = "max_rounds"
        session.current_question = "{}"
        session.current_question_id = None
        session.selection_source = None
        db.commit()
        db.refresh(session)
        return _state(session)

    limiter = await _acquire_limit(request, ctx.user)
    try:
        try:
            result, c, ms = await ai_driver.generate_turn(
                context=_context(session, next_asked, round_no),
                previous_question_texts=[str(item.get("question_text") or "") for item in next_asked],
            )
        except (glm_client.GLMError, ai_driver.InterviewModelError) as e:
            # 不提交本轮回答与版本，前端保留回答并用同一 request_id 重试
            db.rollback()
            logger.warning("动态问诊下一问失败 code=%s", getattr(e, "code", e))
            raise _model_error(e) from e

        session.model_calls = (session.model_calls or 0) + c
        session.model_latency_ms = (session.model_latency_ms or 0) + ms
        _apply_meta(session, result)
        _apply_decision(session, result)
        db.commit()
        db.refresh(session)
        return _state(session)
    finally:
        await limiter.release()


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
        session.current_question = "{}"
        session.current_question_id = None
        session.version += 1
        db.commit()
        db.refresh(session)
    return _state(session)
