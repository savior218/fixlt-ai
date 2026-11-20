import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { TYPE_META } from "./NotificationBell";
import { useNotificationStore } from "../stores/notifications";
import { usePrefs } from "../stores/prefs";
import { relativeTime } from "../utils/format";
import { playNotificationSound } from "../utils/notificationSound";

const AUTO_CLOSE_MS = 4500;
const MAX_VISIBLE = 1;

/**
 * 新消息弹窗 + 声音提醒（右下角）：通知入列即弹出并播放提示音，自动消失。
 * 免打扰开启时不弹窗、不出声（队列静默清空），仅保留铃铛未读小红点。
 */
export default function NotificationPopup() {
  const queue = useNotificationStore((s) => s.popupQueue);
  const popPopup = useNotificationStore((s) => s.popPopup);
  const markRead = useNotificationStore((s) => s.markRead);
  const doNotDisturb = usePrefs((s) => s.doNotDisturb);

  const visible = queue.slice(-MAX_VISIBLE);

  /* 新通知入列且未开免打扰 → 播放提示音 */
  const prevCountRef = useRef(queue.length);
  useEffect(() => {
    const grew = queue.length > prevCountRef.current;
    prevCountRef.current = queue.length;
    if (grew && !doNotDisturb) playNotificationSound();
  }, [queue, doNotDisturb]);

  /* 自动消失；免打扰开启时静默清空队列 */
  useEffect(() => {
    if (doNotDisturb) {
      queue.forEach((n) => popPopup(n.id));
      return;
    }
    // 超出可见数量的旧通知直接出队，避免队列堆积
    queue.slice(0, -MAX_VISIBLE).forEach((n) => popPopup(n.id));
    const timers = visible.map((n) =>
      window.setTimeout(() => popPopup(n.id), AUTO_CLOSE_MS),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // visible 依赖 queue 变化即可
  }, [queue, doNotDisturb, popPopup]); // eslint-disable-line react-hooks/exhaustive-deps

  if (doNotDisturb || visible.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {visible.map((n) => {
        const meta = TYPE_META[n.type];
        const Icon = meta.icon;
        return (
          <div
            key={n.id}
            role="alert"
            className="toast-item pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-stone-200 bg-surface p-3.5 shadow-lg"
          >
            <span
              aria-hidden
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.cls}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <button
              type="button"
              onClick={() => {
                markRead(n.id);
                popPopup(n.id);
              }}
              className="min-w-0 flex-1 text-left"
              aria-label="点击标记已读并关闭"
            >
              <p className="truncate text-sm font-semibold text-stone-900">
                {n.title}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-stone-500">
                {n.body}
              </p>
              <p className="mt-1 text-[11px] text-stone-400">
                {meta.label} · {relativeTime(n.createdAt)}
              </p>
            </button>
            <button
              type="button"
              onClick={() => popPopup(n.id)}
              aria-label="关闭提醒"
              className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
