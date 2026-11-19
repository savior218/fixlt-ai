/* ============================================================
   云端记录服务（阶段十二）：服务端 snake_case ↔ 前端领域模型
   - 同一账号在任意浏览器登录后可读取同一批报告与维修记录
   - 保存使用本地记录 ID 作为 client_ref，重复提交不会产生多条
   ============================================================ */

import type { CloudDiagnosisContent, CloudDiagnosisRecord } from "./api";
import {
  type CloudDiagnosisPayload,
  type CloudRepairPayload,
  type CloudRepairRecord,
} from "./api";
import type {
  Diagnosis,
  DiagnosisContent,
  DiagnoseCategory,
} from "../types/diagnosis";
import type { RepairRecord } from "../types/repair";

function contentToApi(c: DiagnosisContent): CloudDiagnosisContent {
  return {
    conclusion: c.conclusion,
    possible_causes: c.possibleCauses.map((x) => ({
      title: x.title,
      description: x.description,
    })),
    evidence: c.evidence,
    unknown_information: c.unknownInformation,
    suggestions: c.suggestions.map((x) => ({
      title: x.title,
      description: x.description,
    })),
    tips: c.tips,
    risk_note: c.riskNote,
  };
}

function contentFromApi(c: CloudDiagnosisContent): DiagnosisContent {
  return {
    conclusion: c.conclusion,
    possibleCauses: c.possible_causes.map((x) => ({
      title: x.title,
      description: x.description,
    })),
    evidence: c.evidence,
    unknownInformation: c.unknown_information,
    suggestions: c.suggestions.map((x) => ({
      title: x.title,
      description: x.description,
    })),
    tips: c.tips || null,
    riskNote: c.risk_note || null,
  };
}

const EMPTY_CONTENT: DiagnosisContent = {
  conclusion: "",
  possibleCauses: [],
  evidence: [],
  unknownInformation: [],
  suggestions: [],
  tips: null,
  riskNote: null,
};

/** 前端诊断记录 → 服务端保存载荷 */
export function toApiDiagnosis(d: Diagnosis): CloudDiagnosisPayload {
  const standard = d.content?.standard ?? {
    conclusion: d.conclusion,
    possibleCauses: d.possibleCauses,
    evidence: d.evidence,
    unknownInformation: [],
    suggestions: d.suggestions,
    tips: d.tips,
    riskNote: d.riskNote,
  };
  return {
    client_ref: d.id,
    device_id: d.deviceId ?? null,
    device_name: d.deviceName,
    category: d.category,
    symptom: d.symptom,
    description: d.description,
    source: d.source,
    ai_model: d.source === "ai" ? d.model ?? null : null,
    risk_level: d.riskLevel,
    risk_rules_version: null,
    qa: d.qa.map((q) => ({
      question_id: q.questionId,
      question_text: q.questionText,
      answer: q.answer,
      unknown: q.unknown,
    })),
    content: {
      standard: contentToApi(standard),
      ...(d.content?.elder ? { elder: contentToApi(d.content.elder) } : {}),
    },
    receipt: d.receipt ?? null,
    created_at: d.createdAt,
  };
}

/** 服务端诊断记录 → 前端领域模型（id 沿用 client_ref，跨浏览器一致） */
export function fromApiDiagnosis(c: CloudDiagnosisRecord): Diagnosis {
  const standard = c.content?.standard
    ? contentFromApi(c.content.standard)
    : { ...EMPTY_CONTENT };
  const elder = c.content?.elder ? contentFromApi(c.content.elder) : undefined;
  return {
    id: c.client_ref,
    serverId: c.id,
    deviceId: c.device_id,
    deviceName: c.device_name,
    category: (c.category ?? null) as DiagnoseCategory | null,
    symptom: c.symptom,
    description: c.description,
    createdAt: c.created_at,
    source: c.source,
    model: c.ai_model,
    qa: c.qa.map((q) => ({
      questionId: q.question_id,
      questionText: q.question_text,
      answer: q.answer,
      unknown: q.unknown,
    })),
    content: { standard, ...(elder ? { elder } : {}) },
    riskLevel: c.risk_level,
    conclusion: standard.conclusion,
    possibleCauses: standard.possibleCauses,
    evidence: standard.evidence,
    suggestions: standard.suggestions,
    tips: standard.tips,
    riskNote: standard.riskNote,
    status: "completed",
    cloud: true,
    verified: c.verified,
    imported: c.imported,
    saveStatus: "saved",
  };
}

/** 前端维修记录 → 服务端保存载荷 */
export function toApiRepair(r: RepairRecord): CloudRepairPayload {
  return {
    client_ref: r.id,
    device_id: r.deviceId > 0 ? r.deviceId : null,
    device_name: r.deviceName,
    diagnosis_ref: r.diagnosisId,
    fault_description: r.faultDescription,
    repair_method: r.repairMethod,
    repair_time: r.repairTime ? r.repairTime.slice(0, 10) : null,
    technician: r.technician,
    cost: r.cost,
    status: r.status,
    images: r.images,
    verification_status: r.verificationStatus,
    created_at: r.createdAt,
  };
}

/** 服务端维修记录 → 前端领域模型 */
export function fromApiRepair(c: CloudRepairRecord): RepairRecord {
  return {
    id: c.client_ref,
    serverId: c.id,
    deviceId: c.device_id ?? 0,
    deviceName: c.device_name,
    diagnosisId: c.diagnosis_ref,
    diagnosisSource:
      (c.diagnosis_source as RepairRecord["diagnosisSource"]) || "none",
    createdAt: c.created_at,
    repairTime: c.repair_time,
    faultDescription: c.fault_description,
    repairMethod: c.repair_method,
    technician: c.technician,
    cost: c.cost,
    status: c.status,
    images: c.images,
    verificationStatus: c.verification_status,
    cloud: true,
    imported: c.imported,
    saveStatus: "saved",
  };
}
