import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  ChatMessage,
  Diagnosis,
  DiagnosisDraft,
} from "../types/diagnosis";
import { EMPTY_DRAFT } from "../types/diagnosis";
import { shortId, formatTime } from "../utils/format";

/** 诊断草稿 + 历史（persist：对话与结果刷新不丢失） */
interface DiagnosisState {
  draft: DiagnosisDraft;
  history: Diagnosis[];
  /** 局部更新草稿（浅合并） */
  setDraft: (patch: Partial<DiagnosisDraft>) => void;
  /** 追加一条对话消息，返回消息 ID */
  appendMessage: (
    msg: Omit<ChatMessage, "id" | "time"> & { time?: string }
  ) => string;
  /** 覆盖更新草稿中最后一条 AI 消息（loading → 内容） */
  updateLastAi: (patch: Partial<ChatMessage>) => void;
  /** 保存诊断结果到历史 */
  saveDiagnosis: (diagnosis: Diagnosis) => void;
  /** 重置草稿（保留历史） */
  resetDraft: () => void;
  /** 清空全部（调试 / 数据清理） */
  clearAll: () => void;
}

export const useDiagnosisStore = create<DiagnosisState>()(
  persist(
    (set) => ({
      draft: { ...EMPTY_DRAFT, chat: [], answers: [] },
      history: [],

      setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),

      appendMessage: (msg) => {
        const id = shortId("msg");
        const full: ChatMessage = {
          id,
          time: msg.time ?? formatTime(),
          role: msg.role,
          content: msg.content,
          suggestions: msg.suggestions,
        };
        set((s) => ({ draft: { ...s.draft, chat: [...s.draft.chat, full] } }));
        return id;
      },

      updateLastAi: (patch) =>
        set((s) => {
          const chat = [...s.draft.chat];
          for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i].role === "ai") {
              chat[i] = { ...chat[i], ...patch };
              break;
            }
          }
          return { draft: { ...s.draft, chat } };
        }),

      saveDiagnosis: (diagnosis) =>
        set((s) => ({ history: [diagnosis, ...s.history].slice(0, 100) })),

      resetDraft: () =>
        set({ draft: { ...EMPTY_DRAFT, chat: [], answers: [] } }),

      clearAll: () =>
        set({ draft: { ...EMPTY_DRAFT, chat: [], answers: [] }, history: [] }),
    }),
    { name: "fixitai-diagnosis" }
  )
);

/** 按 ID 查询诊断（含历史与草稿生成的最近结果） */
export function getDiagnosisById(id: string | undefined): Diagnosis | undefined {
  if (!id) return undefined;
  return useDiagnosisStore.getState().history.find((d) => d.id === id);
}
