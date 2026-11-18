import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 border-transparent",
  secondary:
    "bg-white text-slate-700 border-slate-300 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 border-transparent",
  ghost: "bg-transparent text-brand-700 border-transparent hover:bg-brand-50",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  // md/lg 保证触屏主要操作高度 ≥44 CSS px（三端适配）
  md: "px-4 py-2 text-sm min-h-11",
  lg: "px-5 py-3 text-base min-h-11",
};

/** 生成按钮样式类（也可用于 <Link className={buttonClass(...)}>） */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md"
): string {
  return [
    "inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium",
    "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
  ].join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type="button" className={`${buttonClass(variant, size)} ${className ?? ""}`} {...rest}>
      {children}
    </button>
  );
}
