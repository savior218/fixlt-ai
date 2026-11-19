import type { DeviceCategory } from "../services/api";
import type { RiskInterception } from "../utils/risk";

/** 风险等级（PRD SAFE-001；risk.ts 的 detectRisk 返回同一定义） */
export type RiskLevel = "low" | "medium" | "high";

/** 文案语气：standard 标准 / elder 长辈关怀（只改表达，不改判断） */
export type Tone = "standard" | "elder";

/** 诊断类别（设备类别 + 其他家电） */
export type DiagnoseCategory = DeviceCategory | "other";

export type DiagnosisStatus = "completed" | "processing" | "failed";

/**
 * 内容来源：
 * - ai：后端真实模型生成
 * - template：用户主动选择的本地模板演示（非 AI）
 * - unknown：旧记录未保存来源，不能推断为真实 AI
 */
export type DiagnosisSource = "ai" | "template" | "unknown";

/** 可能原因：标题 + 说明；confidence 仅真实 AI 提供时使用，模板不编造概率 */
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

/** 单轮问诊：问题 ID、实际展示文本、用户回答、是否未知 */
export interface QAPair {
  questionId: string;
  questionText: string;
  answer: string;
  unknown: boolean;
}

/** 单套文案的完整内容（标准版 / 长辈版共用同一结构与事实） */
export interface DiagnosisContent {
  conclusion: string;
  possibleCauses: PossibleCause[];
  /** 已确认的事实：必须可追溯到用户输入 */
  evidence: string[];
  /** 未知 / 待确认信息：不升级为事实 */
  unknownInformation: string[];
  suggestions: RepairSuggestion[];
  tips: string | null;
  riskNote: string | null;
}

/** 双文案：同一诊断一次生成/保存两套表达；旧记录可能缺少 elder */
export interface DiagnosisContentPair {
  standard: DiagnosisContent;
  elder?: DiagnosisContent;
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

/** AI 生成失败信息（保存在草稿中，切换页面后仍可重试） */
export interface DiagnosisError {
  code: string;
  message: string;
}

/** 诊断流程四步索引：0 选择设备 / 1 描述故障 / 2 AI 问诊 / 3 查看结果 */
export type DiagnosisStep = 0 | 1 | 2 | 3;

/** 诊断草稿（diagnosisStore 持久化，刷新不丢失） */
export interface DiagnosisDraft {
  step: DiagnosisStep;
  deviceId: number | null;
  deviceName: string | null;
  category: DiagnoseCategory | null;
  /** 故障现象（卡片选项标题） */
  symptom: string | null;
  /** 自定义故障描述 */
  description: string;
  /** 完整问答上下文（问题 ID / 文本 / 回答 / 是否未知） */
  qa: QAPair[];
  chat: ChatMessage[];
  /** 高风险拦截（触发后诊断流程暂停） */
  riskInterception: RiskInterception | null;
  /** 最近一次 AI 生成失败（允许重试 / 主动选择模板） */
  aiError: DiagnosisError | null;
}

/** 诊断结果（P2 结果页 / P3 报告页数据源） */
export interface Diagnosis {
  id: string;
  deviceId: number | null;
  deviceName: string | null;
  category: DiagnoseCategory | null;
  symptom: string;
  description: string;
  createdAt: string;
  /** 本地数据归属：user:<id> 或 local（旧记录 / 游客本机历史） */
  ownerKey?: string;
  /** 内容来源（旧记录为 unknown） */
  source: DiagnosisSource;
  /** 真实 AI 的模型名；模板 / 旧记录为空 */
  model?: string | null;
  /** 完整问答上下文；旧记录为空数组 */
  qa: QAPair[];
  /** 双文案；旧记录可能只有 standard */
  content?: DiagnosisContentPair;
  /** 风险等级：前端规则与后端风险下限取较高者 */
  riskLevel: RiskLevel;

  /* ---- 云端同步（阶段十二） ---- */
  /** 服务端记录 ID；仅云端记录有 */
  serverId?: number;
  /** 来自服务端（非本机草稿/缓存） */
  cloud?: boolean;
  /** 服务端回执校验为真实 AI 结果；本机导入恒为 false */
  verified?: boolean;
  /** 由本机历史主动导入 */
  imported?: boolean;
  /** 保存状态：local=尚未保存到云端 */
  saveStatus?: "local" | "saving" | "saved" | "failed";
  /** 生成该 AI 结果时服务端签发的保存回执（只用于保存，不作为登录凭据） */
  receipt?: string | null;

  /* ---- 兼容字段：始终等于 standard 内容，供旧页面 / 旧数据读取 ---- */
  conclusion: string;
  possibleCauses: PossibleCause[];
  evidence: string[];
  suggestions: RepairSuggestion[];
  tips: string | null;
  riskNote: string | null;

  status: DiagnosisStatus;
}

export const EMPTY_CONTENT: DiagnosisContent = {
  conclusion: "",
  possibleCauses: [],
  evidence: [],
  unknownInformation: [],
  suggestions: [],
  tips: null,
  riskNote: null,
};

export const EMPTY_DRAFT: DiagnosisDraft = {
  step: 0,
  deviceId: null,
  deviceName: null,
  category: null,
  symptom: null,
  description: "",
  qa: [],
  chat: [],
  riskInterception: null,
  aiError: null,
};
