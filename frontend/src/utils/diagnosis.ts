/** 诊断数据兼容工具：旧记录 / 旧草稿迁移 + 双文案读取。 */
import type {
  ChatMessage,
  Diagnosis,
  DiagnosisContent,
  DiagnosisDraft,
  DiagnosisSource,
  QAPair,
  RiskLevel,
  Tone,
} from "../types/diagnosis";
import { EMPTY_DRAFT } from "../types/diagnosis";
import { isUnknownAnswer, type RiskInterception } from "./risk";
import { questionsFor } from "../services/questionScript";

const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asRisk(value: unknown): RiskLevel {
  return RISK_LEVELS.includes(value as RiskLevel) ? (value as RiskLevel) : "low";
}

function asSource(value: unknown): DiagnosisSource {
  return value === "ai" || value === "template" || value === "unknown"
    ? value
    : "unknown";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : [];
}

function asQAPairs(value: unknown): QAPair[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const answer = asString(item.answer);
      return {
        questionId: asString(item.questionId),
        questionText: asString(item.questionText),
        answer,
        unknown: item.unknown === true || isUnknownAnswer(answer),
      };
    })
    .filter((item) => item.questionId && item.questionText && item.answer);
}

function asCauses(value: unknown): DiagnosisContent["possibleCauses"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      title: asString(item.title),
      description: asString(item.description),
      ...(typeof item.confidence === "number" ? { confidence: item.confidence } : {}),
    }))
    .filter((item) => item.title);
}

function asSuggestions(value: unknown): DiagnosisContent["suggestions"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      title: asString(item.title),
      description: asString(item.description),
    }))
    .filter((item) => item.title);
}

function legacyContent(raw: Record<string, unknown>): DiagnosisContent {
  return {
    conclusion: asString(raw.conclusion),
    possibleCauses: asCauses(raw.possibleCauses),
    evidence: asStringArray(raw.evidence),
    unknownInformation: asStringArray(raw.unknownInformation),
    suggestions: asSuggestions(raw.suggestions),
    tips: typeof raw.tips === "string" && raw.tips ? raw.tips : null,
    riskNote: typeof raw.riskNote === "string" && raw.riskNote ? raw.riskNote : null,
  };
}

/** 旧记录没有来源字段：标为 unknown，绝不推断为真实 AI */
export function normalizeDiagnosis(value: unknown): Diagnosis {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const pair = (raw.content && typeof raw.content === "object"
    ? raw.content
    : {}) as Record<string, unknown>;

  const standard = pair.standard
    ? asContent(pair.standard)
    : legacyContent(raw);
  const elder = pair.elder ? asContent(pair.elder) : undefined;

  return {
    id: asString(raw.id),
    deviceId: typeof raw.deviceId === "number" ? raw.deviceId : null,
    deviceName: typeof raw.deviceName === "string" ? raw.deviceName : null,
    category: typeof raw.category === "string" ? (raw.category as Diagnosis["category"]) : null,
    symptom: asString(raw.symptom),
    description: asString(raw.description),
    createdAt: asString(raw.createdAt, new Date().toISOString()),
    source: asSource(raw.source),
    model: typeof raw.model === "string" ? raw.model : null,
    qa: asQAPairs(raw.qa),
    content: { standard, ...(elder ? { elder } : {}) },
    riskLevel: asRisk(raw.riskLevel),
    conclusion: standard.conclusion,
    possibleCauses: standard.possibleCauses,
    evidence: standard.evidence,
    suggestions: standard.suggestions,
    tips: standard.tips,
    riskNote: standard.riskNote,
    status: raw.status === "processing" || raw.status === "failed" ? raw.status : "completed",
  };
}

function asContent(value: unknown): DiagnosisContent {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    conclusion: asString(raw.conclusion),
    possibleCauses: asCauses(raw.possibleCauses),
    evidence: asStringArray(raw.evidence),
    unknownInformation: asStringArray(raw.unknownInformation),
    suggestions: asSuggestions(raw.suggestions),
    tips: typeof raw.tips === "string" && raw.tips ? raw.tips : null,
    riskNote: typeof raw.riskNote === "string" && raw.riskNote ? raw.riskNote : null,
  };
}

/** 读取指定模式的内容；旧记录缺少长辈版时回退标准版并标记 exact=false */
export function contentFor(
  diagnosis: Diagnosis,
  tone: Tone
): { content: DiagnosisContent; exact: boolean } {
  const standard = diagnosis.content?.standard ?? legacyContent(diagnosis as unknown as Record<string, unknown>);
  if (tone === "elder") {
    const elder = diagnosis.content?.elder;
    return elder ? { content: elder, exact: true } : { content: standard, exact: false };
  }
  return { content: standard, exact: true };
}

export function hasElderCopy(diagnosis: Diagnosis): boolean {
  return !!diagnosis.content?.elder;
}

/** 旧草稿迁移：仅在问答对应关系明确时按固定顺序映射，不编造问题 */
export function normalizeDraft(value: unknown): DiagnosisDraft {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const category =
    typeof raw.category === "string" ? (raw.category as DiagnosisDraft["category"]) : null;
  let qa = asQAPairs(raw.qa);

  if (qa.length === 0 && Array.isArray(raw.answers) && category) {
    const questions = questionsFor(category);
    const answers = asStringArray(raw.answers);
    qa = answers.slice(0, questions.length).map((answer, index) => ({
      questionId: questions[index].id,
      questionText: questions[index].text,
      answer,
      unknown: isUnknownAnswer(answer),
    }));
  }

  const chat = Array.isArray(raw.chat)
    ? raw.chat
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item) => ({
          id: asString(item.id),
          role: item.role === "user" ? ("user" as const) : ("ai" as const),
          content: asString(item.content),
          time: asString(item.time),
          suggestions: asStringArray(item.suggestions),
        }))
        .filter((item) => item.id && item.content)
    : [];

  const step = typeof raw.step === "number" && raw.step >= 0 && raw.step <= 3 ? raw.step : 0;
  const risk = raw.riskInterception;
  const aiError = raw.aiError;

  return {
    ...EMPTY_DRAFT,
    step: step as DiagnosisDraft["step"],
    deviceId: typeof raw.deviceId === "number" ? raw.deviceId : null,
    deviceName: typeof raw.deviceName === "string" ? raw.deviceName : null,
    category,
    symptom: typeof raw.symptom === "string" ? raw.symptom : null,
    description: asString(raw.description),
    qa,
    chat: chat as ChatMessage[],
    riskInterception:
      risk && typeof risk === "object" ? (risk as RiskInterception) : null,
    aiError:
      aiError && typeof aiError === "object"
        ? {
            code: asString((aiError as Record<string, unknown>).code, "unknown"),
            message: asString((aiError as Record<string, unknown>).message, "诊断生成失败"),
          }
        : null,
  };
}
