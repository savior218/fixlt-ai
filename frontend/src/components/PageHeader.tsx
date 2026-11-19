import type { ReactNode } from "react";

/** 页面标题区：图标 + 标题 + 副标题 + 右侧操作（TASK-04） */
export default function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  action,
}: {
  title: string;
  subtitle?: string;
  /** 标题左侧图标（lucide 组件） */
  icon?: ReactNode;
  /** 右侧操作区（多个按钮） */
  actions?: ReactNode;
  /** 右侧操作区（单个节点，兼容旧用法） */
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="break-words text-xl font-bold text-stone-900">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
          )}
        </div>
      </div>
      {(actions ?? action) && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          {actions ?? action}
        </div>
      )}
    </div>
  );
}
