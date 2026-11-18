import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { RepairRecord, VerificationStatus } from "../types/repair";

/** 维修记录（Mock 阶段本地数据，persist 刷新保留） */
interface RepairState {
  records: RepairRecord[];
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
      records: [],
      addRecord: (record) =>
        set((s) => ({ records: [record, ...s.records] })),
      addMany: (records) => set((s) => ({ records: [...records, ...s.records] })),
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
    { name: "fixitai-repairs" }
  )
);

/** 某设备的维修记录（P7 详情 / P8 时间轴，按时间倒序） */
export function recordsOfDevice(
  records: RepairRecord[],
  deviceId: number
): RepairRecord[] {
  return records
    .filter((r) => r.deviceId === deviceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
