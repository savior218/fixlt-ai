/** 维修记录状态 */
export type RepairStatus = "pending" | "recovered" | "partial" | "failed";

/** 维修结果验证（P4 四选一） */
export type VerificationStatus =
  | "unverified" // 暂未验证
  | "recovered" // 已恢复
  | "partial" // 部分恢复
  | "notRecovered" // 未恢复
  | "unknown"; // 暂无法确认

/** 维修记录（P4 维修档案 / P7 设备详情 / P8 维修历史共用） */
export interface RepairRecord {
  id: string;
  /** 本地数据归属：user:<id> 或 local（旧记录 / 游客本机历史） */
  ownerKey?: string;
  deviceId: number;
  deviceName: string;
  /** 关联诊断 ID（手动添加时可为空） */
  diagnosisId: string | null;
  /** 关联诊断的内容来源（模板记录保存后仍保留来源标识；旧记录为空） */
  diagnosisSource?: "ai" | "template" | "unknown" | "none" | null;
  /** 创建时间 ISO */
  createdAt: string;
  /** 实际维修时间 */
  repairTime: string | null;
  faultDescription: string;
  repairMethod: string;
  technician: string | null;
  cost: number | null;
  status: RepairStatus;
  images: string[];
  verificationStatus: VerificationStatus;
}

/** 维修档案统计（P4 顶部卡片，从 repairStore 计算） */
export interface RepairStats {
  /** 累计维修 */
  total: number;
  /** 已恢复 */
  recovered: number;
  /** 待验证 */
  unverified: number;
  /** 平均维修间隔（天；不足两条记录时为 null） */
  avgIntervalDays: number | null;
}

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified: "待验证",
  recovered: "已恢复",
  partial: "部分恢复",
  notRecovered: "未恢复",
  unknown: "暂无法确认",
};

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  pending: "待处理",
  recovered: "已恢复",
  partial: "部分改善",
  failed: "未解决",
};
