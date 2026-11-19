/* ============================================================
   本机历史导入（阶段十二）：用户主动把游客/旧本机记录导入当前账号
   - 导入前展示数量，导入后可重复执行（服务端按 client_ref 去重）
   - 旧设备无法可靠关联：device_id 置空，仅保留设备名称文本
   - 失败不删除本机数据；成功后也不清空本机历史，只标记已导入
   ============================================================ */

import { importCloudDiagnoses, importCloudRepairs } from "./api";
import { fromApiDiagnosis, fromApiRepair, toApiDiagnosis, toApiRepair } from "./recordService";
import { itemOwner } from "./identity";
import { useDiagnosisStore } from "../stores/diagnosisStore";
import { useRepairStore } from "../stores/repairStore";
import type { Diagnosis } from "../types/diagnosis";
import type { RepairRecord } from "../types/repair";

export interface LocalHistoryCounts {
  diagnoses: number;
  repairs: number;
}

/** 尚未导入的本机历史数量 */
export function countLocalHistory(
  diagnoses: Diagnosis[],
  repairs: RepairRecord[]
): LocalHistoryCounts {
  return {
    diagnoses: diagnoses.filter(
      (d) => itemOwner(d.ownerKey) === "local" && !d.imported
    ).length,
    repairs: repairs.filter(
      (r) => itemOwner(r.ownerKey) === "local" && !r.imported
    ).length,
  };
}

/** 导入本机历史；返回本次实际提交的条数（已导入的不会重复出现） */
export async function importLocalHistory(): Promise<LocalHistoryCounts> {
  const dState = useDiagnosisStore.getState();
  const rState = useRepairStore.getState();
  const localDiagnoses = dState.history.filter(
    (d) => itemOwner(d.ownerKey) === "local" && !d.imported
  );
  const localRepairs = rState.records.filter(
    (r) => itemOwner(r.ownerKey) === "local" && !r.imported
  );

  let importedDiagnoses: Diagnosis[] = [];
  let importedRepairs: RepairRecord[] = [];

  if (localDiagnoses.length > 0) {
    const payloads = localDiagnoses.map((d) =>
      toApiDiagnosis({ ...d, id: `local-${d.id}` })
    );
    // 旧设备的本地数字 ID 在服务端可能对应另一台设备：不强行绑定
    for (const payload of payloads) payload.device_id = null;
    importedDiagnoses = (await importCloudDiagnoses(payloads)).map(
      fromApiDiagnosis
    );
    dState.markImported(localDiagnoses.map((d) => d.id));
    useDiagnosisStore.getState().mergeCloud(importedDiagnoses);
  }

  if (localRepairs.length > 0) {
    const payloads = localRepairs.map((r) => ({
      ...toApiRepair({ ...r, id: `local-${r.id}` }),
      device_id: null,
      diagnosis_ref: r.diagnosisId ? `local-${r.diagnosisId}` : null,
    }));
    importedRepairs = (await importCloudRepairs(payloads)).map(fromApiRepair);
    rState.markImported(localRepairs.map((r) => r.id));
    useRepairStore.getState().mergeCloud(importedRepairs);
  }

  return {
    diagnoses: importedDiagnoses.length,
    repairs: importedRepairs.length,
  };
}
