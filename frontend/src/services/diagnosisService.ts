/* ============================================================
   诊断服务（阶段十：可信来源 / 完整问答 / 双文案 / 失败可重试）
   ------------------------------------------------------------
   - 问诊每轮只追问一个问题，保存问题 ID、问题文本与回答
   - 安全判定在本地独立完成（utils/risk.ts），高风险立即拦截
   - 真实 AI 失败时不静默回退：返回结构化错误，由页面明确提示
   - 用户主动选择“模板演示”时生成 source=template 的诊断，前后均标注
   - 同一诊断保存 standard / elder 两套文案，共用事实、原因排序与行动含义
   ============================================================ */

import {
  ApiError,
  requestAIChat,
  requestAIDiagnosis,
  type AIChatMessage,
} from "./api";
import type {
  ChatMessage,
  Diagnosis,
  DiagnosisContent,
  DiagnosisError,
  DiagnoseCategory,
  PossibleCause,
  QAPair,
  RepairSuggestion,
  RiskLevel,
  Tone,
} from "../types/diagnosis";
import type { Device } from "../types/device";
import {
  buildInterception,
  detectRisk,
  higherRisk,
  isUnknownAnswer,
  SYMPTOM_BASE_RISK,
  type RiskInterception,
} from "../utils/risk";
import { shortId } from "../utils/format";
import { questionsFor, type QuestionDef } from "./questionScript";

export type { DiagnoseCategory } from "../types/diagnosis";

/** P1 故障现象卡片选项（主标题 + 括注） */
export const SYMPTOM_OPTIONS: Record<DiagnoseCategory, { title: string; note: string }[]> = {
  ac: [
    { title: "完全不制冷", note: "不出冷风" },
    { title: "制冷效果变差", note: "不够凉" },
    { title: "漏水", note: "室内/室外" },
    { title: "有异常噪音", note: "嗡嗡/咔哒" },
  ],
  fridge: [
    { title: "不制冷", note: "冷藏室不凉" },
    { title: "制冷效果变差", note: "不够冷" },
    { title: "噪音大", note: "嗡嗡/震动" },
    { title: "结冰严重", note: "内壁厚冰" },
  ],
  washer: [
    { title: "无法启动", note: "通电没反应" },
    { title: "脱水异常", note: "抖动/噪音大" },
    { title: "漏水", note: "底部/管路" },
    { title: "不进水", note: "启动后无水流" },
  ],
  other: [
    { title: "无法开机", note: "通电没反应" },
    { title: "运行中断", note: "用着用着停了" },
    { title: "异响", note: "不正常声音" },
    { title: "其他问题", note: "直接描述" },
  ],
};

/** 问诊上下文（diagnosisStore 草稿 + 完整问答） */
export interface AskContext {
  category: DiagnoseCategory | null;
  symptom: string | null;
  description: string;
  qa: QAPair[];
  device?: Device | null;
  /** 故障照片 ID（模块③ AI 看图；null/undefined = 无照片） */
  photoId?: number | null;
  /** 自由聊天的完整对话（真实 AI 多轮问诊） */
  chat?: ChatMessage[];
}

/** 聊天回复结果：与最终诊断生成分开处理，失败时保留对话并允许重试 */
export type ChatResult =
  | {
      ok: true;
      reply: string;
      ready: boolean;
      suggestions: string[];
      model: string;
    }
  | { ok: false; kind: "interception"; interception: RiskInterception }
  | { ok: false; kind: "error"; error: DiagnosisError };

/** 把自由聊天记录转换为可追溯的问答摘要（用于保存与事实构造） */
export function buildQAFromChat(chat: ChatMessage[]): QAPair[] {
  const pairs: QAPair[] = [];
  for (let i = 0; i < chat.length; i += 1) {
    const message = chat[i];
    if (message.role !== "user") continue;
    const previous = [...chat.slice(0, i)].reverse().find((m) => m.role === "ai");
    pairs.push({
      questionId: `chat_${pairs.length + 1}`,
      questionText: clip(previous?.content ?? "用户主动描述", 160),
      answer: clip(message.content, 300),
      unknown: isUnknownAnswer(message.content),
    });
  }
  return pairs.slice(-12);
}

