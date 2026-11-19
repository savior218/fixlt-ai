import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ClipboardList,
  Stethoscope,
} from "lucide-react";

import {
  unreadCount,
  useNotificationStore,
  type NotificationType,
} from "../stores/notifications";
import { relativeTime } from "../utils/format";

const TYPE_META: Record<
  NotificationType,
  { icon: typeof Bell; cls: string; label: string }
> = {
  diagnosis: { icon: Stethoscope, cls: "bg-brand-50 text-brand-700", label: "诊断" },
  risk: { icon: AlertTriangle, cls: "bg-risk-high-bg text-risk-high", label: "告警" },
  ticket: { icon: ClipboardList, cls: "bg-stone-100 text-stone-600", label: "工单" },
};

/** 通知中心铃铛（模块⑤）：未读徽标 + 下拉面板 + 全部已读 */
export default function NotificationBell() {
  const items = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const markRead = useNotificationStore((s) => s.markRead);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const unread = unreadCount(items);

  // 点击面板外 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "关闭通知面板" : "打开通知面板"}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-700"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-risk-high px-1 text-[10px] font-bold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="通知中心"
          className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-stone-200 bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-stone-900">通知中心</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-brand-700 hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> 全部已读
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell aria-hidden className="mx-auto h-8 w-8 text-stone-300" />
                <p className="mt-2 text-sm text-stone-400">暂无通知</p>
                <p className="mt-0.5 text-xs text-stone-300">
                  诊断完成、高风险告警、工单状态变化时会在这里提醒您
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-100">
                {items.map((n) => {
                  const meta = TYPE_META[n.type];
                  const Icon = meta.icon;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className={[
                          "flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-stone-50",
                          n.read ? "opacity-70" : "",
                        ].join(" ")}
                      >
                        <span
                          aria-hidden
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.cls}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-stone-900">
                              {n.title}
                            </span>
                            {!n.read && (
                              <span
                                aria-label="未读"
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-risk-high"
                              />
                            )}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-stone-500">
                            {n.body}
                          </span>
                          <span className="mt-1 block text-[11px] text-stone-400">
                            {meta.label} · {relativeTime(n.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
