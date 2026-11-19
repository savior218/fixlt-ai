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
import { getCurrentOwner, itemOwner } from "../services/identity";

/** 诊断草稿 + 历史（persist：对话与结果刷新不丢失；按账号隔离） */
interface DiagnosisState {
  /** 当前数据归属（由服务端会话决定；不持久化） */
  ownerKey: string;
  /** 当前草稿所属账号 */
  draftOwner: string;
  draft: DiagnosisDraft;
  history: Diagnosis[];
  /** 登录 / 退出 / 会话失效时切换归属；切换到其他账号会重置当前草稿 */
  applyOwner: (ownerKey: string) => void;
  /** 局部更新草稿（浅合并） */
  setDraft: (patch: Partial<DiagnosisDraft>) => void;
  /** 追加一条对话消息，返回消息 ID */
  appendMessage: (
    msg: Omit<ChatMessage, "id" | "time"> & { time?: string }
  ) => string;
  /** 覆盖更新草稿中最后一条 AI 消息（loading → 内容） */
  updateLastAi: (patch: Partial<ChatMessage>) => void;
  /** 保存诊断结果到历史（同 ID 不重复写入，并写入当前账号归属） */
  saveDiagnosis: (diagnosis: Diagnosis) => void;
  /** 重置草稿（保留历史） */
  resetDraft: () => void;
  /** 清空全部（调试 / 数据清理） */
  clearAll: () => void;
}

function emptyDraft(): DiagnosisDraft {
  return { ...EMPTY_DRAFT, chat: [], qa: [] };
}

export const useDiagnosisStore = create<DiagnosisState>()(
  persist(
    (set, get) => ({
      ownerKey: getCurrentOwner(),
      draftOwner: getCurrentOwner(),
      draft: emptyDraft(),
      history: [],

      applyOwner: (ownerKey) => {
        if (get().ownerKey === ownerKey) return;
        // 同一账号刷新时保留草稿；切换账号 / 退出 / 失效时重置，防止串数据
        if (get().draftOwner === ownerKey) {
          set({ ownerKey });
        } else {
          set({ ownerKey, draftOwner: ownerKey, draft: emptyDraft() });
        }
      },

      setDraft: (patch) =>
        set((s) => ({
          draftOwner: s.ownerKey,
          draft: { ...s.draft, ...patch },
        })),

      appendMessage: (msg) => {
        const id = shortId("msg");
        const full: ChatMessage = {
          id,
          time: msg.time ?? formatTime(),
          role: msg.role,
          content: msg.content,
          suggestions: msg.suggestions,
        };
        set((s) => ({
          draftOwner: s.ownerKey,
          draft: { ...s.draft, chat: [...s.draft.chat, full] },
        }));
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
          return {
            draftOwner: s.ownerKey,
            draft: { ...s.draft, chat },
          };
        }),

      saveDiagnosis: (diagnosis) =>
        set((s) => ({
          history: [
            { ...diagnosis, ownerKey: s.ownerKey },
            ...s.history.filter((item) => item.id !== diagnosis.id),
          ].slice(0, 100),
        })),

      resetDraft: () =>
        set((s) => ({ draftOwner: s.ownerKey, draft: emptyDraft() })),

      clearAll: () =>
        set((s) => ({
          draftOwner: s.ownerKey,
          draft: emptyDraft(),
          history: [],
        })),
    }),
    {
      name: "fixitai-diagnosis",
      version: 3,
      // 只持久化数据，不持久化“当前登录归属”
      partialize: (state) => ({
        draft: state.draft,
        draftOwner: state.draftOwner,
        history: state.history,
      }),
      /**
       * 旧数据兼容：
       * - 历史记录缺 ownerKey → 归入独立的本机历史，不自动归属新账号
       * - 旧记录缺 source / content / qa → 标为“来源未记录”，保留原有字段
       * - 草稿缺 qa 时，仅在类别与问题顺序明确时迁移旧 answers，不编造问题
       */
      migrate: (persisted) => {
        const raw = (persisted ?? {}) as {
          draft?: unknown;
          draftOwner?: unknown;
          history?: unknown;
        };
        return {
          draft: normalizeDraft(raw.draft),
          draftOwner:
            typeof raw.draftOwner === "string" ? raw.draftOwner : "local",
          history: Array.isArray(raw.history)
            ? raw.history.map(normalizeDiagnosis).filter((d) => d.id)
            : [],
        };
      },
    }
  )
);

/** 当前账号可见的诊断历史（其他账号 / 本机历史不混入） */
export function diagnosesForOwner(
  history: Diagnosis[],
  ownerKey: string
): Diagnosis[] {
  return history.filter((d) => itemOwner(d.ownerKey) === ownerKey);
}

/** 已登录用户仍保留、但未归属当前账号的本机历史数量 */
export function localHistoryCount(
  history: Diagnosis[],
  ownerKey: string
): number {
  if (ownerKey === "local") return 0;
  return history.filter((d) => itemOwner(d.ownerKey) === "local").length;
}

/** 按 ID 查询当前账号的诊断（返回兼容化后的记录） */
export function getDiagnosisById(
  id: string | undefined,
  ownerKey: string = getCurrentOwner()
): Diagnosis | undefined {
  if (!id) return undefined;
  const found = diagnosesForOwner(useDiagnosisStore.getState().history, ownerKey).find(
    (d) => d.id === id
  );
  return found ? normalizeDiagnosis(found) : undefined;
}
