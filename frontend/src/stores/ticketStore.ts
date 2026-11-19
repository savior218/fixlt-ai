import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  TICKET_STATUS_ORDER,
  createTicket,
  listTickets,
  updateTicketStatus,
  type RepairTicket,
  type TicketInput,
  type TicketStatus,
} from "../services/api";

/**
 * 报修工单状态（模块②）。
 * - 后端可用：listTickets 同步服务端数据（id 为正整数）
 * - 后端不可用（离线/未登录）：降级为本地工单（id 为负数时间戳），刷新保留
 */
interface TicketState {
  tickets: RepairTicket[];
  /** true = 已成功从后端同步过；false = 本地降级模式 */
  synced: boolean;
  /** 拉取后端工单；失败时保留本地数据并返回 false */
  syncFromBackend: () => Promise<boolean>;
  /** 提交工单：优先后端入库，失败降级为本地工单；返回是否已入库后端 */
  submit: (input: TicketInput) => Promise<boolean>;
  /** 推进状态到下一步：优先后端流转，失败降级为本地流转；返回是否后端成功 */
  advance: (id: number) => Promise<boolean>;
  clearAll: () => void;
}

function nextStatus(status: TicketStatus): TicketStatus | null {
  const idx = TICKET_STATUS_ORDER.indexOf(status);
  if (idx < 0 || idx >= TICKET_STATUS_ORDER.length - 1) return null;
  return TICKET_STATUS_ORDER[idx + 1];
}

export const useTicketStore = create<TicketState>()(
  persist(
    (set, get) => ({
      tickets: [],
      synced: false,

      syncFromBackend: async () => {
        try {
          const remote = await listTickets();
          // 服务端数据为准，但保留尚未同步成功的本地降级工单（id < 0）
          const localPending = get().tickets.filter((t) => t.id < 0);
          set({ tickets: [...localPending, ...remote], synced: true });
          return true;
        } catch {
          set({ synced: false });
          return false;
        }
      },

      submit: async (input) => {
        try {
          const ticket = await createTicket(input);
          set((s) => ({ tickets: [ticket, ...s.tickets], synced: true }));
          return true;
        } catch {
          const now = new Date().toISOString();
          const local: RepairTicket = {
            id: -Date.now(),
            device_id: input.device_id ?? null,
            diagnosis_ref: input.diagnosis_ref ?? null,
            category: input.category,
            brand: input.brand ?? null,
            model: input.model ?? null,
            symptom: input.symptom,
            description: input.description ?? null,
            found_at: input.found_at ?? null,
            checks: input.checks ?? [],
            content: input.content,
            status: "pending",
            status_history: [{ status: "pending", at: now }],
            created_at: now,
            updated_at: now,
          };
          set((s) => ({ tickets: [local, ...s.tickets], synced: false }));
          return false;
        }
      },

      advance: async (id) => {
        const current = get().tickets.find((t) => t.id === id);
        if (!current) return false;
        const target = nextStatus(current.status);
        if (!target) return false;
        if (current.id > 0) {
          try {
            const updated = await updateTicketStatus(id, target);
            set((s) => ({
              tickets: s.tickets.map((t) => (t.id === id ? updated : t)),
            }));
            return true;
          } catch {
            return false;
          }
        }
        // 本地降级工单：直接本地流转
        const at = new Date().toISOString();
        set((s) => ({
          tickets: s.tickets.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: target,
                  status_history: [...t.status_history, { status: target, at }],
                  updated_at: at,
                }
              : t
          ),
        }));
        return true;
      },

      clearAll: () => set({ tickets: [], synced: false }),
    }),
    { name: "fixitai-tickets" }
  )
);
