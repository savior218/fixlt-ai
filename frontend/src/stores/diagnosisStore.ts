import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  ChatMessage,
  Diagnosis,
  DiagnosisDraft,
} from "../types/diagnosis";
import { EMPTY_DRAFT } from "../types/diagnosis";
import { shortId, formatTime } from "../utils/format";
import { normalizeDiagnosis, normalizeDraft } from "../utils/diagnosis";

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
  /** 保存诊断结果到历史（同 ID 不重复写入） */
  saveDiagnosis: (diagnosis: Diagnosis) => void;
  /** 重置草稿（保留历史） */
  resetDraft: () => void;
  /** 清空全部（调试 / 数据清理） */
  clearAll: () => void;
}

export const useDiagnosisStore = create<DiagnosisState>()(
  persist(
    (set) => ({
      draft: { ...EMPTY_DRAFT, chat: [], qa: [] },
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
        set((s) => ({
          history: [
            diagnosis,
            ...s.history.filter((item) => item.id !== diagnosis.id),
          ].slice(0, 100),
        })),

      resetDraft: () =>
        set({ draft: { ...EMPTY_DRAFT, chat: [], qa: [] } }),

      clearAll: () =>
        set({ draft: { ...EMPTY_DRAFT, chat: [], qa: [] }, history: [] }),
    }),
    {
      name: "fixitai-diagnosis",
      version: 2,
      /**
       * 旧数据兼容：
       * - 历史记录缺 source / content / qa → 标为“来源未记录”，保留原有字段
       * - 草稿缺 qa 时，仅在类别与问题顺序明确时迁移旧 answers，不编造问题
       */
      migrate: (persisted) => {
        const raw = (persisted ?? {}) as {
          draft?: unknown;
          history?: unknown;
        };
        return {
          draft: normalizeDraft(raw.draft),
          history: Array.isArray(raw.history)
            ? raw.history.map(normalizeDiagnosis).filter((d) => d.id)
            : [],
        };
      },
    }
  )
);

/** 按 ID 查询诊断（返回兼容化后的记录） */
export function getDiagnosisById(id: string | undefined): Diagnosis | undefined {
  if (!id) return undefined;
  const found = useDiagnosisStore.getState().history.find((d) => d.id === id);
  return found ? normalizeDiagnosis(found) : undefined;
}
