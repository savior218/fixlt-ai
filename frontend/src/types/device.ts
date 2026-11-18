import type { DeviceCategory } from "../services/api";
import type { Status } from "../components/StatusBadge";

/** 设备运行状态：正常 / 待关注 / 故障（映射 StatusBadge 的 normal/pending/failed） */
export type DeviceStatus = Extract<Status, "normal" | "pending" | "failed">;

/**
 * 设备实体（camelCase，对齐 api.ts 的 snake_case Device）
 * api 层设备为持久化字段；status/repairCount 等派生信息见 DeviceWithMeta
 */
export interface Device {
  id: number;
  name: string;
  category: DeviceCategory;
  brand: string | null;
  model: string | null;
  purchaseDate: string | null;
  location: string | null;
  imageUrl: string | null;
  note: string | null;
  createdAt: string;
}

/** 设备编辑表单输入 */
export type DeviceForm = Omit<Device, "id" | "createdAt">;

/** 带派生信息的设备（status 由维修记录推导，repairCount 来自 repairStore） */
export interface DeviceWithMeta extends Device {
  status: DeviceStatus;
  repairCount: number;
  usageYears: number | null;
}
