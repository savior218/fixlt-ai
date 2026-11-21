import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  Loader2,
  Square,
  Stethoscope,
  Volume2,
} from "lucide-react";

import {
  unreadCount,
  useNotificationStore,
  type NotificationType,
} from "../stores/notifications";
import { usePrefs } from "../stores/prefs";
import { speak, stopSpeech, useSpeech } from "../services/speech";
import { isWeChatBrowser } from "../utils/platform";
import { relativeTime } from "../utils/format";
import { useToast } from "./Toast";

/** 通知类型 → 图标 / 配色 / 标签（通知面板与弹窗共用） */
export const TYPE_META: Record<
  NotificationType,
  { icon: typeof Bell; cls: string; label: string }
> = {
  diagnosis: { icon: Stethoscope, cls: "bg-brand-50 text-brand-700", label: "诊断" },
  risk: { icon: AlertTriangle, cls: "bg-risk-high-bg text-risk-high", label: "告警" },
  ticket: { icon: ClipboardList, cls: "bg-stone-100 text-stone-600", label: "报修" },
  maintenance: { icon: CalendarClock, cls: "bg-emerald-50 text-emerald-700", label: "保养" },
};

/** 通知中心铃铛（模块⑤）：未读徽标 + 下拉面板 + 全部已读 */
export default function NotificationBell() {
  const items = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const markRead = useNotificationStore((s) => s.markRead);
  const doNotDisturb = usePrefs((s) => s.doNotDisturb);
  const { notify } = useToast();
  const speechSupported = useSpeech((s) => s.supported);
  const speechStatus = useSpeech((s) => s.status);
  const speechActiveKey = useSpeech((s) => s.activeKey);
  const speechLoading = useSpeech((s) => s.loading);

  const [open, setOpen] = useState(false);

  /** 朗读单条通知：再次点击同一条则停止 */
  function readNotification(id: string, title: string, body: string) {
    const key = `notification:${id}`;
    if (speechStatus === "speaking" && speechActiveKey === key) {
      stopSpeech();
      return;
    }
    if (!speak({ key, text: `${title}。${body}` })) {
      const err = useSpeech.getState().error;
      if (err) notify(err, "error");
    }
  }
  const [ringing, setRinging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const unread = unreadCount(items);

  /* 新通知到达 → 铃铛摆动两轮（免打扰 / 面板打开时不摆） */
  const prevCountRef = useRef(items.length);
  useEffect(() => {
    const arrived = items.length > prevCountRef.current;
    prevCountRef.current = items.length;
    if (!arrived || doNotDisturb) return;
    setRinging(true);
    const t = window.setTimeout(() => setRinging(false), 1400);
    return () => window.clearTimeout(t);
  }, [items, doNotDisturb]);

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
        className={[
          "bell-swing-trigger relative rounded-lg p-2.5 transition-colors",
          "text-stone-500 hover:bg-brand-50 hover:text-brand-700",
          open ? "bg-brand-50 text-brand-700" : "",
          ringing ? "bell-ringing" : "",
        ].join(" ")}
      >
        <Bell className="bell-swing h-5 w-5" />
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
          className="notification-panel overflow-hidden rounded-2xl border border-stone-200 bg-surface shadow-lg"
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
                  诊断完成、高风险告警、报修流程变化、保养到期时会在这里提醒您
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-100">
                {items.map((n) => {
                  const meta = TYPE_META[n.type];
                  const Icon = meta.icon;
                  const speaking =
                    speechStatus === "speaking" && speechActiveKey === `notification:${n.id}`;
                  return (
                    <li key={n.id} className="flex items-start">
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className={[
                          "flex min-w-0 flex-1 items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-stone-50",
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
                      {speechSupported && (
                        <button
                          type="button"
                          onClick={() => readNotification(n.id, n.title, n.body)}
                          aria-label={speaking ? "停止朗读该通知" : "朗读该通知"}
                          aria-pressed={speaking}
                          className="mr-1 mt-1.5 shrink-0 rounded-lg p-2 text-stone-400 transition-colors hover:bg-brand-50 hover:text-brand-700"
                        >
                          {speaking ? (
                            speechLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {!speechSupported && (
            <p className="border-t border-stone-100 px-4 py-2 text-[11px] leading-relaxed text-stone-400">
              {isWeChatBrowser()
                ? "微信内置浏览器当前无法播放语音，请点右上角「…」→「在浏览器打开」后重试。"
                : "当前环境不支持语音播放，文字内容仍可正常查看。"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
