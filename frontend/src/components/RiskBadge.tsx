import type { ReactNode } from "react";

/** 风险等级（PRD SAFE-001）：低/中/高/待评估 */
export type RiskLevel = "low" | "medium" | "high" | "unknown";

const RISK_META: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "低风险", className: "bg-risk-low-bg text-risk-low-deep border-risk-low-border" },
  medium: { label: "中风险", className: "bg-risk-medium-bg text-risk-medium-deep border-risk-medium-border" },
  high: { label: "高风险", className: "bg-risk-high-bg text-risk-high-deep border-risk-high-border" },
  unknown: { label: "待评估", className: "bg-stone-100 text-stone-600 border-stone-300" },
};

export default function RiskBadge({
  level,
  prefix,
}: {
  level: RiskLevel;
  prefix?: ReactNode;
}) {
  const meta = RISK_META[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}
    >
      {prefix}
      {meta.label}
    </span>
  );
}

export const RISK_LABELS = Object.fromEntries(
  (Object.keys(RISK_META) as RiskLevel[]).map((k) => [k, RISK_META[k].label])
) as Record<RiskLevel, string>;
