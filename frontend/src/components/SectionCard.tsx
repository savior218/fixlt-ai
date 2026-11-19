import type { ReactNode } from "react";

interface SectionCardProps {
  title?: string;
  /** 标题左侧图标 */
  icon?: ReactNode;
  /** 标题右侧操作区 */
  action?: ReactNode;
  children: ReactNode;
  /** 是否显示边框（默认 true） */
  bordered?: boolean;
  /** 内边距：紧凑 / 标准 / 宽松（默认 md） */
  padding?: "none" | "sm" | "md";
  /** 圆角档位（默认 lg = rounded-2xl） */
  radius?: "md" | "lg";
  /** 是否显示阴影（默认 true） */
  shadow?: boolean;
  /** 追加到 section 的类名 */
  className?: string;
}

const PADDING_CLASSES = {
  none: "p-0",
  sm: "p-3",
  md: "p-4",
} as const;

const RADIUS_CLASSES = {
  md: "rounded-xl",
  lg: "rounded-2xl",
} as const;

/** 通用卡片容器（TASK-05）：统一 title/icon/边框/内边距/圆角/阴影 */
export default function SectionCard({
  title,
  icon,
  action,
  children,
  bordered = true,
  padding = "md",
  radius = "lg",
  shadow = true,
  className,
}: SectionCardProps) {
  return (
    <section
      className={[
        "bg-surface",
        bordered ? "border border-stone-200" : "border border-transparent",
        shadow ? "shadow-card" : "",
        PADDING_CLASSES[padding],
        RADIUS_CLASSES[radius],
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
            {icon && <span className="text-brand-600">{icon}</span>}
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