/** 后端对话协议：只保留最近 12 条，单条最多 600 字，避免超出请求体限制 */
export function toChatPayload(chat: ChatMessage[]): AIChatMessage[] {
  return chat
    .slice(-12)
    .map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("assistant" as const),
      content: clip(message.content, 600),
    }))
    .filter((message) => message.content.length > 0);
}

export type AskResult =
  | { kind: "question"; question: QuestionDef }
  /** 问诊完成，进入异步结果生成（generateAIDiagnosis / buildTemplateDiagnosis） */
  | { kind: "result" }
  | { kind: "interception"; interception: RiskInterception };

/** 生成结果：失败分“高风险拦截”和“AI 错误”，页面分别处理 */
export type GenerateResult =
  | { ok: true; diagnosis: Diagnosis }
  | { ok: false; kind: "interception"; interception: RiskInterception }
  | { ok: false; kind: "error"; error: DiagnosisError };

const CATEGORY_LABELS: Record<DiagnoseCategory, string> = {
  ac: "空调",
  fridge: "冰箱",
  washer: "洗衣机",
  other: "其他家电",
};

/* ============ 事实 / 未知信息（与后端 app/services/facts.py 同规则） ============ */

function clip(text: string, max = 200): string {
  return text.trim().slice(0, max);
}

export function buildEvidence(ctx: AskContext): {
  evidence: string[];
  unknownInformation: string[];
} {
  const category = ctx.category ?? "other";
  const evidence: string[] = [];
  const unknownInformation: string[] = [];

  const deviceText = [ctx.device?.name, ctx.device?.brand, ctx.device?.model]
    .filter(Boolean)
    .join(" ")
    .trim();
  evidence.push(
    deviceText
      ? `设备：${clip(deviceText)}（${CATEGORY_LABELS[category]}）`
      : `设备类型：${CATEGORY_LABELS[category]}`
  );

  evidence.push(ctx.symptom ? `故障现象：${clip(ctx.symptom)}` : "故障现象：用户以文字描述了问题");
  if (ctx.description.trim()) evidence.push(`用户描述：${clip(ctx.description)}`);

  for (const item of ctx.qa) {
    if (!item.questionText || !item.answer) continue;
    // 聊天轮次不作为判断依据逐条展示（由 AI 在 user_summary 中总结）
    if (item.questionId.startsWith("chat_")) continue;
    if (item.unknown || isUnknownAnswer(item.answer)) {
      unknownInformation.push(
        `「${clip(item.questionText, 160)}」用户回答：${clip(item.answer)}（未知，未作为确认事实）`
      );
    } else {
      evidence.push(
        `「${clip(item.questionText, 160)}」用户回答：${clip(item.answer)}`
      );
    }
  }

  return { evidence: evidence.slice(0, 8), unknownInformation: unknownInformation.slice(0, 6) };
}

/** 安全扫描文本：症状 + 描述 + 每轮问题与回答（与后端一致） */
export function buildScanText(ctx: AskContext): string {
  return [ctx.symptom ?? "", ctx.description, ...ctx.qa.map((q) => `${q.questionText} ${q.answer}`)].join(
    "\n"
  );
}

export function buildLocalRisk(ctx: AskContext): { level: RiskLevel; matched: string[] } {
  const detected = detectRisk(buildScanText(ctx));
  const base = SYMPTOM_BASE_RISK[ctx.symptom ?? ""] ?? "low";
  return { level: higherRisk(detected.level, base), matched: detected.matched };
}

/* ============ 诊断模板（standard / elder 双文案） ============ */

interface DiagnosisTemplate {
  conclusion: string;
  conclusionElder: string;
  causes: PossibleCause[];
  suggestions: RepairSuggestion[];
  suggestionsElder: RepairSuggestion[];
  tips: string;
  tipsElder: string;
  riskNote: string;
  riskNoteElder: string;
}

