﻿﻿﻿import type { ReactNode } from "react";

interface EmptyStateProps {
  /** 传 null 表示不显示图标 */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** 按场景覆盖标题样式（颜色、字重等，如空内容用浅灰常规字重） */
  titleClassName?: string;
  /** 按场景覆盖操作区与文案的间距 */
  actionClassName?: string;
}

export default function EmptyState({
  icon = "🗂️",
  title,
  description,
  action,
  titleClassName,
  actionClassName = "mt-4",
}: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-surface px-4 py-10 text-center">
      {icon !== null && (
        <p aria-hidden className="text-3xl">
          {icon}
        </p>
      )}
      <p className={`${icon !== null ? "mt-2 " : ""}text-sm ${titleClassName ?? "font-medium text-stone-700"}`}>{title}</p>
      {description && (
        <p data-elder="hide" className="mt-1 text-xs text-stone-500">{description}</p>
      )}
      {action && <div className={actionClassName}>{action}</div>}
    </div>
  );
}
