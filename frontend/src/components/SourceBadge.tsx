import { Bot, FlaskConical, HelpCircle } from "lucide-react";

import type { DiagnosisSource } from "../types/diagnosis";

/**
 * 内容来源标识：
 * - ai：真实模型生成
 * - template：用户主动选择的模板演示（非 AI）
 * - unknown：旧记录未保存来源，不能推断为真实 AI
 */
export default function SourceBadge({
  source,
  model,
  className = "",
}: {
  source: DiagnosisSource;
  model?: string | null;
  className?: string;
}) {
  const meta = {
    ai: {
      icon: Bot,
      label: "真实 AI 生成",
      detail: model ? `模型：${model}` : "由后端模型生成",
      cls: "border-brand-200 bg-brand-50 text-brand-800",
    },
    template: {
      icon: FlaskConical,
      label: "模板演示（非 AI）",
      detail: "由本地固定模板生成，仅用于离线演示",
      cls: "border-amber-300 bg-amber-50 text-amber-800",
    },
    unknown: {
      icon: HelpCircle,
      label: "来源未记录",
      detail: "该历史记录未保存内容来源，无法确认由何种方式生成",
      cls: "border-slate-300 bg-slate-100 text-slate-600",
    },
  }[source];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.cls} ${className}`}
      title={meta.detail}
      aria-label={`${meta.label}。${meta.detail}`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}