const TEMPLATES: Record<DiagnoseCategory, DiagnosisTemplate> = {
  ac: {
    conclusion:
      "初步判断为空气流通受阻或制冷效率下降，多数情况与滤网积尘、制冷剂或室外机散热有关，可先从清洁滤网入手排查。",
    conclusionElder:
      "多半是空调里面的过滤网太脏了，挡住了空气流动。可以先关掉空调，请家人帮忙或约维修人员清理一下过滤网，多半就能好转~",
    causes: [
      { title: "空调滤网积灰过多，影响空气流通", description: "积尘会明显降低出风量与制冷效果，是最常见的原因" },
      { title: "制冷剂轻微不足（可能性较低）", description: "若清洁滤网后仍无改善，需专业人员检测压力确认" },
      { title: "室外机散热不良（如有遮挡）", description: "外机周围有杂物遮挡或阳光直射会降低换热效率" },
    ],
    suggestions: [
      { title: "断电后取出滤网清水冲洗", description: "关闭电源并等待 10 分钟，打开面板取出滤网，用清水冲洗晾干后装回" },
      { title: "清理室外机周边遮挡物", description: "确认外机四周 50cm 内无杂物堆积，保持通风顺畅" },
      { title: "试运行 30 分钟观察效果", description: "若仍无明显改善，建议联系专业人员检测制冷剂压力" },
    ],
    suggestionsElder: [
      { title: "第一步：先拔电源，等 10 分钟", description: "空调完全停下来后，再请人帮忙拆下前面的过滤网" },
      { title: "第二步：把过滤网洗干净、晾干装回去", description: "用清水冲干净灰尘，等干透后再装上" },
      { title: "第三步：开机试半小时", description: "还是不凉的话，就打维修电话，让师傅上门检查" },
    ],
    tips: "定期清洁滤网（建议每 1-2 个月一次），可有效提升制冷效果，延长使用寿命。",
    tipsElder: "过滤网要常洗，空调才凉快，也更省电。",
    riskNote: "请勿自行拆卸空调内部部件，避免触电或造成更大损坏。",
    riskNoteElder: "不要自己拆空调里面，小心触电，拿不准就找师傅。",
  },
  fridge: {
    conclusion:
      "初步判断与门封密封性、散热环境或化霜系统相关，可先检查门封与散热空间；若结冰严重则需化霜后再观察。",
    conclusionElder:
      "冰箱不太凉，常见的原因是门上的胶条松了、或者冰箱后面被挡住不透气，也有可能是结了厚冰挡住了冷气。先检查胶条、给冰箱除除冰，一般会有改善~",
    causes: [
      { title: "门封条老化或吸附异物，密封不严", description: "冷气外泄导致制冷变差，可用纸片测试门封吸力" },
      { title: "冷凝器散热空间不足", description: "冰箱两侧或背部贴墙、被遮挡时散热效率明显下降" },
      { title: "化霜系统异常导致结冰（如有厚冰）", description: "内壁厚冰会阻挡冷气循环，需先断电化霜再观察" },
    ],
    suggestions: [
      { title: "检查门封条并清洁", description: "用温水擦拭门封条，纸片测试能否夹紧；老化变形需更换" },
      { title: "预留散热空间并断电化霜", description: "冰箱两侧背部留出 10cm 以上空间；结冰严重时断电化霜 8 小时" },
      { title: "空机运行 24 小时观察温度", description: "化霜后先不放食材，观察冷藏室能否恢复凉爽" },
    ],
    suggestionsElder: [
      { title: "第一步：擦一擦冰箱门上的胶条", description: "用湿布擦干净，关门时要能吸得紧紧的" },
      { title: "第二步：清空冰箱，拔电化冰", description: "里面的厚冰化掉后再通电，先空着放一天" },
      { title: "第三步：还不凉就联系维修", description: "让专业人员上门检查，不要自己拆冰箱" },
    ],
    tips: "热的食物请冷却后再放入冰箱；冰箱周围留出散热空间，可显著降低耗电并延长寿命。",
    tipsElder: "热菜放凉了再放冰箱，冰箱两边留点空，省电又耐用。",
    riskNote: "请勿使用尖锐物品铲除内壁冰层，避免刺穿管路；化霜前请先断电。",
    riskNoteElder: "除冰不要用刀子铲，会弄坏管子；先拔掉电源再化冰。",
  },
  washer: {
    conclusion:
      "初步判断与供电/门锁状态、排水管路或负载平衡相关，可按「通电检查 → 排水检查 → 负载调整」顺序排查。",
    conclusionElder:
      "洗衣机出问题，常见的是电源插头松了、门没关好、或者排水管被堵住了。可以先检查插头和门，再看看水管有没有折弯~",
    causes: [
      { title: "供电或门锁未就位", description: "插座接触不良或舱门未锁到位时，设备不会启动" },
      { title: "排水管堵塞或弯折", description: "排水不畅会导致报警停机或不进水" },
      { title: "脱水负载不平衡", description: "衣物偏向一侧会引起剧烈震动与噪音" },
    ],
    suggestions: [
      { title: "检查插座供电与舱门锁止", description: "换插座通电测试；重新关严舱门听到锁扣声" },
      { title: "检查排水管与进水阀", description: "拉直弯折管路，清理排水口滤网杂物" },
      { title: "重新均匀放置衣物试脱水", description: "大件衣物单独脱水易偏心，抖散后再运行" },
    ],
    suggestionsElder: [
      { title: "第一步：看插头和门", description: "插头插紧，门关严到「咔哒」一声" },
      { title: "第二步：看看水管有没有压弯", description: "把弯折的水管拉直，排水口的小网兜清一清" },
      { title: "第三步：衣服放均匀再试一次", description: "还不行就打维修电话，别自己拆机器" },
    ],
    tips: "洗大件（被套、窗帘）时单独脱水并抖散放置，可减少震动与噪音。",
    tipsElder: "洗被子窗帘要抖开再脱水分开洗，机器就不容易晃。",
    riskNote: "清洁或检查前请拔掉电源插头；请勿湿手操作电源与插座。",
    riskNoteElder: "检查前先拔插头，手湿的时候不要碰插座。",
  },
  other: {
    conclusion:
      "该故障可能是由于电路板接触不良，建议您先检查电源连接是否正常。",
    conclusionElder:
      "可能是电源插头没插好，您先检查一下插头和插座，看看有没有松动哦~",
    causes: [
      { title: "电源连接或插座接触不良", description: "供电不稳是最常见的「无法开机/运行中断」原因" },
      { title: "内部电路板接触不良（可能性较低）", description: "需拆机检测确认，不建议自行处理" },
      { title: "过热保护触发", description: "设备长时间运行或散热受阻时可能自动停机" },
    ],
    suggestions: [
      { title: "换插座重新通电测试", description: "排除插座接触不良的可能" },
      { title: "断电静置 30 分钟再开机", description: "让过热保护复位，观察能否恢复" },
      { title: "仍无响应则联系专业维修", description: "涉及内部电路，不建议自行拆检" },
    ],
    suggestionsElder: [
      { title: "第一步：换个插座插上试试", description: "换个确定能用的插座，看看是不是插座的问题" },
      { title: "第二步：让它休息半小时再开", description: "有的机器太热会自动休息，凉一会儿就好" },
      { title: "第三步：还不行就找维修师傅", description: "里面的电路有危险，别自己打开" },
    ],
    tips: "家电长期不用时建议拔掉电源，既省电也更安全。",
    tipsElder: "电器长时间不用，最好把插头拔掉，省电也安全。",
    riskNote: "请勿自行拆机检查电路，避免触电风险；检查前先断电。",
    riskNoteElder: "不要自己拆开看电路，很危险；先拔掉电源。",
  },
};

