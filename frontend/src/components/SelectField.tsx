import { useId } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * 统一选择控件：与 InputField 同一套圆角、边框、焦点样式。
 * 使用 appearance-none + 自绘箭头，避免各浏览器原生 select 箭头/焦点圈样式不一致。
 */
export default function SelectField({
  label,
  required,
  description,
  error,
  disabled,
  placeholder = "请选择",
  value,
  onChange,
  options,
}: {
  label?: string;
  /** 必填星号标记 */
  required?: boolean;
  /** 选择框下方的辅助说明 */
  description?: string;
  error?: string;
  disabled?: boolean;
  /** 空值时的占位文案 */
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
}) {
  const id = useId();
  const baseClass = [
    "w-full appearance-none rounded-lg border py-2 pl-3 pr-9 text-sm transition-colors",
    // 屏蔽浏览器默认的粗焦点圈，改用与输入框一致的描边
    "focus:outline-none focus-visible:outline-none focus:ring-2",
    disabled
      ? "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400"
      : "border-stone-300",
    error
      ? "border-red-400 focus:border-red-500 focus:ring-red-100"
      : "focus:border-brand-500 focus:ring-brand-100",
    value ? "text-stone-800" : "text-stone-400",
  ].join(" ");

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
            disabled ? "text-stone-300" : "text-stone-400"
          }`}
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : description ? (
        <p data-elder="hide" className="mt-1 text-xs text-stone-500">
          {description}
        </p>
      ) : null}
    </div>
  );
}
