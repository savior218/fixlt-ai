import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { RepairRecord, VerificationStatus } from "../types/repair";
import { getCurrentOwner, itemOwner, LOCAL_OWNER } from "../services/identity";
import {
  listCloudRepairs,
  patchCloudRepair,
  saveCloudRepair,
} from "../services/api";
import { fromApiRepair, toApiRepair } from "../services/recordService";

/** 维修状态随验证结果同步（与云端 PATCH 规则一致） */
function statusForVerification(
  status: VerificationStatus,
  current: RepairRecord["status"]
): RepairRecord["status"] {
  if (status === "recovered") return "recovered";
  if (status === "partial") return "partial";
  if (status === "notRecovered") return "failed";
  return current;
}

/** 维修记录（本机历史 + 当前账号云端记录；按账号隔离） */
interface RepairState {
  ownerKey: string;
  records: RepairRecord[];
  cloudLoaded: boolean;
  applyOwner: (ownerKey: string) => void;
  addRecord: (record: RepairRecord) => void;
  addMany: (records: RepairRecord[]) => void;
  /** P4 维修结果验证（四选一）；云端记录会同步到服务端，失败回滚 */
  updateVerification: (id: string, status: VerificationStatus) => Promise<void>;
  /** 保存到服务端；失败保留记录并标记 failed，可重试 */
  saveToCloud: (record: RepairRecord) => Promise<void>;
  /** 重试保存失败（或尚未保存）的记录 */
  retryCloud: (id: string) => Promise<void>;
  loadCloud: () => Promise<void>;
  mergeCloud: (items: RepairRecord[]) => void;
  markImported: (ids: string[]) => void;
  removeRecord: (id: string) => void;
  clearAll: () => void;
}

