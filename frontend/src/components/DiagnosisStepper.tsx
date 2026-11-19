import { Check } from "lucide-react";

/** 诊断流程默认四步（PRD 6.x） */
export const DEFAULT_DIAGNOSIS_STEPS = [
  "选择设备",
  "描述故障",
  "AI 问诊",
  "查看结果",
] as const;

/** 诊断流程步骤条（TASK-13）：设备选择 → 描述故障 → AI 问诊 → 查看结果 */
export default function DiagnosisStepper({
  current,
  steps = DEFAULT_DIAGNOSIS_STEPS,
}: {
  /** 当前步骤（0 起）；等于 steps.length 表示全部完成 */
  current: number;
  steps?: readonly string[];
}) {
  const total = steps.length;
  const allDone = current >= total;
  // 移动端：当前步（0 起计为第 current+1 步）；全部完成时显示总步数
  const currentStepNo = allDone ? total : current + 1;

  return (
    <div>
      {/* 手机 / 平板窄屏：紧凑单行（当前步骤 + 进度条），四个完整步骤不挤在一行 */}
      <div className="sm:hidden" aria-label="诊断流程进度">
        <div className="flex items-center justify-between gap-2">
          <span
            aria-current={allDone ? undefined : "step"}
            className={`flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
              allDone ? "bg-brand-50 text-brand-700" : "bg-brand-600 text-white"
            }`}
          >
            {allDone ? (
              <Check aria-hidden className="h-4 w-4 shrink-0" />
            ) : (
              <span
                aria-hidden
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs"
              >
                {currentStepNo}
              </span>
            )}
            <span className="truncate">
              {allDone ? "诊断完成" : `第 ${currentStepNo} 步 · ${steps[current]}`}
            </span>
          </span>
          <span className="shrink-0 text-xs text-stone-400">
            {Math.min(current, total)}/{total}
          </span>
        </div>
        <div
          aria-hidden
          className="mt-2 h-1.5 w-full rounded-full bg-stone-200"
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-300"
            style={{ width: `${(Math.min(current, total) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* 平板横屏 / 桌面（≥sm）：完整四步步骤条 */}
      <ol
        className="-mx-1 hidden items-center gap-1 px-1 sm:flex"
        aria-label="诊断流程进度"
      >
      {steps.map((label, i) => {
        const done = i < current; // 已完成
        const active = i === current; // 进行中
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1">
            <span
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
                done
                  ? "bg-brand-50 text-brand-700"
                  : active
                    ? "bg-brand-600 text-white"
                    : "bg-surface text-stone-400 ring-1 ring-stone-200"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  done
                    ? "bg-brand-600 text-white"
                    : active
                      ? "bg-white/20 text-white"
                      : "bg-stone-100 text-stone-400"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{label}</span>
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={`h-0.5 flex-1 rounded-full ${done ? "bg-brand-200" : "bg-stone-200"}`}
              />
            )}
          </li>
        );
      })}
      </ol>
    </div>
  );
}
