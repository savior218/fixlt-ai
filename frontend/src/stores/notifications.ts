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
  /** 待弹窗队列（新通知先入队；弹窗组件消费后移除。不持久化） */
  popupQueue: AppNotification[];
  /** 新增通知（置顶，最多保留 50 条；同时进入弹窗队列） */
  add: (n: { type: NotificationType; title: string; body: string }) => void;
  /** 弹窗已展示一条（从队列移除） */
  popPopup: (id: string) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      items: [],
      popupQueue: [],
      add: ({ type, title, body }) => {
        const n: AppNotification = {
          id: shortId("ntf"),
          type,
          title,
          body,
          createdAt: new Date().toISOString(),
          read: false,
        };
        set((s) => ({
          items: [n, ...s.items].slice(0, 50),
          popupQueue: [...s.popupQueue, n],
        }));
      },
      popPopup: (id) =>
        set((s) => ({ popupQueue: s.popupQueue.filter((p) => p.id !== id) })),
      markAllRead: () =>
        set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
      markRead: (id) =>
        set((s) => ({
          items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),
      clearAll: () => set({ items: [] }),
    }),
    {
      name: "fixitai-notifications",
      // 只持久化通知列表本身；弹窗队列是会话内的临时状态
      partialize: (s) => ({ items: s.items }) as NotificationState,
    },
  ),
);

/** 未读数（组件内用 selector 订阅） */
export function unreadCount(items: AppNotification[]): number {
  return items.filter((n) => !n.read).length;
}
