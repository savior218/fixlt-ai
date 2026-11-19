/* ============================================================
   设备服务（阶段四）：封装 api.ts CRUD + snake/camelCase 转换
   ============================================================ */

import {
  type Device as ApiDevice,
  type DeviceInput as ApiDeviceInput,
  createDevice,
  deleteDevice,
  listDemoDevices,
  listDevices,
  updateDevice,
} from "./api";
import type { Device, DeviceForm, DeviceStatus, DeviceWithMeta } from "../types/device";
import type { RepairRecord } from "../types/repair";
import { usageYearsLabel } from "../utils/format";

/** api（snake_case）→ 领域模型（camelCase） */
function fromApi(d: ApiDevice): Device {
  return {
    id: d.id,
    name: d.name,
    category: d.category,
    brand: d.brand,
    model: d.model,
    purchaseDate: d.purchase_date,
    location: d.location,
    imageUrl: d.image_url,
    note: d.note,
    createdAt: d.created_at,
    demo: d.demo ?? false,
  };
}

/** 领域模型 → api 输入（snake_case） */
export function toApiInput(form: DeviceForm): ApiDeviceInput {
  return {
    name: form.name.trim(),
    category: form.category,
    brand: form.brand?.trim() || null,
    model: form.model?.trim() || null,
    purchase_date: form.purchaseDate || null,
    location: form.location?.trim() || null,
    image_url: form.imageUrl,
    note: form.note?.trim() || null,
  };
}

export const deviceService = {
  list: async (): Promise<Device[]> => (await listDevices()).map(fromApi),
  listDemo: async (): Promise<Device[]> => (await listDemoDevices()).map(fromApi),
  create: async (form: DeviceForm): Promise<Device> =>
    fromApi(await createDevice(toApiInput(form))),
  update: async (id: number, form: DeviceForm): Promise<Device> =>
    fromApi(await updateDevice(id, toApiInput(form))),
  remove: async (id: number): Promise<void> => {
    await deleteDevice(id);
  },
};

/**
 * 由维修记录推导设备运行状态：
 * 有未恢复记录 → failed；有待验证记录 → pending；否则 normal
 */
function deriveStatus(records: RepairRecord[]): DeviceStatus {
  if (records.some((r) => r.verificationStatus === "notRecovered")) return "failed";
  if (records.some((r) => r.verificationStatus === "unverified")) return "pending";
  return "normal";
}

/** 购买日期 → 整数年（不足 1 年记 0） */
function yearsSince(dateIso: string): number | null {
  const t = new Date(dateIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (365.25 * 24 * 3600 * 1000));
}

/** 组装带派生信息的设备（P6 列表 / P7 详情 / DeviceCard） */
export function withMeta(device: Device, records: RepairRecord[]): DeviceWithMeta {
  const mine = records.filter((r) => r.deviceId === device.id);
  return {
    ...device,
    status: deriveStatus(mine),
    repairCount: mine.length,
    usageYears: device.purchaseDate ? yearsSince(device.purchaseDate) : null,
  };
}

/** 使用年限文案（DeviceCard/P7 展示用） */
export function deviceUsageYears(device: Device): string | null {
  return usageYearsLabel(device.purchaseDate);
}
