import { useEffect, useState } from "react";

import { getHealth, type HealthInfo } from "../services/api";
import { usePrefs, type FontScale } from "../stores/prefs";

const FONT_OPTIONS: { value: FontScale; label: string }[] = [
  { value: "normal", label: "标准" },
  { value: "large", label: "大" },
  { value: "xlarge", label: "特大" },
];

function Toggle({
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
  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors before:block before:h-5 before:w-5 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-cyan-600 checked:before:translate-x-[1.375rem]"
      />
    </label>
  );
}

export default function Settings() {
  const prefs = usePrefs();
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((e: Error) => setHealthError(e.message));
  }, []);

  return (
    <div>
      <h1 className="mb-5 text-lg font-bold">设置</h1>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">交互模式</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={prefs.mode === "standard"}
            onClick={() => prefs.setMode("standard")}
            className={[
              "rounded-xl border p-3 text-left text-sm",
              prefs.mode === "standard"
                ? "border-cyan-600 bg-cyan-50 font-medium"
                : "border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            标准模式
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              常规字号 · 图文结合
            </span>
          </button>
          <button
            type="button"
            aria-pressed={prefs.mode === "elder"}
            onClick={() => prefs.setMode("elder")}
            className={[
              "rounded-xl border p-3 text-left text-sm",
              prefs.mode === "elder"
                ? "border-amber-500 bg-amber-50 font-medium"
                : "border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            长辈关怀模式
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              大字体 · 大按钮 · 通俗表达
            </span>
          </button>
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          视障辅助、听障辅助、操作辅助模式为 V1.1 规划（PRD 8 章），首版已纳入基础架构兼容性设计。
        </p>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">显示与语音</h2>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium">字体大小</span>
          <div className="flex gap-1" role="group" aria-label="字体大小">
            {FONT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={prefs.fontScale === opt.value}
                onClick={() => prefs.setFontScale(opt.value)}
                className={[
                  "rounded-lg border px-3 py-1.5 text-sm",
                  prefs.fontScale === opt.value
                    ? "border-cyan-600 bg-cyan-50 font-medium text-cyan-800"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          <Toggle
            label="语音朗读"
            description="AI 回复自动转为语音播报"
            checked={prefs.voiceEnabled}
            onChange={prefs.setVoiceEnabled}
          />
          <Toggle
            label="高对比度"
            description="增强文字与背景对比，更易辨认"
            checked={prefs.highContrast}
            onChange={prefs.setHighContrast}
          />
          <Toggle
            label="减少动画"
            description="关闭过渡与动效，降低干扰"
            checked={prefs.reduceMotion}
            onChange={prefs.setReduceMotion}
          />
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">服务状态</h2>
        {health ? (
          <p className="text-sm text-green-700">
            ✅ 后端已连接 · {health.app} v{health.version}
          </p>
        ) : healthError ? (
          <p className="text-sm text-amber-700">
            ⚠️ 后端未连接（请启动 uvicorn）：{healthError}
          </p>
        ) : (
          <p className="text-sm text-slate-500">检测中…</p>
        )}
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">数据</h2>
        <button
          type="button"
          onClick={() => {
            prefs.reset();
            localStorage.removeItem("fixitai-prefs");
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          清除本机偏好设置
        </button>
      </section>

      <p className="px-1 text-xs leading-5 text-slate-400">
        智修AI V1.0 · 用户体系（USER-001）接入前以演示账号运行；账号注册登录、数据导出与删除将在后续版本提供。
      </p>
    </div>
  );
}