function buildTemplateContent(
  ctx: AskContext,
  tone: Tone,
  facts: { evidence: string[]; unknownInformation: string[] }
): DiagnosisContent {
  const category = ctx.category ?? "other";
  const tpl = TEMPLATES[category];
  const elder = tone === "elder";
  return {
    conclusion: elder ? tpl.conclusionElder : tpl.conclusion,
    possibleCauses: tpl.causes,
    evidence: facts.evidence,
    unknownInformation: facts.unknownInformation,
    suggestions: elder ? tpl.suggestionsElder : tpl.suggestions,
    tips: elder ? tpl.tipsElder : tpl.tips,
    riskNote: elder ? tpl.riskNoteElder : tpl.riskNote,
  };
}

/**
 * 模板演示（source=template）：必须由用户主动选择，页面在前后都明确标注“非 AI 生成”。
 * 与真实 AI 一样保存 standard / elder 双文案与完整问答。
 */
export function buildTemplateDiagnosis(ctx: AskContext): Diagnosis {
  const facts = buildEvidence(ctx);
  const standard = buildTemplateContent(ctx, "standard", facts);
  const elder = buildTemplateContent(ctx, "elder", facts);
  const risk = buildLocalRisk(ctx);
  return {
    id: shortId("diag"),
    deviceId: ctx.device?.id ?? null,
    deviceName: ctx.device?.name ?? null,
    category: ctx.category ?? "other",
    symptom: ctx.symptom ?? "",
    description: ctx.description,
    createdAt: new Date().toISOString(),
    source: "template",
    model: null,
    qa: ctx.qa.map((q) => ({ ...q })),
    content: { standard, elder },
    riskLevel: risk.level,
    conclusion: standard.conclusion,
    possibleCauses: standard.possibleCauses,
    evidence: standard.evidence,
    suggestions: standard.suggestions,
    tips: standard.tips,
    riskNote: standard.riskNote,
    status: "completed",
    saveStatus: "local",
  };
}

