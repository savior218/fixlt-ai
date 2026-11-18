import type { ReactNode } from "react";

/** 统一状态徽章（TASK-06）：覆盖设备 / 诊断 / 维修全流程十种状态 */
export type Status =
  // 设备状态
  | "normal" // 运行正常
  | "identified" // 已识别设备
  // 诊断状态
  | "processing" // AI 分析中
  | "pending" // 待处理
  | "failed" // 诊断失败
  // 维修结果
  | "recovered" // 已修复
  | "partial" // 部分修复
  // 风险等级（SAFE-001）
  | "lowRisk"
  | "mediumRisk"
  | "highRisk";

const STATUS_META: Record<Status, { label: string; dot: string; className: string }> = {
  normal: {
    label: "运行正常",
    dot: "bg-risk-low",
    className: "bg-risk-low-bg text-risk-low-deep border-risk-low-border",
  },
  identified: {
    label: "已识别",
    dot: "bg-brand-500",
    className: "bg-brand-50 text-brand-700 border-brand-200",
  },
  processing: {
    label: "分析中",
    dot: "bg-brand-500 animate-pulse",
    className: "bg-brand-50 text-brand-700 border-brand-200",
  },
  recovered: {
    label: "已修复",
    dot: "bg-risk-low",
    className: "bg-risk-low-bg text-risk-low-deep border-risk-low-border",
  },
  partial: {
    label: "部分改善",
    dot: "bg-risk-medium",
    className: "bg-risk-medium-bg text-risk-medium-deep border-risk-medium-border",
  },
  pending: {
    label: "待处理",
    dot: "bg-slate-400",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
  failed: {
    label: "失败",
    dot: "bg-risk-high",
    className: "bg-risk-high-bg text-risk-high-deep border-risk-high-border",
  },
  lowRisk: {
    label: "低风险",
    dot: "bg-risk-low",
    className: "bg-risk-low-bg text-risk-low-deep border-risk-low-border",
  },
  mediumRisk: {
    label: "中风险",
    dot: "bg-risk-medium",
    className: "bg-risk-medium-bg text-risk-medium-deep border-risk-medium-border",
  },
  highRisk: {
    label: "高风险",
    dot: "bg-risk-high",
    className: "bg-risk-high-bg text-risk-high-deep border-risk-high-border",
  },
};

export default function StatusBadge({
  status,
  prefix,
}: {
  status: Status;
  prefix?: ReactNode;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {prefix}
      {meta.label}
    </span>
  );
}

export const STATUS_LABELS = Object.fromEntries(
  (Object.keys(STATUS_META) as Status[]).map((k) => [k, STATUS_META[k].label])
) as Record<Status, string>;
