import { create } from "zustand";
import { persist } from "zustand/middleware";

import { computeDue } from "../services/afterSalesService";
import { shortId } from "../utils/format";
import { useNotificationStore } from "./notifications";

/**
 * 保养记录（维修档案 · 保养提醒）。
 * 本机持久化：记录每台设备各保养项目的上次完成时间；
 * 到期后打开应用会收到一次站内提醒（同一到期周期只提醒一次）。
 */
export interface MaintenanceLog {
  id: string;
  deviceId: number;
  deviceName: string;
  category: string;
  location?: string | null;
  /** 保养项目，如「清洗滤网」 */
  item: string;
  /** 记录时的建议间隔（天） */
  intervalDays: number;
  /** 上次保养完成时间（ISO；可补记过去日期） */
  lastDoneAt: string;
  /** 已提醒过的到期时间（去重：同一周期只提醒一次） */
  remindedFor?: string;
}

export interface MaintenanceInput {
  deviceId: number;
  deviceName: string;
  category: string;
  location?: string | null;
  item: string;
  intervalDays: number;
  doneAt: string;
}

interface MaintenanceState {
  logs: MaintenanceLog[];
  /** 记录 / 补记一次保养（同一设备同一项目为覆盖更新） */
  recordMaintenance: (input: MaintenanceInput) => void;
  /** 派发到期提醒：同一到期周期只发一次；返回本次新提醒数量 */
  dispatchDueReminders: (now?: Date) => number;
  removeLog: (id: string) => void;
  clearAll: () => void;
}

export const useMaintenanceStore = create<MaintenanceState>()(
  persist(
    (set, get) => ({
      logs: [],

      recordMaintenance: (input) =>
        set((s) => {
          const existing = s.logs.find(
            (l) => l.deviceId === input.deviceId && l.item === input.item
          );
          const log: MaintenanceLog = {
            id: existing?.id ?? shortId("mnt"),
            deviceId: input.deviceId,
            deviceName: input.deviceName,
            category: input.category,
            location: input.location ?? null,
            item: input.item,
            intervalDays: input.intervalDays,
            lastDoneAt: input.doneAt,
          };
          return {
            logs: [
              log,
              ...s.logs.filter(
                (l) => !(l.deviceId === input.deviceId && l.item === input.item)
              ),
            ],
          };
        }),

      dispatchDueReminders: (now = new Date()) => {
        let dispatched = 0;
        const due: { log: MaintenanceLog; dueAt: string }[] = [];
        for (const log of get().logs) {
          const info = computeDue(log.lastDoneAt, log.intervalDays, now.getTime());
          if (!info.overdue) continue;
          // 去重：同一到期周期（dueAt 相同）只提醒一次
          if (log.remindedFor === info.dueAt) continue;
          due.push({ log, dueAt: info.dueAt });
        }
        if (due.length === 0) return 0;

        const addNotification = useNotificationStore.getState().add;
        for (const { log } of due) {
          addNotification({
            type: "maintenance",
            title: "设备保养提醒",
            body: `「${log.deviceName}${
              log.location ? `（${log.location}）` : ""
            }」已超过 ${intervalDaysText(log.intervalDays)} 未「${log.item}」，建议尽快保养。`,
          });
          dispatched++;
        }
        set((s) => ({
          logs: s.logs.map((l) => {
            const hit = due.find((d) => d.log.id === l.id);
            return hit ? { ...l, remindedFor: hit.dueAt } : l;
          }),
        }));
        return dispatched;
      },

      removeLog: (id) =>
        set((s) => ({ logs: s.logs.filter((l) => l.id !== id) })),

      clearAll: () => set({ logs: [] }),
    }),
    { name: "fixitai-maintenance" }
  )
);

function intervalDaysText(days: number): string {
  if (days % 30 === 0) {
    const months = days / 30;
    return months >= 12 ? `${months / 12} 个月` : `${months} 个月`;
  }
  return `${days} 天`;
}
