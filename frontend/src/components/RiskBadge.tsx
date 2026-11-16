import type { ReactNode } from "react";

/** 风险等级（PRD SAFE-001）：低/中/高/待评估 */
export type RiskLevel = "low" | "medium" | "high" | "unknown";

const RISK_META: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "低风险", className: "bg-green-100 text-green-800 border-green-300" },
  medium: { label: "中风险", className: "bg-amber-100 text-amber-800 border-amber-300" },
  high: { label: "高风险", className: "bg-red-100 text-red-800 border-red-300" },
  unknown: { label: "待评估", className: "bg-slate-100 text-slate-600 border-slate-300" },
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
