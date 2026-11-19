﻿import { useId } from "react";
import { Search } from "lucide-react";

/** 统一输入控件（TASK-08）：text / textarea / search 三种模式 */
export default function InputField({
  label,
  description,
  required,
  error,
  disabled,
  mode = "text",
  type = "text",
  rows = 3,
  maxLength,
  placeholder,
  value,
  onChange,
}: {
  label?: string;
  /** 输入框下方的辅助说明 */
  description?: string;
  /** 必填星号标记 */
  required?: boolean;
  /** 错误提示（红色文字 + 红色边框） */
  error?: string;
  disabled?: boolean;
  /** text 单行 / textarea 多行 / search 搜索 */
  mode?: "text" | "textarea" | "search";
  /** 单行输入类型（登录密码等） */
  type?: "text" | "password";
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const baseClass = [
    "w-full rounded-lg border px-3 py-2 text-sm transition-colors",
    "placeholder:text-stone-400 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400",
    error
      ? "border-red-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
      : "border-stone-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
  ].join(" ");

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}

      {mode === "search" ? (
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
          />
          <input
            id={id}
            type="search"
            disabled={disabled}
            maxLength={maxLength}
            placeholder={placeholder ?? "搜索…"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseClass} pl-9`}
          />
        </div>
      ) : mode === "textarea" ? (
        <textarea
          id={id}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseClass} resize-y`}
        />
      ) : (
        <input
          id={id}
          type={type}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        />
      )}

      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : description ? (
        <p className="mt-1 text-xs text-stone-500">{description}</p>
      ) : null}

      {maxLength && mode === "textarea" && !error && !description && (
        <p className="mt-1 text-right text-xs text-stone-400">
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  );
}
