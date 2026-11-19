import type { DeviceCategory } from "../services/api";
import type { RiskInterception } from "../utils/risk";

/** 风险等级（PRD SAFE-001；risk.ts 的 detectRisk 返回同一定义） */
export type RiskLevel = "low" | "medium" | "high";

/** 文案语气：standard 标准 / elder 长辈关怀（只改表达，不改判断） */
export type Tone = "standard" | "elder";

export type DiagnosisStatus = "completed" | "processing" | "failed";

/** 可能原因：标题 + 说明；confidence 仅真实 AI 提供时使用，Mock 不编造概率 */
export interface PossibleCause {
  title: string;
  description: string;
  confidence?: number;
}

/** 维修建议步骤 */
export interface RepairSuggestion {
  title: string;
  description: string;
}

/** AI 问诊对话消息 */
export interface ChatMessage {
  id: string;
  role: "ai" | "user";
  content: string;
  /** HH:mm */
  time: string;
  /** AI 建议选项（点选后作为用户输入发送） */
  suggestions?: string[];
}

/** 诊断流程四步索引：0 选择设备 / 1 描述故障 / 2 AI 问诊 / 3 查看结果 */
export type DiagnosisStep = 0 | 1 | 2 | 3;

/** 诊断草稿（diagnosisStore 持久化，刷新不丢失） */
export interface DiagnosisDraft {
  step: DiagnosisStep;
  deviceId: number | null;
  deviceName: string | null;
  category: DeviceCategory | "other" | null;
  /** 故障现象（卡片选项标题） */
  symptom: string | null;
  /** 自定义故障描述 */
  description: string;
  /** AI 问诊逐题回答 */
  answers: string[];
  chat: ChatMessage[];
  /** 高风险拦截（触发后诊断流程暂停） */
  riskInterception: RiskInterception | null;
  /** 故障照片：后端照片 ID（null = 未上传成功，仅本地预览） */
  photoId: number | null;
  /** 本地预览 data URL（模块③，随草稿持久化） */
  photoPreview: string | null;
}

/** 诊断结果（P2 结果页 / P3 报告页数据源） */
export interface Diagnosis {
  id: string;
  deviceId: number | null;
  deviceName: string | null;
  category: DeviceCategory | "other" | null;
  symptom: string;
  description: string;
  createdAt: string;
  /** 核心结论 */
  conclusion: string;
  /** 可能原因（推测，页面需标注"可能"） */
  possibleCauses: PossibleCause[];
  /** 已确认的事实（与可能原因严格分离） */
  evidence: string[];
  riskLevel: RiskLevel;
  suggestions: RepairSuggestion[];
  /** 小贴士 */
  tips: string | null;
  /** 风险提示文案 */
  riskNote: string | null;
  status: DiagnosisStatus;
}

export const EMPTY_DRAFT: DiagnosisDraft = {
  step: 0,
  deviceId: null,
  deviceName: null,
  category: null,
  symptom: null,
  description: "",
  answers: [],
  chat: [],
  riskInterception: null,
  photoId: null,
  photoPreview: null,
};
