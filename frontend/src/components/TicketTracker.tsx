import { Check } from "lucide-react";

import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_ORDER,
  type TicketStatus,
} from "../services/api";

/** 报修工单状态跟踪条（模块②）：待受理 → 已受理 → 维修中 → 已完成 */
export default function TicketTracker({
  status,
  compact = false,
}: {
  status: TicketStatus;
  /** compact：窄容器（如报修助手内嵌）使用更小字号 */
  compact?: boolean;
}) {
  const currentIdx = TICKET_STATUS_ORDER.indexOf(status);

  return (
    <ol className="flex items-center" aria-label="工单状态进度">
      {TICKET_STATUS_ORDER.map((s, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                aria-current={current ? "step" : undefined}
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                  done
                    ? "border-risk-low bg-risk-low text-white"
                    : current
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-stone-300 bg-surface text-stone-400",
                ].join(" ")}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={[
                  "whitespace-nowrap font-medium",
                  compact ? "text-[11px]" : "text-xs",
                  done || current ? "text-stone-800" : "text-stone-400",
                ].join(" ")}
              >
                {TICKET_STATUS_LABELS[s]}
              </span>
            </div>
            {i < TICKET_STATUS_ORDER.length - 1 && (
              <span
                aria-hidden
                className={[
                  "mx-1.5 mb-4 h-0.5 flex-1 rounded",
                  i < currentIdx ? "bg-risk-low" : "bg-stone-200",
                ].join(" ")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
