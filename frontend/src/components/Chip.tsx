import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  children: ReactNode;
}

/** 快速选择项：诊断多轮交互中的结构化选项（PRD 6.4） */
export default function Chip({ selected, children, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={[
        "chip inline-flex items-center rounded-full border px-4 py-2 text-sm transition-colors",
        selected
          ? "border-brand-600 bg-brand-50 font-medium text-brand-800"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
        className ?? "",
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