function mergeRecords(
  existing: RepairRecord[],
  items: RepairRecord[],
  ownerKey: string
): RepairRecord[] {
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

export const useRepairStore = create<RepairState>()(
  persist(
    (set, get) => ({
      ownerKey: getCurrentOwner(),
      records: [],
      cloudLoaded: false,

      applyOwner: (ownerKey) => {
        if (get().ownerKey === ownerKey) return;
        // 切换账号 / 退出：移除上一账号的云端记录
        set({
          ownerKey,
          records: get().records.filter((r) => !r.cloud),
          cloudLoaded: false,
        });
      },

      addRecord: (record) =>
        set((s) => ({
          records: [{ ...record, ownerKey: s.ownerKey }, ...s.records],
        })),

      addMany: (records) =>
        set((s) => ({
          records: [
            ...records.map((r) => ({ ...r, ownerKey: s.ownerKey })),
            ...s.records,
          ],
        })),

      updateVerification: async (id, status) => {
        const owner = get().ownerKey;
        const record = get().records.find((r) => r.id === id);
        if (!record) return;
        const previous = record;

        set((s) => ({
          records: s.records.map((r) =>
            r.id === id
              ? {
                  ...r,
                  verificationStatus: status,
                  status: statusForVerification(status, r.status),
                }
              : r
          ),
        }));

        if (!record.cloud || !record.serverId) return;
        if (owner === LOCAL_OWNER) return;

        try {
          const updated = await patchCloudRepair(record.serverId, {
            verification_status: status,
            status: statusForVerification(status, record.status),
          });
          if (get().ownerKey !== owner) return;
          const mapped: RepairRecord = {
            ...fromApiRepair(updated),
            ownerKey: owner,
          };
          set((s) => ({
            records: s.records.map((r) => (r.id === id ? mapped : r)),
          }));
        } catch (e) {
          // 服务端失败：回滚界面状态，避免显示未真正保存的验证结果
          if (get().ownerKey === owner) {
            set((s) => ({
              records: s.records.map((r) => (r.id === id ? previous : r)),
            }));
          }
          throw e;
        }
      },

      saveToCloud: async (record) => {
        const owner = get().ownerKey;
        if (owner === LOCAL_OWNER) throw new Error("登录后才能保存到云端");

        const pending: RepairRecord = {
          ...record,
          ownerKey: owner,
          saveStatus: "saving",
        };
        set((s) => ({
          records: [
            pending,
            ...s.records.filter((r) => r.id !== record.id),
          ],
        }));

        try {
          const saved = await saveCloudRepair(toApiRepair(record));
          if (get().ownerKey !== owner) return;
          const mapped: RepairRecord = {
            ...fromApiRepair(saved),
            ownerKey: owner,
          };
          set((s) => ({
            records: s.records.map((r) => (r.id === record.id ? mapped : r)),
          }));
        } catch (e) {
          if (get().ownerKey === owner) {
            set((s) => ({
              records: s.records.map((r) =>
                r.id === record.id
                  ? { ...r, saveStatus: "failed" as const }
                  : r
              ),
            }));
          }
          throw e;
        }
      },

      retryCloud: async (id) => {
        const record = get().records.find((r) => r.id === id);
        if (!record) throw new Error("未找到要重试的维修记录");
        // 先在本地去掉旧记录，再按原 ID 重新提交（服务端按 client_ref 去重）
        set((s) => ({
          records: s.records.filter((r) => r.id !== id),
        }));
        await get().saveToCloud({ ...record, saveStatus: "local" });
      },

      loadCloud: async () => {
        if (getCurrentOwner() === LOCAL_OWNER) {
          set({ cloudLoaded: true });
          return;
        }
        try {
          const records = await listCloudRepairs();
          set((s) => ({
            records: mergeRecords(
              s.records,
              records.map(fromApiRepair),
              getCurrentOwner()
            ),
            cloudLoaded: true,
          }));
        } catch {
          set({ cloudLoaded: true });
        }
      },

      mergeCloud: (items) =>
        set((s) => ({
          records: mergeRecords(s.records, items, getCurrentOwner()),
        })),

      markImported: (ids) =>
        set((s) => ({
          records: s.records.map((r) =>
            ids.includes(r.id) ? { ...r, imported: true } : r
          ),
        })),

      removeRecord: (id) =>
        set((s) => ({ records: s.records.filter((r) => r.id !== id) })),

      clearAll: () =>
        set((s) => ({ records: s.records.filter((r) => r.cloud) })),
    }),
    {
      name: "fixitai-repairs",
      version: 3,
      // 只持久化本机数据；云端记录每次登录后重新拉取
      partialize: (state) => ({
        records: state.records.filter((r) => !r.cloud),
      }),
      migrate: (persisted) => {
        const raw = (persisted ?? {}) as { records?: unknown };
        return {
          records: Array.isArray(raw.records)
            ? raw.records
                .filter(
                  (r): r is Record<string, unknown> => !!r && typeof r === "object"
                )
                .map((r) => ({
                  ...r,
                  // 旧记录未记录归属：归入独立的本机历史
                  ownerKey: typeof r.ownerKey === "string" ? r.ownerKey : "local",
                }))
            : [],
        } as { records: RepairRecord[] };
      },
    }
  )
);

/** 当前账号可见的维修记录 */
export function recordsForOwner(
  records: RepairRecord[],
  ownerKey: string
): RepairRecord[] {
  return records.filter((r) => itemOwner(r.ownerKey) === ownerKey);
}

/** 未归属当前账号的本机历史维修记录数量（已导入的不再计入） */
export function localRepairCount(
  records: RepairRecord[],
  ownerKey: string
): number {
  if (ownerKey === "local") return 0;
  return records.filter(
    (r) => itemOwner(r.ownerKey) === "local" && !r.imported
  ).length;
}

/** 某设备的维修记录（P7 详情 / P8 时间轴，按时间倒序） */
export function recordsOfDevice(
  records: RepairRecord[],
  deviceId: number
): RepairRecord[] {
  return records
    .filter((r) => r.deviceId === deviceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
