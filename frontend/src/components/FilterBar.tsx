﻿﻿﻿import { RotateCcw } from "lucide-react";

import InputField from "./InputField";

/** 下拉筛选项定义 */
export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelect {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
}

/** 筛选栏（TASK-14）：关键词搜索 + 任意组下拉筛选 + 重置 */
export default function FilterBar({
  keyword,
  onKeywordChange,
  filters = [],
  onReset,
  searchPlaceholder = "搜索关键词…",
}: {
  keyword: string;
  onKeywordChange: (v: string) => void;
  /** 下拉筛选组（设备类型 / 状态 / 时间等） */
  filters?: FilterSelect[];
  /** 重置全部筛选条件 */
  onReset: () => void;
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-surface p-4 shadow-card">
      {/* 搜索框：移动端占满整行 */}
      <div className="w-full sm:min-w-48 sm:w-auto sm:flex-1">
        <InputField
          mode="search"
          value={keyword}
          onChange={onKeywordChange}
          placeholder={searchPlaceholder}
        />
      </div>

      {filters.map((f) => (
        <label key={f.label} className="block w-full text-sm sm:w-auto">
          {f.label && (
            <span className="mb-1 block font-medium text-stone-700">{f.label}</span>
          )}
          <select
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            className="w-full rounded-lg border border-stone-300 bg-surface px-3 py-2 text-sm text-stone-700 transition-colors hover:border-brand-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:w-auto"
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      <button
        type="button"
        onClick={onReset}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-surface px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 sm:w-auto"
      >
        <RotateCcw aria-hidden className="h-4 w-4" />
        重置
      </button>
    </div>
  );
}
