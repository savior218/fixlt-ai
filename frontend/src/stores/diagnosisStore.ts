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
import { getCurrentOwner, itemOwner, LOCAL_OWNER } from "../services/identity";
import { listCloudDiagnoses, saveCloudDiagnosis } from "../services/api";
import { fromApiDiagnosis, toApiDiagnosis } from "../services/recordService";

/** 诊断草稿 + 本地历史 + 当前账号的云端报告 */
interface DiagnosisState {
  /** 当前数据归属（由服务端会话决定；不持久化） */
  ownerKey: string;
  /** 当前草稿所属账号 */
  draftOwner: string;
  draft: DiagnosisDraft;
  /** 本地历史 + 当前账号云端报告（云端记录带 cloud=true，不持久化） */
  history: Diagnosis[];
  cloudLoaded: boolean;
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
  /** 已登录：从服务端拉取当前账号的云端报告 */
  loadCloud: () => Promise<void>;
  /** 已登录：把一条诊断保存到服务端（失败保留内容并标记 failed） */
  saveToCloud: (id: string) => Promise<void>;
  /** 合并服务端返回的记录（保存 / 导入后） */
  mergeCloud: (items: Diagnosis[]) => void;
  /** 标记本机记录已导入（保留原数据，不删除） */
  markImported: (ids: string[]) => void;
  /** 重置草稿（保留历史） */
  resetDraft: () => void;
  /** 清空全部（调试 / 数据清理） */
  clearAll: () => void;
}

function emptyDraft(): DiagnosisDraft {
  return { ...EMPTY_DRAFT, chat: [], qa: [] };
}

/** 云端记录合并：服务端记录优先，去掉同 ID 的本地缓存，避免重复 */
function mergeCloudHistory(
  existing: Diagnosis[],
  items: Diagnosis[],
  ownerKey: string
): Diagnosis[] {
  const cloudItems = items.map((item) => ({
    ...item,
    ownerKey,
    cloud: true,
    saveStatus: "saved" as const,
  }));
  const cloudIds = new Set(cloudItems.map((item) => item.id));
  const localOnly = existing.filter(
    (item) => !item.cloud && !cloudIds.has(item.id)
  );
  return [...cloudItems, ...localOnly];
}

export const useDiagnosisStore = create<DiagnosisState>()(
  persist(
    (set, get) => ({
      ownerKey: getCurrentOwner(),
      draftOwner: getCurrentOwner(),
      draft: emptyDraft(),
      history: [],
      cloudLoaded: false,

      applyOwner: (ownerKey) => {
        if (get().ownerKey === ownerKey) return;
        // 切换账号 / 退出 / 失效：移除上一账号的云端记录，防止短暂串数据
        const history = get().history.filter((item) => !item.cloud);
        // 同一账号刷新时保留草稿；切换到其他账号时重置
        if (get().draftOwner === ownerKey) {
          set({ ownerKey, history, cloudLoaded: false });
        } else {
          set({
            ownerKey,
            draftOwner: ownerKey,
            draft: emptyDraft(),
            history,
            cloudLoaded: false,
          });
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
          photoPreview: msg.photoPreview,
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
          ].slice(0, 200),
        })),

      loadCloud: async () => {
        if (getCurrentOwner() === LOCAL_OWNER) {
          set({ cloudLoaded: true });
          return;
        }
        try {
          const records = await listCloudDiagnoses();
          set((s) => ({
            history: mergeCloudHistory(
              s.history,
              records.map(fromApiDiagnosis),
              getCurrentOwner()
            ),
            cloudLoaded: true,
          }));
        } catch {
          // 拉取失败不阻断页面：保留本地历史，用户可稍后重试保存
          set({ cloudLoaded: true });
        }
      },

      saveToCloud: async (id) => {
        const owner = get().ownerKey;
        if (owner === LOCAL_OWNER) throw new Error("登录后才能保存到云端");
        const item = get().history.find(
          (h) => h.id === id && itemOwner(h.ownerKey) === owner
        );
        if (!item) throw new Error("未找到要保存的诊断");
        if (item.cloud || item.saveStatus === "saved") return;

        set((s) => ({
          history: s.history.map((h) =>
            h.id === id ? { ...h, saveStatus: "saving" } : h
          ),
        }));
        try {
          const record = await saveCloudDiagnosis(toApiDiagnosis(item));
          if (get().ownerKey !== owner) return;
          const mapped: Diagnosis = {
            ...fromApiDiagnosis(record),
            ownerKey: owner,
          };
          set((s) => ({
            history: s.history.map((h) => (h.id === id ? mapped : h)),
          }));
        } catch (e) {
          if (get().ownerKey === owner) {
            set((s) => ({
              history: s.history.map((h) =>
                h.id === id ? { ...h, saveStatus: "failed" } : h
              ),
            }));
          }
          throw e;
        }
      },

      mergeCloud: (items) =>
        set((s) => ({
          history: mergeCloudHistory(s.history, items, getCurrentOwner()),
        })),

      markImported: (ids) =>
        set((s) => ({
          history: s.history.map((h) =>
            ids.includes(h.id) ? { ...h, imported: true } : h
          ),
        })),

      resetDraft: () =>
        set((s) => ({ draftOwner: s.ownerKey, draft: emptyDraft() })),

      clearAll: () =>
        set((s) => ({
          draftOwner: s.ownerKey,
          draft: emptyDraft(),
          history: s.history.filter((h) => h.cloud),
        })),
    }),
    {
      name: "fixitai-diagnosis",
      version: 4,
      // 只持久化本机数据；云端记录每次登录后从服务端重新拉取
      partialize: (state) => ({
        draft: state.draft,
        draftOwner: state.draftOwner,
        history: state.history.filter((item) => !item.cloud),
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

/** 当前账号可见的诊断历史（云端 + 本账号本地；其他账号 / 本机历史不混入） */
export function diagnosesForOwner(
  history: Diagnosis[],
  ownerKey: string
): Diagnosis[] {
  return history.filter((d) => itemOwner(d.ownerKey) === ownerKey);
}

/** 已登录用户仍保留、但未归属当前账号的本机历史数量（已导入的不再计入） */
export function localHistoryCount(
  history: Diagnosis[],
  ownerKey: string
): number {
  if (ownerKey === "local") return 0;
  return history.filter(
    (d) => itemOwner(d.ownerKey) === "local" && !d.imported
  ).length;
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
