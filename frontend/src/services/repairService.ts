/* ============================================================
   维修记录服务（阶段四 · Mock 阶段本地数据）
   P4 维修档案 / P7 设备详情 / P8 维修历史共用 repairStore
   ============================================================ */

import type { Diagnosis, Tone } from "../types/diagnosis";
import type { RepairRecord, RepairStats } from "../types/repair";
import { shortId } from "../utils/format";
import { contentFor } from "../utils/diagnosis";

/** 从诊断结果生成维修记录（P2「保存维修记录」；语气跟随当前模式但事实一致） */
export function createRecordFromDiagnosis(
  diagnosis: Diagnosis,
  tone: Tone = "standard"
): RepairRecord {
  const content = contentFor(diagnosis, tone).content;
  return {
    id: shortId("rep"),
    deviceId: diagnosis.deviceId ?? 0,
    deviceName: diagnosis.deviceName ?? "未关联设备",
    diagnosisId: diagnosis.id,
    diagnosisSource: diagnosis.source,
    createdAt: new Date().toISOString(),
    repairTime: null,
    faultDescription: [
      diagnosis.symptom,
      diagnosis.description.trim() ? `描述：${diagnosis.description.trim()}` : "",
    ]
      .filter(Boolean)
      .join("；"),
    repairMethod: content.suggestions
      .map((s, i) => `${i + 1}. ${s.title}：${s.description}`)
      .join("\n"),
    technician: null,
    cost: null,
    status: "pending",
    images: [],
    verificationStatus: "unverified",
  };
}

/** 手动新建维修记录（P4） */
export interface ManualRecordInput {
  deviceId: number;
  deviceName: string;
  faultDescription: string;
  repairMethod: string;
  repairTime?: string | null;
  technician?: string | null;
  cost?: number | null;
  status?: RepairRecord["status"];
}

export function createManualRecord(input: ManualRecordInput): RepairRecord {
  return {
    id: shortId("rep"),
    diagnosisId: null,
    diagnosisSource: "none",
    createdAt: new Date().toISOString(),
    images: [],
    verificationStatus: "unverified",
    repairTime: null,
    technician: null,
    cost: null,
    status: "pending",
    ...input,
  };
}

/** 维修档案统计（P4 顶部卡片） */
export function computeStats(records: RepairRecord[]): RepairStats {
  const recovered = records.filter((r) => r.verificationStatus === "recovered").length;
  const unverified = records.filter((r) => r.verificationStatus === "unverified").length;

  // 平均维修间隔：按创建时间正序，相邻记录间隔的平均天数
  let avgIntervalDays: number | null = null;
  if (records.length >= 2) {
    const times = records
      .map((r) => new Date(r.createdAt).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);
    if (times.length >= 2) {
      let sum = 0;
      for (let i = 1; i < times.length; i++) sum += times[i] - times[i - 1];
      avgIntervalDays = Math.round(sum / (times.length - 1) / 86_400_000);
    }
  }

  return { total: records.length, recovered, unverified, avgIntervalDays };
}

/** 平均间隔展示："约 6 个月" / "约 12 天" / "—" */
export function avgIntervalLabel(stats: RepairStats): string {
  if (stats.avgIntervalDays == null) return "—";
  if (stats.avgIntervalDays >= 60) return `约 ${Math.round(stats.avgIntervalDays / 30)} 个月`;
  return `约 ${stats.avgIntervalDays} 天`;
}