/**
 * 问诊下一轮：
 * 1. 全文风险检测 → 高风险立即拦截（任何模式一致）
 * 2. 问题未问完 → 返回下一个问题（每次只问一个）
 * 3. 问题问完 → 返回 result（由页面异步生成结果）
 */
export function nextTurn(ctx: AskContext, tone: Tone): AskResult {
  const risk = buildLocalRisk(ctx);
  if (risk.level === "high") {
    return { kind: "interception", interception: buildInterception(risk.matched, tone) };
  }
  const questions = questionsFor(ctx.category);
  if (ctx.qa.length < questions.length) {
    return { kind: "question", question: questions[ctx.qa.length] };
  }
  return { kind: "result" };
}

/**
 * 自由聊天式问诊（真实 AI）：
 * - 每一轮都把用户输入交给本地安全规则扫描，高风险立即拦截，不发请求
 * - 成功返回自然语言回复、是否信息足够与快捷选项
 * - 失败返回结构化错误，由页面保留对话并明确提示重试
 */
export async function chatWithAI(
  ctx: AskContext,
  chat: ChatMessage[],
  tone: Tone,
  signal?: AbortSignal
): Promise<ChatResult> {
  const scanned = [
    ctx.symptom ?? "",
    ctx.description,
    ...chat.filter((m) => m.role === "user").map((m) => m.content),
  ].join("\n");
  const detected = detectRisk(scanned);
  const base = SYMPTOM_BASE_RISK[ctx.symptom ?? ""] ?? "low";
  if (higherRisk(detected.level, base) === "high") {
    return {
      ok: false,
      kind: "interception",
      interception: buildInterception(detected.matched, tone),
    };
  }

  try {
    const res = await requestAIChat(
      {
        category: ctx.category ?? "other",
        symptom: ctx.symptom,
        description: ctx.description,
        messages: toChatPayload(chat),
        device_name: ctx.device?.name ?? null,
        device_brand: ctx.device?.brand ?? null,
        device_model: ctx.device?.model ?? null,
        photo_id: ctx.photoId ?? null,
        tone,
      },
      signal
    );
    return {
      ok: true,
      reply: res.reply,
      ready: res.ready,
      suggestions: res.suggestions,
      model: res.model,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "aborted") {
        return {
          ok: false,
          kind: "error",
          error: { code: "aborted", message: "请求已取消" },
        };
      }
      if (err.code === "high_risk_blocked") {
        const interception = backendInterception(err.detail, tone);
        if (interception) return { ok: false, kind: "interception", interception };
      }
      return {
        ok: false,
        kind: "error",
        error: { code: err.code, message: errorMessage(err.code) },
      };
    }
    return {
      ok: false,
      kind: "error",
      error: { code: "unknown", message: errorMessage("unknown") },
    };
  }
}

function errorMessage(code: string): string {
  switch (code) {
    case "ai_not_configured":
      return "AI 服务尚未配置，暂时无法生成真实诊断。";
    case "ai_timeout":
      return "AI 响应超时，请稍后重试。";
    case "ai_unavailable":
    case "ai_busy":
    case "rate_limited":
      return "AI 服务当前繁忙或不可用，请稍后重试。";
    case "ai_invalid_output":
      return "AI 返回内容不合格，未采用该结果，请重试。";
    case "ai_unsafe_output":
      return "AI 建议未通过安全检查，未展示该内容，请重试。";
    case "request_too_large":
      return "描述内容过长，请精简后重试。";
    case "timeout":
      return "请求超时，请检查网络后重试。";
    case "network":
      return "无法连接诊断服务，请检查网络或后端是否启动。";
    default:
      return "诊断生成失败，请重试或选择模板演示。";
  }
}

