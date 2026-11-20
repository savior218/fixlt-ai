﻿import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon = "🗂️",
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-surface px-4 py-10 text-center">
      <p aria-hidden className="text-3xl">
        {icon}
      </p>
      <p className="mt-2 text-sm font-medium text-stone-700">{title}</p>
      {description && (
        <p data-elder="hide" className="mt-1 text-xs text-stone-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
