import { create } from "zustand";
import { persist } from "zustand/middleware";

import { shortId } from "../utils/format";

/** 通知类型（模块⑤）：诊断完成 / 高风险告警 / 工单状态变化 */
export type NotificationType = "diagnosis" | "risk" | "ticket";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

interface NotificationState {
  items: AppNotification[];
  /** 新增通知（置顶，最多保留 50 条） */
  add: (n: { type: NotificationType; title: string; body: string }) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      items: [],
      add: ({ type, title, body }) =>
        set((s) => ({
          items: [
            {
              id: shortId("ntf"),
              type,
              title,
              body,
              createdAt: new Date().toISOString(),
              read: false,
            },
            ...s.items,
          ].slice(0, 50),
        })),
      markAllRead: () =>
        set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
      markRead: (id) =>
        set((s) => ({
          items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),
      clearAll: () => set({ items: [] }),
    }),
    { name: "fixitai-notifications" }
  )
);

/** 未读数（组件内用 selector 订阅） */
export function unreadCount(items: AppNotification[]): number {
  return items.filter((n) => !n.read).length;
}
