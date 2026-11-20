﻿import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

import Toggle from "./Toggle";
import type { FontScale } from "../stores/prefs";

/* ============ 通用行容器 ============ */

/** 设置项行：label + description + 右侧控件 */
export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-stone-800">{label}</span>
        {description && (
          <span data-elder="hide" className="block text-xs text-stone-500">
            {description}
          </span>
        )}
      </span>
      {/* 移动端控件占满整行，桌面端靠右 */}
      <div className="w-full sm:w-auto sm:shrink-0">{children}</div>
    </div>
  );
}

/* ============ switch 开关 ============ */

export function SwitchControl({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return <Toggle label={label} description={description} checked={checked} onChange={onChange} />;
}

/* ============ radio 单选组 ============ */

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

export function RadioGroup({
  name,
  options,
  value,
  onChange,
}: {
  /** 同组单选的 name */
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div role="radiogroup" className="divide-y divide-stone-100">
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-start gap-3 py-3">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-brand-600"
          />
          <span>
            <span className="block text-sm font-medium text-stone-800">{o.label}</span>
            {o.description && (
              <span className="block text-xs text-stone-500">{o.description}</span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

/* ============ segmented 分段选择 ============ */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className="inline-flex max-w-full flex-wrap rounded-xl bg-stone-100 p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg font-medium transition-colors ${
              size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"
            } ${active ? "bg-surface text-brand-700 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============ slider 滑块 ============ */

export function SliderControl({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  minLabel,
  maxLabel,
  formatValue,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  minLabel?: string;
  maxLabel?: string;
  /** 当前值展示格式（如 "1.0x"） */
  formatValue?: (v: number) => string;
}) {
  return (
    <div className="py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-stone-800">{label}</span>
        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {minLabel && <span className="text-xs text-stone-400">{minLabel}</span>}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-stone-200 accent-brand-600"
          aria-label={label}
        />
        {maxLabel && <span className="text-xs text-stone-400">{maxLabel}</span>}
      </div>
    </div>
  );
}

/* ============ zoom 字号缩放 ============ */

const FONT_SCALE_META: Record<FontScale, { label: string; sample: string }> = {
  normal: { label: "标准", sample: "text-sm" },
  large: { label: "大", sample: "text-base" },
  xlarge: { label: "特大", sample: "text-lg" },
};

/** 三档字号缩放（标准 / 大 / 特大），对应 prefs.fontScale */
export function ZoomControl({
  value,
  onChange,
}: {
  value: FontScale;
  onChange: (v: FontScale) => void;
}) {
  const scales: FontScale[] = ["normal", "large", "xlarge"];
  const currentIndex = scales.indexOf(value);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="减小字号"
        disabled={currentIndex <= 0}
        onClick={() => onChange(scales[Math.max(0, currentIndex - 1)])}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-surface text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-1.5">
        {scales.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={value === s}
            onClick={() => onChange(s)}
            className={`rounded-lg border px-3 py-1.5 font-medium transition-colors ${
              value === s
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-stone-200 bg-surface text-stone-500 hover:bg-stone-50"
            } ${FONT_SCALE_META[s].sample}`}
          >
            A
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-label="增大字号"
        disabled={currentIndex >= scales.length - 1}
        onClick={() => onChange(scales[Math.min(scales.length - 1, currentIndex + 1)])}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-surface text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>

      <span className="w-10 text-center text-sm text-stone-500">
        {FONT_SCALE_META[value].label}
      </span>
    </div>
  );
}