function backendInterception(
  detail: unknown,
  tone: Tone
): RiskInterception | null {
  const risk = (detail as { risk?: Record<string, unknown> } | undefined)?.risk;
  if (!risk || typeof risk !== "object") return null;
  const key = tone === "elder" ? "elder" : "standard";
  const variant = (risk[key] ?? risk.standard) as
    | { description?: string; immediate_actions?: { title: string; description: string }[]; forbidden_actions?: string[] }
    | undefined;
  if (!variant) return null;
  return {
    level: "high",
    title: String(risk.title ?? "存在高风险！"),
    description: String(variant.description ?? ""),
    immediateActions: variant.immediate_actions ?? [],
    forbiddenActions: variant.forbidden_actions ?? [],
    matched: Array.isArray(risk.matched) ? (risk.matched as string[]) : [],
  };
}

/**
 * 真实 AI 诊断（阶段十）：
 * - 成功：保存双文案、完整问答、来源 ai、模型名；风险取本地与后端下限较高者
 * - 失败：返回结构化错误，不自动回退模板；高风险由后端拦截时转为拦截结果
 */
export async function generateAIDiagnosis(
  ctx: AskContext,
  tone: Tone,
  signal?: AbortSignal
): Promise<GenerateResult> {
  const localRisk = buildLocalRisk(ctx);
  const facts = buildEvidence(ctx);
  const fallback = buildTemplateDiagnosis(ctx);

  try {
    const res = await requestAIDiagnosis(
      {
        category: ctx.category ?? "other",
        symptom: ctx.symptom,
        description: ctx.description,
        qa: ctx.qa.map((q) => ({
          question_id: q.questionId,
          question_text: q.questionText,
          answer: q.answer,
          unknown: q.unknown || isUnknownAnswer(q.answer),
          input_source: q.inputSource,
          selection_source: q.selectionSource,
        })),
        conversation: toChatPayload(ctx.chat ?? []),
        device_name: ctx.device?.name ?? null,
        device_brand: ctx.device?.brand ?? null,
        device_model: ctx.device?.model ?? null,
        photo_id: ctx.photoId ?? null,
      },
      signal
    );
    const c = res.content;
    const causes = c.possible_causes.map((p) => ({
      title: p.title,
      description: p.description,
    }));
    const standard: DiagnosisContent = {
      conclusion: c.conclusion,
      possibleCauses: causes,
      evidence: c.evidence?.length ? c.evidence : facts.evidence,
      unknownInformation: c.unknown_information ?? facts.unknownInformation,
      suggestions: c.suggestions,
      tips: c.tips || fallback.content?.standard.tips || null,
      riskNote: c.risk_note || fallback.content?.standard.riskNote || null,
    };
    const elder: DiagnosisContent = {
      conclusion: c.conclusion_elder,
      possibleCauses: causes,
      evidence: standard.evidence,
      unknownInformation: standard.unknownInformation,
      suggestions: c.suggestions_elder,
      tips: c.tips_elder || fallback.content?.elder?.tips || null,
      riskNote: c.risk_note_elder || fallback.content?.elder?.riskNote || null,
    };

    const riskLevel = higherRisk(localRisk.level, res.risk_floor);

    return {
      ok: true,
      diagnosis: {
        id: shortId("diag"),
        deviceId: ctx.device?.id ?? null,
        deviceName: ctx.device?.name ?? null,
        category: ctx.category ?? "other",
        symptom: ctx.symptom ?? "",
        description: ctx.description,
        createdAt: new Date().toISOString(),
        source: "ai",
        model: res.model,
        qa: ctx.qa.map((q) => ({ ...q })),
        content: { standard, elder },
        riskLevel,
        conclusion: standard.conclusion,
        possibleCauses: standard.possibleCauses,
        evidence: standard.evidence,
        suggestions: standard.suggestions,
        tips: standard.tips,
        riskNote: standard.riskNote,
        status: "completed",
        saveStatus: "local",
        // 服务端回执：登录用户保存报告时用于核验真实 AI 来源
        receipt: res.receipt ?? null,
      },
    };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "aborted") {
        return { ok: false, kind: "error", error: { code: "aborted", message: "请求已取消" } };
      }
      if (err.code === "high_risk_blocked") {
        const interception = backendInterception(err.detail, tone);
        if (interception) return { ok: false, kind: "interception", interception };
      }
      return {
        ok: false,
        kind: "error",
        error: { code: err.code, message: errorMessage(err.code) },
      };
    }
    return {
      ok: false,
      kind: "error",
      error: { code: "unknown", message: errorMessage("unknown") },
    };
  }
}
