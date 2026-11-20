import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ApiError } from "../services/api";
import {
  createTicket,
  getTicket,
  listTickets,
  type RepairTicket,
  type TicketInput,
} from "../services/api";
import { useAuthStore } from "./authStore";

/**
 * 报修事项（个人报修跟踪）。
 *
 * 提交结果必须明确区分：未登录 / 会话过期 / 字段错误 / 网络失败 / 服务失败。
 * 提交失败只保留用户表单，不再自动生成“看似已受理”的本地工单。
 * 旧版本遗留的负数 ID 本地工单保存在 legacyDrafts 中，只展示提醒，不并入账号数据。
 */
export type TicketSubmitFailureKind =
  | "unauthenticated"
  | "session_expired"
  | "validation"
  | "network"
  | "server"
  | "unknown";

export interface TicketSubmitFailure {
  ok: false;
  kind: TicketSubmitFailureKind;
  message: string;
  retryable: boolean;
  /** 重试继续使用同一幂等标识 */
  clientRef: string;
}

export type TicketSubmitResult =
  | { ok: true; ticket: RepairTicket }
  | TicketSubmitFailure;

interface TicketState {
  /** 当前账号从服务端读取的报修事项 */
  tickets: RepairTicket[];
  total: number;
  page: number;
  pageSize: number;
  synced: boolean;
  loading: boolean;
  /** 旧版本遗留的负数 ID 本地工单：保留但明确标注，不冒充已提交 */
  legacyDrafts: RepairTicket[];
  load: (page?: number) => Promise<boolean>;
  submit: (input: TicketInput) => Promise<TicketSubmitResult>;
  refresh: (id: number) => Promise<RepairTicket | null>;
  /** 账号切换/退出：清空当前账号的内存与服务端缓存，不影响保留的旧草稿 */
  clearAccountData: () => void;
  /** 清除本机数据：清空账号缓存并丢弃旧版本遗留草稿 */
  clearAll: () => void;
  removeLegacyDraft: (id: number) => void;
}

function classifyError(err: unknown): TicketSubmitFailure {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      const authenticated = useAuthStore.getState().status === "authenticated";
      return {
        ok: false,
        kind: authenticated ? "session_expired" : "unauthenticated",
        message: authenticated
          ? "登录状态已失效，请重新登录；你填写的内容仍保留在表单中"
          : "登录后才能保存报修事项；你填写的内容仍保留在表单中",
        retryable: false,
        clientRef: "",
      };
    }
    if (err.status === 422) {
      const detail = err.detail as { field?: string } | undefined;
      const fieldLabels: Record<string, string> = {
        category: "设备类型",
        symptom: "故障现象",
        description: "故障描述",
        content: "报修说明",
        photo_ids: "照片",
        checks: "检查项",
      };
      const label = detail?.field ? fieldLabels[detail.field] : undefined;
      return {
        ok: false,
        kind: "validation",
        message: label
          ? `${label}需要修改：${err.message}`
          : err.message || "有字段需要修改，请检查后重试",
        retryable: true,
        clientRef: "",
      };
    }
    if (err.code === "network" || err.code === "timeout") {
      return {
        ok: false,
        kind: "network",
        message:
          err.code === "timeout"
            ? "提交结果暂未确认，请点击重试核查；重试不会产生重复事项"
            : "网络连接失败，报修事项未提交成功；请检查网络后重试",
        retryable: true,
        clientRef: "",
      };
    }
    return {
      ok: false,
      kind: "server",
      message: err.message || "服务暂时不可用，报修事项未提交成功，请稍后重试",
      retryable: true,
      clientRef: "",
    };
  }
  return {
    ok: false,
    kind: "unknown",
    message: "报修事项未提交成功，请稍后重试",
    retryable: true,
    clientRef: "",
  };
}

function isLegacyTicket(t: RepairTicket): boolean {
  return t.id < 0;
}

export const useTicketStore = create<TicketState>()(
  persist(
    (set, get) => ({
      tickets: [],
      total: 0,
      page: 1,
      pageSize: 10,
      synced: false,
      loading: false,
      legacyDrafts: [],

      load: async (page = 1) => {
        set({ loading: true });
        try {
          const result = await listTickets(page, get().pageSize);
          set({
            tickets: result.items,
            total: result.total,
            page: result.page,
            synced: true,
            loading: false,
          });
          return true;
        } catch {
          set({ synced: false, loading: false });
          return false;
        }
      },

      submit: async (input) => {
        try {
          const ticket = await createTicket(input);
          // 服务端确认后才写入列表；否则表单与页面状态保持不变
          set((s) => ({
            tickets: [ticket, ...s.tickets],
            total: s.total + 1,
            synced: true,
          }));
          return { ok: true, ticket };
        } catch (err) {
          const failure = classifyError(err);
          return { ...failure, clientRef: input.client_ref };
        }
      },

      refresh: async (id) => {
        try {
          const ticket = await getTicket(id);
          set((s) => ({
            tickets: s.tickets.map((t) => (t.id === id ? ticket : t)),
          }));
          return ticket;
        } catch {
          return null;
        }
      },

      clearAccountData: () => set({ tickets: [], total: 0, page: 1, synced: false, loading: false }),

      clearAll: () =>
        set({
          tickets: [],
          total: 0,
          page: 1,
          synced: false,
          loading: false,
          legacyDrafts: [],
        }),

      removeLegacyDraft: (id) =>
        set((s) => ({
          legacyDrafts: s.legacyDrafts.filter((t) => t.id !== id),
        })),
    }),
    {
      name: "fixitai-tickets",
      // 只持久化旧版本遗留的本地草稿；账号数据不落本机，避免切换账号后看到上一账号事项
      partialize: (state) => ({ legacyDrafts: state.legacyDrafts }),
      // 兼容旧版本持久化的 tickets（负数 ID 为本地降级工单）
      migrate: (persisted) => persisted,
      merge: (persisted, current) => {
        const saved = persisted as
          | { legacyDrafts?: RepairTicket[]; tickets?: RepairTicket[] }
          | undefined;
        const legacy = [
          ...(saved?.legacyDrafts ?? []),
          ...((saved?.tickets ?? []).filter(isLegacyTicket)),
        ];
        return { ...current, legacyDrafts: legacy };
      },
      version: 2,
    }
  )
);
