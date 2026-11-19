import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 border-transparent",
  secondary:
    "bg-stone-200 text-stone-700 border-transparent hover:bg-stone-300",
  outline:
    "bg-surface text-stone-700 border-stone-300 hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700",
  danger: "bg-red-600 text-white hover:bg-red-700 border-transparent",
  ghost: "bg-transparent text-brand-700 border-transparent hover:bg-brand-50",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

/** 生成按钮样式类（也可用于 <Link className={buttonClass(...)}>） */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md"
): string {
  return [
    "inline-flex items-center justify-center gap-1.5 rounded-xl border font-medium",
    "min-h-9 transition-all disabled:cursor-not-allowed disabled:opacity-50",
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
