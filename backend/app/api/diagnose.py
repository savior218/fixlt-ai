"""AI 诊断端点（阶段九：前端 Mock → 后端转发真实 LLM）。

POST /api/diagnose/complete
- 入参：问诊上下文（P1 四步流程收集）
- 出参：standard / elder 双文案诊断内容（单次调用）
- 安全：风险等级由前端本地规则引擎判定，LLM 不参与风险判断
- 降级：GLM 未配置或调用失败时返回 503，前端回退本地 Mock 诊断

POST /api/diagnose/photo（模块③ AI 看图）
- multipart 上传故障照片（JPG/PNG，≤10MB），base64 存库后返回 ID
- 诊断请求携带 photo_id 时自动切换视觉模型（glm-4v-flash）看图诊断
"""
import base64
import binascii
import json

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)

from app.ai import glm_client
from app.api.deps import get_current_user
from app.core.config import settings
from app.database.session import get_db
from app.models.photo import DiagnosisPhoto
from app.models.user import User
from app.schemas.diagnosis import (
    DiagnoseContent,
    DiagnoseRequest,
    DiagnoseResponse,
    PhotoOut,
)

router = APIRouter(prefix="/api/diagnose", tags=["diagnose"])

ALLOWED_MIME = {"image/jpeg", "image/png"}
MAX_PHOTO_BYTES = 10 * 1024 * 1024

SYSTEM_PROMPT = """你是"修必达（FixIt AI）"家用家电维修助手，负责根据用户提供的信息生成家电故障诊断内容。

【输出格式】只输出一个 JSON 对象，不要输出任何解释文字，字段如下：
{
  "conclusion": "标准版核心结论，2-3 句，先给最可能的原因方向，再给排查思路",
  "conclusion_elder": "长辈关怀版核心结论，口语化、语气温和、多用短句，避免术语",
  "possible_causes": [{"title": "原因标题", "description": "为什么可能导致该故障"}],
  "evidence": ["依据用户已提供信息得到的事实条目"],
  "suggestions": [{"title": "步骤标题", "description": "具体做法，确保安全"}],
  "suggestions_elder": [{"title": "第一步：…", "description": "口语化的具体做法"}],
  "tips": "日常使用小贴士，1 句",
  "tips_elder": "长辈版小贴士，口语化 1 句",
  "risk_note": "风险提示：提醒不要自行拆机、先断电等安全注意事项，1 句",
  "risk_note_elder": "长辈版风险提示，口语化 1 句"
}

【硬性要求】
1. possible_causes 给 2-3 条，按可能性从高到低排列；evidence 引用用户给出的信息。
2. suggestions 给 3 条，按「先易后难、先安全后深入」排序；不鼓励用户自行拆机，涉及电路/制冷剂/内部结构一律建议联系专业维修。
3. elder 版文案：面向老年人的关怀语气，短句、避免专业术语、动作描述具体（如"拔掉电源插头"），但不改变诊断结论本身。
4. evidence 中出现"针对…的回答：…"时表示用户已回答 AI 的问题，视为事实引用。
5. 不要输出风险等级，不要判断是否危险，只生成上述字段。
6. 所有文案使用简体中文。"""


def _build_user_payload(req: DiagnoseRequest) -> str:
    payload = {
        "category": req.category,
        "symptom": req.symptom,
        "description": req.description or None,
        "answers": req.answers,
        "device": {
            "name": req.device_name,
            "brand": req.device_brand,
            "model": req.device_model,
        }
        if (req.device_name or req.device_brand or req.device_model)
        else None,
    }
    return json.dumps(payload, ensure_ascii=False)


def _normalize_content(raw: dict) -> dict:
    """兼容模型偶发的嵌套双文案输出。

    标准输出应为平铺字段（conclusion / conclusion_elder …），但模型偶尔会
    输出 {"conclusion": {"standard": ..., "elder": ...}}，这里统一展开。
    """
    out = dict(raw)
    for key in list(out.keys()):
        value = out[key]
        if isinstance(value, dict) and "standard" in value:
            out[key] = value.get("standard")
            elder_key = f"{key}_elder"
            if elder_key not in out:
                out[elder_key] = value.get("elder")
    return out


@router.post("/complete", response_model=DiagnoseResponse)
async def complete_diagnosis(
    req: DiagnoseRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> DiagnoseResponse:
    if not glm_client.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 服务未配置（缺少 FIXITAI_AI_API_KEY），前端将回退本地诊断",
        )

    # 模块③ AI 看图：携带 photo_id 时取照片并切换视觉模型
    image: dict | None = None
    if req.photo_id is not None:
        photo = db.get(DiagnosisPhoto, req.photo_id)
        if photo is None or photo.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="故障照片不存在"
            )
        image = {"mime": photo.mime, "base64": photo.image_base64}

    user_payload = _build_user_payload(req)
    if image:
        user_payload += (
            "\n用户还上传了一张故障照片（见附图）。请结合照片可见的细节"
            "（外观损伤、安装环境、显示的异常现象等）与上述文字信息一起生成诊断，"
            "照片中无法确认的信息不要编造。"
        )

    model = settings.ai_vision_model or settings.ai_text_model if image else settings.ai_text_model
    try:
        raw = await glm_client.chat_json(SYSTEM_PROMPT, user_payload, image=image, model=model)
        content = DiagnoseContent.model_validate(_normalize_content(raw))
    except glm_client.GLMError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI 服务暂不可用：{e}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI 输出格式异常：{e}",
        ) from e

    return DiagnoseResponse(source="ai", model=model, content=content)


@router.post("/photo", response_model=PhotoOut, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> DiagnosisPhoto:
    """故障照片上传（模块③）：JPG/PNG、≤10MB，base64 存库。"""
    if (file.content_type or "").lower() not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="仅支持 JPG / PNG 格式图片",
        )
    raw = await file.read()
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="图片超过 10MB 限制，请压缩后重试",
        )
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="图片内容为空"
        )
    try:
        b64 = base64.b64encode(raw).decode("ascii")
        base64.b64decode(b64, validate=True)
    except (binascii.Error, UnicodeDecodeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="图片数据无效"
        ) from e

    photo = DiagnosisPhoto(
        user_id=user.id,
        mime=(file.content_type or "image/jpeg").lower(),
        image_base64=b64,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return photo
