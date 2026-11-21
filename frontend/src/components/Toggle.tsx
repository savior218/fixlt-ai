﻿/** 开关控件：语音/自动朗读等偏好（PRD 第 8 章） */
export default function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-stone-800">{label}</span>
        {description && <span className="block text-xs text-stone-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-brand-600 bg-brand-600" : "border-stone-300 bg-stone-200",
        ].join(" ")}
      >
        <span
          aria-hidden
          className={[
            "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[1.5rem]" : "translate-x-[0.25rem]",
          ].join(" ")}
        />
      </button>
    </div>
  );
}
