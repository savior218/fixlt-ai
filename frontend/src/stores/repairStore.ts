import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { RepairRecord, VerificationStatus } from "../types/repair";
import { getCurrentOwner, itemOwner } from "../services/identity";

/** 维修记录（本地数据，persist 刷新保留；按账号隔离） */
interface RepairState {
  ownerKey: string;
  records: RepairRecord[];
  applyOwner: (ownerKey: string) => void;
  addRecord: (record: RepairRecord) => void;
  addMany: (records: RepairRecord[]) => void;
  /** P4 维修结果验证（四选一） */
  updateVerification: (id: string, status: VerificationStatus) => void;
  removeRecord: (id: string) => void;
  clearAll: () => void;
}

export const useRepairStore = create<RepairState>()(
  persist(
    (set) => ({
      ownerKey: getCurrentOwner(),
      records: [],
      applyOwner: (ownerKey) => set({ ownerKey }),
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
      updateVerification: (id, status) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.id === id
              ? {
                  ...r,
                  verificationStatus: status,
                  // 验证结果同步维修状态
                  status:
                    status === "recovered"
                      ? "recovered"
                      : status === "partial"
                        ? "partial"
                        : status === "notRecovered"
                          ? "failed"
                          : r.status,
                }
              : r
          ),
        })),
      removeRecord: (id) =>
        set((s) => ({ records: s.records.filter((r) => r.id !== id) })),
      clearAll: () => set({ records: [] }),
    }),
    {
      name: "fixitai-repairs",
      version: 2,
      partialize: (state) => ({ records: state.records }),
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

/** 未归属当前账号的本机历史维修记录数量 */
export function localRepairCount(
  records: RepairRecord[],
  ownerKey: string
): number {
  if (ownerKey === "local") return 0;
  return records.filter((r) => itemOwner(r.ownerKey) === "local").length;
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
